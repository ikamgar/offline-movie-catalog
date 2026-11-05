'use strict';
/**
 * P8b follow-up — poster replaced in place (same filename):
 *   - watcher treats a same-name overwrite as an update (newer AND older mtime)
 *   - GET /api/movies + GET /api/games expose a new `?v` after the overwrite
 *   - WS `catalog:changed {updated >= 1}` reaches clients (movies + games)
 *   - the thumbnail cache produces a NEW file (new hash) with new bytes
 *
 * Temp dirs only; never touches the real Library/ or data/.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

let sharpMod = null;
try { sharpMod = require('sharp'); } catch { sharpMod = null; }

const SKIP_NO_SHARP = `sharp unavailable (optionalDependency; needs Node >= 20.9; running ${process.version}) — thumbnail assertions skipped`;

/** Minimal CollectingClient (same pattern as ws.test.js). */
class CollectingClient {
  constructor(url) { this._url = url; this._ws = null; this._messages = []; this._waiters = new Map(); }
  connect(role, token) {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._url);
      const onOpen = () => {
        this._ws.removeListener('open', onOpen);
        this._ws.removeListener('error', onError);
        this._ws.on('message', (data) => this._onMessage(data));
        this._ws.send(JSON.stringify({ type: 'hello', payload: { role, token } }));
        resolve();
      };
      const onError = (err) => { this._ws.removeListener('open', onOpen); this._ws.removeListener('error', onError); reject(err); };
      this._ws.on('open', onOpen);
      this._ws.on('error', onError);
    });
  }
  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const waiter = this._waiters.get(msg.type);
    if (waiter) { this._waiters.delete(msg.type); waiter(msg); return; }
    this._messages.push(msg);
  }
  waitFor(type, timeoutMs) {
    const ms = timeoutMs || 8000;
    return new Promise((resolve, reject) => {
      const idx = this._messages.findIndex(m => m.type === type);
      if (idx !== -1) { const [msg] = this._messages.splice(idx, 1); resolve(msg); return; }
      const timer = setTimeout(() => { this._waiters.delete(type); reject(new Error(`Timeout waiting for ${type}`)); }, ms);
      this._waiters.set(type, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }
  close() {
    return new Promise((resolve) => {
      if (!this._ws || this._ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      this._ws.on('close', () => resolve());
      this._ws.close();
    });
  }
}

function fetchJson(baseUrl, reqPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function fetchBin(baseUrl, reqPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Poll until fn() is truthy or timeout; returns the truthy value. */
async function until(fn, timeoutMs, label) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`until(): timed out waiting for ${label}`);
}

function vParam(posterUrl) {
  const m = (posterUrl || '').match(/[?&]v=(\d+)$/);
  assert.ok(m, `poster URL must carry ?v=<mtimeMs>, got ${posterUrl}`);
  return m[1];
}

describe('P8b follow-up — poster replaced in place (same filename)', () => {
  let srv;
  let posterPath;

  before(async () => {
    srv = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    posterPath = path.join(srv.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg');
  });

  after(async () => { if (srv) await srv.close(); });

  it('movies: same-name overwrite with NEWER mtime → new ?v, new bytes, catalog:changed', async () => {
    const before1 = await fetchJson(srv.baseUrl, '/api/movies');
    const old = before1.body.movies.find((m) => m.uid === '0001');
    assert.ok(old, 'movie 0001 indexed');
    const oldV = vParam(old.poster);
    const oldBytes = await fetchBin(srv.baseUrl, old.poster);
    assert.equal(oldBytes.status, 200);

    const client = new CollectingClient(srv.wsUrl);
    await client.connect('customer');

    // Overwrite in place: different bytes, newer mtime
    const t0 = Date.now();
    fs.writeFileSync(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02, 0x03, 0x04]));
    fs.utimesSync(posterPath, new Date(t0 + 5000), new Date(t0 + 5000));

    const changed = await client.waitFor('catalog:changed', 8000);
    assert.ok(changed.payload.updated >= 1,
      `catalog:changed must report updated >= 1, got ${JSON.stringify(changed.payload)}`);
    await client.close();

    const after1 = await fetchJson(srv.baseUrl, '/api/movies');
    const fresh = after1.body.movies.find((m) => m.uid === '0001');
    const newV = vParam(fresh.poster);
    assert.notEqual(newV, oldV, `?v must change after overwrite (old ${oldV}, new ${newV})`);

    const newBytes = await fetchBin(srv.baseUrl, fresh.poster);
    assert.equal(newBytes.status, 200);
    assert.ok(newBytes.body.equals(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02, 0x03, 0x04])),
      'served bytes must be the new file content');
    assert.ok(!newBytes.body.equals(oldBytes.body), 'new bytes must differ from old');
  });

  it('movies: same-name overwrite with OLDER mtime (utimes) also refreshes ?v', async () => {
    const before2 = await fetchJson(srv.baseUrl, '/api/movies');
    const old = before2.body.movies.find((m) => m.uid === '0001');
    const oldV = vParam(old.poster);

    // Different bytes, then force an OLDER mtime than the previous one
    const older = new Date(Date.now() - 60 * 60 * 1000);
    fs.writeFileSync(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0xaa, 0xbb]));
    fs.utimesSync(posterPath, older, older);

    const client = new CollectingClient(srv.wsUrl);
    await client.connect('customer');
    // Touch again so the watcher debounce fires after the client is connected
    const touched = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0xaa, 0xbb, 0xcc]);
    fs.writeFileSync(posterPath, touched);
    fs.utimesSync(posterPath, older, older);

    const changed = await client.waitFor('catalog:changed', 8000);
    assert.ok(changed.payload.updated >= 1, `older-mtime overwrite must broadcast, got ${JSON.stringify(changed.payload)}`);
    await client.close();

    const after2 = await fetchJson(srv.baseUrl, '/api/movies');
    const fresh = after2.body.movies.find((m) => m.uid === '0001');
    const newV = vParam(fresh.poster);
    assert.notEqual(newV, oldV, `older mtime must still produce a new ?v (old ${oldV}, new ${newV})`);

    const res = await fetchBin(srv.baseUrl, fresh.poster);
    assert.ok(res.body.equals(touched), 'served bytes must be the newer-written file content');
  });

  it('games: same-name overwrite → new ?v in GET /api/games + catalog:changed', async () => {
    const gamesDir = path.join(srv.libraryPath, 'Games', 'PS4');
    fs.mkdirSync(gamesDir, { recursive: true });
    const gamePath = path.join(gamesDir, 'Hades.jpg');
    fs.writeFileSync(gamePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x11]));

    // Wait for the watcher to pick up the new game
    const listed = await until(async () => {
      const g = await fetchJson(srv.baseUrl, '/api/games');
      const found = (g.body.games || []).find((x) => x.uid === 'game:hades');
      return found || null;
    }, 8000, 'game:hades to appear');
    const oldV = vParam(listed.poster);

    const client = new CollectingClient(srv.wsUrl);
    await client.connect('customer');

    const t0 = Date.now();
    fs.writeFileSync(gamePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x22]));
    fs.utimesSync(gamePath, new Date(t0 + 5000), new Date(t0 + 5000));

    const changed = await client.waitFor('catalog:changed', 8000);
    assert.ok(changed.payload.updated >= 1,
      `game same-name overwrite must broadcast updated >= 1, got ${JSON.stringify(changed.payload)}`);
    await client.close();

    const afterG = await fetchJson(srv.baseUrl, '/api/games');
    const fresh = (afterG.body.games || []).find((x) => x.uid === 'game:hades');
    assert.ok(fresh, 'game still listed');
    const newV = vParam(fresh.poster);
    assert.notEqual(newV, oldV, `game ?v must change after overwrite (old ${oldV}, new ${newV})`);

    const res = await fetchBin(srv.baseUrl, fresh.poster);
    assert.ok(res.body.equals(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x22])),
      'game poster bytes must be the new content');
  });

  it('PUT by-uid poster replace (edit path) → fresh ?v matches disk mtime', async () => {
    // The edit writes the file while watcher.expect suppresses the fs event,
    // so _applyToIndex itself must refresh movie.mtime — otherwise the UI
    // keeps the old immutable ?v and never shows the replaced poster.
    const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8b-put-refresh-lib-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8b-put-refresh-data-'));
    const dir = path.join(libDir, 'Movies', 'Action');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, '0001- Heat 1995.jpg');
    const oldBytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('original-poster-bytes')
    ]);
    fs.writeFileSync(p, oldBytes);

    const srv2 = await startTestServer({
      libraryPath: libDir, dataDir,
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const before3 = await fetchJson(srv2.baseUrl, '/api/movies');
      const old = before3.body.movies.find((m) => m.uid === '0001');
      const oldV = vParam(old.poster);

      const token = await loginAsAdmin(srv2.baseUrl, 'admin', 'testadmin123456');
      const newJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('replaced-through-put')
      ]);
      const res = await fetch(`${srv2.baseUrl}/api/movies/by-uid/0001`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ poster: 'data:image/jpeg;base64,' + newJpeg.toString('base64') })
      });
      assert.equal(res.status, 200, JSON.stringify(await res.json()));

      const diskV = String(Math.trunc(fs.statSync(p).mtimeMs));
      const after3 = await fetchJson(srv2.baseUrl, '/api/movies');
      const fresh = after3.body.movies.find((m) => m.uid === '0001');
      const newV = vParam(fresh.poster);
      assert.notEqual(newV, oldV,
        `PUT poster replace must produce a new ?v (old ${oldV}, new ${newV}) — stale mtime keeps the UI on the old cached poster`);
      assert.equal(newV, diskV, '?v must match the mtime of the file actually on disk');

      const served = await fetchBin(srv2.baseUrl, fresh.poster);
      assert.ok(served.body.equals(newJpeg), 'poster route must serve the replaced bytes');
      assert.ok(fs.readFileSync(p).equals(newJpeg), 'disk must hold the replacement');
    } finally {
      await srv2.close();
      fs.rmSync(libDir, { recursive: true, force: true });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('thumbnail cache: overwrite produces a NEW hash file with new webp bytes', async (t) => {
    if (!sharpMod) return t.skip(SKIP_NO_SHARP);

    const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8b-thumb-refresh-lib-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8b-thumb-refresh-data-'));
    const dir = path.join(libDir, 'Movies', 'Action');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, '0001- Heat 1995.jpg');

    const jpegA = await sharpMod({
      create: { width: 900, height: 1350, channels: 3, background: { r: 200, g: 30, b: 30 } }
    }).jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(p, jpegA);

    let srv2 = await startTestServer({ libraryPath: libDir, dataDir });
    try {
      const resA = await fetchBin(srv2.baseUrl, '/api/poster/0001?w=300');
      assert.equal(resA.status, 200);
      assert.match(resA.headers['content-type'] || '', /image\/webp/);
      const thumbsDir = path.join(dataDir, 'thumbs');
      const filesA = fs.readdirSync(thumbsDir).filter((n) => n.endsWith('.webp'));
      assert.equal(filesA.length, 1, `expected 1 cached thumb before overwrite, got ${filesA.length}`);

      // Overwrite with a visually different image + newer mtime
      const jpegB = await sharpMod({
        create: { width: 900, height: 1350, channels: 3, background: { r: 30, g: 30, b: 200 } }
      }).jpeg({ quality: 80 }).toBuffer();
      fs.writeFileSync(p, jpegB);
      const t0 = Date.now();
      fs.utimesSync(p, new Date(t0 + 5000), new Date(t0 + 5000));

      // Wait for the watcher to refresh movie.mtime so the ?v is the new one
      const freshV = await until(async () => {
        const list = await fetchJson(srv2.baseUrl, '/api/movies');
        const m = (list.body.movies || []).find((x) => x.uid === '0001');
        const diskV = String(Math.trunc(fs.statSync(p).mtimeMs));
        return m && vParam(m.poster) === diskV ? vParam(m.poster) : null;
      }, 8000, 'movie ?v to match disk mtime after overwrite');

      // Request with the fresh ?v → new hash → new cache file
      const resB = await fetchBin(srv2.baseUrl, `/api/poster/0001?v=${freshV}&w=300`);
      assert.equal(resB.status, 200);
      assert.match(resB.headers['content-type'] || '', /image\/webp/);

      const filesB = fs.readdirSync(thumbsDir).filter((n) => n.endsWith('.webp'));
      assert.equal(filesB.length, 2,
        `overwrite must produce a NEW cache file (old + new hash), got ${filesB.length}: ${filesB.join(', ')}`);

      const oldThumb = fs.readFileSync(path.join(thumbsDir, filesA[0]));
      const newThumb = fs.readFileSync(path.join(thumbsDir, filesB.find((n) => n !== filesA[0])));
      assert.ok(!newThumb.equals(oldThumb), 'new thumbnail bytes must differ from the old ones');
    } finally {
      await srv2.close();
      fs.rmSync(libDir, { recursive: true, force: true });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
