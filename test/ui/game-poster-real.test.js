'use strict';

/**
 * F28 — end-to-end client journey proof: a REAL >100KB game poster goes
 * through POST /api/games (the route the 100 KB body guard used to 413) and
 * the real browser renders it on the games grid from the REAL server:
 *   page loads → header switch to games mode → a .movie-card.game-card
 *   appears → its <img> decodes the served bytes (naturalWidth > 0) → the
 *   original endpoint URL answers 200 with an image content-type.
 *
 * Requires Playwright + sharp (only in this test). Skips cleanly otherwise.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

let chromium;
let sharp;
try { ({ chromium } = require('playwright')); } catch { /* optional */ }
try { sharp = require('sharp'); } catch { /* optional */ }

const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

const skip = chromium && sharp
  ? false
  : { skip: `Playwright browsers or sharp not installed (chromium=${!!chromium}, sharp=${!!sharp})` };

/** ~300KB decodable PNG: deterministic RGB noise at 316×316. */
async function bigPosterPng() {
  const W = 316, H = 316;
  const raw = Buffer.alloc(W * H * 3);
  let seed = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    raw[i] = seed & 0xff;
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

function postJson(baseUrl, urlPath, bodyObj, headers) {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers,
        'Content-Length': String(Buffer.byteLength(body)) }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('F28 - real UI drops a >100KB game poster on the real server', { skip }, () => {
  let browser, server, page;
  let posterBytes;

  before(async () => {
    server = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
      admin: { username: 'admin', password: 'testadmin123456' }
    });

    posterBytes = await bigPosterPng();
    assert.ok(posterBytes.length > 100 * 1024,
      `poster must exceed 100KB: ${posterBytes.length} bytes`);

    // Real admin → REAL server POST /api/games with the big poster
    const token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
    const res = await postJson(server.baseUrl, '/api/games', {
      title: 'Poster Heavy Game',
      platforms: ['PS4'],
      poster: 'data:image/png;base64,' + posterBytes.toString('base64')
    }, { 'Authorization': `Bearer ${token}` });
    assert.equal(res.status, 200,
      `real game create must not 413: ${JSON.stringify(res.json || res.raw)}`);
    assert.equal(res.json.success, true);

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(server.baseUrl);
    await page.waitForSelector('#mediaModeToggle');
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close();
    if (server) await server.close();
  });

  it('games grid shows the game card and the browser serves + decodes the big poster', async () => {
    // Deterministic readiness: the header switch is wired once the app shell
    // has mounted — the games toggle button is present in the DOM. Wait for
    // that explicit signal, then switch once (no bounded-retry loop).
    await page.waitForSelector('#mediaModeToggle button[data-mode="games"]', { timeout: 15000 });
    await page.click('#mediaModeToggle button[data-mode="games"]');
    await page.waitForSelector('.movie-card.game-card', { timeout: 15000 });

    // Wait until the card's poster <img> is actually loaded (lazy loader)
    const img = await page.waitForFunction(() => {
      const el = document.querySelector('.movie-card.game-card .movie-card-poster');
      return el && el.complete && el.naturalWidth > 0
        ? { src: el.currentSrc || el.src, w: el.naturalWidth } : null;
    }, null, { timeout: 15000 });
    const imgInfo = await img.jsonValue();
    assert.ok(imgInfo, 'game card poster rendered');
    assert.ok((imgInfo.src || '').includes('/api/game-poster/'),
      `poster URL should hit the game-poster route: ${imgInfo && imgInfo.src}`);

    // The REAL endpoint the browser fetched answers 200 with image bytes
    const res = await page.request.get(imgInfo.src);
    assert.equal(res.status(), 200, `served status: ${res.status()}`);
    assert.ok(String(res.headers()['content-type'] || '').startsWith('image/'),
      `content-type: ${res.headers()['content-type']}`);

    // Byte-identical with what was uploaded (requesting the ?w-less original)
    const original = imgInfo.src.replace(/[?&]w=\d+/, (part) =>
      part.startsWith('?') ? '' : '');
    const resOriginal = await page.request.get(original);
    assert.equal(resOriginal.status(), 200);
    assert.ok(Buffer.from(await resOriginal.body()).equals(posterBytes),
      'served bytes equal the uploaded poster');

    const ps4Dir = path.join(server.libraryPath, 'Games', 'PS4');
    assert.ok(fs.existsSync(ps4Dir) &&
      fs.readdirSync(ps4Dir).some((f) => f.startsWith('Poster Heavy Game.')),
      'poster copy written on disk (creator names by detected extension');
  });
});
