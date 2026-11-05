'use strict';
/**
 * P5b screenshot diff — before vs after, per pair, using a Chromium canvas
 * (no new npm dependency; PNG is lossless so exact compare is meaningful).
 *
 * Usage:  node mimo/repro/p5b-shot-diff.js
 *
 * For every PNG in mimo/shots/p5b/before/ it compares against the same file in
 * after/ and reports:
 *   - diffPixels   : pixels with any channel delta > TOLERANCE
 *   - pct          : diffPixels / total * 100
 *   - maxDelta     : largest per-channel delta across the image
 *   - bbox         : bounding box of differing pixels (x,y,w,h) or null
 * Pairs missing on either side are listed as MISSING.
 * Writes mimo/shots/p5b/diff-report.txt and exits 0.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SHOTS = path.join(__dirname, '..', 'shots', 'p5b');
const BEFORE = path.join(SHOTS, 'before');
const AFTER = path.join(SHOTS, 'after');
const REPORT = path.join(SHOTS, 'diff-report.txt');
const TOLERANCE = 2; // channel delta <= 2 counts as equal (antialiasing noise)

async function comparePair(browser, name) {
  const a = fs.readFileSync(path.join(BEFORE, name)).toString('base64');
  const b = fs.readFileSync(path.join(AFTER, name)).toString('base64');
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ a, b, tol }) => {
      const load = (src) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });
      const [ia, ib] = await Promise.all([
        load('data:image/png;base64,' + a),
        load('data:image/png;base64,' + b)
      ]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height] };
      }
      const w = ia.width, h = ia.height;
      const ca = document.createElement('canvas'); ca.width = w; ca.height = h;
      const cb = document.createElement('canvas'); cb.width = w; cb.height = h;
      const xa = ca.getContext('2d'); xa.drawImage(ia, 0, 0);
      const xb = cb.getContext('2d'); xb.drawImage(ib, 0, 0);
      const da = xa.getImageData(0, 0, w, h).data;
      const db = xb.getImageData(0, 0, w, h).data;
      let diff = 0, maxDelta = 0;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let i = 0; i < da.length; i += 4) {
        const dr = Math.abs(da[i] - db[i]);
        const dg = Math.abs(da[i + 1] - db[i + 1]);
        const dbb = Math.abs(da[i + 2] - db[i + 2]);
        const daa = Math.abs(da[i + 3] - db[i + 3]);
        const d = Math.max(dr, dg, dbb, daa);
        if (d > maxDelta) maxDelta = d;
        if (d > tol) {
          diff++;
          const px = (i / 4) % w, py = Math.floor((i / 4) / w);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      const total = w * h;
      return {
        size: [w, h],
        diffPixels: diff,
        pct: (diff / total) * 100,
        maxDelta,
        bbox: maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null
      };
    }, { a, b, tol: TOLERANCE });
  } finally {
    await page.close();
  }
}

(async () => {
  const beforeFiles = fs.readdirSync(BEFORE).filter((f) => f.endsWith('.png')).sort();
  const afterFiles = new Set(fs.readdirSync(AFTER).filter((f) => f.endsWith('.png')));
  const browser = await chromium.launch();
  const lines = [];
  const rows = [];
  let identical = 0;

  for (const name of beforeFiles) {
    if (!afterFiles.has(name)) {
      lines.push(`MISSING after: ${name}`);
      continue;
    }
    const r = await comparePair(browser, name);
    if (r.sizeA) {
      lines.push(`SIZE MISMATCH ${name}: ${JSON.stringify(r.sizeA)} vs ${JSON.stringify(r.sizeB)}`);
      continue;
    }
    const same = r.diffPixels === 0;
    if (same) identical++;
    rows.push({ name, ...r, same });
    const bbox = r.bbox ? `${r.bbox.x},${r.bbox.y} ${r.bbox.w}x${r.bbox.h}` : '-';
    lines.push(
      `${same ? 'SAME ' : 'DIFF '} ${name}  diffPx=${r.diffPixels} (${r.pct.toFixed(3)}%)  ` +
      `maxDelta=${r.maxDelta}  bbox=${bbox}`
    );
  }
  const extra = [...afterFiles].filter((f) => !beforeFiles.includes(f));
  for (const f of extra) lines.push(`EXTRA after-only: ${f}`);

  await browser.close();

  const summary =
    `P5b shot diff — ${beforeFiles.length} pairs, ${identical} identical, ` +
    `${rows.length - identical} differ (tolerance=${TOLERANCE})\n` +
    `total diff pixels: ${rows.reduce((s, r) => s + r.diffPixels, 0)}\n` +
    `\n`;
  const out = summary + lines.join('\n') + '\n';
  fs.writeFileSync(REPORT, out);
  console.log(summary.trim());
  for (const r of rows.filter((x) => !x.same)) {
    console.log(`DIFF ${r.name}: ${r.diffPixels}px (${r.pct.toFixed(3)}%) maxDelta=${r.maxDelta} bbox=${JSON.stringify(r.bbox)}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
