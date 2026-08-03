/**
 * OrderPanel Component
 *
 * Displays the list of saved orders in the admin panel.
 * Shows order cards with view/delete functionality.
 *
 * Features:
 *   - List of all saved orders
 *   - Order count display
 *   - Empty state when no orders
 *   - Triggers order detail view
 */

import { store, showToast } from '../store.js';

class OrderPanel extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      this._updatePanel(state);
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    const { orders } = store.state;

    this.innerHTML = `
      <div class="order-panel">
        <div class="order-panel-header">
          <div class="order-panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            سفارشات ذخیره شده
          </div>
          <div class="order-count-badge" id="orderCount">${orders.length}</div>
        </div>
        <div class="order-panel-list" id="orderList">
          ${this._renderOrderList(orders)}
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderOrderList(orders) {
    if (!orders.length) {
      return `
        <div class="order-empty">
          <div class="order-empty-icon">📦</div>
          <div class="order-empty-text">
            هنوز سفارشی ذخیره نشده است.<br>
            از دکمه «ذخیره سفارش» برای ذخیره انتخاب مشتری استفاده کنید.
          </div>
        </div>
      `;
    }

    return orders.map(order => `
      <div class="order-card" data-order-id="${order.id}">
        <div class="order-card-header">
          <div class="order-card-number">سفارش ${order.number}</div>
          <div class="order-card-date">${this._formatDate(order.createdAt)}</div>
        </div>
        <div class="order-card-meta">
          <div class="order-card-info">
            <span class="order-card-movie-count">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
              </svg>
              ${order.movies.length} فیلم
            </span>
            <span class="order-card-creator">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              ${order.createdBy}
            </span>
          </div>
        </div>
        <div class="order-card-actions">
          <button class="btn btn-ghost btn-xs order-view-btn" data-order-id="${order.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            مشاهده
          </button>
          <button class="btn btn-danger btn-xs order-delete-btn" data-order-id="${order.id}" data-order-number="${order.number}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            حذف
          </button>
        </div>
      </div>
    `).join('');
  }

  _updatePanel(state) {
    const { orders } = state;

    const orderList = this.querySelector('#orderList');
    if (orderList) {
      orderList.innerHTML = this._renderOrderList(orders);
      this._bindEvents();
    }

    const countEl = this.querySelector('#orderCount');
    if (countEl) {
      countEl.textContent = orders.length;
    }
  }

  _formatDate(isoString) {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  _bindEvents() {
    // View order buttons
    this.querySelectorAll('.order-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const orderId = e.currentTarget.dataset.orderId;
        const { orders } = store.state;
        const order = orders.find(o => o.id === orderId);
        if (order) {
          store.viewOrder(order);
        }
      });
    });

    // Delete order buttons
    this.querySelectorAll('.order-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const orderId = e.currentTarget.dataset.orderId;
        const orderNumber = e.currentTarget.dataset.orderNumber;
        this._showDeleteConfirmation(orderId, orderNumber);
      });
    });
  }

  _showDeleteConfirmation(orderId, orderNumber) {
    const modal = document.getElementById('confirmModal');
    if (modal && typeof modal.show === 'function') {
      modal.show(
        `آیا از حذف سفارش ${orderNumber} مطمئن هستید؟\n\nاین عمل قابل بازگشت نیست.`,
        'تأیید حذف',
        () => {
          store.deleteOrder(orderId);
        }
      );
    } else {
      // Fallback: if modal not found, delete directly
      console.warn('[ORDER] Confirm modal not found, deleting directly');
      store.deleteOrder(orderId);
    }
  }
}

customElements.define('order-panel', OrderPanel);
