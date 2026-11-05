'use strict';

/**
 * F28 — the 100 KB body guard (SEC-06 / FE-13) must exempt every REGISTERED
 * route that carries a base64 poster, decided by ONE shared definition inside
 * server.js: POST /api/movies, POST /api/games and PUT /api/movies/* may all
 * carry a poster; POST /api/movies/preview stays guarded (no poster field).
 *
 * Before the fix the exemption list was hard-coded in the middleware and
 * missed POST /api/games, so a >100KB game poster got "Request body too large"
 * (audit P9-R §F28 / docs/audit/AUDIT-P9b.md M1: 300 KB POST /api/games → 413).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');
const serverModule = require('../../server');

/** JPEG magic + ~300 KB filler — passes the magic-byte sniff (FE-13 style). */
const BIG_POSTER = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(300 * 1024, 0x41)
]);

/** >8MB decoded payload — trips decodePosterPayload's own cap (S6 style).
 * 9,000,000 bytes: base64 ≈11.4MB stays under the 12mb parser limit, so the
 * structured IMG_TOO_LARGE decoder answer is what both routes must agree on. */
const HUGE_POSTER = Buffer.alloc(9 * 1000 * 1000);
HUGE_POSTER[0] = 0x89; HUGE_POSTER[1] = 0x50; HUGE_POSTER[2] = 0x4e; HUGE_POSTER[3] = 0x47;

function request(baseUrl, method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const req = http.request(url, {
      method,
      headers: headers || {}
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

/** POST JSON with an explicit Content-Length (the guard is CL-based). */
function postJson(server, urlPath, bodyObj, headers) {
  const body = JSON.stringify(bodyObj);
  return request(server.baseUrl, 'POST', urlPath, {
    'Content-Type': 'application/json',
    ...headers,
    'Content-Length': String(Buffer.byteLength(body))
  }, body);
}

describe('F28 — poster-carrying routes share ONE body-guard exemption', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: { 'Movies/Action/placeholder.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  const authHeaders = async () => {
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    return { 'Authorization': `Bearer ${token}` };
  };

  it('exempts POST /api/games: a >100KB poster creates the game and the poster is served', async () => {
    const headers = await authHeaders();
    const poster = 'data:image/jpeg;base64,' + BIG_POSTER.toString('base64');
    const body = { title: 'Fat Game', platforms: ['PS4'], poster };
    assert.ok(body.poster.length > 100 * 1024,
      `payload must exceed 100KB to prove the exemption: ${BIG_POSTER.length}`);

    const res = await postJson(server, '/api/games', body, headers);
    const why = JSON.stringify(res.json || res.raw);
    assert.equal(res.status, 200, `guard must not 413 game create: ${why}`);
    assert.equal(res.json.success, true, why);
    assert.equal(res.json.game.title, 'Fat Game', why);

    const served = await request(server.baseUrl, 'GET', res.json.game.poster);
    assert.equal(served.status, 200, `created poster must be served: ${res.json.game.poster}`);
    assert.ok(String(served.headers['content-type'] || '').startsWith('image/'),
      `content-type should be an image: ${served.headers['content-type']}`);
  });

  it('keeps POST /api/movies exempt at the same payload size (control)', async () => {
    const headers = await authHeaders();
    const poster = 'data:image/jpeg;base64,' + BIG_POSTER.toString('base64');
    const res = await postJson(server, '/api/movies', {
      title: 'Fat Movie', type: 'Movie', year: 2019,
      genres: ['Action'], id: '9906', poster
    }, headers);
    assert.equal(res.status, 200, JSON.stringify(res.json || res.raw));
    assert.equal(res.json.success, true);

    const served = await request(server.baseUrl, 'GET', res.json.movie.poster);
    assert.equal(served.status, 200, 'movie poster must be served');
  });

  it('same structured 413 for a >8MB poster on BOTH create routes (parity)', async () => {
    const headers = await authHeaders();
    const poster = 'data:image/png;base64,' + HUGE_POSTER.toString('base64');

    const movieRes = await postJson(server, '/api/movies', {
      title: 'Huge Movie', type: 'Movie', year: 2019, genres: [], id: '9907', poster
    }, headers);
    const gameRes = await postJson(server, '/api/games', {
      title: 'Huge Game', platforms: ['PS4'], poster
    }, headers);

    assert.equal(movieRes.status, 413, JSON.stringify(movieRes.json || movieRes.raw));
    assert.equal(gameRes.status, 413, JSON.stringify(gameRes.json || gameRes.raw));
    assert.equal(movieRes.json.code, 'IMG_TOO_LARGE');
    assert.deepEqual(gameRes.json, movieRes.json, 'game create must use the same decoder');
  });

  it('keeps POST /api/movies/preview under the guard (no poster field)', async () => {
    const headers = await authHeaders();
    const marker = 'x'.repeat(150 * 1024);
    const res = await postJson(server, '/api/movies/preview', {
      type: 'Movie', title: 'Preview', id: '0001', marker
    }, headers);
    assert.equal(res.status, 413, 'preview must stay guarded');
    assert.equal(res.json && res.json.error, 'Request body too large',
      'raw guard shape, not the poster decoder');
    assert.ok(!(res.json && res.json.code), 'no structured code expected from the guard');
  });

  it('keeps POST /api/rescan under the guard (no poster field)', async () => {
    const headers = await authHeaders();
    const marker = 'x'.repeat(150 * 1024);
    const res = await postJson(server, '/api/rescan', { marker }, headers);
    assert.equal(res.status, 413, 'rescan must stay guarded');
    assert.equal(res.json && res.json.error, 'Request body too large');
  });

  it('exemption list comes from ONE source of truth in server.js (enumeration)', () => {
    const { POSTER_BODY_ROUTES, routeCarriesPosterBody } = serverModule;
    assert.ok(Array.isArray(POSTER_BODY_ROUTES), 'POSTER_BODY_ROUTES must be exported');
    assert.equal(typeof routeCarriesPosterBody, 'function', 'routeCarriesPosterBody must be exported');

    // Re-derive the poster-carrying registrations from the source itself and
    // require the exported matcher to agree with every one of them.
    const src = fs.readFileSync(require.resolve('../../server'), 'utf8');
    const routeRe = /app\.(post|put|get|delete)\(\s*'([^']+)'/g;
    const methods = { post: 'POST', put: 'PUT', get: 'GET', delete: 'DELETE' };
    const regs = [];
    let m;
    let starts = [];
    while ((m = routeRe.exec(src))) starts.push({ i: m.index, method: methods[m[1]], path: m[2] });
    for (let i = 0; i < starts.length; i++) {
      const span = src.slice(starts[i].i, i + 1 < starts.length ? starts[i + 1].i : src.length);
      const carries = /decodePosterPayload\(/.test(span) || /decodePosterOption\(/.test(span);
      regs.push({ ...starts[i], carries });
    }

    const carrying = regs.filter((r) => r.carries);
    assert.deepEqual(
      carrying.map((r) => `${r.method} ${r.path}`).sort(),
      [
        'POST /api/games',
        'POST /api/movies',
        'PUT /api/movies/:id',
        'PUT /api/movies/by-uid/:uid'
      ],
      'exactly the four registered poster-carrying routes expected'
    );

    for (const r of carrying) {
      assert.equal(
        routeCarriesPosterBody(r.method, r.path), true,
        `matcher must exempt the poster route ${r.method} ${r.path}`
      );
    }

    // Guarded routes remain guarded (as asserted behaviourally above)
    for (const [method, p] of [
      ['POST', '/api/movies/preview'],
      ['POST', '/api/rescan'],
      ['POST', '/api/trash/x/restore'],
      ['GET', '/api/movies'],
      ['DELETE', '/api/movies/by-uid/0001']
    ]) {
      assert.equal(
        routeCarriesPosterBody(method, p), false,
        `${method} ${p} must stay under the 100KB guard`
      );
    }
  });
});
