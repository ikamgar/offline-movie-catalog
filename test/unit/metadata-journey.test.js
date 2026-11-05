'use strict';

/**
 * F41 / DATA-10 — manager metadata (imdbRating, plotSummary) must survive the
 * FULL production journey with the exact same key at every step:
 *
 *   PUT edit → row shows values → REAL restart (new createServer, same dirs)
 *   → values still there → POST /api/rescan → values still there
 *   → watcher delete + re-add of the poster file → values still there,
 *   with data/metadata.json holding exactly ONE key in the I6 uid format:
 *     Movie/Animation/Iranian → bare id string ("0001")
 *     Series                  → "series:<normalised title>"
 *     Game                    → "game:<normalised title>" per I6 — but games
 *                                carry NO editor metadata (docs/audit/AUDIT-P9c.md §3), so
 *                                the store must never gain a "game:" key.
 *
 * Regression: the scan-rebuild attach passed the indexer MAP key (type:id)
 * instead of the uid (first bad commit 724b8178) — ratings/plots vanished
 * after every restart/rescan.
 *
 * Booted here with createServer directly (the test-server helper deletes its
 * temp dirs on close; a restart needs them). One `server` variable is
 * reassigned across restarts — the finally MUST close whatever is live, or
 * node --test never exits.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../../server');
const { writeAdminAuth } = require('../helpers/test-server');

const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(8 * 1024, 0x41)
]);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const settleMs = 1600; // watcher debounce (500ms) + fs poll margin, same as watcher tests

function mkDirs(tag) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `f41-${tag}-`));
  const libraryPath = path.join(base, 'Library');
  const dataDir = path.join(base, 'data');
  fs.mkdirSync(libraryPath, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  return { base, libraryPath, dataDir };
}

function seedPoster(libraryPath, rel, bytes) {
  const full = path.join(libraryPath, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
  return full;
}

async function boot(dataDir, libraryPath) {
  const srv = createServer({ port: 0, libraryPath, dataDir, quiet: true });
  await srv.start();
  await srv.whenReconciled();
  const port = srv.httpServer.address().port;
  return { srv, baseUrl: `http://localhost:${port}` };
}

/** Boot WITHOUT settling the reconcile — for the P8c scanning-window leg. */
async function bootGated(dataDir, libraryPath, gate) {
  const srv = createServer({ port: 0, libraryPath, dataDir, quiet: true, reconcileGate: gate });
  await srv.start();
  const port = srv.httpServer.address().port;
  return { srv, baseUrl: `http://localhost:${port}` };
}

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

const jsonBody = (obj) => JSON.stringify(obj);

async function login(baseUrl) {
  const res = await request(baseUrl, 'POST', '/api/auth/login', {
    'Content-Type': 'application/json'
  }, jsonBody({ username: 'admin', password: 'testadmin123456' }));
  assert.equal(res.status, 200, JSON.stringify(res.json || res.raw));
  assert.ok(res.json.token, 'login token');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${res.json.token}` };
}

async function getMovieRow(baseUrl, uid) {
  const res = await request(baseUrl, 'GET', '/api/movies');
  const data = JSON.parse(res.raw);
  return data.movies.find((m) => m.uid === uid) ||
    data.movies.find((m) => m.id === uid) || null;
}

function readMetaKeys(dataDir) {
  const metaPath = path.join(dataDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return Object.keys(parsed.items || {});
}

describe('F41/DATA-10 — metadata keys survive the full journey', () => {
  it('Movie: edit → restart → rescan → watcher re-add, key stays "0001"', async () => {
    const { base, libraryPath, dataDir } = mkDirs('movie');
    let server = null;
    try {
      const file = seedPoster(libraryPath, 'Movies/Action/0001- Heat 1995.jpg', JPEG_BYTES);
      writeAdminAuth(dataDir, 'admin', 'testadmin123456');

      // 1) First boot: PUT on by-uid + live row
      server = await boot(dataDir, libraryPath);
      const headers = await login(server.baseUrl);

      const put = await request(server.baseUrl, 'PUT', '/api/movies/by-uid/0001', headers,
        jsonBody({ imdbRating: 8.4, plotSummary: 'A heist thriller.' }));
      assert.equal(put.status, 200, JSON.stringify(put.json || put.raw));

      const row1 = await getMovieRow(server.baseUrl, '0001');
      assert.ok(row1, 'movie row exists');
      assert.equal(row1.imdbRating, 8.4, 'rating live after edit');
      assert.equal(row1.plotSummary, 'A heist thriller.');

      // Key format on disk for a Movie: bare id string
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['0001'], 'single uid key after edit');

      // 2) REAL restart (new server instance, same dirs — F41 red at HEAD)
      await server.srv.stop();
      server = await boot(dataDir, libraryPath);
      const row2 = await getMovieRow(server.baseUrl, '0001');
      assert.ok(row2, 'movie row exists after restart');
      assert.equal(row2.imdbRating, 8.4, 'F41: rating survives restart');
      assert.equal(row2.plotSummary, 'A heist thriller.', 'F41: plot survives restart');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['0001'], 'no duplicate keys after restart');

      // 3) Full rescan on the restarted server
      const rescan = await request(server.baseUrl, 'POST', '/api/rescan',
        { 'Authorization': headers.Authorization }, '{}');
      assert.equal(rescan.status, 200, JSON.stringify(rescan.json || rescan.raw));
      const row3 = await getMovieRow(server.baseUrl, '0001');
      assert.equal(row3 && row3.imdbRating, 8.4, 'F41: rating survives rescan');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['0001'], 'no duplicate keys after rescan');

      // 4) Watcher: delete + re-add the poster file
      fs.rmSync(file);
      await sleep(settleMs);
      const rowGone = await getMovieRow(server.baseUrl, '0001');
      assert.ok(!rowGone, 'row lost after delete (reconcile happened)');
      fs.writeFileSync(file, JPEG_BYTES);
      await sleep(settleMs);
      const row4 = await getMovieRow(server.baseUrl, '0001');
      assert.ok(row4, 'row re-added');
      assert.equal(row4.imdbRating, 8.4, 'F41: rating survives re-add');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['0001'], 'single key after re-add');
    } finally {
      if (server) await server.srv.stop().catch(() => {});
      try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('Movie: metadata is already in the boot cache serve (P8c scanning window)', async () => {
    const { base, libraryPath, dataDir } = mkDirs('movie-win');
    let server = null;
    try {
      seedPoster(libraryPath, 'Movies/Action/0001- Heat 1995.jpg', JPEG_BYTES);
      writeAdminAuth(dataDir, 'admin', 'testadmin123456');

      // Boot + PUT the metadata (one settled cycle, like a previous run)
      server = await boot(dataDir, libraryPath);
      const headers = await login(server.baseUrl);
      const put = await request(server.baseUrl, 'PUT', '/api/movies/by-uid/0001', headers,
        jsonBody({ imdbRating: 8.4, plotSummary: 'A heist thriller.' }));
      assert.equal(put.status, 200, JSON.stringify(put.json || put.raw));
      await server.srv.stop();
      server = null;

      // Restart with the reconcile HELD: /api/movies serves the pre-swap
      // cache rows loaded from catalog.json STILL ATTACHED to the store.
      let release;
      const gate = new Promise((r) => { release = r; });
      server = await bootGated(dataDir, libraryPath, gate);
      const windowRow = await getMovieRow(server.baseUrl, '0001');
      assert.ok(windowRow, 'row present in the scanning window');
      assert.equal(windowRow.imdbRating, 8.4,
        'F41: cached-catalog rows carry the store metadata before the swap');
      assert.equal(windowRow.plotSummary, 'A heist thriller.');
      release();
      await server.srv.whenReconciled();
      const settledRow = await getMovieRow(server.baseUrl, '0001');
      assert.equal(settledRow && settledRow.imdbRating, 8.4,
        'F41: still there after the swap');
    } finally {
      if (server) await server.srv.stop().catch(() => {});
      try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('Series: edit → restart → rescan → watcher re-add, key stays "series:breaking bad"', async () => {
    const { base, libraryPath, dataDir } = mkDirs('series');
    let server = null;
    const uid = encodeURIComponent('series:breaking bad');
    try {
      const file = seedPoster(libraryPath, 'Series/Breaking Bad.jpg', JPEG_BYTES);
      writeAdminAuth(dataDir, 'admin', 'testadmin123456');

      server = await boot(dataDir, libraryPath);
      const headers = await login(server.baseUrl);

      const put = await request(server.baseUrl, 'PUT', `/api/movies/by-uid/${uid}`, headers,
        jsonBody({ imdbRating: 9.4, plotSummary: 'Chemistry drama.' }));
      assert.equal(put.status, 200, JSON.stringify(put.json || put.raw));

      const row1 = await getMovieRow(server.baseUrl, 'series:breaking bad');
      assert.ok(row1, 'series row exists');
      assert.equal(row1.imdbRating, 9.4, 'rating live after edit');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['series:breaking bad'],
        'single series key after edit');

      // 2) restart — F41 red at HEAD (map key "breaking bad" misses the store)
      await server.srv.stop();
      server = await boot(dataDir, libraryPath);
      const row2 = await getMovieRow(server.baseUrl, 'series:breaking bad');
      assert.ok(row2, 'series row exists after restart');
      assert.equal(row2.imdbRating, 9.4, 'F41: series rating survives restart');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['series:breaking bad'],
        'no alternate series key after restart');

      // 3) rescan
      const rescan = await request(server.baseUrl, 'POST', '/api/rescan',
        { 'Authorization': headers.Authorization }, '{}');
      assert.equal(rescan.status, 200, JSON.stringify(rescan.json || rescan.raw));
      const row3 = await getMovieRow(server.baseUrl, 'series:breaking bad');
      assert.equal(row3 && row3.imdbRating, 9.4, 'F41: series rating survives rescan');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['series:breaking bad'],
        'no alternate series key after rescan');

      // 4) watcher re-add
      fs.rmSync(file);
      await sleep(settleMs);
      const rowGone = await getMovieRow(server.baseUrl, 'series:breaking bad');
      assert.ok(!rowGone, 'series row lost after delete');
      fs.writeFileSync(file, JPEG_BYTES);
      await sleep(settleMs);
      const row4 = await getMovieRow(server.baseUrl, 'series:breaking bad');
      assert.ok(row4, 'series row re-added');
      assert.equal(row4.imdbRating, 9.4, 'F41: series rating survives re-add');
      assert.deepEqual(readMetaKeys(dataDir).sort(), ['series:breaking bad'],
        'single series key after re-add');
    } finally {
      if (server) await server.srv.stop().catch(() => {});
      try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('Game: uid format pinned; the store never gains a "game:" key', async () => {
    const { base, libraryPath, dataDir } = mkDirs('game');
    let server = null;
    try {
      // Empty games tree — the game is created via the API below, which also
      // writes Games/PS4/Validate Game.jpg (pre-seeding it would 409).
      writeAdminAuth(dataDir, 'admin', 'testadmin123456');

      server = await boot(dataDir, libraryPath);
      const headers = await login(server.baseUrl);

      // create via API (games pipeline) — uid must use the I6 game format
      const create = await request(server.baseUrl, 'POST', '/api/games', headers,
        jsonBody({
          title: 'Validate Game', platforms: ['PS4'],
          poster: 'data:image/jpeg;base64,' + JPEG_BYTES.toString('base64')
        }));
      assert.equal(create.status, 200, JSON.stringify(create.json || create.raw));
      assert.equal(create.json.game.uid, 'game:validate game', 'I6 game uid format');
      const served = await request(server.baseUrl, 'GET', create.json.game.poster);
      assert.equal(served.status, 200, 'game poster served after create');

      assert.ok(readMetaKeys(dataDir).every((k) => !k.startsWith('game:')),
        'no game keys in metadata.json after create');

      // rename leg (game PUT) — uid follows the title, store stays clean
      const rename = await request(server.baseUrl, 'PUT',
        '/api/movies/by-uid/' + encodeURIComponent('game:validate game'), headers,
        jsonBody({ title: 'Validate Game Renamed' }));
      assert.equal(rename.status, 200, JSON.stringify(rename.json || rename.raw));
      assert.equal(rename.json.game.uid, 'game:validate game renamed', 'uid follows the title');
      assert.ok(readMetaKeys(dataDir).every((k) => !k.startsWith('game:')),
        'no game keys in metadata.json after rename');

      // restart + rescan — map rebuild must not introduce game keys either
      await server.srv.stop();
      server = await boot(dataDir, libraryPath);
      const auth2 = await login(server.baseUrl);
      const rescan = await request(server.baseUrl, 'POST', '/api/rescan',
        { 'Authorization': auth2.Authorization }, '{}');
      assert.equal(rescan.status, 200, JSON.stringify(rescan.json || rescan.raw));
      const games = JSON.parse((await request(server.baseUrl, 'GET', '/api/games')).raw);
      assert.ok(Array.isArray(games.games) &&
        games.games.some((g) => g.uid === 'game:validate game renamed'),
        'renamed game listed after rescan');
      assert.ok(readMetaKeys(dataDir).every((k) => !k.startsWith('game:')),
        'no game keys in metadata.json after rescan');

      // watcher re-add of the renamed poster file (rename PUT moved it)
      const file = path.join(libraryPath, 'Games', 'PS4', 'Validate Game Renamed.jpg');
      fs.rmSync(file);
      await sleep(settleMs);
      const gamesMid = JSON.parse((await request(server.baseUrl, 'GET', '/api/games')).raw);
      assert.ok(!gamesMid.games.some((g) => g.uid === 'game:validate game renamed'),
        'game gone after delete');
      fs.writeFileSync(file, JPEG_BYTES);
      await sleep(settleMs);
      const gamesAfter = JSON.parse((await request(server.baseUrl, 'GET', '/api/games')).raw);
      assert.ok(gamesAfter.games.some((g) => g.uid === 'game:validate game renamed'),
        'game re-added');
      assert.ok(readMetaKeys(dataDir).every((k) => !k.startsWith('game:')),
        'no game keys in metadata.json after re-add');
    } finally {
      if (server) await server.srv.stop().catch(() => {});
      try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });
});
