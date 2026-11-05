'use strict';
/**
 * P8b measurements — poster transfer bytes on the first grid screen (FE-12 / G4).
 *
 * Usage:  node mimo/repro/p8b-measure.js [--count 40] [--label run]
 *
 * Builds a throwaway Library of `count` realistic JPEG posters (sharp-generated,
 * 1000x1500, calibrated into the 200-500 KB band), boots the real server on
 * temp dirs (never the real Library/ or data/), loads the customer grid in
 * Chromium and reports:
 *   - first load (no scroll): poster requests, transfer bytes, decoded bytes
 *   - full grid (scrolled):   same, for every card
 *   - second load:            same after reload — browser cache must serve them
 * Writes mimo/shots/p8b/measure-<label>.json + prints a human summary.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { startTestServer } = require('../../test/helpers/test-server');

const OUT_DIR = path.join(__dirname, '..', 'shots', 'p8b');

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = { count: 40, label: 'run' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') args.count = Math.max(1, parseInt(argv[++i], 10) || 40);
    if (argv[i] === '--label') args.label = String(argv[++i] || 'run').replace(/[^\w-]/g, '');
  }
  return args;
}

/** Deterministic LCG so the same seed yields the same noise (and file size). */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noiseJpeg(sharp, seed, quality) {
  const width = 1000;
  const height = 1500;
  const channels = 3;
  const rnd = makeRng(seed);
  const raw = Buffer.allocUnsafe(width * height * channels);
  for (let i = 0; i < raw.length; i++) raw[i] = (rnd() * 255) | 0;
  return sharp(raw, { raw: { width, height, channels } })
    .blur(1.2)
    .jpeg({ quality, chromaSubsampling: '4:2:0', mozjpeg: false })
    .toBuffer();
}

async function generateLibrary(sharp, libDir, count) {
  // Calibrate one seed into the 200-500 KB band, then reuse the quality with
  // a small per-file jitter so sizes vary realistically.
  let quality = 80;
  let probe = await noiseJpeg(sharp, 1, quality);
  for (let i = 0; i < 8 && (probe.length < 200 * 1024 || probe.length > 500 * 1024); i++) {
    quality += probe.length < 200 * 1024 ? 4 : -4;
    if (quality < 40 || quality > 98) break;
    probe = await noiseJpeg(sharp, 1, quality);
  }
  const actionDir = path.join(libDir, 'Movies', 'Action');
  fs.mkdirSync(actionDir, { recursive: true });
  const sizes = [];
  for (let i = 1; i <= count; i++) {
    const q = Math.min(95, Math.max(45, quality + (i % 5) - 2));
    const buf = await noiseJpeg(sharp, i, q);
    const name = `${String(i).padStart(4, '0')}- Movie ${i} ${1980 + (i % 40)}.jpg`;
    fs.writeFileSync(path.join(actionDir, name), buf);
    sizes.push(buf.length);
  }
  return { quality, sizes };
}

async function collectPosterStats(page) {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    const posters = entries.filter((e) => e.name.includes('/api/poster/'));
    const fonts = entries.filter((e) => e.name.includes('/assets/fonts/'));
    const sum = (list, key) => list.reduce((a, e) => a + (e[key] || 0), 0);
    return {
      posterCount: posters.length,
      posterTransferBytes: sum(posters, 'transferSize'),
      posterDecodedBytes: sum(posters, 'decodedBodySize'),
      fontCount: fonts.length,
      fontTransferBytes: sum(fonts, 'transferSize')
    };
  });
}

async function waitForGrid(page, count) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('movie-card').length >= n, count, { timeout: 60000 });
  // Wait until network is quiet (lazy images near the viewport have settled).
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
}

(async () => {
  const args = parseArgs();
  let sharp = null;
  try { sharp = require('sharp'); } catch { /* handled below */ }
  if (!sharp) {
    console.error('SKIP: sharp is not installed — cannot generate the poster fixture.');
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8b-lib-'));
  const gen = await generateLibrary(sharp, libDir, args.count);
  const avg = Math.round(gen.sizes.reduce((a, b) => a + b, 0) / gen.sizes.length);

  const server = await startTestServer({ libraryPath: libDir });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  const t0 = Date.now();
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForGrid(page, args.count);
  const firstLoadMs = Date.now() - t0;
  const first = await collectPosterStats(page);

  // Scroll every card into view (the app scrolls an inner container, not body)
  // so the whole grid lazy-loads, then measure the full grid.
  await page.evaluate(async () => {
    const cards = document.querySelectorAll('movie-card');
    for (const card of cards) {
      card.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  const full = await collectPosterStats(page);

  // Second load — same context, browser cache in play.
  const t1 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForGrid(page, args.count);
  const secondLoadMs = Date.now() - t1;
  const second = await collectPosterStats(page);

  const result = {
    label: args.label,
    when: new Date().toISOString(),
    posterCount: args.count,
    fixture: { quality: gen.quality, avgBytes: avg, minBytes: Math.min(...gen.sizes), maxBytes: Math.max(...gen.sizes) },
    firstLoadMs,
    secondLoadMs,
    firstScreen: first,
    fullGrid: full,
    secondLoad: second,
    project40After: Math.round((full.posterTransferBytes / Math.max(1, full.posterCount)) * 40)
  };
  const outFile = path.join(OUT_DIR, `measure-${args.label}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`P8b measure [${args.label}] — ${args.count} posters, fixture avg ${avg} B (q~${gen.quality})`);
  console.log(`  first screen : ${first.posterCount} posters, transfer ${(first.posterTransferBytes / 1024).toFixed(1)} KB, decoded ${(first.posterDecodedBytes / 1024).toFixed(1)} KB, ${firstLoadMs} ms`);
  console.log(`  full grid    : ${full.posterCount} posters, transfer ${(full.posterTransferBytes / 1024).toFixed(1)} KB, decoded ${(full.posterDecodedBytes / 1024).toFixed(1)} KB`);
  console.log(`  second load  : ${second.posterCount} posters, transfer ${(second.posterTransferBytes / 1024).toFixed(1)} KB, ${secondLoadMs} ms`);
  console.log(`  40-poster projection (full-grid avg): ${(result.project40After / 1024).toFixed(1)} KB`);
  console.log(`  -> ${outFile}`);

  await browser.close();
  await server.close();
  try { fs.rmSync(libDir, { recursive: true, force: true }); } catch {}
})().catch((e) => { console.error(e); process.exit(1); });
