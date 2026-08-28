/**
 * SelectionSidebar Component
 * Selected Movies Queue — clean, minimal, ID-first design
 */

import { store, showToast } from '../store.js';

class SelectionSidebar extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._prevMediaMode = store.state.mediaMode;
    this._unsubscribe = store.subscribe((state) => {
      const mediaModeChanged = state.mediaMode !== this._prevMediaMode;
      this._prevMediaMode = state.mediaMode;
      if (mediaModeChanged) {
        this.render();
      } else {
        this._updateList(state.selectedMovies);
        this._updateCount(state.selectedMovies.length);
      }
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    const { selectedMovies } = store.state;

    this.innerHTML = `
      <div class="selection-header">
        <div class="selection-title">
          انتخاب‌شده‌ها
          <span class="selection-count-badge" id="selectionCount">${selectedMovies.length}</span>
        </div>
        <button class="btn-icon" id="closeSelection" title="بستن پنل">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
      <div class="selection-actions" id="selectionActions" style="${selectedMovies.length ? '' : 'display:none'}">
        <button class="btn btn-danger btn-sm" id="clearAll" title="پاک کردن لیست">
          پاک کردن لیست
        </button>
      </div>
      <div class="selection-list" id="selectionList">
        ${this._renderList(selectedMovies)}
      </div>
    `;

    this._bindEvents();
  }

  _renderList(movies) {
    if (!movies.length) {
      const isGames = store.state.mediaMode === 'games';
      return `
        <div class="selection-empty">
          <div class="selection-empty-icon">${isGames ? '🎮' : '📋'}</div>
          <div class="selection-empty-text">
            هنوز ${isGames ? 'بازی' : 'فیلمی'} انتخاب نشده است.<br>
            برای افزودن ${isGames ? 'بازی' : 'فیلم'}، روی دکمه «افزودن» در کارت ${isGames ? 'بازی' : 'فیلم'} کلیک کنید.
          </div>
        </div>
      `;
    }

    return movies.map(m => {
      const isGame = m.type === 'Game';
      return `
      <div class="selection-item" data-uid="${m.uid}">
        <button class="selection-item-remove" data-action="remove" title="حذف">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
        <img
          class="selection-item-poster"
          src="${m.poster}"
          alt=""
          onerror="this.style.display='none'"
        />
        <div class="selection-item-info">
          <div class="selection-item-title" title="${m.title}">${m.title}</div>
          ${isGame
            ? `<div class="selection-item-platforms">${(m.platforms || []).map(p => `<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`).join(' ')}</div>`
            : `${m.year ? `<div class="selection-item-year">${m.year}</div>` : ''}`
          }
        </div>
        ${!isGame && m.id !== null ? `<div class="selection-item-id">#${m.id}</div>` : ''}
      </div>
    `;}).join('');
  }

  _bindEvents() {
    this.querySelector('#clearAll')?.addEventListener('click', () => {
      store.clearSelection();
      showToast('لیست پاک شد', 'info');
    });
    this.querySelector('#closeSelection')?.addEventListener('click', () => {
      store.toggleSelectionSidebar();
    });

    this.querySelector('#selectionList')?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-action="remove"]');
      if (!removeBtn) return;
      const item = removeBtn.closest('.selection-item');
      const uid = item.dataset.uid; // Canonical identity — never null

      item.classList.add('removing');
      item.addEventListener('animationend', () => {
        store.deselect(uid);
      }, { once: true });
    });
  }

  _updateList(movies) {
    const list = this.querySelector('#selectionList');
    if (list) list.innerHTML = this._renderList(movies);

    const actions = this.querySelector('#selectionActions');
    if (actions) actions.style.display = movies.length ? '' : 'none';
  }

  _updateCount(count) {
    const badge = this.querySelector('#selectionCount');
    if (badge) badge.textContent = count;
  }
}

customElements.define('selection-sidebar', SelectionSidebar);
