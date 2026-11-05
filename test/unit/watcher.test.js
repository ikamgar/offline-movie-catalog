'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const CatalogIndexer = require('../../backend/indexer');
const LibraryWatcher = require('../../backend/watcher');
const { scanLibrary } = require('../../backend/scanner');
const MetadataStore = require('../../backend/storage/metadata-store');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Snapshot of public catalog state for order-independence comparison (AC2). */
function snapshot(idx) {
  return idx.getMovies().map(m => ({
    uid: m.uid,
    id: m.id,
    title: m.title,
    year: m.year,
    genres: [...(m.genres || [])].sort(),
    type: m.type,
    imdbRating: m.imdbRating,
    plotSummary: m.plotSummary
  })).sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}

describe('Watcher (characterization)', () => {
  it('hot-added Movie file appears in the index', async () => {
    const base = path.join(os.tmpdir(), 'watch-char-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Precondition: index is empty
    assert.equal(idx.count, 0, 'precondition: index starts empty');

    // Add a file
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    await sleep(1600);
    w.stop();

    const movie = idx.getMovies().find(m => m.id === '0001');
    assert.ok(movie, 'movie 0001 should appear in index');
    assert.equal(movie.title, 'Heat');
    assert.equal(movie.year, 1995, 'year preserved via shared scanFile');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('deleted Movie file is removed from the index', async () => {
    const base = path.join(os.tmpdir(), 'watch-del-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const filePath = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
    fs.writeFileSync(filePath, JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie before delete');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Delete the file
    fs.unlinkSync(filePath);
    await sleep(1600);
    w.stop();

    assert.equal(idx.count, 0, 'movie should be removed after file deletion');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('onChange callback fires on file add with {added,updated,removed} shape', async () => {
    const base = path.join(os.tmpdir(), 'watch-cb-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const diffs = [];
    const w = new LibraryWatcher(lib, idx, (diff) => { diffs.push(diff); });
    quiet(() => w.start());

    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    await sleep(1600);
    w.stop();

    assert.ok(diffs.length >= 1, `onChange should fire at least once, got ${diffs.length}`);
    const last = diffs[diffs.length - 1];
    assert.equal(typeof last.added, 'number', 'diff.added is a number');
    assert.equal(typeof last.updated, 'number', 'diff.updated is a number');
    assert.equal(typeof last.removed, 'number', 'diff.removed is a number');
    assert.ok(last.added >= 1, 'at least one add');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('delete one copy of a multi-genre movie keeps the movie (different copy remains)', async () => {
    const base = path.join(os.tmpdir(), 'watch-multi-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    const actionPath = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
    const dramaPath = path.join(lib, 'Movies', 'Drama', '0001- Heat 1995.jpg');
    fs.writeFileSync(actionPath, JPEG);
    fs.writeFileSync(dramaPath, JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie from 2 copies');
    assert.deepEqual(idx.getMovieById('0001').genres.sort(), ['Action', 'Drama']);

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Delete the Action copy
    fs.unlinkSync(actionPath);
    await sleep(1600);
    w.stop();

    const movie = idx.getMovieById('0001');
    assert.ok(movie, 'movie should still exist after deleting one copy');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('delete the only copy of a movie removes it from the index', async () => {
    const base = path.join(os.tmpdir(), 'watch-only-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const filePath = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
    fs.writeFileSync(filePath, JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    fs.unlinkSync(filePath);
    await sleep(1600);
    w.stop();

    assert.equal(idx.count, 0, 'movie removed after deleting only copy');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('watcher watches all pre-existing sub-directories', async () => {
    const base = path.join(os.tmpdir(), 'watch-subdir-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Both sub-directories are watched from the start
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Movies', 'Drama', '0002- Inception 2010.jpg'), JPEG);
    await sleep(2100);
    w.stop();

    const m1 = idx.getMovieById('0001');
    const m2 = idx.getMovieById('0002');
    assert.ok(m1, 'movie in Action folder indexed');
    assert.ok(m2, 'movie in Drama folder indexed');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('watcher stops cleanly without lingering timers', async () => {
    const base = path.join(os.tmpdir(), 'watch-stop-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Add some files to trigger watchers
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);
    await sleep(600);
    w.stop();

    // If stop() didn't clean up, node --test would hang
    assert.ok(true, 'watcher stopped without hanging');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

describe('B6 — order-independent reconcile (AC2)', () => {
  /**
   * Run one rename scenario end-to-end with the given event order.
   * Returns { state, metadataIntact }.
   */
  async function runRenameScenario(order) {
    const base = path.join(os.tmpdir(), 'b6-ac2-' + order + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    const lib = path.join(base, 'Library');
    const actionDir = path.join(lib, 'Movies', 'Action');
    fs.mkdirSync(actionDir, { recursive: true });

    const oldP = path.join(actionDir, '0001- Heat 1995.jpg');
    const newP = path.join(actionDir, '0001- Heat Renamed 1995.jpg');
    fs.writeFileSync(oldP, JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie indexed');

    // Durable metadata (P2) — must survive remove→add either order
    const metaPath = path.join(base, 'metadata.json');
    const store = new MetadataStore(metaPath, { backupDir: path.join(base, 'backups') });
    quiet(() => store.load());
    store.set('0001', { imdbRating: 8.3, plotSummary: 'A heist story' });
    quiet(() => store.flush());
    idx.setMetadataStore(store);
    // Attach onto the in-memory movie too (as PUT would)
    const m = idx.getMovieById('0001');
    m.imdbRating = 8.3;
    m.plotSummary = 'A heist story';
    m.year = 1995;

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    if (order === 'remove-then-add') {
      fs.unlinkSync(oldP);
      fs.writeFileSync(newP, JPEG);
    } else {
      // add-then-remove: both files coexist briefly, then old is gone
      fs.writeFileSync(newP, JPEG);
      fs.unlinkSync(oldP);
    }

    await sleep(1600);
    w.stop();

    const after = idx.getMovieById('0001');
    const state = snapshot(idx);
    const metadataIntact = !!after
      && after.imdbRating === 8.3
      && after.plotSummary === 'A heist story'
      && after.year === 1995
      && after.title === 'Heat Renamed'
      && fs.existsSync(newP)
      && !fs.existsSync(oldP);

    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
    return { state, metadataIntact, count: idx.count };
  }

  it('AC2: {remove-old, add-new} and {add-new, remove-old} → identical final state, metadata intact', async () => {
    const a = await runRenameScenario('remove-then-add');
    const b = await runRenameScenario('add-then-remove');

    assert.equal(a.count, 1, 'order A: exactly one movie');
    assert.equal(b.count, 1, 'order B: exactly one movie');
    assert.deepEqual(a.state, b.state, 'final catalog state must be identical regardless of event order');
    assert.ok(a.metadataIntact, 'order A: metadata (rating/plot/year/title) must survive the rename');
    assert.ok(b.metadataIntact, 'order B: metadata (rating/plot/year/title) must survive the rename');
  });

  it('B6: new directory is watched and its files are indexed', async () => {
    const base = path.join(os.tmpdir(), 'b6-newdir-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies'), { recursive: true });

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    const newDir = path.join(lib, 'Movies', 'SciFi');
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, '0007- Arrival 2016.jpg'), JPEG);
    await sleep(1600);
    w.stop();

    const movie = idx.getMovieById('0007');
    assert.ok(movie, 'movie in newly created directory must be indexed');
    assert.equal(movie.title, 'Arrival');
    assert.equal(movie.year, 2016);
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('B6: deleting a whole directory removes its files; movie removed only when no copy remains', async () => {
    const base = path.join(os.tmpdir(), 'b6-deldir-' + Date.now());
    const lib = path.join(base, 'Library');
    const actionDir = path.join(lib, 'Movies', 'Action');
    const dramaDir = path.join(lib, 'Movies', 'Drama');
    fs.mkdirSync(actionDir, { recursive: true });
    fs.mkdirSync(dramaDir, { recursive: true });
    fs.writeFileSync(path.join(actionDir, '0001- Heat 1995.jpg'), JPEG);
    fs.writeFileSync(path.join(dramaDir, '0001- Heat 1995.jpg'), JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie, 2 copies');
    assert.deepEqual(idx.getMovieById('0001').genres.sort(), ['Action', 'Drama']);

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Delete only the Action directory — Drama copy remains
    fs.rmSync(actionDir, { recursive: true, force: true });
    await sleep(1600);
    w.stop();

    const kept = idx.getMovieById('0001');
    assert.ok(kept, 'movie must remain while Drama copy exists');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('B6: expect(paths) suppresses server-initiated events until TTL', async () => {
    const base = path.join(os.tmpdir(), 'b6-expect-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    const diffs = [];
    const w = new LibraryWatcher(lib, idx, (d) => diffs.push(d));
    quiet(() => w.start());

    const suppressed = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
    w.expect([suppressed], 3000);
    fs.writeFileSync(suppressed, JPEG);
    await sleep(1600);
    assert.equal(idx.count, 0, 'expected path must not be indexed');
    assert.equal(diffs.length, 0, 'onChange must not fire for expected path');

    // After TTL, a different file is processed normally
    const allowed = path.join(lib, 'Movies', 'Action', '0002- Inception 2010.jpg');
    fs.writeFileSync(allowed, JPEG);
    await sleep(1600);
    w.stop();
    assert.ok(idx.getMovieById('0002'), 'non-expected path still processed after expect');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('B6: Games changes go to the games pipeline, never the movie index', async () => {
    const base = path.join(os.tmpdir(), 'b6-games-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS5'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'GTA V.jpg'), JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const { scanGames } = require('../../backend/scanner');
    quiet(() => idx.processGameResults(quiet(() => scanGames(lib)).results));
    assert.equal(idx.count, 0, 'precondition: Games never in movie index');
    assert.equal(idx.getGames().length, 1, 'precondition: 1 game indexed');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Hot-add another game poster
    fs.writeFileSync(path.join(lib, 'Games', 'PS5', 'Spider-Man.jpg'), JPEG);
    await sleep(1600);
    w.stop();

    assert.equal(idx.count, 0, 'Games must never appear in movie index');
    const titles = idx.getGames().map(g => g.title);
    assert.ok(titles.some(t => /spider/i.test(t)), `expected Spider-Man in games, got: ${titles.join(', ')}`);
    assert.ok(titles.some(t => /gta/i.test(t)), `expected GTA V in games, got: ${titles.join(', ')}`);
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('F31: watcher removes a dropped game platform (not just whole games)', async () => {
    const base = path.join(os.tmpdir(), 'f31-watch-platform-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS5'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Cyberpunk 2077.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Games', 'PS5', 'Cyberpunk 2077.jpg'), JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.processGameResults(quiet(() => require('../../backend/scanner').scanGames(lib)).results));
    let g = idx.getGameByTitle('Cyberpunk 2077');
    assert.ok(g, 'precondition: game indexed');
    assert.deepEqual(g.platforms, ['PS4', 'PS5'], 'precondition: both platforms indexed');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Delete the PS5 copy only
    fs.unlinkSync(path.join(lib, 'Games', 'PS5', 'Cyberpunk 2077.jpg'));
    await sleep(1600);
    w.stop();

    g = idx.getGameByTitle('Cyberpunk 2077');
    assert.ok(g, 'game still indexed after platform drop');
    assert.deepEqual(g.platforms, ['PS4'], 'dropped PS5 platform removed from index');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('F31: watcher removes a game when all its files are deleted', async () => {
    const base = path.join(os.tmpdir(), 'f31-watch-all-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Resident Evil.jpg'), JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.processGameResults(quiet(() => require('../../backend/scanner').scanGames(lib)).results));
    assert.equal(idx.getGames().length, 1, 'precondition: 1 game indexed');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // Delete the only copy
    fs.unlinkSync(path.join(lib, 'Games', 'PS4', 'Resident Evil.jpg'));
    await sleep(1600);
    w.stop();

    assert.equal(idx.getGames().length, 0, 'game removed from index when all files gone');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});

// ─── P6b D6 — the watcher must mirror the scanner's dot-folder skip ─────────

describe('P6b D6 — root dot-folders (.trash) are invisible to the watcher', () => {
  it('a root-level reconcile never (re-)indexes files under .trash; .trash is never watched', async () => {
    const base = path.join(os.tmpdir(), 'watch-dot-' + Date.now());
    const lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG);

    const idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    assert.equal(idx.count, 1, 'precondition: 1 movie indexed');

    const w = new LibraryWatcher(lib, idx, () => {});
    quiet(() => w.start());

    // A deleted copy parked in .trash looks like a perfectly valid Movie file
    // to scanFile — classifyFromPath would call it a Movie with a garbage genre.
    const trashFile = path.join(lib, '.trash', '1700000000000', 'Movies', 'Action', '0001- Heat 1999.jpg');
    fs.mkdirSync(path.dirname(trashFile), { recursive: true });
    fs.writeFileSync(trashFile, JPEG);

    // Dirty the Library ROOT so a full-root reconcile runs (new top-level folder)
    fs.mkdirSync(path.join(lib, 'Iranian'));
    await sleep(1600);
    w.stop();

    assert.ok(!w._watchers.has(path.join(lib, '.trash')), 'watcher must never watch .trash');

    const paths = [...idx._fileIndex.keys()];
    assert.ok(!paths.some(p => p.includes(`${path.sep}.trash${path.sep}`)),
      `no index entry may point into .trash: ${JSON.stringify(paths)}`);

    const m = idx.getMovieById('0001');
    const genres = m ? m.genres : [];
    assert.ok(!genres.includes('1700000000000'),
      `trash folder name must never leak into genres: ${genres}`);
    assert.equal(idx.count, 1, 'catalog count unchanged');
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });
});
