'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { createServer } = require('../../server');
const { isRestrictedPort } = require('./safe-port');

/**
 * Pre-create auth.json in dataDir so admin routes are usable immediately.
 * (Same scrypt format the server's auth module reads.)
 */
function writeAdminAuth(dataDir, username, password) {
  const crypto = require('crypto');
  const saltBytes = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, saltBytes, 64).toString('hex');
  const salt = saltBytes.toString('hex');
  fs.writeFileSync(path.join(dataDir, 'auth.json'), JSON.stringify({
    username,
    hash,
    salt,
    createdAt: new Date().toISOString()
  }, null, 2));
}

async function startTestServer(options) {
  const opts = options || {};
  const tree = opts.tree || {};
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'test-data-'));
  let libraryPath = opts.libraryPath;

  if (!libraryPath && tree) {
    libraryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lib-'));
    for (const [relPath, value] of Object.entries(tree)) {
      const full = path.join(libraryPath, relPath);
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (typeof value === 'string' || Buffer.isBuffer(value)) {
        fs.writeFileSync(full, value);
      } else {
        fs.writeFileSync(full, Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
          0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
        ]));
      }
    }
  }

  // If admin options provided, pre-create auth.json in dataDir
  if (opts.admin) {
    writeAdminAuth(dataDir, opts.admin.username, opts.admin.password);
  }

  // Chromium refuses restricted ports (ERR_UNSAFE_PORT) — re-roll ephemeral
  // port 0 until the harness lands on a browser-safe one.
  let server = null;
  let port = 0;
  for (let attempt = 0; attempt < 25; attempt++) {
    server = createServer({
      port: 0,
      libraryPath,
      dataDir,
      // quiet unless the test explicitly wants console output (e.g. to
      // assert on a warn line — see reconcile-failure.test.js).
      quiet: opts.quiet !== false,
      thumbWarmUp: !!opts.thumbWarmUp,
      reconcileGate: opts.reconcileGate,
      wsOptions: opts.wsOptions
    });
    await server.start();
    // P8c G6: the port answers before the background reconcile finishes.
    // Tests that need a settled index await it; gate tests release it themselves.
    if (!opts.reconcileGate) await server.whenReconciled();
    port = server.httpServer.address().port;
    if (!isRestrictedPort(port)) break;
    await server.stop();
    server = null;
  }
  if (!server) throw new Error('startTestServer: no browser-safe port after 25 attempts');
  const baseUrl = `http://localhost:${port}`;
  const wsUrl = `ws://localhost:${port}`;

  return {
    baseUrl,
    wsUrl,
    libraryPath,
    dataDir,
    server,
    close: async () => {
      await server.stop();
      // Clean up temp dirs
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
      if (libraryPath && libraryPath.startsWith(os.tmpdir())) {
        try { fs.rmSync(libraryPath, { recursive: true, force: true }); } catch {}
      }
    }
  };
}

/**
 * Login as admin and return the session token.
 * @param {string} baseUrl - The server base URL
 * @param {string} [username] - Username (default: 'admin')
 * @param {string} [password] - Password (default: 'testadmin123456')
 * @returns {Promise<string>} The session token
 */
async function loginAsAdmin(baseUrl, username, password) {
  const user = username || 'admin';
  const pass = password || 'testadmin123456';
  const data = JSON.stringify({ username: user, password: pass });
  return new Promise((resolve, reject) => {
    const url = new URL('/api/auth/login', baseUrl);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw).token); } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { startTestServer, loginAsAdmin, writeAdminAuth };
