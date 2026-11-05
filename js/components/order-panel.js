/**
 * OrderPanel Component
 *
 * Displays the list of saved orders in the admin panel.
 * Order cards carry a Persian status chip (P6d E5) and the panel has
 * status + date filters. Deleting is soft: one click → orders:delete +
 * a 10 s undo toast (no confirm dialog).
 */

import { store } from '../store.js';
import { html, raw } from '../utils/html.js';

const STATUS_LABELS = {
  new: 'جدید',
  preparing: 'در حال آماده‌سازی',
  done: 'انجام شده'
};

class OrderPanel extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._lastOrdersSig = null;
    this._statusFilter = '';
    this._dateFilter = '';
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      this._updatePanel(state);
    }, ['orders']);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    this._lastOrdersSig = null;
  }

  render() {
    const { orders } = store.state;

    this.innerHTML = html`
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
        <div class="order-panel-filters">
          <select id="orderStatusFilter" class="order-filter-select" aria-label="فیلتر وضعیت سفارش">
            <option value="">همه وضعیت‌ها</option>
            <option value="new">جدید</option>
            <option value="preparing">در حال آماده‌سازی</option>
            <option value="done">انجام شده</option>
          </select>
          <input type="date" id="orderDateFilter" class="order-filter-date" aria-label="فیلتر تاریخ سفارش">
        </div>
        <div class="order-panel-list" id="orderList">
          ${raw(this._renderList(orders))}
        </div>
      </div>
    `;

    this._lastOrdersSig = this._ordersSig(orders);
    this._bindFilterEvents();
    this._bindEvents();
  }

  _ordersSig(orders) {
    // P6d E5 — include workflow fields so status/info edits re-render the cards
    return orders.map(o =>
      `${o.id}:${o.status || ''}:${o.updatedAt || ''}:${o.customerName || ''}:${o.note || ''}`
    ).join('|');
  }

  _filterOrders(orders) {
    let list = orders;
    if (this._statusFilter) {
      list = list.filter(o => o.status === this._statusFilter);
    }
    if (this._dateFilter) {
      list = list.filter(o => {
        const d = new Date(o.createdAt);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}` === this._dateFilter;
      });
    }
    return list;
  }

  _renderList(allOrders) {
    if (!allOrders.length) {
      return html`
        <div class="order-empty">
          <div class="order-empty-icon">📦</div>
          <div class="order-empty-text">
            هنوز سفارشی ذخیره نشده است.<br>
            از دکمه «ذخیره سفارش» برای ذخیره انتخاب مشتری استفاده کنید.
          </div>
        </div>
      `;
    }

    const orders = this._filterOrders(allOrders);
    if (!orders.length) {
      return html`
        <div class="order-empty">
          <div class="order-empty-text">سفارشی با این فیلتر یافت نشد.</div>
        </div>
      `;
    }

    return orders.map(order => html`
      <div class="order-card" data-order-id="${order.id}">
        <div class="order-card-header">
          <div class="order-card-number">سفارش ${order.number}</div>
          <span class="order-status-chip ${order.status || 'done'}">${this._statusLabel(order.status)}</span>
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

  _refreshList() {
    const orderList = this.querySelector('#orderList');
    if (!orderList) return;
    orderList.innerHTML = this._renderList(store.state.orders);
    this._bindEvents();
  }

  _updatePanel(state) {
    const { orders } = state;

    const orderList = this.querySelector('#orderList');
    if (orderList) {
      const sig = this._ordersSig(orders);
      if (sig !== this._lastOrdersSig) {
        this._lastOrdersSig = sig;
        orderList.innerHTML = this._renderList(orders);
        this._bindEvents();
      }
    }

    const countEl = this.querySelector('#orderCount');
    if (countEl) {
      countEl.textContent = orders.length;
    }
  }

  _statusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.done;
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

  _bindFilterEvents() {
    const statusSel = this.querySelector('#orderStatusFilter');
    if (statusSel) {
      statusSel.value = this._statusFilter;
      statusSel.addEventListener('change', () => {
        this._statusFilter = statusSel.value;
        this._refreshList();
      });
    }

    const dateInput = this.querySelector('#orderDateFilter');
    if (dateInput) {
      dateInput.value = this._dateFilter;
      const applyDate = () => {
        this._dateFilter = dateInput.value;
        this._refreshList();
      };
      dateInput.addEventListener('change', applyDate);
      dateInput.addEventListener('input', applyDate);
    }
  }

  _bindEvents() {
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

    this.querySelectorAll('.order-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // P6d E5 — no confirm dialog: soft delete + 10 s undo toast
        store.deleteOrder(e.currentTarget.dataset.orderId);
      });
    });
  }
}

customElements.define('order-panel', OrderPanel);
