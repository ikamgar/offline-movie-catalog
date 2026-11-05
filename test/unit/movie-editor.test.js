'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JPEG_HEADER } = require('../helpers/fixture-library');
const { scanLibrary } = require('../../backend/scanner');
const CatalogIndexer = require('../../backend/indexer');
const MovieEditor = require('../../backend/services/movie-editor');

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

describe('MovieEditor', () => {
  let base;
  let lib;
  let idx;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-editor-'));
    lib = path.join(base, 'Library');
    fs.mkdirSync(path.join(lib, 'Movies', 'Action'), { recursive: true });
    fs.mkdirSync(path.join(lib, 'Movies', 'Drama'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'), JPEG_HEADER);
    fs.writeFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg'), JPEG_HEADER);
    idx = new CatalogIndexer(path.join(base, 'catalog.json'));
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  });

  function editorWith(deps) {
    return new MovieEditor(Object.assign({ libraryPath: lib, indexer: idx }, deps || {}));
  }

  it('renames every genre copy (all _fileIndex entries for the key)', () => {
    const editor = editorWith();
    editor.updateMovie('0002', { title: 'Heat Renamed', year: 1995 });

    const action = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const drama = fs.readdirSync(path.join(lib, 'Movies', 'Drama'));
    assert.ok(action.some(f => f.includes('Heat Renamed')), `Action: ${action}`);
    assert.ok(drama.some(f => f.includes('Heat Renamed')), `Drama: ${drama}`);
    assert.ok(!action.includes('0002- Heat 1995.jpg'), 'old Action name gone');
    assert.ok(!drama.includes('0002- Heat 1995.jpg'), 'old Drama name gone');

    const files = [...idx._fileIndex.keys()].filter(p => p.includes('Heat Renamed'));
    assert.equal(files.length, 2, 'both file-index entries re-keyed/renamed');
  });

  it('metadata-only patch touches no files', () => {
    const before = [...idx._fileIndex.keys()].sort();
    const editor = editorWith();
    const updated = editor.updateMovie('0002', { imdbRating: 8.4, plotSummary: 'plot' });
    const after = [...idx._fileIndex.keys()].sort();
    assert.deepEqual(after, before, 'file index paths unchanged');
    assert.equal(updated.imdbRating, 8.4);
    assert.equal(updated.plotSummary, 'plot');
    // disk unchanged
    const action = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    assert.deepEqual(action, ['0002- Heat 1995.jpg']);
  });

  it('cross-type id conflict → 409 before any file is touched', () => {
    // Another movie with id 0003
    fs.writeFileSync(path.join(lib, 'Movies', 'Drama', '0003- Other 2000.jpg'), JPEG_HEADER);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    const before = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    const editor = editorWith();
    assert.throws(
      () => editor.updateMovie('0002', { id: '0003' }),
      (err) => err.code === 'ID_TAKEN' && err.status === 409 && /شناسه/.test(err.message)
    );
    const after = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    assert.deepEqual(after, before, 'no file renamed on conflict');
    assert.ok(idx.getMovieById('0002'), 'index untouched');
  });

  it('target filename collision → 409 before any file is touched', () => {
    // Pre-create the target name in Action
    fs.writeFileSync(path.join(lib, 'Movies', 'Action', '0002- Occupied 1995.jpg'), JPEG_HEADER);

    const editor = editorWith();
    assert.throws(
      () => editor.updateMovie('0002', { title: 'Occupied' }),
      (err) => err.code === 'FILE_EXISTS' && err.status === 409
    );
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')), 'source still present');
    assert.ok(idx.getMovieById('0002'), 'index untouched');
  });

  it('rollback: failure partway through multi-file rename restores files; index untouched', () => {
    const actionOld = path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg');
    const dramaOld = path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg');
    assert.ok(fs.existsSync(actionOld) && fs.existsSync(dramaOld));

    let calls = 0;
    const editor = editorWith({
      renameSync: (from, to) => {
        calls += 1;
        // First rename succeeds, second fails — inject failure partway
        if (calls === 2) {
          throw new Error('simulated disk failure');
        }
        fs.renameSync(from, to);
      }
    });

    assert.throws(
      () => editor.updateMovie('0002', { title: 'Rollback Test', year: 1995 }),
      (err) => err.code === 'RENAME_FAILED' && /simulated disk failure/.test(err.message)
    );

    // Already-renamed file must be moved back
    assert.ok(fs.existsSync(actionOld), 'Action copy restored after rollback');
    assert.ok(fs.existsSync(dramaOld), 'Drama copy still at original path');
    const action = fs.readdirSync(path.join(lib, 'Movies', 'Action'));
    assert.ok(!action.some(f => f.includes('Rollback Test')), 'no leftover renamed file');

    // Index must not have been mutated
    const m = idx.getMovieById('0002');
    assert.ok(m, 'movie still present under old id');
    assert.equal(m.title, 'Heat', 'title unchanged in index');
    const keys = [...idx._fileIndex.keys()];
    assert.ok(keys.includes(actionOld) || keys.includes(dramaOld), 'file index still has original paths');
    assert.ok(!keys.some(k => k.includes('Rollback Test')), 'no new file-index paths');
  });

  it('Series: update by uid renames title-only filename and re-keys', () => {
    fs.mkdirSync(path.join(lib, 'Series'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Series', 'Breaking Bad.jpg'), JPEG_HEADER);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    const series = idx.getByUid('series:breaking bad');
    assert.ok(series, 'precondition: series indexed');

    const editor = editorWith();
    const updated = editor.updateMovie('series:breaking bad', { title: 'Breaking Bad Extra' });
    assert.equal(updated.title, 'Breaking Bad Extra');
    assert.equal(updated.uid, 'series:breaking bad extra');

    const files = fs.readdirSync(path.join(lib, 'Series'));
    assert.ok(files.includes('Breaking Bad Extra.jpg'), `Series file: ${files}`);
    assert.ok(!files.includes('Breaking Bad.jpg'), 'old Series file gone');
    assert.ok(idx.getByUid('series:breaking bad extra'), 're-keyed in index');
    assert.ok(!idx.getByUid('series:breaking bad'), 'old key gone');
  });

  it('id change re-keys map key type:id and file index', () => {
    const editor = editorWith();
    editor.updateMovie('0002', { id: '0099' });
    assert.ok(idx.getMovieById('0099'), 'new id found');
    assert.ok(!idx.getMovieById('0002'), 'old id gone');
    const m = idx._movieMap.get('Movie:0099');
    assert.ok(m, 'map key is Movie:0099');
    assert.ok(!idx._movieMap.has('Movie:0002'), 'old map key gone');
  });

  it('watcher.expect is called with old and new paths when renaming', () => {
    const expected = [];
    const editor = editorWith({
      watcher: { expect: (paths) => expected.push(...paths) }
    });
    editor.updateMovie('0002', { title: 'Expected' });
    assert.ok(expected.length >= 2, `expect called with paths: ${expected.length}`);
    assert.ok(expected.some(p => p.includes('Heat')), 'old path expected');
    assert.ok(expected.some(p => p.includes('Expected')), 'new path expected');
  });

  it('empty title → 400 validation', () => {
    const editor = editorWith();
    assert.throws(
      () => editor.updateMovie('0002', { title: '   ' }),
      (err) => err.status === 400
    );
  });

  // ─── P6a E1 — genre editing (Movie only) ─────────────────────────────────

  it('E1 genre add: copies poster into the new genre folder; disk and index updated', () => {
    const editor = editorWith();
    const updated = editor.updateMovie('0002', { genres: ['Action', 'Drama', 'Comedy'] });

    const actionFile = path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg');
    const comedyFile = path.join(lib, 'Movies', 'Comedy', '0002- Heat 1995.jpg');
    assert.ok(fs.existsSync(comedyFile), 'copy written into Movies/Comedy');
    assert.ok(fs.readFileSync(comedyFile).equals(fs.readFileSync(actionFile)), 'copied bytes identical');
    assert.deepEqual([...updated.genres].sort(), ['Action', 'Comedy', 'Drama']);
    const idxFiles = [...idx._fileIndex.keys()].filter(p => p.includes('Heat 1995'));
    assert.equal(idxFiles.length, 3, `file index must track all 3 copies: ${idxFiles}`);
    assert.ok(fs.existsSync(actionFile), 'Action copy kept');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')), 'Drama copy kept');
  });

  it('E1 genre remove: deletes only the de-selected copy; rest kept on disk and in index', () => {
    const editor = editorWith();
    const updated = editor.updateMovie('0002', { genres: ['Action'] });

    assert.ok(!fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')), 'Drama copy removed from disk');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')), 'Action copy kept');
    assert.deepEqual(updated.genres, ['Action']);
    const idxFiles = [...idx._fileIndex.keys()].filter(p => p.includes('Heat 1995'));
    assert.equal(idxFiles.length, 1, `single file-index entry left: ${idxFiles}`);
    assert.ok(idxFiles[0].includes(path.join('Movies', 'Action')), `entry must be the Action copy: ${idxFiles[0]}`);
  });

  it('E1 genre remove: absolutePosterPath repointed when its own folder is de-selected', () => {
    const m = idx.getMovieById('0002');
    m.absolutePosterPath = path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg');
    const editor = editorWith();
    editor.updateMovie('0002', { genres: ['Action'] });

    const after = idx.getMovieById('0002');
    assert.ok(!String(after.absolutePosterPath).includes(`${path.sep}Drama${path.sep}`),
      `repointed away from Drama: ${after.absolutePosterPath}`);
    assert.ok(fs.existsSync(after.absolutePosterPath), 'repointed path must exist on disk');
  });

  it('E1 genre edit: combined add + remove in one patch touches both folders', () => {
    const editor = editorWith();
    const updated = editor.updateMovie('0002', { genres: ['Drama', 'Comedy'] });

    assert.ok(!fs.existsSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')), 'Action removed');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')), 'Drama kept');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Comedy', '0002- Heat 1995.jpg')), 'Comedy added');
    assert.deepEqual([...updated.genres].sort(), ['Comedy', 'Drama']);
  });

  it('E1 genre rollback: failure partway through move+copy restores folders; index untouched', () => {
    const actionFile = path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg');
    const dramaFile = path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg');
    const beforeKeys = [...idx._fileIndex.keys()].sort();
    const beforeGenres = [...idx.getMovieById('0002').genres].sort();

    let copyCalls = 0;
    const editor = editorWith({
      copyFileSync: (src, dest) => {
        copyCalls += 1;
        if (copyCalls === 2) throw new Error('simulated disk failure');
        fs.copyFileSync(src, dest);
      }
    });

    assert.throws(
      () => editor.updateMovie('0002', { genres: ['Drama', 'Comedy', 'Thriller'] }),
      (err) => err.status === 500 && /simulated disk failure/.test(err.message)
    );

    assert.equal(copyCalls, 2, 'both copy attempts ran before the failure');
    assert.ok(fs.existsSync(actionFile), 'Action copy restored after rollback');
    assert.ok(fs.existsSync(dramaFile), 'Drama copy kept');
    assert.ok(!fs.existsSync(path.join(lib, 'Movies', 'Comedy', '0002- Heat 1995.jpg')),
      'no leftover Comedy copy');
    assert.ok(!fs.existsSync(path.join(lib, 'Movies', 'Thriller', '0002- Heat 1995.jpg')),
      'Thriller never written');
    assert.deepEqual([...idx._fileIndex.keys()].sort(), beforeKeys, 'file index untouched');
    assert.deepEqual([...idx.getMovieById('0002').genres].sort(), beforeGenres,
      'genres untouched in index');
  });

  it('E1 genre add: pre-existing unindexed file at target → 409 FILE_EXISTS, nothing touched', () => {
    const stray = path.join(lib, 'Movies', 'Comedy', '0002- Heat 1995.jpg');
    fs.mkdirSync(path.dirname(stray), { recursive: true });
    fs.writeFileSync(stray, Buffer.from('stray'));
    const before = [...idx._fileIndex.keys()].sort();

    assert.throws(
      () => editorWith().updateMovie('0002', { genres: ['Action', 'Comedy'] }),
      (err) => err.status === 409 && err.code === 'FILE_EXISTS'
    );

    assert.ok(fs.readFileSync(stray).equals(Buffer.from('stray')), 'stray file untouched');
    assert.deepEqual([...idx._fileIndex.keys()].sort(), before, 'index untouched');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')),
      'de-selected copy must NOT be removed when planning fails');
  });

  it('E1: genres patch on a Series → 400 NON_MOVIE_GENRE_EDIT', () => {
    fs.mkdirSync(path.join(lib, 'Series'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'Series', 'Breaking Bad.jpg'), JPEG_HEADER);
    quiet(() => idx.replaceFromScan(quiet(() => scanLibrary(lib)).results));

    assert.throws(
      () => editorWith().updateMovie('series:breaking bad', { genres: ['Action'] }),
      (err) => err.status === 400 && err.code === 'NON_MOVIE_GENRE_EDIT'
    );
  });

  it('E1: empty genres on a Movie → 400 GENRE_REQUIRED', () => {
    assert.throws(
      () => editorWith().updateMovie('0002', { genres: [] }),
      (err) => err.status === 400 && err.code === 'GENRE_REQUIRED'
    );
  });

  it('E1: non-array genres → 400 GENRE_INVALID', () => {
    assert.throws(
      () => editorWith().updateMovie('0002', { genres: 'Action' }),
      (err) => err.status === 400 && err.code === 'GENRE_INVALID'
    );
  });

  it('E1: unsafe genre name (traversal) → 400 GENRE_INVALID; nothing touched', () => {
    const before = [...idx._fileIndex.keys()].sort();
    assert.throws(
      () => editorWith().updateMovie('0002', { genres: ['Action', '../Evil'] }),
      (err) => err.status === 400 && err.code === 'GENRE_INVALID'
    );
    assert.deepEqual([...idx._fileIndex.keys()].sort(), before, 'index untouched after validation failure');
    assert.ok(fs.existsSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')), 'disk untouched');
  });

  it('E1 codes (Q6): TITLE_REQUIRED / ID_REQUIRED / YEAR_INVALID on field validation', () => {
    assert.throws(
      () => editorWith().updateMovie('0002', { title: '   ' }),
      (err) => err.status === 400 && err.code === 'TITLE_REQUIRED'
    );
    assert.throws(
      () => editorWith().updateMovie('0002', { id: '' }),
      (err) => err.status === 400 && err.code === 'ID_REQUIRED'
    );
    assert.throws(
      () => editorWith().updateMovie('0002', { year: 1700 }),
      (err) => err.status === 400 && err.code === 'YEAR_INVALID'
    );
  });

  // ─── P6a E1 — poster replacement ─────────────────────────────────────────

  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('E1 poster replace: extension change — every copy becomes .png, no .jpg orphan, bytes match', () => {
    const newPng = Buffer.concat([PNG_HEADER, Buffer.from('new-poster-payload')]);
    const editor = editorWith();
    editor.updateMovie('0002', {}, { posterBuffer: newPng, posterExt: 'png' });

    for (const genre of ['Action', 'Drama']) {
      const dir = path.join(lib, 'Movies', genre);
      const files = fs.readdirSync(dir);
      assert.deepEqual(files, ['0002- Heat 1995.png'],
        `${genre}: old jpg must be gone, only new png left: ${files}`);
      assert.ok(fs.readFileSync(path.join(dir, '0002- Heat 1995.png')).equals(newPng),
        `${genre}: bytes must equal the uploaded buffer`);
    }
    const m = idx.getMovieById('0002');
    assert.ok(String(m.absolutePosterPath).endsWith('.png'),
      `absolutePosterPath repointed to .png: ${m.absolutePosterPath}`);
    const keys = [...idx._fileIndex.keys()].filter(p => p.includes('Heat 1995'));
    assert.equal(keys.length, 2, `two entries, both png: ${keys}`);
    assert.ok(keys.every(k => k.endsWith('.png')), 'file index must hold only new paths');
    assert.deepEqual(m.genres, ['Action', 'Drama'], 'genres unchanged by poster replace');
  });

  it('E1 poster replace: same-extension overwrite — bytes replaced in place, file count unchanged', () => {
    const newJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('replaced-bytes-content')]);
    editorWith().updateMovie('0002', {}, { posterBuffer: newJpeg, posterExt: 'jpg' });

    for (const genre of ['Action', 'Drama']) {
      const dir = path.join(lib, 'Movies', genre);
      const files = fs.readdirSync(dir);
      assert.deepEqual(files, ['0002- Heat 1995.jpg'], `${genre}: single file expected: ${files}`);
      assert.ok(fs.readFileSync(path.join(dir, '0002- Heat 1995.jpg')).equals(newJpeg),
        `${genre}: bytes must be replaced`);
    }
  });

  it('E1 poster replace: unsupported extension → 400 IMG_UNSUPPORTED, disk untouched', () => {
    const before = fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'));
    assert.throws(
      () => editorWith().updateMovie('0002', {}, { posterBuffer: Buffer.from('x'), posterExt: 'txt' }),
      (err) => err.status === 400 && err.code === 'IMG_UNSUPPORTED'
    );
    assert.ok(
      fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')).equals(before),
      'file untouched'
    );
  });

  it('E1 poster replace rollback: THROWN failure during write-new (ext change) — old files untouched, no new-ext file remains', () => {
    const beforeAction = fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'));
    const beforeDrama = fs.readFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg'));
    const beforeKeys = [...idx._fileIndex.keys()].sort();

    const newPng = Buffer.concat([PNG_HEADER, Buffer.from('never-committed')]);
    let writes = 0;
    const editor = editorWith({
      writeFileSync: (p, data, opts) => {
        writes += 1;
        if (writes === 2) throw new Error('simulated disk failure');
        fs.writeFileSync(p, data, opts);
      }
    });

    assert.throws(
      () => editor.updateMovie('0002', {}, { posterBuffer: newPng, posterExt: 'png' }),
      (err) => err.status === 500 && /simulated disk failure/.test(err.message)
    );

    assert.equal(writes, 2, 'first new-extension file was written before the thrown failure');
    for (const genre of ['Action', 'Drama']) {
      const dir = path.join(lib, 'Movies', genre);
      const files = fs.readdirSync(dir);
      assert.ok(!files.some(f => f.endsWith('.png')),
        `${genre}: no new-extension file may remain after rollback: ${files}`);
      assert.ok(files.includes('0002- Heat 1995.jpg'),
        `${genre}: old file must remain: ${files}`);
    }
    assert.ok(fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')).equals(beforeAction),
      'Action old file bytes untouched');
    assert.ok(fs.readFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')).equals(beforeDrama),
      'Drama old file bytes untouched');
    assert.deepEqual([...idx._fileIndex.keys()].sort(), beforeKeys, 'file index untouched');
  });

  it('E1 poster replace rollback: same-extension write-new failure — original bytes restored everywhere', () => {
    const beforeAction = fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg'));
    const beforeDrama = fs.readFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg'));
    const beforeKeys = [...idx._fileIndex.keys()].sort();

    const newJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('never-committed')]);
    let writes = 0;
    const editor = editorWith({
      writeFileSync: (p, data, opts) => {
        // Fail only on writes of the NEW payload — the rollback's restore
        // writes (original bytes) must never trip the injected failure.
        if (data.equals(newJpeg)) {
          writes += 1;
          if (writes === 2) throw new Error('simulated disk failure');
        }
        fs.writeFileSync(p, data, opts);
      }
    });

    assert.throws(
      () => editor.updateMovie('0002', {}, { posterBuffer: newJpeg, posterExt: 'jpg' }),
      (err) => err.status === 500 && /simulated disk failure/.test(err.message)
    );

    assert.equal(writes, 2, 'second write threw after the first succeeded');
    assert.ok(fs.readFileSync(path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg')).equals(beforeAction),
      'first file restored to original bytes');
    assert.ok(fs.readFileSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')).equals(beforeDrama),
      'second file never changed');
    assert.deepEqual([...idx._fileIndex.keys()].sort(), beforeKeys, 'file index untouched');
  });

  it('E1 poster replace: watcher.expect receives every old and new path', () => {
    const expected = [];
    const newPng = Buffer.concat([PNG_HEADER, Buffer.from('p')]);
    editorWith({ watcher: { expect: (paths) => expected.push(...paths) } })
      .updateMovie('0002', {}, { posterBuffer: newPng, posterExt: 'png' });

    const uniq = [...new Set(expected)];
    for (const genre of ['Action', 'Drama']) {
      assert.ok(uniq.some(p => p.includes(path.join('Movies', genre, '0002- Heat 1995.jpg'))),
        `old ${genre} path expected: ${JSON.stringify(uniq)}`);
      assert.ok(uniq.some(p => p.includes(path.join('Movies', genre, '0002- Heat 1995.png'))),
        `new ${genre} path expected: ${JSON.stringify(uniq)}`);
    }
  });

  it('E1 combined patch: rename + genre change + poster replace in one updateMovie call', () => {
    const newPng = Buffer.concat([PNG_HEADER, Buffer.from('combo')]);
    const updated = editorWith().updateMovie(
      '0002',
      { title: 'Heatwave', genres: ['Action', 'Comedy'] },
      { posterBuffer: newPng, posterExt: 'png' }
    );

    assert.equal(updated.title, 'Heatwave');
    assert.deepEqual([...updated.genres].sort(), ['Action', 'Comedy']);
    assert.deepEqual(fs.readdirSync(path.join(lib, 'Movies', 'Action')),
      ['0002- Heatwave 1995.png'], 'Action folder holds renamed png only');
    assert.ok(!fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heatwave 1995.jpg')) &&
      !fs.existsSync(path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg')),
      'Drama copy removed (folder may stay empty)');
    assert.deepEqual(fs.readdirSync(path.join(lib, 'Movies', 'Comedy')),
      ['0002- Heatwave 1995.png'], 'Comedy folder holds the added renamed png');
    const keys = [...idx._fileIndex.keys()].filter(p => p.includes('Heatwave'));
    assert.equal(keys.length, 2, `two index entries for the new name: ${keys}`);
  });

  // ─── F33 — success must mean durable: metadata persist failure ─────────

  function failingMetadataStore(flushResult) {
    const items = new Map();
    return {
      get(k) { return items.get(k) || null; },
      set(k, p) { items.set(k, p); },
      rename(o, n) { const e = items.get(o); if (e) { items.delete(o); items.set(n, e); } },
      remove(k) { items.delete(k); },
      flush() { return flushResult; }
    };
  }

  it('F33 metadata-only edit: persist failure → PERSIST_FAILED, previous value kept, store rolled back', () => {
    const store = failingMetadataStore(false);
    const editor = editorWith({ metadataStore: store });
    const before = idx.getMovieById('0002');
    assert.equal(before.imdbRating, null, 'precondition: no rating yet');

    assert.throws(
      () => editor.updateMovie('0002', { imdbRating: 9.3 }),
      (err) => err.code === 'PERSIST_FAILED' && err.status === 500 && /متادیتا/.test(err.message)
    );

    // Index keeps serving the previous value
    const after = idx.getMovieById('0002');
    assert.equal(after.imdbRating, null, 'imdbRating unchanged in served index');
    assert.equal(after.plotSummary, null, 'plotSummary unchanged in served index');
    assert.equal(after.title, 'Heat', 'title unchanged');
    // No files were renamed (metadata-only patch)
    assert.deepEqual(fs.readdirSync(path.join(lib, 'Movies', 'Action')), ['0002- Heat 1995.jpg']);
    // Store memory rolled back (flush returned false → undo removed the entry)
    assert.equal(store.get('0002'), null, 'store entry rolled back');
  });

  it('F33 metadata-only edit: later edit succeeds once the store is writable again', () => {
    let flushResult = false;
    const store = {
      items: new Map(),
      get(k) { return this.items.get(k) || null; },
      set(k, p) { this.items.set(k, p); },
      rename(o, n) { const e = this.items.get(o); if (e) { this.items.delete(o); this.items.set(n, e); } },
      remove(k) { this.items.delete(k); },
      flush() { return flushResult; }
    };
    const editor = editorWith({ metadataStore: store });

    assert.throws(
      () => editor.updateMovie('0002', { imdbRating: 9.3 }),
      (err) => err.code === 'PERSIST_FAILED'
    );
    assert.equal(idx.getMovieById('0002').imdbRating, null, 'nothing served while store blocked');

    flushResult = true; // failure removed
    const updated = editor.updateMovie('0002', { imdbRating: 8.4 });
    assert.equal(updated.imdbRating, 8.4);
    assert.equal(idx.getMovieById('0002').imdbRating, 8.4, 'new value served after store writable');
    assert.equal(store.get('0002').imdbRating, 8.4, 'metadata persisted');
  });

  it('F33 title rename: persist failure → PERSIST_FAILED, rename rolled back, index untouched', () => {
    const store = failingMetadataStore(false);
    const editor = editorWith({ metadataStore: store });
    const actionFile = path.join(lib, 'Movies', 'Action', '0002- Heat 1995.jpg');
    const dramaFile = path.join(lib, 'Movies', 'Drama', '0002- Heat 1995.jpg');
    const renamed = path.join(lib, 'Movies', 'Action', '0002- Heat Renamed 1995.jpg');
    assert.ok(fs.existsSync(actionFile) && fs.existsSync(dramaFile));

    assert.throws(
      () => editor.updateMovie('0002', { title: 'Heat Renamed', imdbRating: 9.3 }),
      (err) => err.code === 'PERSIST_FAILED'
    );

    // Both renames rolled back
    assert.ok(fs.existsSync(actionFile), 'Action copy restored after rollback');
    assert.ok(fs.existsSync(dramaFile), 'Drama copy restored after rollback');
    assert.ok(!fs.existsSync(renamed), 'no renamed copy left');
    // Index keeps previous values (previous values served)
    const m = idx.getMovieById('0002');
    assert.equal(m.title, 'Heat', 'title unchanged in index');
    assert.equal(m.imdbRating, null, 'rating unchanged in index');
    assert.equal(store.get('0002'), null, 'store entry rolled back');
  });
});
