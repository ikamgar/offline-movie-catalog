'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { scanLibrary, scanGames, scanFile, resolveTypeFolder } = require('../../backend/scanner');
const { makeLibrary } = require('../helpers/fixture-library');

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

describe('Scanner (characterization)', () => {
  describe('scanLibrary', () => {
    it('returns {results, stats} with correct shape', () => {
      const lib = makeLibrary({
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0002- Inception 2010.jpg': true,
      });
      const { results, stats } = quiet(() => scanLibrary(lib));
      assert.ok(Array.isArray(results));
      assert.ok(typeof stats === 'object');
      assert.equal(typeof stats.dirsVisited, 'number');
      assert.equal(typeof stats.imageFilesFound, 'number');
      assert.equal(typeof stats.moviesParsed, 'number');
      assert.ok(results.length >= 2);
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('parses Movie type from Movies/{Genre}/ path', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].type, 'Movie');
      assert.equal(results[0].id, '0001');
      assert.equal(results[0].title, 'Heat');
      assert.equal(results[0].year, 1995);
      assert.deepEqual(results[0].genres, ['Action']);
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('parses Animation type from Animation/ path', () => {
      const lib = makeLibrary({ 'Animation/00001-Cars.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].type, 'Animation');
      assert.equal(results[0].id, '00001');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('parses Iranian type from Iranian/ path', () => {
      const lib = makeLibrary({ 'Iranian/0001-Gav.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].type, 'Iranian');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('parses Series type from Series/ path', () => {
      const lib = makeLibrary({ 'Series/Breaking Bad.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].type, 'Series');
      assert.equal(results[0].id, null);
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('handles non-existent library path gracefully', () => {
      const { results, stats } = quiet(() => scanLibrary('/nonexistent/path'));
      assert.equal(results.length, 0);
      assert.equal(stats.moviesParsed, 0);
    });

    it('skips non-image files', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      fs.writeFileSync(path.join(lib, 'Movies', 'Action', 'readme.txt'), 'hello');
      const { results, stats } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.ok(stats.ignoredFiles >= 1);
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });
  });

    it('parses Serries/ as Series (alias)', () => {
      const lib = makeLibrary({ 'Serries/Breaking Bad.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].type, 'Series');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('returns all files (including same ID in multiple genre folders)', () => {
      const lib = makeLibrary({
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Drama/0001- Heat 1995.jpg': true,
      });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 2, 'scanner returns both files; indexer does the merging');
      assert.ok(results.every(r => r.id === '0001'), 'both results have same ID');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('ignores Movies/ with no genre subfolder (edge case)', () => {
      const lib = makeLibrary({ 'Movies/0001- Heat 1995.jpg': true });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1, 'file directly in Movies/ is still indexed');
      assert.equal(results[0].type, 'Movie');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('does not walk Games/ during scanLibrary (DATA-04)', () => {
      const lib = makeLibrary({
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Games/PS4/FIFA.jpg': true,
        'Games/PS5/FIFA.jpg': true,
      });
      const { results } = quiet(() => scanLibrary(lib));
      const movieResults = results.filter(r => r.type !== 'Game');
      assert.equal(movieResults.length, 1, 'only 1 movie, games excluded');
      assert.ok(!results.some(r => r.title === 'FIFA'), 'no game entries in movie results');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('skips dot-folders (.trash, .tmp) at the Library root', () => {
      const lib = makeLibrary({
        'Movies/Action/0001- Heat 1995.jpg': true,
        '.trash/0002- Gone 2020.jpg': true,
        '.tmp/0003- Temp 2021.jpg': true,
      });
      const { results } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1, 'only the real movie is indexed');
      assert.equal(results[0].id, '0001');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('returns invalid[] with reasons for unparseable posters', () => {
      const lib = makeLibrary({
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Movies/Action/Broken.jpg': true,
      });
      const { results, invalid } = quiet(() => scanLibrary(lib));
      assert.equal(results.length, 1, 'valid file indexed');
      assert.equal(invalid.length, 1, 'invalid file reported');
      assert.equal(invalid[0].reason, 'no-id');
      assert.ok(invalid[0].file.endsWith('Broken.jpg'));
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('scanFile returns {ok:true, entry} for a valid file', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      const abs = path.join(lib, 'Movies', 'Action', '0001- Heat 1995.jpg');
      const scan = scanFile(abs, lib);
      assert.equal(scan.ok, true);
      assert.equal(scan.entry.id, '0001');
      assert.equal(scan.entry.title, 'Heat');
      assert.equal(scan.entry.year, 1995);
      assert.equal(scan.entry.type, 'Movie');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('scanFile returns {ok:false, reason, file} for an invalid file', () => {
      const lib = makeLibrary({ 'Movies/Action/NoId.jpg': true });
      const abs = path.join(lib, 'Movies', 'Action', 'NoId.jpg');
      const scan = scanFile(abs, lib);
      assert.equal(scan.ok, false);
      assert.equal(scan.reason, 'no-id');
      assert.ok(scan.file.endsWith('NoId.jpg'));
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

  describe('scanGames', () => {
    it('returns {results, stats} with correct shape', () => {
      const lib = makeLibrary({
        'Games/PS4/FIFA 24.jpg': true,
        'Games/PS5/Spider-Man.jpg': true,
      });
      const { results, stats } = quiet(() => scanGames(lib));
      assert.ok(Array.isArray(results));
      assert.equal(typeof stats.gamesParsed, 'number');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('merges same title across PS4 and PS5', () => {
      const lib = makeLibrary({
        'Games/PS4/Ghost Rider.jpg': true,
        'Games/PS5/Ghost Rider.jpg': true,
      });
      const { results } = quiet(() => scanGames(lib));
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Ghost Rider');
      assert.ok(results[0].platforms.includes('PS4'));
      assert.ok(results[0].platforms.includes('PS5'));
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('returns empty for non-existent Games dir', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      const { results } = quiet(() => scanGames(lib));
      assert.equal(results.length, 0);
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });
  });

  describe('resolveTypeFolder (D7)', () => {
    it('new library uses Series/', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      const p = resolveTypeFolder(lib, 'Series');
      assert.equal(path.basename(p), 'Series');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('existing Serries/ is kept', () => {
      const lib = makeLibrary({ 'Serries/Breaking Bad.jpg': true });
      const p = resolveTypeFolder(lib, 'Series');
      assert.equal(path.basename(p), 'Serries');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('existing SERIES/ is found case-insensitively', () => {
      const lib = makeLibrary({ 'SERIES/Breaking Bad.jpg': true });
      const p = resolveTypeFolder(lib, 'Series');
      assert.equal(path.basename(p), 'SERIES');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });

    it('Animation/Iranian use conventional names', () => {
      const lib = makeLibrary({ 'Movies/Action/0001- Heat 1995.jpg': true });
      assert.equal(path.basename(resolveTypeFolder(lib, 'Animation')), 'Animation');
      assert.equal(path.basename(resolveTypeFolder(lib, 'Iranian')), 'Iranian');
      try { fs.rmSync(lib, { recursive: true, force: true }); } catch {}
    });
  });
});
