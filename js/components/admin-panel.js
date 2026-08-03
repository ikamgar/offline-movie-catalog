/**
 * AdminPanel Component
 *
 * Panel for admins to view and manage customer selection and orders.
 * Replaces the Selection Sidebar when in admin mode.
 *
 * Features:
 *   - Shows customer's realtime selection
 *   - Shows number of selected movies
 *   - Shows last update time
 *   - Save Selection button
 *   - Save Order button (persistent)
 *   - Clear Customer Selection button
 *   - Saved Orders section
 *
 * IMPORTANT: This panel never modifies cards directly.
 * It only sends commands to the server.
 */

import { store, showToast } from '../store.js';
import './order-panel.js';
import './order-card.js';

class AdminPanel extends HTMLElement {
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
    const { adminSelection, adminSelectionUpdatedAt, isAdminConnected } = store.state;

    this.innerHTML = `
      <div class="admin-panel">
        <div class="admin-panel-header">
          <div class="admin-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            پنل مدیر
          </div>
          <div class="admin-connection-status ${isAdminConnected ? 'connected' : 'disconnected'}">
            <span class="status-dot"></span>
            <span>${isAdminConnected ? 'متصل' : 'قطع'}</span>
          </div>
        </div>

        <div class="admin-panel-stats">
          <div class="admin-stat">
            <span class="admin-stat-label">فیلم‌های انتخاب شده:</span>
            <span class="admin-stat-value" id="selectionCount">${adminSelection.length}</span>
          </div>
          <div class="admin-stat">
            <span class="admin-stat-label">آخرین بروزرسانی:</span>
            <span class="admin-stat-value" id="lastUpdate">${this._formatTime(adminSelectionUpdatedAt)}</span>
          </div>
        </div>

        <div class="admin-panel-actions">
          <button class="btn btn-primary btn-sm" id="saveOrderBtn" ${adminSelection.length ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            ذخیره سفارش
          </button>
          <button class="btn btn-danger btn-sm" id="clearBtn" ${adminSelection.length ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            پاک کردن انتخاب
          </button>
        </div>

        <div class="admin-panel-add-movie">
          <button class="btn btn-secondary btn-sm btn-full" id="addMovieBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            افزودن فیلم جدید
          </button>
        </div>

        <div class="admin-panel-list" id="selectionList">
          ${this._renderList(adminSelection)}
        </div>

        <div class="admin-panel-divider"></div>

        <order-panel></order-panel>
      </div>

      <order-card></order-card>
    `;

    this._bindEvents();
    this._applyStyles();
  }

  _applyStyles() {
    const style = document.createElement('style');
    style.textContent = `
      admin-panel {
        width: 320px;
        min-width: 320px;
        background: var(--color-bg-secondary);
        border-inline-start: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      admin-panel.hidden {
        display: none;
      }
      .admin-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
      }
      .admin-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-4);
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-bg-tertiary);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .admin-panel-title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      .admin-connection-status {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }
      .admin-connection-status .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .admin-connection-status.connected .status-dot {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
      }
      .admin-connection-status.disconnected .status-dot {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
      }
      .admin-panel-stats {
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border-primary);
      }
      .admin-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }
      .admin-stat:last-child {
        margin-bottom: 0;
      }
      .admin-stat-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .admin-stat-value {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
      }
      .admin-panel-actions {
        display: flex;
        gap: var(--space-2);
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border-primary);
      }
      .admin-panel-actions .btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        font-size: var(--font-size-xs);
        transition: all var(--transition-fast);
      }
      .admin-panel-actions .btn-primary:hover {
        opacity: 0.9;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(91, 127, 255, 0.4);
      }
      .admin-panel-actions .btn-danger:hover {
        opacity: 0.9;
      }
      .admin-panel-add-movie {
        padding: var(--space-2) var(--space-4) var(--space-4);
        border-bottom: 1px solid var(--color-border-primary);
      }
      .admin-panel-add-movie .btn-full {
        width: 100%;
      }
      .admin-panel-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-2);
        min-height: 100px;
        max-height: 300px;
      }
      .admin-panel-divider {
        height: 1px;
        background: var(--color-border-primary);
      }
      .admin-selection-item {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        transition: background var(--transition-base);
      }
      .admin-selection-item:hover {
        background: var(--color-bg-tertiary);
      }
      .admin-selection-poster {
        width: 40px;
        height: 60px;
        object-fit: cover;
        border-radius: var(--radius-sm);
        background: var(--color-poster-bg);
      }
      .admin-selection-info {
        flex: 1;
        min-width: 0;
      }
      .admin-selection-title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-selection-meta {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }
      .admin-selection-id {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-accent-primary);
        white-space: nowrap;
      }
      .admin-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8) var(--space-4);
        text-align: center;
      }
      .admin-empty-icon {
        font-size: 2rem;
        margin-bottom: var(--space-3);
        opacity: 0.5;
      }
      .admin-empty-text {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        line-height: 1.6;
      }

      /* Order Panel Styles */
      order-panel {
        display: block;
        flex: 1;
      }
      .order-panel {
        display: flex;
        flex-direction: column;
      }
      .order-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3) var(--space-4);
        background: var(--color-bg-tertiary);
      }
      .order-panel-title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      .order-count-badge {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-bold);
        background: var(--gradient-accent);
        color: white;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        min-width: 20px;
        text-align: center;
      }
      .order-panel-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-2);
      }
      .order-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-6) var(--space-4);
        text-align: center;
      }
      .order-empty-icon {
        font-size: 1.5rem;
        margin-bottom: var(--space-2);
        opacity: 0.5;
      }
      .order-empty-text {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        line-height: 1.5;
      }
      .order-card {
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        margin-bottom: var(--space-2);
        transition: all var(--transition-base);
      }
      .order-card:hover {
        border-color: var(--color-border-secondary);
      }
      .order-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }
      .order-card-number {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      .order-card-date {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }
      .order-card-meta {
        margin-bottom: var(--space-2);
      }
      .order-card-info {
        display: flex;
        gap: var(--space-3);
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }
      .order-card-movie-count,
      .order-card-creator {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .order-card-actions {
        display: flex;
        gap: var(--space-2);
        justify-content: flex-end;
      }
      .order-card-actions .btn {
        padding: var(--space-1) var(--space-2);
        font-size: var(--font-size-xs);
        height: 28px;
        transition: all var(--transition-fast);
      }
      .order-card-actions .btn-ghost:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
      }
      .order-card-actions .btn-danger:hover {
        opacity: 0.9;
      }

      /* Order Detail Overlay */
      order-detail {
        display: none;
      }
      .order-detail-overlay {
        position: fixed;
        inset: 0;
        background: var(--color-bg-overlay);
        z-index: var(--z-modal);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-6);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--transition-base);
      }
      .order-detail-overlay.active {
        opacity: 1;
        pointer-events: auto;
      }
      .order-detail {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-xl);
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        animation: modalIn 0.3s ease;
      }
      @keyframes modalIn {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .order-detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border-primary);
        position: sticky;
        top: 0;
        background: var(--color-bg-secondary);
        z-index: 10;
      }
      .order-detail-title {
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      .order-detail-close {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-full);
        background: var(--color-bg-tertiary);
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);
      }
      .order-detail-close:hover {
        background: var(--color-accent-danger);
        color: white;
      }
      .order-detail-meta {
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .order-detail-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .order-detail-stat-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .order-detail-stat-value {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
      }
      .order-detail-movies {
        padding: var(--space-3);
      }
      .order-detail-movie {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        transition: background var(--transition-base);
      }
      .order-detail-movie:hover {
        background: var(--color-bg-tertiary);
      }
      .order-detail-movie-poster {
        width: 40px;
        height: 60px;
        object-fit: cover;
        border-radius: var(--radius-sm);
        background: var(--color-poster-bg);
      }
      .order-detail-movie-info {
        flex: 1;
        min-width: 0;
      }
      .order-detail-movie-title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .order-detail-movie-meta {
        display: flex;
        gap: var(--space-2);
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }
      .order-detail-movie-id {
        font-weight: var(--font-weight-medium);
        color: var(--color-accent-primary);
      }

      /* Confirmation Modal Styles */
      confirm-modal {
        display: none;
      }
      confirm-modal.open {
        display: block;
      }
      confirm-modal .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
      }
      confirm-modal .modal-dialog {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-xl);
        width: 90%;
        max-width: 400px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: modalIn 0.3s ease;
      }
      confirm-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border-primary);
      }
      confirm-modal .modal-header h3 {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      confirm-modal .modal-body {
        padding: var(--space-5);
      }
      confirm-modal .confirm-message {
        margin: 0 0 var(--space-6) 0;
        font-size: var(--font-size-base);
        color: var(--color-text-secondary);
        line-height: 1.6;
        white-space: pre-line;
      }
      confirm-modal .form-actions {
        display: flex;
        gap: var(--space-3);
        justify-content: flex-end;
      }
      confirm-modal .btn {
        padding: var(--space-2) var(--space-5);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: all var(--transition-base);
      }
      confirm-modal .btn-ghost {
        background: transparent;
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
      }
      confirm-modal .btn-ghost:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
      }
      confirm-modal .btn-danger {
        background: var(--color-accent-danger);
        border: 1px solid var(--color-accent-danger);
        color: white;
      }
      confirm-modal .btn-danger:hover {
        opacity: 0.9;
      }
    `;
    document.head.appendChild(style);
  }

  _renderList(movies) {
    if (!movies.length) {
      return `
        <div class="admin-empty">
          <div class="admin-empty-icon">📋</div>
          <div class="admin-empty-text">
            هنوز فیلمی انتخاب نشده است.<br>
            مشتری در حال انتخاب فیلم است.
          </div>
        </div>
      `;
    }

    return movies.map(m => `
      <div class="admin-selection-item" data-uid="${m.uid}">
        <img
          class="admin-selection-poster"
          src="${m.poster}"
          alt=""
          onerror="this.style.display='none'"
        />
        <div class="admin-selection-info">
          <div class="admin-selection-title" title="${m.title}">${m.title}</div>
          <div class="admin-selection-meta">
            ${m.year ? `${m.year}` : ''}
            ${m.type ? ` • ${m.type}` : ''}
          </div>
        </div>
        ${m.id !== null ? `<div class="admin-selection-id">#${m.id}</div>` : ''}
      </div>
    `).join('');
  }

  _updatePanel(state) {
    const { adminSelection, adminSelectionUpdatedAt, isAdminConnected } = state;

    const selectionList = this.querySelector('#selectionList');
    if (selectionList) {
      selectionList.innerHTML = this._renderList(adminSelection);
    }

    const countEl = this.querySelector('#selectionCount');
    if (countEl) {
      countEl.textContent = adminSelection.length;
    }

    const lastUpdateEl = this.querySelector('#lastUpdate');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = this._formatTime(adminSelectionUpdatedAt);
    }

    const saveOrderBtn = this.querySelector('#saveOrderBtn');
    const clearBtn = this.querySelector('#clearBtn');
    if (saveOrderBtn) saveOrderBtn.disabled = !adminSelection.length;
    if (clearBtn) clearBtn.disabled = !adminSelection.length;

    const statusEl = this.querySelector('.admin-connection-status');
    if (statusEl) {
      statusEl.className = `admin-connection-status ${isAdminConnected ? 'connected' : 'disconnected'}`;
      const textEl = statusEl.querySelector('span:last-child');
      if (textEl) textEl.textContent = isAdminConnected ? 'متصل' : 'قطع';
    }
  }

  _formatTime(timestamp) {
    if (!timestamp) return '—';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  }

  _bindEvents() {
    this.querySelector('#saveOrderBtn')?.addEventListener('click', () => {
      const { adminSelection } = store.state;
      if (!adminSelection.length) {
        showToast('ابتدا فیلم‌هایی را انتخاب کنید', 'warning');
        return;
      }

      const modal = document.getElementById('confirmModal');
      if (modal && typeof modal.show === 'function') {
        modal.show(
          `آیا مطمئن هستید که می‌خواهید این سفارش را ذخیره کنید؟\n\nفیلم‌های انتخاب شده: ${adminSelection.length}`,
          'ذخیره سفارش',
          () => {
            store.saveAdminSelectionAsOrder();
          }
        );
      } else {
        // Fallback: if modal not found, save directly
        console.warn('[ADMIN] Confirm modal not found, saving directly');
        store.saveAdminSelectionAsOrder();
      }
    });

    this.querySelector('#clearBtn')?.addEventListener('click', () => {
      const { adminSelection } = store.state;
      if (!adminSelection.length) {
        showToast('انتخابی برای پاک کردن وجود ندارد', 'warning');
        return;
      }

      const modal = document.getElementById('confirmModal');
      if (modal && typeof modal.show === 'function') {
        modal.show(
          'آیا مطمئن هستید که می‌خواهید انتخاب فعلی مشتری را پاک کنید؟',
          'پاک کردن انتخاب',
          () => {
            store.clearAdminSelection();
          }
        );
      } else {
        // Fallback: if modal not found, clear directly
        console.warn('[ADMIN] Confirm modal not found, clearing directly');
        store.clearAdminSelection();
      }
    });

    // Add Movie button
    this.querySelector('#addMovieBtn')?.addEventListener('click', () => {
      const addModal = document.getElementById('addModal');
      if (addModal && typeof addModal.show === 'function') {
        addModal.show();
      } else {
        showToast('خطا: مودال افزودن فیلم یافت نشد', 'error');
      }
    });
  }
}

customElements.define('admin-panel', AdminPanel);
