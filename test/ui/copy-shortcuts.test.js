'use strict';
/**
 * P5c — D4 / FE-06 (copy, print and the order snapshot must use the shared
 * id-vs-title helper; Games never print "undefined") + D5 / FE-15 (Ctrl+B
 * toggles the selection panel exactly as the shortcuts modal advertises).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const movies = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
  { uid: 'series:greys', id: null, title: "Grey's Anatomy", year: null, genres: [], type: 'Series', poster: '/api/poster/missing', imdbRating: null, plotSummary: null }
];
const games = [
  { uid: 'game:ghost rider', title: 'Ghost Rider', platforms: ['PS4', 'PS5'], type: 'Game', poster: '/api/game-poster/ghost%20rider' }
];

/** select one Movie, one Series and one Game through the real store */
async function selectAll(page) {
  await page.evaluate(async () => {
    const { store } = await import('/js/store.js');
    store.clearSelection();
    store.select('0001');
    store.select('series:greys');
    // games are lazily fetched on first entry into games mode (store.js boot logic)
    if (!store.state.games.length) await store.setMediaMode('games');
    store.select('game:ghost rider');
    if (store.state.mediaMode === 'games') await store.setMediaMode('movies');
  });
}

/** poll the real clipboard until the copy shortcut has written something */
async function readClipboard(page) {
  await page.waitForFunction(async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { window.__clip = t; return true; }
    } catch { /* not yet */ }
    return false;
  }, null, { timeout: 4000 }).catch(() => {});
  return await page.evaluate(() => window.__clip || '');
}

// ─── D4 / FE-06 — copy, print, order snapshot ────────────────────────────────

describe('D4 / FE-06 — copy, print and order snapshot use the id-vs-title helper', { skip: skipIfNoBrowser() }, () => {
  let browser, context, stub, page;

  before(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    stub = await startUIStub(movies, { games });
    page = await context.newPage();
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('FE-06: Ctrl+Shift+C copies id for Movies, title for Series and Games — no "undefined"', async () => {
    await selectAll(page);
    await page.keyboard.press('Control+Shift+C');
    const text = await readClipboard(page);
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean).sort();
    assert.ok(text.length > 0, 'clipboard must receive the list');
    assert.equal(/undefined/.test(text), false, `must not contain "undefined": ${JSON.stringify(text)}`);
    assert.deepEqual(lines, ['0001', 'Ghost Rider', "Grey's Anatomy"].sort(),
      `copied lines: ${JSON.stringify(lines)}`);
  });

  it('FE-06: print view is RTL and lists every ref exactly once, never "undefined"', async () => {
    await selectAll(page);
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.evaluate(() => import('/js/store.js').then((m) => m.store.printSelectedIds()))
    ]);
    await popup.waitForSelector('pre', { timeout: 4000 });
    const pre = await popup.textContent('pre');
    const dir = await popup.getAttribute('html', 'dir');
    const lang = await popup.getAttribute('html', 'lang');
    assert.equal(dir, 'rtl', 'print document must be RTL');
    assert.equal(lang, 'fa', 'print document must be lang=fa');
    assert.equal(/undefined/.test(pre), false, `print must not contain "undefined": ${JSON.stringify(pre)}`);
    const lines = pre.split('\n').map((s) => s.trim()).filter(Boolean);
    assert.equal(lines.length, 3, `three lines, got: ${JSON.stringify(lines)}`);
    assert.ok(lines.includes('0001 - Heat'), `movie line, got: ${JSON.stringify(lines)}`);
    assert.equal(lines.filter((l) => l === "Grey's Anatomy").length, 1,
      'series line must be the title exactly once');
    assert.equal(lines.filter((l) => l === 'Ghost Rider').length, 1,
      'game line must be the title exactly once');
  });

  it('FE-06: the order snapshot (order detail) shows ids for Movies and titles for Series/Games', async () => {
    const orderMovies = [...movies, ...games];
    await page.evaluate((ms) => {
      return import('/js/store.js').then((m) => m.store.viewOrder({
        id: 'order-test-1', number: 7, createdAt: new Date().toISOString(),
        createdBy: 'admin', movies: ms
      }));
    }, orderMovies);
    // state: attached — the order card lives inside the (hidden) admin panel
    await page.waitForSelector('#orderDetailMovies .order-detail-movie', { state: 'attached', timeout: 4000 });
    const snap = await page.textContent('#orderDetailMovies');
    assert.equal(/undefined/.test(snap), false, `snapshot must not contain "undefined": ${JSON.stringify(snap)}`);
    assert.ok(snap.includes('Heat') && snap.includes('#0001'), `movie ref in snapshot: ${snap}`);
    assert.ok(snap.includes("Grey's Anatomy"), `series title in snapshot: ${snap}`);
    assert.ok(snap.includes('Ghost Rider'), `game title in snapshot: ${snap}`);
    const badges = await page.$$eval('#orderDetailMovies .order-detail-movie-id',
      (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(badges, ['#0001'], `only the Movie carries an id badge: ${JSON.stringify(badges)}`);
    await page.evaluate(() => import('/js/store.js').then((m) => m.store.clearSelectedOrder()));
  });
});

// ─── D5 / FE-15 — Ctrl+B + shortcuts-modal parity ───────────────────────────

describe('D5 / FE-15 — Ctrl+B and shortcuts modal parity', { skip: skipIfNoBrowser() }, () => {
  let browser, context, stub, page;

  before(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    stub = await startUIStub(movies, { games });
    page = await context.newPage();
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  const collapsed = () => page.evaluate(
    () => document.querySelector('#selectionSidebar').classList.contains('collapsed'));

  it('FE-15: Ctrl+B toggles the selection panel (open → collapsed → open)', async () => {
    assert.equal(await collapsed(), false, 'panel starts open');
    await page.keyboard.press('Control+b');
    await page.waitForFunction(
      () => document.querySelector('#selectionSidebar').classList.contains('collapsed'),
      null, { timeout: 2000 });
    assert.equal(await collapsed(), true, 'Ctrl+B must collapse the panel');
    await page.keyboard.press('Control+b');
    await page.waitForFunction(
      () => !document.querySelector('#selectionSidebar').classList.contains('collapsed'),
      null, { timeout: 2000 });
    assert.equal(await collapsed(), false, 'second Ctrl+B must reopen the panel');
  });

  it('FE-15: every shortcut advertised in the shortcuts modal actually works', async () => {
    // 1. "?" opens the modal and it advertises exactly the 6 known rows (incl. Ctrl+B)
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('?');
    await page.waitForSelector('shortcuts-modal:not(.hidden) [role="dialog"]', { timeout: 3000 });
    const rows = await page.$$eval('shortcuts-modal .shortcut-row',
      (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    assert.equal(rows.length, 6, `advertised rows: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => /CtrlB/.test(r) && r.includes('پنل انتخاب')),
      `Ctrl+B row must be advertised: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => /جستجو \/$/.test(r)),
      `slash row: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => r.includes('Esc')), `Esc row: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => /CtrlShiftD/.test(r)), `theme row: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => /CtrlShiftC/.test(r)), `copy row: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((r) => r.includes('?')), `question-mark row: ${JSON.stringify(rows)}`);

    // Esc closes it (advertised "پاک کردن جستجو" is tested next; modal close first)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('shortcuts-modal').classList.contains('hidden'),
      null, { timeout: 2000 });

    // 2. "/" focuses the search box
    await page.keyboard.press('/');
    await page.waitForFunction(
      () => document.activeElement && document.activeElement.classList.contains('search-input'),
      null, { timeout: 2000 });

    // 3. Esc clears + leaves the search box
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const i = document.querySelector('.search-input');
      return i && i.value === '' && document.activeElement !== i;
    }, null, { timeout: 2000 });

    // 4. Ctrl+Shift+D toggles the theme
    const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.keyboard.press('Control+Shift+D');
    await page.waitForFunction(
      (prev) => document.documentElement.getAttribute('data-theme') !== prev, themeBefore, { timeout: 2000 });
    await page.keyboard.press('Control+Shift+D');
    await page.waitForFunction(
      (prev) => document.documentElement.getAttribute('data-theme') === prev, themeBefore, { timeout: 2000 });

    // 5. Ctrl+B toggles the panel (same handler as the dedicated test)
    await page.keyboard.press('Control+b');
    await page.waitForFunction(
      () => document.querySelector('#selectionSidebar').classList.contains('collapsed'),
      null, { timeout: 2000 });
    await page.keyboard.press('Control+b');
    await page.waitForFunction(
      () => !document.querySelector('#selectionSidebar').classList.contains('collapsed'),
      null, { timeout: 2000 });

    // 6. Ctrl+Shift+C copies the selection (full FE-06 coverage lives above)
    await selectAll(page);
    await page.keyboard.press('Control+Shift+C');
    const clip = await readClipboard(page);
    assert.ok(clip.includes('0001') && clip.includes('Ghost Rider'),
      `Ctrl+Shift+C must copy: ${JSON.stringify(clip)}`);
  });
});
