'use strict';
/**
 * P8c G6 — cached /api/movies + /api/games payloads.
 *
 * Unit tests for PayloadCache, then HTTP tests against a real server on
 * temp dirs: stable ETag (the pre-P8c bug stamped lastUpdated per request),
 * 304 on If-None-Match, gzip via built-in zlib, Vary, and invalidation
 * after a mutation.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const zlib = require('zlib');

const PayloadCache = require('../../backend/payload-cache');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

async function until(fn, timeoutMs, everyMs) {
  const deadline = Date.now() + (timeoutMs || 1000);
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, everyMs || 20));
  }
}

/** Raw HTTP GET — no decompression so gzip wire bytes stay honest. */
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

describe('PayloadCache (unit)', () => {
  it('builds once, keeps a stable quoted-sha1 ETag across getEntry calls', () => {
    let n = 0;
    const cache = new PayloadCache(() => ({ n: ++n, items: [1, 2] }), { debounceMs: 5 });
    const a = cache.getEntry();
    const b = cache.getEntry();
    assert.equal(a, b, 'same entry object until invalidated');
    assert.equal(cache.buildCount, 1);
    assert.match(a.etag, /^"[0-9a-f]{40}"$/);
    assert.equal(JSON.parse(a.body.toString('utf8')).n, 1);
    cache.dispose();
  });

  it('invalidate debounces bursts into one rebuild; ETag changes with content', async () => {
    let n = 0;
    const cache = new PayloadCache(() => ({ n: ++n }), { debounceMs: 10 });
    cache.getEntry();
    const etag1 = cache.getEntry().etag;
    cache.invalidate();
    cache.invalidate();
    cache.invalidate();
    assert.equal(cache.buildCount, 1, 'burst coalesced');
    assert.ok(await until(() => cache.buildCount === 2, 1000), 'debounced rebuild ran');
    assert.notEqual(cache.getEntry().etag, etag1, 'new content → new ETag');
    cache.dispose();
  });

  it('getEntry rebuilds synchronously when dirty (lazy request path)', () => {
    let n = 0;
    const cache = new PayloadCache(() => ({ n: ++n }), { debounceMs: 5000 });
    const first = cache.getEntry();
    cache.invalidate();
    const second = cache.getEntry();
    assert.notEqual(second.etag, first.etag);
    assert.equal(cache.buildCount, 2);
    cache.dispose();
  });

  it('produces a gunzippable copy equal to the raw body', async () => {
    const cache = new PayloadCache(() => ({ hello: 'دنیا' }), { debounceMs: 5 });
    const entry = cache.getEntry();
    assert.ok(await until(() => entry.gzip != null, 2000), 'async gzip lands');
    assert.deepEqual(zlib.gunzipSync(entry.gzip), entry.body);
    cache.dispose();
  });

  it('dispose cancels the pending rebuild', async () => {
    let n = 0;
    const cache = new PayloadCache(() => ({ n: ++n }), { debounceMs: 10 });
    cache.getEntry();
    cache.invalidate();
    cache.dispose();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(cache.buildCount, 1, 'no rebuild after dispose');
  });
});

describe('GET /api/movies + /api/games payload caching (P8c G6)', () => {
  it('ETag + Vary + 304 + gzip; ETag stays stable across repeated requests', async () => {
    const srv = await startTestServer({
      tree: { 'Movies/Action/0001- First 2001.jpg': null }
    });
    try {
      const plain = await httpGet(srv.baseUrl, '/api/movies');
      assert.equal(plain.status, 200);
      assert.ok(plain.headers.etag, 'ETag present');
      assert.match(plain.headers.etag, /^"[0-9a-f]{40}"$/);
      assert.equal(plain.headers.vary, 'Accept-Encoding');
      const body = JSON.parse(plain.body.toString('utf8'));
      assert.equal(body.meta.scanning, false, 'startTestServer awaits reconcile');
      assert.equal(body.meta.totalMovies, 1);
      assert.equal(body.movies.length, 1);

      // The old bug: meta.lastUpdated changed every second → ETag never
      // matched. Repeat requests must return the SAME ETag.
      const again = await httpGet(srv.baseUrl, '/api/movies');
      assert.equal(again.headers.etag, plain.headers.etag, 'ETag stable');

      const cond = await httpGet(srv.baseUrl, '/api/movies', { 'If-None-Match': plain.headers.etag });
      assert.equal(cond.status, 304, 'If-None-Match → 304');
      assert.equal(cond.body.length, 0, '304 has no body');

      let gz = null;
      assert.ok(await until(async () => {
        gz = await httpGet(srv.baseUrl, '/api/movies', { 'Accept-Encoding': 'gzip' });
        return gz.headers['content-encoding'] === 'gzip';
      }, 2000, 25), 'gzip lands (async warm-up after rebuild)');
      const inflated = JSON.parse(zlib.gunzipSync(gz.body).toString('utf8'));
      assert.equal(inflated.meta.totalMovies, 1);

      // Games: same caching contract, no meta.scanning on that payload.
      const games = await httpGet(srv.baseUrl, '/api/games');
      assert.equal(games.status, 200);
      assert.ok(games.headers.etag, 'games ETag present');
      assert.equal(games.headers.vary, 'Accept-Encoding');
      const gamesCond = await httpGet(srv.baseUrl, '/api/games', { 'If-None-Match': games.headers.etag });
      assert.equal(gamesCond.status, 304, 'games If-None-Match → 304');
    } finally {
      await srv.close();
    }
  });

  it('a successful mutation changes the ETag and the served data', async () => {
    const srv = await startTestServer({
      tree: { 'Movies/Action/0001- First 2001.jpg': null },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(srv.baseUrl);
      assert.ok(token, 'admin token');
      const before = await httpGet(srv.baseUrl, '/api/movies');

      const edit = await httpSend(srv.baseUrl, '/api/movies/0001', 'PUT', token, { title: 'Edited Title' });
      assert.equal(edit.status, 200, edit.body.toString('utf8'));

      // Invalidation is debounced (100 ms) — poll until the payload rebuilt.
      assert.ok(await until(async () => {
        const res = await httpGet(srv.baseUrl, '/api/movies');
        return res.headers.etag !== before.headers.etag;
      }, 2000, 25), 'ETag changed after mutation');

      const after = await httpGet(srv.baseUrl, '/api/movies');
      const movies = JSON.parse(after.body.toString('utf8')).movies;
      assert.equal(movies[0].title, 'Edited Title', 'new payload serves the edit');
    } finally {
      await srv.close();
    }
  });
});
