'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { makeLibrary } = require('../helpers/fixture-library');
const { scanLibrary } = require('../../backend/scanner');
const CatalogIndexer = require('../../backend/indexer');

describe('CatalogIndexer', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('indexes a single movie', () => {
    const lib = makeLibrary({
      'Movies/Action/0001- Heat 1995.jpg': true
    }, path.join(tmpDir, 'lib1'));
    const catalogPath = path.join(tmpDir, 'catalog1.json');
    const idx = new CatalogIndexer(catalogPath);
    const { results } = scanLibrary(lib);
    idx.replaceFromScan(results);

    assert.equal(idx.count, 1);
    const m = idx.getMovieById('0001');
    assert.equal(m.title, 'Heat');
    assert.equal(m.year, 1995);
    assert.equal(m.type, 'Movie');
    assert.deepEqual(m.genres, ['Action']);
  });

  it('merges genres across copies of the same movie in different folders', () => {
    const lib = makeLibrary({
      'Movies/Action/0002- Heat 1995.jpg': true,
      'Movies/Drama/0002- Heat 1995.jpg': true
    }, path.join(tmpDir, 'lib2'));
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog2.json'));
    const { results } = scanLibrary(lib);
    idx.replaceFromScan(results);

    assert.equal(idx.count, 1);
    const m = idx.getMovieById('0002');
    assert.deepEqual(m.genres.sort(), ['Action', 'Drama']);
  });

  it('keys Series by normalised title (trimmed, collapsed, lowercased)', () => {
    const lib = makeLibrary({
      'Series/  Breaking   Bad .jpg': true
    }, path.join(tmpDir, 'lib3'));
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog3.json'));
    const { results } = scanLibrary(lib);
    idx.replaceFromScan(results);

    assert.equal(idx.count, 1);
    const movies = idx.getMovies();
    assert.equal(movies[0].title, 'Breaking Bad');
    assert.equal(movies[0].uid, 'series:breaking bad');
  });

  it('preserves custom fields (imdbRating, plotSummary) across replaceFromScan', () => {
    const lib = makeLibrary({
      'Movies/Action/0003- Heat 1995.jpg': true
    }, path.join(tmpDir, 'lib4'));
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog4.json'));
    const { results } = scanLibrary(lib);
    idx.replaceFromScan(results);

    const m = idx.getMovieById('0003');
    m.imdbRating = 8.3;
    m.plotSummary = 'A heist story';

    idx.replaceFromScan(results);

    const after = idx.getMovieById('0003');
    assert.equal(after.imdbRating, 8.3);
    assert.equal(after.plotSummary, 'A heist story');
  });

  it('adds a movie via addFile and retrieves it', () => {
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog5.json'));
    idx.addFile({
      id: '0010',
      title: 'Test Movie',
      year: 2020,
      type: 'Movie',
      genres: ['Action'],
      posterPath: '/fake/path.jpg',
      lastModified: Date.now()
    });

    assert.equal(idx.count, 1);
    const m = idx.getMovieById('0010');
    assert.equal(m.title, 'Test Movie');
  });

  it('removes a movie via removeFile', () => {
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog6.json'));
    idx.addFile({
      id: '0011',
      title: 'To Remove',
      year: 2020,
      type: 'Movie',
      genres: ['Action'],
      posterPath: '/fake/path.jpg',
      lastModified: Date.now()
    });
    assert.equal(idx.count, 1);

    idx.removeFile('/fake/path.jpg');
    assert.equal(idx.count, 0);
  });

  it('returns null for getMovieById with unknown id', () => {
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog7.json'));
    assert.equal(idx.getMovieById('9999'), null);
  });

  it('get count returns 0 for empty index', () => {
    const idx = new CatalogIndexer(path.join(tmpDir, 'catalog8.json'));
    assert.equal(idx.count, 0);
  });

  it('saves and loads from disk', () => {
    const catalogPath = path.join(tmpDir, 'catalog9.json');
    const idx = new CatalogIndexer(catalogPath);
    idx.addFile({
      id: '0020',
      title: 'Persisted',
      year: 2020,
      type: 'Movie',
      genres: ['Action'],
      posterPath: '/fake/path.jpg',
      lastModified: Date.now()
    });
    idx.saveToDisk();

    const idx2 = new CatalogIndexer(catalogPath);
    idx2.loadFromDisk();
    assert.equal(idx2.count, 1);
    const m = idx2.getMovieById('0020');
    assert.equal(m.title, 'Persisted');
  });
});
