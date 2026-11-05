'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JPEG_HEADER } = require('../helpers/fixture-library');
const { scanLibrary, scanGames } = require('../../backend/scanner');
const CatalogIndexer = require('../../backend/indexer');
const MetadataStore = require('../../backend/storage/metadata-store');
const MovieTrash = require('../../backend/services/movie-trash');

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

const ACTION_0001 = path.join('Movies', 'Action', '0001- First 1990.jpg');
const ACTION_0002 = path.join('Movies', 'Action', '0002- Heat 1995.jpg');
const DRAMA_0002 = path.join('Movies', 'Drama', '0002- Heat 1995.jpg');

describe('MovieTrash (P6b E3 — soft delete / restore, D6)', () => {
  let base;
  let lib;
  let idx;
  let store;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-trash-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Series'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.writeFileSync(path.join(lib, ACTION_0001), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, ACTION_0002), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, DRAMA_0002), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, 'Series', 'Breaking Bad.jpg'), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'FIFA 24.jpg'), JPEG_HEADER);

    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    quiet(() => idx.processGameResults(quiet(() => scanGames(lib)).results));

    store = new MetadataStore(path.join(base, 'metadata.json'), {
      backupDir: path.join(base, 'backups')
    });
    quiet(() => store.load());
    idx.setMetadataStore(store);
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  const manifestPath = () => path.join(lib, '.trash', 'manifest.json');
  const readManifest = () => JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
  const writeManifest = (entries) => {
    fs.mkdirSync(path.join(lib, '.trash'), { recursive: true });
    fs.writeFileSync(manifestPath(), JSON.stringify({ version: 1, entries }, null, 2));
  };

  function trashWith(deps) {
    return new MovieTrash(Object.assign({ libraryPath: lib, indexer: idx }, deps || {}));
  }

  // ─── delete ───────────────────────────────────────────────────────────────

  it('delete: single-genre file moves to .trash/<id>/ with relative path preserved; manifest entry written; movie gone from index', () => {
    const res = trashWith().deleteMovie('0001', 'admin');

    assert.match(String(res.id), /^\d+$/, 'trash id is numeric');
    assert.equal(res.uid, '0001');
    assert.equal(res.moved, 1);

    assert.ok(!fs.existsSync(path.join(lib, ACTION_0001)), 'source gone from Movies/Action');
    assert.ok(fs.existsSync(path.join(lib, '.trash', res.id, ...ACTION_0001.split(path.sep))),
      'file moved into .trash/<id>/ with relative path preserved');

    const mf = readManifest();
    const entry = mf.entries.find(e => e.id === String(res.id));
    assert.ok(entry, `manifest entry must exist: ${JSON.stringify(mf)}`);
    assert.equal(entry.uid, '0001');
    assert.equal(entry.title, 'First');
    assert.equal(entry.type, 'Movie');
    assert.deepEqual(entry.originalPaths, ['Movies/Action/0001- First 1990.jpg'],
      'relative paths stored with forward slashes');
    assert.equal(entry.deletedBy, 'admin');
    assert.ok(entry.deletedAt, 'deletedAt recorded');

    assert.ok(!idx.getByUid('0001'), 'movie gone from index');
  });

  it('delete: multi-genre movie — every copy moves, all originalPaths recorded, movie dropped', () => {
    const res = trashWith().deleteMovie('0002', 'admin');

    assert.equal(res.moved, 2, 'both genre copies moved');
    assert.ok(!fs.existsSync(path.join(lib, ACTION_0002)), 'Action copy gone');
    assert.ok(!fs.existsSync(path.join(lib, DRAMA_0002)), 'Drama copy gone');
    assert.ok(fs.existsSync(path.join(lib, '.trash', res.id, ...ACTION_0002.split(path.sep))));
    assert.ok(fs.existsSync(path.join(lib, '.trash', res.id, ...DRAMA_0002.split(path.sep))));

    const entry = readManifest().entries.find(e => e.id === String(res.id));
    assert.equal(entry.originalPaths.length, 2, `both paths recorded: ${JSON.stringify(entry.originalPaths)}`);

    assert.ok(!idx.getByUid('0002'), 'movie gone once every copy is gone');
    assert.ok(idx.getByUid('0001'), 'other movies untouched');
  });

  it('delete: watcher.expect receives every source and target path', () => {
    const expected = [];
    const res = trashWith({ watcher: { expect: (paths) => expected.push(...paths) } })
      .deleteMovie('0002', 'admin');

    const uniq = [...new Set(expected)];
    assert.ok(uniq.some(p => p === path.join(lib, ACTION_0002)), `source Action expected: ${JSON.stringify(uniq)}`);
    assert.ok(uniq.some(p => p === path.join(lib, DRAMA_0002)), `source Drama expected: ${JSON.stringify(uniq)}`);
    assert.ok(uniq.some(p => p === path.join(lib, '.trash', String(res.id), ...ACTION_0002.split(path.sep))),
      'target Action expected');
    assert.ok(uniq.some(p => p === path.join(lib, '.trash', String(res.id), ...DRAMA_0002.split(path.sep))),
      'target Drama expected');
  });

  it('delete rollback: injected failure on the 2nd move restores the 1st; index and manifest untouched', () => {
    let calls = 0;
    const trash = trashWith({
      renameSync: (from, to) => {
        calls += 1;
        if (calls === 2) throw new Error('simulated disk failure');
        fs.renameSync(from, to);
      }
    });

    assert.throws(
      () => trash.deleteMovie('0002', 'admin'),
      (err) => err.status === 500 && err.code === 'DELETE_FAILED' && /simulated disk failure/.test(err.message)
    );

    assert.ok(fs.existsSync(path.join(lib, ACTION_0002)), 'Action copy restored after rollback');
    assert.ok(fs.existsSync(path.join(lib, DRAMA_0002)), 'Drama copy never moved');
    assert.ok(idx.getByUid('0002'), 'index untouched after failed delete');
    assert.ok(!fs.existsSync(manifestPath()), 'no manifest written when the move phase failed');
  });

  it('delete: game uid soft-deletes every platform copy into .trash (P6c E4)', () => {
    const res = trashWith().deleteMovie('game:fifa 24', 'admin');

    assert.match(String(res.id), /^\d+$/, 'trash id is numeric');
    assert.equal(res.uid, 'game:fifa 24');
    assert.equal(res.moved, 1);

    assert.ok(!fs.existsSync(path.join(lib, 'Games', 'PS4', 'FIFA 24.jpg')), 'source gone from Games/PS4');
    assert.ok(fs.existsSync(path.join(lib, '.trash', res.id, 'Games', 'PS4', 'FIFA 24.jpg')),
      'file moved into .trash/<id>/ with relative path preserved');

    const entry = readManifest().entries.find(e => e.id === String(res.id));
    assert.ok(entry, `manifest entry must exist: ${JSON.stringify(readManifest())}`);
    assert.equal(entry.uid, 'game:fifa 24');
    assert.equal(entry.title, 'FIFA 24');
    assert.equal(entry.type, 'Game', 'type field distinguishes game entries');
    assert.deepEqual(entry.originalPaths, ['Games/PS4/FIFA 24.jpg']);

    assert.ok(!idx.getByUid('game:fifa 24'), 'game gone from the index');
    assert.ok(idx.getGameByTitle('FIFA 24') == null, 'game dropped from the games map');
    assert.ok(idx.getByUid('0001'), 'movies untouched');
  });

  it('restore: game entry moves the files back and re-enters the games index (P6c E4)', () => {
    const res = trashWith().deleteMovie('game:fifa 24', 'admin');
    const out = trashWith().restore(res.id);
    assert.equal(out.restored, 1);

    assert.ok(fs.existsSync(path.join(lib, 'Games', 'PS4', 'FIFA 24.jpg')), 'file back at its original path');
    const game = idx.getGameByTitle('FIFA 24');
    assert.ok(game, 'game back in the games index');
    assert.equal(game.uid, 'game:fifa 24');
    assert.deepEqual(game.platforms, ['PS4']);
    assert.ok(!readManifest().entries.some(e => e.id === String(res.id)), 'entry leaves the manifest');
  });

  it('delete: unknown uid and empty uid → 404 NOT_FOUND', () => {
    const trash = trashWith();
    assert.throws(() => trash.deleteMovie('9999', 'admin'),
      (err) => err.status === 404 && err.code === 'NOT_FOUND');
    assert.throws(() => trash.deleteMovie('', 'admin'),
      (err) => err.status === 404 && err.code === 'NOT_FOUND');
    assert.ok(fs.existsSync(path.join(lib, ACTION_0001)), 'disk untouched');
  });

  it('delete: corrupt manifest → 500 TRASH_MANIFEST_ERROR, nothing moved', () => {
    fs.mkdirSync(path.join(lib, '.trash'), { recursive: true });
    fs.writeFileSync(manifestPath(), '{ not json');

    assert.throws(
      () => trashWith().deleteMovie('0001', 'admin'),
      (err) => err.status === 500 && err.code === 'TRASH_MANIFEST_ERROR'
    );
    assert.ok(fs.existsSync(path.join(lib, ACTION_0001)), 'source untouched');
    assert.ok(idx.getByUid('0001'), 'index untouched');
  });

  it('delete broadcasts catalog:changed {removed} and invalidates diagnostics', () => {
    const broadcasts = [];
    let invalidated = 0;
    const trash = trashWith({
      wsServer: { broadcastCatalogChanged: (diff) => broadcasts.push(diff) },
      diagnostics: { invalidate: () => { invalidated += 1; } }
    });
    trash.deleteMovie('0002', 'admin');
    assert.deepEqual(broadcasts, [{ removed: 1 }], 'clients told to reload');
    assert.equal(invalidated, 1, 'diagnostics cache dropped');
  });

  // ─── restore ──────────────────────────────────────────────────────────────

  it('restore: files return to original paths; movie reappears with rating/plot intact; entry removed; trash folder cleaned', () => {
    store.set('0001', { imdbRating: 8.3, plotSummary: 'A heist story' });
    quiet(() => store.flush());

    const trash = trashWith();
    const res = trash.deleteMovie('0001', 'admin');
    assert.ok(!idx.getByUid('0001'), 'precondition: deleted');
    assert.equal(store.get('0001').imdbRating, 8.3, 'delete must not touch the metadata store');

    const r = trash.restore(String(res.id));
    assert.equal(r.restored, 1);
    assert.equal(r.uid, '0001');

    assert.ok(fs.existsSync(path.join(lib, ACTION_0001)), 'file back at original path');
    assert.ok(!fs.existsSync(path.join(lib, '.trash', res.id)), 'trash folder removed after restore');

    const m = idx.getByUid('0001');
    assert.ok(m, 'movie back in the index');
    assert.equal(m.imdbRating, 8.3, 'rating re-attached from metadata store');
    assert.equal(m.plotSummary, 'A heist story', 'plot re-attached from metadata store');

    const mf = readManifest();
    assert.ok(!mf.entries.some(e => e.id === String(res.id)), 'entry removed from the log');
  });

  it('restore: multi-genre movie — every copy returns; genres unioned', () => {
    const trash = trashWith();
    const res = trash.deleteMovie('0002', 'admin');
    const r = trash.restore(String(res.id));
    assert.equal(r.restored, 2);

    assert.ok(fs.existsSync(path.join(lib, ACTION_0002)));
    assert.ok(fs.existsSync(path.join(lib, DRAMA_0002)));
    const m = idx.getByUid('0002');
    assert.ok(m, 'movie back');
    assert.deepEqual([...m.genres].sort(), ['Action', 'Drama'], 'genre union restored');
  });

  it('restore: occupied destination → 409 RESTORE_CONFLICT; nothing moved; entry intact', () => {
    const trash = trashWith();
    const res = trash.deleteMovie('0002', 'admin');

    const occupant = path.join(lib, DRAMA_0002);
    fs.mkdirSync(path.dirname(occupant), { recursive: true });
    fs.writeFileSync(occupant, Buffer.from('occupant'));

    assert.throws(
      () => trash.restore(String(res.id)),
      (err) => err.status === 409 && err.code === 'RESTORE_CONFLICT'
    );

    assert.ok(fs.readFileSync(occupant).equals(Buffer.from('occupant')), 'occupant untouched');
    assert.ok(fs.existsSync(path.join(lib, '.trash', res.id, ...ACTION_0002.split(path.sep))),
      'Action copy still in trash — no partial restore');
    assert.ok(!idx.getByUid('0002'), 'movie still deleted');
    assert.ok(readManifest().entries.some(e => e.id === String(res.id)), 'entry intact after 409');
  });

  it('restore: unknown id → 404 TRASH_NOT_FOUND; non-numeric id → 400 VALIDATION; purged id → 404 TRASH_PURGED; empty folder → 404', () => {
    const trash = trashWith();

    assert.throws(() => trash.restore('424242'),
      (err) => err.status === 404 && err.code === 'TRASH_NOT_FOUND');
    assert.throws(() => trash.restore('abc'),
      (err) => err.status === 400 && err.code === 'VALIDATION');

    writeManifest([{
      id: '500', uid: '0001', title: 'First', type: 'Movie',
      originalPaths: ['Movies/Action/0001- First 1990.jpg'],
      deletedBy: 'admin', deletedAt: '2026-01-01T00:00:00.000Z',
      purgedAt: '2026-01-02T00:00:00.000Z'
    }]);
    assert.throws(() => trash.restore('500'),
      (err) => err.status === 404 && err.code === 'TRASH_PURGED');

    // Orphaned entry: log says restorable but the folder vanished (hard-kill window)
    writeManifest([{
      id: '600', uid: '0002', title: 'Heat', type: 'Movie',
      originalPaths: ['Movies/Action/0002- Heat 1995.jpg'],
      deletedBy: 'admin', deletedAt: '2026-01-01T00:00:00.000Z'
    }]);
    assert.throws(() => trash.restore('600'),
      (err) => err.status === 404 && err.code === 'TRASH_NOT_FOUND');
  });

  it('restore broadcasts catalog:changed {added} and invalidates diagnostics', () => {
    const broadcasts = [];
    let invalidated = 0;
    const trash = trashWith({
      wsServer: { broadcastCatalogChanged: (diff) => broadcasts.push(diff) },
      diagnostics: { invalidate: () => { invalidated += 1; } }
    });
    const res = trash.deleteMovie('0001', 'admin');
    broadcasts.length = 0;
    invalidated = 0;

    trash.restore(String(res.id));
    assert.deepEqual(broadcasts, [{ added: 1 }], 'clients told to reload');
    assert.equal(invalidated, 1, 'diagnostics cache dropped');
  });

  it('Series round-trip: delete by series uid keeps uid, restore re-keys', () => {
    const trash = trashWith();
    const res = trash.deleteMovie('series:breaking bad', 'admin');
    assert.equal(res.uid, 'series:breaking bad');
    assert.ok(!fs.existsSync(path.join(lib, 'Series', 'Breaking Bad.jpg')));
    assert.ok(!idx.getByUid('series:breaking bad'), 'series gone');

    const r = trash.restore(String(res.id));
    assert.equal(r.restored, 1);
    assert.ok(fs.existsSync(path.join(lib, 'Series', 'Breaking Bad.jpg')), 'file back');
    assert.ok(idx.getByUid('series:breaking bad'), 'series back with same uid');
  });

  // ─── list + purge (D6 owner decision) ─────────────────────────────────────

  it('list(): newest-first, capped at 20, purged entries excluded', () => {
    const entries = [];
    for (let i = 1000; i < 1022; i++) {
      entries.push({
        id: String(i), uid: String(i), title: `T${i}`, type: 'Movie',
        originalPaths: ['Movies/Action/x.jpg'], deletedBy: 'admin',
        deletedAt: '2026-01-01T00:00:00.000Z'
      });
    }
    entries.push({
      id: '9999', uid: '9999', title: 'Purged', type: 'Movie',
      originalPaths: ['Movies/Action/y.jpg'], deletedBy: 'admin',
      deletedAt: '2026-01-01T00:00:00.000Z', purgedAt: '2026-01-02T00:00:00.000Z'
    });
    writeManifest(entries);

    const list = trashWith().list();
    assert.equal(list.length, 20, `capped at 20: ${list.length}`);
    assert.equal(list[0].id, '1021', 'newest first');
    assert.equal(list[19].id, '1002');
    assert.ok(!list.some(e => e.id === '9999'), 'purged entries never listed');
  });

  it('purge: the 21st deletion purges the OLDEST deletion\'s files from disk; its log entry stays with purgedAt; window entries untouched', () => {
    // Seed 20 active trash entries, each with real files on disk
    const seeded = [];
    for (let i = 0; i < 20; i++) {
      const id = String(1000 + i); // 1000 = oldest … 1019 = newest
      const rel = `Movies/Action/00${i}- Old ${1990 + i}.jpg`;
      const target = path.join(lib, '.trash', id, ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JPEG_HEADER);
      seeded.push({
        id, uid: `9${String(i).padStart(3, '0')}`, title: `Old ${i}`, type: 'Movie',
        originalPaths: [rel], deletedBy: 'admin',
        deletedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString()
      });
    }
    seeded.reverse(); // manifest is newest-first
    writeManifest(seeded);

    // The 21st real deletion pushes the oldest one out of the window
    const res = trashWith().deleteMovie('0001', 'admin');
    const newestId = String(res.id);

    const mf = readManifest();
    assert.equal(mf.entries.length, 21, 'log entries are permanent (20 + 1 new)');

    const purged = mf.entries.find(e => e.id === '1000');
    assert.ok(purged, 'oldest log entry still in the manifest');
    assert.ok(purged.purgedAt, 'purged entry reflects that its files are gone');
    assert.ok(!fs.existsSync(path.join(lib, '.trash', '1000')),
      'oldest deletion FILES actually removed from disk');

    for (let i = 1; i < 20; i++) {
      const id = String(1000 + i);
      assert.ok(fs.existsSync(path.join(lib, '.trash', id)),
        `entry ${id} inside the most-recent-20 window must be untouched`);
      assert.ok(!mf.entries.find(e => e.id === id).purgedAt, `entry ${id} not marked purged`);
    }
    assert.ok(fs.existsSync(path.join(lib, '.trash', newestId)), 'the new deletion is kept');
    assert.equal(mf.entries[0].id, newestId, 'new entry is newest-first');
  });
});
