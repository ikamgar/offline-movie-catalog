'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const CatalogIndexer = require('../../backend/indexer');
const MovieCreator = require('../../backend/services/movie-creator');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

describe('MovieCreator (characterization)', () => {
  it('creates a movie with 2 genres: files, index, catalog.json', async () => {
    const base = path.join(os.tmpdir(), 'mc-happy-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'Test Movie', type: 'Movie', year: 2020, genres: ['Action', 'Drama'] },
      JPEG, 'jpg'
    );

    // Verify returned movie object
    assert.ok(result.id, 'movie has an id');
    assert.equal(result.title, 'Test Movie');
    assert.equal(result.year, 2020);
    assert.equal(result.type, 'Movie');
    assert.deepEqual(result.genres, ['Action', 'Drama']);

    // Verify files were created in both genre folders
    const actionFiles = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const dramaFiles = fs.readdirSync(path.join(lib, 'Movies', 'Drama'));
    assert.ok(actionFiles.some(f => f.includes('Test Movie')), 'file in Action folder');
    assert.ok(dramaFiles.some(f => f.includes('Test Movie')), 'file in Drama folder');

    // Verify catalog.json was updated (indexer is the sole writer; flush after create)
    quiet(() => idx.flush());
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.ok(catalog.movies.length >= 1, 'catalog has at least 1 movie');
    assert.ok(catalog.movies.some(m => m.title === 'Test Movie'), 'catalog contains new movie');

    // Verify index was updated
    assert.ok(idx.getMovieById(result.id), 'index contains new movie');

    // No temp dir inside Library (DATA-13)
    assert.ok(!fs.existsSync(path.join(lib, '.tmp')), 'no Library/.tmp after create');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('validates required fields', async () => {
    const base = path.join(os.tmpdir(), 'mc-validate-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    // Missing title
    await assert.rejects(
      () => mc.createMovie({ type: 'Movie', year: 2020, genres: ['Action'] }, JPEG, 'jpg'),
      /عنوان فیلم الزامی/
    );

    // Missing year for Movie
    await assert.rejects(
      () => mc.createMovie({ title: 'X', type: 'Movie', genres: ['Action'] }, JPEG, 'jpg'),
      /سال انتشار/
    );

    // Missing genres for Movie
    await assert.rejects(
      () => mc.createMovie({ title: 'X', type: 'Movie', year: 2020 }, JPEG, 'jpg'),
      /ژانر/
    );

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('creates backup before modifying catalog', async () => {
    const base = path.join(os.tmpdir(), 'mc-backup-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    await mc.createMovie(
      { title: 'Backup Test', type: 'Movie', year: 2020, genres: ['Action'] },
      JPEG, 'jpg'
    );

    const backupsDir = path.join(base, 'data', 'backups');
    assert.ok(fs.existsSync(backupsDir), 'backups directory exists');
    const backups = fs.readdirSync(backupsDir).filter(f => f.startsWith('catalog_backup'));
    assert.ok(backups.length >= 1, 'at least one backup was created');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('creates an Animation movie in Animation/ folder', async () => {
    const base = path.join(os.tmpdir(), 'mc-anim-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Animation'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'Finding Nemo', type: 'Animation', genres: [] },
      JPEG, 'jpg'
    );

    assert.ok(result.id, 'has id');
    assert.equal(result.type, 'Animation');
    const files = fs.readdirSync(path.join(lib, 'Animation'));
    assert.ok(files.some(f => f.includes('Finding Nemo')), 'file in Animation folder');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('creates an Iranian movie in Iranian/ folder', async () => {
    const base = path.join(os.tmpdir(), 'mc-iran-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Iranian'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'Gav', type: 'Iranian', genres: [] },
      JPEG, 'jpg'
    );

    assert.ok(result.id, 'has id');
    assert.equal(result.type, 'Iranian');
    const files = fs.readdirSync(path.join(lib, 'Iranian'));
    assert.ok(files.some(f => f.includes('Gav')), 'file in Iranian folder');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('creates a Series in Serries/ folder (no id)', async () => {
    const base = path.join(os.tmpdir(), 'mc-series-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Serries'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const result = await mc.createMovie(
      { title: 'Breaking Bad', type: 'Series', genres: [] },
      JPEG, 'jpg'
    );

    assert.equal(result.id, null, 'Series has no id');
    assert.equal(result.type, 'Series');
    assert.ok(result.uid.startsWith('series:'), 'uid starts with series:');
    const files = fs.readdirSync(path.join(lib, 'Serries'));
    assert.ok(files.some(f => f.includes('Breaking Bad')), 'file in Serries folder');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('rejects duplicate ID', async () => {
    const base = path.join(os.tmpdir(), 'mc-dup-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    await mc.createMovie(
      { title: 'First', type: 'Movie', year: 2020, genres: ['Action'], id: '0001' },
      JPEG, 'jpg'
    );

    await assert.rejects(
      () => mc.createMovie(
        { title: 'Second', type: 'Movie', year: 2021, genres: ['Action'], id: '0001' },
        JPEG, 'jpg'
      ),
      /0001/,
      'must reject duplicate ID'
    );

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('rejects invalid year for Movie type', async () => {
    const base = path.join(os.tmpdir(), 'mc-year-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    // Year too old
    await assert.rejects(
      () => mc.createMovie({ title: 'Old', type: 'Movie', year: 1800, genres: ['Action'] }, JPEG, 'jpg'),
      /1900/,
      'must reject year before 1900'
    );

    // Year missing
    await assert.rejects(
      () => mc.createMovie({ title: 'NoYear', type: 'Movie', genres: ['Action'] }, JPEG, 'jpg'),
      /سال انتشار/,
      'must reject missing year for Movie'
    );

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('cleans up temp files on failure (rollback)', async () => {
    const base = path.join(os.tmpdir(), 'mc-rollback-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    // Pre-create a file that will cause duplicate error
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Dup 2020.jpg'), JPEG);

    await assert.rejects(
      () => mc.createMovie(
        { title: 'Dup', type: 'Movie', year: 2020, genres: ['Action'], id: '0001' },
        JPEG, 'jpg'
      ),
      /قبلاً/,
      'must reject duplicate'
    );

    // Verify no temp files left behind — and never inside Library (DATA-13)
    const tmpDir = path.join(lib, '.tmp');
    assert.ok(!fs.existsSync(tmpDir), 'no .tmp directory left after rollback');

    // Verify catalog still has 0 movies (rollback) — flush first so disk matches index
    quiet(() => idx.flush());
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.movies.length, 0, 'catalog has 0 movies after rollback');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('generates unique IDs for consecutive movies', async () => {
    const base = path.join(os.tmpdir(), 'mc-ids-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    const m1 = await mc.createMovie(
      { title: 'First', type: 'Movie', year: 2020, genres: ['Action'] },
      JPEG, 'jpg'
    );
    const m2 = await mc.createMovie(
      { title: 'Second', type: 'Movie', year: 2021, genres: ['Action'] },
      JPEG, 'jpg'
    );

    assert.notEqual(m1.id, m2.id, 'IDs must be unique');
    assert.ok(m2.id > m1.id, 'IDs must increment');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('DATA-13: temp upload never lands inside Library/', async () => {
    const base = path.join(os.tmpdir(), 'mc-data13-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    await mc.createMovie(
      { title: 'Tmp Check', type: 'Movie', year: 2020, genres: ['Action'] },
      JPEG, 'jpg'
    );

    assert.ok(!fs.existsSync(path.join(lib, '.tmp')), 'Library/.tmp must not be created');
    const rootEntries = fs.readdirSync(lib);
    assert.ok(!rootEntries.some(n => n.startsWith('.tmp') || n.startsWith('upload_')),
      `no temp artifacts under Library (entries: ${rootEntries})`);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('A5: createMovie does not call saveToDisk synchronously (debounced via scheduleSave)', async () => {
    const base = path.join(os.tmpdir(), 'mc-a5-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);

    let saveCalls = 0;
    const orig = idx.saveToDisk.bind(idx);
    idx.saveToDisk = function (...args) {
      saveCalls += 1;
      return orig(...args);
    };

    const t0 = Date.now();
    await mc.createMovie(
      { title: 'Async Save', type: 'Movie', year: 2020, genres: ['Action'] },
      JPEG, 'jpg'
    );
    const elapsed = Date.now() - t0;

    assert.equal(saveCalls, 0, 'saveToDisk must not run inside createMovie');
    assert.ok(elapsed < 500, `createMovie returned in ${elapsed}ms; must not wait for the debounced write`);

    await new Promise((r) => setTimeout(r, 700));
    assert.ok(saveCalls >= 1, `expected debounced saveToDisk after create, got ${saveCalls}`);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── P6c E2 — structured error codes so the client can tell causes apart ───

describe('P6c E2 structured create errors (FE-13)', () => {
  let seq = 0;

  function makeCreator() {
    const base = path.join(os.tmpdir(), 'mc-p6c-' + Date.now() + '-' + (++seq));
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const catalogPath = path.join(base, 'data', 'catalog.json');
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());
    const mc = new MovieCreator(lib, catalogPath, idx, null);
    return { base, lib, idx, mc };
  }

  async function rejects(fn) {
    try {
      await fn();
    } catch (err) {
      return err;
    }
    return null;
  }

  it('validation failures carry structured codes; statusOf maps them to 400', async () => {
    const { base, mc } = makeCreator();

    const noTitle = await rejects(() =>
      mc.createMovie({ type: 'Movie', year: 2020, genres: ['Action'] }, JPEG, 'jpg'));
    assert.ok(noTitle, 'missing title must reject');
    assert.equal(noTitle.code, 'TITLE_REQUIRED', `code expected: ${noTitle.message}`);
    assert.equal(MovieCreator.statusOf(noTitle), 400);
    assert.ok(/عنوان/.test(noTitle.message), 'Persian message kept');

    const noYear = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Movie', genres: ['Action'] }, JPEG, 'jpg'));
    assert.equal(noYear.code, 'YEAR_INVALID', `code expected: ${noYear.message}`);
    assert.equal(MovieCreator.statusOf(noYear), 400);

    const noGenres = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Movie', year: 2020 }, JPEG, 'jpg'));
    assert.equal(noGenres.code, 'GENRE_REQUIRED', `code expected: ${noGenres.message}`);
    assert.equal(MovieCreator.statusOf(noGenres), 400);

    const badGenre = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Movie', year: 2020, genres: ['../x'] }, JPEG, 'jpg'));
    assert.equal(badGenre.code, 'GENRE_INVALID', `code expected: ${badGenre.message}`);
    assert.equal(MovieCreator.statusOf(badGenre), 400);

    const badType = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Nope', year: 2020, genres: ['Action'] }, JPEG, 'jpg'));
    assert.equal(badType.code, 'TYPE_INVALID', `code expected: ${badType.message}`);
    assert.equal(MovieCreator.statusOf(badType), 400);

    const noPoster = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Movie', year: 2020, genres: ['Action'] }, null, 'jpg'));
    assert.equal(noPoster.code, 'IMG_REQUIRED', `code expected: ${noPoster.message}`);
    assert.equal(MovieCreator.statusOf(noPoster), 400);

    const badExt = await rejects(() =>
      mc.createMovie({ title: 'X', type: 'Movie', year: 2020, genres: ['Action'] }, JPEG, 'gif'));
    assert.equal(badExt.code, 'IMG_UNSUPPORTED', `code expected: ${badExt.message}`);
    assert.equal(MovieCreator.statusOf(badExt), 400);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('conflicts carry ID_TAKEN; statusOf maps it to 409', async () => {
    const { base, mc } = makeCreator();

    await mc.createMovie(
      { id: '0042', title: 'First', type: 'Movie', year: 2020, genres: ['Action'] }, JPEG, 'jpg');

    const dupId = await rejects(() =>
      mc.createMovie({ id: '0042', title: 'Second', type: 'Movie', year: 2021, genres: ['Action'] }, JPEG, 'jpg'));
    assert.ok(dupId, 'duplicate id must reject');
    assert.equal(dupId.code, 'ID_TAKEN', `code expected: ${dupId.message}`);
    assert.equal(MovieCreator.statusOf(dupId), 409, 'taken id is a conflict (409), not a generic 400');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('a colliding target file carries FILE_EXISTS; statusOf maps it to 409', async () => {
    const { base, lib, mc } = makeCreator();
    // Poster file on disk the (fresh) index knows nothing about
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0042- Dup 2002.jpg'), JPEG);

    const err = await rejects(() =>
      mc.createMovie({ id: '0042', title: 'Dup', type: 'Movie', year: 2002, genres: ['Action'] }, JPEG, 'jpg'));
    assert.ok(err, 'colliding target file must reject');
    assert.equal(err.code, 'FILE_EXISTS', `code expected: ${err.message}`);
    assert.equal(MovieCreator.statusOf(err), 409, 'existing target file is a conflict (409)');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('statusOf: unknown errors fall back to 500', () => {
    assert.equal(MovieCreator.statusOf(new Error('boom')), 500);
  });

  it('F33 create: metadata persist failure → PERSIST_FAILED, no file written, not indexed; succeeds once writable', async () => {
    const base = path.join(os.tmpdir(), 'mc-f33-' + Date.now());
    const lib = path.join(base, 'Library');
    const dataDir = path.join(base, 'data');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'catalog.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.saveToDisk());

    let flushResult = false;
    const store = {
      items: new Map(),
      get(k) { return this.items.get(k) || null; },
      set(k, p) { this.items.set(k, p); },
      rename(o, n) { const e = this.items.get(o); if (e) { this.items.delete(o); this.items.set(n, e); } },
      remove(k) { this.items.delete(k); },
      flush() { return flushResult; }
    };
    const mc = new MovieCreator(lib, catalogPath, idx, null, store);

    await assert.rejects(
      () => mc.createMovie({ title: 'F33 Movie', type: 'Movie', year: 2020, genres: ['Action'], imdbRating: 8.0 }, JPEG, 'jpg'),
      (err) => err.code === 'PERSIST_FAILED'
    );

    // Nothing written to disk, nothing indexed (previous state served)
    assert.equal(fs.readdirSync(path.join(lib, 'Movies', 'Action')).length, 0, 'no poster file left after failed create');
    assert.equal(idx.count, 0, 'nothing indexed after failed create');

    // Failure removed → create succeeds and persists metadata
    flushResult = true;
    const movie = await mc.createMovie({ title: 'F33 Movie', type: 'Movie', year: 2020, genres: ['Action'], imdbRating: 8.0 }, JPEG, 'jpg');
    assert.ok(movie.id, 'movie created');
    assert.ok(fs.readdirSync(path.join(lib, 'Movies', 'Action')).some(f => f.startsWith(movie.id + '-')), 'poster file written');
    assert.ok(idx.getMovieById(movie.id), 'movie indexed');
    assert.equal(store.get(movie.uid).imdbRating, 8.0, 'metadata persisted once store writable');

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});
