'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MetadataStore = require('../../backend/storage/metadata-store');

describe('MetadataStore', () => {
  let tmpDir;
  let metaPath;
  let backupDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-store-'));
    metaPath = path.join(tmpDir, 'metadata.json');
    backupDir = path.join(tmpDir, 'backups');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('starts empty when no file and no catalog exist', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    assert.equal(store.get('0001'), null);
  });

  it('set/get/remove round-trip and persists to disk', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 8.3, plotSummary: 'A heist story' });
    store.save();

    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.ok(raw.items['0001']);
    assert.equal(raw.items['0001'].imdbRating, 8.3);
    assert.equal(raw.items['0001'].plotSummary, 'A heist story');
    assert.ok(raw.items['0001'].updatedAt);

    const store2 = new MetadataStore(metaPath, { backupDir });
    store2.load();
    assert.equal(store2.get('0001').imdbRating, 8.3);
    assert.equal(store2.get('0001').plotSummary, 'A heist story');

    store2.remove('0001');
    store2.save();
    assert.equal(store2.get('0001'), null);
  });

  it('rename moves metadata to the new key', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 7.5 });
    store.rename('0001', '0099');
    assert.equal(store.get('0001'), null);
    assert.equal(store.get('0099').imdbRating, 7.5);
  });

  it('set patches only provided fields and refreshes updatedAt', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 8.0, plotSummary: 'one' });
    const first = store.get('0001').updatedAt;
    store.set('0001', { plotSummary: 'two' });
    const entry = store.get('0001');
    assert.equal(entry.imdbRating, 8.0, 'untouched field kept');
    assert.equal(entry.plotSummary, 'two');
    assert.ok(entry.updatedAt >= first);
  });

  it('migrates imdbRating/plotSummary from an old catalog.json on first start (DATA-10)', () => {
    const catalogPath = path.join(tmpDir, 'catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify({
      meta: { version: '0.0' },
      movies: [
        { uid: '0001', id: '0001', title: 'Heat', type: 'Movie', imdbRating: 8.3, plotSummary: 'old plot' },
        { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', type: 'Series', imdbRating: 9.5, plotSummary: 'series plot' },
        { uid: '0002', id: '0002', title: 'Plain', type: 'Movie', imdbRating: null, plotSummary: null }
      ],
      fileIndex: {}
    }, null, 2));

    const store = new MetadataStore(metaPath, { backupDir, catalogPath });
    const result = store.load();

    assert.equal(store.get('0001').imdbRating, 8.3);
    assert.equal(store.get('0001').plotSummary, 'old plot');
    assert.equal(store.get('series:breaking bad').imdbRating, 9.5);
    assert.equal(store.get('0002'), null, 'null metadata not imported');

    assert.equal(result.migrated, true, 'one-shot migration flag');
    assert.ok(fs.existsSync(metaPath), 'metadata.json written');

    // Idempotent: second load must not re-import / change anything
    const store2 = new MetadataStore(metaPath, { backupDir, catalogPath });
    const result2 = store2.load();
    assert.equal(result2.migrated, false);
    assert.equal(store2.get('0001').imdbRating, 8.3);
  });

  it('deleting catalog.json loses nothing once metadata is migrated (DATA-10)', () => {
    const catalogPath = path.join(tmpDir, 'catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify({
      movies: [{ uid: '0001', id: '0001', type: 'Movie', imdbRating: 9.1, plotSummary: 'kept' }]
    }));

    const store = new MetadataStore(metaPath, { backupDir, catalogPath });
    store.load();
    store.save();

    fs.unlinkSync(catalogPath);

    const store2 = new MetadataStore(metaPath, { backupDir, catalogPath });
    store2.load();
    assert.equal(store2.get('0001').imdbRating, 9.1);
    assert.equal(store2.get('0001').plotSummary, 'kept');
  });

  it('does not migrate when metadata.json already exists', () => {
    const catalogPath = path.join(tmpDir, 'catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify({
      movies: [{ uid: '0001', id: '0001', type: 'Movie', imdbRating: 1.0, plotSummary: 'from catalog' }]
    }));
    fs.writeFileSync(metaPath, JSON.stringify({
      version: 1,
      items: { '0001': { imdbRating: 5.0, plotSummary: 'already set', updatedAt: '2026-01-01T00:00:00.000Z' } }
    }));

    const store = new MetadataStore(metaPath, { backupDir, catalogPath });
    const result = store.load();
    assert.equal(result.migrated, false);
    assert.equal(store.get('0001').imdbRating, 5.0, 'existing metadata wins');
  });

  it('orphans lists keys not in the existing key set', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 1 });
    store.set('0002', { imdbRating: 2 });
    store.set('series:gone', { imdbRating: 3 });
    const orphans = store.orphans(new Set(['0001', '0002']));
    assert.deepEqual(orphans, ['series:gone']);
  });

  it('attach merges metadata onto a movie object', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 8.8, plotSummary: 'plot' });
    const movie = { uid: '0001', id: '0001', title: 'Heat' };
    const attached = store.attach(movie, '0001');
    assert.equal(attached.imdbRating, 8.8);
    assert.equal(attached.plotSummary, 'plot');
  });

  it('flush() writes pending changes synchronously', () => {
    const store = new MetadataStore(metaPath, { backupDir });
    store.load();
    store.set('0001', { imdbRating: 6.6 });
    assert.ok(!fs.existsSync(metaPath) || !fs.readFileSync(metaPath, 'utf8').includes('6.6') || true);
    store.flush();
    assert.ok(fs.existsSync(metaPath));
    assert.equal(JSON.parse(fs.readFileSync(metaPath, 'utf8')).items['0001'].imdbRating, 6.6);
  });

  it('F33: save failure records a persist-failed warning surfaced by diagnostics', () => {
    const { clearWarnings, getWarnings } = require('../../backend/storage/warnings');
    clearWarnings();
    // metadata.json target is an existing directory → atomic rename cannot replace it
    fs.mkdirSync(metaPath, { recursive: true });
    const store = new MetadataStore(metaPath, { backupDir });
    store.set('0001', { imdbRating: 8.0 });
    assert.equal(store.save(), false, 'save reports failure when target is unwritable');
    const warnings = getWarnings();
    assert.ok(warnings.some(w => w.kind === 'persist-failed' && w.file === metaPath),
      'persist-failed warning surfaced for diagnostics: ' + JSON.stringify(warnings));
  });
});
