'use strict';
/**
 * P8a G3 — logger: 7-file rotation with an injected clock, and the
 * secrets rule: after a FULL login flow (setup/login/failed login/
 * authenticated admin call) the log files must never contain the admin
 * password, a session token or an Authorization header. Everything runs
 * in os.tmpdir(); the real logs/, data/ and Library/ are never touched.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const logger = require('../../server/logger');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

const tmpDirs = [];
function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

after(() => {
  logger.disable();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

function listLogs(logDir) {
  return fs.readdirSync(logDir).filter((n) => /^app-\d{8}\.log$/.test(n)).sort();
}

describe('P8a G3 - log rotation (injected clock)', () => {
  it('keeps exactly 7 files across 10 days, newest retained', () => {
    const logDir = tmpDir('p8a-logs-rot-');
    let day = new Date(Date.UTC(2026, 9, 1, 12, 0, 0)); // 2026-10-01
    logger.init({
      dir: logDir,
      now: () => day
    });
    for (let i = 0; i < 10; i++) {
      logger.info(`entry-day-${i + 1}`);
      day = new Date(day.getTime() + 24 * 3600 * 1000);
    }
    const files = listLogs(logDir);
    assert.equal(files.length, 7, `exactly 7 files kept: ${files.join(',')}`);
    assert.equal(files[0], 'app-20261004.log', 'oldest kept is day 4');
    assert.equal(files[6], 'app-20261010.log', 'newest kept is day 10');
    const newest = fs.readFileSync(path.join(logDir, files[6]), 'utf8');
    assert.ok(newest.includes('entry-day-10'));
    const oldest = fs.readFileSync(path.join(logDir, files[0]), 'utf8');
    assert.ok(oldest.includes('entry-day-4'));
    assert.ok(!fs.existsSync(path.join(logDir, 'app-20261003.log')), 'day 3 pruned');
    logger.disable();
  });

  it('init prunes stale files down to 7 immediately', () => {
    const logDir = tmpDir('p8a-logs-prune-');
    for (let d = 1; d <= 12; d++) {
      fs.writeFileSync(path.join(logDir, `app-202609${String(d).padStart(2, '0')}.log`), 'stale\n');
    }
    logger.init({ dir: logDir, now: () => new Date(Date.UTC(2026, 9, 15)) });
    assert.equal(listLogs(logDir).length, 7);
    logger.disable();
  });

  it('disabled logger writes nothing', () => {
    const logDir = tmpDir('p8a-logs-off-');
    logger.disable();
    logger.info('should not appear');
    assert.equal(fs.readdirSync(logDir).length, 0);
    assert.equal(logger.currentFile(), null);
  });
});

describe('P8a G3 - secrets never reach the log (full login flow)', () => {
  const PASSWORD = 'S3cret-Log-Probe-99!';
  let logDir;
  let server;

  before(async () => {
    logDir = tmpDir('p8a-logs-sec-');
    logger.init({ dir: logDir, now: () => new Date(Date.UTC(2026, 9, 13, 9, 30, 0)) });
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: PASSWORD }
    });
  });

  after(async () => {
    logger.disable();
    if (server) await server.close();
  });

  function rawRequest(urlPath, options) {
    const data = options && options.body ? JSON.stringify(options.body) : null;
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, server.baseUrl);
      const req = http.request(url, {
        method: (options && options.method) || 'GET',
        headers: Object.assign(
          data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
          (options && options.headers) || {}
        )
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it('full flow leaves no password, token or Authorization material in any log file', async () => {
    // 1. successful login
    const token = await loginAsAdmin(server.baseUrl, 'admin', PASSWORD);
    assert.ok(token && token.length > 10, 'login returned a token');
    // 2. authenticated admin request carrying the Bearer header
    const diag = await rawRequest('/api/diagnostics', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(diag.status, 200, 'authenticated call succeeded');
    // 3. a failed login (password in the body — must not be logged)
    const failed = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'WrongPassword-NotLogged' }
    });
    assert.equal(failed.status, 401);
    // give the finish handlers a tick to flush
    await new Promise((r) => setTimeout(r, 50));

    const files = listLogs(logDir);
    assert.ok(files.length >= 1, 'log file(s) exist');
    const all = files.map((f) => fs.readFileSync(path.join(logDir, f), 'utf8')).join('\n');

    // prove the logger actually captured the flow (test is not vacuous)
    assert.ok(all.includes('POST /api/auth/login'), 'login requests logged');
    assert.ok(all.includes('GET /api/diagnostics'), 'admin request logged');

    // and the secrets are absent
    assert.ok(!all.includes(PASSWORD), 'admin password absent');
    assert.ok(!all.includes('WrongPassword-NotLogged'), 'failed-login password absent');
    assert.ok(!all.includes(token), 'session token absent');
    assert.ok(!all.includes('Bearer'), 'no Bearer material');
    assert.ok(!/authorization/i.test(all), 'no Authorization header name/value');
  });
});
