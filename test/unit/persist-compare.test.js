'use strict';
/**
 * P8c follow-up — persistence performance path.
 *
 * The reconcile flush used to sort 19k keys with localeCompare + a
 * per-comparison getKey() (~920 ms, the bulk of a 1.6 s blocking flush).
 * The replacement (compareNumericAware + pre-computed sortForPersist +
 * chunked stringifyCatalogAsync + saveToDiskAsync) must be behaviourally
 * identical: same total order, same bytes on disk, byte-identical JSON.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const CatalogIndexer = require('../../backend/indexer');

const { compareForPersist, compareNumericAware, compareKeysPersist, isFastKey, sortForPersist, stringifyCatalogAsync } = CatalogIndexer;

function quiet(fn) {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try { return fn(); } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }
}

function quietAsync(fn) {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return fn().finally(() => {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  });
}

// Deterministic PRNG (mulberry32) — the fuzz corpus must be reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERSIAN_WORDS = ['سریال', 'فیلم', 'تهران', 'عاشقانه', 'اکشن', 'دوبله', 'فارسی', 'شماره', 'فصل', 'قسمت', 'پدر', 'madar', 'shahr', 'ghalam'];
const ASCII_WORDS = ['breaking', 'better', 'office', 'dark', 'file', 'room', 'mr', 's01', 'the', 'of', 'and'];
const PUNCT = [' ', ' ', ' ', '-', '.', '(', ')', '_'];

function makeKeyParts(rand) {
  const words = rand() < 0.45 ? PERSIAN_WORDS : ASCII_WORDS;
  let s = words[Math.floor(rand() * words.length)];
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
    s += PUNCT[Math.floor(rand() * PUNCT.length)];
    if (rand() < 0.35) {
      s += String(Math.floor(rand() * 2000)); // digit runs — the numeric-aware case
    } else {
      s += words[Math.floor(rand() * words.length)];
    }
  }
  return s.toLowerCase(); // seriesKey() lower-cases; keep corpus realistic
}

describe('P8c — persist sort fast path (DATA-14 equivalence)', () => {
  it('compareKeysPersist agrees with localeCompare(en, numeric) on catalog key forms', () => {
    const rand = mulberry32(0xC0FFEE);
    // Key families are compared only WITHIN one type-priority group
    // (compareForPersist gates on type before touching keys): either
    // `Type:<digits>` (fixed-case prefix, digit ids — fast path) or Series
    // titles (fast path when lower-case alnum + spaces; punctuation or
    // Persian letters route to localeCompare inside compareKeysPersist).
    const idFamilies = [['Movie:'], ['Iranian:'], ['Animation:']];
    const ids = [];
    for (const [prefix] of idFamilies) {
      for (let i = 0; i < 200; i++) {
        ids.push(prefix + String(Math.floor(rand() * 12000)).padStart(1 + Math.floor(rand() * 5), '0'));
      }
    }
    const series = [];
    for (let i = 0; i < 400; i++) series.push(makeKeyParts(rand));
    // Pinned numeric edge cases (series family)
    series.push('007', '7', '00', '0', 'movie9', 'movie10', 'm1b2', 'm1b10', 'a000b', 'a0b');

    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      // Same-family pairs only (see the note above)
      const pool = rand() < 0.5 ? ids : series;
      const a = pool[Math.floor(rand() * pool.length)];
      const b = pool[Math.floor(rand() * pool.length)];
      const expected = Math.sign(a.localeCompare(b, 'en', { numeric: true }));
      const actual = Math.sign(compareKeysPersist(a, b));
      assert.equal(actual, expected,
        `compareKeysPersist(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${actual}, localeCompare = ${expected}`);
      checked++;
    }
    assert.ok(checked >= 3000);
  });

  it('isFastKey accepts exactly the ICU-equivalent forms', () => {
    // Fast path: fixed-case Type:id keys and lower-case alnum/space series
    assert.equal(isFastKey('Movie:0001'), true);
    assert.equal(isFastKey('Movie:12'), true);
    assert.equal(isFastKey('Iranian:0099'), true);
    assert.equal(isFastKey('Animation:00012'), true);
    assert.equal(isFastKey('breaking bad'), true);
    assert.equal(isFastKey('movie9'), true);
    assert.equal(isFastKey(''), true, 'empty key compares fine on the fast path');
    // Fallback: punctuation (ICU orders - . ( ) differently from code units)
    assert.equal(isFastKey('the)mr'), false);
    assert.equal(isFastKey('the-of'), false);
    assert.equal(isFastKey('mr. robot'), false);
    assert.equal(isFastKey('a_b'), false);
    // Fallback: Persian (ICU uses dictionary order for Arabic script)
    assert.equal(isFastKey('پدر'), false);
    // Fallback: unknown uppercase prefixes never take the fast path
    assert.equal(isFastKey('Game:1'), false);
    assert.equal(isFastKey('Movie:x1'), false, 'id must be digits');
    // A punctuation pair routed through the fallback matches ICU by construction
    assert.equal(
      Math.sign(compareKeysPersist('the)mr', 'the-of')),
      Math.sign('the)mr'.localeCompare('the-of', 'en', { numeric: true }))
    );
  });

  it('compareNumericAware is a total order (antisymmetric + reflexive)', () => {
    const keys = ['Movie:0001', 'Movie:0010', 'movie9', 'movie10', 'x', 'x', 'سریال 2', 'سریال 10'];
    for (const a of keys) {
      assert.equal(compareNumericAware(a, a), 0, `reflexive: ${a}`);
      for (const b of keys) {
        // +0 normalises -0 (Math.sign(0) is 0 but -Math.sign(0) is -0)
        assert.equal(Math.sign(compareNumericAware(a, b)) + 0, -Math.sign(compareNumericAware(b, a)) + 0,
          `antisymmetric: ${a} / ${b}`);
      }
    }
  });

  it('sortForPersist produces the same order as sort(compareForPersist)', () => {
    const rand = mulberry32(0xBEEF);
    const types = ['Movie', 'Iranian', 'Animation', 'Series'];
    const movies = [];
    for (let i = 0; i < 500; i++) {
      const type = types[Math.floor(rand() * types.length)];
      movies.push(type === 'Series'
        ? { type, id: null, title: makeKeyParts(rand) }
        : { type, id: String(Math.floor(rand() * 9999)).padStart(4, '0'), title: 'T' + i });
    }
    const viaCmp = [...movies].sort(compareForPersist).map((m) => `${m.type}:${m.id || m.title}`);
    const viaSort = sortForPersist(movies).map((m) => `${m.type}:${m.id || m.title}`);
    assert.deepEqual(viaSort, viaCmp, 'pre-computed sort must match the reference comparator');
  });

  it('stringifyCatalogAsync is byte-identical to JSON.stringify (compact)', async () => {
    const catalog = {
      meta: { version: '5.4.0', lastUpdated: 'now', totalMovies: 3 },
      movies: [
        { uid: '0001', id: '0001', title: 'A', genres: ['Action'], type: 'Movie', poster: '/p1' },
        { uid: 'series:x', id: null, title: 'X', genres: [], type: 'Series', poster: '/p2' },
        { uid: '0002', id: '0002', title: 'B', genres: [], type: 'Movie', poster: '/p3' }
      ],
      fileIndex: { '/abs/one.jpg': { id: '0001', key: 'Movie:0001', lastModified: 1 } }
    };
    const viaAsync = await stringifyCatalogAsync(catalog);
    assert.equal(viaAsync, JSON.stringify(catalog));
    // Chunk path: > SAVE_CHUNK movies must still be byte-identical
    const many = { meta: {}, movies: [], fileIndex: {} };
    for (let i = 0; i < 2500; i++) {
      many.movies.push({ uid: String(i), id: String(i), title: 'M' + i, genres: [], type: 'Movie', poster: '/p' + i });
    }
    assert.equal(await stringifyCatalogAsync(many), JSON.stringify(many));
  });
});

describe('P8c — async save path', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-async-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('saveToDiskAsync writes the same catalog as saveToDisk (order + fields)', async () => {
    const mkResults = () => {
      const results = [];
      for (let i = 1; i <= 200; i++) {
        results.push({
          id: String(i).padStart(4, '0'), title: 'Movie ' + i, year: 2000 + (i % 20),
          genres: ['Action'], type: 'Movie',
          posterPath: path.join(tmpDir, `m${i}.jpg`), lastModified: i, path: path.join(tmpDir, `m${i}.jpg`)
        });
      }
      results.push({ id: null, title: 'سریال 10', year: null, genres: [], type: 'Series', posterPath: path.join(tmpDir, 's1.jpg'), lastModified: 1, path: path.join(tmpDir, 's1.jpg') });
      results.push({ id: null, title: 'سریال 9', year: null, genres: [], type: 'Series', posterPath: path.join(tmpDir, 's2.jpg'), lastModified: 1, path: path.join(tmpDir, 's2.jpg') });
      return results;
    };

    const pSync = path.join(tmpDir, 'sync.json');
    const idxSync = new CatalogIndexer(pSync);
    quiet(() => idxSync.replaceFromScan(mkResults()));
    quiet(() => idxSync.saveToDisk());

    const pAsync = path.join(tmpDir, 'async.json');
    const idxAsync = new CatalogIndexer(pAsync);
    quiet(() => idxAsync.replaceFromScan(mkResults()));
    const ok = await quietAsync(() => idxAsync.saveToDiskAsync());
    assert.equal(ok, true);

    const a = JSON.parse(fs.readFileSync(pSync, 'utf8'));
    const b = JSON.parse(fs.readFileSync(pAsync, 'utf8'));
    a.meta.lastUpdated = b.meta.lastUpdated = 'X';
    assert.deepEqual(b, a, 'async save must write the identical catalog');
    // Numeric-aware series order survived
    assert.deepEqual(b.movies.slice(-2).map((m) => m.title), ['سریال 9', 'سریال 10']);
  });

  it('flushAsync clears a pending debounced save and returns true', async () => {
    const catalogPath = path.join(tmpDir, 'flush.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan([{
      id: '0001', title: 'A', year: 2000, genres: [], type: 'Movie',
      posterPath: path.join(tmpDir, 'a.jpg'), lastModified: 1, path: path.join(tmpDir, 'a.jpg')
    }]));
    idx.scheduleSave(); // arms the debounce timer — flushAsync must cancel it
    const ok = await quietAsync(() => idx.flushAsync());
    assert.equal(ok, true);
    assert.ok(fs.existsSync(catalogPath), 'flushAsync writes the catalog');
    const saved = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(saved.movies.length, 1);
    assert.equal(saved.movies[0].id, '0001');
  });
});

describe('P8c — async replaceFromScan parity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-parity-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('replaceFromScanAsync yields identical state to replaceFromScan', async () => {
    const mkResults = () => {
      const results = [];
      for (let i = 1; i <= 1200; i++) {
        const type = i % 7 === 0 ? 'Animation' : (i % 11 === 0 ? 'Iranian' : 'Movie');
        results.push({
          id: String(i).padStart(type === 'Animation' ? 5 : 4, '0'),
          title: 'T' + i, year: 2000 + (i % 24), genres: i % 2 ? ['Action'] : ['Drama', 'Action'],
          type, posterPath: path.join(tmpDir, `p${i}.jpg`), lastModified: i, path: path.join(tmpDir, `p${i}.jpg`)
        });
      }
      for (let s = 1; s <= 40; s++) {
        results.push({ id: null, title: 'Series ' + (s % 20), year: null, genres: [], type: 'Series', posterPath: path.join(tmpDir, `s${s}.jpg`), lastModified: s, path: path.join(tmpDir, `s${s}.jpg`) });
      }
      return results;
    };

    const idxSync = new CatalogIndexer(path.join(tmpDir, 'sync.json'));
    const sStats = quiet(() => idxSync.replaceFromScan(mkResults()));

    const idxAsync = new CatalogIndexer(path.join(tmpDir, 'async.json'));
    const aStats = await quietAsync(() => idxAsync.replaceFromScanAsync(mkResults()));

    assert.deepEqual(aStats, sStats);
    assert.deepEqual(idxAsync.getMovies(), idxSync.getMovies());
    assert.deepEqual(
      [...idxAsync._fileIndex.entries()].sort(),
      [...idxSync._fileIndex.entries()].sort()
    );
    assert.deepEqual(idxAsync._scanConflicts, idxSync._scanConflicts);
  });

  it('replaceFromScanAsync preserves edited titles and metadata across the swap', async () => {
    const catalogPath = path.join(tmpDir, 'keep.json');
    const idx = new CatalogIndexer(catalogPath);
    const results = () => [{
      id: '0001', title: 'Original', year: 2001, genres: ['Action'], type: 'Movie',
      posterPath: path.join(tmpDir, 'a.jpg'), lastModified: 1, path: path.join(tmpDir, 'a.jpg')
    }];
    quiet(() => idx.replaceFromScan(results()));
    const movie = idx.getMovieById('0001');
    movie.title = 'Edited Title';
    movie.imdbRating = '8.1';
    movie.plotSummary = 'custom';

    await quietAsync(() => idx.replaceFromScanAsync(results()));
    const after = idx.getMovieById('0001');
    assert.equal(after.title, 'Edited Title', 'edited title survives (in-memory merge path)');
    assert.equal(after.imdbRating, '8.1');
    assert.equal(after.plotSummary, 'custom');
  });
});
