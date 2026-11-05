'use strict';
/**
 * P8b G4 (FE-12, D4) — thumbnail service + poster route ?w / cache headers.
 *
 * sharp is injected or absent in unit tests (temp dirs only). The real-sharp
 * end-to-end block skips itself when sharp is not installed, matching the
 * production fallback contract.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createThumbService, isThumbWidth, WIDTHS } = require('../../backend/thumbs');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

let sharpMod = null;
try { sharpMod = require('sharp'); } catch { sharpMod = null; }
const SKIP_REASON = `sharp unavailable (optionalDependency; needs Node >= 20.9; running ${process.version}) — serving originals`;

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Chainable fake sharp: resize→webp→toFile, with injectable failure/delay. */
function makeFakeSharp(hooks) {
  const h = hooks || {};
  const stats = { toFileCalls: 0, active: 0, maxActive: 0 };
  function fake(_src) {
    return {
      resize() { return this; },
      webp() { return this; },
      async toFile(dest) {
        stats.toFileCalls++;
        stats.active++;
        stats.maxActive = Math.max(stats.maxActive, stats.active);
        try {
          if (h.delay) await new Promise((r) => setTimeout(r, h.delay));
          if (h.fail) throw new Error('boom');
          fs.writeFileSync(dest, Buffer.from(`WEBP:${path.basename(dest)}`));
        } finally {
          stats.active--;
        }
      }
    };
  }
  return { loader: () => fake, stats };
}

function listThumbs(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

/** Binary-capable request helper. */
function fetchBin(baseUrl, reqPath, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const req = http.request(url, { method: 'GET', headers: headers || {} }, (res) => {
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

describe('P8b thumbs service', () => {
  it('isThumbWidth accepts 300/600 only; WIDTHS exported', () => {
    assert.deepEqual(WIDTHS, [300, 600]);
    assert.equal(isThumbWidth(300), true);
    assert.equal(isThumbWidth(600), true);
    assert.equal(isThumbWidth(500), false);
    assert.equal(isThumbWidth('300'), false);
    assert.equal(isThumbWidth(undefined), false);
  });

  it('hashFor is stable and changes with path, mtime and width', () => {
    const dir = tmpDir('thumbs-hash-');
    const svc = createThumbService({ thumbsDir: dir, loadSharp: () => null });
    const a = svc.hashFor('/lib/a.jpg', 1000, 300);
    assert.equal(a, svc.hashFor('/lib/a.jpg', 1000, 300));
    assert.notEqual(a, svc.hashFor('/lib/b.jpg', 1000, 300));
    assert.notEqual(a, svc.hashFor('/lib/a.jpg', 1001, 300));
    assert.notEqual(a, svc.hashFor('/lib/a.jpg', 1000, 600));
    assert.match(a, /^[0-9a-f]{32}\.webp$/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('get generates once, then serves from cache; atomic (no .tmp left)', async () => {
    const dir = tmpDir('thumbs-gen-');
    const src = path.join(dir, 'poster.jpg');
    fs.writeFileSync(src, 'fakejpg');
    const fake = makeFakeSharp({});
    const logs = [];
    const svc = createThumbService({
      thumbsDir: path.join(dir, 'cache'),
      loadSharp: fake.loader,
      log: (m) => logs.push(m)
    });

    const first = await svc.get(src, 1234, 300);
    assert.ok(first && fs.existsSync(first.file));
    assert.equal(fs.readFileSync(first.file, 'utf8').startsWith('WEBP:'), true);
    const second = await svc.get(src, 1234, 300);
    assert.equal(second.file, first.file);
    assert.equal(fake.stats.toFileCalls, 1, 'second get must hit the cache');
    const leftovers = listThumbs(path.join(dir, 'cache')).filter((n) => n.includes('.tmp-'));
    assert.deepEqual(leftovers, [], 'no tmp files may remain');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('mtime invalidation: a changed file produces a NEW thumb name', async () => {
    const dir = tmpDir('thumbs-mtime-');
    const src = path.join(dir, 'poster.jpg');
    fs.writeFileSync(src, 'fakejpg');
    const fake = makeFakeSharp({});
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: fake.loader, log: () => {} });

    const v1 = await svc.get(src, 1000, 300);
    const v2 = await svc.get(src, 2000, 300);
    assert.notEqual(v1.hash, v2.hash);
    assert.equal(listThumbs(path.join(dir, 'cache')).filter((n) => n.endsWith('.webp')).length, 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('generation pool never exceeds concurrency 2', async () => {
    const dir = tmpDir('thumbs-pool-');
    const fake = makeFakeSharp({ delay: 25 });
    const svc = createThumbService({
      thumbsDir: path.join(dir, 'cache'),
      loadSharp: fake.loader,
      log: () => {}
    });
    const jobs = [];
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(dir, `p${i}.jpg`), 'x');
      jobs.push(svc.get(path.join(dir, `p${i}.jpg`), 1000 + i, 300));
    }
    await Promise.all(jobs);
    assert.equal(fake.stats.toFileCalls, 6);
    assert.ok(fake.stats.maxActive <= 2, `maxActive ${fake.stats.maxActive} must be <= 2`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sharp missing: get returns null and logs the fallback once', async () => {
    const dir = tmpDir('thumbs-missing-');
    const logs = [];
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: () => null, log: (m) => logs.push(m) });
    const src = path.join(dir, 'p.jpg');
    fs.writeFileSync(src, 'x');
    assert.equal(await svc.get(src, 1, 300), null);
    assert.equal(await svc.get(src, 1, 600), null);
    const fallbacks = logs.filter((m) => m.includes('sharp not available'));
    assert.equal(fallbacks.length, 1, 'exactly one fallback log line');
    assert.deepEqual(listThumbs(path.join(dir, 'cache')), [], 'no thumb dir churn without sharp');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sharp load THROWS (simulated install failure): null + visible fallback, app keeps serving', async () => {
    // Task 4: sharp is an optionalDependency (Node >= 20.9); a failed install
    // or a Node 18 host makes require('sharp') throw — the service must treat
    // that identically to "not installed" (D4: app runs without sharp).
    const dir = tmpDir('thumbs-loadthrow-');
    const logs = [];
    const svc = createThumbService({
      thumbsDir: path.join(dir, 'cache'),
      loadSharp: () => { throw new Error('Cannot find module \'sharp\' (optionalDependency; needs Node >= 20.9)'); },
      log: (m) => logs.push(m)
    });
    const src = path.join(dir, 'p.jpg');
    fs.writeFileSync(src, 'x');
    assert.equal(await svc.get(src, 1, 300), null);
    assert.equal(await svc.get(src, 1, 600), null);
    assert.equal(logs.filter((m) => m.includes('sharp not available')).length, 1,
      'throwing loader must log the same visible fallback as a missing module');
    assert.deepEqual(listThumbs(path.join(dir, 'cache')), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('generation reads the source into a Buffer (no sharp path/fd input)', async () => {
    // P8b follow-up: sharp(path) holds the source fd for the whole decode+encode,
    // which made a concurrent rename hit EBUSY on Windows. generate() must pass
    // a Buffer to sharp instead.
    const dir = tmpDir('thumbs-buffer-');
    const src = path.join(dir, 'poster.jpg');
    fs.writeFileSync(src, 'fakejpg-bytes');
    const seenInputs = [];
    function fakeSharp(input) {
      seenInputs.push(input);
      return {
        resize() { return this; },
        webp() { return this; },
        async toFile(dest) { fs.writeFileSync(dest, Buffer.from('WEBP:ok')); }
      };
    }
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: () => fakeSharp, log: () => {} });
    const out = await svc.get(src, 42, 300);
    assert.ok(out && fs.existsSync(out.file));
    assert.equal(seenInputs.length, 1);
    assert.ok(Buffer.isBuffer(seenInputs[0]),
      `sharp must receive a Buffer (not a path string), got: ${typeof seenInputs[0]}`);
    assert.equal(seenInputs[0].toString('utf8'), 'fakejpg-bytes',
      'Buffer must contain the source file bytes');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sharp failure mid-generation: null, tmp cleaned, failure logged once', async () => {
    const dir = tmpDir('thumbs-fail-');
    const logs = [];
    const fake = makeFakeSharp({ fail: true });
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: fake.loader, log: (m) => logs.push(m) });
    const src = path.join(dir, 'p.jpg');
    fs.writeFileSync(src, 'x');
    assert.equal(await svc.get(src, 1, 300), null);
    assert.equal(await svc.get(src, 2, 300), null);
    assert.equal(logs.filter((m) => m.includes('generation failed')).length, 1);
    assert.deepEqual(listThumbs(path.join(dir, 'cache')).filter((n) => n.includes('.tmp-')), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('get rejects unknown widths and non-finite mtime without touching disk', async () => {
    const dir = tmpDir('thumbs-badw-');
    const fake = makeFakeSharp({});
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: fake.loader, log: () => {} });
    const src = path.join(dir, 'p.jpg');
    fs.writeFileSync(src, 'x');
    assert.equal(await svc.get(src, 1, 500), null);
    assert.equal(await svc.get(src, NaN, 300), null);
    assert.equal(fake.stats.toFileCalls, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cleanOrphans keeps expected names and removes the rest', async () => {
    const dir = tmpDir('thumbs-orphan-');
    const cache = path.join(dir, 'cache');
    fs.mkdirSync(cache);
    fs.writeFileSync(path.join(cache, 'keep.webp'), 'a');
    fs.writeFileSync(path.join(cache, 'stale1.webp'), 'b');
    fs.writeFileSync(path.join(cache, 'stale2.webp'), 'c');
    const svc = createThumbService({ thumbsDir: cache, loadSharp: () => null, log: () => {} });
    const result = await svc.cleanOrphans(new Set(['keep.webp']));
    assert.deepEqual(result, { removed: 2, kept: 1 });
    assert.deepEqual(listThumbs(cache), ['keep.webp']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cleanOrphans on a missing cache dir is a no-op', async () => {
    const dir = tmpDir('thumbs-nodir-');
    const svc = createThumbService({ thumbsDir: path.join(dir, 'nope'), loadSharp: () => null, log: () => {} });
    assert.deepEqual(await svc.cleanOrphans(new Set()), { removed: 0, kept: 0 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warmUp pre-generates both widths for the first entries only', async () => {
    const dir = tmpDir('thumbs-warm-');
    const fake = makeFakeSharp({});
    const svc = createThumbService({ thumbsDir: path.join(dir, 'cache'), loadSharp: fake.loader, log: () => {} });
    const entries = [];
    for (let i = 0; i < 5; i++) {
      const p = path.join(dir, `w${i}.jpg`);
      fs.writeFileSync(p, 'x');
      entries.push({ absPath: p, mtimeMs: 100 + i });
    }
    const warmed = await svc.warmUp(entries, 2);
    assert.equal(warmed, 2);
    assert.equal(fake.stats.toFileCalls, 2 * WIDTHS.length);
    assert.equal(listThumbs(path.join(dir, 'cache')).filter((n) => n.endsWith('.webp')).length, 4);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('P8b poster route — ?w validation, headers, fallback', () => {
  let server;
  const tinyJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
  ]);

  before(async () => {
    // tree value `true` → the helper's tiny undecodable JPEG (same bytes as
    // the tinyJpeg constant below — sharp cannot decode it → fallback path).
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  it('w=500 (unknown width) → 400', async () => {
    const res = await fetchBin(server.baseUrl, '/api/poster/0001?w=500');
    assert.equal(res.status, 400);
  });

  it('no ?v → cacheable but NOT immutable; ETag present', async () => {
    const res = await fetchBin(server.baseUrl, '/api/poster/0001');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'] || '', /public, max-age=3600/);
    assert.ok(res.headers.etag, 'ETag required');
  });

  it('?v matching the file mtime → immutable; If-None-Match → 304', async () => {
    const movies = await fetchBin(server.baseUrl, '/api/movies');
    const list = JSON.parse(movies.body.toString('utf8')).movies;
    const heat = list.find((m) => m.uid === '0001');
    assert.ok(heat, 'movie 0001 indexed');
    const match = (heat.poster || '').match(/[?&]v=(\d+)$/);
    assert.ok(match, `poster URL must carry ?v=<mtimeMs>, got ${heat.poster}`);

    const res = await fetchBin(server.baseUrl, heat.poster);
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'] || '', /immutable/);
    const etag = res.headers.etag;
    assert.ok(etag);
    const res304 = await fetchBin(server.baseUrl, heat.poster, { 'If-None-Match': etag });
    assert.equal(res304.status, 304);
  });

  it('?v=0 (stale) is NOT immutable', async () => {
    const res = await fetchBin(server.baseUrl, '/api/poster/0001?v=0');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'] || '', /max-age=3600/);
    assert.doesNotMatch(res.headers['cache-control'] || '', /immutable/);
  });

  it('GET /api/movies posters carry ?v and never leak mtime (SEC-08)', async () => {
    const res = await fetchBin(server.baseUrl, '/api/movies');
    const list = JSON.parse(res.body.toString('utf8')).movies;
    assert.ok(list.length >= 1);
    for (const m of list) {
      assert.match(m.poster, /^\/api\/poster\/.+[?&]v=\d+$/);
      assert.equal('mtime' in m, false, 'mtime must not appear in the public payload');
      assert.equal('absolutePosterPath' in m, false);
    }
  });

  it('thumb request with undecodable source falls back to the original bytes', async () => {
    const res = await fetchBin(server.baseUrl, '/api/poster/0001?w=300');
    assert.equal(res.status, 200);
    assert.equal(res.body.equals(tinyJpeg), true, 'fallback must serve the original file');
  });

  it('F38: thumbs dir is a file → poster route serves original with 200, one log line', async () => {
    // Block the thumbs cache BEFORE server boot by making data/thumbs a regular file
    const blockedDataDir = tmpDir('thumbs-blocked-data-');
    fs.writeFileSync(path.join(blockedDataDir, 'thumbs'), 'not-a-directory');
    const blockedServer = await startTestServer({
      dataDir: blockedDataDir,
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true }
    });
    try {
      const res = await fetchBin(blockedServer.baseUrl, '/api/poster/0001?w=300');
      assert.equal(res.status, 200, `must serve original with 200 when thumbs dir is blocked: ${res.status}`);
      assert.equal(res.body.equals(tinyJpeg), true, 'fallback must serve the original file');
    } finally {
      await blockedServer.close();
      fs.rmSync(blockedDataDir, { recursive: true, force: true });
    }
  });
});

describe('P8b poster route — real sharp end-to-end (skips without sharp)', () => {
  let server;
  let libDir;
  let originalJpeg;

  before(async () => {
    if (!sharpMod) return;
    libDir = tmpDir('thumbs-e2e-lib-');
    const dir = path.join(libDir, 'Movies', 'Action');
    fs.mkdirSync(dir, { recursive: true });
    originalJpeg = await sharpMod({
      create: { width: 900, height: 1350, channels: 3, background: { r: 200, g: 30, b: 30 } }
    }).jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(dir, '0001- Heat 1995.jpg'), originalJpeg);
    server = await startTestServer({ libraryPath: libDir });
  });

  after(async () => {
    if (server) await server.close();
    if (libDir) fs.rmSync(libDir, { recursive: true, force: true });
  });

  it('w=300 returns a real webp thumbnail smaller than the original', async (t) => {
    if (!sharpMod) return t.skip(SKIP_REASON);
    const res = await fetchBin(server.baseUrl, '/api/poster/0001?w=300');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /image\/webp/);
    assert.match(res.headers['cache-control'] || '', /immutable/);
    assert.ok(res.body.length < originalJpeg.length, `thumb ${res.body.length} < original ${originalJpeg.length}`);
    assert.ok(res.body.length > 0);
  });

  it('repeat request is served from the thumbs cache (one file per width)', async (t) => {
    if (!sharpMod) return t.skip(SKIP_REASON);
    await fetchBin(server.baseUrl, '/api/poster/0001?w=300');
    await fetchBin(server.baseUrl, '/api/poster/0001?w=600');
    const files = fs.readdirSync(path.join(server.dataDir, 'thumbs')).filter((n) => n.endsWith('.webp'));
    assert.equal(files.length, 2);
  });

  it('game posters also accept ?w and versioned URLs exist', async (t) => {
    if (!sharpMod) return t.skip(SKIP_REASON);
    // add a game poster file and rescan via a fresh server
    const gamesDir = path.join(libDir, 'Games', 'PS4');
    fs.mkdirSync(gamesDir, { recursive: true });
    const gameJpeg = await sharpMod({
      create: { width: 800, height: 1200, channels: 3, background: { r: 30, g: 30, b: 200 } }
    }).jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(gamesDir, 'Hades.jpg'), gameJpeg);
    await server.server.stop();
    server = await startTestServer({ libraryPath: libDir, dataDir: server.dataDir });
    const games = await fetchBin(server.baseUrl, '/api/games');
    const list = JSON.parse(games.body.toString('utf8')).games;
    const hades = list.find((g) => g.uid === 'game:hades');
    assert.ok(hades, 'game indexed');
    assert.match(hades.poster, /^\/api\/game-poster\/.+[?&]v=\d+$/, 'game poster carries ?v');
    const res = await fetchBin(server.baseUrl, hades.poster.replace('/api/game-poster/', '/api/game-poster/') + '&w=300');
    assert.equal(res.status, 200);
  });
});

describe('P8b follow-up — rename-during-generation with warm-up ENABLED', { skip: sharpMod ? false : SKIP_REASON }, () => {
  // Regression for the Windows EBUSY: warm-up used to hold source fds via
  // sharp(path); generate() now reads to Buffer first, so renames must
  // succeed even while the first-screen warm-up is converting.
  let libDir;
  let dataDir;

  before(() => {
    libDir = tmpDir('thumbs-warmup-lib-');
    dataDir = tmpDir('thumbs-warmup-data-');
  });

  after(() => {
    if (libDir) fs.rmSync(libDir, { recursive: true, force: true });
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('editor rename via PUT by-uid succeeds while warm-up converts (no EBUSY)', async (t) => {
    const dir = path.join(libDir, 'Movies', 'Action');
    fs.mkdirSync(dir, { recursive: true });
    // 8 decently-sized posters so warm-up has real conversion work in flight
    const jpegs = [];
    for (let i = 1; i <= 8; i++) {
      const id = String(i).padStart(4, '0');
      const jpeg = await sharpMod({
        create: { width: 1400, height: 2100, channels: 3, background: { r: 40 + i * 20, g: 80, b: 120 } }
      }).jpeg({ quality: 90 }).toBuffer();
      const p = path.join(dir, `${id}- Warmup Movie ${i} 2020.jpg`);
      fs.writeFileSync(p, jpeg);
      jpegs.push({ id, path: p });
    }

    const srv = await startTestServer({
      libraryPath: libDir,
      dataDir,
      thumbWarmUp: true,
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    try {
      const token = await loginAsAdmin(srv.baseUrl, 'admin', 'testadmin123456');
      assert.ok(token, 'admin token for PUT');

      // Fire renames immediately — warm-up is scheduled via setImmediate and
      // still converting when these land. Each PUT renames the poster file.
      const t0 = Date.now();
      const results = [];
      for (const { id } of jpegs) {
        const res = await fetch(`${srv.baseUrl}/api/movies/by-uid/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: `Renamed ${id}`, year: 2020 })
        });
        results.push({ id, status: res.status, body: await res.json().catch(() => null) });
      }
      const elapsed = Date.now() - t0;

      const failures = results.filter((r) => r.status !== 200);
      assert.deepEqual(failures, [],
        `all editor renames must succeed during warm-up (no EBUSY), got: ${JSON.stringify(failures)}`);

      // Files really moved (new titles on disk)
      for (const { id } of jpegs) {
        const renamed = path.join(dir, `${id}- Renamed ${id} 2020.jpg`);
        assert.ok(fs.existsSync(renamed), `renamed file must exist: ${renamed}`);
        assert.ok(!fs.existsSync(jpegs.find((j) => j.id === id).path),
          `old file must be gone for ${id}`);
      }

      t.diagnostic(`8 editor renames during warm-up completed in ${elapsed} ms (0 collisions)`);
    } finally {
      await srv.close();
    }
  });

  it('direct fs rename + in-place replace succeed while svc.get converts (no EBUSY)', async (t) => {
    const dir = tmpDir('thumbs-warmup-direct-');
    try {
      const cache = path.join(dir, 'cache');
      const svc = createThumbService({ thumbsDir: cache, log: () => {} });
      // Warm-up-shaped load: kick off many generations at once
      const entries = [];
      for (let i = 0; i < 10; i++) {
        const jpeg = await sharpMod({
          create: { width: 1200, height: 1800, channels: 3, background: { r: 10 + i, g: 200, b: 90 } }
        }).jpeg({ quality: 85 }).toBuffer();
        const p = path.join(dir, `poster-${i}.jpg`);
        fs.writeFileSync(p, jpeg);
        entries.push({ absPath: p, mtimeMs: fs.statSync(p).mtimeMs });
      }

      const t0 = Date.now();
      const warm = svc.warmUp(entries, 10);
      // Concurrently: rename every source AND overwrite one in place
      let renameErrors = 0;
      let replaceErrors = 0;
      const ops = [];
      for (let i = 0; i < entries.length; i++) {
        const from = entries[i].absPath;
        const to = path.join(dir, `renamed-${i}.jpg`);
        ops.push((async () => {
          try { fs.renameSync(from, to); } catch (err) { renameErrors++; t.diagnostic(`rename ${i}: ${err.code || err.message}`); }
        })());
      }
      ops.push((async () => {
        try {
          const other = await sharpMod({
            create: { width: 600, height: 900, channels: 3, background: { r: 255, g: 0, b: 0 } }
          }).jpeg({ quality: 70 }).toBuffer();
          fs.writeFileSync(entries[0].absPath, other); // in-place replace (path may already be renamed — fine)
        } catch (err) { replaceErrors++; t.diagnostic(`replace: ${err.code || err.message}`); }
      })());
      await Promise.all(ops);
      await warm;
      const elapsed = Date.now() - t0;

      assert.equal(renameErrors, 0,
        `direct renames during warm-up must not hit EBUSY/fd locks (Buffer-based generate), got ${renameErrors} errors`);
      assert.equal(replaceErrors, 0, `in-place replace during warm-up must succeed, got ${replaceErrors}`);
      t.diagnostic(`10 direct renames + 1 replace during warm-up: ${elapsed} ms, 0 collisions`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
