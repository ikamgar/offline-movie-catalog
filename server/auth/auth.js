/**
 * Authentication Module
 *
 * Validates username/password pairs and manages session tokens.
 * This is the ONLY module that knows how authentication works.
 *
 * Current implementation: Simple hardcoded credentials.
 * Future implementation: May use database, LDAP, OAuth, etc.
 *
 * Changing authentication later requires changing ONLY this module.
 * The WebSocket layer and UI remain unchanged.
 */

const crypto = require('crypto');

// Temporary hardcoded credentials (will be replaced later)
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: '123456'
};

// Active sessions: token → { username, role, createdAt }
const activeSessions = new Map();

// Session expiration: 24 hours
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Validate username/password credentials.
 *
 * @param {string} username
 * @param {string} password
 * @returns {boolean} - Whether credentials are valid
 */
function validateCredentials(username, password) {
  return username === ADMIN_CREDENTIALS.username &&
         password === ADMIN_CREDENTIALS.password;
}

/**
 * Create a new session for an authenticated user.
 *
 * @param {string} username
 * @returns {string} - Session token
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
 *
 * @param {string} token
 * @returns {object|null} - Session data or null if invalid/expired
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
 *
 * @param {string} token
 */
function invalidateSession(token) {
  activeSessions.delete(token);
}

/**
 * Get the role for a session token.
 *
 * @param {string} token
 * @returns {string} - 'admin' or 'customer'
 */
function getSessionRole(token) {
  const session = validateSession(token);
  return session ? session.role : 'customer';
}

/**
 * Clean up expired sessions.
 * Should be called periodically.
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
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

module.exports = {
  validateCredentials,
  createSession,
  validateSession,
  invalidateSession,
  getSessionRole
};
