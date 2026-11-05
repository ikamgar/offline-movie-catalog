'use strict';

const { describe, it, after, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  loadCredentials, isLoopback, setupAdmin,
  validateCredentials, isRateLimited, getRetryAfter, changePassword,
  createSession, validateSession, invalidateSession, getSessionRole, stopAuthCleanup
} = require('../../server/auth/auth');

// Clean up the module-level setInterval to prevent test runner hanging
after(() => { stopAuthCleanup(); });

describe('Auth (characterization)', () => {
  describe('validateCredentials', () => {
    before(() => {
      // Set up test credentials in a temp dir
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      // Create auth.json with known credentials
      const crypto = require('crypto');
      const saltBytes = crypto.randomBytes(16);
      const hash = crypto.scryptSync('testadmin123456', saltBytes, 64).toString('hex');
      fs.writeFileSync(path.join(dataDir, 'auth.json'), JSON.stringify({
        username: 'admin',
        hash,
        salt: saltBytes.toString('hex'),
        createdAt: new Date().toISOString()
      }));
      loadCredentials(dataDir);
    });

    it('returns true for valid admin credentials', () => {
      assert.equal(validateCredentials('admin', 'testadmin123456', '127.0.0.1'), true);
    });

    it('returns false for wrong password', () => {
      assert.equal(validateCredentials('admin', 'wrong', '127.0.0.1'), false);
    });

    it('returns false for wrong username', () => {
      assert.equal(validateCredentials('wrong', 'testadmin123456', '127.0.0.1'), false);
    });

    it('returns false for empty credentials', () => {
      assert.equal(validateCredentials('', '', '127.0.0.1'), false);
    });
  });

  describe('rate limiting', () => {
    before(() => {
      // Fresh credentials for rate limit tests
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-rate-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const crypto = require('crypto');
      const saltBytes = crypto.randomBytes(16);
      const hash = crypto.scryptSync('strongpass1', saltBytes, 64).toString('hex');
      fs.writeFileSync(path.join(dataDir, 'auth.json'), JSON.stringify({
        username: 'admin',
        hash,
        salt: saltBytes.toString('hex'),
        createdAt: new Date().toISOString()
      }));
      loadCredentials(dataDir);
    });

    it('6th wrong attempt within 5 minutes returns rate-limited', () => {
      const ip = '192.168.1.100';
      for (let i = 0; i < 5; i++) {
        validateCredentials('admin', 'wrongpass', ip);
      }
      assert.equal(isRateLimited('admin', ip), true);
      assert.ok(getRetryAfter('admin', ip) > 0);
    });
  });

  describe('createSession', () => {
    it('returns a token string', () => {
      const token = createSession('admin');
      assert.equal(typeof token, 'string');
      assert.ok(token.length > 0);
    });

    it('returns unique tokens for different calls', () => {
      const t1 = createSession('admin');
      const t2 = createSession('admin');
      assert.notEqual(t1, t2);
    });
  });

  describe('validateSession', () => {
    it('returns session data for valid token', () => {
      const token = createSession('admin');
      const session = validateSession(token);
      assert.ok(session);
      assert.equal(session.username, 'admin');
      assert.equal(session.role, 'admin');
    });

    it('returns null for invalid token', () => {
      const session = validateSession('nonexistent-token');
      assert.equal(session, null);
    });

    it('returns null for null/undefined token', () => {
      assert.equal(validateSession(null), null);
      assert.equal(validateSession(undefined), null);
    });
  });

  describe('invalidateSession', () => {
    it('invalidates a valid session', () => {
      const token = createSession('admin');
      assert.ok(validateSession(token), 'session exists before invalidation');
      invalidateSession(token);
      assert.equal(validateSession(token), null, 'session gone after invalidation');
    });
  });

  describe('getSessionRole', () => {
    it('returns admin for valid admin session', () => {
      const token = createSession('admin');
      const role = getSessionRole(token);
      assert.equal(role, 'admin');
    });

    it('returns customer for invalid token', () => {
      const role = getSessionRole('bad-token');
      assert.equal(role, 'customer');
    });
  });

  describe('isLoopback', () => {
    function mockReq(remoteAddress) {
      return { socket: { remoteAddress } };
    }
    it('accepts 127.0.0.1', () => {
      assert.equal(isLoopback(mockReq('127.0.0.1')), true);
    });
    it('accepts ::1', () => {
      assert.equal(isLoopback(mockReq('::1')), true);
    });
    it('accepts ::ffff:127.0.0.1', () => {
      assert.equal(isLoopback(mockReq('::ffff:127.0.0.1')), true);
    });
    it('rejects LAN address 192.168.1.10', () => {
      assert.equal(isLoopback(mockReq('192.168.1.10')), false);
    });
    it('rejects 10.0.0.1', () => {
      assert.equal(isLoopback(mockReq('10.0.0.1')), false);
    });
    it('rejects null/undefined', () => {
      assert.equal(isLoopback(mockReq(null)), false);
      assert.equal(isLoopback({ socket: {} }), false);
    });
  });

  describe('setupAdmin', () => {
    it('rejects when not from loopback', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-setup-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      loadCredentials(dataDir); // no auth.json → not setup

      const req = { socket: { remoteAddress: '192.168.1.10' } };
      const result = setupAdmin('admin', 'longpassword', req);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('سرور'));
    });

    it('rejects short password', () => {
      const req = { socket: { remoteAddress: '127.0.0.1' } };
      const result = setupAdmin('admin', 'short', req);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('۸'));
    });
  });

  describe('changePassword', () => {
    before(() => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-chpw-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const crypto = require('crypto');
      const saltBytes = crypto.randomBytes(16);
      const hash = crypto.scryptSync('oldpass123', saltBytes, 64).toString('hex');
      fs.writeFileSync(path.join(dataDir, 'auth.json'), JSON.stringify({
        username: 'admin',
        hash,
        salt: saltBytes.toString('hex'),
        createdAt: new Date().toISOString()
      }));
      loadCredentials(dataDir);
    });

    it('rejects wrong current password', () => {
      const result = changePassword('wrong', 'newpass123', 'admin');
      assert.equal(result.success, false);
    });

    it('accepts correct password change', () => {
      const result = changePassword('oldpass123', 'newpass1234', 'admin');
      assert.equal(result.success, true);
      // Verify new password works
      assert.equal(validateCredentials('admin', 'newpass1234', '127.0.0.1'), true);
      assert.equal(validateCredentials('admin', 'oldpass123', '127.0.0.1'), false);
    });
  });

  describe('F39/F40 auth hardening (quarantine and PERSIST_FAILED)', () => {
    it('quarantines corrupt auth.json and returns to first-run setup', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-corrupt-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const authFile = path.join(dataDir, 'auth.json');
      fs.writeFileSync(authFile, '{ corrupt-json: true ');

      loadCredentials(dataDir);
      assert.equal(require('../../server/auth/auth').isSetupComplete(), false, 'must return to setup mode');

      // Check quarantine file was created
      const files = fs.readdirSync(dataDir);
      const quarantined = files.find(f => f.startsWith('auth.corrupt-'));
      assert.ok(quarantined, 'auth.corrupt-<timestamp>.json must be created');
      assert.equal(fs.readFileSync(path.join(dataDir, quarantined), 'utf8'), '{ corrupt-json: true ');
    });

    it('setupAdmin returns PERSIST_FAILED when writing auth.json fails', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-persist-fail-'));
      // Create a directory where the file would be to force write failure
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      loadCredentials(dataDir); // sets _setupComplete = false

      // Make auth.json a directory to cause write failure
      fs.mkdirSync(path.join(dataDir, 'auth.json'));

      const req = { socket: { remoteAddress: '127.0.0.1' } };
      const res = setupAdmin('admin', 'validpassword123', req);
      assert.equal(res.success, false);
      assert.equal(res.code, 'PERSIST_FAILED');
      assert.equal(require('../../server/auth/auth').isSetupComplete(), false);
    });

    it('changePassword returns PERSIST_FAILED when writing auth.json fails', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-chpw-fail-'));
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const crypto = require('crypto');
      const saltBytes = crypto.randomBytes(16);
      const hash = crypto.scryptSync('initpass123', saltBytes, 64).toString('hex');
      const authFile = path.join(dataDir, 'auth.json');
      fs.writeFileSync(authFile, JSON.stringify({
        username: 'admin',
        hash,
        salt: saltBytes.toString('hex')
      }));
      loadCredentials(dataDir);

      // Lock auth.json by replacing it with a directory
      fs.unlinkSync(authFile);
      fs.mkdirSync(authFile);

      const res = changePassword('initpass123', 'newvalidpassword123', 'admin');
      assert.equal(res.success, false);
      assert.equal(res.code, 'PERSIST_FAILED');
      // Memory credentials must NOT have changed
      assert.equal(validateCredentials('admin', 'initpass123', '127.0.0.1'), true);
      assert.equal(validateCredentials('admin', 'newvalidpassword123', '127.0.0.1'), false);
    });
  });
});
