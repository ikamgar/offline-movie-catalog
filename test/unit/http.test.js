'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');
const pkg = require('../../package.json');
const { publicConfig } = require('../../backend/constants');

function fetch(baseUrl, path, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options && options.method || 'GET',
      headers: options && options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, body });
      });
    });
    req.on('error', reject);
    if (options && options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

describe('HTTP API (characterization)', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0002- Inception 2010.jpg': true,
        'Animation/00001-Cars.jpg': true,
        'Series/Breaking Bad.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  describe('GET /api/movies', () => {
    it('returns correct shape', async () => {
      const res = await fetch(server.baseUrl, '/api/movies');
      assert.equal(res.status, 200);
      assert.ok(res.json.meta);
      assert.equal(res.json.meta.version, pkg.version);
      assert.ok(Array.isArray(res.json.movies));
      assert.ok(res.json.meta.totalMovies > 0);
    });

    it('returns all indexed movies', async () => {
      const res = await fetch(server.baseUrl, '/api/movies');
      assert.ok(res.json.movies.length >= 4);
    });
  });

  describe('GET /api/stats', () => {
    it('returns stats with genres, types, decades', async () => {
      const res = await fetch(server.baseUrl, '/api/stats');
      assert.equal(res.status, 200);
      assert.ok(res.json.totalMovies > 0);
      assert.ok(res.json.genres);
      assert.ok(res.json.types);
      assert.ok(res.json.decades);
    });
  });

  describe('GET /api/config', () => {
    it('serves the shared front-end config with version from package.json', async () => {
      const res = await fetch(server.baseUrl, '/api/config');
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, publicConfig(pkg.version));
      assert.equal(res.json.version, pkg.version);
      assert.equal(res.json.protocol, 3);
      assert.ok(Array.isArray(res.json.mediaTypes) && res.json.mediaTypes.includes('Series'));
      assert.equal(res.json.typeLabels.Movie, 'فیلم');
      assert.equal(res.json.badgeLabels.dubbed, 'دوبله فارسی');
      assert.deepEqual(res.json.pinnedGenres, ['دوبله فارسی', 'اکشن', 'عاشقانه']);
    });
  });

  describe('GET /api/poster/:id', () => {
    it('returns 200 for existing poster', async () => {
      const res = await fetch(server.baseUrl, '/api/poster/0001');
      assert.equal(res.status, 200);
    });

    it('returns 404 for non-existing poster', async () => {
      const res = await fetch(server.baseUrl, '/api/poster/9999');
      assert.equal(res.status, 404);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns token for valid credentials', async () => {
      const res = await fetch(server.baseUrl, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'testadmin123456' })
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(res.json.token);
    });

    it('returns 401 for invalid credentials', async () => {
      const res = await fetch(server.baseUrl, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' })
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.success, false);
    });
  });

  describe('POST /api/auth/logout (F30)', () => {
    it('header-only logout invalidates the session — next request with that token is 401', async () => {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      assert.ok(token, 'login returned a token');

      // Logout using only the Authorization header (no body token)
      const logoutRes = await fetch(server.baseUrl, '/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(logoutRes.status, 200, `header-only logout must succeed: ${logoutRes.body}`);

      // Next request with the same token must be 401
      const after = await fetch(server.baseUrl, '/api/movies/next-id?type=Movie', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(after.status, 401, 'token must be invalidated after header-only logout');
    });

    it('body-token logout still works', async () => {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      assert.ok(token, 'login returned a token');

      const logoutRes = await fetch(server.baseUrl, '/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      assert.equal(logoutRes.status, 200, `body-token logout must succeed: ${logoutRes.body}`);

      const after = await fetch(server.baseUrl, '/api/movies/next-id?type=Movie', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(after.status, 401, 'token must be invalidated after body-token logout');
    });
  });

  describe('GET /api/movies/next-id', () => {
    it('returns next ID for Movie type (with token)', async () => {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await fetch(server.baseUrl, '/api/movies/next-id?type=Movie', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(res.json.nextId);
    });

    it('returns 400 for invalid type', async () => {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await fetch(server.baseUrl, '/api/movies/next-id?type=Invalid', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(res.status, 400);
    });

    it('returns null nextId for Series type', async () => {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await fetch(server.baseUrl, '/api/movies/next-id?type=Series', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.nextId, null);
    });

    it('next IDs are exact and zero-padded per type (survivors F14/F15)', async () => {
      // Tree: Movies 0001+0002, Animation 00001, Series no id → global max = 2.
      // F14 kills "drop the padStart": '3' → must be '0003'/'00003'.
      // F15 kills "maxId + 2": '0004'/'00004' → must be max+1.
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const headers = { 'Authorization': `Bearer ${token}` };
      const movie = await fetch(server.baseUrl, '/api/movies/next-id?type=Movie', { headers });
      assert.equal(movie.json.nextId, '0003', `Movie: ${movie.body}`);
      const anim = await fetch(server.baseUrl, '/api/movies/next-id?type=Animation', { headers });
      assert.equal(anim.json.nextId, '00003', `Animation (5-wide): ${anim.body}`);
      const iranian = await fetch(server.baseUrl, '/api/movies/next-id?type=Iranian', { headers });
      assert.equal(iranian.json.nextId, '0003', `Iranian: ${iranian.body}`);
    });
  });

  describe('GET /api/games', () => {
    it('returns games array', async () => {
      const res = await fetch(server.baseUrl, '/api/games');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.json.games));
    });
  });

  describe('PUT /api/movies/by-uid/:uid (B7)', () => {
    async function authHeaders() {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
    }

    it('requires admin auth', async () => {
      const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x' })
      });
      assert.equal(res.status, 401);
    });

    it('updates a Movie by bare uid and renames the file', async () => {
      const headers = await authHeaders();
      const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: 'Heat Renamed', year: 1995 })
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(res.json.movie.title, 'Heat Renamed');
      assert.equal(res.json.movie.absolutePosterPath, undefined, 'must not leak absolutePosterPath');
      const fs = require('fs');
      const path = require('path');
      const files = fs.readdirSync(path.join(server.libraryPath, 'Movies', 'Action'));
      assert.ok(files.some(f => f.includes('Heat Renamed')), `renamed on disk: ${files}`);
    });

    it('updates a Series by URL-encoded uid', async () => {
      const headers = await authHeaders();
      const uid = encodeURIComponent('series:breaking bad');
      const res = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: 'Breaking Bad Edited' })
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(res.json.movie.title, 'Breaking Bad Edited');
      assert.equal(res.json.movie.type, 'Series');
      const fs = require('fs');
      const path = require('path');
      const files = fs.readdirSync(path.join(server.libraryPath, 'Series'));
      assert.ok(files.includes('Breaking Bad Edited.jpg'), `series file: ${files}`);
    });

    it('legacy PUT /api/movies/:id still works as a delegating alias', async () => {
      const headers = await authHeaders();
      const res = await fetch(server.baseUrl, '/api/movies/0002', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: 'Inception Updated', year: 2010 })
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(res.json.movie.title, 'Inception Updated');
    });
  });
});

// ─── A5: request handlers must not block on catalog.json write ───────────────

describe('A5 non-blocking catalog persistence', () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function startWithAuth() {
    const s = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    const token = await loginAsAdmin(s.baseUrl, 'admin', 'testadmin123456');
    return { s, token };
  }

  it('PUT /api/movies/:id does not call saveToDisk synchronously (debounced via scheduleSave)', async () => {
    const { s, token } = await startWithAuth();
    try {
      const idx = s.server.indexer;
      let saveCalls = 0;
      const orig = idx.saveToDisk.bind(idx);
      idx.saveToDisk = function (...args) {
        saveCalls += 1;
        return orig(...args);
      };

      const t0 = Date.now();
      const res = await fetch(s.baseUrl, '/api/movies/0001', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Heat Renamed', id: '0001', year: 1995 })
      });
      const elapsed = Date.now() - t0;

      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(saveCalls, 0, 'saveToDisk must not run inside the PUT request');
      // Debounce window is 500 ms trailing — response must beat it comfortably
      assert.ok(elapsed < 500, `PUT returned in ${elapsed}ms; must not wait for the debounced write`);

      // Debounced write still happens after the response
      await sleep(700);
      assert.ok(saveCalls >= 1, `expected debounced saveToDisk after response, got ${saveCalls}`);
    } finally {
      await s.close();
    }
  });

  it('POST /api/rescan does not call saveToDisk synchronously', async () => {
    const { s, token } = await startWithAuth();
    try {
      const idx = s.server.indexer;
      let saveCalls = 0;
      const orig = idx.saveToDisk.bind(idx);
      idx.saveToDisk = function (...args) {
        saveCalls += 1;
        return orig(...args);
      };

      const t0 = Date.now();
      const res = await fetch(s.baseUrl, '/api/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const elapsed = Date.now() - t0;

      assert.equal(res.status, 200);
      assert.equal(saveCalls, 0, 'saveToDisk must not run inside the rescan request');
      assert.ok(elapsed < 500, `rescan returned in ${elapsed}ms; catalog write must be debounced`);

      await sleep(700);
      assert.ok(saveCalls >= 1, `expected debounced saveToDisk after rescan, got ${saveCalls}`);
    } finally {
      await s.close();
    }
  });

  it('stop() flushes a pending scheduleSave before exit (A6)', async () => {
    const { s, token } = await startWithAuth();
    try {
      const idx = s.server.indexer;
      let saveCalls = 0;
      const orig = idx.saveToDisk.bind(idx);
      idx.saveToDisk = function (...args) {
        saveCalls += 1;
        return orig(...args);
      };

      // Queue a debounced write via PUT, then shut down before the timer fires
      await fetch(s.baseUrl, '/api/movies/0001', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Pending Write', id: '0001', year: 1995 })
      });
      assert.equal(saveCalls, 0, 'precondition: write still pending (debounced)');

      await s.server.stop();
      assert.ok(saveCalls >= 1, 'stop() must flush the pending catalog write');
    } finally {
      try { await s.close(); } catch { /* already stopped */ }
    }
  });
});

// ─── B10: async rescan (movies + games in one call) ─────────────────────────
describe('B10 rescan', () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function startWithAuth(tree) {
    const s = await startTestServer({
      tree: tree || {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Games/PS4/FIFA 24.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    const token = await loginAsAdmin(s.baseUrl, 'admin', 'testadmin123456');
    return { s, token };
  }

  it('POST /api/rescan rescans movies and games, returns counts + invalid', async () => {
    const { s, token } = await startWithAuth();
    try {
      const res = await fetch(s.baseUrl, '/api/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(typeof res.json.count, 'number');
      assert.ok(res.json.count >= 1, `movies counted: ${res.json.count}`);
      assert.equal(typeof res.json.gamesCount, 'number');
      assert.ok(res.json.gamesCount >= 1, `games counted: ${res.json.gamesCount}`);
      assert.equal(typeof res.json.invalid, 'number');
      assert.ok(res.json.scanStats, 'scanStats present');
      assert.ok(res.json.gameStats, 'gameStats present');
      assert.ok(Array.isArray(res.json.invalidFiles), 'invalidFiles is an array');
    } finally {
      await s.close();
    }
  });

  it('POST /api/rescan picks up an invalid filename into invalid count', async () => {
    const { s, token } = await startWithAuth({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Movies/Action/not-a-movie.txt.jpg': true,
    });
    try {
      const res = await fetch(s.baseUrl, '/api/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      assert.equal(res.status, 200);
      assert.ok(res.json.invalid >= 1, `expected invalid >= 1, got ${res.json.invalid}`);
      assert.ok(res.json.invalidFiles.some(x => String(x.file).includes('not-a-movie')),
        `invalidFiles includes bad name: ${JSON.stringify(res.json.invalidFiles)}`);
    } finally {
      await s.close();
    }
  });

  it('POST /api/rescan does not stall the event loop > 200ms per tick (AC8 lag probe)', async () => {
    const { s, token } = await startWithAuth();
    try {
      let maxLag = 0;
      let last = Date.now();
      let running = true;
      const probe = () => {
        if (!running) return;
        const now = Date.now();
        const lag = now - last - 0; // interval target ~0 via setImmediate chain
        // measure gap between successive setImmediate turns while scan runs
        if (lag > maxLag) maxLag = lag;
        last = now;
        setImmediate(probe);
      };
      setImmediate(probe);

      const res = await fetch(s.baseUrl, '/api/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      running = false;
      await sleep(50);

      assert.equal(res.status, 200);
      // Small fixture should never approach 200ms stall; generous margin for CI noise
      assert.ok(maxLag < 200, `max event-loop lag ${maxLag}ms must be < 200ms`);
    } finally {
      await s.close();
    }
  });
});


// ─── BUG-2: diagnostics cache must invalidate after movie edit (P3i) ────────

describe('BUG-2 diagnostics freshness after edit', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  it('GET /api/diagnostics immediately after title edit reflects post-edit state (no 30s TTL)', async () => {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Warm the 30s report cache
    const d1 = await fetch(server.baseUrl, '/api/diagnostics', { headers });
    assert.equal(d1.status, 200);
    assert.ok(d1.json.timestamp, 'first report has timestamp');

    // Edit title (and clear year so the movie lands in missingYears — an
    // observable title-bearing field that rebuilds from the live index map)
    const put = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ title: 'Heat Renamed', year: null })
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    assert.equal(put.json.success, true);
    assert.equal(put.json.movie.title, 'Heat Renamed');

    // Immediate re-request — well within the 30s TTL
    const d2 = await fetch(server.baseUrl, '/api/diagnostics', { headers });
    assert.equal(d2.status, 200);
    assert.notEqual(d1.json.timestamp, d2.json.timestamp,
      'diagnostics timestamp must change after edit (cache was not invalidated)');
    const entry = (d2.json.issues.missingYears || []).find(m => m.id === '0001');
    assert.ok(entry,
      `missingYears must include 0001 after year:null edit: ${JSON.stringify(d2.json.issues.missingYears)}`);
    assert.equal(entry.title, 'Heat Renamed',
      'missingYears title must reflect the post-edit title');
    assert.equal(entry.year, null);
  });
});

// ─── P6a E1 — PUT by-uid: poster replace + genres (server wiring) ──────────

const fsE1 = require('fs');
const pathE1 = require('path');

describe('P6a E1 PUT by-uid poster + genres', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0001- Heat 1995.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  async function authHeaders() {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  it('requires admin auth for poster PUT (401)', async () => {
    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poster: 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64') })
    });
    assert.equal(res.status, 401);
  });

  it('rejects a disguised non-image poster with IMG_UNSUPPORTED; file untouched', async () => {
    const headers = await authHeaders();
    const evil = 'data:image/jpeg;base64,' +
      Buffer.from('<html><body>evil</body></html>').toString('base64');
    const actionFile = pathE1.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg');
    const before = fsE1.readFileSync(actionFile);

    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT', headers, body: JSON.stringify({ poster: evil })
    });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'IMG_UNSUPPORTED',
      `structured code expected: ${JSON.stringify(res.json)}`);
    assert.ok(/فرمت تصویر/.test((res.json && res.json.error) || ''),
      `Persian message expected: ${JSON.stringify(res.json)}`);
    assert.ok(fsE1.readFileSync(actionFile).equals(before), 'file must be untouched');
  });

  it('replaces poster bytes on disk for a valid payload (single PUT, Q1)', async () => {
    const headers = await authHeaders();
    const newJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('http-level-replaced-poster')
    ]);
    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT', headers,
      body: JSON.stringify({ poster: 'data:image/jpeg;base64,' + newJpeg.toString('base64') })
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    for (const genre of ['Action', 'Drama']) {
      const dir = pathE1.join(server.libraryPath, 'Movies', genre);
      const files = fsE1.readdirSync(dir);
      assert.deepEqual(files, ['0001- Heat 1995.jpg'], `${genre}: ${files}`);
      assert.ok(fsE1.readFileSync(pathE1.join(dir, '0001- Heat 1995.jpg')).equals(newJpeg),
        `${genre}: bytes replaced`);
    }
  });

  it('allows a >100KB poster PUT body (guard exemption for by-uid)', async () => {
    const headers = await authHeaders();
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(160 * 1024, 0x41)
    ]);
    const body = JSON.stringify({ poster: 'data:image/jpeg;base64,' + big.toString('base64') });
    assert.ok(body.length > 100 * 1024,
      `body must exceed 100KB to prove the exemption: ${body.length}`);
    // Set Content-Length explicitly — the 100KB guard is CL-based, and a bare
    // req.write() would go out chunked and never trip it.
    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      body
    });
    assert.equal(res.status, 200,
      `guard must not 413 by-uid poster PUT: ${JSON.stringify(res.json)}`);
    const file = pathE1.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg');
    assert.equal(fsE1.statSync(file).size, big.length, 'replaced file size matches payload');
  });

  it('applies genres patch: adds folder copy, removes de-selected copy', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT', headers, body: JSON.stringify({ genres: ['Action', 'Comedy'] })
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.deepEqual([...res.json.movie.genres].sort(), ['Action', 'Comedy']);
    assert.ok(fsE1.existsSync(
      pathE1.join(server.libraryPath, 'Movies', 'Comedy', '0001- Heat 1995.jpg')),
      'Comedy copy created');
    assert.ok(!fsE1.existsSync(
      pathE1.join(server.libraryPath, 'Movies', 'Drama', '0001- Heat 1995.jpg')),
      'Drama copy removed');
    assert.ok(fsE1.existsSync(
      pathE1.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg')),
      'Action copy kept');
  });

  it('rejects empty genres with 400 GENRE_REQUIRED (structured code in body)', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT', headers, body: JSON.stringify({ genres: [] })
    });
    assert.equal(res.status, 400);
    assert.equal(res.json && res.json.code, 'GENRE_REQUIRED',
      `structured code expected: ${JSON.stringify(res.json)}`);
    assert.ok(fsE1.existsSync(
      pathE1.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg')),
      'files untouched');
  });
});

// ─── P6b E3 — soft delete / restore / trash list (server wiring) ───────────

const fsE3 = require('fs');
const pathE3 = require('path');

describe('P6b E3 delete + restore API', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0001- Heat 1995.jpg': true,
        'Series/Breaking Bad.jpg': true,
        'Games/PS4/FIFA 24.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  async function authHeaders() {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  const trashManifest = () =>
    JSON.parse(fsE3.readFileSync(pathE3.join(server.libraryPath, '.trash', 'manifest.json'), 'utf8'));

  it('all three endpoints require admin auth (401)', async () => {
    const del = await fetch(server.baseUrl, '/api/movies/by-uid/0001', { method: 'DELETE' });
    assert.equal(del.status, 401, 'DELETE');
    const list = await fetch(server.baseUrl, '/api/trash');
    assert.equal(list.status, 401, 'GET /api/trash');
    const restore = await fetch(server.baseUrl, '/api/trash/1/restore', { method: 'POST' });
    assert.equal(restore.status, 401, 'POST restore');
  });

  it('DELETE: every copy moves into .trash/<id>/, manifest entry written, movie gone from catalog', async () => {
    const headers = await authHeaders();
    // Manager-entered metadata first — must survive the round-trip (acceptance 3)
    const put = await fetch(server.baseUrl, '/api/movies/by-uid/0001', {
      method: 'PUT', headers,
      body: JSON.stringify({ imdbRating: 8.7, plotSummary: 'A takedown plot' })
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));

    const del = await fetch(server.baseUrl, '/api/movies/by-uid/0001', { method: 'DELETE', headers });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    assert.equal(del.json.success, true);
    assert.match(String(del.json.id), /^\d+$/);
    assert.equal(del.json.moved, 2, 'both genre copies moved');

    const list = await fetch(server.baseUrl, '/api/movies');
    assert.ok(!list.json.movies.some(m => m.uid === '0001'), 'movie gone from GET /api/movies');

    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg')),
      'Action copy gone from its genre folder');
    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Movies', 'Drama', '0001- Heat 1995.jpg')),
      'Drama copy gone from its genre folder');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', String(del.json.id), 'Movies', 'Action', '0001- Heat 1995.jpg')),
      'Action copy under .trash/<id>/Movies/Action/');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', String(del.json.id), 'Movies', 'Drama', '0001- Heat 1995.jpg')),
      'Drama copy under .trash/<id>/Movies/Drama/');

    const entry = trashManifest().entries.find(e => e.id === String(del.json.id));
    assert.ok(entry, `manifest entry must exist: ${JSON.stringify(trashManifest())}`);
    assert.equal(entry.uid, '0001');
    assert.equal(entry.title, 'Heat');
    assert.equal(entry.originalPaths.length, 2);
    assert.equal(entry.deletedBy, 'admin', 'deletedBy = logged-in session user');
    assert.ok(entry.deletedAt, 'deletedAt recorded');
  });

  it('GET /api/trash: newest-first with the full entry shape', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/trash', { headers });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    assert.ok(res.json.entries.length >= 1, 'the entry from the previous test is listed');

    const e = res.json.entries[0];
    for (const k of ['id', 'uid', 'title', 'type', 'originalPaths', 'deletedBy', 'deletedAt']) {
      assert.ok(k in e, `entry exposes ${k}: ${JSON.stringify(e)}`);
    }
    const ids = res.json.entries.map(x => Number(x.id));
    assert.deepEqual([...ids].sort((a, b) => b - a), ids, 'newest-first');
  });

  it('restore: movie returns with imdbRating/plotSummary intact, files back, entry leaves the trash (acceptance 3)', async () => {
    const headers = await authHeaders();
    const before = await fetch(server.baseUrl, '/api/trash', { headers });
    const entry = before.json.entries.find(e => e.uid === '0001');
    assert.ok(entry, 'precondition: deleted entry listed');

    const res = await fetch(server.baseUrl, `/api/trash/${entry.id}/restore`, { method: 'POST', headers });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);

    const list = await fetch(server.baseUrl, '/api/movies');
    const m = list.json.movies.find(x => x.uid === '0001');
    assert.ok(m, 'movie back in GET /api/movies');
    assert.equal(m.imdbRating, 8.7, 'imdbRating survives delete → restore');
    assert.equal(m.plotSummary, 'A takedown plot', 'plotSummary survives delete → restore');

    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg')),
      'Action copy back at its original path');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, 'Movies', 'Drama', '0001- Heat 1995.jpg')),
      'Drama copy back at its original path');

    const after = await fetch(server.baseUrl, '/api/trash', { headers });
    assert.ok(!after.json.entries.some(e2 => e2.id === entry.id), 'entry removed after restore');
  });

  it('restore into an occupied destination → 409 RESTORE_CONFLICT, nothing moved, no partial restore', async () => {
    const headers = await authHeaders();
    const del = await fetch(server.baseUrl, '/api/movies/by-uid/0001', { method: 'DELETE', headers });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    const id = String(del.json.id);

    const occupant = pathE3.join(server.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg');
    fsE3.mkdirSync(pathE3.dirname(occupant), { recursive: true });
    fsE3.writeFileSync(occupant, Buffer.from('occupant'));

    const res = await fetch(server.baseUrl, `/api/trash/${id}/restore`, { method: 'POST', headers });
    assert.equal(res.status, 409, JSON.stringify(res.json));
    assert.equal(res.json.code, 'RESTORE_CONFLICT', `structured code expected: ${JSON.stringify(res.json)}`);

    assert.ok(fsE3.readFileSync(occupant).equals(Buffer.from('occupant')), 'occupant untouched');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', id, 'Movies', 'Drama', '0001- Heat 1995.jpg')),
      'Drama copy still in the trash — restore must be all-or-nothing');
    const trash = await fetch(server.baseUrl, '/api/trash', { headers });
    assert.ok(trash.json.entries.some(e => e.id === id), 'entry intact after 409');
    const list = await fetch(server.baseUrl, '/api/movies');
    assert.ok(!list.json.movies.some(m => m.uid === '0001'), 'movie still deleted');
  });

  it('error codes: unknown uid 404, game uid deletes like a movie (E4), bad restore id 400, unknown restore 404', async () => {
    const headers = await authHeaders();

    const unk = await fetch(server.baseUrl, '/api/movies/by-uid/9999', { method: 'DELETE', headers });
    assert.equal(unk.status, 404);
    assert.equal(unk.json && unk.json.code, 'NOT_FOUND', JSON.stringify(unk.json));

    const game = await fetch(server.baseUrl,
      `/api/movies/by-uid/${encodeURIComponent('game:fifa 24')}`, { method: 'DELETE', headers });
    assert.equal(game.status, 200, JSON.stringify(game.json));
    assert.equal(game.json && game.json.success, true);
    assert.equal(game.json && game.json.moved, 1, 'PS4 copy moved');
    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Games', 'PS4', 'FIFA 24.jpg')),
      'game poster moved out of Games/PS4 into the trash');

    const badId = await fetch(server.baseUrl, '/api/trash/abc/restore', { method: 'POST', headers });
    assert.equal(badId.status, 400);
    assert.equal(badId.json && badId.json.code, 'VALIDATION', JSON.stringify(badId.json));

    const missing = await fetch(server.baseUrl, '/api/trash/424242/restore', { method: 'POST', headers });
    assert.equal(missing.status, 404);
    assert.equal(missing.json && missing.json.code, 'TRASH_NOT_FOUND', JSON.stringify(missing.json));
  });

  it('Series round-trip: delete by series uid then restore', async () => {
    const headers = await authHeaders();
    const uid = encodeURIComponent('series:breaking bad');

    const del = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, { method: 'DELETE', headers });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    assert.equal(del.json.uid, 'series:breaking bad');
    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Series', 'Breaking Bad.jpg')));

    const res = await fetch(server.baseUrl, `/api/trash/${del.json.id}/restore`, { method: 'POST', headers });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, 'Series', 'Breaking Bad.jpg')), 'file back');

    const list = await fetch(server.baseUrl, '/api/movies');
    assert.ok(list.json.movies.some(m => m.uid === 'series:breaking bad'), 'series back with same uid');
  });
});

describe('P6b E3 trash list: newest-first, capped at 20, log permanent', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  it('GET /api/trash returns the 20 newest entries newest-first; older log entries stay on disk', async () => {
    const trashDir = pathE3.join(server.libraryPath, '.trash');
    fsE3.mkdirSync(trashDir, { recursive: true });
    const entries = [];
    for (let i = 1000; i < 1022; i++) {
      entries.push({
        id: String(i), uid: String(i), title: `T${i}`, type: 'Movie',
        originalPaths: ['Movies/Action/x.jpg'], deletedBy: 'admin',
        deletedAt: new Date(Date.UTC(2026, 0, 1, i - 1000)).toISOString()
      });
    }
    entries.reverse(); // manifest is stored newest-first
    fsE3.writeFileSync(pathE3.join(trashDir, 'manifest.json'),
      JSON.stringify({ version: 1, entries }, null, 2));

    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    const res = await fetch(server.baseUrl, '/api/trash', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const ids = res.json.entries.map(e => Number(e.id));
    assert.equal(ids.length, 20, `capped at 20: ${ids.length}`);
    assert.equal(ids[0], 1021, 'newest first');
    assert.equal(ids[19], 1002, '20th entry is 1002');

    const mf = JSON.parse(fsE3.readFileSync(pathE3.join(trashDir, 'manifest.json'), 'utf8'));
    assert.equal(mf.entries.length, 22, 'log entries are never dropped from the manifest');
  });
});

// ─── P6c E2 — preview endpoint, creator error codes, new genre folder ──────

describe('P6c E2 add flow API', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0002- Inception 2010.jpg': true,
        'Series/Breaking Bad.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  async function authHeaders() {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  function createBody(extra) {
    return JSON.stringify({
      poster: 'data:image/jpeg;base64,' +
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
          0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]).toString('base64'),
      ...extra
    });
  }

  it('POST /api/movies/preview requires admin (401 without token)', async () => {
    const res = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Movie', id: '0042', title: 'The Matrix', year: 1999 })
    });
    assert.equal(res.status, 401, `preview must be admin-only: ${JSON.stringify(res.json)}`);
    assert.equal(res.json && res.json.error, 'UNAUTHORIZED');
  });

  it('POST /api/movies requires admin (401 without token)', async () => {
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: createBody({ title: 'No Token', type: 'Movie', year: 2020, genres: ['Action'] })
    });
    assert.equal(res.status, 401, JSON.stringify(res.json));
  });

  it('preview returns the exact I4 filename for every type (shared builder, ARCH-03)', async () => {
    const headers = await authHeaders();

    const movie = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'Movie', id: '0042', title: 'The Matrix', year: 1999, extension: 'jpg' })
    });
    assert.equal(movie.status, 200, JSON.stringify(movie.json));
    assert.equal(movie.json.filename, '0042- The Matrix 1999.jpg');

    const series = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'Series', title: 'Breaking Bad', extension: 'jpg' })
    });
    assert.equal(series.status, 200, JSON.stringify(series.json));
    assert.equal(series.json.filename, 'Breaking Bad.jpg');

    const game = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'Game', title: 'Ghost Rider', extension: 'jpg' })
    });
    assert.equal(game.status, 200, JSON.stringify(game.json));
    assert.equal(game.json.filename, 'Ghost Rider.jpg');
  });

  it('preview filename === server-written filename for the same inputs (no third copy)', async () => {
    const headers = await authHeaders();
    const inputs = { type: 'Movie', id: '0077', title: 'Preview Parity', year: 2001, extension: 'jpg' };

    const preview = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST', headers, body: JSON.stringify(inputs)
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.json));

    const created = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: createBody({ type: 'Movie', id: '0077', title: 'Preview Parity', year: 2001, genres: ['Action'] })
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));

    const files = fsE3.readdirSync(pathE3.join(server.libraryPath, 'Movies', 'Action'));
    const written = files.find(f => f.startsWith('0077-'));
    assert.ok(written, `created file must exist, folder holds: ${files.join(', ')}`);
    assert.equal(written, preview.json.filename,
      `preview must predict the exact server-written name: preview=${preview.json.filename} written=${written}`);
  });

  it('preview rejects an unsafe title with 400 TITLE_INVALID (traversal, I10)', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/movies/preview', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'Movie', id: '0042', title: '..', year: 1999 })
    });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'TITLE_INVALID',
      `structured code expected: ${JSON.stringify(res.json)}`);
    assert.ok(/عنوان/.test((res.json && res.json.error) || ''), 'Persian message expected');
  });

  it('create: missing title → 400 TITLE_REQUIRED with a Persian message', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: createBody({ type: 'Movie', year: 2020, genres: ['Action'] })
    });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'TITLE_REQUIRED',
      `structured code expected: ${JSON.stringify(res.json)}`);
    assert.ok(/عنوان/.test((res.json && res.json.error) || ''), 'Persian message expected');
  });

  it('create: taken id → 409 ID_TAKEN (conflict must NOT surface as a generic 400)', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: createBody({ type: 'Movie', id: '0001', title: 'Conflicting Heat', year: 2022, genres: ['Action'] })
    });
    assert.equal(res.status, 409, `conflict must map to 409: ${JSON.stringify(res.json)}`);
    assert.equal(res.json && res.json.code, 'ID_TAKEN', JSON.stringify(res.json));
  });

  it('create: unsafe genre → 400 GENRE_INVALID, nothing written outside its folder', async () => {
    const headers = await authHeaders();
    const before = await fetch(server.baseUrl, '/api/movies');
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: createBody({ type: 'Movie', id: '0088', title: 'Traversal Probe', year: 2023, genres: ['../Evil'] })
    });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'GENRE_INVALID',
      `structured code expected: ${JSON.stringify(res.json)}`);
    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Evil')), 'no folder escaped Library/');
    const after = await fetch(server.baseUrl, '/api/movies');
    assert.equal(after.json.movies.length, before.json.movies.length, 'catalog unchanged');
  });

  it('create: a new genre name becomes a real folder and the movie lands in it', async () => {
    const headers = await authHeaders();
    const genre = 'ژانر-تست-پ۶سی';
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: createBody({ type: 'Movie', id: '0091', title: 'Genre Probe', year: 2024, genres: [genre] })
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const genreDir = pathE3.join(server.libraryPath, 'Movies', genre);
    assert.ok(fsE3.existsSync(genreDir), `genre folder must exist on disk: ${genreDir}`);
    const files = fsE3.readdirSync(genreDir);
    assert.equal(files.length, 1, `one poster in the new genre folder: ${files.join(', ')}`);
    assert.match(files[0], /^0091- Genre Probe 2024\.(jpg|jpeg|png|webp|avif)$/);

    const list = await fetch(server.baseUrl, '/api/movies');
    const m = list.json.movies.find(x => x.uid === '0091');
    assert.ok(m, 'movie listed in GET /api/movies');
    assert.deepEqual(m.genres, [genre], 'movie carries the new genre');
  });

  it('create: decoded poster beyond 8 MB → 413 IMG_TOO_LARGE', async () => {
    const headers = await authHeaders();
    const big = 'data:image/jpeg;base64,' + Buffer.alloc(8.5 * 1024 * 1024, 0x41).toString('base64');
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST', headers,
      body: JSON.stringify({ title: 'Huge Poster', type: 'Movie', year: 2020, genres: ['Action'], poster: big })
    });
    assert.equal(res.status, 413, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'IMG_TOO_LARGE', JSON.stringify(res.json));
  });

  it('create: JSON body beyond the express limit → 413 JSON IMG_TOO_LARGE (not an HTML error page)', async () => {
    const headers = await authHeaders();
    const body = JSON.stringify({ title: 'X', poster: 'A'.repeat(12.5 * 1024 * 1024) });
    const res = await fetch(server.baseUrl, '/api/movies', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      body
    });
    assert.equal(res.status, 413, `status: ${res.status}`);
    assert.ok(res.json, `body must be JSON so the client can map the cause: ${String(res.body).slice(0, 120)}`);
    assert.equal(res.json.code, 'IMG_TOO_LARGE', JSON.stringify(res.json));
    assert.ok(/بزرگ|مگابایت/.test(res.json.error || ''), `Persian message expected: ${JSON.stringify(res.json)}`);
  });
});

// ─── P6c E4 — games management: create / edit / delete / restore ───────────

describe('P6c E4 games management', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Games/PS4/FIFA 24.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  async function authHeaders() {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  const jpegDataUrl = (extra) =>
    'data:image/jpeg;base64,' +
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, ...(extra || [])]).toString('base64');

  const gameFile = (plat, name) => pathE3.join(server.libraryPath, 'Games', plat, name);
  const gamesList = async () => (await fetch(server.baseUrl, '/api/games')).json.games;
  const postGame = async (body, headers) =>
    fetch(server.baseUrl, '/api/games', {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

  it('POST /api/games requires admin (401, AC6)', async () => {
    const res = await postGame({ title: 'No Token', platforms: ['PS4'], poster: jpegDataUrl() });
    assert.equal(res.status, 401, JSON.stringify(res.json));
    assert.equal(res.json && res.json.error, 'UNAUTHORIZED');
  });

  it('validation: title/platforms/poster and traversal produce structured 400s (AC6)', async () => {
    const headers = await authHeaders();

    const noTitle = await postGame({ platforms: ['PS4'], poster: jpegDataUrl() }, headers);
    assert.equal(noTitle.status, 400, JSON.stringify(noTitle.json));
    assert.equal(noTitle.json && noTitle.json.code, 'TITLE_REQUIRED', JSON.stringify(noTitle.json));
    assert.ok(/عنوان/.test((noTitle.json && noTitle.json.error) || ''), 'Persian message expected');

    const noPlatforms = await postGame({ title: 'No Platforms', poster: jpegDataUrl() }, headers);
    assert.equal(noPlatforms.status, 400, JSON.stringify(noPlatforms.json));
    assert.equal(noPlatforms.json && noPlatforms.json.code, 'PLATFORM_INVALID', JSON.stringify(noPlatforms.json));

    const badPlatform = await postGame({ title: 'PS6 Game', platforms: ['PS6'], poster: jpegDataUrl() }, headers);
    assert.equal(badPlatform.status, 400, JSON.stringify(badPlatform.json));
    assert.equal(badPlatform.json && badPlatform.json.code, 'PLATFORM_INVALID', JSON.stringify(badPlatform.json));

    const noPoster = await postGame({ title: 'No Poster', platforms: ['PS4'] }, headers);
    assert.equal(noPoster.status, 400, JSON.stringify(noPoster.json));
    assert.equal(noPoster.json && noPoster.json.code, 'IMG_REQUIRED', JSON.stringify(noPoster.json));

    const traversal = await postGame({ title: '..', platforms: ['PS4'], poster: jpegDataUrl() }, headers);
    assert.equal(traversal.status, 400, JSON.stringify(traversal.json));
    assert.equal(traversal.json && traversal.json.code, 'TITLE_INVALID', JSON.stringify(traversal.json));
    assert.ok(!fsE3.existsSync(pathE3.join(server.libraryPath, 'Games', 'PS4', '..jpg')),
      'nothing written for an unsafe title');

    const disguised = await postGame({ title: 'Evil', platforms: ['PS4'], poster: 'data:image/jpeg;base64,' + Buffer.from('<html>').toString('base64') }, headers);
    assert.equal(disguised.status, 400, JSON.stringify(disguised.json));
    assert.equal(disguised.json && disguised.json.code, 'IMG_UNSUPPORTED', JSON.stringify(disguised.json));

    assert.ok(!fsE3.existsSync(gameFile('PS4', 'No Platforms.jpg')), 'no partial writes from validation failures');
    assert.ok(!fsE3.existsSync(gameFile('PS4', 'Evil.jpg')), 'disguised poster never reaches disk');
    assert.ok(!(await gamesList()).some(g => g.uid.startsWith('game:no ')), 'catalog unchanged by failures');
  });

  it('create: writes Games/PS4 and Games/PS5 copies and merges into the catalog (AC4)', async () => {
    const headers = await authHeaders();
    const res = await postGame({ title: 'New Game X', platforms: ['PS4', 'PS5'], poster: jpegDataUrl() }, headers);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    const game = res.json.game;
    assert.equal(game.uid, 'game:new game x');
    assert.equal(game.type, 'Game');
    assert.deepEqual(game.platforms, ['PS4', 'PS5']);

    assert.ok(fsE3.existsSync(gameFile('PS4', 'New Game X.jpg')), 'PS4 copy written');
    assert.ok(fsE3.existsSync(gameFile('PS5', 'New Game X.jpg')), 'PS5 copy written');
    assert.ok((await gamesList()).some(g => g.uid === 'game:new game x'), 'game listed in GET /api/games');
    assert.ok(fsE3.existsSync(gameFile('PS4', 'FIFA 24.jpg')), 'pre-existing game untouched');
  });

  it('create: duplicate title → 409 GAME_EXISTS', async () => {
    const headers = await authHeaders();
    const res = await postGame({ title: 'New Game X', platforms: ['PS4'], poster: jpegDataUrl() }, headers);
    assert.equal(res.status, 409, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'GAME_EXISTS', JSON.stringify(res.json));
    const matches = (await gamesList()).filter(g => g.uid === 'game:new game x');
    assert.equal(matches.length, 1, 'still exactly one entry');
  });

  it('PUT by-uid: rename moves both platform copies; uid follows the title', async () => {
    const headers = await authHeaders();
    const uid = encodeURIComponent('game:new game x');
    const res = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ title: 'Renamed Game X' })
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json && res.json.game && res.json.game.uid, 'game:renamed game x');

    assert.ok(!fsE3.existsSync(gameFile('PS4', 'New Game X.jpg')), 'old PS4 name gone');
    assert.ok(!fsE3.existsSync(gameFile('PS5', 'New Game X.jpg')), 'old PS5 name gone');
    assert.ok(fsE3.existsSync(gameFile('PS4', 'Renamed Game X.jpg')), 'new PS4 name written');
    assert.ok(fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'new PS5 name written');

    const list = await gamesList();
    assert.ok(list.some(g => g.uid === 'game:renamed game x'), 'uid follows the rename');
    assert.ok(!list.some(g => g.uid === 'game:new game x'), 'old uid gone');
  });

  it('PUT by-uid: platform removal deletes the copy, adding re-creates it, empty set → 400', async () => {
    const headers = await authHeaders();
    const uid = encodeURIComponent('game:renamed game x');

    const rm = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
      method: 'PUT', headers, body: JSON.stringify({ platforms: ['PS4'] })
    });
    assert.equal(rm.status, 200, JSON.stringify(rm.json));
    assert.deepEqual(rm.json.game.platforms, ['PS4']);
    assert.ok(!fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'PS5 copy removed');

    const empty = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
      method: 'PUT', headers, body: JSON.stringify({ platforms: [] })
    });
    assert.equal(empty.status, 400, JSON.stringify(empty.json));
    assert.equal(empty.json && empty.json.code, 'PLATFORM_INVALID', JSON.stringify(empty.json));
    assert.ok(!fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'nothing added by the failed patch');

    const add = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
      method: 'PUT', headers, body: JSON.stringify({ platforms: ['PS4', 'PS5'] })
    });
    assert.equal(add.status, 200, JSON.stringify(add.json));
    assert.deepEqual(add.json.game.platforms, ['PS4', 'PS5']);
    assert.ok(fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'PS5 copy re-created');
  });

  it('PUT by-uid: poster replace rewrites every platform copy', async () => {
    const headers = await authHeaders();
    const uid = encodeURIComponent('game:renamed game x');
    const marker = [0x50, 0x41, 0x54, 0x43, 0x48]; // "PATCH"

    const res = await fetch(server.baseUrl, `/api/movies/by-uid/${uid}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ poster: jpegDataUrl(marker) })
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    for (const plat of ['PS4', 'PS5']) {
      const bytes = fsE3.readFileSync(gameFile(plat, 'Renamed Game X.jpg'));
      assert.ok(bytes.includes(Buffer.from(marker)),
        `${plat} copy must carry the replacement bytes (got ${bytes.length} bytes)`);
    }
  });

  it('PUT by-uid unknown game → 404 NOT_FOUND', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, `/api/movies/by-uid/${encodeURIComponent('game:ghost')}`, {
      method: 'PUT', headers, body: JSON.stringify({ title: 'Nope' })
    });
    assert.equal(res.status, 404, JSON.stringify(res.json));
    assert.equal(res.json && res.json.code, 'NOT_FOUND', JSON.stringify(res.json));
  });

  let gameTrashId = null;

  it('DELETE game: both copies to trash, entry type Game, catalog drops it (AC4)', async () => {
    const headers = await authHeaders();
    const res = await fetch(server.baseUrl, `/api/movies/by-uid/${encodeURIComponent('game:renamed game x')}`,
      { method: 'DELETE', headers });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    assert.equal(res.json.moved, 2, 'both platform copies moved');
    gameTrashId = String(res.json.id);

    assert.ok(!fsE3.existsSync(gameFile('PS4', 'Renamed Game X.jpg')), 'PS4 copy out of the games folder');
    assert.ok(!fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'PS5 copy out of the games folder');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', gameTrashId, 'Games', 'PS4', 'Renamed Game X.jpg')),
      'PS4 copy under .trash/<id>/Games/PS4/');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', gameTrashId, 'Games', 'PS5', 'Renamed Game X.jpg')),
      'PS5 copy under .trash/<id>/Games/PS5/');
    assert.ok(!(await gamesList()).some(g => g.uid === 'game:renamed game x'), 'game gone from GET /api/games');

    const list = await fetch(server.baseUrl, '/api/trash', { headers });
    const entry = list.json.entries.find(e => e.id === gameTrashId);
    assert.ok(entry, `game trash entry listed: ${JSON.stringify(list.json.entries)}`);
    assert.equal(entry.uid, 'game:renamed game x');
    assert.equal(entry.type, 'Game', 'entries carry a type field so the panel can tell them apart');
    assert.equal(entry.originalPaths.length, 2);
    assert.ok(fsE3.existsSync(gameFile('PS4', 'FIFA 24.jpg')), 'other game untouched');
  });

  it('restore game: files back and the game re-enters the catalog; occupied destination → 409', async () => {
    const headers = await authHeaders();

    const res = await fetch(server.baseUrl, `/api/trash/${gameTrashId}/restore`, { method: 'POST', headers });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(fsE3.existsSync(gameFile('PS4', 'Renamed Game X.jpg')), 'PS4 copy back');
    assert.ok(fsE3.existsSync(gameFile('PS5', 'Renamed Game X.jpg')), 'PS5 copy back');
    const back = (await gamesList()).find(g => g.uid === 'game:renamed game x');
    assert.ok(back, 'game back in GET /api/games');
    assert.deepEqual(back.platforms, ['PS4', 'PS5'], 'platforms merged from both restored copies');

    // Round 2: occupied destination stays all-or-nothing
    const del = await fetch(server.baseUrl, `/api/movies/by-uid/${encodeURIComponent('game:renamed game x')}`,
      { method: 'DELETE', headers });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    const id2 = String(del.json.id);

    const occupant = gameFile('PS4', 'Renamed Game X.jpg');
    fsE3.mkdirSync(pathE3.dirname(occupant), { recursive: true });
    fsE3.writeFileSync(occupant, Buffer.from('occupant'));

    const conflict = await fetch(server.baseUrl, `/api/trash/${id2}/restore`, { method: 'POST', headers });
    assert.equal(conflict.status, 409, JSON.stringify(conflict.json));
    assert.equal(conflict.json && conflict.json.code, 'RESTORE_CONFLICT', JSON.stringify(conflict.json));
    assert.ok(fsE3.readFileSync(occupant).equals(Buffer.from('occupant')), 'occupant untouched');
    assert.ok(fsE3.existsSync(pathE3.join(server.libraryPath, '.trash', id2, 'Games', 'PS5', 'Renamed Game X.jpg')),
      'PS5 copy still in the trash — restore is all-or-nothing');
  });
});

// ─── P8b G5 — bundled Vazirmatn font + /assets allow-list + CSP font-src ────

describe('P8b static assets — font serving, CSP font-src', () => {
  let server;

  before(async () => {
    server = await startTestServer({ tree: {} });
  });

  after(async () => {
    if (server) await server.close();
  });

  it('GET /assets/fonts/Vazirmatn-Variable.woff2 → 200 font/woff2', async () => {
    const res = await fetch(server.baseUrl, '/assets/fonts/Vazirmatn-Variable.woff2');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /font\/woff2/);
    assert.ok(res.body.length > 50000, `bundled font must be non-trivial: ${res.body.length} bytes`);
  });

  it('GET /assets/fonts/OFL.txt → 200 (SIL licence shipped with the font)', async () => {
    const res = await fetch(server.baseUrl, '/assets/fonts/OFL.txt');
    assert.equal(res.status, 200);
  });

  it('GET /assets/… traversal and unknown assets → 404', async () => {
    const trav = await fetch(server.baseUrl, '/assets/../server.js');
    assert.equal(trav.status, 404);
    const unknown = await fetch(server.baseUrl, '/assets/nope.txt');
    assert.equal(unknown.status, 404);
  });

  it('CSP includes font-src \'self\' (G5)', async () => {
    const res = await fetch(server.baseUrl, '/');
    const csp = res.headers['content-security-policy'] || '';
    assert.match(csp, /font-src 'self'/, `CSP=${csp}`);
  });
});
