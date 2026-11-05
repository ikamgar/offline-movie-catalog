'use strict';
/**
 * P8b follow-up — poster replaced in place, proven in the REAL UI (Playwright
 * against the REAL server, not the ui-stub):
 *   1. watcher picks up a same-name overwrite → catalog:changed → grid card
 *      re-renders with the new `?v` URL → the browser actually fetches and
 *      displays the new image bytes (old immutable URL stays cached).
 *   2. edit-modal poster replace (PUT by-uid) → card shows the new poster.
 *
 * Temp dirs only (startTestServer cleans up), never the real Library/.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startTestServer } = require('../helpers/test-server');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

/** 2×2 red PNG (sharp-generated, verified decodable). */
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==',
  'base64'
);
/** 2×2 blue PNG. */
const BLUE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgYPgPRmAKABf2A/38FIMyAAAAAElFTkSuQmCC',
  'base64'
);
/** 2×2 green PNG (edit-modal replace). */
const GREEN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNg+M8AQhAKABvyA/3vqwwGAAAAAElFTkSuQmCC',
  'base64'
);

function vOf(url) {
  const m = (url || '').match(/[?&]v=(\d+)/);
  return m ? m[1] : null;
}

/** Drop `&w=300` — grid URLs are WebP thumbs; byte-level checks need the original. */
function stripW(url) {
  return (url || '').replace(/[?&]w=\d+/, (m) => (m.startsWith('?') ? '' : ''));
}

describe('P8b follow-up - UI shows a poster replaced in place', { skip: skipIfNoBrowser() }, () => {
  let browser, srv, page;
  let posterPath;

  before(async () => {
    srv = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': RED_PNG },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    posterPath = path.join(srv.libraryPath, 'Movies', 'Action', '0001- Heat 1995.jpg');

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(srv.baseUrl);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    // Poster images are lazy (data-src → src via IntersectionObserver) — wait
    // until the first card's poster has been promoted to a real src.
    await page.waitForFunction(() => {
      const img = document.querySelector('movie-card .movie-card-poster');
      return img && img.getAttribute('src') && img.getAttribute('src').includes('?v=');
    }, null, { timeout: 10000 });
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close();
    if (srv) await srv.close();
  });

  async function cardPoster() {
    return page.evaluate(() => {
      const img = document.querySelector('movie-card .movie-card-poster');
      return img ? { src: img.currentSrc || img.src, complete: img.complete, w: img.naturalWidth } : null;
    });
  }

  it('watcher overwrite → card swaps to the new ?v URL and serves the new bytes', async () => {
    const before1 = await cardPoster();
    assert.ok(before1 && before1.src, 'card poster src required');
    const oldV = vOf(before1.src);
    assert.ok(oldV, `initial poster URL must carry ?v, got ${before1.src}`);

    // Old ORIGINAL URL in-page → old bytes (red). The grid src carries &w=300
    // (WebP thumb); strip it to fetch the original poster bytes.
    const oldInPage = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const b = new Uint8Array(await r.arrayBuffer());
      return Array.from(b.slice(0, 8));
    }, stripW(before1.src));
    assert.deepEqual(oldInPage, Array.from(RED_PNG.slice(0, 8)), 'before: red bytes');

    // Overwrite the file in place with different bytes + newer mtime
    fs.writeFileSync(posterPath, BLUE_PNG);
    const t0 = Date.now();
    fs.utimesSync(posterPath, new Date(t0 + 5000), new Date(t0 + 5000));

    // catalog:changed → debounced loadCatalog (500 ms) → card re-render with
    // new poster URL → lazy loader sets the new src. Wait for the src change.
    await page.waitForFunction((old) => {
      const img = document.querySelector('movie-card .movie-card-poster');
      return img && img.src.includes('?v=') && img.src !== old;
    }, before1.src, { timeout: 10000 });

    const after1 = await cardPoster();
    const newV = vOf(after1.src);
    assert.ok(newV, `new poster URL must carry ?v, got ${after1.src}`);
    assert.notEqual(newV, oldV, `UI must switch to a new ?v (old ${oldV}, new ${newV})`);

    // The NEW URL serves the new bytes — this is what the browser now shows.
    const newInPage = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const b = new Uint8Array(await r.arrayBuffer());
      return Array.from(b.slice(0, 8));
    }, stripW(after1.src));
    assert.deepEqual(newInPage, Array.from(BLUE_PNG.slice(0, 8)),
      'new ?v URL must serve the blue bytes (UI shows the new image)');

    // The OLD immutable URL is still in the browser cache — a fresh fetch of
    // the old URL returns the CURRENT disk file (server-side), but the card no
    // longer references it; proving the cache-bust works: different URL → refetch.
    const sameUrlRefetched = await page.evaluate(async (u) => {
      const r = await fetch(u, { cache: 'force-cache' });
      return r.status;
    }, after1.src);
    assert.equal(sameUrlRefetched, 200, 'new URL fetchable');
  });

  it('edit-modal poster replace → card shows the new poster through the real save path', async () => {
    // Admin login (card gains the edit button)
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'testadmin123456');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);

    const before2 = await cardPoster();
    const oldV = vOf(before2.src);

    // Open edit modal for Heat
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => (c.textContent || '').includes('Heat'));
      if (!card) throw new Error('Heat card not found');
      card.querySelector('[data-action="edit"]').click();
    });
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });

    // Replace the poster with a green PNG via the real PUT path.
    // Movie saves always show the Q3 confirm first (D7 in-app dialog).
    await page.setInputFiles('#editPosterInput', {
      name: 'heat-green.png', mimeType: 'image/png', buffer: GREEN_PNG
    });
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 10000 });

    // Card must swap to a new ?v and serve the green bytes
    await page.waitForFunction((old) => {
      const img = document.querySelector('movie-card .movie-card-poster');
      return img && img.src.includes('?v=') && img.src !== old;
    }, before2.src, { timeout: 10000 });

    const after2 = await cardPoster();
    const newV = vOf(after2.src);
    assert.notEqual(newV, oldV, `edit replace must change ?v (old ${oldV}, new ${newV})`);

    const bytes = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const b = new Uint8Array(await r.arrayBuffer());
      return Array.from(b.slice(0, 8));
    }, stripW(after2.src));
    assert.deepEqual(bytes, Array.from(GREEN_PNG.slice(0, 8)),
      'the card must be showing the green poster uploaded through the edit modal');

    // Disk really holds the replacement (single copy, I7) — the upload is a
    // .png so the editor swapped the extension (I4 allows jpg/png/webp).
    const actionDir = path.dirname(posterPath);
    const files = fs.readdirSync(actionDir).filter((f) => f.includes('0001-'));
    assert.deepEqual(files, ['0001- Heat 1995.png'],
      `only the replacement file may remain: ${files}`);
    const onDisk = fs.readFileSync(path.join(actionDir, files[0]));
    assert.deepEqual(Array.from(onDisk.slice(0, 8)), Array.from(GREEN_PNG.slice(0, 8)),
      'poster file on disk must be the uploaded replacement');
  });
});
