'use strict';
/**
 * Startup/reconcile event-loop probe (P8c follow-up, G6).
 *
 * Answers "is the event loop actually blocked, and inside which reconcile
 * phase?" — the harness's injected monitor (scripts/bench-lag-monitor.js)
 * only reports one process-wide maximum, so it cannot attribute a stall to
 * a phase or distinguish harness cost from server cost.
 *
 * Two samplers, both unref'd:
 *   1. Timer drift: a 10 ms interval; every tick records
 *      max(0, gap - 10 ms) against the current phase label. This is the
 *      per-phase "longest synchronous chunk" number (±10 ms resolution).
 *   2. perf_hooks.monitorEventLoopDelay: histogram cross-check of the
 *      absolute worst block (independent of our own scheduling).
 *
 * Lifecycle: start() in createServer() (covers loadFromDisk + initialize),
 * stop() when the reconcile settles (or on server stop()). Results stay
 * readable afterwards via the `result` getter / server.getStartupProbe().
 */
const { monitorEventLoopDelay } = require('perf_hooks');

const TICK_MS = 10;

class StartupProbe {
  constructor() {
    this._running = false;
    this._phase = 'startup';
    this._phaseMax = new Map(); // phase → worst drift (ms, fractional)
    this._last = 0n;
    this._timer = null;
    this._hist = null;
    this._result = null;
  }

  /** Begin sampling. Safe to call twice (no-op while running). */
  start() {
    if (this._running) return;
    this._running = true;
    this._phase = 'startup';
    this._phaseMax = new Map();
    this._last = process.hrtime.bigint();
    this._hist = monitorEventLoopDelay({ resolution: 10 });
    this._hist.enable();
    this._timer = setInterval(() => this._tick(), TICK_MS);
    if (this._timer.unref) this._timer.unref();
  }

  _recordDrift(phase, drift) {
    const phaseMax = this._phaseMax.get(phase) || 0;
    if (drift > phaseMax) this._phaseMax.set(phase, drift);
  }

  _tick() {
    const now = process.hrtime.bigint();
    const gapMs = Number(now - this._last) / 1e6;
    this._last = now;
    this._recordDrift(this._phase, Math.max(0, gapMs - TICK_MS));
  }

  /**
   * Attribute the pending gap (since the last tick) to the CURRENT phase,
   * then re-base _last. Called on every phase switch and on stop().
   */
  _flushPendingGap() {
    const now = process.hrtime.bigint();
    const gapMs = Number(now - this._last) / 1e6;
    if (gapMs <= TICK_MS) return;
    this._recordDrift(this._phase, gapMs - TICK_MS);
    this._last = now;
  }

  /**
   * Label the current window (phase names are the reconcile step names).
   * The pending gap is flushed BEFORE the switch: a long synchronous chunk
   * that ends right before this call (block → mark()) has produced no tick
   * yet, and without the flush the next tick would attribute the whole
   * block to the NEW phase (seen as a 28.7 s "thumbs" in the P8c bench).
   */
  setPhase(name) {
    if (!this._running) return;
    if (name === this._phase) return;
    this._flushPendingGap();
    this._phase = name;
  }

  /**
   * Stop sampling and freeze the result.
   * @returns {{maxMs:number, phaseMax:object, histogramMaxMs:number}|null}
   */
  stop() {
    if (!this._running) return this._result;
    this._running = false;
    this._flushPendingGap(); // a final block ending right before stop() is kept
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    const histMaxMs = this._hist ? Number(this._hist.max) / 1e6 : 0;
    const histMeanMs = this._hist ? Number(this._hist.mean) / 1e6 : 0;
    if (this._hist) {
      this._hist.disable();
      this._hist = null;
    }
    const phaseMax = {};
    let maxMs = 0;
    for (const [phase, ms] of this._phaseMax) {
      phaseMax[phase] = Number(ms.toFixed(1));
      if (ms > maxMs) maxMs = ms;
    }
    this._result = {
      maxMs: Number(maxMs.toFixed(1)),
      histogramMaxMs: Number(histMaxMs.toFixed(1)),
      histogramMeanMs: Number(histMeanMs.toFixed(2)),
      phaseMax
    };
    return this._result;
  }

  /** Frozen result (null while running — call stop() first). */
  get result() {
    return this._result;
  }

  get running() {
    return this._running;
  }
}

module.exports = StartupProbe;
