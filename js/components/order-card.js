/**
 * OrderCard Component
 *
 * Displays order details in a modal/overlay view.
 * Shows complete movie list for a selected order.
 *
 * Features:
 *   - Order header with number and metadata
 *   - Complete movie list with posters
 *   - Read-only view
 *   - Close button to return to admin panel
 */

import { store } from '../store.js';

class OrderCard extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      if (state.selectedOrder) {
        this._showOrder(state.selectedOrder);
      } else {
        this._hideOrder();
      }
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    this.innerHTML = `
      <div class="order-detail-overlay" id="orderDetailOverlay">
        <div class="order-detail">
          <div class="order-detail-header">
            <div class="order-detail-title" id="orderDetailTitle">سفارش</div>
            <button class="btn-icon order-detail-close" id="orderDetailClose" title="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="order-detail-meta" id="orderDetailMeta"></div>
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

    if (title) {
      title.textContent = `سفارش ${order.number}`;
    }

    if (meta) {
      meta.innerHTML = `
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

    if (movies) {
      movies.innerHTML = order.movies.map(movie => `
        <div class="order-detail-movie">
          <img
            class="order-detail-movie-poster"
            src="${movie.poster}"
            alt=""
            onerror="this.style.display='none'"
          />
          <div class="order-detail-movie-info">
            <div class="order-detail-movie-title">${movie.title}</div>
            <div class="order-detail-movie-meta">
              ${movie.id ? `<span class="order-detail-movie-id">#${movie.id}</span>` : ''}
              ${movie.year ? `<span>${movie.year}</span>` : ''}
              ${movie.type ? `<span>${movie.type}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');
    }

    if (overlay) {
      overlay.classList.add('active');
    }
  }

  _hideOrder() {
    const overlay = this.querySelector('#orderDetailOverlay');
    if (overlay) {
      overlay.classList.remove('active');
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
  }
}

customElements.define('order-card', OrderCard);
