'use strict';
/**
 * P6d E5 — orders workflow UI: status chips + status/date filters,
 * name/note edit (clamped to 200), print view (RTL, order number/date,
 * big IDs), CSV export (UTF-8 BOM + exact header, AC5), soft delete with
 * the 10 s undo toast, and the manager header badge for the live customer
 * selection.
 *
 * Runs against the REAL app served by the ui-stub (the stub has no
 * WebSocket server): outgoing sync-client calls are captured with a
 * page-side patch and the server's `orders:deleted` confirmation is
 * simulated where a toast depends on it.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const catalog = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0002', imdbRating: null, plotSummary: null }
];

const heat = catalog[0];
const inception = catalog[1];

const orders = [
  {
    id: 'order-0001', number: 1, createdAt: '2026-09-20T10:00:00.000Z', createdBy: 'admin',
    status: 'new', customerName: '', note: '', updatedAt: '2026-09-20T10:00:00.000Z',
    movies: [heat]
  },
  {
    id: 'order-0002', number: 2, createdAt: '2026-09-21T10:00:00.000Z', createdBy: 'admin',
    status: 'preparing', customerName: '', note: '', updatedAt: '2026-09-21T10:00:00.000Z',
    movies: [inception]
  },
  {
    id: 'order-0003', number: 3, createdAt: '2026-09-22T10:00:00.000Z', createdBy: 'admin',
    status: 'done', customerName: 'علی', note: 'ساعت ۶ عصر', updatedAt: '2026-09-22T10:00:00.000Z',
    movies: [heat, inception]
  }
];

describe('P6d E5 - orders workflow UI', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;

  async function setOrders(list) {
    await page.evaluate((o) =>
      import('/js/store.js').then((m) => m.store._set({ orders: o })), list);
  }

  async function viewOrder(order) {
    await page.evaluate((o) =>
      import('/js/store.js').then((m) => m.store.viewOrder(o)), order);
    await page.waitForSelector('.order-detail-overlay.active', { timeout: 5000 });
  }

  async function closeOrder() {
    await page.evaluate(() =>
      import('/js/store.js').then((m) => m.store.clearSelectedOrder()));
    await page.waitForFunction(() =>
      !document.querySelector('.order-detail-overlay')?.classList.contains('active'), null, { timeout: 5000 });
  }

  /** Capture outgoing order commands (stub has no WS server). */
  async function patchSync() {
    await page.evaluate(() => import('/js/realtime/sync-client.js').then((m) => {
      const s = m.default;
      window.__sent = { status: null, info: null, undo: null, deleted: null };
      s.updateOrderStatus = (orderId, status) => { window.__sent.status = { orderId, status }; };
      s.editOrder = (orderId, fields) => { window.__sent.info = { orderId, fields }; };
      s.undoOrderDelete = (orderId) => { window.__sent.undo = orderId; };
      s.deleteOrder = (orderId) => {
        window.__sent.deleted = orderId;
        // Simulate the server's orders:deleted confirmation (store toasts on it)
        setTimeout(() => s._onOrderDeletedCallback && s._onOrderDeletedCallback(orderId), 0);
      };
    }));
  }

  const cardIds = () => page.$$eval('.order-card', (els) =>
    els.map((e) => (e.textContent || '').match(/سفارش (\d+)/)?.[1] || '?'));

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    // Admin login
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
    await setOrders(orders);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('manager header badge shows the live customer selection count', async () => {
    const shown = await page.evaluate(() => import('/js/store.js').then((m) => {
      m.store._set({ adminSelection: [{ uid: '0001' }, { uid: '0002' }] });
      return new Promise((r) => setTimeout(() => {
        const b = document.getElementById('selectionBadge');
        r(b ? { exists: true, text: b.textContent.trim(), hidden: b.classList.contains('hidden') } : { exists: false });
      }, 80));
    }));
    assert.ok(shown.exists, '#selectionBadge must exist in the manager header');
    assert.equal(shown.text, '2', 'badge counts the live selection items');
    assert.equal(shown.hidden, false, 'badge visible while the count > 0');

    const cleared = await page.evaluate(() => import('/js/store.js').then((m) => {
      m.store._set({ adminSelection: [] });
      return new Promise((r) => setTimeout(() => {
        const b = document.getElementById('selectionBadge');
        r(b ? { text: b.textContent.trim(), hidden: b.classList.contains('hidden') } : { hidden: null });
      }, 80));
    }));
    assert.equal(cleared.hidden, true, 'badge hides on an empty selection');
  });

  it('order cards show a Persian status chip; the status filter narrows the list', async () => {
    await setOrders(orders);
    await page.waitForSelector('.order-card .order-status-chip', { timeout: 5000 });

    const chips = await page.$$eval('.order-card .order-status-chip', (els) =>
      els.map((e) => (e.textContent || '').trim()));
    assert.deepEqual(chips, ['جدید', 'در حال آماده‌سازی', 'انجام شده'],
      `one chip per order with Persian labels, got ${JSON.stringify(chips)}`);

    await page.selectOption('#orderStatusFilter', 'preparing');
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 1, null, { timeout: 5000 });
    assert.deepEqual(await cardIds(), ['2'], 'only the preparing order stays visible');

    await page.selectOption('#orderStatusFilter', 'done');
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 1, null, { timeout: 5000 });
    assert.deepEqual(await cardIds(), ['3'], 'only the done order stays visible');

    await page.selectOption('#orderStatusFilter', '');
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 3, null, { timeout: 5000 });
  });

  it('the date filter narrows to one local day', async () => {
    await setOrders(orders);
    await page.fill('#orderDateFilter', '2026-09-21');
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 1, null, { timeout: 5000 });
    assert.deepEqual(await cardIds(), ['2'], 'only the order created on 2026-09-21 stays visible');

    await page.fill('#orderDateFilter', '');
    await page.waitForFunction(() => document.querySelectorAll('.order-card').length === 3, null, { timeout: 5000 });
  });

  it('detail: clicking a status chip sends orders:update-status for that order', async () => {
    await setOrders(orders);
    await patchSync();
    await viewOrder(orders[0]);
    await page.waitForSelector('.order-detail #orderStatusChips [data-status]', { timeout: 5000 });

    await page.click('.order-detail #orderStatusChips [data-status="preparing"]');
    const sent = await page.evaluate(() => window.__sent.status);
    assert.ok(sent, 'the chip click must reach sync-client.updateOrderStatus');
    assert.equal(sent.orderId, 'order-0001');
    assert.equal(sent.status, 'preparing');
    await closeOrder();
  });

  it('detail: name/note inputs are clamped to 200 chars and sent via orders:edit', async () => {
    await setOrders(orders);
    await patchSync();
    await viewOrder(orders[2]);
    await page.waitForSelector('.order-detail #orderCustomerName', { timeout: 5000 });

    const limits = await page.evaluate(() => ({
      name: document.getElementById('orderCustomerName').maxLength,
      note: document.getElementById('orderNote').maxLength,
      nameValue: document.getElementById('orderCustomerName').value,
      noteValue: document.getElementById('orderNote').value
    }));
    assert.equal(limits.name, 200, 'customerName input clamped to 200');
    assert.equal(limits.note, 200, 'note input clamped to 200');
    assert.equal(limits.nameValue, 'علی', 'inputs prefilled from the order');
    assert.equal(limits.noteValue, 'ساعت ۶ عصر');

    await page.fill('#orderCustomerName', 'مشتری تازه');
    await page.fill('#orderNote', 'تا ساعت ۸');
    await page.click('#orderInfoSaveBtn');
    const sent = await page.evaluate(() => window.__sent.info);
    assert.ok(sent, 'save must reach sync-client.editOrder');
    assert.equal(sent.orderId, 'order-0003');
    assert.equal(sent.fields.customerName, 'مشتری تازه');
    assert.equal(sent.fields.note, 'تا ساعت ۸');
    await closeOrder();
  });

  it('CSV builder: UTF-8 BOM + exact header + Persian data (AC5)', async () => {
    const out = await page.evaluate((list) =>
      import('/js/utils/csv.js').then((m) => m.buildOrdersCsv(list)), orders);

    assert.equal(out.charCodeAt(0), 0xFEFF, 'first char must be the UTF-8 BOM');
    const body = out.slice(1);
    assert.ok(body.startsWith('order,date,status,name,id,title,year,type'),
      `exact header expected, got: ${JSON.stringify(body.slice(0, 60))}`);

    const rows = body.split(/\r?\n/).filter((l) => l.length > 0);
    assert.equal(rows.length, 1 + 4, 'header + one row per movie (1+1+2)');
    assert.ok(out.includes('Heat'), 'title present');
    assert.ok(out.includes('علی'), 'Persian customer name intact');
    assert.ok(out.includes('preparing'), 'status column present');
    assert.equal((out.match(/\u0639\u0644\u06cc/g) || []).length, 2,
      'the name rides on both rows of its order');
  });

  it('detail: the CSV button downloads order-N.csv starting with the BOM', async () => {
    await setOrders(orders);
    await viewOrder(orders[0]);
    await page.waitForSelector('.order-detail #orderCsvBtn', { timeout: 5000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.order-detail #orderCsvBtn')
    ]);
    assert.equal(download.suggestedFilename(), 'order-1.csv');
    const file = await download.path();
    const fs = require('fs');
    const head = fs.readFileSync(file);
    assert.equal(head[0], 0xEF, 'file must start with the UTF-8 BOM bytes');
    assert.equal(head[1], 0xBB);
    assert.equal(head[2], 0xBF);
    const text = head.toString('utf8');
    assert.ok(text.includes('Heat'), 'CSV content carries the title');
    await closeOrder();
  });

  it('print: the popup is RTL, headed with order number/date, and lists big IDs (AC5)', async () => {
    await setOrders(orders);
    await viewOrder(orders[0]);
    await page.waitForSelector('.order-detail #orderPrintBtn', { timeout: 5000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('.order-detail #orderPrintBtn')
    ]);
    await popup.waitForSelector('.order-print-table', { timeout: 5000 });
    const dir = await popup.getAttribute('html', 'dir');
    const lang = await popup.getAttribute('html', 'lang');
    assert.equal(dir, 'rtl', 'print document must be RTL');
    assert.equal(lang, 'fa', 'print document must be lang=fa');

    const text = await popup.textContent('body');
    assert.match(text, /سفارش 1/, 'order number in the header');
    assert.match(text, /Heat/, 'title listed');
    assert.ok(text.includes('0001'), 'the ID is printed');
    assert.ok(!/undefined/.test(text), `no "undefined" in the print view: ${text.slice(0, 200)}`);

    const idFont = await popup.$eval('.order-print-id', (el) => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(idFont >= 24, `IDs must be big (>=24px), got ${idFont}px`);

    await popup.close().catch(() => {});
    await closeOrder();
  });

  it('delete skips the confirm dialog, shows the 10 s undo toast, and undo calls orders:undo', async () => {
    await setOrders(orders);
    await patchSync();
    await page.waitForSelector('.order-card .order-delete-btn', { timeout: 5000 });

    await page.click('.order-card .order-delete-btn');
    const confirmOpen = await page.evaluate(() =>
      document.getElementById('confirmModal')?.classList.contains('active') ||
      document.getElementById('confirmModal')?.classList.contains('open'));
    assert.ok(!confirmOpen, 'soft delete must not open the confirm dialog');

    const deleted = await page.evaluate(() => window.__sent.deleted);
    assert.equal(deleted, 'order-0001', 'orders:delete sent for the clicked card');

    await page.waitForSelector('.toast .toast-action', { timeout: 5000 });
    const undoToast = '.toast:has(.toast-action)'; // the actioned toast, not stale ones
    const label = (await page.textContent(`${undoToast} .toast-action`)).trim();
    assert.equal(label, 'بازگردانی', 'the undo toast offers «بازگردانی»');
    const toastText = (await page.textContent(undoToast)).trim();
    assert.match(toastText, /حذف/, `undo toast announces the deletion: ${toastText}`);

    await page.click('.toast .toast-action');
    const undo = await page.evaluate(() => window.__sent.undo);
    assert.equal(undo, 'order-0001', 'undo click must reach sync-client.undoOrderDelete');
  });
});
