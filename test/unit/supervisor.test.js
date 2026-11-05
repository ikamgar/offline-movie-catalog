'use strict';
/**
 * P8a G1 — supervisor crash-window policy (pure, injected clock):
 * 5 crashes within 2 minutes stops; a run that lived >= 2 minutes
 * resets the count; a clean exit (code 0) is "done" (never restarted).
 * DELAY_MS/WINDOW_MS/MAX_CRASHES are asserted so the .bat-visible
 * behaviour cannot drift silently.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createCrashTracker, DELAY_MS, WINDOW_MS, MAX_CRASHES } = require('../../scripts/supervisor');
const { CONFIG_ERROR_EXIT_CODE } = require('../../server/config');

const REPO = path.join(__dirname, '..', '..');
const tmpDirs = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8a-sup-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe('P8a G1 - supervisor crash policy', () => {
  it('exposes the launcher contract constants', () => {
    assert.equal(DELAY_MS, 3000, '3 s restart delay');
    assert.equal(WINDOW_MS, 120000, '2-minute window');
    assert.equal(MAX_CRASHES, 5, 'stop after 5 crashes');
  });

  it('clean exit (code 0) is done — never restarted, never counted', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    assert.equal(tracker.onExit({ code: 0, uptimeMs: 10 }).action, 'done');
    assert.equal(tracker.count, 0);
  });

  it('first four crashes within the window restart after 3 s', () => {
    let t = 1000;
    const tracker = createCrashTracker({ now: () => t });
    for (let i = 1; i <= 4; i++) {
      t += 10000; // 10 s apart
      const d = tracker.onExit({ code: 1, uptimeMs: 10000 });
      assert.equal(d.action, 'restart', `crash ${i} restarts`);
      assert.equal(d.delayMs, 3000);
      assert.equal(d.count, i);
    }
  });

  it('5 crashes within 2 minutes → stop', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    let decision;
    for (let i = 1; i <= 5; i++) {
      t += 10000;
      decision = tracker.onExit({ code: 1, uptimeMs: 10000 });
    }
    assert.equal(decision.action, 'stop', 'fifth crash inside the window stops');
    assert.equal(decision.count, 5);
  });

  it('crashes older than 2 minutes fall out of the window', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    for (let i = 1; i <= 4; i++) {
      t += 10000;
      tracker.onExit({ code: 1, uptimeMs: 10000 });
    }
    t += 130000; // > 2 min after the last crash
    const d = tracker.onExit({ code: 1, uptimeMs: 10000 });
    assert.equal(d.action, 'restart', 'aged-out history does not stop');
    assert.equal(d.count, 1, 'only the fresh crash counts');
  });

  it('a longer-lived run (>= 2 min) resets the count', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    for (let i = 1; i <= 4; i++) {
      t += 10000;
      tracker.onExit({ code: 1, uptimeMs: 10000 });
    }
    // server lived 130 s, then crashed: history reset before counting
    t += 130000;
    const d = tracker.onExit({ code: 1, uptimeMs: 130000 });
    assert.equal(d.action, 'restart');
    assert.equal(d.count, 1);
    // and 4 more quick crashes after that still restart until the 5th
    for (let i = 2; i <= 4; i++) {
      t += 5000;
      assert.equal(tracker.onExit({ code: 1, uptimeMs: 5000 }).action, 'restart');
    }
    t += 5000;
    assert.equal(tracker.onExit({ code: 1, uptimeMs: 5000 }).action, 'stop');
  });

  it('signal exit (code null) counts as a crash', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    const d = tracker.onExit({ code: null, uptimeMs: 100 });
    assert.equal(d.action, 'restart');
    assert.equal(d.count, 1);
  });

  it('config-error exit (code 2): stop without counting a crash', () => {
    let t = 0;
    const tracker = createCrashTracker({ now: () => t });
    const d = tracker.onExit({ code: CONFIG_ERROR_EXIT_CODE, uptimeMs: 50 });
    assert.equal(d.action, 'config-error');
    assert.equal(d.count, 0, 'must not consume the crash budget');
    assert.equal(tracker.count, 0);
    // a later real crash still has the full budget of 5
    for (let i = 1; i <= 4; i++) {
      t += 10000;
      assert.equal(tracker.onExit({ code: 1, uptimeMs: 1000 }).action, 'restart');
    }
    t += 10000;
    assert.equal(tracker.onExit({ code: 1, uptimeMs: 1000 }).action, 'stop');
  });

  it('real supervisor run: a config-error child (exit 2) is not restarted', () => {
    const dir = tmpDir();
    const childScript = path.join(dir, 'exit2.js');
    fs.writeFileSync(childScript, "console.log('EXIT2-PROBE'); process.exit(2);");
    const t0 = Date.now();
    const result = spawnSync(
      process.execPath,
      [path.join(REPO, 'scripts', 'supervisor.js'), childScript],
      { encoding: 'utf8', timeout: 10000 }
    );
    const ms = Date.now() - t0;
    assert.equal(result.status, 2, `supervisor exits 2 (got ${result.status}); out:\n${result.stdout}${result.stderr}`);
    const probes = result.stdout.split('EXIT2-PROBE').length - 1;
    assert.equal(probes, 1, 'child ran exactly once — no restart');
    assert.ok(!result.stdout.includes('Restarting in 3 seconds'), 'no restart message');
    assert.ok(ms < 2500, `returned immediately, no 3 s delay (took ${ms} ms)`);
  });

  it('real supervisor run: exit 0 child is done, not restarted', () => {
    const dir = tmpDir();
    const childScript = path.join(dir, 'ok.js');
    fs.writeFileSync(childScript, "console.log('OK-PROBE'); process.exit(0);");
    const result = spawnSync(
      process.execPath,
      [path.join(REPO, 'scripts', 'supervisor.js'), childScript],
      { encoding: 'utf8', timeout: 10000 }
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.split('OK-PROBE').length - 1, 1);
    assert.ok(!result.stdout.includes('Restarting in 3 seconds'));
  });

  it('require() does not auto-run the supervisor (require.main guard)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'scripts', 'supervisor.js'), 'utf8');
    assert.ok(src.includes('require.main === module'), 'main guarded');
  });
});
