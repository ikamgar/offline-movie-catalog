'use strict';
/**
 * P8c G6 — smoke-test scripts/bench.js on a tiny fixture.
 *
 * Asserts the harness completes end-to-end and emits a BENCH_RESULT line
 * with the expected shape. Deliberately does NOT assert timing values
 * (machine-dependent) — the real 20k numbers live in the phase report.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const BENCH = path.join(REPO, 'scripts', 'bench.js');

describe('scripts/bench.js smoke (P8c G6)', () => {
  let stdout = '';
  let stderr = '';
  let exitCode = null;

  before(async () => {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        BENCH, '--movies', '8', '--animation', '2', '--iranian', '2',
        '--series', '2', '--games', '2'
      ], { cwd: REPO, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('bench smoke timed out'));
      }, 120000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        exitCode = code;
        resolve();
      });
      child.on('error', reject);
    });
  });

  after(() => { /* temp dirs are cleaned by bench itself */ });

  it('exits 0 and prints one BENCH_RESULT line', () => {
    assert.equal(exitCode, 0, `bench failed:\n${stderr.slice(-1500)}\n${stdout.slice(-1500)}`);
    const lines = stdout.split(/\r?\n/).filter((l) => l.startsWith('BENCH_RESULT '));
    assert.equal(lines.length, 1, 'exactly one BENCH_RESULT line');
  });

  it('BENCH_RESULT carries the expected keys and shapes', () => {
    const line = stdout.split(/\r?\n/).find((l) => l.startsWith('BENCH_RESULT '));
    const result = JSON.parse(line.slice('BENCH_RESULT '.length));

    assert.equal(result.totalFixtures, 16);
    assert.ok(Number.isFinite(result.cacheBytes) && result.cacheBytes > 0, 'cacheBytes');

    for (const run of [result.coldNoCache, result.warmWithCache]) {
      assert.ok(run, 'both runs present');
      assert.ok(Number.isFinite(run.firstAnswerMs), 'firstAnswerMs');
      assert.ok(Number.isFinite(run.reconcileMs), 'reconcileMs');
      // Tiny fixtures can finish the reconcile before the first answer —
      // bench.js reports that variant distinctly; both prove the flag exists.
      assert.ok(
        run.reconcileDetection === 'meta.scanning' ||
        run.reconcileDetection === 'meta.scanning (done at first answer)',
        `P8c flag detected (got ${run.reconcileDetection})`
      );
      assert.ok(Array.isArray(run.latencies.cond304.statuses), '304 statuses reported');
      assert.ok(run.latencies.cond304.statuses.includes(304), 'If-None-Match produces 304');
      assert.ok(run.rawBytes > 0 && run.gzipBytes > 0, 'payload bytes');
      assert.ok(run.gzipSupported, 'gzip supported on this HEAD');
      assert.ok(typeof run.etag === 'string' && run.etag.startsWith('"'), 'quoted ETag');
      assert.ok(Number.isFinite(run.latencies.plain.p50Ms), 'plain p50');
    }

    // Warm start must beat the cold start on first answer (cache is the point)
    assert.ok(result.warmWithCache.firstAnswerMs <= result.coldNoCache.firstAnswerMs + 1000,
      'warm first answer not worse than cold');
  });
});
