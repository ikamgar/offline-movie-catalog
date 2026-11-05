'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { makeLibrary } = require('../helpers/fixture-library');
const { scanLibrary } = require('../../backend/scanner');
const CatalogIndexer = require('../../backend/indexer');
const OrderManager = require('../../server/orders/order-manager');
const MovieCreator = require('../../backend/services/movie-creator');
const { parseFilename, cleanTitle } = require('../../backend/parser');
const LibraryWatcher = require('../../backend/watcher');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

function postJSON(baseUrl, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const data = JSON.stringify(body);
    const hdrs = Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {});
    const req = http.request(url, {
      method: 'POST',
      headers: hdrs,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw), headers: res.headers }); } catch { resolve({ status: res.statusCode }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function putJSON(baseUrl, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const data = JSON.stringify(body);
    const hdrs = Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {});
    const req = http.request(url, {
      method: 'PUT',
      headers: hdrs,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJSON(baseUrl, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const req = http.request(url, {
      method: 'GET',
      headers: headers || {},
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw), headers: res.headers }); } catch { resolve({ status: res.statusCode, headers: res.headers }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── SEC-01: static serves project root ───────────────────────────────────────

describe('SEC-01 — static serves project root', () => {
  let server;
  before(async () => { server = await startTestServer({ tree: {} }); });
  after(async () => { if (server) await server.close(); });

  it('SEC-01: server/auth/auth.js must not be publicly accessible', async () => {
    const apiRes = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(apiRes.status, 200, 'precondition: /api/movies must return 200');

    const res = await getJSON(server.baseUrl, '/server/auth/auth.js');
    assert.notEqual(res.status, 200, 'auth.js must not be publicly accessible');
  });

  it('SEC-01: /backend/indexer.js must not be publicly accessible', async () => {
    const res = await getJSON(server.baseUrl, '/backend/indexer.js');
    assert.notEqual(res.status, 200, 'backend source must not be publicly accessible');
  });

  it('SEC-01: /data/catalog.json must not be publicly accessible', async () => {
    const res = await getJSON(server.baseUrl, '/data/catalog.json');
    assert.notEqual(res.status, 200, 'data directory must not be publicly accessible');
  });

  it('SEC-01: /package.json must not be publicly accessible', async () => {
    const res = await getJSON(server.baseUrl, '/package.json');
    assert.notEqual(res.status, 200, 'package.json must not be publicly accessible');
  });

  it('SEC-01: / must serve index.html', async () => {
    const res = await getJSON(server.baseUrl, '/');
    assert.equal(res.status, 200);
  });

  it('SEC-01: /css/ must be accessible', async () => {
    const res = await getJSON(server.baseUrl, '/css/themes.css');
    assert.equal(res.status, 200);
  });

  it('SEC-01: /js/ must be accessible', async () => {
    const res = await getJSON(server.baseUrl, '/js/app.js');
    assert.equal(res.status, 200);
  });
});

// ─── SEC-02: no auth on admin REST endpoints ──────────────────────────────────

describe('SEC-02 — no auth on admin REST endpoints', () => {
  let server;
  before(async () => {
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });
  after(async () => { if (server) await server.close(); });

  it('SEC-02: POST /api/movies must require auth (401 without token)', async () => {
    const res = await postJSON(server.baseUrl, '/api/movies', { title: 'x' });
    assert.equal(res.status, 401);
  });

  it('SEC-02: POST /api/movies must work with valid token', async () => {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    assert.ok(token, 'login should return a token');
    // We don't actually create a movie, just verify the endpoint accepts the token
    // by calling next-id which is also protected
    const res = await getJSON(server.baseUrl, '/api/movies/next-id?type=Movie', {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(res.status, 200);
  });

  it('SEC-02: PUT /api/movies/:id must require auth', async () => {
    const res = await putJSON(server.baseUrl, '/api/movies/0001', { title: 'x', id: '0001' });
    assert.equal(res.status, 401);
  });

  it('SEC-02: GET /api/movies/next-id must require auth', async () => {
    const res = await getJSON(server.baseUrl, '/api/movies/next-id?type=Movie');
    assert.equal(res.status, 401);
  });

  it('SEC-02: POST /api/rescan must require auth', async () => {
    const res = await postJSON(server.baseUrl, '/api/rescan', {});
    assert.equal(res.status, 401);
  });

  it('SEC-02: POST /api/games/rescan must require auth', async () => {
    const res = await postJSON(server.baseUrl, '/api/games/rescan', {});
    assert.equal(res.status, 401);
  });

  it('SEC-02: GET /api/diagnostics must require auth', async () => {
    const res = await getJSON(server.baseUrl, '/api/diagnostics');
    assert.equal(res.status, 401);
  });

  it('SEC-02: GET /api/orders must require auth', async () => {
    const res = await getJSON(server.baseUrl, '/api/orders');
    assert.equal(res.status, 401);
  });

  it('SEC-02: GET /api/orders/:id must require auth', async () => {
    const res = await getJSON(server.baseUrl, '/api/orders/order-0001');
    assert.equal(res.status, 401);
  });

  it('SEC-02: POST /api/auth/logout must require auth', async () => {
    const res = await postJSON(server.baseUrl, '/api/auth/logout', { token: 'x' });
    assert.equal(res.status, 401);
  });

  it('SEC-02: public endpoints remain public', async () => {
    const movies = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(movies.status, 200);
    const stats = await getJSON(server.baseUrl, '/api/stats');
    assert.equal(stats.status, 200);
    const games = await getJSON(server.baseUrl, '/api/games');
    assert.equal(games.status, 200);
    const status = await getJSON(server.baseUrl, '/api/auth/status');
    assert.equal(status.status, 200);
  });
});

// ─── SEC-05: credentials / auth ──────────────────────────────────────────────

describe('SEC-05 — credentials / auth', () => {
  describe('no hard-coded password', () => {
    it('SEC-05: auth source must not contain plain text password', () => {
      const authSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'auth', 'auth.js'), 'utf8');
      assert.ok(!authSource.includes("'123456'"), 'must not contain hard-coded password "123456"');
      assert.ok(!authSource.includes('"123456"'), 'must not contain hard-coded password "123456"');
    });
  });

  describe('first-run setup', () => {
    let server;
    before(async () => {
      server = await startTestServer({ tree: {} });
      // No admin option → auth.json not created → setup required
    });
    after(async () => { if (server) await server.close(); });

    it('SEC-05: GET /api/auth/status returns setupRequired:true when no auth.json', async () => {
      const res = await getJSON(server.baseUrl, '/api/auth/status');
      assert.equal(res.status, 200);
      assert.equal(res.json.setupRequired, true);
    });

    it('SEC-05: POST /api/auth/login rejects when setup not complete', async () => {
      const res = await postJSON(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'test' });
      assert.equal(res.status, 400);
    });

    it('SEC-05: first-run setup accepted only from loopback', async () => {
      // The test server runs on localhost, so it IS loopback
      const res = await postJSON(server.baseUrl, '/api/auth/setup', { username: 'admin', password: 'longpassword123' });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(res.json.token);
    });

    it('SEC-05: after setup, GET /api/auth/status returns setupRequired:false', async () => {
      const res = await getJSON(server.baseUrl, '/api/auth/status');
      assert.equal(res.status, 200);
      assert.equal(res.json.setupRequired, false);
    });

    it('SEC-05: login works after setup', async () => {
      const res = await postJSON(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'longpassword123' });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(res.json.token);
    });
  });

  describe('env override', () => {
    let savedUser, savedPass;
    before(() => {
      savedUser = process.env.ADMIN_USERNAME;
      savedPass = process.env.ADMIN_PASSWORD;
    });
    after(() => {
      if (savedUser !== undefined) process.env.ADMIN_USERNAME = savedUser;
      else delete process.env.ADMIN_USERNAME;
      if (savedPass !== undefined) process.env.ADMIN_PASSWORD = savedPass;
      else delete process.env.ADMIN_PASSWORD;
    });

    it('SEC-05: ADMIN_USERNAME/ADMIN_PASSWORD env vars override auth.json', async () => {
      process.env.ADMIN_USERNAME = 'envadmin';
      process.env.ADMIN_PASSWORD = 'envpass12345';
      const server = await startTestServer({ tree: {} });
      try {
        const status = await getJSON(server.baseUrl, '/api/auth/status');
        assert.equal(status.json.setupRequired, false, 'env credentials count as setup complete');

        const login = await postJSON(server.baseUrl, '/api/auth/login', { username: 'envadmin', password: 'envpass12345' });
        assert.equal(login.status, 200);
        assert.equal(login.json.success, true);
      } finally {
        await server.close();
      }
    });
  });

  describe('rate limiting', () => {
    let server;
    before(async () => {
      server = await startTestServer({
        tree: {},
        admin: { username: 'admin', password: 'strongpass12345' }
      });
    });
    after(async () => { if (server) await server.close(); });

    it('SEC-05: 6th wrong attempt within 5 min returns 429', async () => {
      for (let i = 0; i < 5; i++) {
        await postJSON(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'wrong' + i });
      }
      const res = await postJSON(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'wrong6' });
      assert.equal(res.status, 429);
      assert.ok(res.headers['retry-after']);
    });
  });

  describe('change password', () => {
    let server, token;
    before(async () => {
      server = await startTestServer({
        tree: {},
        admin: { username: 'admin', password: 'oldpass123456' }
      });
      token = await loginAsAdmin(server.baseUrl, 'admin', 'oldpass123456');
    });
    after(async () => { if (server) await server.close(); });

    it('SEC-05: change-password works with correct current password', async () => {
      const res = await postJSON(server.baseUrl, '/api/auth/change-password', {
        currentPassword: 'oldpass123456',
        newPassword: 'newpass123456'
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);

      // Verify new password works
      const login = await postJSON(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'newpass123456' });
      assert.equal(login.status, 200);
      assert.equal(login.json.success, true);
    });

    it('SEC-05: change-password rejects wrong current password', async () => {
      const newToken = await loginAsAdmin(server.baseUrl, 'admin', 'newpass123456');
      const res = await postJSON(server.baseUrl, '/api/auth/change-password', {
        currentPassword: 'wrong',
        newPassword: 'another123456'
      }, { 'Authorization': `Bearer ${newToken}` });
      assert.equal(res.status, 400);
    });
  });
});

// ─── SEC-07: CORS & headers ─────────────────────────────────────────────────

describe('SEC-07 — CORS & security headers', () => {
  let server;
  before(async () => {
    server = await startTestServer({ tree: {} });
  });
  after(async () => { if (server) await server.close(); });

  it('SEC-07: no Access-Control-Allow-Origin header by default (no wildcard)', async () => {
    const res = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined, 'must not have wildcard CORS');
  });

  it('SEC-07: X-Content-Type-Options nosniff present', async () => {
    const res = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('SEC-07: Referrer-Policy no-referrer present', async () => {
    const res = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
  });

  it('SEC-07: X-Frame-Options DENY present', async () => {
    const res = await getJSON(server.baseUrl, '/api/movies');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });
});

// ─── SEC-03: path traversal in createMovie ────────────────────────────────────

describe('SEC-03 — path traversal in createMovie', () => {
  it('SEC-03: must reject id with path traversal', async () => {
    const base = path.join(os.tmpdir(), 'sec03-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    idx.saveToDisk();
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    assert.equal(idx.count, 0, 'precondition: indexer starts empty');

    let accepted = false;
    try {
      await mc.createMovie({ title: 'T', type: 'Movie', year: 2020, genres: ['Action'], id: '../../../evil' }, JPEG, 'jpg');
      accepted = true;
    } catch { /* expected */ }
    assert.ok(!accepted, 'should reject traversal id');
    const escaped = fs.readdirSync(base).filter(n => n !== 'Library' && n !== 'data');
    assert.equal(escaped.length, 0, 'must not write outside Library');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('SEC-03: must reject id with backslash', async () => {
    const base = path.join(os.tmpdir(), 'sec03b-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    idx.saveToDisk();
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    let accepted = false;
    try {
      await mc.createMovie({ title: 'T', type: 'Movie', year: 2020, genres: ['Action'], id: '1\\2' }, JPEG, 'jpg');
      accepted = true;
    } catch { /* expected */ }
    assert.ok(!accepted, 'should reject id with backslash');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('SEC-03: must reject genre with path traversal', async () => {
    const base = path.join(os.tmpdir(), 'sec03c-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    idx.saveToDisk();
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    let accepted = false;
    try {
      await mc.createMovie({ title: 'T', type: 'Movie', year: 2020, genres: ['../../..'], id: '9999' }, JPEG, 'jpg');
      accepted = true;
    } catch { /* expected */ }
    assert.ok(!accepted, 'should reject genre with traversal');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('SEC-03: must reject Windows reserved name CON as genre', async () => {
    const base = path.join(os.tmpdir(), 'sec03d-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    idx.saveToDisk();
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    let accepted = false;
    try {
      await mc.createMovie({ title: 'T', type: 'Movie', year: 2020, genres: ['CON'], id: '9998' }, JPEG, 'jpg');
      accepted = true;
    } catch { /* expected */ }
    assert.ok(!accepted, 'should reject Windows reserved name CON');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── SEC-06: oversized/invalid selection via WS ───────────────────────────────

describe('SEC-06 — oversized/invalid selection via WS', () => {
  it('SEC-06: server must reject oversized WS payloads', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const customer = new WSClient(server.wsUrl);
      await customer.connect('customer');

      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      await manager.connect('manager', token);
      await manager.waitFor('selection:state');

      customer.send({ type: 'selection:update', payload: { movies: [{ uid: '0001', title: 'Heat', id: '0001' }] } });
      const preState = await manager.waitFor('selection:state');
      assert.equal(preState.payload.movies.length, 1, 'precondition: manager receives normal selection');

      const bigObj = { type: 'selection:update', payload: { movies: Array.from({ length: 5000 }, (_, i) => ({ uid: String(i), title: 'X'.repeat(60), id: String(i).padStart(4, '0') })) } };
      const closed = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 500);
        customer._ws.on('close', () => { clearTimeout(timer); resolve(true); });
        customer.send(bigObj);
      });
      assert.ok(closed, 'server must close connection for oversized payload');
      await customer.close().catch(() => {});
      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });

  it('SEC-06: server must validate and sanitize selection:update movie objects', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const customer = new WSClient(server.wsUrl);
      await customer.connect('customer');

      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      await manager.connect('manager', token);
      await manager.waitFor('selection:state');

      customer.send({ type: 'selection:update', payload: { movies: [{ uid: '0001', title: 'Heat', id: '0001' }] } });
      const preState = await manager.waitFor('selection:state');
      assert.equal(preState.payload.movies.length, 1, 'precondition: manager receives normal selection');

      customer.send({
        type: 'selection:update',
        payload: { movies: [
          { uid: '0001', title: '<img onerror="window.__x=1">', absolutePosterPath: 'C:\\secret', extra: 'x', id: '0001' },
          { uid: 'does-not-exist', title: 'FAKE' }
        ] }
      });
      const state = await manager.waitFor('selection:state');

      const m0001 = state.payload.movies.find(m => m.uid === '0001');
      const fake = state.payload.movies.find(m => m.uid === 'does-not-exist');
      assert.ok(m0001, 'must include 0001');
      assert.equal(m0001.title, 'Heat', 'title must come from catalog, not from client');
      assert.equal(m0001.absolutePosterPath, undefined, 'must not pass through absolutePosterPath');
      assert.equal(m0001.extra, undefined, 'must not pass through extra fields');
      assert.ok(!fake, 'must not include unknown uid');

      const badPayloads = [
        { type: 'selection:update', payload: null },
        { type: 'selection:update', payload: { movies: 'not-an-array' } },
        { type: 'selection:update', payload: { movies: [null, 123, { noTitle: true }] } },
      ];
      for (const bad of badPayloads) { customer.send(bad); await sleep(100); }

      await customer.close().catch(() => {});
      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });
});

// ─── SEC-08: API leaks absolutePosterPath ─────────────────────────────────────

describe('SEC-08 — API leaks absolutePosterPath', () => {
  it('SEC-08: GET /api/movies must not expose absolutePosterPath', () => {
    const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
    const catalogPath = path.join(os.tmpdir(), 'sec08-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    const movies = idx.getMovies();
    assert.ok(movies.length >= 1, 'precondition: at least one movie indexed');

    for (const m of movies) {
      assert.equal(m.absolutePosterPath, undefined, `movie ${m.id} leaks absolutePosterPath`);
      assert.equal(m._posterSet, undefined, `movie ${m.id} leaks _posterSet`);
    }
    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
  });

  it('SEC-08: toPublicMovie strips internal fields', () => {
    const movie = {
      uid: '0001', id: '0001', title: 'Heat', year: 1995,
      genres: ['Action'], type: 'Movie', poster: '/api/poster/0001',
      absolutePosterPath: '/secret/path.jpg', _posterSet: true,
      imdbRating: 8.0, plotSummary: 'A heist'
    };
    const pub = CatalogIndexer.toPublicMovie(movie);
    assert.equal(pub.uid, '0001');
    assert.equal(pub.title, 'Heat');
    assert.equal(pub.absolutePosterPath, undefined, 'must not expose absolutePosterPath');
    assert.equal(pub._posterSet, undefined, 'must not expose _posterSet');
    assert.equal(pub.imdbRating, 8.0, 'must expose imdbRating');
    assert.equal(pub.plotSummary, 'A heist', 'must expose plotSummary');
  });

  it('SEC-08: toPublicGame strips internal fields', () => {
    const game = {
      uid: 'game:heat', title: 'Heat', platforms: ['PS4'],
      type: 'Game', poster: '/api/game-poster/heat',
      absolutePosterPath: '/secret/game.jpg'
    };
    const pub = CatalogIndexer.toPublicGame(game);
    assert.equal(pub.uid, 'game:heat');
    assert.equal(pub.title, 'Heat');
    assert.equal(pub.platforms.length, 1);
    assert.equal(pub.absolutePosterPath, undefined, 'must not expose absolutePosterPath');
  });
});

// ─── DATA-01: editing title loses data ────────────────────────────────────────

describe('DATA-01 — editing title loses data', () => {
  it('DATA-01: PUT must preserve imdbRating/plotSummary/year after watcher settles', () => {
    const base = path.join(os.tmpdir(), 'data01-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const oldP = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
    fs.writeFileSync(oldP, JPEG);
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    const m = idx.getMovieById('0001');
    assert.ok(m, 'precondition: movie 0001 exists');
    assert.equal(m.year, 1995, 'precondition: year is 1995');

    m.imdbRating = 8.3;
    m.plotSummary = 'A heist story';
    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());
    const newP = path.join(lib, 'Movies', 'Action', '0001- Heat Renamed 1995.jpg');
    fs.renameSync(oldP, newP);
    m.absolutePosterPath = newP;
    m.title = 'Heat Renamed';
    return sleep(1600).then(() => {
      const after = idx.getMovieById('0001');
      w.stop();
      assert.equal(after.imdbRating, 8.3, 'imdbRating must be preserved');
      assert.equal(after.plotSummary, 'A heist story', 'plotSummary must be preserved');
      assert.equal(after.year, 1995, 'year must be preserved');
      try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
    });
  });
});

// ─── DATA-02: watcher parses without type ─────────────────────────────────────

describe('DATA-02 — watcher parses without type', () => {
  it('DATA-02: hot-added Movie must keep its year', () => {
    const base = path.join(os.tmpdir(), 'data02-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Series'), { recursive: true });
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));

    assert.equal(idx.count, 0, 'precondition: indexer starts empty');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());
    const movieFile = path.join(lib, 'Movies', 'Action', '0005- Fresh 2021.jpg');
    fs.writeFileSync(movieFile, JPEG);
    const seriesFile = path.join(lib, 'Series', 'Breaking Bad.jpg');
    fs.writeFileSync(seriesFile, JPEG);
    return sleep(1600).then(() => {
      const movie = idx.getMovies().find(m => m.id === '0005');
      const series = idx.getMovies().find(m => m.type === 'Series');
      w.stop();
      assert.ok(movie, 'movie should exist');
      assert.equal(movie.year, 2021, 'movie year must be preserved');
      assert.ok(series, 'series should appear');
      try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
    });
  });
});

// ─── DATA-03: multi-genre edit leaves ghost copy ──────────────────────────────

describe('DATA-03 — multi-genre edit leaves ghost copy', () => {
  it('DATA-03: editing a multi-genre movie must rename all copies and not leave ghosts', () => {
    const base = path.join(os.tmpdir(), 'data03-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg'), JPEG);
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    assert.ok(idx.getMovieById('0002'), 'precondition: movie 0002 exists');
    const before = [...idx._fileIndex.keys()].filter(p => p.includes('0002'));
    assert.equal(before.length, 2, 'precondition: two genre copies indexed');

    const MovieEditor = require('../../backend/services/movie-editor');
    const editor = new MovieEditor({ libraryPath: lib, indexer: idx });
    const updated = editor.updateMovie('0002', { id: '0099' });
    assert.equal(updated.id, '0099');

    // Both on-disk copies renamed; no old-name leftover
    const actionFiles = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const dramaFiles = fs.readdirSync(path.join(lib, 'Movies', 'Drama'));
    assert.ok(actionFiles.some(f => f.startsWith('0099-')), `Action has 0099: ${actionFiles}`);
    assert.ok(dramaFiles.some(f => f.startsWith('0099-')), `Drama has 0099: ${dramaFiles}`);
    assert.ok(!actionFiles.some(f => f.startsWith('0002-')), 'no ghost 0002 in Action');
    assert.ok(!dramaFiles.some(f => f.startsWith('0002-')), 'no ghost 0002 in Drama');

    // Fresh rescan (what a restart does) must still be exactly 1 movie
    const idx2 = new CatalogIndexer(path.join(base, 'catalog2.json'));
    quiet(() => idx2.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx2.count, 1, 'must have exactly 1 movie, not ghost duplicates');
    assert.ok(idx2.getMovieById('0099'), 'renamed id present after rescan');
    assert.ok(!idx2.getMovieById('0002'), 'old id gone after rescan');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-04: Games leak into movie index ─────────────────────────────────────

describe('DATA-04 — Games leak into movie index', () => {
  it('DATA-04: Library/Games images must never become movie entries', () => {
    const lib = makeLibrary({
      'Games/PS4/007 Legends.jpg': true,
      'Games/PS5/2K24.jpg': true,
    });

    assert.ok(fs.existsSync(path.join(lib, 'Games', 'PS4', '007 Legends.jpg')), 'precondition: game file exists');

    const { results } = quiet(() => scanLibrary(lib));
    assert.equal(results.length, 0, 'scanLibrary must not return any results for Games files');
    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-05: ID namespace collision ──────────────────────────────────────────

describe('DATA-05 — ID namespace collision', () => {
  it('DATA-05: Movie 0001 and Iranian 0001 must both be indexed', () => {
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Iranian/0001-Gav.jpg': true,
    });

    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg')), 'precondition: movie file exists');
    assert.ok(fs.existsSync(path.join(lib, 'Iranian', '0001-Gav.jpg')), 'precondition: Iranian file exists');

    const idx = new CatalogIndexer(path.join(os.tmpdir(), 'data05.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.ok(idx.count >= 2, `expected >= 2 movies but got ${idx.count}`);
    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(path.join(os.tmpdir(), 'data05.json')); } catch {}
  });
});

// ─── DATA-06: double decodeURIComponent throws for % in title ────────────────

describe('DATA-06 — double decodeURIComponent throws for % in title', () => {
  it('DATA-06: poster lookup must survive titles containing %', () => {
    const lib = makeLibrary({ 'Series/100% Wolf.jpg': true });

    assert.ok(fs.existsSync(path.join(lib, 'Series', '100% Wolf.jpg')), 'precondition: file exists');

    const idx = new CatalogIndexer(path.join(os.tmpdir(), 'data06.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const url = idx.getMovies()[0].poster;
    const expressParam = decodeURIComponent(url.split('/').pop());
    assert.doesNotThrow(() => idx.getPosterPath(expressParam), 'must not throw URIError');
    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(path.join(os.tmpdir(), 'data06.json')); } catch {}
  });
});

// ─── DATA-07: deleted order numbers reused ────────────────────────────────────

describe('DATA-07 — deleted order numbers reused', () => {
  it('DATA-07: order numbers must never be reused', () => {
    const f = path.join(os.tmpdir(), 'data07-' + Date.now(), 'orders.json');
    const dir = path.dirname(f);
    fs.mkdirSync(dir, { recursive: true });
    let om = new OrderManager(f);

    assert.equal(om.count, 0, 'precondition: no orders initially');

    om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const b = om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    om.deleteOrder(b.id);
    om = new OrderManager(f);
    const c = om.createOrder([{ uid: '3', title: 'C' }], 'admin');
    assert.notEqual(c.id, b.id, 'new order must not reuse deleted number');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-08: corrupted orders.json silently overwritten ──────────────────────

describe('DATA-08 — corrupted orders.json silently overwritten', () => {
  it('DATA-08: corrupted orders.json must not overwrite history silently', () => {
    const dir = path.join(os.tmpdir(), 'data08-' + Date.now());
    const f = path.join(dir, 'orders.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, '{"orders":[{"id":"order-0007","number":7,"createdBy":"SENTINEL","movies":[]}');

    assert.ok(fs.existsSync(f), 'precondition: orders file exists');
    assert.ok(fs.readFileSync(f, 'utf8').includes('SENTINEL'), 'precondition: sentinel data present');

    const om = new OrderManager(f);
    om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const after = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    const siblings = fs.readdirSync(dir);
    const backupDir = path.join(dir, 'backups');
    const backupPreserved = fs.existsSync(backupDir) &&
      fs.readdirSync(backupDir).some((n) => fs.readFileSync(path.join(backupDir, n), 'utf8').includes('SENTINEL'));
    const preserved = after.includes('SENTINEL') ||
      siblings.some(n => n !== 'orders.json' && n !== 'backups' && fs.statSync(path.join(dir, n)).isFile() &&
        fs.readFileSync(path.join(dir, n), 'utf8').includes('SENTINEL')) ||
      backupPreserved;
    assert.ok(preserved, 'previous history must be preserved or quarantined');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-10: manager metadata lives only in rebuildable catalog ─────────────

describe('DATA-10 — manager metadata in rebuildable cache only', () => {
  it('DATA-10: set rating/plot, delete catalog.json, restart → values intact', () => {
    const base = path.join(os.tmpdir(), 'data10-' + Date.now());
    fs.mkdirSync(base, { recursive: true });
    const catalogPath = path.join(base, 'catalog.json');
    const metaPath = path.join(base, 'metadata.json');
    const backupDir = path.join(base, 'backups');

    // Old-format catalog with manager fields
    fs.writeFileSync(catalogPath, JSON.stringify({
      meta: { version: '0.0' },
      movies: [
        { uid: '0001', id: '0001', title: 'Heat', type: 'Movie', year: 1995, genres: ['Action'], imdbRating: 8.3, plotSummary: 'A heist story' },
        { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', type: 'Series', year: null, genres: [], imdbRating: 9.5, plotSummary: 'series plot' }
      ],
      fileIndex: {}
    }, null, 2));

    const MetadataStore = require('../../backend/storage/metadata-store');
    const store1 = new MetadataStore(metaPath, { backupDir, catalogPath });
    store1.load();
    assert.equal(store1.get('0001').imdbRating, 8.3, 'migration imported rating');
    assert.equal(store1.get('series:breaking bad').plotSummary, 'series plot');

    // Delete catalog.json — must lose nothing
    fs.unlinkSync(catalogPath);

    const store2 = new MetadataStore(metaPath, { backupDir, catalogPath });
    store2.load();
    assert.equal(store2.get('0001').imdbRating, 8.3, 'rating survives catalog deletion');
    assert.equal(store2.get('0001').plotSummary, 'A heist story');
    assert.equal(store2.get('series:breaking bad').imdbRating, 9.5);

    // Rename key → metadata follows
    store2.rename('0001', '0099');
    assert.equal(store2.get('0001'), null);
    assert.equal(store2.get('0099').imdbRating, 8.3);
    store2.flush();

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-14: saveToDisk sort comparator inconsistent for Series ─────────────

describe('DATA-14 — saveToDisk sort comparator inconsistent when ids are null', () => {
  it('DATA-14: catalog sort is a total order (type priority then key)', () => {
    const CatalogIndexerMod = CatalogIndexer;
    const cmp = CatalogIndexerMod.compareForPersist;
    assert.ok(typeof cmp === 'function', 'compareForPersist exported');

    const seriesA = { type: 'Series', id: null, title: 'Breaking Bad' };
    const seriesB = { type: 'Series', id: null, title: 'Better Call Saul' };
    const seriesEq = { type: 'Series', id: null, title: 'breaking bad' };
    const movie1 = { type: 'Movie', id: '0002', title: 'B' };
    const movie2 = { type: 'Movie', id: '0010', title: 'J' };
    const iranian = { type: 'Iranian', id: '0001', title: 'Gav' };
    const anim = { type: 'Animation', id: '00012', title: 'Cars' };

    // Antisymmetry / consistency for Series pairs (old bug: both ids null)
    const cAB = cmp(seriesA, seriesB);
    const cBA = cmp(seriesB, seriesA);
    assert.equal(Math.sign(cAB), -Math.sign(cBA) === 0 && Math.sign(cAB) === 0 ? 0 : -Math.sign(cBA), 'antisymmetric');
    // Equal keys (normalised titles match) must compare equal, not crash
    assert.equal(cmp(seriesA, seriesEq), 0, 'equal normalised Series keys compare equal');
    assert.equal(cmp(seriesA, seriesA), 0, 'reflexive');
    // Transitivity spot-checks with mixed types
    const items = [seriesA, seriesB, movie2, movie1, iranian, anim];
    const sorted = [...items].sort(cmp);
    assert.equal(sorted[0].type, 'Movie', 'Movie first');
    assert.ok(['Movie'].includes(sorted[0].type));
    const types = sorted.map((m) => m.type);
    const priority = { Movie: 0, Iranian: 1, Animation: 2, Series: 3 };
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(
        priority[sorted[i - 1].type] <= priority[sorted[i].type],
        `type order broken at ${i}: ${types[i - 1]} → ${types[i]}`
      );
    }
    // Numeric: id 0010 > id 0002
    const moviesOnly = sorted.filter((m) => m.type === 'Movie');
    assert.equal(moviesOnly[0].id, '0002');
    assert.equal(moviesOnly[1].id, '0010');

    // Deterministic: sorting twice yields same result
    const again = [...items].reverse().sort(cmp);
    assert.deepEqual(
      again.map((m) => m.type + ':' + (m.id || m.title)),
      sorted.map((m) => m.type + ':' + (m.id || m.title)),
      'sort must be deterministic'
    );
  });

  it('DATA-14: saveToDisk writes movies in compareForPersist order', () => {
    const base = path.join(os.tmpdir(), 'data14-' + Date.now());
    fs.mkdirSync(base, { recursive: true });
    const catalogPath = path.join(base, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    idx.addFile({ id: '0010', title: 'J', year: 2000, type: 'Movie', genres: [], posterPath: '/x/10.jpg', lastModified: 1 });
    idx.addFile({ id: '0002', title: 'B', year: 2000, type: 'Movie', genres: [], posterPath: '/x/2.jpg', lastModified: 1 });
    idx.addFile({ id: null, title: 'Zebra', year: null, type: 'Series', genres: [], posterPath: '/x/z.jpg', lastModified: 1 });
    idx.addFile({ id: null, title: 'Alpha', year: null, type: 'Series', genres: [], posterPath: '/x/a.jpg', lastModified: 1 });
    idx.addFile({ id: '0001', title: 'Gav', year: null, type: 'Iranian', genres: [], posterPath: '/x/g.jpg', lastModified: 1 });
    quiet(() => idx.saveToDisk());

    const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const order = raw.movies.map((m) => `${m.type}:${m.id || m.title}`);
    assert.deepEqual(order, [
      'Movie:0002',
      'Movie:0010',
      'Iranian:0001',
      'Series:Alpha',
      'Series:Zebra'
    ], `unexpected order: ${order.join(' | ')}`);
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-09: Series rollback removes all series ──────────────────────────────

describe('DATA-09 — Series rollback removes all series', () => {
  it('DATA-09: failed Series creation must not wipe existing Series (rollback by key)', async () => {
    const base = path.join(os.tmpdir(), 'data09-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Series'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Series', 'Breaking Bad.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Series', 'Dexter.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    const catalogPath = path.join(base, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    idx.saveToDisk();

    const seriesBefore = idx.getMovies().filter(m => m.type === 'Series');
    assert.ok(seriesBefore.length >= 2, 'precondition: at least 2 series');

    // Inject failure partway through writing genre copies (after first write would
    // succeed for multi-genre; Series has one folder — fail that write).
    // With B8, failure before index add → no catalog mutation; if index was
    // touched, rollback is by key (never m.id !== null which wiped all Series).
    let writes = 0;
    const mc = new MovieCreator(lib, catalogPath, idx, null, null, null, {
      writeFileSync: (p, data, opts) => {
        writes += 1;
        // Allow staging (tmpdir) but fail the Library genre copy
        if (String(p).startsWith(lib)) {
          const err = new Error('simulated disk failure');
          err.code = 'EIO';
          throw err;
        }
        return fs.writeFileSync(p, data, opts);
      }
    });

    await assert.rejects(
      () => mc.createMovie({ title: 'New Show', type: 'Series', genres: [] }, JPEG, 'jpg'),
      /simulated disk failure/
    );
    assert.ok(writes >= 1, 'at least one write attempted');

    const seriesAfter = idx.getMovies().filter(m => m.type === 'Series');
    assert.equal(seriesAfter.length, seriesBefore.length,
      `existing Series must survive failed creation (before=${seriesBefore.length}, after=${seriesAfter.length})`);
    assert.ok(seriesAfter.some(m => m.title === 'Breaking Bad'), 'Breaking Bad still present');
    assert.ok(seriesAfter.some(m => m.title === 'Dexter'), 'Dexter still present');
    assert.ok(!seriesAfter.some(m => m.title === 'New Show'), 'failed create not left in index');

    // No orphan file for the failed create
    const seriesFiles = fs.readdirSync(path.join(lib, 'Series'));
    assert.ok(!seriesFiles.includes('New Show.jpg'), `no orphan New Show.jpg (files: ${seriesFiles})`);

    // Catalog on disk still has both series (indexer is sole writer; flush on rollback path not required for count)
    const afterSeriesCount = idx.getMovies().filter(m => m.type === 'Series').length;
    assert.equal(afterSeriesCount, seriesBefore.length);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('DATA-09: multi-genre partial write failure rolls back copies and leaves index untouched', async () => {
    const base = path.join(os.tmpdir(), 'data09b-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    const catalogPath = path.join(base, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    assert.equal(idx.count, 0, 'precondition: empty index');

    let writes = 0;
    const mc = new MovieCreator(lib, catalogPath, idx, null, null, null, {
      writeFileSync: (p, data, opts) => {
        writes += 1;
        if (String(p).startsWith(lib)) {
          // First genre copy succeeds, second fails
          const isSecondLibWrite = writes >= 3; // staging + Action + Drama
          if (isSecondLibWrite) {
            throw new Error('simulated disk failure on 2nd copy');
          }
        }
        return fs.writeFileSync(p, data, opts);
      }
    });

    await assert.rejects(
      () => mc.createMovie(
        { title: 'Rollback Test', type: 'Movie', year: 2020, genres: ['Action', 'Drama'] },
        JPEG, 'jpg'
      ),
      /simulated disk failure/
    );

    // Index untouched
    assert.equal(idx.count, 0, 'index must stay empty after failed create');
    // No orphan genre copies
    const actionFiles = fs.existsSync(path.join(lib, 'Movies', 'Action'))
      ? fs.readdirSync(path.join(lib, 'Movies', 'Action')) : [];
    const dramaFiles = fs.existsSync(path.join(lib, 'Movies', 'Drama'))
      ? fs.readdirSync(path.join(lib, 'Movies', 'Drama')) : [];
    assert.ok(!actionFiles.some(f => f.includes('Rollback Test')), `no Action orphan: ${actionFiles}`);
    assert.ok(!dramaFiles.some(f => f.includes('Rollback Test')), `no Drama orphan: ${dramaFiles}`);
    // No Library/.tmp (DATA-13)
    assert.ok(!fs.existsSync(path.join(lib, '.tmp')), 'no Library/.tmp directory');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── DATA-11: Animation/Iranian discard year ──────────────────────────────────

describe('DATA-11 — Animation/Iranian discard year', () => {
  it('DATA-11: Animation filename with year must preserve year', () => {
    assert.ok(parseFilename, 'precondition: parseFilename is defined');

    const r = parseFilename('00012-Cars 2006.jpg', 'Animation');
    assert.ok(r);
    assert.equal(r.year, 2006, 'Animation year should be preserved when present');
  });
});

// ─── DATA-12: cleanTitle strips real words ────────────────────────────────────

describe('DATA-12 — cleanTitle strips real words', () => {
  it('DATA-12: cleanTitle must not strip "Web" from "Charlotte\'s Web"', () => {
    assert.ok(typeof cleanTitle === 'function', 'precondition: cleanTitle is a function');

    assert.equal(cleanTitle("Charlotte's Web"), "Charlotte's Web");
  });
  it('DATA-12: cleanTitle must not strip "Amazon" from "The Amazon"', () => {
    assert.equal(cleanTitle('The Amazon'), 'The Amazon');
  });
  it('DATA-12: "0001- Apple 2020.jpg" must not be dropped entirely', () => {
    const r = parseFilename('0001- Apple 2020.jpg', 'Movie');
    assert.ok(r, 'Apple movie must parse successfully');
    assert.equal(r.title, 'Apple');
  });
});

// ─── DATA-17: year regex picks resolution tag ─────────────────────────────────

describe('DATA-17 — year regex picks resolution tag', () => {
  it('DATA-17: "5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" must parse year=2008', () => {
    assert.ok(parseFilename, 'precondition: parseFilename is defined');

    const r = parseFilename('5273 - The Dark Knight (2008) [1080p] [BluRay].jpg', 'Movie');
    assert.ok(r, 'should parse successfully');
    assert.equal(r.year, 2008, 'year must be 2008, not 1080');
    assert.equal(r.title, 'The Dark Knight');
  });
});

// ─── DATA-18: 7+ digit ID split ──────────────────────────────────────────────

describe('DATA-18 — 7+ digit ID split', () => {
  it('DATA-18: "1234567- Inception 2010.jpg" must be rejected or parsed whole', () => {
    assert.ok(parseFilename, 'precondition: parseFilename is defined');

    const r = parseFilename('1234567- Inception 2010.jpg', 'Movie');
    if (r) {
      assert.notEqual(r.id, '123456', 'must not split the ID');
    }
  });
});

// ─── SEC-03: safe-path helpers ────────────────────────────────────────────────

describe('SEC-03 — safe-path helpers', () => {
  const { validateId, safeSegment, resolveInside } = require('../../backend/utils/safe-path');

  describe('validateId', () => {
    it('accepts valid 1–6 digit ids', () => {
      assert.doesNotThrow(() => validateId('1'));
      assert.doesNotThrow(() => validateId('0001'));
      assert.doesNotThrow(() => validateId('123456'));
    });

    it('rejects non-numeric ids', () => {
      assert.throws(() => validateId('abc'), /نامعتبر/);
      assert.throws(() => validateId('0001a'), /نامعتبر/);
    });

    it('rejects traversal ids', () => {
      assert.throws(() => validateId('../../../evil'), /نامعتبر/);
      assert.throws(() => validateId('1/2'), /نامعتبر/);
    });

    it('rejects ids longer than 6 digits', () => {
      assert.throws(() => validateId('1234567'), /نامعتبر/);
    });

    it('rejects empty string', () => {
      assert.throws(() => validateId(''), /نامعتبر/);
    });

    it('rejects non-string', () => {
      assert.throws(() => validateId(123), /باید رشته باشد/);
    });
  });

  describe('safeSegment', () => {
    it('accepts valid segments', () => {
      assert.equal(safeSegment('Action'), 'Action');
      assert.equal(safeSegment('فیلم ایرانی'), 'فیلم ایرانی');
    });

    it('NFC-normalises', () => {
      // e + combining acute = 2 codepoints vs single é
      const composed = 'café';
      const decomposed = 'cafe\u0301';
      assert.equal(safeSegment(decomposed), composed);
    });

    it('rejects segments with slashes', () => {
      assert.throws(() => safeSegment('a/b'), /\//);
      assert.throws(() => safeSegment('a\\b'), /\\/);
    });

    it('rejects ..', () => {
      assert.throws(() => safeSegment('..'), /\.\./);
    });

    it('rejects Windows reserved names', () => {
      assert.throws(() => safeSegment('CON'), /رزرو شده/);
      assert.throws(() => safeSegment('con'), /رزرو شده/);
      assert.throws(() => safeSegment('PRN'), /رزرو شده/);
      assert.throws(() => safeSegment('AUX'), /رزرو شده/);
      assert.throws(() => safeSegment('NUL'), /رزرو شده/);
      assert.throws(() => safeSegment('COM1'), /رزرو شده/);
      assert.throws(() => safeSegment('LPT1'), /رزرو شده/);
    });

    it('rejects trailing dot or space', () => {
      assert.throws(() => safeSegment('name.'), /نقطه یا فاصله/);
      assert.throws(() => safeSegment('name '), /نقطه یا فاصله/);
    });

    it('rejects names longer than 120 chars', () => {
      assert.throws(() => safeSegment('x'.repeat(121)), /طولانی/);
    });

    it('rejects empty string', () => {
      assert.throws(() => safeSegment(''), /خالی/);
    });

    it('rejects control characters', () => {
      assert.throws(() => safeSegment('a\x00b'), /کنترلی/);
      assert.throws(() => safeSegment('a\x1fb'), /کنترلی/);
    });
  });

  describe('resolveInside', () => {
    it('resolves a path inside root', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test-' + Date.now());
      const result = resolveInside(root, 'Movies', 'Action');
      assert.ok(result.startsWith(path.resolve(root)));
      assert.ok(result.includes('Movies'));
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });

    it('rejects path traversal', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test2-' + Date.now());
      assert.throws(() => resolveInside(root, '..', 'etc', 'passwd'), /خروج/);
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });

    it('rejects absolute path outside root', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test3-' + Date.now());
      if (process.platform === 'win32') {
        // On Windows, test with a different drive letter trick
        assert.doesNotThrow(() => resolveInside(root, 'Movies'));
      } else {
        assert.throws(() => resolveInside(root, '/etc/passwd'), /خروج/);
      }
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });

    it('rejects when resolved path equals root', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test4-' + Date.now());
      assert.throws(() => resolveInside(root), /خروج/);
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });
  });

  describe('validateId — additional edge cases', () => {
    it('accepts exactly 6 zeros', () => {
      assert.doesNotThrow(() => validateId('000000'));
    });

    it('accepts single digit', () => {
      assert.doesNotThrow(() => validateId('0'));
    });
  });

  describe('safeSegment — additional edge cases', () => {
    it('rejects 300-char name', () => {
      assert.throws(() => safeSegment('x'.repeat(300)), /طولانی/);
    });

    it('rejects COM2 through COM9', () => {
      for (let i = 2; i <= 9; i++) {
        assert.throws(() => safeSegment(`COM${i}`), /رزرو شده/);
      }
    });

    it('rejects LPT2 through LPT9', () => {
      for (let i = 2; i <= 9; i++) {
        assert.throws(() => safeSegment(`LPT${i}`), /رزرو شده/);
      }
    });

    it('accepts Persian genre name دوبله فارسی', () => {
      assert.equal(safeSegment('دوبله فارسی'), 'دوبله فارسی');
    });

    it('accepts title with ZWNJ (zero-width non-joiner)', () => {
      // U+200C is ZWNJ
      const title = 'فیلم\u200Cهای آخر هفته';
      assert.equal(safeSegment(title), title);
    });

    it('accepts title with apostrophe (Ocean\'s Twelve)', () => {
      assert.equal(safeSegment("Ocean's Twelve"), "Ocean's Twelve");
    });

    it('accepts title with ampersand', () => {
      assert.equal(safeSegment('Tom & Jerry'), 'Tom & Jerry');
    });

    it('accepts title with parentheses', () => {
      assert.equal(safeSegment('Lost (2004)'), 'Lost (2004)');
    });

    it('accepts title with square brackets', () => {
      assert.equal(safeSegment('Movie [2020]'), 'Movie [2020]');
    });
  });

  describe('resolveInside — edge cases', () => {
    it('rejects single dot segment', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test5-' + Date.now());
      assert.throws(() => resolveInside(root, '.'), /خروج/);
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });

    it('rejects traversal escaping root', () => {
      const root = path.join(os.tmpdir(), 'safe-path-test6-' + Date.now());
      assert.throws(() => resolveInside(root, '..', 'etc'), /خروج/);
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    });
  });
});

// ─── SEC-03: traversal via REST endpoints ─────────────────────────────────────

describe('SEC-03 — traversal via REST endpoints', () => {
  it('SEC-03: PUT /api/movies/:id rejects traversal in new id', async () => {
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await putJSON(server.baseUrl, '/api/movies/0001', {
        title: 'Heat', id: '../../../evil', year: 1995
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 400, 'must reject traversal id in PUT');
    } finally {
      await server.close();
    }
  });

  it('SEC-03: PUT /api/movies/:id rejects backslash in new id', async () => {
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await putJSON(server.baseUrl, '/api/movies/0001', {
        title: 'Heat', id: '1\\2', year: 1995
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 400, 'must reject backslash in id');
    } finally {
      await server.close();
    }
  });
});

// ─── S6: upload hardening ─────────────────────────────────────────────────────

describe('S6 — upload hardening', () => {
  it('S6: POST /api/movies rejects HTML magic bytes disguised as .jpg', async () => {
    const HTML = Buffer.from([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45, 0x20, 0x68, 0x74, 0x6d, 0x6c, 0x3e]);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/jpeg;base64,' + HTML.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'XSS', type: 'Movie', year: 2020, genres: ['Action'], id: '9901', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 400, 'must reject HTML bytes named as jpg');
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies rejects PHP magic bytes disguised as .jpg', async () => {
    const PHP = Buffer.from([0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63, 0x68, 0x6f, 0x20, 0x27, 0x68, 0x61, 0x63, 0x6b, 0x65, 0x64, 0x27, 0x3b, 0x3f, 0x3e]);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/jpeg;base64,' + PHP.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'PHP', type: 'Movie', year: 2020, genres: ['Action'], id: '9902', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 400, 'must reject PHP bytes named as jpg');
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies rejects decoded payload > 8 MB', async () => {
    const PNG89 = Buffer.alloc(8 * 1024 * 1024 + 100);
    PNG89[0] = 0x89; PNG89[1] = 0x50; PNG89[2] = 0x4e; PNG89[3] = 0x47;
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/png;base64,' + PNG89.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'Big', type: 'Movie', year: 2020, genres: ['Action'], id: '9903', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 413, 'must reject >8MB decoded payload');
    } finally {
      await server.close();
    }
  });

  it('FE-13: POST /api/movies accepts a >100KB poster body (guard exemption)', async () => {
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(160 * 1024, 0x41)
    ]);
    const poster = 'data:image/jpeg;base64,' + big.toString('base64');
    const body = {
      title: 'Fat Poster', type: 'Movie', year: 2019,
      genres: ['Action'], id: '9905', poster
    };
    assert.ok(JSON.stringify(body).length > 100 * 1024,
      `body must exceed 100KB to prove the exemption: ${JSON.stringify(body).length}`);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const res = await postJSON(server.baseUrl, '/api/movies', body,
        { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200,
        `guard must not 413 create with >100KB poster: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.success, true);
      const dir = path.join(server.libraryPath, 'Movies', 'Action');
      const created = fs.readdirSync(dir).filter(f => f.startsWith('9905-'));
      assert.equal(created.length, 1,
        `poster file must be written: ${JSON.stringify(fs.readdirSync(dir))}`);
      assert.equal(fs.statSync(path.join(dir, created[0])).size, big.length,
        'written poster bytes must match the payload');
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies uses detected type for extension, not client MIME', async () => {
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      // Send JPEG bytes but claim it's a GIF in the data-URL
      const poster = 'data:image/gif;base64,' + JPEG.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'ExtTest', type: 'Movie', year: 2020, genres: ['Action'], id: '9904', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200, 'should accept JPEG bytes regardless of MIME');
      const movie = res.json.movie;
      assert.ok(movie, 'response has movie');
      // The file on disk should have .jpg extension, not .gif
      const actionDir = path.join(server.libraryPath, 'Movies', 'Action');
      const files = fs.readdirSync(actionDir);
      const match = files.find(f => f.includes('ExtTest'));
      assert.ok(match, 'file created');
      assert.ok(match.endsWith('.jpg'), `extension should be .jpg not .gif (${match})`);
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies accepts valid JPEG', async () => {
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/jpeg;base64,' + JPEG.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'ValidJPEG', type: 'Movie', year: 2020, genres: ['Action'], id: '9905', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200, 'should accept valid JPEG');
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies accepts valid PNG', async () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/png;base64,' + PNG.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'ValidPNG', type: 'Movie', year: 2020, genres: ['Action'], id: '9906', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200, 'should accept valid PNG');
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies accepts valid WEBP', async () => {
    // RIFF....WEBP magic bytes
    const WEBP = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (placeholder)
      0x57, 0x45, 0x42, 0x50  // WEBP
    ]);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/webp;base64,' + WEBP.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'ValidWEBP', type: 'Movie', year: 2020, genres: ['Action'], id: '9907', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200, 'should accept valid WEBP');
      const movie = res.json.movie;
      assert.ok(movie, 'response has movie');
      const actionDir = path.join(server.libraryPath, 'Movies', 'Action');
      const files = fs.readdirSync(actionDir);
      const match = files.find(f => f.includes('ValidWEBP'));
      assert.ok(match, 'file created');
      assert.ok(match.endsWith('.webp'), `extension should be .webp (${match})`);
    } finally {
      await server.close();
    }
  });

  it('S6: POST /api/movies accepts valid AVIF', async () => {
    // ftypavif or ftypavis magic bytes
    const AVIF = Buffer.from([
      0x00, 0x00, 0x00, 0x00, // box size (placeholder)
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x66  // avif
    ]);
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/avif;base64,' + AVIF.toString('base64');
      const res = await postJSON(server.baseUrl, '/api/movies', {
        title: 'ValidAVIF', type: 'Movie', year: 2020, genres: ['Action'], id: '9908', poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 200, 'should accept valid AVIF');
      const movie = res.json.movie;
      assert.ok(movie, 'response has movie');
      const actionDir = path.join(server.libraryPath, 'Movies', 'Action');
      const files = fs.readdirSync(actionDir);
      const match = files.find(f => f.includes('ValidAVIF'));
      assert.ok(match, 'file created');
      assert.ok(match.endsWith('.avif'), `extension should be .avif (${match})`);
    } finally {
      await server.close();
    }
  });

  it('S6: non-movie POST with >100KB body returns 413', async () => {
    const server = await startTestServer({
      tree: {},
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const bigBody = 'x'.repeat(102401);
      const res = await postJSON(server.baseUrl, '/api/rescan', { data: bigBody },
        { 'Authorization': `Bearer ${token}` });
      assert.equal(res.status, 413, 'non-movie POST >100KB must be rejected');
    } finally {
      await server.close();
    }
  });
});

// ─── S7: API output whitelist — GET /api/games ────────────────────────────────

describe('S7 — GET /api/games whitelist', () => {
  it('S7: GET /api/games must not expose absolutePosterPath', async () => {
    const lib = makeLibrary({
      'Games/PS4/GTA V.jpg': true,
    });
    const server = await startTestServer({
      libraryPath: lib,
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const res = await getJSON(server.baseUrl, '/api/games');
      assert.equal(res.status, 200);
      for (const g of res.json.games) {
        assert.equal(g.absolutePosterPath, undefined,
          `game "${g.title}" leaks absolutePosterPath`);
      }
    } finally {
      await server.close();
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    }
  });
});

// ─── S7: WS broadcast whitelist ───────────────────────────────────────────────

describe('S7 — WS broadcast whitelist', () => {
  it('S7: selection:state broadcast must not contain absolutePosterPath', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const customer = new WSClient(server.wsUrl);
      await customer.connect('customer');
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      await manager.connect('manager', token);
      await manager.waitFor('selection:state');

      customer.send({ type: 'selection:update', payload: { movies: [{ uid: '0001' }] } });
      const state = await manager.waitFor('selection:state');
      for (const m of state.payload.movies) {
        assert.equal(m.absolutePosterPath, undefined,
          `movie "${m.title}" leaks absolutePosterPath in selection:state`);
        assert.equal(m._posterSet, undefined,
          `movie "${m.title}" leaks _posterSet in selection:state`);
      }
      await customer.close().catch(() => {});
      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });

  it('S7: movie:updated broadcast must not contain absolutePosterPath', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const client = new WSClient(server.wsUrl);
      await client.connect('customer');
      const messages = [];
      client.onMessage(msg => messages.push(msg));

      // Trigger a movie:updated broadcast by doing a PUT
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const putRes = await putJSON(server.baseUrl, '/api/movies/0001', {
        title: 'Heat Updated', id: '0001', year: 1995
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(putRes.status, 200);

      await sleep(500);
      const updated = messages.find(m => m.type === 'movie:updated');
      if (updated) {
        assert.equal(updated.payload.movie.absolutePosterPath, undefined,
          'movie:updated leaks absolutePosterPath');
        assert.equal(updated.payload.movie._posterSet, undefined,
          'movie:updated leaks _posterSet');
      }
      await client.close().catch(() => {});
    } finally {
      await server.close();
    }
  });

  it('S7: movie:added broadcast must not contain absolutePosterPath', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const client = new WSClient(server.wsUrl);
      await client.connect('customer');
      const messages = [];
      client.onMessage(msg => messages.push(msg));

      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      const poster = 'data:image/jpeg;base64,' + JPEG.toString('base64');
      const postRes = await postJSON(server.baseUrl, '/api/movies', {
        title: 'New Movie', type: 'Movie', year: 2020, genres: ['Action'], poster
      }, { 'Authorization': `Bearer ${token}` });
      assert.equal(postRes.status, 200);

      await sleep(500);
      const added = messages.find(m => m.type === 'movie:added');
      if (added) {
        assert.equal(added.payload.movie.absolutePosterPath, undefined,
          'movie:added leaks absolutePosterPath');
        assert.equal(added.payload.movie._posterSet, undefined,
          'movie:added leaks _posterSet');
      }
      await client.close().catch(() => {});
    } finally {
      await server.close();
    }
  });
});

// ─── S9: WS hardening ─────────────────────────────────────────────────────────

describe('S9 — WS hardening', () => {
  it('S9: hello:ack carries protocol:2', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: {},
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const client = new WSClient(server.wsUrl);
      await client.connect('customer');
      const ack = await client.waitFor('hello:ack');
      assert.equal(ack.payload.protocol, 3, 'hello:ack must carry protocol:3');
      assert.ok(typeof ack.payload.bootId === 'string' && ack.payload.bootId.length > 0,
        'hello:ack must carry bootId');
      await client.close().catch(() => {});
    } finally {
      await server.close();
    }
  });

  it('S9: old client hello without protocol still works', async () => {
    const WebSocket = require('ws');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const ws = new WebSocket(server.wsUrl);
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      // Send hello WITHOUT protocol field (old cached tab / pre-P4 client)
      ws.send(JSON.stringify({ type: 'hello', payload: { role: 'customer' } }));
      const msg = await new Promise((resolve) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      });
      assert.equal(msg.type, 'hello:ack', 'old client must receive hello:ack');
      assert.equal(msg.payload.role, 'customer');
      assert.equal(msg.payload.protocol, 3, 'server still reports its protocol to protocol-less clients');

      // Full function, not just handshake: selection round-trip must work
      const statePromise = new Promise((resolve) => {
        const onData = (data) => {
          const m = JSON.parse(data.toString());
          if (m.type === 'selection:state') { ws.off('message', onData); resolve(m); }
        };
        ws.on('message', onData);
      });
      ws.send(JSON.stringify({ type: 'selection:update', payload: { movies: [{ uid: '0001' }] } }));
      const state = await statePromise;
      assert.equal(state.type, 'selection:state', 'protocol-less client must get selection:state back');
      assert.ok(Array.isArray(state.payload.movies) && state.payload.movies.length === 1,
        'selection must echo the accepted movie, got: ' + JSON.stringify(state.payload));
      ws.close();
    } finally {
      await server.close();
    }
  });

  it('S9: >500 items in selection is capped', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const customer = new WSClient(server.wsUrl);
      await customer.connect('customer');
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
      await manager.connect('manager', token);
      await manager.waitFor('selection:state');

      // Send 600 items, only uid '0001' exists in catalog
      const movies = Array.from({ length: 600 }, (_, i) => ({
        uid: i === 0 ? '0001' : `fake-${i}`
      }));
      customer.send({ type: 'selection:update', payload: { movies } });
      const state = await manager.waitFor('selection:state');
      assert.ok(state.payload.movies.length <= 500, `must cap at 500, got ${state.payload.movies.length}`);
      assert.equal(state.payload.movies.length, 1, 'only the valid uid should survive re-hydration');
      await customer.close().catch(() => {});
      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });
});

// ─── S9: orders:save re-hydration ─────────────────────────────────────────────

describe('S9 — orders:save re-hydration', () => {
  it('S9: orders:save re-hydrates from uids — fake title is overwritten', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');

      // Collect all messages to avoid race with burst messages
      const messages = [];
      await manager.connect('manager', token);
      manager.onMessage(msg => messages.push(msg));

      // Wait for initial burst to settle
      await sleep(500);

      // Send orders:save with a fake title for uid 0001
      manager.send({
        type: 'orders:save',
        payload: { movies: [{ uid: '0001', title: 'FAKE TITLE', absolutePosterPath: '/secret' }] }
      });
      await sleep(500);

      const saved = messages.find(m => m.type === 'orders:saved');
      assert.ok(saved, 'orders:saved received');
      assert.ok(saved.payload.order, 'order was saved');
      assert.equal(saved.payload.order.movies[0].title, 'Heat',
        'title must come from catalog, not from client');
      assert.equal(saved.payload.order.movies[0].absolutePosterPath, undefined,
        'absolutePosterPath must not leak into order');

      // Verify persisted order
      const listMsg = messages.find(m => m.type === 'orders:update');
      assert.ok(listMsg, 'orders:update received');
      const order = listMsg.payload.orders.find(o => o.id === saved.payload.order.id);
      assert.ok(order, 'order found in list');
      assert.equal(order.movies[0].title, 'Heat', 'persisted order title must be from catalog');
      assert.equal(order.movies[0].absolutePosterPath, undefined,
        'persisted order must not contain absolutePosterPath');

      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });

  it('S9: orders:save with unknown uid is dropped', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');

      const messages = [];
      await manager.connect('manager', token);
      manager.onMessage(msg => messages.push(msg));
      await sleep(500);

      manager.send({
        type: 'orders:save',
        payload: { movies: [{ uid: 'nonexistent', title: 'Ghost' }] }
      });
      await sleep(500);

      const saved = messages.find(m => m.type === 'orders:saved');
      if (saved) {
        assert.equal(saved.payload.order.movies.length, 0,
          'saved order must have 0 movies when all uids are unknown');
      }
      const err = messages.find(m => m.type === 'orders:error');
      // Either error (no valid movies) or saved with empty array
      assert.ok(saved || err, 'received either orders:saved or orders:error');
      await manager.close().catch(() => {});
    } finally {
      await server.close();
    }
  });
});

// ─── Games + orders re-hydration (real WS clients) ───────────────────────────

describe('Games + orders re-hydration (real WS clients)', () => {
  it('customer selecting a movie AND a game reaches manager with canonical data', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Games/PS4/GTA V.jpg': true,
    });
    const server = await startTestServer({
      libraryPath: lib,
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const customer = new WSClient(server.wsUrl);
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');

      // Collect messages before connecting to avoid race
      const custMsgs = [];
      const mgrMsgs = [];
      await customer.connect('customer');
      customer.onMessage(msg => custMsgs.push(msg));
      await manager.connect('manager', token);
      manager.onMessage(msg => mgrMsgs.push(msg));
      await sleep(500);

      // Select both a movie and a game, with injected fields
      customer.send({
        type: 'selection:update',
        payload: { movies: [
          { uid: '0001', title: 'INJECTED MOVIE', extra: 'x' },
          { uid: 'game:gta v', title: 'INJECTED GAME', absolutePosterPath: '/secret' },
        ] }
      });
      await sleep(500);

      const state = mgrMsgs.find(m => m.type === 'selection:state' && m.payload.movies && m.payload.movies.length > 0);
      assert.ok(state, 'manager received selection:state with items');
      assert.equal(state.payload.movies.length, 2, 'must have 2 items');

      const movie = state.payload.movies.find(m => m.uid === '0001');
      assert.ok(movie, 'movie 0001 present');
      assert.equal(movie.title, 'Heat', 'movie title from catalog');
      assert.equal(movie.extra, undefined, 'movie extra field stripped');
      assert.equal(movie.absolutePosterPath, undefined, 'movie absolutePosterPath stripped');

      const game = state.payload.movies.find(m => m.uid === 'game:gta v');
      assert.ok(game, 'game present');
      assert.equal(game.title, 'GTA V', 'game title from catalog');
      assert.equal(game.absolutePosterPath, undefined, 'game absolutePosterPath stripped');

      await customer.close().catch(() => {});
      await manager.close().catch(() => {});
    } finally {
      await server.close();
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    }
  });

  it('orders:save re-hydrates both movies and games', async () => {
    const { WSClient } = require('../helpers/ws-client');
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Games/PS4/GTA V.jpg': true,
    });
    const server = await startTestServer({
      libraryPath: lib,
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const manager = new WSClient(server.wsUrl);
      const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');

      const msgs = [];
      await manager.connect('manager', token);
      manager.onMessage(msg => msgs.push(msg));
      await sleep(500);

      manager.send({
        type: 'orders:save',
        payload: { movies: [
          { uid: '0001', title: 'FAKE MOVIE', injected: true },
          { uid: 'game:gta v', title: 'FAKE GAME', absolutePosterPath: '/hack' },
          { uid: 'unknown-uid', title: 'GHOST' },
        ] }
      });
      await sleep(500);

      const saved = msgs.find(m => m.type === 'orders:saved');
      assert.ok(saved, 'orders:saved received');
      const orderMovies = saved.payload.order.movies;
      assert.equal(orderMovies.length, 2, 'only 2 valid uids survive');

      const m = orderMovies.find(o => o.uid === '0001');
      assert.ok(m, 'movie present');
      assert.equal(m.title, 'Heat', 'movie title from catalog');
      assert.equal(m.injected, undefined, 'injected field stripped');

      const g = orderMovies.find(o => o.uid === 'game:gta v');
      assert.ok(g, 'game present');
      assert.equal(g.title, 'GTA V', 'game title from catalog');
      assert.equal(g.absolutePosterPath, undefined, 'game absolutePosterPath stripped');

      await manager.close().catch(() => {});
    } finally {
      await server.close();
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    }
  });
});

// ─── Persian + awkward name tests ─────────────────────────────────────────────

describe('Persian and awkward name tests', () => {
  it('movie-creator creates movie in genre دوبله فارسی with Persian title', async () => {
    const base = path.join(os.tmpdir(), 'persian-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'دوبله فارسی'), { recursive: true });
    fs.mkdirSync(path.join(base, 'data'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'فیلم\u200Cهای آخر هفته', type: 'Movie', year: 2020, genres: ['دوبله فارسی'] },
      JPEG, 'jpg'
    );

    assert.ok(result.id, 'movie has an id');
    assert.equal(result.title, 'فیلم\u200Cهای آخر هفته');

    // Check the file on disk
    const genreDir = path.join(lib, 'Movies', 'دوبله فارسی');
    const files = fs.readdirSync(genreDir);
    const match = files.find(f => f.includes('فیلم'));
    assert.ok(match, `Persian file created in دوبله فارسی folder (files: ${files.join(', ')})`);
    assert.ok(match.endsWith('.jpg'), 'file has .jpg extension');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('movie-creator creates movie with apostrophe in title', async () => {
    const base = path.join(os.tmpdir(), 'apostrophe-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(base, 'data'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: "Ocean's Twelve", type: 'Movie', year: 2004, genres: ['Action'] },
      JPEG, 'jpg'
    );

    assert.ok(result.id, 'has id');
    const files = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const match = files.find(f => f.includes("Ocean"));
    assert.ok(match, 'file created with apostrophe');
    assert.ok(match.includes("Ocean's Twelve"), `filename contains apostrophe (${match})`);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('movie-creator creates movie with & and parentheses in title', async () => {
    const base = path.join(os.tmpdir(), 'special-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(base, 'data'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'Tom & Jerry (2021)', type: 'Movie', year: 2021, genres: ['Action'] },
      JPEG, 'jpg'
    );

    assert.ok(result.id, 'has id');
    const files = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const match = files.find(f => f.includes('Tom'));
    assert.ok(match, 'file created');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── ARCH-01: single version source ─────────────────────────────────────────

describe('ARCH-01 — single version source', () => {
  it('ARCH-01: hardcoded version strings in source files must match package.json', () => {
    const root = path.join(__dirname, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.version, 'precondition: package.json has version field');
    const pkgVersion = pkg.version;

    const filesToSearch = ['server.js'];
    const searchDirs = ['js', 'backend', 'server'];
    const literalFiles = ['index.html', 'Start.bat', 'install.bat'];

    for (const f of literalFiles) {
      const fp = path.join(root, f);
      if (fs.existsSync(fp)) filesToSearch.push(f);
    }
    for (const dir of searchDirs) {
      const dirPath = path.join(root, dir);
      if (fs.existsSync(dirPath)) {
        const walk = (d) => {
          for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const rel = path.join(dir, entry.name);
            if (entry.isFile() && /\.(js|html|bat|json|css)$/.test(entry.name)) {
              filesToSearch.push(rel);
            } else if (entry.isDirectory()) {
              walk(path.join(d, entry.name));
            }
          }
        };
        walk(dirPath);
      }
    }

    for (const rel of filesToSearch) {
      const fp = path.join(root, rel);
      if (!fs.existsSync(fp)) continue;
      const src = fs.readFileSync(fp, 'utf8');
      const matches = src.match(/(?:v?|version['":\s]*['"]?)(\d+\.\d+\.\d+)/g) || [];
      for (const m of matches) {
        const vMatch = m.match(/(\d+\.\d+\.\d+)/);
        if (vMatch) {
          assert.equal(vMatch[1], pkgVersion,
            `hardcoded version "${vMatch[1]}" in ${rel} must match package.json "${pkgVersion}"`);
        }
      }
    }
  });

  it('ARCH-01: /api/movies meta.version must match package.json version', async () => {
    const root = path.join(__dirname, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.version, 'precondition: package.json has version field');

    const lib = path.join(os.tmpdir(), 'arch01-api-' + Date.now());
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    const server = await startTestServer({ libraryPath: lib });
    try {
      const res = await getJSON(server.baseUrl, '/api/movies');
      assert.equal(res.status, 200, 'precondition: /api/movies returns 200');
      assert.ok(res.json.meta, 'precondition: response has meta');
      assert.equal(res.json.meta.version, pkg.version,
        `/api/movies meta.version "${res.json.meta.version}" must match package.json "${pkg.version}"`);
    } finally {
      await server.close();
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    }
  });
});

// ─── SEC-04 guard: unescaped ${ in innerHTML ────────────────────────────────

describe('SEC-04 guard — no unescaped template interpolation in innerHTML', () => {
  it('scans js/**/*.js for raw ${ inside innerHTML assignments', () => {
    const jsDir = path.join(__dirname, '..', '..', 'js');
    const files = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (entry.name.endsWith('.js')) files.push(full);
      }
    }
    walk(jsDir);

    const violations = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match innerHTML = `...${...}...` or .innerHTML += `...${...}...`
        // Allow lines that use html`` tagged template or esc() or are in html.js itself
        if (file.includes('html.js')) continue;
        if (/\binnerHTML\s*(?:\+?=)\s*`/.test(line)) {
          // Check if the template uses html tagged template (imported from html.js)
          // If the file imports html from html.js and uses html`` tagged template, the ${ is safe
          const hasHtmlImport = /from\s+['"].*html\.js['"]/.test(content) || /import.*html.*from/.test(content);
          if (hasHtmlImport) continue;
          // Check if the line has ${ that is NOT inside esc() or html``
          const templateMatch = line.match(/innerHTML\s*(?:\+?=)\s*`([^`]*)`/);
          if (templateMatch && /\$\{/.test(templateMatch[1])) {
            violations.push(`${path.relative(jsDir, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
          }
        }
      }
    }
    assert.equal(violations.length, 0,
      `Found unescaped $\${} in innerHTML templates (use html\`\` or esc()):\n${violations.join('\n')}`);
  });
});
