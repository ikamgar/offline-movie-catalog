#!/usr/bin/env node
'use strict';
/**
 * P8c G6 — startup & payload benchmark.
 *
 * Builds a ~20k-poster fixture library in a TEMP dir (never the real
 * Library/ or data/), spawns `node server.js` as a child with its own
 * temp DATA_DIR, and measures:
 *
 *   - cold start to first GET /api/movies 200 (no cache, then with cache)
 *   - full reconcile time (meta.scanning true→false on P8c+ HEADs;
 *     pre-P8c HEADs block listen on the scan, so reconcile == first answer)
 *   - worst event-loop lag and RSS during startup+reconcile
 *     (via scripts/bench-lag-monitor.js, injected with NODE_OPTIONS
 *      --require — the server itself is not modified)
 *   - IN-SERVER probe numbers parsed from the server's own startup/reconcile
 *     summary (backend/startup-probe.js: timer drift + perf_hooks histogram,
 *     phase-attributed) — distinguishes real server stalls from harness cost
 *   - user-level latency: GET /api/auth/status every ~100 ms during the
 *     reconcile (keep-alive agent) — the worst any user actually feels
 *   - /api/movies payload bytes raw and gzip (honestly reports
 *     "no gzip" on HEADs without compression)
 *   - p50/p95 latency of GET /api/movies: plain, gzip, 304 (If-None-Match)
 *
 * All requests reuse keep-alive agents (no per-request socket churn — the
 * likely cause of the one-off ECONNRESET seen in an earlier session).
 *
 * Usage:
 *   node scripts/bench.js                     # full 20k run
 *   node scripts/bench.js --movies 20 --animation 5 --iranian 5 \
 *        --series 5 --games 5                 # tiny run (smoke test)
 *   node scripts/bench.js --keep              # keep temp dirs for inspection
 *
 * Prints a human-readable report and one machine-readable line:
 *   BENCH_RESULT {json}
 * Refuses to run against any folder outside os.tmpdir().
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURE_GEN = path.join(REPO, 'scripts', 'make-fixture-library.js');
const LAG_MONITOR = path.join(__dirname, 'bench-lag-monitor.js');
const LATENCY_SAMPLES = 50;
const FIRST_ANSWER_TIMEOUT_MS = 180000;
const RECONCILE_TIMEOUT_MS = 180000;
const PROBE_INTERVAL_MS = 100;
const PROBE_LINE_TIMEOUT_MS = 30000;

// Shared keep-alive agents — reuse sockets across the whole run so the
// harness itself never churns thousands of connections (ECONNRESET risk).
const PLAIN_AGENT = new http.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 10000 });

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const counts = { movies: 15400, animation: 2000, iranian: 1500, series: 800, games: 300 };
  let keep = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') { keep = true; continue; }
    const m = a.match(/^--(movies|animation|iranian|series|games)$/);
    if (m && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isFinite(n) || n < 0) throw new Error(`invalid count for ${a}: ${argv[i + 1]}`);
      counts[m[1]] = n;
      i++;
    }
  }
  return { counts, keep };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Refuse any path that is not inside the OS temp dir (never touch real data). */
function assertInsideTemp(p, label) {
  const abs = path.resolve(p);
  const rel = path.relative(os.tmpdir(), abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${label} must be inside ${os.tmpdir()} — refusing to touch ${abs}`);
  }
  return abs;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Raw HTTP GET (no decompression) so gzip wire size is measured honestly. */
function httpGetRaw(port, headers, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname || '/api/movies',
      method: 'GET',
      headers: headers || {},
      agent: PLAIN_AGENT
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    req.end();
  });
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

function msNow() { return Number(process.hrtime.bigint() / 1000n) / 1000; }

/**
 * User-level probe (P8c follow-up 1b): GET /api/auth/status about every
 * 100 ms while the reconcile runs — the worst latency a real user's request
 * would feel. Sequential requests on a keep-alive agent (each sample is one
 * honest round trip; a stalled event loop shows up in that sample).
 */
function startUserProbe(port) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 2, keepAliveMsecs: 10000 });
  const samples = [];
  const statuses = new Set();
  let errors = 0;
  let stopped = false;

  const one = () => new Promise((resolve, reject) => {
    const t0 = msNow();
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/auth/status',
      method: 'GET',
      agent
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ms: msNow() - t0, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('probe timeout')));
    req.end();
  });

  const loop = (async () => {
    while (!stopped) {
      const startedAt = Date.now();
      try {
        const r = await one();
        samples.push(r.ms);
        statuses.add(r.status);
      } catch {
        errors += 1;
        statuses.add('error');
      }
      const elapsed = Date.now() - startedAt;
      if (!stopped && elapsed < PROBE_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS - elapsed));
      }
    }
  })();

  return async function stop() {
    stopped = true;
    await loop.catch(() => {});
    agent.destroy();
    const ok = samples.filter((s) => Number.isFinite(s)).sort((a, b) => a - b);
    return {
      intervalMs: PROBE_INTERVAL_MS,
      samples: samples.length,
      errors,
      worstMs: ok.length ? Number(ok[ok.length - 1].toFixed(2)) : null,
      p95Ms: ok.length ? Number(percentile(ok, 0.95).toFixed(2)) : null,
      statuses: [...statuses].map(String).sort()
    };
  };
}

/** Parse the server's own probe/phase summary lines from its stdout. */
function parseServerProbe(out) {
  const r = { maxMs: null, histogramMaxMs: null, phases: null, phaseSyncChunkMax: null, syncChunksOver100: null };
  const lag = out.match(/Event-loop lag: max ([\d.]+) ms \(histogram max ([\d.]+) ms\)/);
  if (lag) {
    r.maxMs = Number(lag[1]);
    r.histogramMaxMs = Number(lag[2]);
  }
  const ph = out.match(/Reconcile phases: (.+)/);
  if (ph) {
    r.phases = ph[1].split(' → ').map((p) => {
      const m = p.trim().match(/^(\S+) (\d+)ms$/);
      return m ? { name: m[1], ms: Number(m[2]) } : null;
    }).filter(Boolean);
  }
  const sm = out.match(/Phase sync-chunk max: (.+)/);
  if (sm) {
    r.phaseSyncChunkMax = sm[1].split(', ').map((p) => {
      const m = p.trim().match(/^(\S+) ([\d.]+)ms$/);
      return m ? { phase: m[1], ms: Number(m[2]) } : null;
    }).filter(Boolean);
  }
  const ch = out.match(/Sync chunks over 100 ms: (.+)/);
  if (ch) r.syncChunksOver100 = ch[1].trim();
  return r;
}

function readLagSample(lagFile) {
  try {
    return JSON.parse(fs.readFileSync(lagFile, 'utf8'));
  } catch { return null; }
}

async function waitFirstAnswer(port, startedAt) {
  const deadline = Date.now() + FIRST_ANSWER_TIMEOUT_MS;
  for (;;) {
    try {
      const res = await httpGetRaw(port, {});
      if (res.status === 200) {
        return { firstAnswerMs: Math.round(msNow() - startedAt), res };
      }
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`no /api/movies 200 within ${FIRST_ANSWER_TIMEOUT_MS} ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Wait until the background reconcile finishes. P8c+ HEADs set
 * meta.scanning=true during it; pre-P8c HEADs scan before listen, so the
 * first answer already means "scan done" (reported as 'blocking').
 */
async function waitReconcileDone(port, firstRes, startedAt) {
  let body;
  try { body = JSON.parse(firstRes.body.toString('utf8')); } catch { body = null; }
  const hasFlag = !!(body && body.meta && typeof body.meta.scanning === 'boolean');
  if (!hasFlag) {
    return { reconcileMs: Math.round(msNow() - startedAt), detection: 'blocking (pre-P8c: scan before listen)' };
  }
  if (body.meta.scanning === false) {
    return { reconcileMs: Math.round(msNow() - startedAt), detection: 'meta.scanning (done at first answer)' };
  }
  const deadline = Date.now() + RECONCILE_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, 25));
    try {
      const res = await httpGetRaw(port, {});
      if (res.status === 200) {
        let b;
        try { b = JSON.parse(res.body.toString('utf8')); } catch { b = null; }
        if (b && b.meta && b.meta.scanning === false) {
          return { reconcileMs: Math.round(msNow() - startedAt), detection: 'meta.scanning' };
        }
      }
    } catch { /* transient */ }
    if (Date.now() > deadline) throw new Error(`meta.scanning stayed true beyond ${RECONCILE_TIMEOUT_MS} ms`);
  }
}

/** p50/p95 over LATENCY_SAMPLES sequential requests per scenario. */
async function measureLatencies(port, etag) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const one = (headers) => new Promise((resolve, reject) => {
    const t0 = msNow();
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/movies', method: 'GET',
      headers: headers || {}, agent
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ms: msNow() - t0, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    req.end();
  });

  async function series(headers) {
    const samples = [];
    for (let i = 0; i < LATENCY_SAMPLES; i++) {
      const r = await one(headers);
      samples.push(r.ms);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      p50Ms: Number(percentile(sorted, 0.50).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
      maxMs: Number(sorted[sorted.length - 1].toFixed(2))
    };
  }

  const plain = await series({});
  const gzip = await series({ 'Accept-Encoding': 'gzip' });
  let cond304 = { supported: false, note: 'no ETag on this HEAD — 304 not testable' };
  if (etag) {
    const samples = [];
    const statuses = new Set();
    for (let i = 0; i < LATENCY_SAMPLES; i++) {
      const r = await one({ 'If-None-Match': etag });
      statuses.add(r.status);
      samples.push(r.ms);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    cond304 = {
      supported: true,
      statuses: [...statuses].sort(),
      p50Ms: Number(percentile(sorted, 0.50).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2))
    };
  }
  agent.destroy();
  return { plain, gzip, cond304 };
}

// ─── one full server run ────────────────────────────────────────────────────

async function runOnce({ label, libDir, dataDir }) {
  const port = await freePort();
  const lagFile = path.join(dataDir, `bench-lag-${label}.json`);
  const env = {
    ...process.env,
    PORT: String(port),
    LIBRARY_PATH: libDir,
    DATA_DIR: dataDir,
    BENCH_LAG_FILE: lagFile,
    // Forward slashes: NODE_OPTIONS treats backslashes as escapes.
    NODE_OPTIONS: `--require "${LAG_MONITOR.replace(/\\/g, '/')}"`
  };
  delete env.DEBUG_SCAN;

  console.log(`\n=== ${label}: spawning server on port ${port} ===`);
  const startedAt = msNow();
  const child = spawn(process.execPath, [path.join(REPO, 'server.js')], {
    env,
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let childOut = '';
  child.stdout.on('data', (d) => { childOut += d; });
  child.stderr.on('data', (d) => { childOut += d; });

  try {
    const { firstAnswerMs, res: firstRes } = await waitFirstAnswer(port, startedAt);
    console.log(`  first /api/movies 200: ${firstAnswerMs} ms`);

    // User-level probe runs exactly while meta.scanning is true.
    const stopUserProbe = startUserProbe(port);
    const { reconcileMs, detection } = await waitReconcileDone(port, firstRes, startedAt);
    const userProbe = await stopUserProbe();
    console.log(`  reconcile done:        ${reconcileMs} ms  (${detection})`);
    console.log(`  user probe:            ${userProbe.samples} samples @${userProbe.intervalMs} ms, ` +
      `worst ${userProbe.worstMs ?? 'n/a'} ms, p95 ${userProbe.p95Ms ?? 'n/a'} ms` +
      (userProbe.errors ? `, ${userProbe.errors} error(s)` : '') +
      ` (statuses ${userProbe.statuses.join(',')})`);

    // In-server probe summary — printed by the server when the reconcile
    // settles (may land a moment after meta.scanning flipped false).
    let serverProbe = parseServerProbe(childOut);
    const probeDeadline = Date.now() + PROBE_LINE_TIMEOUT_MS;
    while (serverProbe.maxMs == null && Date.now() < probeDeadline) {
      await new Promise((r) => setTimeout(r, 100));
      serverProbe = parseServerProbe(childOut);
    }
    console.log(`  in-server lag probe:   worst ${serverProbe.maxMs ?? 'n/a'} ms` +
      (serverProbe.histogramMaxMs != null ? `, histogram max ${serverProbe.histogramMaxMs} ms` : ''));
    if (serverProbe.phases && serverProbe.phases.length) {
      console.log(`  in-server phases:      ${serverProbe.phases.map((p) => `${p.name} ${p.ms}ms`).join(' → ')}`);
    }
    if (serverProbe.phaseSyncChunkMax && serverProbe.phaseSyncChunkMax.length) {
      console.log(`  phase sync-chunk max:  ${serverProbe.phaseSyncChunkMax.map((p) => `${p.phase} ${p.ms}ms`).join(', ')}`);
    }
    if (serverProbe.syncChunksOver100) {
      console.log(`  SYNC CHUNKS > 100 ms:  ${serverProbe.syncChunksOver100}`);
    }

    const lag = readLagSample(lagFile);
    const worstEventLoopLagMs = lag ? lag.maxLagMs : null;
    const rssMB = lag ? Number((lag.rssBytes / 1048576).toFixed(1)) : null;
    const heapMB = lag ? Number((lag.heapUsedBytes / 1048576).toFixed(1)) : null;
    console.log(`  worst event-loop lag:  ${worstEventLoopLagMs ?? 'n/a'} ms`);
    console.log(`  RSS after load:        ${rssMB ?? 'n/a'} MB (heap ${heapMB ?? 'n/a'} MB)`);

    const plainRes = await httpGetRaw(port, {});
    const rawBytes = plainRes.body.length;
    const etag = plainRes.headers.etag || null;

    // Poll until the async gzip warm-up (kicked by the rebuild) has landed —
    // the first request after a rebuild may still race it and get raw bytes.
    let gzRes = null;
    for (let i = 0; i < 40; i++) {
      gzRes = await httpGetRaw(port, { 'Accept-Encoding': 'gzip' });
      if (gzRes.headers['content-encoding'] === 'gzip') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const gzipSupported = !!(gzRes && gzRes.headers['content-encoding'] === 'gzip');
    const gzipBytes = gzipSupported ? gzRes.body.length : rawBytes;

    console.log(`  payload /api/movies:   raw ${rawBytes} B, gzip ${gzipBytes} B` +
      (gzipSupported ? '' : '  (no gzip support on this HEAD)'));

    const latencies = await measureLatencies(port, etag);
    console.log(`  latency plain  p50/p95: ${latencies.plain.p50Ms}/${latencies.plain.p95Ms} ms`);
    console.log(`  latency gzip   p50/p95: ${latencies.gzip.p50Ms}/${latencies.gzip.p95Ms} ms`);
    console.log(`  latency 304:            ${latencies.cond304.supported
      ? `p50/p95 ${latencies.cond304.p50Ms}/${latencies.cond304.p95Ms} ms (statuses ${latencies.cond304.statuses.join(',')})`
      : latencies.cond304.note}`);

    let movies = null;
    try {
      const parsed = JSON.parse(plainRes.body.toString('utf8'));
      movies = Array.isArray(parsed.movies) ? parsed.movies.length : null;
    } catch { /* keep null */ }

    return {
      port,
      firstAnswerMs,
      reconcileMs,
      reconcileDetection: detection,
      worstEventLoopLagMs,
      serverProbe,
      userProbe,
      rssMB,
      heapMB,
      movies,
      rawBytes,
      gzipBytes,
      gzipSupported,
      etag,
      latencies
    };
  } catch (err) {
    console.error(`  run failed: ${err.message}`);
    console.error(`  --- server output (tail) ---\n${childOut.slice(-2000)}`);
    throw err;
  } finally {
    child.kill();
    await new Promise((resolve) => {
      const t = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const { counts, keep } = parseArgs(process.argv.slice(2));
  const total = counts.movies + counts.animation + counts.iranian + counts.series + counts.games;

  const root = assertInsideTemp(fs.mkdtempSync(path.join(os.tmpdir(), 'p8c-bench-')), 'bench root');
  const libDir = assertInsideTemp(path.join(root, 'Library'), 'library dir');
  const dataDir = assertInsideTemp(path.join(root, 'data'), 'data dir');
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  console.log(`P8c bench — ${total} fixture posters`);
  console.log(`  library: ${libDir}`);
  console.log(`  data:    ${dataDir}`);

  console.log('\n=== generating fixture library ===');
  const gen = spawnSync(process.execPath, [
    FIXTURE_GEN,
    '--out', libDir,
    '--movies', String(counts.movies),
    '--animation', String(counts.animation),
    '--iranian', String(counts.iranian),
    '--series', String(counts.series),
    '--games', String(counts.games)
  ], { stdio: 'inherit' });
  if (gen.status !== 0) throw new Error(`fixture generation failed (exit ${gen.status})`);

  // Run A: cold start, no catalog.json cache.
  const runA = await runOnce({ label: 'cold-no-cache', libDir, dataDir });

  // Run B: restart with the catalog.json the first run flushed.
  const cachePath = path.join(dataDir, 'catalog.json');
  const cacheBytes = fs.existsSync(cachePath) ? fs.statSync(cachePath).size : 0;
  console.log(`\ncache file: ${cacheBytes} bytes`);
  const runB = await runOnce({ label: 'warm-with-cache', libDir, dataDir });

  const result = {
    totalFixtures: total,
    cacheBytes,
    coldNoCache: runA,
    warmWithCache: runB
  };

  console.log('\n=== summary ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`BENCH_RESULT ${JSON.stringify(result)}`);

  if (!keep) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  } else {
    console.log(`kept: ${root}`);
  }

  PLAIN_AGENT.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    PLAIN_AGENT.destroy();
    console.error(`\nbench failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, assertInsideTemp, percentile };
