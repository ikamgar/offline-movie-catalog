'use strict';
/**
 * P8c follow-up — a failing startup reconcile must degrade gracefully:
 * the cached catalog keeps serving, meta.scanning settles to false, the
 * 503 SCAN_IN_PROGRESS gate lifts, and whenReconciled() resolves.
 *
 * Two failure modes:
 *  1. the reconcile throws (gate rejection / unexpected error) — caught by
 *     reconcileLibrary's catch, index untouched;
 *  2. the library root becomes unreadable before the swap — the scanner
 *     logs-and-returns-EMPTY (walkDir never throws), which without the
 *     pre-swap readdir check would swap a perfectly good catalog to empty.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

const ADMIN = { username: 'admin', password: 'testadmin123456' };

const TREE = {
  'Movies/Action/0001- First Movie 2001.jpg': null,
  'Movies/Drama/0002- Second Movie 2002.jpg': null
};

function httpSend(baseUrl, pathname, method, token, payload) {
  const data = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getMoviesJson(baseUrl) {
  const res = await httpSend(baseUrl, '/api/movies', 'GET', null, null);
  assert.equal(res.status, 200, res.body.slice(0, 200));
  return JSON.parse(res.body);
}

/**
 * Run a full reconcile once so dataDir holds a real catalog.json cache,
 * then stop WITHOUT close() (keeps the temp dirs). Callers must clean up
 * first.libraryPath themselves when the second server uses a different one.
 */
async function seedCache() {
  const first = await startTestServer({ tree: TREE });
  await first.server.whenReconciled();
  await first.server.stop();
  return first;
}

describe('P8c follow-up — failing reconcile keeps the cached catalog', () => {
  it('a reconcile that throws keeps the cache, settles scanning and lifts the 503', async () => {
    const first = await seedCache();
    const { dataDir } = first;
    // A different, EMPTY library: if the (failed) reconcile had swapped, the
    // served count would drop to 0 — the cached 2 prove the index survived.
    const emptyLib = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-lib-'));
    try {
      const srv = await startTestServer({
        dataDir,
        libraryPath: emptyLib,
        reconcileGate: () => { throw new Error('forced reconcile failure'); },
        admin: ADMIN
      });
      try {
        await srv.server.whenReconciled();

        const body = await getMoviesJson(srv.baseUrl);
        assert.equal(body.meta.scanning, false, 'scanning settles even after a failure');
        assert.equal(body.movies.length, 2, 'cached catalog kept serving');

        // The 503 gate must be lifted: an admin mutation reaches the handler
        // (unknown id → 404, not SCAN_IN_PROGRESS).
        const token = await loginAsAdmin(srv.baseUrl, ADMIN.username, ADMIN.password);
        const put = await httpSend(srv.baseUrl, '/api/movies/9999', 'PUT', token, { title: 'x' });
        assert.notEqual(put.status, 503, `mutation gate lifted, got ${put.status}`);
      } finally {
        await srv.close();
      }
    } finally {
      fs.rmSync(first.libraryPath, { recursive: true, force: true });
    }
  });

  it('an unreadable library root before the swap does not wipe the cache', async () => {
    const first = await seedCache();
    const { dataDir } = first;
    // Point the second run's libraryPath at a FILE: existsSync passes at
    // startup, but the scan walks nothing and the pre-swap readdir fails
    // (ENOTDIR) — without the check the empty scan would replace the cache.
    const bogus = path.join(os.tmpdir(), `not-a-dir-${process.pid}-${Date.now()}`);
    fs.writeFileSync(bogus, 'x');

    const warns = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = (...a) => warns.push(a.join(' '));
    console.log = () => { /* swallow startup noise; test asserts via return */ };
    try {
      const srv = await startTestServer({ dataDir, libraryPath: bogus, quiet: false });
      try {
        await srv.server.whenReconciled();

        const body = await getMoviesJson(srv.baseUrl);
        assert.equal(body.meta.scanning, false, 'scanning settles');
        assert.equal(body.movies.length, 2, 'cached catalog survived the unreadable root');
        assert.ok(
          warns.some((w) => w.includes('keeping cached catalog')),
          `expected a plain-words failure warn, got: ${warns.join(' | ')}`
        );
      } finally {
        await srv.close();
      }
    } finally {
      console.warn = origWarn;
      console.log = origLog;
      fs.rmSync(first.libraryPath, { recursive: true, force: true });
      fs.rmSync(bogus, { force: true });
    }
  });

  it('F15 — fresh-clone boot with missing library root does not claim keeping cached catalog', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f15-data-'));
    const nonExistentLib = path.join(os.tmpdir(), `nonexistent-lib-${process.pid}-${Date.now()}`);

    const warns = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = (...a) => warns.push(a.join(' '));
    console.log = () => {};
    try {
      const srv = await startTestServer({ dataDir, libraryPath: nonExistentLib, quiet: false });
      try {
        await srv.server.whenReconciled();
        assert.ok(
          warns.some((w) => w.includes('Background reconcile failed')),
          'expected reconcile failure warning'
        );
        assert.ok(
          warns.some((w) => w.includes('library root unreadable before swap')),
          'expected library root unreadable error'
        );
        assert.ok(
          !warns.some((w) => w.includes('keeping cached catalog')),
          `warning must not claim keeping cached catalog when none existed, got: ${warns.join(' | ')}`
        );
      } finally {
        await srv.close();
      }
    } finally {
      console.warn = origWarn;
      console.log = origLog;
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
