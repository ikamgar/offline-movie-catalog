'use strict';
/**
 * P6c screenshots — add flow (E2) + games management (E4).
 *
 * Usage:  node mimo/repro/p6c-shots.js
 *
 * Matrix:  {1400x900 desktop, 390x844 mobile} x dark
 *   admin states:
 *     add-movie       — add modal (movie): genre chips + poster preview (E2)
 *     add-movie-file  — same modal scrolled to the live filename preview (E2)
 *     add-game        — add modal (game): PS4/PS5 platforms, movie fields hidden (E4)
 *     dup-confirm     — probable duplicate GAME warning naming the title (E4/E2 warn-never-block)
 *     edit-game       — edit modal for a game: platform checkboxes + «حذف بازی» (E4)
 *     confirm-delete  — second-click confirm for the game (D6 trash promise) (E4)
 * = 12 shots -> mimo/shots/p6c/
 *
 * Determinism: harness-side style freezes CSS animations; posters and games
 * come from the deterministic ui-stub; stray toasts are removed before every
 * shot; the filename preview waits for the stub's SRV:: value.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { startUIStub } = require('../../test/helpers/ui-stub');

const OUT = path.join(__dirname, '..', 'shots', 'p6c');

const CATALOG = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['اکشن', 'جنایی'], type: 'Movie', poster: '/api/poster/0001', imdbRating: 8.3, plotSummary: 'یک سرقت بزرگ در لس‌آنجلس.' },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0002', imdbRating: 8.8 }
];

const GAMES = [
  { uid: 'game:fifa 24', title: 'FIFA 24', platforms: ['PS4'], type: 'Game', poster: '/api/game-poster/fifa%2024' },
  { uid: 'game:hades', title: 'Hades', platforms: ['PS4', 'PS5'], type: 'Game', poster: '/api/game-poster/hades' }
];

const GAME = GAMES[1];

const SIZES = [
  { name: 'desktop', width: 1400, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

const FREEZE_CSS = `*,*::before,*::after{
  animation:none!important;animation-play-state:paused!important;
  transition:none!important;caret-color:transparent!important;
}`;

async function shot(page, name, list) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(OUT, name) });
  list.push(name);
}

async function openAdd(page) {
  await page.evaluate(() => {
    const add = document.querySelector('add-modal');
    if (add && !add.classList.contains('hidden')) add.hide();
    const edit = document.querySelector('edit-modal');
    if (edit && !edit.classList.contains('hidden')) edit.hide();
    const confirm = document.querySelector('confirm-modal');
    if (confirm && confirm.classList.contains('open')) confirm.close();
  });
  // mobile: the selection drawer backdrop blocks pointer events
  await page.evaluate(() => {
    const ov = document.getElementById('overlay');
    if (ov && ov.classList.contains('active')) ov.click();
  });
  await page.click('#addMovieBtn');
  await page.waitForSelector('add-modal #addModal', { state: 'visible', timeout: 5000 });
}

async function closeAdd(page) {
  await page.click('#addCancelBtn');
  await page.waitForFunction(() =>
    document.querySelector('add-modal')?.classList.contains('hidden'), { timeout: 5000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  const browser = await chromium.launch();
  const stub = await startUIStub(CATALOG, { games: GAMES, trash: [] });

  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    await page.waitForTimeout(250);

    // ---- admin login ----
    await page.evaluate(() => document.getElementById('loginBtn').click());
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);

    // A small decodable PNG poster reused across the states
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 480;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#248';
      ctx.fillRect(0, 0, 320, 480);
      return c.toDataURL('image/png').split(',')[1];
    });
    const poster = Buffer.from(b64, 'base64');

    // 1) add modal — movie: genre chips + live filename preview (E2)
    await openAdd(page);
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: poster });
    await page.fill('#addTitle', 'Heat');
    await page.fill('#addYear', '1995');
    await page.waitForFunction(() => {
      const el = document.querySelector('#filenameValue');
      return el && el.textContent && !el.textContent.includes('—');
    }, { timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-add-movie.png`, manifest);

    // 1b) same modal scrolled to the live filename preview (E2)
    await page.evaluate(() => document.getElementById('filenameValue').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    await shot(page, `admin-dark-${size.name}-add-movie-filename.png`, manifest);
    await closeAdd(page);

    // 2) games mode + add modal — game chip: platforms instead of movie fields (E4)
    await page.click('#mediaModeToggle [data-mode="games"]');
    await page.waitForFunction(() =>
      document.querySelectorAll('movie-card').length >= 2, { timeout: 8000 });
    await openAdd(page);
    await page.waitForSelector('add-modal #platformFieldGroup', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-add-game.png`, manifest);

    // 3) probable duplicate GAME warning — names the title, never blocks (E4)
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: poster });
    await page.fill('#addTitle', 'Hades');
    await page.evaluate(() => {
      document.querySelectorAll('add-modal input[name="platforms"]').forEach(i => { i.checked = true; });
    });
    await page.click('#addSaveBtn');
    await page.waitForSelector('confirm-modal.open #confirmMessage', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-dup-confirm.png`, manifest);
    await page.evaluate(() => document.getElementById('confirmModal').close());
    await closeAdd(page);

    // 4) edit modal for a game — platform checkboxes + «حذف بازی» (E4)
    await page.evaluate((game) => document.getElementById('editModal').show(game), GAME);
    await page.waitForSelector('edit-modal:not(.hidden) #editDeleteBtn', { timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-edit-game.png`, manifest);

    // 5) second-click confirm for the game (D6 trash promise) (E4)
    await page.evaluate(() => document.getElementById('editDeleteBtn').click());
    await page.waitForSelector('confirm-modal.open #confirmMessage', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-confirm-delete.png`, manifest);

    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'manifest.txt'), manifest.join('\n') + '\n');
  console.log(`P6c: ${manifest.length} shots -> ${OUT}`);
  await stub.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
