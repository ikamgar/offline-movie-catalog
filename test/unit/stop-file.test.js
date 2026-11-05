'use strict';
/**
 * P8a follow-up — stale stop.request handling: a file left behind by a
 * previous run (Stop.bat pressed while nothing was running, or a hard
 * kill) must NOT stop the fresh server. armStopWatch removes it at arm
 * time; a file written AFTER arming stops the server exactly once.
 * Temp dirs only.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { armStopWatch } = require('../../server/stop-file');

const tmpDirs = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8a-stopfile-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('P8a follow-up - stale stop.request', () => {
  it('removes a stale file at arm time and does not stop', async () => {
    const dir = tmpDir();
    const stopFile = path.join(dir, 'stop.request');
    fs.writeFileSync(stopFile, 'stop');
    let calls = 0;
    const watch = armStopWatch({ stopFile, intervalMs: 30, onStopped: () => { calls += 1; } });
    assert.equal(watch.staleRemoved(), true, 'stale file was seen');
    assert.equal(fs.existsSync(stopFile), false, 'stale file removed at arm');
    await wait(150);
    assert.equal(calls, 0, 'stale file must NOT trigger a stop');
    assert.equal(watch.fired(), false);
    watch.stop();
  });

  it('a file written after arming stops exactly once, then is removed', async () => {
    const dir = tmpDir();
    const stopFile = path.join(dir, 'stop.request');
    let calls = 0;
    const watch = armStopWatch({ stopFile, intervalMs: 30, onStopped: () => { calls += 1; } });
    await wait(80);
    assert.equal(calls, 0, 'no file yet → no stop');
    fs.writeFileSync(stopFile, 'stop');
    await wait(150);
    assert.equal(calls, 1, 'fresh file stops the server');
    assert.equal(fs.existsSync(stopFile), false, 'request file consumed');
    fs.writeFileSync(stopFile, 'stop'); // a second write cannot re-fire
    await wait(100);
    assert.equal(calls, 1, 'one-shot even if the file reappears');
    watch.stop();
  });

  it('missing directory: arming does not throw', () => {
    const dir = tmpDir();
    const stopFile = path.join(dir, 'does', 'not', 'exist', 'stop.request');
    const watch = armStopWatch({ stopFile, intervalMs: 30, onStopped: () => {} });
    assert.equal(watch.fired(), false);
    watch.stop();
  });

  it('server.js wires armStopWatch (no inline watch left)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
    assert.ok(src.includes('armStopWatch({'), 'server.js uses the module');
    assert.ok(!src.includes('stopTimer'), 'inline interval removed');
    assert.ok(!src.includes('rmSync(stopFile'), 'inline stale removal removed');
  });
});
