/**
 * AdminPanel Component
 *
 * Panel for admins to view and manage customer selection and orders.
 */

import { store, showToast } from '../store.js';
import { html, raw } from '../utils/html.js';
import { api, apiPost } from '../utils/api.js';
import { hasId } from '../utils/helpers.js';
import { trapFocus } from '../utils/dialog.js';
import './order-panel.js';
import './order-card.js';

class AdminPanel extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._lastListSig = null;
    this._releaseFocus = null;
    this._wasAdmin = false;
    // P6b E3: the edit modal announces deletions → reload the trash list
    this._onTrashChanged = () => this._loadTrash();
    // P6c E4: the newest trash entries (for game-aware restore wording)
    this._trashEntries = [];
  }

  connectedCallback() {
    this.render();
    this._wasAdmin = store.state.role === 'admin';
    if (this._wasAdmin) this._loadTrash(); // restored session (no role transition)
    document.addEventListener('trash-changed', this._onTrashChanged);
    this._unsubscribe = store.subscribe((state) => {
      this._updatePanel(state);
    }, ['adminSelection', 'adminSelectionUpdatedAt', 'isAdminConnected', 'role', 'mediaMode']);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    document.removeEventListener('trash-changed', this._onTrashChanged);
    this._lastListSig = null;
  }

  render() {
    const { adminSelection, adminSelectionUpdatedAt, isAdminConnected } = store.state;
    const count = adminSelection.length;
    const time = this._formatTime(adminSelectionUpdatedAt);

    this.innerHTML = html`
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
            <span class="admin-stat-label">انتخاب شده</span>
            <span class="admin-stat-value" id="selectionCount">${count}</span>
          </div>
          <div class="admin-stat">
            <span class="admin-stat-label">آخرین بروزرسانی</span>
            <span class="admin-stat-value admin-stat-time" id="lastUpdate">${time}</span>
          </div>
        </div>

        <div class="admin-panel-actions">
          <button class="btn btn-primary btn-sm" id="saveOrderBtn" ${count ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            ذخیره سفارش
          </button>
          <button class="btn btn-danger btn-sm" id="clearBtn" ${count ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            پاک کردن
          </button>
        </div>

        <div class="admin-panel-add-movie">
          <button class="btn btn-secondary btn-sm btn-full" id="addMovieBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span id="addMovieBtnLabel">${store.state.mediaMode === 'games' ? 'افزودن بازی' : 'افزودن فیلم'}</span>
          </button>
          <button class="btn btn-ghost btn-sm btn-full" id="changePasswordBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            تغییر رمز عبور
          </button>
        </div>

        <div class="admin-panel-list" id="selectionList">
          ${raw(this._renderList(adminSelection))}
        </div>

        <div class="admin-panel-divider"></div>

        <div class="admin-trash">
          <div class="admin-trash-header">سطل زباله</div>
          <div class="admin-trash-list" id="trashList"></div>
        </div>

        <order-panel></order-panel>
      </div>

      <order-card></order-card>

      <div class="change-password-overlay" id="changePasswordOverlay" style="display:none">
        <div class="change-password-dialog" role="dialog" aria-modal="true" aria-labelledby="changePasswordTitle">
          <div class="change-password-header">
            <span id="changePasswordTitle">تغییر رمز عبور</span>
            <button class="btn-icon modal-close" id="changePasswordClose" title="بستن" aria-label="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form id="changePasswordForm">
            <div class="change-password-field">
              <label for="currentPassword">رمز عبور فعلی</label>
              <input type="password" id="currentPassword" required autocomplete="current-password" placeholder="••••••">
            </div>
            <div class="change-password-field">
              <label for="newPassword">رمز عبور جدید</label>
              <input type="password" id="newPassword" required autocomplete="new-password" placeholder="••••••" minlength="8">
            </div>
            <div class="change-password-field">
              <label for="confirmNewPassword">تکرار رمز عبور جدید</label>
              <input type="password" id="confirmNewPassword" required autocomplete="new-password" placeholder="••••••" minlength="8">
            </div>
            <div class="change-password-actions">
              <button type="button" class="btn btn-ghost btn-sm" id="changePasswordCancel">انصراف</button>
              <button type="submit" class="btn btn-primary btn-sm" id="changePasswordSubmit">ذخیره</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._lastListSig = adminSelection.map(m => m.uid).join('|');
    this._bindEvents();
  }

  _openChangePassword() {
    const overlay = this.querySelector('#changePasswordOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this.querySelector('.change-password-dialog'), {
        onClose: () => this._closeChangePassword()
      });
    }
  }

  _closeChangePassword() {
    const overlay = this.querySelector('#changePasswordOverlay');
    if (overlay) overlay.style.display = 'none';
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
  }

  _renderList(movies) {
    if (!movies.length) {
      return html`
        <div class="admin-empty">
          <div class="admin-empty-icon">📋</div>
          <div class="admin-empty-text">
            هنوز آیتمی انتخاب نشده است.<br>
            مشتری در حال انتخاب است.
          </div>
        </div>
      `;
    }

    return movies.map(m => {
      const isGame = m.type === 'Game';
      return html`
      <div class="admin-selection-item" data-uid="${m.uid}">
        <img
          class="admin-selection-poster"
          src="${m.poster}"
          alt=""
          id="admin-poster-${m.uid}"
        />
        <div class="admin-selection-info">
          <div class="admin-selection-title" title="${m.title}">${m.title}</div>
          <div class="admin-selection-meta">
            ${isGame
              ? (m.platforms || []).join(' • ')
              : `${m.year ? `${m.year}` : ''} ${m.type ? ` • ${m.type}` : ''}`
            }
          </div>
        </div>
        ${hasId(m) ? raw(html`<div class="admin-selection-id">#${m.id}</div>`) : ''}
      </div>
    `;}).join('');
  }

  // ─── P6b E3: trash (سطل زباله) ────────────────────────────────────────────

  _renderTrash(entries) {
    if (!entries.length) {
      return html`<div class="admin-trash-empty">سطل زباله خالی است.</div>`;
    }
    return entries.map((e) => html`
      <div class="admin-trash-item" data-id="${e.id}">
        <div class="admin-trash-info">
          <div class="admin-trash-title" title="${e.title || ''}">${e.title || ''}</div>
          <div class="admin-trash-meta">${this._formatTrashDate(e.deletedAt)} • ${e.originalPaths ? e.originalPaths.length : 0} فایل</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="restore">بازگردانی</button>
      </div>
    `).join('');
  }

  _formatTrashDate(timestamp) {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleDateString('fa-IR');
    } catch {
      return '—';
    }
  }

  async _loadTrash() {
    try {
      const resp = await api('/api/trash');
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data || !Array.isArray(data.entries)) return;
      // Newest first by deletion time (id desc is only a tiebreak — ids are
      // Date.now()-based for real deletions but arbitrary in the log)
      const entries = data.entries.slice().sort((a, b) =>
        (Date.parse(b.deletedAt) || 0) - (Date.parse(a.deletedAt) || 0) ||
        (Number(b.id) - Number(a.id)));
      this._trashEntries = entries; // P6c E4: restore needs the entry's type
      const list = this.querySelector('#trashList');
      if (list) list.innerHTML = this._renderTrash(entries);
    } catch { /* offline or 401 — keep the previous list */ }
  }

  _updatePanel(state) {
    const { adminSelection, adminSelectionUpdatedAt, isAdminConnected } = state;

    // P6b E3: trash list loads on the customer→admin role transition
    const isAdmin = state.role === 'admin';
    if (isAdmin && !this._wasAdmin) this._loadTrash();
    this._wasAdmin = isAdmin;

    const selectionList = this.querySelector('#selectionList');
    if (selectionList) {
      const sig = adminSelection.map(m => m.uid).join('|');
      if (sig !== this._lastListSig) {
        this._lastListSig = sig;
        selectionList.innerHTML = this._renderList(adminSelection);
      }
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

    // P6c E4: the add button follows the media mode («افزودن بازی» in games)
    const addLabel = this.querySelector('#addMovieBtnLabel');
    if (addLabel) {
      const wanted = state.mediaMode === 'games' ? 'افزودن بازی' : 'افزودن فیلم';
      if (addLabel.textContent !== wanted) addLabel.textContent = wanted;
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
    this.querySelectorAll('.admin-selection-poster').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    this.querySelector('#saveOrderBtn')?.addEventListener('click', () => {
      const { adminSelection } = store.state;
      if (!adminSelection.length) {
        showToast('ابتدا فیلم‌هایی را انتخاب کنید', 'warning');
        return;
      }

      const modal = document.getElementById('confirmModal');
      if (modal && typeof modal.show === 'function') {
        modal.show(
          `آیا مطمئن هستید که می‌خواهید این سفارش را ذخیره کنید؟\n\nآیتم‌های انتخاب شده: ${adminSelection.length}`,
          'ذخیره سفارش',
          () => {
            store.saveAdminSelectionAsOrder();
          }
        );
      } else {
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
        console.warn('[ADMIN] Confirm modal not found, clearing directly');
        store.clearAdminSelection();
      }
    });

    this.querySelector('#addMovieBtn')?.addEventListener('click', () => {
      const addModal = document.getElementById('addModal');
      if (addModal && typeof addModal.show === 'function') {
        addModal.show();
      } else {
        showToast('خطا: مودال افزودن فیلم یافت نشد', 'error');
      }
    });

    // ─── Change password dialog ──────────────────────────────────────────
    this.querySelector('#changePasswordBtn')?.addEventListener('click', () => this._openChangePassword());
    this.querySelector('#changePasswordClose')?.addEventListener('click', () => this._closeChangePassword());
    this.querySelector('#changePasswordCancel')?.addEventListener('click', () => this._closeChangePassword());

    this.querySelector('#changePasswordOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'changePasswordOverlay') {
        this._closeChangePassword();
      }
    });

    this.querySelector('#changePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = this.querySelector('#currentPassword')?.value;
      const pw = this.querySelector('#newPassword')?.value;
      const confirm = this.querySelector('#confirmNewPassword')?.value;

      if (!current || !pw) {
        showToast('لطفاً تمام فیلدها را پر کنید', 'error');
        return;
      }
      if (pw.length < 8) {
        showToast('رمز عبور جدید باید حداقل ۸ کاراکتر باشد', 'error');
        return;
      }
      if (pw !== confirm) {
        showToast('رمز عبور جدید و تکرار آن مطابقت ندارند', 'error');
        return;
      }

      try {
        const result = await apiPost('/api/auth/change-password', {
          currentPassword: current,
          newPassword: pw
        });
        if (result.success) {
          showToast('رمز عبور با موفقیت تغییر کرد', 'success');
          this._closeChangePassword();
          this.querySelector('#changePasswordForm').reset();
        } else {
          showToast(result.error || 'خطا در تغییر رمز عبور', 'error');
        }
      } catch {
        showToast('خطا در اتصال به سرور', 'error');
      }
    });

    // ─── P6b E3: restore from trash (delegated — the list re-renders) ─────
    this.querySelector('#trashList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="restore"]');
      if (!btn) return;
      const row = btn.closest('.admin-trash-item');
      const id = row ? row.getAttribute('data-id') : null;
      if (!id) return;
      // P6c E4: game entries get game wording and refresh the games grid
      const entry = (this._trashEntries || []).find(x => String(x.id) === String(id));
      const isGameEntry = !!entry && entry.type === 'Game';
      btn.disabled = true;
      try {
        const resp = await api(`/api/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' });
        let data = {};
        try { data = await resp.json(); } catch {}
        if (resp.ok && data.success) {
          showToast(isGameEntry
            ? 'بازی به کتابخانه بازگردانده شد'
            : 'فیلم به کتابخانه بازگردانده شد', 'success');
          await this._loadTrash();
          await store.loadCatalog();
          if (isGameEntry) await store.fetchGames();
        } else {
          btn.disabled = false;
          showToast((data && data.error) ||
            (isGameEntry ? 'بازگردانی بازی ناموفق بود' : 'بازگردانی فیلم ناموفق بود'), 'error');
        }
      } catch {
        btn.disabled = false;
        showToast('خطا در اتصال به سرور', 'error');
      }
    });
  }
}

customElements.define('admin-panel', AdminPanel);
