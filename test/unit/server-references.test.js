'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../../server');

describe('F2 — createServer() live references', () => {
  it('returns live references for wsServer, diagnostics, movieCreator, movieEditor, movieTrash, watcher after start()', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-server-ref-'));
    const libraryPath = path.join(dataDir, 'Library');
    fs.mkdirSync(libraryPath, { recursive: true });

    const s = createServer({ port: 0, dataDir, libraryPath, quiet: true });

    // Before start(): instances not yet initialized
    assert.equal(s.wsServer, null);
    assert.equal(s.diagnostics, null);
    assert.equal(s.movieCreator, null);
    assert.equal(s.movieEditor, null);
    assert.equal(s.movieTrash, null);
    assert.equal(s.watcher, null);

    await s.start();

    // After start(): all references are live objects (F2)
    assert.ok(s.wsServer && typeof s.wsServer.broadcastCatalogChanged === 'function', 'wsServer must be live');
    assert.ok(s.diagnostics && typeof s.diagnostics.runFullReport === 'function', 'diagnostics must be live');
    assert.ok(s.movieCreator && typeof s.movieCreator.createMovie === 'function', 'movieCreator must be live');
    assert.ok(s.movieEditor && typeof s.movieEditor.updateMovie === 'function', 'movieEditor must be live');
    assert.ok(s.movieTrash && typeof s.movieTrash.deleteMovie === 'function', 'movieTrash must be live');
    assert.ok(s.watcher && typeof s.watcher.start === 'function', 'watcher must be live');

    await s.stop();
  });
});
