'use strict';
/**
 * P6d screenshots — orders workflow (E5).
 *
 * Usage:  node mimo/repro/p6d-shots.js
 *
 * Matrix:  {1400x900 desktop, 390x844 mobile} x dark
 *   admin states:
 *     header-badge       — manager header badge counting the live customer selection (E5)
 *     orders-panel       — orders list with Persian status chips + status/date filters (E5)
 *     orders-filter      — status filter narrowed to the single «preparing» order (E5)
 *     order-detail       — detail overlay: status chips, name/note fields (200), print/CSV (E5)
 *     order-undo-toast   — soft delete: undo toast with «بازگردانی», no confirm dialog (E5)
 *   desktop only:
 *     order-print        — A5 print popup: RTL, order number/date, big IDs (E5)
 * = 11 shots -> mimo/shots/p6d/
 *
 * Determinism: harness-side style freezes CSS animations; orders/selection are
 * seeded through the store; the undo toast is captured before its 10 s window
 * (the shot() helper keeps it); the WS round trip is stubbed the same way the
 * UI test stubs it (the ui-stub has no order backend).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { startUIStub } = require('../../test/helpers/ui-stub');

const OUT = path.join(__dirname, '..', 'shots', 'p6d');

const CATALOG = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['اکشن', 'جنایی'], type: 'Movie', poster: '/api/poster/0001', imdbRating: 8.3, plotSummary: 'یک سرقت بزرگ در لس‌آنجلس.' },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0002', imdbRating: 8.8 }
];

const ORDERS = [
  {
    id: 'order-0001', number: 1, createdAt: '2026-09-20T10:00:00.000Z', createdBy: 'admin',
    status: 'new', customerName: '', note: '', updatedAt: '2026-09-20T10:00:00.000Z',
    movies: [CATALOG[0]]
  },
  {
    id: 'order-0002', number: 2, createdAt: '2026-09-21T10:00:00.000Z', createdBy: 'admin',
    status: 'preparing', customerName: '', note: '', updatedAt: '2026-09-21T10:00:00.000Z',
    movies: [CATALOG[1]]
  },
  {
    id: 'order-0003', number: 3, createdAt: '2026-09-22T10:00:00.000Z', createdBy: 'admin',
    status: 'done', customerName: 'علی', note: 'ساعت ۶ عصر', updatedAt: '2026-09-22T10:00:00.000Z',
    movies: [CATALOG[0], CATALOG[1]]
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

async function shot(page, name, list, opts = {}) {
  if (!opts.keepToast) {
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  }
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(OUT, name) });
  list.push(name);
}

async function dismissBackdrop(page) {
  // mobile: the drawer backdrop can cover the admin panel
  await page.evaluate(() => {
    const ov = document.getElementById('overlay');
    if (ov && ov.classList.contains('active')) ov.click();
  });
}

async function seed(page, o) {
  await page.evaluate((payload) => import('/js/store.js')
    .then((m) => {
      if (payload.orders) m.store._set({ orders: payload.orders });
      if (payload.selection) m.store._set({ adminSelection: payload.selection });
    }), o);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  const browser = await chromium.launch();
  const stub = await startUIStub(CATALOG);

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
    await dismissBackdrop(page);

    // 1) header badge — live customer selection count (E5)
    await seed(page, { selection: [{ uid: '0001' }, { uid: '0002' }] });
    await page.waitForFunction(() => {
      const b = document.getElementById('selectionBadge');
      return b && b.textContent.trim() === '2' && !b.classList.contains('hidden');
    }, { timeout: 5000 });
    await page.waitForTimeout(200);
    await shot(page, `admin-dark-${size.name}-header-badge.png`, manifest);

    // 2) orders panel — status chips + status/date filters (E5)
    await seed(page, { orders: ORDERS });
    await page.waitForSelector('.order-card .order-status-chip', { timeout: 5000 });
    await page.evaluate(() => {
      const panel = document.querySelector('order-panel');
      if (panel) panel.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(250);
    await shot(page, `admin-dark-${size.name}-orders-panel.png`, manifest);

    // 3) status filter — only the «preparing» order stays (E5)
    await page.evaluate(() => {
      const sel = document.getElementById('orderStatusFilter');
      sel.value = 'preparing';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 1, { timeout: 5000 });
    await page.waitForTimeout(200);
    await shot(page, `admin-dark-${size.name}-orders-filter.png`, manifest);
    await page.evaluate(() => {
      const sel = document.getElementById('orderStatusFilter');
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 3, { timeout: 5000 });

    // 4) detail overlay — chips, prefilled name/note, print/CSV (E5)
    await page.evaluate((o) => import('/js/store.js').then((m) => m.store.viewOrder(o)), ORDERS[2]);
    await page.waitForSelector('.order-detail-overlay.active', { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot(page, `admin-dark-${size.name}-order-detail.png`, manifest);
    await page.evaluate(() => import('/js/store.js').then((m) => m.store.clearSelectedOrder()));
    await page.waitForFunction(() =>
      !document.querySelector('.order-detail-overlay')?.classList.contains('active'), { timeout: 5000 });

    // 5) soft delete — undo toast with «بازگردانی», no confirm dialog (E5)
    await page.evaluate(() => import('/js/realtime/sync-client.js').then((m) => {
      const s = m.default;
      s.deleteOrder = (orderId) => {
        setTimeout(() => s._onOrderDeletedCallback && s._onOrderDeletedCallback(orderId), 0);
      };
    }));
    await page.evaluate(() => document.querySelector('.order-delete-btn').click());
    await page.waitForSelector('.toast .toast-action', { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot(page, `admin-dark-${size.name}-order-undo-toast.png`, manifest, { keepToast: true });

    // 6) print popup — A5, RTL, big IDs (E5, desktop only: needs a trusted click)
    if (size.name === 'desktop') {
      await page.evaluate((o) => import('/js/store.js').then((m) => m.store.viewOrder(o)), ORDERS[0]);
      await page.waitForSelector('.order-detail-overlay.active', { timeout: 5000 });
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 8000 }),
        page.click('.order-detail #orderPrintBtn')
      ]);
      await popup.waitForSelector('.order-print-table', { timeout: 5000 });
      await popup.addStyleTag({ content: FREEZE_CSS });
      await popup.waitForTimeout(300);
      await shot(popup, `admin-dark-desktop-order-print.png`, manifest);
      await popup.close().catch(() => {});
    }

    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'manifest.txt'), manifest.join('\n') + '\n');
  console.log(`P6d: ${manifest.length} shots -> ${OUT}`);
  await stub.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
