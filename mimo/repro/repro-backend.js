'use strict';
/**
 * Backend reproductions for defects in mimo/DEFECT-REGISTER.md.
 * Run:  node mimo/repro/repro-backend.js      (needs no npm install: only fs/path modules of the project are loaded)
 * Exit code 1 while any bug is PRESENT.
 */
const { req, tmp, mk, touch, sleep, quiet, quietAsync, check, done, path, fs } = require('./_lib');

const { parseFilename, cleanTitle } = req('backend/parser');
const { scanLibrary } = req('backend/scanner');
const CatalogIndexer = req('backend/indexer');
const LibraryWatcher = req('backend/watcher');
const OrderManager = req('server/orders/order-manager');
const MovieCreator = req('backend/services/movie-creator');

(async () => {
  // ---------------- parser ----------------
  await check('DATA-12', 'cleanTitle must not strip real title words (or drop the file)', () => {
    const cases = { "Charlotte's Web": "Charlotte's Web", 'The Amazon': 'The Amazon', 'Dark Web': 'Dark Web', 'Extended Family': 'Extended Family' };
    const bad = Object.entries(cases).filter(([i, o]) => cleanTitle(i) !== o).map(([i]) => `${i} -> ${cleanTitle(i)}`);
    const apple = parseFilename('0001- Apple 2020.jpg', 'Movie');
    if (!apple) bad.push('"0001- Apple 2020.jpg" is dropped entirely');
    return { present: bad.length > 0, detail: bad.join(' | ') };
  });

  await check('DATA-17', 'documented format with resolution tag must parse (year != 1080)', () => {
    const r = parseFilename('5273 - The Dark Knight (2008) [1080p] [BluRay].jpg', 'Movie');
    return { present: !r || r.year !== 2008 || r.title !== 'The Dark Knight', detail: JSON.stringify(r) };
  });

  await check('DATA-18', '7+ digit ID must be rejected or parsed whole, never split', () => {
    const r = parseFilename('1234567- Inception 2010.jpg', 'Movie');
    return { present: !!r && r.id === '123456', detail: JSON.stringify(r) };
  });

  await check('DATA-11', 'Animation/Iranian keep the year when the filename has one', () => {
    const r = parseFilename('00012-Cars 2006.jpg', 'Animation');
    return { present: !r || r.year !== 2006, detail: JSON.stringify(r) };
  });

  // ---------------- scanner ----------------
  await check('DATA-04', 'Library/Games images must never become movie entries', () => {
    const lib = tmp('lib-games-');
    touch(path.join(lib, 'Games', 'PS4', '007 Legends.jpg'));
    touch(path.join(lib, 'Games', 'PS5', '2K24.jpg'));
    const { results } = quiet(() => scanLibrary(lib));
    return { present: results.length > 0, detail: JSON.stringify(results.map((r) => ({ id: r.id, title: r.title, type: r.type }))) };
  });

  // ---------------- indexer ----------------
  await check('DATA-05', 'Movie 0001 and Iranian 0001 must both survive a scan (or be reported, never silently dropped)', () => {
    const lib = tmp('lib-ids-');
    touch(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'));
    touch(path.join(lib, 'Iranian', '0001-Gav.jpg'));
    const idx = new CatalogIndexer(path.join(lib, 'catalog.json'));
    const { results } = quiet(() => scanLibrary(lib));
    quiet(() => idx.replaceFromScan(results));
    return { present: idx.count < 2, detail: `${results.length} poster files -> ${idx.count} indexed` };
  });

  await check('DATA-06', 'poster lookup must survive titles containing %', () => {
    const lib = tmp('lib-pct-');
    touch(path.join(lib, 'Series', '100% Wolf.jpg'));
    const idx = new CatalogIndexer(path.join(lib, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    const url = idx.getMovies()[0].poster;                                // what the client requests
    const expressParam = decodeURIComponent(url.split('/').pop());        // Express already decodes once
    try { idx.getPosterPath(expressParam); return { present: false }; }
    catch (e) { return { present: true, detail: `${e.name}: ${e.message}` }; }
  });

  // ---------------- orders ----------------
  await check('DATA-07', 'deleted order numbers must never be reused (even after restart)', () => {
    const f = path.join(tmp('ord-'), 'orders.json');
    let om = quiet(() => new OrderManager(f));
    quiet(() => om.createOrder([{ uid: '1', title: 'A' }], 'admin'));
    const b = quiet(() => om.createOrder([{ uid: '2', title: 'B' }], 'admin'));
    quiet(() => om.deleteOrder(b.id));
    om = quiet(() => new OrderManager(f));
    const c = quiet(() => om.createOrder([{ uid: '3', title: 'C' }], 'admin'));
    return { present: c.id === b.id, detail: `deleted ${b.id}, next created ${c.id}` };
  });

  await check('DATA-08', 'a corrupted orders.json must not be silently overwritten', () => {
    const dir = tmp('ord-corrupt-'); const f = path.join(dir, 'orders.json');
    fs.writeFileSync(f, '{"orders":[{"id":"order-0007","number":7,"createdBy":"SENTINEL-HISTORY","movies":[]}]');   // truncated JSON (missing closing brace)
    const om = quiet(() => new OrderManager(f));
    quiet(() => om.createOrder([{ uid: '1', title: 'A' }], 'admin'));
    const after = fs.readFileSync(f, 'utf8');
    const siblings = fs.readdirSync(dir);
    const preserved = after.includes('SENTINEL-HISTORY') || siblings.some((n) => n !== 'orders.json' && fs.readFileSync(path.join(dir, n), 'utf8').includes('SENTINEL-HISTORY'));
    return { present: !preserved, detail: preserved ? '' : 'previous order history is gone (no quarantine copy)' };
  });

  // ---------------- creator ----------------
  await check('SEC-03', 'createMovie must not write outside Library (id / genre traversal)', async () => {
    const base = tmp('lib-trav-'); const lib = path.join(base, 'Library'); mk(lib, 'Movies', 'Action');
    const catalogPath = path.join(base, 'data', 'catalog.json');
    const idx = quiet(() => new CatalogIndexer(catalogPath));
    quiet(() => { mk(base, 'data'); idx.saveToDisk(); });
    const mc = quiet(() => new MovieCreator(lib, catalogPath, idx, null));
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(64)]);
    let outcome = 'rejected';
    try { await quietAsync(() => mc.createMovie({ title: 'T', type: 'Movie', year: 2020, genres: ['Action'], id: '../../../evil' }, jpeg, 'jpg')); outcome = 'accepted'; } catch { /* rejected is the desired outcome */ }
    const escaped = fs.readdirSync(base).filter((n) => n !== 'Library' && n !== 'data');
    return { present: escaped.length > 0, detail: escaped.length ? `file written outside Library: ${escaped.join(', ')}` : `request ${outcome}` };
  });

  // ---------------- watcher (real fs events) ----------------
  await check('DATA-02', 'watcher: hot-added Movie keeps its year; hot-added Series appears', async () => {
    const lib = tmp('lib-watch-'); mk(lib, 'Movies', 'Action'); mk(lib, 'Series');
    const idx = quiet(() => new CatalogIndexer(path.join(lib, 'catalog.json')));
    const w = quiet(() => new LibraryWatcher(lib, idx, () => {}));
    quiet(() => w.start());
    touch(path.join(lib, 'Movies', 'Action', '0005- Fresh 2021.jpg'));
    touch(path.join(lib, 'Series', 'Breaking Bad.jpg'));
    await sleep(1600);
    const movie = idx.getMovies().find((m) => m.id === '0005');
    const series = idx.getMovies().find((m) => m.type === 'Series');
    quiet(() => w.stop());
    const problems = [];
    if (!movie) problems.push('movie missing'); else if (movie.year !== 2021) problems.push(`movie year=${movie.year}`);
    if (!series) problems.push('Series poster ignored');
    return { present: problems.length > 0, detail: problems.join(' | ') };
  });

  await check('DATA-01', 'title edit must keep imdbRating/plotSummary/year after the watcher settles', async () => {
    const lib = tmp('lib-edit-'); mk(lib, 'Movies', 'Action');
    const oldP = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'); touch(oldP);
    const idx = quiet(() => new CatalogIndexer(path.join(lib, 'catalog.json')));
    quiet(() => idx.replaceFromScan(scanLibrary(lib).results));
    const m = idx.getMovieById('0001'); m.imdbRating = 8.3; m.plotSummary = 'A heist story';
    const w = quiet(() => new LibraryWatcher(lib, idx, () => {})); quiet(() => w.start());
    const newP = path.join(lib, 'Movies', 'Action', '0001- Heat Renamed 1995.jpg');
    fs.renameSync(oldP, newP); m.absolutePosterPath = newP; m.title = 'Heat Renamed';   // == what PUT /api/movies/:id does
    await sleep(1600);
    const after = idx.getMovieById('0001'); quiet(() => w.stop());
    const lost = !after || after.imdbRating !== 8.3 || after.plotSummary !== 'A heist story' || after.year !== 1995;
    return { present: lost, detail: after ? JSON.stringify({ title: after.title, year: after.year, imdb: after.imdbRating, plot: after.plotSummary }) : 'movie vanished' };
  });

  await check('DATA-03', 'editing a multi-genre movie must rename all copies (movie-editor), no ghost after rescan', () => {
    const lib = tmp('lib-multi-');
    touch(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'));
    touch(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg'));
    const idx = quiet(() => new CatalogIndexer(path.join(lib, 'catalog.json')));
    quiet(() => idx.replaceFromScan(scanLibrary(lib).results));
    const MovieEditor = req('backend/services/movie-editor');
    const editor = new MovieEditor({ libraryPath: lib, indexer: idx });
    editor.updateMovie('0002', { id: '0099' });
    const idx2 = quiet(() => new CatalogIndexer(path.join(lib, 'catalog2.json')));
    quiet(() => idx2.replaceFromScan(scanLibrary(lib).results));
    return { present: idx2.count !== 1, detail: JSON.stringify(idx2.getMovies().map((x) => `${x.id}:${x.genres}`)) };
  });

  done();
})();
