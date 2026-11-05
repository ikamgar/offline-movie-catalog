'use strict';
// ─── P6c E4 — games management: GameCreator / GameEditor / movie-editor guard
// Requirements: AC4 (create writes every platform copy, delete moves them),
// AC6 (structured 400s incl. traversal). Temp dirs only.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JPEG_HEADER } = require('../helpers/fixture-library');
const { scanLibrary, scanGames } = require('../../backend/scanner');
const CatalogIndexer = require('../../backend/indexer');
const MovieEditor = require('../../backend/services/movie-editor');
const GameCreator = require('../../backend/services/game-creator');
const GameEditor = require('../../backend/services/game-editor');
const MovieTrash = require('../../backend/services/movie-trash');

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

async function rejects(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

// Minimal but valid JPEG magic bytes (decodePosterPayload-compatible).
const JPEG = Buffer.concat([JPEG_HEADER, Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])]);

describe('GameCreator (P6c E4)', () => {
  let base;
  let lib;
  let idx;
  let gc;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'game-creator-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.saveToDisk());
    gc = new GameCreator({ libraryPath: lib, indexer: idx, watcher: null });
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  const gameFile = (plat, name) => path.join(lib, 'Games', plat, name);

  it('create: writes a copy per platform and indexes the game (AC4)', async () => {
    const game = await gc.createGame({ title: 'Hades', platforms: ['PS4', 'PS5'] }, JPEG, 'jpg');

    assert.equal(game.uid, 'game:hades');
    assert.equal(game.type, 'Game');
    assert.equal(game.title, 'Hades');
    assert.deepEqual(game.platforms, ['PS4', 'PS5']);

    assert.ok(fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'PS4 copy written');
    assert.ok(fs.existsSync(gameFile('PS5', 'Hades.jpg')), 'PS5 copy written');
    assert.ok(fs.readFileSync(gameFile('PS4', 'Hades.jpg')).equals(JPEG), 'bytes are the uploaded poster');

    const indexed = idx.getGameByTitle('Hades');
    assert.ok(indexed, 'game indexed');
    assert.deepEqual(indexed.platforms, ['PS4', 'PS5']);
    assert.ok(idx.getByUid('game:hades'), 'reachable by uid');
  });

  it('validation: structured codes for title/platforms/poster/extension/traversal; statusOf → 400 (AC6)', async () => {
    const noTitle = await rejects(() => gc.createGame({ platforms: ['PS4'] }, JPEG, 'jpg'));
    assert.ok(noTitle, 'missing title must reject');
    assert.equal(noTitle.code, 'TITLE_REQUIRED', `code expected: ${noTitle.message}`);
    assert.equal(GameCreator.statusOf(noTitle), 400);
    assert.ok(/عنوان/.test(noTitle.message), 'Persian message kept');

    const blankTitle = await rejects(() => gc.createGame({ title: '   ', platforms: ['PS4'] }, JPEG, 'jpg'));
    assert.equal(blankTitle.code, 'TITLE_REQUIRED', `code expected: ${blankTitle.message}`);
    assert.equal(GameCreator.statusOf(blankTitle), 400);

    const noPlatforms = await rejects(() => gc.createGame({ title: 'X' }, JPEG, 'jpg'));
    assert.equal(noPlatforms.code, 'PLATFORM_INVALID', `code expected: ${noPlatforms.message}`);
    assert.equal(GameCreator.statusOf(noPlatforms), 400);

    const emptyPlatforms = await rejects(() => gc.createGame({ title: 'X', platforms: [] }, JPEG, 'jpg'));
    assert.equal(emptyPlatforms.code, 'PLATFORM_INVALID', `code expected: ${emptyPlatforms.message}`);

    const badPlatform = await rejects(() => gc.createGame({ title: 'X', platforms: ['PS6'] }, JPEG, 'jpg'));
    assert.equal(badPlatform.code, 'PLATFORM_INVALID', `code expected: ${badPlatform.message}`);
    assert.equal(GameCreator.statusOf(badPlatform), 400);

    const noPoster = await rejects(() => gc.createGame({ title: 'X', platforms: ['PS4'] }, null, 'jpg'));
    assert.equal(noPoster.code, 'IMG_REQUIRED', `code expected: ${noPoster.message}`);
    assert.equal(GameCreator.statusOf(noPoster), 400);

    const badExt = await rejects(() => gc.createGame({ title: 'X', platforms: ['PS4'] }, JPEG, 'gif'));
    assert.equal(badExt.code, 'IMG_UNSUPPORTED', `code expected: ${badExt.message}`);
    assert.equal(GameCreator.statusOf(badExt), 400);

    const traversal = await rejects(() => gc.createGame({ title: '..', platforms: ['PS4'] }, JPEG, 'jpg'));
    assert.ok(traversal, 'unsafe title must reject');
    assert.equal(traversal.code, 'TITLE_INVALID', `code expected: ${traversal.message}`);
    assert.equal(GameCreator.statusOf(traversal), 400);

    assert.ok(!fs.existsSync(gameFile('PS4', 'X.jpg')), 'nothing written by validation failures');
    assert.ok(idx.getGames().length === 0, 'index untouched by failures');
  });

  it('duplicate title → 409 GAME_EXISTS', async () => {
    await gc.createGame({ title: 'Hades', platforms: ['PS4'] }, JPEG, 'jpg');

    const dup = await rejects(() => gc.createGame({ title: 'Hades', platforms: ['PS4'] }, JPEG, 'jpg'));
    assert.ok(dup, 'duplicate must reject');
    assert.equal(dup.code, 'GAME_EXISTS', `code expected: ${dup.message}`);
    assert.equal(GameCreator.statusOf(dup), 409);
    assert.equal(idx.getGames().length, 1, 'still exactly one entry');
  });

  it('unindexed file already at a target → 409 FILE_EXISTS, nothing written, not indexed', async () => {
    fs.mkdirSync(path.dirname(gameFile('PS5', 'Occupied.jpg')), { recursive: true });
    fs.writeFileSync(gameFile('PS5', 'Occupied.jpg'), JPEG);

    const err = await rejects(() =>
      gc.createGame({ title: 'Occupied', platforms: ['PS4', 'PS5'] }, JPEG, 'jpg'));
    assert.ok(err, 'colliding target must reject');
    assert.equal(err.code, 'FILE_EXISTS', `code expected: ${err.message}`);
    assert.equal(GameCreator.statusOf(err), 409);
    assert.ok(!fs.existsSync(gameFile('PS4', 'Occupied.jpg')), 'sibling copy never written');
    assert.ok(idx.getGameByTitle('Occupied') == null, 'not indexed after conflict');
  });

  it('rollback: injected write failure on the 2nd platform removes the 1st; not indexed', async () => {
    let writes = 0;
    const failing = new GameCreator({
      libraryPath: lib, indexer: idx, watcher: null,
      writeFileSync: (p, data, opts) => {
        writes += 1;
        if (writes === 2) throw new Error('simulated disk failure');
        fs.writeFileSync(p, data, opts);
      }
    });

    const err = await rejects(() =>
      failing.createGame({ title: 'Rollback', platforms: ['PS4', 'PS5'] }, JPEG, 'jpg'));
    assert.ok(err, 'write failure must reject');
    assert.match(err.message, /simulated disk failure/);
    assert.equal(GameCreator.statusOf(err), 500);
    assert.equal(writes, 2, 'both write attempts ran');
    assert.ok(!fs.existsSync(gameFile('PS4', 'Rollback.jpg')), 'first copy removed by rollback');
    assert.ok(idx.getGameByTitle('Rollback') == null, 'not indexed after rollback');
  });

  // ─── F37 — game create with an uncleanable title ───────────────────────

  it('F37 validation: reserved Windows names and over-long titles → TITLE_INVALID, nothing written', async () => {
    for (const bad of ['CON', 'NUL', 'PRN', 'CON ']) {
      const err = await rejects(() =>
        gc.createGame({ title: bad, platforms: ['PS4'] }, JPEG, 'jpg'));
      assert.ok(err, `${JSON.stringify(bad)} must reject`);
      assert.equal(err.code, 'TITLE_INVALID', `${JSON.stringify(bad)} code`);
      assert.equal(GameCreator.statusOf(err), 400, `${JSON.stringify(bad)} status`);
    }
    const long = 'x'.repeat(130);
    const errLong = await rejects(() =>
      gc.createGame({ title: long, platforms: ['PS4'] }, JPEG, 'jpg'));
    assert.ok(errLong, 'over-long title must reject');
    assert.equal(errLong.code, 'TITLE_INVALID', 'over-long code');
    assert.equal(GameCreator.statusOf(errLong), 400, 'over-long status');
    assert.equal(idx.getGames().length, 0, 'invalid titles never indexed');
    assert.ok(!fs.existsSync(gameFile('PS4', 'CON.jpg')), 'nothing written for reserved name');
    assert.ok(!fs.existsSync(gameFile('PS4', long + '.jpg')), 'nothing written for over-long title');
  });

  it('F37 traversal title is cleaned consistently: no ghost, filename and index key agree', async () => {
    const game = await gc.createGame({ title: '..\\..\\evil', platforms: ['PS4'] }, JPEG, 'jpg');
    assert.equal(game.title, '..-..-evil', 'cleaned title served');
    assert.equal(game.uid, 'game:..-..-evil', 'index key is the cleaned title');
    assert.ok(fs.existsSync(gameFile('PS4', '..-..-evil.jpg')), 'file written under cleaned name');
    assert.ok(idx.getGameByTitle('..-..-evil'), 'reachable by cleaned title');
    assert.equal(idx.getGameByTitle('..\\..\\evil'), null, 'raw title is not a separate ghost entry');
  });

  it('F37 rollback: commit failure after write removes all copies; rescan shows nothing', async () => {
    const boomIdx = new CatalogIndexer(path.join(base, 'boom-catalog.json'));
    boomIdx.processGameResults = () => { throw new Error('index down'); };
    const boom = new GameCreator({ libraryPath: lib, indexer: boomIdx, watcher: null });

    const err = await rejects(() =>
      boom.createGame({ title: 'Boom Game', platforms: ['PS4', 'PS5'] }, JPEG, 'jpg'));
    assert.ok(err, 'commit failure must reject');
    assert.ok(!fs.existsSync(gameFile('PS4', 'Boom Game.jpg')), 'PS4 copy removed after commit failure');
    assert.ok(!fs.existsSync(gameFile('PS5', 'Boom Game.jpg')), 'PS5 copy removed after commit failure');
    assert.equal(boomIdx.getGames().length, 0, 'not indexed after rollback');

    const rescan = scanGames(lib);
    assert.equal(rescan.results.length, 0, 'rescan shows nothing (no ghost)');
  });

  it('statusOf: unknown errors fall back to 500', () => {
    assert.equal(GameCreator.statusOf(new Error('boom')), 500);
  });
});

describe('GameEditor (P6c E4)', () => {
  let base;
  let lib;
  let idx;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'game-editor-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS5'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Hades.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Games', 'PS5', 'Hades.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'FIFA 24.jpg'), JPEG);
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    quiet(() => idx.processGameResults(quiet(() => scanGames(lib)).results));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  function editorWith(deps) {
    return new GameEditor(Object.assign({ libraryPath: lib, indexer: idx }, deps || {}));
  }

  const gameFile = (plat, name) => path.join(lib, 'Games', plat, name);

  it('rename moves every platform copy; uid follows the title', () => {
    const updated = editorWith().updateGame('game:hades', { title: 'Hades II' });

    assert.equal(updated.title, 'Hades II');
    assert.equal(updated.uid, 'game:hades ii');
    assert.ok(!fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'old PS4 name gone');
    assert.ok(!fs.existsSync(gameFile('PS5', 'Hades.jpg')), 'old PS5 name gone');
    assert.ok(fs.existsSync(gameFile('PS4', 'Hades II.jpg')), 'new PS4 name written');
    assert.ok(fs.existsSync(gameFile('PS5', 'Hades II.jpg')), 'new PS5 name written');
    assert.ok(idx.getByUid('game:hades ii'), 're-keyed in the index');
    assert.ok(!idx.getByUid('game:hades'), 'old key gone');
    assert.ok(idx.getByUid('game:fifa 24'), 'other game untouched');
  });

  it('rename onto an existing game → 409 GAME_EXISTS, nothing touched', () => {
    assert.throws(
      () => editorWith().updateGame('game:hades', { title: 'FIFA 24' }),
      (err) => err.code === 'GAME_EXISTS' && err.status === 409
    );
    assert.ok(fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'PS4 copy untouched');
    assert.ok(fs.existsSync(gameFile('PS5', 'Hades.jpg')), 'PS5 copy untouched');
    assert.ok(idx.getByUid('game:hades'), 'index untouched');
  });

  it('platform removal deletes the copy; re-adding copies it back; empty set → 400', () => {
    const removed = editorWith().updateGame('game:hades', { platforms: ['PS4'] });
    assert.deepEqual(removed.platforms, ['PS4']);
    assert.ok(!fs.existsSync(gameFile('PS5', 'Hades.jpg')), 'PS5 copy removed from disk');
    assert.ok(fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'PS4 copy kept');
    assert.deepEqual(idx.getByUid('game:hades').platforms, ['PS4'], 'index reflects the removal');

    const before = fs.readFileSync(gameFile('PS4', 'Hades.jpg'));
    assert.throws(
      () => editorWith().updateGame('game:hades', { platforms: [] }),
      (err) => err.code === 'PLATFORM_INVALID' && err.status === 400
    );
    assert.ok(fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'last platform never removed');
    assert.ok(idx.getByUid('game:hades'), 'index untouched by the rejected patch');

    const added = editorWith().updateGame('game:hades', { platforms: ['PS4', 'PS5'] });
    assert.deepEqual(added.platforms, ['PS4', 'PS5']);
    assert.ok(fs.existsSync(gameFile('PS5', 'Hades.jpg')), 'PS5 copy re-created');
    assert.ok(fs.readFileSync(gameFile('PS5', 'Hades.jpg')).equals(before), 'copied bytes identical');

    assert.throws(
      () => editorWith().updateGame('game:hades', { platforms: ['PS6'] }),
      (err) => err.code === 'PLATFORM_INVALID' && err.status === 400
    );
  });

  it('poster replace rewrites every platform copy', () => {
    const marker = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('PATCH-MARKER')]);
    editorWith().updateGame('game:hades', {}, { posterBuffer: marker, posterExt: 'jpg' });

    for (const plat of ['PS4', 'PS5']) {
      assert.ok(fs.readFileSync(gameFile(plat, 'Hades.jpg')).equals(marker),
        `${plat} copy must carry the replacement bytes`);
    }
    assert.ok(fs.existsSync(gameFile('PS4', 'FIFA 24.jpg')), 'other game untouched');
  });

  it('field validation: blank title → 400 TITLE_REQUIRED; traversal title → 400 TITLE_INVALID', () => {
    assert.throws(
      () => editorWith().updateGame('game:hades', { title: '   ' }),
      (err) => err.code === 'TITLE_REQUIRED' && err.status === 400
    );
    assert.throws(
      () => editorWith().updateGame('game:hades', { title: '..' }),
      (err) => err.code === 'TITLE_INVALID' && err.status === 400
    );
    assert.ok(fs.existsSync(gameFile('PS4', 'Hades.jpg')), 'disk untouched by validation failures');
    assert.ok(idx.getByUid('game:hades'), 'index untouched by validation failures');
  });

  it('unknown game uid → 404 NOT_FOUND; statusOf maps it', () => {
    assert.throws(
      () => editorWith().updateGame('game:ghost', { title: 'Nope' }),
      (err) => err.code === 'NOT_FOUND' && err.status === 404
    );
    assert.equal(GameEditor.statusOf(new Error('x')), 500);
    const notFound = Object.assign(new Error('nf'), { code: 'NOT_FOUND' });
    assert.equal(GameEditor.statusOf(notFound), 404);
  });

  it('watcher.expect receives every old and new path on rename', () => {
    const expected = [];
    editorWith({ watcher: { expect: (paths) => expected.push(...paths) } })
      .updateGame('game:hades', { title: 'Expected' });

    const uniq = [...new Set(expected)];
    assert.ok(uniq.some(p => p === gameFile('PS4', 'Hades.jpg')), `old PS4 expected: ${JSON.stringify(uniq)}`);
    assert.ok(uniq.some(p => p === gameFile('PS5', 'Hades.jpg')), `old PS5 expected: ${JSON.stringify(uniq)}`);
    assert.ok(uniq.some(p => p === gameFile('PS4', 'Expected.jpg')), `new PS4 expected: ${JSON.stringify(uniq)}`);
    assert.ok(uniq.some(p => p === gameFile('PS5', 'Expected.jpg')), `new PS5 expected: ${JSON.stringify(uniq)}`);
  });
});

describe('CatalogIndexer.replaceGames (F31)', () => {
  let base;
  let lib;
  let idx;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-games-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS5'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Dual Game.jpg'), JPEG);
    fs.writeFileSync(path.join(lib, 'Games', 'PS5', 'Dual Game.jpg'), JPEG);
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceGames(quiet(() => scanGames(lib)).results));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('drops a deleted platform and repoints absolutePosterPath to a surviving copy', () => {
    const before = idx.getGameByTitle('Dual Game');
    assert.deepEqual(before.platforms, ['PS4', 'PS5']);
    assert.ok(String(before.absolutePosterPath).endsWith(path.join('PS4', 'Dual Game.jpg')), 'served from PS4 initially');

    // Delete the served PS4 copy, rescan
    fs.unlinkSync(path.join(lib, 'Games', 'PS4', 'Dual Game.jpg'));
    idx.replaceGames(quiet(() => scanGames(lib)).results);

    const game = idx.getGameByTitle('Dual Game');
    assert.ok(game, 'game still present');
    assert.deepEqual(game.platforms, ['PS5'], 'PS4 platform dropped');
    assert.ok(String(game.absolutePosterPath).endsWith(path.join('PS5', 'Dual Game.jpg')), 'served path repointed to surviving PS5 copy');
    assert.ok(game.poster.includes('/api/game-poster/'), 'poster URL rebuilt');
  });

  it('removes the game when all its files are deleted', () => {
    fs.unlinkSync(path.join(lib, 'Games', 'PS4', 'Dual Game.jpg'));
    fs.unlinkSync(path.join(lib, 'Games', 'PS5', 'Dual Game.jpg'));
    idx.replaceGames(quiet(() => scanGames(lib)).results);
    assert.equal(idx.getGameByTitle('Dual Game'), null, 'game gone after all files deleted');
    assert.equal(idx.getGames().length, 0, 'games map empty');
  });

  it('empties the games map on an empty rescan', () => {
    assert.equal(idx.getGames().length, 1, 'precondition: Dual Game present');
    quiet(() => idx.replaceGames([]));
    assert.equal(idx.getGames().length, 0, 'empty scan empties games map');
  });
});

describe('MovieEditor guard (P6c E4): game uids never reach the movie pipeline', () => {
  let base;
  let lib;
  let idx;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-editor-game-guard-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg'), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Hades.jpg'), JPEG);
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
    quiet(() => idx.processGameResults(quiet(() => scanGames(lib)).results));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('updateMovie(game:…) → 400 GAME_UNSUPPORTED before any file is touched', () => {
    const before = fs.readdirSync(path.join(lib, 'Games', 'PS4'));
    assert.throws(
      () => new MovieEditor({ libraryPath: lib, indexer: idx })
        .updateMovie('game:hades', { title: 'Nope' }),
      (err) => err.status === 400 && err.code === 'GAME_UNSUPPORTED'
    );
    assert.deepEqual(fs.readdirSync(path.join(lib, 'Games', 'PS4')), before, 'game files untouched');
    assert.ok(idx.getByUid('game:hades'), 'game untouched in the index');
    assert.ok(idx.getMovieById('0001'), 'movies untouched');
  });
});

describe('F3 — source-level invalidation without HTTP (notifyChanged)', () => {
  let base;
  let lib;
  let idx;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-src-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Games', 'PS4'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Games', 'PS5'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Games', 'PS4', 'Sigil.jpg'), JPEG);
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceGames(quiet(() => scanGames(lib)).results));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  it('game-creator.createGame notifies the indexer directly (no HTTP)', async () => {
    let changes = 0;
    idx.onChange = () => { changes += 1; };
    const gc = new GameCreator({ libraryPath: lib, indexer: idx, watcher: null });
    await gc.createGame({ title: 'Notify Me', platforms: ['PS4'] }, JPEG, 'jpg');
    assert.ok(changes >= 1, 'createGame notified the indexer at the source');
  });

  it('game-editor.updateGame notifies the indexer directly (no HTTP)', () => {
    let changes = 0;
    idx.onChange = () => { changes += 1; };
    const ge = new GameEditor({ libraryPath: lib, indexer: idx, watcher: null });
    const updated = ge.updateGame('game:sigil', { title: 'Notified' });
    assert.ok(changes >= 1, 'updateGame notified the indexer at the source');
    assert.equal(updated.title, 'Notified');
  });

  it('movie-trash.deleteMovie (game) notifies the indexer directly (no HTTP)', () => {
    let changes = 0;
    idx.onChange = () => { changes += 1; };
    const trash = new MovieTrash({ libraryPath: lib, indexer: idx, watcher: null });
    trash.deleteMovie('game:sigil', 'admin');
    assert.ok(changes >= 1, 'trash delete notified the indexer at the source');
    assert.equal(idx.getGameByTitle('Sigil'), null, 'game removed from the index');
  });
});
