'use strict';
/**
 * P6b screenshots — delete & restore dialogs (E3).
 *
 * Usage:  node mimo/repro/p6b-shots.js
 *
 * Matrix:  {1400x900 desktop, 390x844 mobile} x dark
 *   admin states:
 *     trash          — «سطل زباله» section in the admin panel (entries listed)
 *     edit-delete    — edit modal with the new «حذف فیلم» button
 *     confirm-delete — second-click confirm naming the title + سطل زباله
 * = 6 shots -> mimo/shots/p6b/
 *
 * Determinism: harness-side style freezes CSS animations; posters and trash
 * entries come from the deterministic ui-stub; stray toasts are removed
 * before every shot.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { startUIStub } = require('../../test/helpers/ui-stub');

const OUT = path.join(__dirname, '..', 'shots', 'p6b');

const CATALOG = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['اکشن', 'جنایی'], type: 'Movie', poster: '/api/poster/0001', imdbRating: 8.3, plotSummary: 'یک سرقت بزرگ در لس‌آنجلس.' },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0002', imdbRating: 8.8 },
  { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', year: 2008, genres: ['درام'], type: 'Series', poster: '/api/poster/series:breaking%20bad' }
];

const TRASH = [
  {
    id: '300', uid: '0003', title: 'فیلم قدیمی', type: 'Movie',
    originalPaths: ['Movies/Action/0003- Old 1990.jpg'],
    deletedBy: 'admin', deletedAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: '200', uid: '0004', title: 'فیلم جدیدتر', type: 'Movie',
    originalPaths: ['Movies/Drama/0004- New 2001.jpg', 'Movies/Action/0004- New 2001.jpg'],
    deletedBy: 'admin', deletedAt: '2026-09-02T11:30:00.000Z',
    _movie: {
      uid: '0004', id: '0004', title: 'فیلم جدیدتر', year: 2001, genres: ['درام', 'اکشن'],
      type: 'Movie', poster: '/api/poster/0004', imdbRating: null, plotSummary: null
    }
  }
];

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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  const browser = await chromium.launch();
  const stub = await startUIStub(CATALOG, { trash: TRASH });

  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 3);
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    await page.evaluate(async () => {
      window.__storeRef = { store: (await import('/js/store.js')).store };
    });
    await page.waitForTimeout(250);

    // ---- admin login (trash list loads on the role transition) ----
    await page.evaluate(() => document.getElementById('loginBtn').click());
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#trashList .admin-trash-item', { timeout: 5000 });

    // 1) trash list in the admin panel
    await page.evaluate(() => document.querySelector('.admin-trash')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await shot(page, `admin-dark-${size.name}-trash.png`, manifest);

    // 2) edit modal with the delete button
    await page.evaluate(() => {
      const { store } = window.__storeRef;
      document.getElementById('editModal').show(store.state.movies[0]);
    });
    await page.waitForSelector('edit-modal:not(.hidden) #editDeleteBtn', { timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-edit-delete.png`, manifest);

    // 3) second-click confirm (never confirmed — no DELETE is sent)
    await page.evaluate(() => document.getElementById('editDeleteBtn').click());
    await page.waitForSelector('confirm-modal.open #confirmMessage', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(350);
    await shot(page, `admin-dark-${size.name}-confirm-delete.png`, manifest);

    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'manifest.txt'), manifest.join('\n') + '\n');
  console.log(`P6b: ${manifest.length} shots -> ${OUT}`);
  await stub.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
