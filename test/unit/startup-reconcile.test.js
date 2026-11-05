'use strict';
/**
 * P8c G6 — the port answers before the library scan finishes.
 *
 * startTestServer accepts a reconcileGate: reconcile() pauses between the
 * async scan and the atomic index swap, so tests can observe the
 * "scanning" window deterministically (serve-from-cache, 503 on mutations,
 * watcher events held and replayed, the final catalog:changed broadcast).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const { startTestServer, loginAsAdmin } = require('../helpers/test-server');
const { WSClient } = require('../helpers/ws-client');

const ADMIN = { username: 'admin', password: 'testadmin123456' };

const TREE = {
  'Movies/Action/0001- First Movie 2001.jpg': null,
  'Movies/Drama/0002- Second Movie 2002.jpg': null
};

/** Per-instance gate: reached() signals scan-done, release() lets the swap run. */
function makeGate() {
  let reachedResolve;
  const reached = new Promise((r) => { reachedResolve = r; });
  let releaseResolve;
  const release = new Promise((r) => { releaseResolve = r; });
  const gate = () => {
    reachedResolve();
    return release;
  };
  return { gate, reached, release: () => releaseResolve() };
}

function httpGet(baseUrl, pathname, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(url, { method: 'GET', headers: headers || {}, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

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
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getMoviesJson(baseUrl) {
  const res = await httpGet(baseUrl, '/api/movies');
  assert.equal(res.status, 200, res.body.toString('utf8').slice(0, 200));
  return JSON.parse(res.body.toString('utf8'));
}

describe('P8c G6 — background reconcile', () => {
  it('cold start answers from an empty cache with meta.scanning=true, then swaps in the scan', async () => {
    const { gate, reached, release } = makeGate();
    const srv = await startTestServer({ tree: TREE, reconcileGate: gate });
    try {
      await reached;
      const during = await getMoviesJson(srv.baseUrl);
      assert.equal(during.meta.scanning, true, 'port answers before reconcile finishes');
      assert.equal(during.movies.length, 0, 'cold start: nothing cached yet');

      release();
      await srv.server.whenReconciled();

      const after = await getMoviesJson(srv.baseUrl);
      assert.equal(after.meta.scanning, false, 'flag clears after the swap');
      assert.equal(after.movies.length, 2, 'scan results swapped in');
    } finally {
      await srv.close();
    }
  });

  it('warm start serves the cached catalog while still scanning', async () => {
    // One full run writes catalog.json; stop without deleting the temp dirs.
    const first = await startTestServer({ tree: TREE });
    const { libraryPath, dataDir } = first;
    await first.server.stop();

    const { gate, reached, release } = makeGate();
    const second = await startTestServer({ dataDir, libraryPath, reconcileGate: gate, admin: ADMIN });
    try {
      await reached;
      const during = await getMoviesJson(second.baseUrl);
      assert.equal(during.meta.scanning, true, 'still reconciling');
      assert.equal(during.movies.length, 2, 'cache served immediately');

      release();
      await second.server.whenReconciled();

      const after = await getMoviesJson(second.baseUrl);
      assert.equal(after.meta.scanning, false);
      assert.equal(after.movies.length, 2);
    } finally {
      await second.close();
    }
  });

  it('rejects catalog mutations with 503 SCAN_IN_PROGRESS until reconcile finishes', async () => {
    const { gate, reached, release } = makeGate();
    const srv = await startTestServer({ tree: TREE, reconcileGate: gate, admin: ADMIN });
    try {
      await reached;
      const token = await loginAsAdmin(srv.baseUrl);
      assert.ok(token, 'admin token');

      const rescan = await httpSend(srv.baseUrl, '/api/rescan', 'POST', token);
      assert.equal(rescan.status, 503);
      const body = JSON.parse(rescan.body.toString('utf8'));
      assert.equal(body.code, 'SCAN_IN_PROGRESS');
      assert.equal(
        body.error,
        'کتابخانه در حال بروزرسانی است — لطفاً چند لحظه بعد دوباره تلاش کنید',
        'owner-set wording (P8c follow-up c5)'
      );

      const create = await httpSend(srv.baseUrl, '/api/movies', 'POST', token, {
        title: 'Too Early', type: 'Movie', poster: 'data:image/jpeg;base64,eA=='
      });
      assert.equal(create.status, 503);

      const edit = await httpSend(srv.baseUrl, '/api/movies/0001', 'PUT', token, { title: 'Nope' });
      assert.equal(edit.status, 503);

      release();
      await srv.server.whenReconciled();

      const rescanAfter = await httpSend(srv.baseUrl, '/api/rescan', 'POST', token);
      assert.equal(rescanAfter.status, 200, 'guard lifts after reconcile');
    } finally {
      await srv.close();
    }
  });

  it('replays watcher events held during the scan (new poster lands in the index)', async () => {
    const { gate, reached, release } = makeGate();
    const srv = await startTestServer({ tree: TREE, reconcileGate: gate });
    try {
      await reached;
      const extra = path.join(srv.libraryPath, 'Movies', 'Action', '0003- Third Movie 2003.jpg');
      fs.writeFileSync(extra, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      // Let the fs.watch event land while reconciles are still held
      await new Promise((r) => setTimeout(r, 250));

      release();
      await srv.server.whenReconciled();

      const after = await getMoviesJson(srv.baseUrl);
      const uids = after.movies.map((m) => m.uid);
      assert.ok(uids.includes('0003'), `held event applied (uids: ${uids.join(',')})`);
    } finally {
      await srv.close();
    }
  });

  it('broadcasts catalog:changed when reconcile finishes (even with zero diffs)', async () => {
    const first = await startTestServer({ tree: TREE });
    const { libraryPath, dataDir } = first;
    await first.server.stop();

    const { gate, reached, release } = makeGate();
    const second = await startTestServer({ dataDir, libraryPath, reconcileGate: gate });
    const client = new WSClient(second.wsUrl);
    try {
      await client.connect('customer');
      await reached;
      const changedPromise = client.waitFor('catalog:changed', 5000);
      release();
      await second.server.whenReconciled();
      const msg = await changedPromise;
      assert.equal(msg.payload.added, 0, 'warm start, no disk changes → all-zero diff');
      assert.equal(msg.payload.updated, 0);
      assert.equal(msg.payload.removed, 0);
    } finally {
      await client.close();
      await second.close();
    }
  });
});

describe('F31 — games reconcile on startup rescan', () => {
  it('startup reconcile replaces a stale games catalog (dropped platform + path)', async () => {
    const tree = {
      'Movies/Action/0001- First Movie 2001.jpg': null,
      'Games/PS4/Dual Game.jpg': null,
      'Games/PS5/Dual Game.jpg': null
    };
    const first = await startTestServer({ tree });
    const { libraryPath, dataDir } = first;
    await first.server.stop();

    // Drop the PS5 copy on disk; the movie cache is stale-but-valid, games start empty.
    fs.unlinkSync(path.join(libraryPath, 'Games', 'PS5', 'Dual Game.jpg'));

    const { gate, reached, release } = makeGate();
    const second = await startTestServer({ dataDir, libraryPath, reconcileGate: gate });
    try {
      await reached;
      const during = await httpGet(second.baseUrl, '/api/games');
      assert.equal(during.status, 200, 'games answered during reconcile');
      const duringBody = JSON.parse(during.body.toString('utf8'));
      assert.equal(duringBody.games.length, 0, 'during reconcile: games served from empty cache');

      release();
      await second.server.whenReconciled();

      const after = await httpGet(second.baseUrl, '/api/games');
      const afterBody = JSON.parse(after.body.toString('utf8'));
      assert.equal(afterBody.games.length, 1, 'after reconcile: game present');
      assert.deepEqual(afterBody.games[0].platforms, ['PS4'], 'PS5 platform dropped');
      // The served poster path must point at a file that still exists.
      const poster = await httpGet(second.baseUrl, afterBody.games[0].poster);
      assert.equal(poster.status, 200, 'repointed poster is servable');
    } finally {
      await second.close();
    }
  });

  it('a request during reconcile never sees a half-applied games catalog', async () => {
    const tree = { 'Games/PS4/Only Game.jpg': null };
    const { gate, reached, release } = makeGate();
    const srv = await startTestServer({ tree, reconcileGate: gate });
    try {
      await reached;
      const during = await httpGet(srv.baseUrl, '/api/games');
      assert.equal(during.status, 200);
      const duringBody = JSON.parse(during.body.toString('utf8'));
      assert.equal(duringBody.games.length, 0, 'during reconcile: coherent empty cache (never partial)');

      release();
      await srv.server.whenReconciled();

      const after = await httpGet(srv.baseUrl, '/api/games');
      const afterBody = JSON.parse(after.body.toString('utf8'));
      assert.equal(afterBody.games.length, 1, 'after reconcile: coherent full catalog');
      assert.equal(afterBody.games[0].title, 'Only Game');
    } finally {
      await srv.close();
    }
  });
});
