/**
 * Authentication Module
 *
 * Validates username/password pairs and manages session tokens.
 * Credentials stored in data/auth.json as scrypt hashes (D5).
 * ENV ADMIN_USERNAME + ADMIN_PASSWORD override for headless installs.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('../../backend/storage/atomic-json');
const { recordWarning } = require('../../backend/storage/warnings');

// Active sessions: token → { username, role, createdAt }
const activeSessions = new Map();

// Session expiration: 24 hours
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

// Rate limiting: max failures per window
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Rate limit state: `${ip}:${username}` → [{ timestamp }]
const _rateLimitMap = new Map();

// In-memory credentials (loaded from auth.json or ENV)
let _credentials = null; // { username, hash, salt }
let _authFilePath = null;
let _setupComplete = false;

// Callback to close manager sockets for a given token
let _onLogoutCallback = null;

/**
 * Derive a key from password using scrypt (built-in, no deps).
 */
function _deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 64);
}

/**
 * Hash a password with a random salt.
 */
function _hashPassword(password) {
  const saltBytes = crypto.randomBytes(16);
  const hash = _deriveKey(password, saltBytes);
  return { hash: hash.toString('hex'), salt: saltBytes.toString('hex') };
}

/**
 * Compare two hex strings in constant time.
 */
function _constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Load credentials from auth.json or ENV.
 * @param {string} dataDir - The data directory path
 */
function loadCredentials(dataDir) {
  // Reset rate limits when reloading credentials
  _rateLimitMap.clear();
  _authFilePath = path.join(dataDir, 'auth.json');

  // ENV override takes priority
  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass) {
    const { hash, salt } = _hashPassword(envPass);
    _credentials = { username: envUser, hash, salt };
    _setupComplete = true;
    return;
  }

  // Try loading from disk
  if (fs.existsSync(_authFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(_authFilePath, 'utf8'));
      if (data && data.username && data.hash && data.salt) {
        _credentials = { username: data.username, hash: data.hash, salt: data.salt };
        _setupComplete = true;
        return;
      }
    } catch {
      // Corrupt/unusable auth.json — quarantine it and fall through to setup.
      const qPath = path.join(path.dirname(_authFilePath), `auth.corrupt-${Date.now()}.json`);
      try { fs.renameSync(_authFilePath, qPath); } catch { /* best-effort */ }
      recordWarning({ file: _authFilePath, kind: 'corrupt-quarantined', detail: 'unusable auth.json', at: new Date().toISOString() });
      console.warn(`  [AUTH] Quarantined unusable auth.json to ${path.basename(qPath)} — returning to first-run setup`);
    }
  }

  // No credentials yet
  _credentials = null;
  _setupComplete = false;
}

/**
 * Check if admin setup has been completed.
 */
function isSetupComplete() {
  return _setupComplete;
}

/**
 * Validate whether a request is from loopback.
 * Uses the socket address only (never X-Forwarded-For).
 */
function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress;
  if (!addr) return false;
  // Normalize: strip IPv6 prefix
  const normalized = addr.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

/**
 * First-run setup: create admin credentials.
 * Only accepted from loopback and only while no auth.json exists.
 */
function setupAdmin(username, password, req) {
  if (_setupComplete) {
    return { success: false, error: 'مدیر قبلاً تنظیم شده است' };
  }
  if (!isLoopback(req)) {
    return { success: false, error: 'تنظیم فقط از کامپیوتر سرور امکان‌پذیر است' };
  }
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return { success: false, error: 'نام کاربری الزامی است' };
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return { success: false, error: 'رمز عبور باید حداقل ۸ کاراکتر باشد' };
  }

  const cleanUsername = username.trim();
  const { hash, salt } = _hashPassword(password);
  const nextCredentials = { username: cleanUsername, hash, salt };

  // Persist to disk FIRST — only commit to memory if the write succeeds.
  // If the write fails, in-memory credentials are NOT changed and we report
  // PERSIST_FAILED (F39).
  if (_authFilePath) {
    const dir = path.dirname(_authFilePath);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (mkdirErr) {
        recordWarning({ file: _authFilePath, kind: 'persist-failed', detail: mkdirErr.message, at: new Date().toISOString() });
        return { success: false, error: 'ذخیره متادیتا ناموفق بود', code: 'PERSIST_FAILED' };
      }
    }
    try {
      writeJsonAtomic(_authFilePath, {
        username: cleanUsername,
        hash,
        salt,
        createdAt: new Date().toISOString()
      });
    } catch (writeErr) {
      recordWarning({ file: _authFilePath, kind: 'persist-failed', detail: writeErr.message, at: new Date().toISOString() });
      console.error(`  [AUTH] Failed to write auth.json: ${writeErr.message}`);
      return { success: false, error: 'ذخیره متادیتا ناموفق بود', code: 'PERSIST_FAILED' };
    }
  }

  _credentials = nextCredentials;
  _setupComplete = true;

  return { success: true };
}

/**
 * Validate username/password credentials.
 * Returns true if valid, false otherwise. Respects rate limiting.
 */
function validateCredentials(username, password, ip) {
  if (!_credentials) return false;
  if (!username || !password) return false;

  // Rate limit check
  const key = `${ip || 'unknown'}:${username}`;
  const now = Date.now();
  const attempts = _rateLimitMap.get(key) || [];
  // Purge old attempts
  const recent = attempts.filter(t => now - t < FAILURE_WINDOW_MS);
  if (recent.length >= MAX_FAILURES) {
    return false; // Silently reject — don't reveal that rate limit is hit
  }

  const usernameMatch = username === _credentials.username;
  if (!usernameMatch) {
    _recordFailure(key, now);
    return false;
  }

  const derived = _deriveKey(password, Buffer.from(_credentials.salt, 'hex'));
  const hashMatch = _constantTimeCompare(derived.toString('hex'), _credentials.hash);

  if (!hashMatch) {
    _recordFailure(key, now);
    return false;
  }

  // Success — clear rate limit for this key
  _rateLimitMap.delete(key);
  return true;
}

function _recordFailure(key, timestamp) {
  const attempts = _rateLimitMap.get(key) || [];
  attempts.push(timestamp);
  // Keep only recent ones
  const recent = attempts.filter(t => timestamp - t < FAILURE_WINDOW_MS);
  _rateLimitMap.set(key, recent);
}

/**
 * Check if a login attempt is currently rate-limited.
 */
function isRateLimited(username, ip) {
  const key = `${ip || 'unknown'}:${username || ''}`;
  const now = Date.now();
  const attempts = _rateLimitMap.get(key) || [];
  const recent = attempts.filter(t => now - t < FAILURE_WINDOW_MS);
  return recent.length >= MAX_FAILURES;
}

/**
 * Get the Retry-After seconds for a rate-limited request.
 */
function getRetryAfter(username, ip) {
  const key = `${ip || 'unknown'}:${username || ''}`;
  const attempts = _rateLimitMap.get(key) || [];
  const now = Date.now();
  const recent = attempts.filter(t => now - t < FAILURE_WINDOW_MS);
  if (recent.length === 0) return 0;
  const oldest = Math.min(...recent);
  return Math.ceil((FAILURE_WINDOW_MS - (now - oldest)) / 1000);
}

/**
 * Change the admin password.
 */
function changePassword(currentPassword, newPassword, username) {
  if (!_credentials) {
    return { success: false, error: 'مدیر تنظیم نشده است' };
  }
  if (username && username !== _credentials.username) {
    return { success: false, error: 'نام کاربری اشتباه است' };
  }
  if (!currentPassword || !newPassword) {
    return { success: false, error: 'رمز عبور فعلی و جدید الزامی است' };
  }
  if (newPassword.length < 8) {
    return { success: false, error: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد' };
  }

  const derived = _deriveKey(currentPassword, Buffer.from(_credentials.salt, 'hex'));
  if (!_constantTimeCompare(derived.toString('hex'), _credentials.hash)) {
    return { success: false, error: 'رمز عبور فعلی اشتباه است' };
  }

  const { hash, salt } = _hashPassword(newPassword);
  const nextCredentials = { username: _credentials.username, hash, salt };

  // Persist to disk FIRST — only commit to memory if the write succeeds.
  // If the write fails, in-memory credentials are NOT changed and we report
  // PERSIST_FAILED (F39).
  if (_authFilePath) {
    const dir = path.dirname(_authFilePath);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (mkdirErr) {
        recordWarning({ file: _authFilePath, kind: 'persist-failed', detail: mkdirErr.message, at: new Date().toISOString() });
        return { success: false, error: 'ذخیره متادیتا ناموفق بود', code: 'PERSIST_FAILED' };
      }
    }
    try {
      writeJsonAtomic(_authFilePath, {
        username: _credentials.username,
        hash,
        salt,
        createdAt: new Date().toISOString()
      });
    } catch (writeErr) {
      recordWarning({ file: _authFilePath, kind: 'persist-failed', detail: writeErr.message, at: new Date().toISOString() });
      console.error(`  [AUTH] Failed to write auth.json: ${writeErr.message}`);
      return { success: false, error: 'ذخیره متادیتا ناموفق بود', code: 'PERSIST_FAILED' };
    }
  }

  _credentials = nextCredentials;

  return { success: true };
}

/**
 * Create a new session for an authenticated user.
 */
function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    username,
    role: 'admin',
    createdAt: Date.now()
  });
  return token;
}

/**
 * Validate a session token and return the session data.
 */
function validateSession(token) {
  if (!token) return null;

  const session = activeSessions.get(token);
  if (!session) return null;

  // Check expiration
  if (Date.now() - session.createdAt > SESSION_EXPIRY) {
    activeSessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Invalidate a session (logout).
 * Calls the onLogout callback to close manager WebSockets.
 */
function invalidateSession(token) {
  activeSessions.delete(token);
  if (_onLogoutCallback) {
    _onLogoutCallback(token);
  }
}

/**
 * Set a callback to be called when a session is invalidated (for closing WS).
 */
function onLogout(callback) {
  _onLogoutCallback = callback;
}

/**
 * Get the role for a session token.
 */
function getSessionRole(token) {
  const session = validateSession(token);
  return session ? session.role : 'customer';
}

/**
 * Clean up expired sessions.
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of activeSessions) {
    if (now - session.createdAt > SESSION_EXPIRY) {
      activeSessions.delete(token);
    }
  }
}

// Run cleanup every hour
let _cleanupInterval = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

function stopAuthCleanup() {
  if (_cleanupInterval) {
    clearInterval(_cleanupInterval);
    _cleanupInterval = null;
  }
}

module.exports = {
  loadCredentials,
  isSetupComplete,
  isLoopback,
  setupAdmin,
  validateCredentials,
  isRateLimited,
  getRetryAfter,
  changePassword,
  createSession,
  validateSession,
  invalidateSession,
  onLogout,
  getSessionRole,
  stopAuthCleanup
};
