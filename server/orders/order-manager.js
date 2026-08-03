/**
 * Order Manager Module
 *
 * Manages persistent order storage in data/orders.json.
 * Orders persist across server restarts.
 *
 * Responsibilities:
 *   - createOrder(movies, createdBy)
 *   - getOrders()
 *   - getOrder(id)
 *   - deleteOrder(id)
 *   - generateOrderNumber()
 *
 * Storage: data/orders.json
 */

const fs = require('fs');
const path = require('path');

class OrderManager {
  /**
   * @param {string} ordersPath - Path to orders.json file
   */
  constructor(ordersPath) {
    this._ordersPath = ordersPath;
    this._orders = [];
    this._nextNumber = 1;

    // Ensure data directory exists
    const dataDir = path.dirname(ordersPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing orders from disk
    this._loadFromDisk();
  }

  /**
   * Load orders from disk.
   * If file doesn't exist, starts with empty array.
   */
  _loadFromDisk() {
    try {
      if (fs.existsSync(this._ordersPath)) {
        const raw = fs.readFileSync(this._ordersPath, 'utf-8');
        const data = JSON.parse(raw);

        if (Array.isArray(data)) {
          this._orders = data;
        } else if (data.orders && Array.isArray(data.orders)) {
          this._orders = data.orders;
          this._nextNumber = data.nextNumber || this._calculateNextNumber();
        } else {
          this._orders = [];
        }

        // Calculate next number from existing orders
        this._nextNumber = this._calculateNextNumber();
        console.log(`  [ORDERS] Loaded ${this._orders.length} orders from disk`);
      } else {
        console.log('  [ORDERS] No existing orders file found, starting fresh');
      }
    } catch (err) {
      console.error(`  [ORDERS] Failed to load orders: ${err.message}`);
      this._orders = [];
      this._nextNumber = 1;
    }
  }

  /**
   * Save orders to disk.
   */
  _saveToDisk() {
    try {
      const data = {
        orders: this._orders,
        nextNumber: this._nextNumber
      };
      fs.writeFileSync(this._ordersPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`  [ORDERS] Saved ${this._orders.length} orders to disk`);
    } catch (err) {
      console.error(`  [ORDERS] Failed to save orders: ${err.message}`);
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

    // Find the highest order number
    const maxNumber = this._orders.reduce((max, order) => {
      return order.number > max ? order.number : max;
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
   * @returns {object} - The created order
   */
  createOrder(movies, createdBy = 'unknown') {
    if (!Array.isArray(movies) || movies.length === 0) {
      throw new Error('Cannot create order with empty movie list');
    }

    const order = {
      id: this._generateOrderId(),
      number: this._nextNumber,
      createdAt: new Date().toISOString(),
      createdBy: createdBy,
      movies: movies.map(m => ({
        uid: m.uid || '',
        id: m.id || '',
        title: m.title || '',
        year: m.year || null,
        type: m.type || '',
        genres: m.genres || [],
        poster: m.poster || ''
      }))
    };

    this._orders.push(order);
    this._nextNumber++;
    this._saveToDisk();

    console.log(`  [ORDERS] Created ${order.id} with ${movies.length} movies`);
    return order;
  }

  /**
   * Get all orders.
   *
   * @returns {Array} - Array of order objects (sorted by newest first)
   */
  getOrders() {
    // Return orders sorted by creation date (newest first)
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
   *
   * @param {string} orderId - The order ID to delete
   * @returns {boolean} - True if deleted, false if not found
   */
  deleteOrder(orderId) {
    const index = this._orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      console.log(`  [ORDERS] Order not found: ${orderId}`);
      return false;
    }

    const deleted = this._orders.splice(index, 1)[0];
    this._saveToDisk();

    console.log(`  [ORDERS] Deleted ${orderId} (had ${deleted.movies.length} movies)`);
    return true;
  }

  /**
   * Get the total number of orders.
   *
   * @returns {number}
   */
  get count() {
    return this._orders.length;
  }
}

module.exports = OrderManager;
