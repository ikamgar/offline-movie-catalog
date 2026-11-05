'use strict';
/**
 * P8c G6 + follow-up — HTTP-level ETag coverage for the payload caches.
 *
 * /api/movies and /api/games carry a stable quoted-sha1 ETag: plain GETs
 * and read-only ops keep it; every catalog mutation (create, title edit,
 * metadata edit, genre edit, poster ?v, delete, restore, game create/title
 * edit/platform edit/poster edit/delete/restore, games rescan, external
 * watcher file event) changes it.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

const ADMIN = { username: 'admin', password: 'testadmin123456' };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const POSTER_B64 = JPEG.toString('base64');

const TREE = {
  'Movies/Action/0001- First Movie 2001.jpg': null,
  'Movies/Drama/0002- Second Movie 2002.jpg': null
};

function request(baseUrl, pathname, opts) {
  const { method = 'GET', token, payload } = opts || {};
  const data = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const headers = { 'Content-Length': Buffer.byteLength(data) };
    if (payload) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        etag: res.headers.etag || null,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function etagOf(baseUrl, pathname, token) {
  const res = await request(baseUrl, pathname, { token });
  assert.equal(res.status, 200, res.body.slice(0, 200));
  assert.ok(res.etag, `ETag header present on ${pathname}`);
  return res.etag;
}

/** Assert the endpoint's ETag moved after an op (returns the new ETag). */
async function assertMoved(baseUrl, pathname, prevEtag, label, token) {
  const next = await etagOf(baseUrl, pathname, token);
  assert.notEqual(next, prevEtag, `ETag changed: ${label}`);
  return next;
}

/** Poll until the ETag differs (external watcher events need the debounce). */
async function waitForMovedEtag(baseUrl, pathname, prevEtag, label, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  for (;;) {
    const res = await request(baseUrl, pathname);
    if (res.status === 200 && res.etag && res.etag !== prevEtag) return res.etag;
    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for ETag to change: ${label} (still ${prevEtag})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('P8c G6 — payload ETag coverage over the admin surface', () => {
  it('plain GETs keep the ETag; every catalog mutation and watcher event moves it', async () => {
    const srv = await startTestServer({ tree: TREE, admin: ADMIN });
    try {
      const token = await loginAsAdmin(srv.baseUrl, ADMIN.username, ADMIN.password);
      assert.ok(token, 'admin token');
      const MOVIES = '/api/movies';
      const GAMES = '/api/games';

      // 1. Stable under plain reads
      const e0 = await etagOf(srv.baseUrl, MOVIES);
      assert.equal(await etagOf(srv.baseUrl, MOVIES), e0, 'plain GETs do not change the ETag');

      // 2. Read-only preview must not move it
      const prev = await request(srv.baseUrl, '/api/movies/preview', {
        method: 'POST', token, payload: { type: 'Movie', title: 'Preview Only', year: 2020 }
      });
      assert.equal(prev.status, 200, prev.body.slice(0, 200));
      assert.equal(await etagOf(srv.baseUrl, MOVIES), e0, 'preview is read-only');

      // 3. Create
      const created = await request(srv.baseUrl, MOVIES, {
        method: 'POST', token,
        payload: { title: 'Third Movie', type: 'Movie', year: 2003, genres: ['Action'], poster: POSTER_B64 }
      });
      assert.equal(created.status, 200, created.body.slice(0, 200));
      const uid3 = JSON.parse(created.body).movie.uid;
      let e = await assertMoved(srv.baseUrl, MOVIES, e0, 'movie create', token);

      // 4. Title edit (renames files → also re-keys the index maps)
      const titleEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(uid3)}`, {
        method: 'PUT', token, payload: { title: 'Third Movie Renamed' }
      });
      assert.equal(titleEdit.status, 200, titleEdit.body.slice(0, 200));
      e = await assertMoved(srv.baseUrl, MOVIES, e, 'title edit', token);

      // 5. Metadata-only edit — no file event will ever fire for this
      const metaEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(uid3)}`, {
        method: 'PUT', token, payload: { imdbRating: '7.5', plotSummary: 'A plot.' }
      });
      assert.equal(metaEdit.status, 200, metaEdit.body.slice(0, 200));
      e = await assertMoved(srv.baseUrl, MOVIES, e, 'metadata-only edit', token);

      // 6. Genre edit — adds a Drama copy (new file, new poster ?v)
      const genreEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(uid3)}`, {
        method: 'PUT', token, payload: { genres: ['Action', 'Drama'] }
      });
      assert.equal(genreEdit.status, 200, genreEdit.body.slice(0, 200));
      const genreBody = JSON.parse(genreEdit.body);
      assert.ok(
        /\?v=\d+/.test(genreBody.movie.poster || ''),
        `poster URL carries ?v after genre copy (got ${genreBody.movie && genreBody.movie.poster})`
      );
      e = await assertMoved(srv.baseUrl, MOVIES, e, 'genre edit + poster ?v', token);

      // 7. Delete (soft) → trash
      const del = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(uid3)}`, {
        method: 'DELETE', token
      });
      assert.equal(del.status, 200, del.body.slice(0, 200));
      const trashId = JSON.parse(del.body).id;
      assert.ok(trashId, 'delete returns the trash id');
      e = await assertMoved(srv.baseUrl, MOVIES, e, 'delete', token);

      // 8. Restore from trash
      const restored = await request(srv.baseUrl, `/api/trash/${encodeURIComponent(trashId)}/restore`, {
        method: 'POST', token
      });
      assert.equal(restored.status, 200, restored.body.slice(0, 200));
      await assertMoved(srv.baseUrl, MOVIES, e, 'trash restore', token);

      // 9. Games: create
      let g = await etagOf(srv.baseUrl, GAMES);
      const gameCreate = await request(srv.baseUrl, GAMES, {
        method: 'POST', token,
        payload: { title: 'ETag Game', platforms: ['PS4'], poster: POSTER_B64 }
      });
      assert.equal(gameCreate.status, 200, gameCreate.body.slice(0, 200));
      const gameUid = JSON.parse(gameCreate.body).game.uid;
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game create', token);

      // 10. Game edit (same by-uid route, game: dispatch) — the rename
      //     re-keys the uid, so step 11 must use the NEW one.
      const gameEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(gameUid)}`, {
        method: 'PUT', token, payload: { title: 'ETag Game 2' }
      });
      assert.equal(gameEdit.status, 200, gameEdit.body.slice(0, 200));
      const gameUid2 = JSON.parse(gameEdit.body).game.uid;
      assert.notEqual(gameUid2, gameUid, 'game rename re-keys the uid');
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game edit', token);

      // 11. Game platform edit — drops the PS4 copy, adds a PS5 one (F3 leg)
      const platEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(gameUid2)}`, {
        method: 'PUT', token, payload: { platforms: ['PS5'] }
      });
      assert.equal(platEdit.status, 200, platEdit.body.slice(0, 200));
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game platform edit', token);

      // 12. Game poster edit — rewrites every target copy in place
      const posterEdit = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(gameUid2)}`, {
        method: 'PUT', token, payload: { poster: POSTER_B64 }
      });
      assert.equal(posterEdit.status, 200, posterEdit.body.slice(0, 200));
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game poster edit', token);

      // 13. Game delete → trash
      const gameDel = await request(srv.baseUrl, `/api/movies/by-uid/${encodeURIComponent(gameUid2)}`, {
        method: 'DELETE', token
      });
      assert.equal(gameDel.status, 200, gameDel.body.slice(0, 200));
      const gameTrashId = JSON.parse(gameDel.body).id;
      assert.ok(gameTrashId, 'game delete returns the trash id');
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game delete', token);

      // 14. Game restore from trash (rescans Games/ from disk)
      const gameRestore = await request(srv.baseUrl, `/api/trash/${encodeURIComponent(gameTrashId)}/restore`, {
        method: 'POST', token
      });
      assert.equal(gameRestore.status, 200, gameRestore.body.slice(0, 200));
      g = await assertMoved(srv.baseUrl, GAMES, g, 'game restore', token);

      // 15. Games rescan (rebuild stamps a fresh lastUpdated even with no diff)
      const rescan = await request(srv.baseUrl, '/api/games/rescan', { method: 'POST', token });
      assert.equal(rescan.status, 200, rescan.body.slice(0, 200));
      await assertMoved(srv.baseUrl, GAMES, g, 'games rescan', token);

      // 16. External watcher event: a new poster file lands on disk.
      //     Baseline AFTER the rescan settles — /api/games/rescan invalidates
      //     both payloads, so a stale baseline would match that rebuild.
      const eBeforeWatch = await etagOf(srv.baseUrl, MOVIES);
      const extra = path.join(srv.libraryPath, 'Movies', 'Action', '0009- Watcher Movie 2009.jpg');
      fs.writeFileSync(extra, JPEG);
      await waitForMovedEtag(srv.baseUrl, MOVIES, eBeforeWatch, 'watcher file add');

      // 17. External watcher event for games: a new game poster lands on disk.
      //     Watcher debounce rebuilds and indexer.onChange invalidates games payload.
      const gBeforeWatch = await etagOf(srv.baseUrl, GAMES, token);
      const gameDir = path.join(srv.libraryPath, 'Games', 'PS4');
      fs.mkdirSync(gameDir, { recursive: true });
      const extraGame = path.join(gameDir, 'Watcher Game.jpg');
      fs.writeFileSync(extraGame, JPEG);
      await waitForMovedEtag(srv.baseUrl, GAMES, gBeforeWatch, 'watcher game add');
    } finally {
      await srv.close();
    }
  });
});
