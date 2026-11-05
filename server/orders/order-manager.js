'use strict';

/**
 * Order Manager Module
 *
 * Manages persistent order storage in data/orders.json.
 * Orders persist across server restarts.
 *
 * On-disk format (v1): { version: 1, nextNumber, orders }
 * Legacy formats (bare array or { orders, nextNumber }) load and upgrade on
 * first save. Deleting an order never lowers nextNumber (DATA-07).
 *
 * Writes are atomic (A1); corrupt files are quarantined and restored from
 * the newest valid backup (A2 / DATA-08). Save failures return an error
 * object instead of throwing.
 *
 * Responsibilities:
 *   - createOrder(movies, createdBy)
 *   - getOrders()
 *   - getOrder(id)
 *   - updateOrderStatus(id, status) / updateOrderInfo(id, fields)  (P6d E5)
 *   - deleteOrder(id) / undoDeleteOrder(id)                        (P6d E5)
 *   - generateOrderNumber()
 *
 * P6d E5: every order carries `status` (new|preparing|done),
 * `customerName`, `note` (both <= 200 chars) and `updatedAt`. Legacy orders
 * (or any stored status outside the enum) load with the E5 defaults
 * (done / "" / createdAt) and upgrade on the first save.
 * deleteOrder removes the order from disk immediately but parks it in
 * memory for `undoWindowMs` (default 10 s) so the manager UI can offer an
 * undo; dispose() cancels those purge timers on shutdown.
 */

const fs = require('fs');
const path = require('path');
const { writeJsonAtomic, readJsonSafe } = require('../../backend/storage/atomic-json');
const { createBackupManager } = require('../../backend/storage/backup');

const FILE_VERSION = 1;
const MAX_ORDER_ITEMS = 500;
const ORDER_STATUSES = ['new', 'preparing', 'done'];
const DEFAULT_LEGACY_STATUS = 'done';
const MAX_INFO_LEN = 200;
const DEFAULT_UNDO_WINDOW_MS = 10000;
const MAX_STRING_LEN = {
  uid: 300,
  id: 20,
  title: 300,
  type: 40,
  poster: 500,
  createdBy: 100
};
const MAX_GENRES = 30;
const MAX_GENRE_LEN = 60;

function defaultBackupDir(ordersPath) {
  return path.join(path.dirname(ordersPath), 'backups');
}

function clampString(value, max) {
  if (value == null) return '';
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Whitelist/validate a movie snapshot for storage.
 * @returns {object|null} Normalised snapshot, or null if the input is invalid
 */
function sanitizeMovie(m) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.uid !== 'string' || m.uid.length === 0) return null;

  const genres = Array.isArray(m.genres)
    ? m.genres.filter((g) => typeof g === 'string').slice(0, MAX_GENRES).map((g) => clampString(g, MAX_GENRE_LEN))
    : [];

  let year = null;
  if (m.year != null && m.year !== '') {
    const n = Number(m.year);
    if (Number.isFinite(n)) year = n;
  }

  return {
    uid: clampString(m.uid, MAX_STRING_LEN.uid),
    id: m.id == null || m.id === '' ? '' : clampString(m.id, MAX_STRING_LEN.id),
    title: clampString(m.title, MAX_STRING_LEN.title),
    year,
    type: clampString(m.type, MAX_STRING_LEN.type),
    poster: clampString(m.poster, MAX_STRING_LEN.poster),
    genres
  };
}

class OrderManager {
  /**
   * @param {string} ordersPath - Path to orders.json file
   * @param {{ backupManager?: object, backupDir?: string, undoWindowMs?: number }} [options]
   */
  constructor(ordersPath, options) {
    this._ordersPath = ordersPath;
    this._orders = [];
    this._nextNumber = 1;
    this._backupDir = (options && options.backupDir) || defaultBackupDir(ordersPath);
    this._backups = (options && options.backupManager) || createBackupManager(this._backupDir);
    this._undoWindowMs = (options && typeof options.undoWindowMs === 'number')
      ? options.undoWindowMs
      : DEFAULT_UNDO_WINDOW_MS;
    this._pendingDeletes = new Map();

    // Ensure data directory exists
    const dataDir = path.dirname(ordersPath);
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        console.error(`  [ORDERS] Cannot create data directory: ${err.message}`);
      }
    }

    this._loadFromDisk();
  }

  /**
   * Load orders from disk.
   * Corrupt files are quarantined; recovery tries the newest valid backup.
   * nextNumber = max(persisted, maxExistingNumber + 1) — never lowered (DATA-07).
   */
  _loadFromDisk() {
    const result = readJsonSafe(this._ordersPath, { backupDir: this._backupDir });

    if (result.status === 'missing') {
      console.log('  [ORDERS] No existing orders file found, starting fresh');
      return;
    }

    if (result.status === 'corrupt' || !result.data) {
      console.error('  [ORDERS] orders.json was corrupt — starting empty (quarantined)');
      this._orders = [];
      this._nextNumber = 1;
      return;
    }

    if (result.warning && result.warning.kind === 'restored-from-backup') {
      console.warn(`  [ORDERS] Restored from backup: ${result.warning.detail}`);
    }

    const data = result.data;

    if (Array.isArray(data)) {
      // Legacy bare-array format
      this._orders = data;
    } else if (data && Array.isArray(data.orders)) {
      this._orders = data.orders;
      if (typeof data.nextNumber === 'number' && data.nextNumber >= 1) {
        this._nextNumber = data.nextNumber;
      } else {
        this._nextNumber = this._calculateNextNumber();
      }
    } else {
      this._orders = [];
      this._nextNumber = 1;
    }

    // P6d E5 — legacy/default normalisation (status done, empty info,
    // updatedAt = createdAt) so every loaded order is workflow-ready.
    this._orders = this._orders.map((o) => this._normalizeOrder(o));

    // Never let the counter fall below max(existing) + 1
    const fromOrders = this._calculateNextNumber();
    if (fromOrders > this._nextNumber) {
      this._nextNumber = fromOrders;
    }

    console.log(`  [ORDERS] Loaded ${this._orders.length} orders from disk`);
  }

  /**
   * Fill in the P6d E5 workflow fields for a loaded order (in place).
   * Unknown/absent statuses become `done` (the legacy default), missing
   * info fields become empty strings, updatedAt falls back to createdAt.
   *
   * @param {object} o
   * @returns {object} the same order
   */
  _normalizeOrder(o) {
    if (!o || typeof o !== 'object') return o;
    if (!ORDER_STATUSES.includes(o.status)) {
      o.status = DEFAULT_LEGACY_STATUS;
    }
    o.customerName = typeof o.customerName === 'string'
      ? clampString(o.customerName, MAX_INFO_LEN)
      : '';
    o.note = typeof o.note === 'string' ? clampString(o.note, MAX_INFO_LEN) : '';
    if (typeof o.updatedAt !== 'string' || !o.updatedAt) {
      o.updatedAt = typeof o.createdAt === 'string' && o.createdAt
        ? o.createdAt
        : new Date().toISOString();
    }
    return o;
  }

  /**
   * Save orders to disk (atomic; throttled backup of the previous file).
   * @returns {{ success: true } | { success: false, error: string }}
   */
  _saveToDisk() {
    const payload = {
      version: FILE_VERSION,
      nextNumber: this._nextNumber,
      orders: this._orders
    };

    try {
      if (fs.existsSync(this._ordersPath)) {
        this._backups.backup(this._ordersPath, 'orders');
      }
      writeJsonAtomic(this._ordersPath, payload);
      console.log(`  [ORDERS] Saved ${this._orders.length} orders to disk`);
      return { success: true };
    } catch (err) {
      // F35: log the raw OS/JS detail server-side, but never forward it to
      // the client. Send only the Persian user-visible message.
      console.error(`  [ORDERS] Failed to save orders: ${err.message}`);
      return {
        success: false,
        error: 'ذخیره سفارش‌ها در دیسک انجام نشد'
      };
    }
  }

  /**
   * Calculate the next order number from existing orders.
   * Deleted order numbers are NOT reused.
   *
   * @returns {number}
   */
  _calculateNextNumber() {
    if (this._orders.length === 0) return 1;

    const maxNumber = this._orders.reduce((max, order) => {
      const n = Number(order && order.number);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    return maxNumber + 1;
  }

  /**
   * Generate a unique order ID.
   *
   * @returns {string} - e.g., "order-0001"
   */
  _generateOrderId() {
    const num = this._nextNumber;
    return `order-${String(num).padStart(4, '0')}`;
  }

  /**
   * Create a new order from the current selection.
   *
   * @param {Array} movies - Array of movie objects
   * @param {string} createdBy - Username of the admin who created the order
   * @returns {object|{success:false, error:string}} - Created order, or an error object
   */
  createOrder(movies, createdBy = 'unknown') {
    if (!Array.isArray(movies) || movies.length === 0) {
      throw new Error('Cannot create order with empty movie list');
    }

    if (movies.length > MAX_ORDER_ITEMS) {
      return {
        success: false,
        error: `حداکثر ${MAX_ORDER_ITEMS} مورد در هر سفارش مجاز است`
      };
    }

    const snapshots = [];
    for (const m of movies) {
      const snap = sanitizeMovie(m);
      if (!snap) {
        return {
          success: false,
          error: 'اطلاعات یکی از موارد انتخاب‌شده نامعتبر است'
        };
      }
      snapshots.push(snap);
    }

    const createdAt = new Date().toISOString();
    const order = {
      id: this._generateOrderId(),
      number: this._nextNumber,
      createdAt,
      createdBy: clampString(createdBy, MAX_STRING_LEN.createdBy),
      // P6d E5 — a freshly saved order starts as new with empty workflow info
      status: 'new',
      customerName: '',
      note: '',
      updatedAt: createdAt,
      movies: snapshots
    };

    this._orders.push(order);
    this._nextNumber++;

    const saved = this._saveToDisk();
    if (!saved.success) {
      // Roll back in-memory state so the number is not burned on a failed save
      this._orders.pop();
      this._nextNumber--;
      return saved;
    }

    console.log(`  [ORDERS] Created ${order.id} with ${snapshots.length} movies`);
    return order;
  }

  /**
   * Get all orders.
   *
   * @returns {Array} - Array of order objects (sorted by newest first)
   */
  getOrders() {
    return [...this._orders].sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /**
   * Get a specific order by ID.
   *
   * @param {string} orderId - The order ID
   * @returns {object|null} - The order or null if not found
   */
  getOrder(orderId) {
    return this._orders.find(o => o.id === orderId) || null;
  }

  /**
   * Delete an order by ID.
   * Forces a backup first (destructive operation). nextNumber is never lowered.
   * P6d E5: the order is parked for `undoWindowMs` so undoDeleteOrder can
   * bring it back with the same number.
   *
   * @param {string} orderId - The order ID
   * @returns {boolean|{success:false, error:string}} - true/false, or error object on save failure
   */
  deleteOrder(orderId) {
    const index = this._orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      console.log(`  [ORDERS] Order not found: ${orderId}`);
      return false;
    }

    // Destructive: always take a backup first, bypassing the throttle
    if (fs.existsSync(this._ordersPath)) {
      try {
        this._backups.backup(this._ordersPath, 'orders', { force: true });
      } catch (err) {
        console.error(`  [ORDERS] Pre-delete backup failed: ${err.message}`);
      }
    }

    const deleted = this._orders.splice(index, 1)[0];
    const saved = this._saveToDisk();
    if (!saved.success) {
      // Restore in-memory order
      this._orders.splice(index, 0, deleted);
      return saved;
    }

    // P6d E5 — soft delete: the order is gone from disk (the forced backup
    // above keeps the P2 restore history) but parked in memory for the undo
    // window; the purge just drops the parked copy.
    this._parkDelete(orderId, deleted);

    console.log(`  [ORDERS] Deleted ${orderId} (had ${deleted.movies.length} movies)`);
    return true;
  }

  /**
   * Park a just-deleted order for the undo window (P6d E5).
   * @param {string} orderId
   * @param {object} order
   */
  _parkDelete(orderId, order) {
    const timer = setTimeout(() => {
      this._pendingDeletes.delete(orderId);
    }, this._undoWindowMs);
    if (typeof timer.unref === 'function') timer.unref();
    this._pendingDeletes.set(orderId, { order, timer });
  }

  /**
   * Undo a soft delete while the order is still parked (P6d E5).
   * Restores the same id and number; never lowers nextNumber.
   *
   * @param {string} orderId
   * @returns {object|null} the restored order, or null if expired/unknown
   */
  undoDeleteOrder(orderId) {
    const pending = this._pendingDeletes.get(orderId);
    if (!pending) return null;

    clearTimeout(pending.timer);
    this._pendingDeletes.delete(orderId);

    this._orders.push(pending.order);
    const saved = this._saveToDisk();
    if (!saved.success) {
      this._orders.pop();
      this._parkDelete(orderId, pending.order);
      return null;
    }

    console.log(`  [ORDERS] Restored ${orderId} (number ${pending.order.number})`);
    return pending.order;
  }

  /**
   * Update the workflow status of an order (P6d E5).
   *
   * @param {string} orderId
   * @param {string} status - one of new | preparing | done
   * @returns {object|false|{success:false, code:string, error:string}}
   *   the updated order, false for an unknown id, or a Persian error object
   */
  updateOrderStatus(orderId, status) {
    const order = this.getOrder(orderId);
    if (!order) return false;

    if (!ORDER_STATUSES.includes(status)) {
      return {
        success: false,
        code: 'STATUS_INVALID',
        error: 'وضعیت سفارش نامعتبر است — مقادیر مجاز: جدید، در حال آماده‌سازی، انجام شده'
      };
    }

    const previous = { status: order.status, updatedAt: order.updatedAt };
    order.status = status;
    order.updatedAt = new Date().toISOString();

    const saved = this._saveToDisk();
    if (!saved.success) {
      order.status = previous.status;
      order.updatedAt = previous.updatedAt;
      return { success: false, code: 'SAVE_FAILED', error: saved.error };
    }

    console.log(`  [ORDERS] ${orderId} status -> ${status}`);
    return order;
  }

  /**
   * Update customerName / note of an order (P6d E5). Omitted fields are
   * kept; both are clamped to 200 chars and updatedAt is bumped.
   *
   * @param {string} orderId
   * @param {{ customerName?: string, note?: string }} fields
   * @returns {object|{success:false, code:string, error:string}}
   */
  updateOrderInfo(orderId, fields) {
    const order = this.getOrder(orderId);
    if (!order) {
      return { success: false, code: 'ORDER_NOT_FOUND', error: 'سفارش مورد نظر یافت نشد' };
    }

    const previous = {
      customerName: order.customerName,
      note: order.note,
      updatedAt: order.updatedAt
    };

    if (fields && typeof fields.customerName === 'string') {
      order.customerName = clampString(fields.customerName, MAX_INFO_LEN);
    }
    if (fields && typeof fields.note === 'string') {
      order.note = clampString(fields.note, MAX_INFO_LEN);
    }
    order.updatedAt = new Date().toISOString();

    const saved = this._saveToDisk();
    if (!saved.success) {
      order.customerName = previous.customerName;
      order.note = previous.note;
      order.updatedAt = previous.updatedAt;
      return { success: false, code: 'SAVE_FAILED', error: saved.error };
    }

    console.log(`  [ORDERS] ${orderId} info updated`);
    return order;
  }

  /**
   * Cancel all pending undo purge timers (shutdown / tests, P6d E5).
   * Parked entries stay reachable so an undo right after a stop still works.
   */
  dispose() {
    for (const pending of this._pendingDeletes.values()) {
      clearTimeout(pending.timer);
    }
  }

  /**
   * Get the total number of orders.
   *
   * @returns {number}
   */
  get count() {
    return this._orders.length;
  }

  /**
   * Current next order number (for tests / diagnostics).
   * @returns {number}
   */
  get nextNumber() {
    return this._nextNumber;
  }
}

module.exports = OrderManager;
