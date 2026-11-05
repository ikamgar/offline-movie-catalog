'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const OrderManager = require('../../server/orders/order-manager');

describe('OrderManager', () => {
  let tmpDir;
  let ordersPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord-test-'));
    ordersPath = path.join(tmpDir, 'orders.json');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('creates an order', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    assert.ok(order.id.startsWith('order-'));
    assert.equal(order.number, 1);
    assert.equal(order.movies.length, 1);
    assert.equal(order.movies[0].title, 'A');
  });

  it('lists orders', () => {
    const om = new OrderManager(ordersPath);
    om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    const orders = om.getOrders();
    assert.equal(orders.length, 2);
  });

  it('gets order by ID', () => {
    const om = new OrderManager(ordersPath);
    const created = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const found = om.getOrder(created.id);
    assert.ok(found);
    assert.equal(found.id, created.id);
  });

  it('returns null for unknown order ID', () => {
    const om = new OrderManager(ordersPath);
    assert.equal(om.getOrder('order-9999'), null);
  });

  it('deletes an order', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    assert.equal(om.deleteOrder(order.id), true);
    assert.equal(om.getOrder(order.id), null);
  });

  it('returns false when deleting unknown order', () => {
    const om = new OrderManager(ordersPath);
    assert.equal(om.deleteOrder('order-9999'), false);
  });

  it('persists orders to disk', () => {
    const om = new OrderManager(ordersPath);
    om.createOrder([{ uid: '1', title: 'A' }], 'admin');

    const om2 = new OrderManager(ordersPath);
    assert.equal(om2.getOrders().length, 1);
    assert.equal(om2.getOrders()[0].movies[0].title, 'A');
  });

  it('incrementing order numbers', () => {
    const om = new OrderManager(ordersPath);
    const a = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const b = om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    assert.equal(b.number, a.number + 1);
  });

  it('throws on empty movie list', () => {
    const om = new OrderManager(ordersPath);
    assert.throws(() => om.createOrder([], 'admin'));
  });

  it('count returns 0 for empty', () => {
    const om = new OrderManager(ordersPath);
    assert.equal(om.count, 0);
  });

  it('persists {version, nextNumber, orders} format (A4)', () => {
    const om = new OrderManager(ordersPath);
    om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.nextNumber, 2);
    assert.ok(Array.isArray(raw.orders));
    assert.equal(raw.orders.length, 1);
  });

  it('upgrades a legacy array-format file on first save (A4 migration)', () => {
    fs.writeFileSync(ordersPath, JSON.stringify([
      { id: 'order-0005', number: 5, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'admin', movies: [{ uid: '1', title: 'A' }] }
    ]));
    const om = new OrderManager(ordersPath);
    assert.equal(om.getOrders().length, 1);
    const c = om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    assert.equal(c.number, 6, 'next number continues from legacy max');
    const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.nextNumber, 7);
    assert.ok(Array.isArray(raw.orders));
  });

  it('upgrades a legacy {orders, nextNumber} file', () => {
    fs.writeFileSync(ordersPath, JSON.stringify({
      orders: [{ id: 'order-0003', number: 3, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'a', movies: [] }],
      nextNumber: 4
    }));
    const om = new OrderManager(ordersPath);
    const c = om.createOrder([{ uid: '1', title: 'X' }], 'admin');
    assert.equal(c.number, 4);
  });

  it('whitelists movie snapshot fields and caps length (A4 validation)', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{
      uid: '1',
      id: '0001',
      title: 'Heat',
      year: 1995,
      type: 'Movie',
      poster: '/api/poster/0001',
      genres: ['Action'],
      absolutePosterPath: '/secret/path.jpg',
      _posterSet: true,
      isAdmin: true
    }], 'admin');
    const m = order.movies[0];
    assert.deepEqual(Object.keys(m).sort(), [
      'genres', 'id', 'poster', 'title', 'type', 'uid', 'year'
    ].sort());
    assert.equal(m.absolutePosterPath, undefined);
    assert.equal(m.isAdmin, undefined);
  });

  it('rejects orders with more than 500 items (A4 validation)', () => {
    const om = new OrderManager(ordersPath);
    const many = Array.from({ length: 501 }, (_, i) => ({ uid: String(i), title: `T${i}` }));
    const result = om.createOrder(many, 'admin');
    assert.ok(result && result.success === false, 'must return error object, not throw');
    assert.ok(typeof result.error === 'string' && result.error.length > 0);
    assert.equal(om.count, 0, 'invalid order not stored');
  });

  it('F16: boundary at 500 items — exactly 500 accepted, 501 rejected by value', () => {
    const om = new OrderManager(ordersPath);

    // Exactly 500 items accepted
    const items500 = Array.from({ length: 500 }, (_, i) => ({ uid: `item-${i}`, title: `Title ${i}` }));
    const res500 = om.createOrder(items500, 'admin');
    assert.ok(res500 && res500.id, 'exactly 500 items must be accepted');
    assert.equal(res500.movies.length, 500, 'order must contain exactly 500 items');

    // Exactly 501 items rejected
    const items501 = Array.from({ length: 501 }, (_, i) => ({ uid: `item-${i}`, title: `Title ${i}` }));
    const res501 = om.createOrder(items501, 'admin');
    assert.equal(res501.success, false, '501 items must be rejected');
    assert.equal(res501.error, 'حداکثر 500 مورد در هر سفارش مجاز است', 'error message asserted by value');
  });

  it('returns a clear error object when save fails instead of throwing (A4)', () => {
    const om = new OrderManager(ordersPath);
    om.createOrder([{ uid: '1', title: 'A' }], 'admin');

    // Point the manager at a path that cannot be written (file where a dir is needed)
    const badParent = path.join(tmpDir, 'blocked');
    fs.mkdirSync(badParent);
    // Create a FILE named as-dir so mkdir of parent fails
    fs.writeFileSync(badParent + '.marker', 'x');
    // Simpler: make ordersPath a directory so write fails
    const dirAsFile = path.join(tmpDir, 'orders-as-dir');
    fs.mkdirSync(dirAsFile, { recursive: true });
    const om2 = new OrderManager(path.join(dirAsFile, 'nested', 'orders.json'));
    // Corrupt by replacing path's parent with a file
    fs.rmSync(path.join(dirAsFile, 'nested'), { recursive: true, force: true });
    fs.writeFileSync(path.join(dirAsFile, 'nested'), 'not-a-dir');

    const result = om2.createOrder([{ uid: '9', title: 'Z' }], 'admin');
    assert.ok(result && result.success === false, `expected error object, got ${JSON.stringify(result && result.id)}`);
    assert.ok(/ذخیره|خطا|error/i.test(result.error), `expected Persian/error message, got: ${result.error}`);
  });

  it('F35: save failure never forwards raw OS error text to the client', () => {
    const dirAsFile = path.join(tmpDir, 'orders-as-dir-2');
    fs.mkdirSync(dirAsFile, { recursive: true });
    const om = new OrderManager(path.join(dirAsFile, 'nested', 'orders.json'));
    fs.rmSync(path.join(dirAsFile, 'nested'), { recursive: true, force: true });
    fs.writeFileSync(path.join(dirAsFile, 'nested'), 'not-a-dir');

    const result = om.createOrder([{ uid: '9', title: 'Z' }], 'admin');
    assert.ok(result && result.success === false);
    // Raw OS text (EEXIST, ENOENT, tmp filenames, absolute paths) must not appear
    assert.ok(!/EEXIST|ENOENT|EPERM|tmp|AppData|\\\\|:[\w]+\\/.test(result.error),
      `raw OS detail must not be forwarded: ${result.error}`);
    assert.ok(/ذخیره/.test(result.error), `Persian message expected, got: ${result.error}`);
  });

  it('forces a backup before deleting an order (A4 / destructive op)', () => {
    const om = new OrderManager(ordersPath);
    const a = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    om.createOrder([{ uid: '2', title: 'B' }], 'admin'); // second save creates the first backup
    assert.equal(om.deleteOrder(a.id), true);

    const backupDirPath = path.join(path.dirname(ordersPath), 'backups');
    assert.ok(fs.existsSync(backupDirPath), 'backups directory exists');
    const backups = fs.readdirSync(backupDirPath).filter((n) => n.startsWith('orders.'));
    assert.ok(backups.length >= 1, `expected a pre-delete backup, got ${backups.length}`);
  });

  it('quarantines a corrupt orders.json and restores from backup (DATA-08)', () => {
    // Seed a good file + at least one backup (second save triggers backup)
    const om0 = new OrderManager(ordersPath);
    om0.createOrder([{ uid: '1', title: 'SENTINEL-HISTORY' }], 'admin');
    om0.createOrder([{ uid: '2', title: 'SECOND' }], 'admin');
    const backupDirPath = path.join(path.dirname(ordersPath), 'backups');
    assert.ok(fs.existsSync(backupDirPath), 'precondition: backups exist after second save');
    assert.ok(fs.readdirSync(backupDirPath).filter((n) => n.startsWith('orders.')).length >= 1);

    // Truncate the main file
    fs.writeFileSync(ordersPath, '{"orders":[{"id":"order-0007","number":7,"createdBy":"SENTINEL","movies":[]}');

    const om = new OrderManager(ordersPath);
    // Corrupt file was quarantined (renamed away); history restored from backup in memory
    const siblings = fs.readdirSync(tmpDir);
    const quarantined = siblings.filter((n) => n.includes('.corrupt-'));
    assert.ok(quarantined.length >= 1, `expected quarantine file, got: ${siblings.join(', ')}`);
    const qBytes = fs.readFileSync(path.join(tmpDir, quarantined[0]), 'utf8');
    assert.ok(qBytes.includes('SENTINEL'), 'quarantine preserves original bytes');

    const restoredTitles = om.getOrders().flatMap((o) => (o.movies || []).map((m) => m.title));
    assert.ok(
      restoredTitles.includes('SENTINEL-HISTORY') || restoredTitles.includes('SECOND'),
      `history restored from backup, got titles: ${restoredTitles.join(', ')}`
    );

    // After load, creating a new order must not wipe quarantine or backups
    om.createOrder([{ uid: '3', title: 'AFTER' }], 'admin');
    const siblings2 = fs.readdirSync(tmpDir);
    assert.ok(
      siblings2.some((n) => n.includes('.corrupt-')),
      'quarantine file still on disk after subsequent save'
    );
    assert.ok(
      fs.existsSync(backupDirPath) &&
        fs.readdirSync(backupDirPath).some((n) =>
          fs.readFileSync(path.join(backupDirPath, n), 'utf8').includes('SENTINEL')),
      'backup with history still present'
    );
  });

  // ── P6d E5: workflow fields, status/info updates, soft delete + undo ──

  it('P6d E5: new orders get workflow defaults (status new, empty name/note, updatedAt = createdAt)', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    assert.equal(order.status, 'new');
    assert.equal(order.customerName, '');
    assert.equal(order.note, '');
    assert.equal(order.updatedAt, order.createdAt);
  });

  it('P6d E5: legacy orders load with defaults (status done, empty fields, updatedAt = createdAt) and persist on next save', () => {
    fs.writeFileSync(ordersPath, JSON.stringify([
      {
        id: 'order-0005', number: 5, createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'admin', movies: [{ uid: '1', title: 'A' }]
      }
    ]));
    const om = new OrderManager(ordersPath);
    const o = om.getOrders()[0];
    assert.equal(o.status, 'done', 'legacy order defaults to done');
    assert.equal(o.customerName, '');
    assert.equal(o.note, '');
    assert.equal(o.updatedAt, '2026-01-01T00:00:00.000Z');

    om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw.orders[0].status, 'done', 'migration persists on first save');
    assert.equal(raw.orders[0].updatedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(raw.orders[0].customerName, '');
  });

  it('P6d E5: an invalid status in a stored file loads as done', () => {
    fs.writeFileSync(ordersPath, JSON.stringify({
      version: 1,
      nextNumber: 2,
      orders: [{
        id: 'order-0001', number: 1, createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'a', status: 'archived', movies: []
      }]
    }));
    const om = new OrderManager(ordersPath);
    assert.equal(om.getOrders()[0].status, 'done');
  });

  it('P6d E5: updateOrderStatus persists the new status and bumps updatedAt', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const res = om.updateOrderStatus(order.id, 'preparing');
    assert.ok(res && res.id === order.id, `expected the order, got ${JSON.stringify(res)}`);
    assert.equal(res.status, 'preparing');
    assert.ok(res.updatedAt >= order.createdAt, 'updatedAt bumped');

    const om2 = new OrderManager(ordersPath);
    assert.equal(om2.getOrder(order.id).status, 'preparing', 'status survives reload');
  });

  it('P6d E5: updateOrderStatus rejects unknown statuses with a Persian error and changes nothing', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const res = om.updateOrderStatus(order.id, 'archived');
    assert.ok(res && res.success === false, `expected error object, got ${JSON.stringify(res)}`);
    assert.equal(res.code, 'STATUS_INVALID');
    assert.ok(/[\u0600-\u06FF]/.test(res.error), `expected a Persian message, got: ${res.error}`);
    assert.equal(om.getOrder(order.id).status, 'new', 'order untouched');
    const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw.orders[0].status, 'new', 'disk untouched');
  });

  it('P6d E5: updateOrderStatus on an unknown id returns false', () => {
    const om = new OrderManager(ordersPath);
    assert.equal(om.updateOrderStatus('order-9999', 'done'), false);
  });

  it('P6d E5: updateOrderInfo clamps name/note to 200 chars, bumps updatedAt, persists', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    const long = '\u0646'.repeat(250);
    const res = om.updateOrderInfo(order.id, { customerName: long, note: long });
    assert.ok(res && res.id === order.id, `expected the order, got ${JSON.stringify(res)}`);
    assert.equal(res.customerName.length, 200, 'customerName clamped');
    assert.equal(res.note.length, 200, 'note clamped');
    assert.ok(res.updatedAt >= order.createdAt);

    const om2 = new OrderManager(ordersPath);
    const found = om2.getOrder(order.id);
    assert.equal(found.customerName.length, 200);
    assert.equal(found.note.length, 200);
  });

  it('P6d E5: updateOrderInfo keeps omitted fields, rejects unknown ids with a Persian error', () => {
    const om = new OrderManager(ordersPath);
    const order = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    om.updateOrderInfo(order.id, { customerName: '\u0639\u0644\u06cc' });
    const res = om.updateOrderInfo(order.id, { note: '\u0633\u0627\u0639\u062a \u06f6' });
    assert.equal(res.customerName, '\u0639\u0644\u06cc', 'omitted customerName kept');
    assert.equal(res.note, '\u0633\u0627\u0639\u062a \u06f6');

    const bad = om.updateOrderInfo('order-9999', { note: 'x' });
    assert.ok(bad && bad.success === false, `expected error object, got ${JSON.stringify(bad)}`);
    assert.equal(bad.code, 'ORDER_NOT_FOUND');
    assert.ok(/[\u0600-\u06FF]/.test(bad.error), `expected a Persian message, got: ${bad.error}`);
  });

  it('P6d E5: soft delete removes the order everywhere but undo restores the same id and number', () => {
    const om = new OrderManager(ordersPath);
    const a = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    om.createOrder([{ uid: '2', title: 'B' }], 'admin');

    assert.equal(om.deleteOrder(a.id), true);
    assert.equal(om.getOrder(a.id), null, 'gone from memory');
    assert.equal(om.getOrders().length, 1);
    const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw.orders.length, 1, 'gone from disk at delete time');

    const restored = om.undoDeleteOrder(a.id);
    assert.ok(restored, 'undo within the window returns the order');
    assert.equal(restored.id, a.id);
    assert.equal(restored.number, a.number, 'the original number comes back');
    assert.equal(om.getOrders().length, 2);

    const raw2 = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    assert.equal(raw2.orders.length, 2, 'undo persists to disk');
    const om2 = new OrderManager(ordersPath);
    assert.ok(om2.getOrder(a.id), 'undo survives a reload');
    assert.equal(om2.nextNumber, 3, 'nextNumber was never lowered');
  });

  it('P6d E5: undo after the window returns null; dispose() cancels the purge timer', async () => {
    const om = new OrderManager(ordersPath, { undoWindowMs: 40 });
    const a = om.createOrder([{ uid: '1', title: 'A' }], 'admin');
    om.deleteOrder(a.id);
    assert.ok(om.undoDeleteOrder(a.id), 'immediate undo works');

    om.deleteOrder(a.id);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(om.undoDeleteOrder(a.id), null, 'expired undo returns null');
    assert.equal(om.getOrders().length, 0);

    const b = om.createOrder([{ uid: '2', title: 'B' }], 'admin');
    om.deleteOrder(b.id);
    om.dispose();
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(om.undoDeleteOrder(b.id), 'dispose() cancels the purge timer');
  });

  it('P6d E5: undo of an order that was never deleted returns null', () => {
    const om = new OrderManager(ordersPath);
    assert.equal(om.undoDeleteOrder('order-9999'), null);
  });
});
