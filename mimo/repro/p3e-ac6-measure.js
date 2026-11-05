'use strict';

/**
 * P3e AC6 re-measure on the same 20k fixture:
 *   - diagnostics.runFullReport (DATA-15 / B9) — target ≤ 300 ms
 *   - cold scanLibraryAsync total — budget ≤ 10 s
 *   - event-loop lag during scanLibraryAsync — budget ≤ 200 ms per tick
 */
const path = require('path');
const os = require('os');
const CatalogIndexer = require('../../backend/indexer');
const Diagnostics = require('../../backend/diagnostics');
const { scanLibraryAsync, scanGamesAsync } = require('../../backend/scanner');

const FIXTURE = process.env.LIBRARY_PATH ||
  path.join(os.tmpdir(), 'p2b-fixture-20k');

function fmt(ms) {
  return ms.toFixed(2).padStart(9) + ' ms';
}

async function main() {
  console.log(`fixture: ${FIXTURE}`);
  const catalogPath = path.join(os.tmpdir(), 'p3e-ac6-catalog.json');
  const idx = new CatalogIndexer(catalogPath);

  // 1) Cold async scan (movies + games)
  let maxLag = 0;
  let last = Date.now();
  let running = true;
  const probe = () => {
    if (!running) return;
    const now = Date.now();
    const lag = now - last;
    // ignore the first tick (last was set before the chain started)
    if (last !== 0 && lag > maxLag) maxLag = lag;
    last = now;
    setImmediate(probe);
  };
  setImmediate(probe);

  const tScan0 = process.hrtime.bigint();
  const scan = await scanLibraryAsync(FIXTURE);
  const scanMs = Number(process.hrtime.bigint() - tScan0) / 1e6;

  const tGames0 = process.hrtime.bigint();
  const games = await scanGamesAsync(FIXTURE);
  const gamesMs = Number(process.hrtime.bigint() - tGames0) / 1e6;

  running = false;

  const tIdx0 = process.hrtime.bigint();
  idx.setLastInvalid(scan.invalid || []);
  idx.replaceFromScan(scan.results);
  idx.processGameResults(games.results);
  const idxMs = Number(process.hrtime.bigint() - tIdx0) / 1e6;

  console.log(`     ${fmt(scanMs)}  scanLibraryAsync cold (movies)`);
  console.log(`     ${fmt(gamesMs)}  scanGamesAsync cold (games)`);
  console.log(`     ${fmt(idxMs)}  indexer.replaceFromScan + processGameResults`);
  console.log(`     ${fmt(maxLag)}  max event-loop lag during async scans  [budget ≤200ms]`);

  // 2) diagnostics — cold (first call) and warm (cached)
  const diag = new Diagnostics(idx, FIXTURE, null);
  const tD0 = process.hrtime.bigint();
  const report = diag.runFullReport();
  const dCold = Number(process.hrtime.bigint() - tD0) / 1e6;

  const tD1 = process.hrtime.bigint();
  diag.runFullReport();
  const dWarm = Number(process.hrtime.bigint() - tD1) / 1e6;

  console.log(`     ${fmt(dCold)}  diagnostics.runFullReport cold  [target ≤300ms]`);
  console.log(`     ${fmt(dWarm)}  diagnostics.runFullReport warm (30s cache)`);
  console.log(`  movies=${report.summary.totalMovies} games=${report.summary.totalGames} ` +
    `files=${report.summary.totalFiles} issues=${report.summary.totalIssues} ` +
    `invalid=${report.issues.invalidFilenames.length}`);

  // 3) Second cold pass after invalidate (cache-excluded path)
  diag.invalidate();
  const tD2 = process.hrtime.bigint();
  diag.runFullReport();
  const dCold2 = Number(process.hrtime.bigint() - tD2) / 1e6;
  console.log(`     ${fmt(dCold2)}  diagnostics.runFullReport cold after invalidate`);

  const passScan = scanMs <= 10000;
  const passLag = maxLag <= 200;
  const passDiag = dCold <= 300 && dCold2 <= 300;
  console.log(`\nAC8 cold scan ≤10s: ${passScan ? 'PASS' : 'FAIL'}; ` +
    `lag ≤200ms: ${passLag ? 'PASS' : 'FAIL'}; ` +
    `diagnostics ≤300ms: ${passDiag ? 'PASS' : 'FAIL'}`);

  try { require('fs').rmSync(catalogPath); } catch {}
  process.exit(passScan && passLag && passDiag ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
