'use strict';
/**
 * P8c G6 — in-process sampler for scripts/bench.js.
 *
 * Loaded into the server child via NODE_OPTIONS="--require <this file>",
 * so the benchmark works unchanged on pre-P8c HEADs (no server edits).
 *
 * Writes {maxLagMs, meanLagMs, rssBytes, heapUsedBytes, at} to the file
 * named by BENCH_LAG_FILE once a second. The interval is unref'd — it
 * never keeps the process alive, and a failure to write is silently
 * ignored (the bench reports "no sample" instead of crashing the server).
 */
const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');

const lagFile = process.env.BENCH_LAG_FILE;
if (lagFile) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();

  const write = () => {
    try {
      const mu = process.memoryUsage();
      fs.writeFileSync(lagFile, JSON.stringify({
        maxLagMs: Math.round(histogram.max / 1e4) / 100,
        meanLagMs: Math.round(histogram.mean / 1e4) / 100,
        rssBytes: mu.rss,
        heapUsedBytes: mu.heapUsed,
        at: Date.now()
      }));
    } catch { /* bench dir vanished or disk full — skip this tick */ }
  };

  write();
  const timer = setInterval(write, 1000);
  if (timer.unref) timer.unref();
}
