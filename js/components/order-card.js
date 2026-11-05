/**
 * OrderCard Component
 *
 * Displays order details in a modal/overlay view.
 * Shows complete movie list for a selected order.
 */

import { store } from '../store.js';
import { html, raw } from '../utils/html.js';
import { hasId } from '../utils/helpers.js';
import { trapFocus } from '../utils/dialog.js';

class OrderCard extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._releaseFocus = null;
    this._currentOrder = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      if (state.selectedOrder) {
        this._showOrder(state.selectedOrder);
      } else {
        this._hideOrder();
      }
    }, ['selectedOrder']);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    this.innerHTML = html`
      <div class="order-detail-overlay" id="orderDetailOverlay">
        <div class="order-detail" role="dialog" aria-modal="true" aria-labelledby="orderDetailTitle">
          <div class="order-detail-header">
            <div class="order-detail-title" id="orderDetailTitle">سفارش</div>
            <button class="btn-icon order-detail-close modal-close" id="orderDetailClose" title="بستن" aria-label="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="order-detail-meta" id="orderDetailMeta"></div>
          <div class="order-detail-section">
            <div class="order-detail-section-title">وضعیت سفارش</div>
            <div class="order-detail-chips" id="orderStatusChips">
              <button type="button" class="order-detail-chip" data-status="new">جدید</button>
              <button type="button" class="order-detail-chip" data-status="preparing">در حال آماده‌سازی</button>
              <button type="button" class="order-detail-chip" data-status="done">انجام شده</button>
            </div>
          </div>
          <div class="order-detail-section">
            <div class="order-detail-section-title">اطلاعات مشتری</div>
            <label class="order-detail-field">
              <span>نام مشتری</span>
              <input type="text" id="orderCustomerName" maxlength="200" autocomplete="off">
            </label>
            <label class="order-detail-field">
              <span>یادداشت</span>
              <textarea id="orderNote" maxlength="200" rows="2"></textarea>
            </label>
            <button type="button" class="btn btn-sm btn-primary" id="orderInfoSaveBtn">ذخیره اطلاعات</button>
          </div>
          <div class="order-detail-section order-detail-actions">
            <button type="button" class="btn btn-sm btn-ghost" id="orderPrintBtn">چاپ سفارش</button>
            <button type="button" class="btn btn-sm btn-ghost" id="orderCsvBtn">خروجی CSV</button>
          </div>
          <div class="order-detail-movies" id="orderDetailMovies"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _showOrder(order) {
    if (!order) return;

    const overlay = this.querySelector('#orderDetailOverlay');
    const title = this.querySelector('#orderDetailTitle');
    const meta = this.querySelector('#orderDetailMeta');
    const movies = this.querySelector('#orderDetailMovies');

    this._currentOrder = order;

    if (title) {
      title.textContent = `سفارش ${order.number}`;
    }

    if (meta) {
      meta.innerHTML = html`
        <div class="order-detail-stat">
          <span class="order-detail-stat-label">تاریخ ایجاد:</span>
          <span class="order-detail-stat-value">${this._formatDate(order.createdAt)}</span>
        </div>
        <div class="order-detail-stat">
          <span class="order-detail-stat-label">ایجاد شده توسط:</span>
          <span class="order-detail-stat-value">${order.createdBy}</span>
        </div>
        <div class="order-detail-stat">
          <span class="order-detail-stat-label">تعداد فیلم‌ها:</span>
          <span class="order-detail-stat-value">${order.movies.length}</span>
        </div>
      `;
    }

    // P6d E5 — workflow controls: active status chip + prefilled info fields
    const nameInput = this.querySelector('#orderCustomerName');
    const noteInput = this.querySelector('#orderNote');
    if (nameInput) nameInput.value = order.customerName || '';
    if (noteInput) noteInput.value = order.note || '';
    const activeStatus = order.status || 'done';
    this.querySelectorAll('#orderStatusChips [data-status]').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.status === activeStatus);
    });

    if (movies) {
      movies.innerHTML = order.movies.map(movie => html`
        <div class="order-detail-movie">
          <img
            class="order-detail-movie-poster"
            src="${movie.poster}"
            alt=""
            id="order-movie-poster-${hasId(movie) ? movie.id : 'unknown'}"
          />
          <div class="order-detail-movie-info">
            <div class="order-detail-movie-title">${movie.title}</div>
            <div class="order-detail-movie-meta">
              ${hasId(movie) ? raw(html`<span class="order-detail-movie-id">#${movie.id}</span>`) : ''}
              ${movie.year ? raw(html`<span>${movie.year}</span>`) : ''}
              ${movie.type ? raw(html`<span>${movie.type}</span>`) : ''}
            </div>
          </div>
        </div>
      `).join('');

      movies.querySelectorAll('.order-detail-movie-poster').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
      });
    }

    if (overlay) {
      overlay.classList.add('active');
    }
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this.querySelector('.order-detail'), {
        onClose: () => store.clearSelectedOrder()
      });
    }
  }

  _hideOrder() {
    const overlay = this.querySelector('#orderDetailOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
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
    const closeBtn = this.querySelector('#orderDetailClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        store.clearSelectedOrder();
      });
    }

    const overlay = this.querySelector('#orderDetailOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          store.clearSelectedOrder();
        }
      });
    }

    // P6d E5 — status chips send orders:update-status for the open order
    this.querySelectorAll('#orderStatusChips [data-status]').forEach(chip => {
      chip.addEventListener('click', () => {
        const order = this._currentOrder;
        if (!order) return;
        store.updateOrderStatus(order.id, chip.dataset.status);
        this.querySelectorAll('#orderStatusChips [data-status]').forEach(c => {
          c.classList.toggle('active', c === chip);
        });
      });
    });

    const saveInfoBtn = this.querySelector('#orderInfoSaveBtn');
    if (saveInfoBtn) {
      saveInfoBtn.addEventListener('click', () => {
        const order = this._currentOrder;
        if (!order) return;
        const nameInput = this.querySelector('#orderCustomerName');
        const noteInput = this.querySelector('#orderNote');
        store.editOrderInfo(order.id, {
          customerName: nameInput ? nameInput.value : '',
          note: noteInput ? noteInput.value : ''
        });
      });
    }

    const printBtn = this.querySelector('#orderPrintBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (this._currentOrder) store.printOrder(this._currentOrder);
      });
    }

    const csvBtn = this.querySelector('#orderCsvBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        if (this._currentOrder) store.exportOrderCsv(this._currentOrder);
      });
    }
  }
}

customElements.define('order-card', OrderCard);
