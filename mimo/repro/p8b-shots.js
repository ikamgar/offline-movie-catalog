'use strict';
/**
 * P8b screenshots — font + poster-thumbnail layout check (FE-12 / G4+G5).
 *
 * Usage:  node mimo/repro/p8b-shots.js [--label before|after]
 *
 * Matrix:  {1400x900 desktop, 390x844 mobile} x {dark, light} x
 *          {grid, admin panel, edit modal, order detail} = 16 shots.
 * Runs against the REAL server (temp Library/data — never the real ones) so
 * the bundled font and the poster routes are exactly what ships.
 * Saves mimo/shots/p8b/<label>/ + manifest.txt.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { startTestServer } = require('../../test/helpers/test-server');

const OUT_DIR = path.join(__dirname, '..', 'shots', 'p8b');

const MOVIES = [
  { id: '0001', title: 'دیوانه‌ای از قفس پرید', year: 1994, genre: 'درام' },
  { id: '0002', title: 'The Dark Knight', year: 2008, genre: 'اکشن' },
  { id: '0003', title: 'سرخ‌پوست', year: 2021, genre: 'عاشقانه' },
  { id: '0004', title: 'Parasite', year: 2019, genre: 'درام' },
  { id: '0005', title: 'کمدی بزرگ', year: 2015, genre: 'کمدی' },
  { id: '0006', title: 'Interstellar', year: 2014, genre: 'علمی‌تخیلی' }
];

const SIZES = [
  { name: 'desktop', width: 1400, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
const THEMES = ['dark', 'light'];

const FREEZE_CSS = `*,*::before,*::after{
  animation:none!important;animation-play-state:paused!important;
  transition:none!important;caret-color:transparent!important;
}`;

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = { label: 'after' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--label') args.label = String(argv[++i] || 'after').replace(/[^\w-]/g, '');
  }
  return args;
}

async function buildLibrary(sharp, libDir) {
  for (const m of MOVIES) {
    const dir = path.join(libDir, 'Movies', m.genre);
    fs.mkdirSync(dir, { recursive: true });
    const buf = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 40 + (m.id.charCodeAt(3) % 120), g: 60, b: 140 } }
    }).composite([{
      input: Buffer.from(
        `<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="600" height="900" fill="none"/>` +
        `<text x="300" y="460" font-size="42" text-anchor="middle" fill="#fff">${m.title}</text>` +
        `<text x="300" y="520" font-size="28" text-anchor="middle" fill="#cde">${m.year}</text></svg>`)
    }]).jpeg({ quality: 72 }).toBuffer();
    fs.writeFileSync(path.join(dir, `${m.id}- ${m.title} ${m.year}.jpg`), buf);
  }
  const seriesDir = path.join(libDir, 'Series');
  fs.mkdirSync(seriesDir, { recursive: true });
  const sb = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 90, g: 40, b: 40 } }
  }).jpeg({ quality: 72 }).toBuffer();
  fs.writeFileSync(path.join(seriesDir, 'Breaking Bad.jpg'), sb);
}

async function shot(page, outDir, name) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(outDir, name) });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(120);
}

(async () => {
  const args = parseArgs();
  let sharp = null;
  try { sharp = require('sharp'); } catch { /* handled below */ }
  if (!sharp) {
    console.error('SKIP: sharp is not installed — cannot generate poster fixtures.');
    process.exit(2);
  }

  const outDir = path.join(OUT_DIR, args.label);
  fs.mkdirSync(outDir, { recursive: true });

  const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8bshots-lib-'));
  await buildLibrary(sharp, libDir);
  const server = await startTestServer({
    libraryPath: libDir,
    admin: { username: 'admin', password: 'p8b-shots-secret' }
  });
  const browser = await chromium.launch();
  const manifest = [];

  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 7, null, { timeout: 30000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(async () => {
      try {
        await document.fonts.load('400 16px Vazirmatn');
        await document.fonts.load('700 16px Vazirmatn');
      } catch {}
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(200);

    // Customer selects two movies (idempotent — a later page may inherit the
    // server's shared selection, and clicking a selected card would deselect).
    await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      for (const m of (store.state.movies || []).slice(0, 2)) {
        if (!store.isSelected(m.uid)) store.select(m.uid);
      }
    });
    // On mobile the selection sidebar opens over the page — close it so the
    // admin states below are not blocked by the overlay.
    await page.evaluate(() => {
      document.querySelector('selection-sidebar #closeSelection')?.click();
      document.getElementById('overlay')?.classList.remove('active');
    });
    await page.waitForTimeout(120);

    for (const theme of THEMES) {
      await setTheme(page, theme);

      // 1) customer grid
      await shot(page, outDir, `grid-${theme}-${size.name}.png`);
      manifest.push(`grid-${theme}-${size.name}.png`);

      // 2) admin login → panel
      const first = theme === THEMES[0];
      if (first) {
        await page.click('#loginBtn');
        await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
        await page.fill('#username', 'admin');
        await page.fill('#password', 'p8b-shots-secret');
        await page.click('#submitBtn');
        await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
        // save the selection as an order for the order-detail state
        await page.click('#saveOrderBtn');
        await page.waitForSelector('confirm-modal.open #confirmBtn', { state: 'visible', timeout: 5000 });
        await page.click('#confirmBtn');
        await page.waitForSelector('.order-card', { timeout: 5000 });
        await page.waitForTimeout(150);
      }
      await shot(page, outDir, `admin-${theme}-${size.name}.png`);
      manifest.push(`admin-${theme}-${size.name}.png`);

      // 3) edit modal (first movie)
      await page.evaluate(() => {
        const modal = document.getElementById('editModal');
        modal.show(window.__p8bMovies ? window.__p8bMovies[0] : document.querySelector('movie-card').movie);
      });
      await page.waitForSelector('edit-modal:not(.hidden) #editForm', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(250);
      await shot(page, outDir, `edit-${theme}-${size.name}.png`);
      manifest.push(`edit-${theme}-${size.name}.png`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() =>
        document.getElementById('editModal')?.classList.contains('hidden'), null, { timeout: 5000 }).catch(async () => {
        await page.evaluate(() => document.getElementById('editModal').hide());
      });
      await page.waitForTimeout(150);

      // 4) order detail
      await page.click('.order-view-btn');
      await page.waitForSelector('.order-detail-overlay.active', { timeout: 5000 });
      await page.waitForTimeout(250);
      await shot(page, outDir, `order-${theme}-${size.name}.png`);
      manifest.push(`order-${theme}-${size.name}.png`);
      await page.click('#orderDetailClose');
      await page.waitForFunction(() =>
        !document.querySelector('.order-detail-overlay')?.classList.contains('active'), null, { timeout: 5000 });
    }
    await page.close();
  }

  fs.writeFileSync(path.join(outDir, 'manifest.txt'), manifest.join('\n') + '\n');
  console.log(`P8b shots [${args.label}]: ${manifest.length} shots -> ${outDir}`);

  await browser.close();
  await server.close();
  try { fs.rmSync(libDir, { recursive: true, force: true }); } catch {}
})().catch((e) => { console.error(e); process.exit(1); });
