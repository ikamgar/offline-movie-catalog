'use strict';
/**
 * P8c follow-up — in-server lag probe phase attribution.
 *
 * Bug fixed here: a long synchronous chunk that ends right before
 * setPhase() produced no timer tick, so the next tick attributed the whole
 * block to the NEW phase (seen as a 28.7 s "thumbs" in the first 20k bench).
 * setPhase()/stop() now flush the pending gap to the OLD phase first.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const StartupProbe = require('../../backend/startup-probe');

/** Block the event loop for `ms` milliseconds (busy spin — no timers fire). */
function spin(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

describe('P8c — StartupProbe phase attribution', () => {
  it('attributes a blocking chunk to the phase it ran in, not the next one', async () => {
    const probe = new StartupProbe();
    probe.start();
    await new Promise((r) => setImmediate(r)); // baseline loop turn for the histogram
    probe.setPhase('block-a');
    spin(150);
    probe.setPhase('block-b'); // the block must land in block-a
    spin(10);
    await new Promise((r) => setImmediate(r)); // loop turn after the block
    const result = probe.stop();

    assert.ok(result, 'frozen result');
    assert.ok((result.phaseMax['block-a'] || 0) >= 100,
      `block-a should hold the ~150 ms chunk, got ${result.phaseMax['block-a']}`);
    assert.ok((result.phaseMax['block-b'] || 0) < 80,
      `block-b must not inherit the block-a chunk, got ${result.phaseMax['block-b']}`);
    // Histogram cross-check (resolution 10 ms): the absolute worst is real
    assert.ok(result.histogramMaxMs >= 100,
      `histogram should see the block, got ${result.histogramMaxMs}`);
  });

  it('records the worst chunk per phase and stop() flushes the final gap', () => {
    const probe = new StartupProbe();
    probe.start();
    probe.setPhase('short');
    spin(10);
    probe.setPhase('long');
    spin(120);
    probe.stop(); // final gap (the 120 ms block) flushed to "long" at stop

    const result = probe.result;
    assert.ok((result.phaseMax['long'] || 0) >= 90,
      `long holds the final block, got ${result.phaseMax['long']}`);
    assert.ok(result.maxMs >= 90, 'maxMs reflects the worst phase');
  });

  it('setPhase is a no-op while stopped and for the same label', () => {
    const probe = new StartupProbe();
    probe.setPhase('x'); // not running — ignored
    probe.start();
    probe.setPhase('same');
    probe.setPhase('same'); // identical label — no flush/relabel
    const before = probe.stop();
    assert.ok(before);
    probe.setPhase('after-stop'); // stopped — ignored
    assert.equal(probe.running, false);
  });
});
