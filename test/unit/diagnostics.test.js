'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const CatalogIndexer = require('../../backend/indexer');
const Diagnostics = require('../../backend/diagnostics');
const { scanLibrary } = require('../../backend/scanner');
const { makeLibrary } = require('../helpers/fixture-library');
const { readJsonSafe } = require('../../backend/storage/atomic-json');
const { clearWarnings, getWarnings } = require('../../backend/storage/warnings');

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

describe('Diagnostics (characterization)', () => {
  it('runFullReport returns correct shape', () => {
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Series/Breaking Bad.jpg': true,
    });
    const catalogPath = path.join(os.tmpdir(), 'diag-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const diag = new Diagnostics(idx, lib);

    const report = diag.runFullReport();

    // Verify shape
    assert.ok(report.timestamp, 'report has timestamp');
    assert.ok(report.summary, 'report has summary');
    assert.equal(typeof report.summary.totalMovies, 'number');
    assert.equal(typeof report.summary.totalFiles, 'number');
    assert.ok(report.issues, 'report has issues');
    assert.ok(report.stats, 'report has stats');
    assert.ok(Array.isArray(report.issues.duplicateIds));
    assert.ok(Array.isArray(report.issues.missingPosters));
    assert.ok(Array.isArray(report.issues.emptyGenres));

    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
  });

  it('AC2/A7: storage warnings from a corrupt orders.json appear in diagnostics.storage.warnings', () => {
    clearWarnings();
    const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
    const catalogPath = path.join(os.tmpdir(), 'diag-sw-' + Date.now() + '.json');
    const ordersPath = path.join(os.tmpdir(), 'diag-orders-' + Date.now() + '.json');
    fs.writeFileSync(ordersPath, '{"orders":[{"id":"order-0007","number":7,"createdBy":"SENTINEL"}');

    const recovered = readJsonSafe(ordersPath, { backupDir: path.join(os.tmpdir(), 'no-such-backups') });
    assert.equal(recovered.status, 'corrupt', 'precondition: corrupt file quarantined');

    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const diag = new Diagnostics(idx, lib);
    const report = diag.runFullReport();

    assert.ok(report.storage, 'report has storage section');
    assert.ok(Array.isArray(report.storage.warnings), 'storage.warnings is an array');
    const w = report.storage.warnings.find((x) => x.kind === 'corrupt-quarantined' && String(x.file).includes('diag-orders'));
    assert.ok(w, `expected corrupt-quarantined warning for orders, got: ${JSON.stringify(report.storage.warnings)}`);
    assert.ok(w.at, 'warning has timestamp');

    clearWarnings();
    assert.deepEqual(getWarnings(), [], 'registry cleared for other tests');
    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
    try { fs.rmSync(ordersPath); } catch {}
    const dirOrders = path.dirname(ordersPath);
    try {
      for (const n of fs.readdirSync(dirOrders)) {
        if (n.startsWith('diag-orders') && n.includes('.corrupt-')) fs.rmSync(path.join(dirOrders, n));
      }
    } catch {}
  });

  it('counts type distribution correctly', () => {
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Movies/Drama/0002- Inception 2010.jpg': true,
      'Series/Breaking Bad.jpg': true,
    });
    const catalogPath = path.join(os.tmpdir(), 'diag-types-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const diag = new Diagnostics(idx, lib);

    const report = diag.runFullReport();
    assert.ok(report.summary.typeCounts.Movie >= 2, 'at least 2 movies');
    assert.ok(report.summary.typeCounts.Series >= 1, 'at least 1 series');

    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
  });

  it('B9: invalidFilenames from last scan, orphanMetadata from metadata store, games in summary', () => {
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true,
      'Movies/Action/broken-name.jpg': true,
      'Games/PS4/FIFA 24.jpg': true,
    });
    const catalogPath = path.join(os.tmpdir(), 'diag-b9-' + Date.now() + '.json');
    const metaPath = path.join(os.tmpdir(), 'diag-b9-meta-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    const scan = quiet(() => scanLibrary(lib));
    quiet(() => idx.replaceFromScan(scan.results));
    idx.setLastInvalid(scan.invalid || []);

    const MetadataStore = require('../../backend/storage/metadata-store');
    const meta = new MetadataStore(metaPath);
    meta.set('series:gone', { imdbRating: 8.0, plotSummary: 'orphan' });
    meta.set('0001', { imdbRating: 9.0, plotSummary: 'attached' });

    const { scanGames } = require('../../backend/scanner');
    quiet(() => idx.processGameResults(quiet(() => scanGames(lib)).results));

    const diag = new Diagnostics(idx, lib, meta);
    const report = diag.runFullReport();

    assert.ok(Array.isArray(report.issues.invalidFilenames), 'invalidFilenames is an array');
    const invalid = report.issues.invalidFilenames;
    assert.ok(invalid.length >= 1, `expected at least 1 invalid file, got ${invalid.length}`);
    assert.ok(invalid.some(x => String(x.file).includes('broken-name')), `invalid includes broken-name: ${JSON.stringify(invalid)}`);
    assert.ok(invalid.every(x => x.reason), 'each invalid has a reason');

    assert.ok(report.issues.orphanMetadata.some(o => o.key === 'series:gone'),
      `orphanMetadata includes series:gone: ${JSON.stringify(report.issues.orphanMetadata)}`);
    assert.ok(!report.issues.orphanMetadata.some(o => o.key === '0001'),
      '0001 is not orphan');

    assert.equal(report.summary.totalGames, 1, 'games included in summary');
    assert.ok(report.summary.typeCounts.Game >= 1, 'Game in typeCounts');

    // No per-movie existsSync: report still built when absolutePosterPath is in file index
    assert.ok(report.summary.totalFiles >= 1, 'file index counted');

    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
    try { fs.rmSync(metaPath); } catch {}
  });

  it('B9: report is cached for 30s and invalidate() forces rebuild', () => {
    const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
    const catalogPath = path.join(os.tmpdir(), 'diag-cache-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const diag = new Diagnostics(idx, lib);

    const r1 = diag.runFullReport();
    const r2 = diag.runFullReport();
    assert.equal(r1, r2, 'second call returns cached object identity');

    diag.invalidate();
    const r3 = diag.runFullReport();
    assert.notEqual(r1, r3, 'invalidate() forces a fresh report');
    assert.equal(r3.summary.totalMovies, r1.summary.totalMovies);

    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
  });

  it('B9: missing posters come from file index membership (no disk stat required)', () => {
    const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
    const catalogPath = path.join(os.tmpdir(), 'diag-mp-' + Date.now() + '.json');
    const idx = new CatalogIndexer(catalogPath);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const movie = Array.from(idx._movieMap.values())[0];
    assert.ok(movie, 'precondition: movie indexed');
    const pathOnDisk = movie.absolutePosterPath;
    assert.ok(pathOnDisk, 'raw map entry has absolutePosterPath');
    assert.ok(idx.getMovies()[0], 'public getMovies still works');

    // Simulate deleted poster without touching real FS stats path: clear file index entry
    idx._fileIndex.delete(pathOnDisk);
    const diag = new Diagnostics(idx, lib);
    const report = diag.runFullReport();
    assert.ok(report.issues.missingPosters.some(m => m.id === movie.id),
      'poster missing when path not in file index');

    // Restore
    idx._fileIndex.set(pathOnDisk, { id: movie.id, key: movie.uid, lastModified: Date.now() });
    diag.invalidate();
    const report2 = diag.runFullReport();
    assert.ok(!report2.issues.missingPosters.some(m => m.id === movie.id),
      'poster present when path is in file index');

    try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(catalogPath); } catch {}
  });
});
