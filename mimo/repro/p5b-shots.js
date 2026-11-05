'use strict';
/**
 * P5b before/after screenshot matrix.
 *
 * Usage:  node mimo/repro/p5b-shots.js before|after
 *
 * Matrix:  {1400x900 desktop, 390x844 mobile} x {dark, light} x {customer, admin}
 *   customer: base, login, shortcuts, movie-detail
 *   admin:    base, confirm, edit, add, diagnostics, shortcuts, movie-detail,
 *             order-detail, change-password
 *   plus:     toast-over-login (desktop only, both themes)
 * = 54 shots per round.
 *
 * Determinism: a harness-side style freezes CSS animations/transitions
 * identically in both rounds; posters come from the deterministic ui-stub;
 * stray toasts are removed before every shot except the toast state itself.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { startUIStub } = require('../../test/helpers/ui-stub');

const SHOTS = path.join(__dirname, '..', 'shots', 'p5b');
const TAG = (process.argv[2] || '').toLowerCase();
if (TAG !== 'before' && TAG !== 'after') {
  console.error('usage: node mimo/repro/p5b-shots.js before|after');
  process.exit(1);
}
const OUT = path.join(SHOTS, TAG);

const CATALOG = [
  { uid: '0001', id: '0001', title: 'دیوانه‌ای از قفس پرید', year: 1994, genres: ['درام'], type: 'Movie', poster: '/api/poster/0001', imdbRating: 9.3, plotSummary: 'یک درام معروف.' },
  { uid: '0002', id: '0002', title: 'The Dark Knight', year: 2008, genres: ['اکشن', 'جنایی'], type: 'Movie', poster: '/api/poster/0002', imdbRating: 9.0, plotSummary: 'Batman faces the Joker.' },
  { uid: '0003', id: '0003', title: 'سرخ‌پوست', year: 2021, genres: ['عاشقانه'], type: 'Movie', poster: '/api/poster/0003' },
  { uid: '0004', id: '0004', title: 'Parasite', year: 2019, genres: ['درام', 'هیجان‌انگیز'], type: 'Movie', poster: '/api/poster/0004', imdbRating: 8.5 },
  { uid: '0005', id: null, title: 'بازی تاج و تخت', year: 2011, genres: ['فانتزی'], type: 'Series', poster: '/api/poster/series:0005' },
  { uid: '0006', id: '0006', title: 'Animation Tale', year: 2001, genres: ['انیمیشن'], type: 'Animation', poster: '/api/poster/0006' },
  { uid: '0007', id: '0007', title: 'کمدی بزرگ', year: 2015, genres: ['کمدی'], type: 'Movie', poster: '/api/poster/0007' },
  { uid: '0008', id: '0008', title: 'Interstellar', year: 2014, genres: ['علمی‌تخیلی'], type: 'Movie', poster: '/api/poster/0008', imdbRating: 8.7 }
];

const SIZES = [
  { name: 'desktop', width: 1400, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
const THEMES = ['dark', 'light'];

const CUSTOMER_STATES = ['base', 'login', 'shortcuts', 'movie-detail'];
const ADMIN_STATES = ['base', 'confirm', 'edit', 'add', 'diagnostics', 'shortcuts',
  'movie-detail', 'order-detail', 'change-password'];

const FREEZE_CSS = `*,*::before,*::after{
  animation:none!important;animation-play-state:paused!important;
  transition:none!important;caret-color:transparent!important;
}`;

function shotName(role, theme, size, state) {
  return `${role}-${theme}-${size}-${state}.png`;
}

async function waitForReady(page) {
  await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await page.waitForTimeout(250);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(120);
}

async function closeState(page, state) {
  await page.evaluate((s) => {
    const el = (id) => document.getElementById(id);
    switch (s) {
      case 'login':
        el('loginModal').close();
        break;
      case 'confirm':
        el('confirmModal').close();
        break;
      case 'edit':
        el('editModal').hide();
        break;
      case 'add':
        el('addModal').hide();
        break;
      case 'diagnostics':
        el('diagnosticsModal').hide();
        break;
      case 'shortcuts':
        el('shortcutsModal').hide();
        break;
      case 'movie-detail':
        el('movieDetail').hide();
        break;
      case 'order-detail': {
        const od = document.querySelector('.order-detail-overlay');
        if (od) od.classList.remove('active');
        break;
      }
      case 'change-password': {
        const cp = document.getElementById('changePasswordOverlay');
        if (cp) cp.style.display = 'none';
        break;
      }
      default:
        break;
    }
  }, state);
  await page.waitForTimeout(150);
}

async function openState(page, state, role) {
  switch (state) {
    case 'login':
      await page.evaluate(() => document.getElementById('loginBtn').click());
      await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
      break;
    case 'confirm':
      await page.evaluate(() => document.getElementById('loginBtn').click());
      await page.waitForSelector('confirm-modal.open #confirmMessage', { state: 'visible', timeout: 5000 });
      break;
    case 'shortcuts':
      await page.evaluate(() => document.getElementById('shortcutsModal').show());
      await page.waitForSelector('shortcuts-modal:not(.hidden) .modal', { state: 'visible', timeout: 5000 });
      break;
    case 'movie-detail':
      await page.evaluate(() => {
        const { store } = window.__storeRef;
        document.getElementById('movieDetail').show(store.state.movies[1]);
      });
      await page.waitForSelector('movie-detail:not(.hidden) .movie-detail', { state: 'visible', timeout: 5000 });
      break;
    case 'edit':
      await page.evaluate(() => {
        const { store } = window.__storeRef;
        document.getElementById('editModal').show(store.state.movies[0]);
      });
      await page.waitForSelector('edit-modal:not(.hidden) .edit-modal', { state: 'visible', timeout: 5000 });
      break;
    case 'add':
      await page.evaluate(() => document.getElementById('addMovieBtn').click());
      await page.waitForSelector('add-modal:not(.hidden) .edit-modal', { state: 'visible', timeout: 5000 });
      break;
    case 'diagnostics':
      await page.evaluate(() => document.getElementById('diagnosticsBtn').click());
      await page.waitForSelector('diagnostics-modal:not(.hidden) .modal', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      break;
    case 'order-detail':
      await page.evaluate(() => {
        const order = {
          id: 'order-0001', number: 1, createdAt: new Date().toISOString(), createdBy: 'admin',
          movies: window.__storeRef.store.state.movies.slice(0, 3)
        };
        window.__storeRef.store._set({ orders: [order] });
        window.__storeRef.store.viewOrder(order);
      });
      await page.waitForSelector('.order-detail-overlay.active .order-detail', { state: 'visible', timeout: 5000 });
      break;
    case 'change-password':
      await page.evaluate(() => document.getElementById('changePasswordBtn').click());
      await page.waitForFunction(() => {
        const cp = document.getElementById('changePasswordOverlay');
        return cp && cp.style.display === 'flex';
      }, { timeout: 5000 });
      break;
    default:
      break;
  }
  await page.waitForTimeout(450);
}

async function shot(page, name, list, { keepToast = false } = {}) {
  if (!keepToast) {
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: path.join(OUT, name) });
  list.push(name);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  const browser = await chromium.launch();
  const stub = await startUIStub(CATALOG, {
    selectionOnAck: {
      updatedAt: new Date().toISOString(),
      movies: [CATALOG[0], CATALOG[1]]
    }
  });

  for (const theme of THEMES) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
      await page.goto(`http://localhost:${stub.port}/`);
      await waitForReady(page);
      await setTheme(page, theme);
      await page.evaluate(async () => {
        window.__storeRef = { store: (await import('/js/store.js')).store };
      });

      // ---- customer ----
      await page.evaluate(() => {
        const cards = document.querySelectorAll('movie-card');
        if (cards[0]) cards[0].querySelector('[data-action="select"]')?.click();
        if (cards[1]) cards[1].querySelector('[data-action="select"]')?.click();
      });
      await page.waitForTimeout(250);
      await shot(page, shotName('customer', theme, size.name, 'base'), manifest);
      for (const state of CUSTOMER_STATES.slice(1)) {
        await openState(page, state, 'customer');
        await shot(page, shotName('customer', theme, size.name, state), manifest);
        await closeState(page, state);
      }

      // toast over login (desktop only) — proves overlay/toast layering
      if (size.name === 'desktop') {
        await page.evaluate(() => document.getElementById('loginBtn').click());
        await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
        await page.evaluate(async () => {
          const { showToast } = await import('/js/store.js');
          showToast('پیام آزمایشی برای بررسی لایه‌ها', 'error');
        });
        await page.waitForTimeout(300);
        await shot(page, shotName('customer', theme, size.name, 'toast-login'), manifest, { keepToast: true });
        await page.evaluate(() => document.getElementById('loginModal').close());
        await page.waitForTimeout(150);
      }

      // ---- admin ----
      await page.evaluate(() => document.getElementById('loginBtn').click());
      await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
      await page.fill('#username', 'admin');
      await page.fill('#password', 'password123');
      await page.click('#submitBtn');
      await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(400);

      await shot(page, shotName('admin', theme, size.name, 'base'), manifest);
      for (const state of ADMIN_STATES.slice(1)) {
        await openState(page, state, 'admin');
        await shot(page, shotName('admin', theme, size.name, state), manifest);
        await closeState(page, state);
      }

      await page.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.txt'), manifest.join('\n') + '\n');
  console.log(`P5b ${TAG}: ${manifest.length} shots -> ${OUT}`);
  await stub.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
