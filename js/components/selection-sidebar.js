/**
 * SelectionSidebar Component
 * Selected Movies Queue — clean, minimal, ID-first design
 */

import { store, showToast } from '../store.js';
import { html, raw } from '../utils/html.js';

class SelectionSidebar extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._lastListSig = null;
    this._lastMediaMode = null;
  }

  connectedCallback() {
    this._lastMediaMode = store.state.mediaMode;
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      if (state.mediaMode !== this._lastMediaMode) {
        this._lastMediaMode = state.mediaMode;
        this._lastListSig = null;
        this.render();
        return;
      }
      this._updateList(state.selectedMovies);
      this._updateCount(state.selectedMovies.length);
    }, ['mediaMode', 'selectedMovies']);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    this._lastListSig = null;
  }

  render() {
    const { selectedMovies } = store.state;

    this.innerHTML = html`
      <div class="selection-header">
        <div class="selection-title">
          انتخاب‌شده‌ها
          <span class="selection-count-badge" id="selectionCount">${selectedMovies.length}</span>
        </div>
        <button class="btn-icon" id="closeSelection" title="بستن پنل" aria-label="بستن پنل">
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
        ${raw(this._renderList(selectedMovies))}
      </div>
    `;

    this._lastListSig = selectedMovies.map(m => m.uid).join('|');
    this._bindEvents();
  }

  _renderList(movies) {
    if (!movies.length) {
      const isGames = store.state.mediaMode === 'games';
      return html`
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
      return html`
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
          id="sel-poster-${m.uid}"
        />
        <div class="selection-item-info">
          <div class="selection-item-title" title="${m.title}">${m.title}</div>
          ${isGame
            ? raw(html`<div class="selection-item-platforms">${raw((m.platforms || []).map(p => html`<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`).join(' '))}</div>`)
            : raw(m.year ? html`<div class="selection-item-year">${m.year}</div>` : '')
          }
        </div>
        ${!isGame && m.id !== null ? raw(html`<div class="selection-item-id">#${m.id}</div>`) : ''}
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
      const uid = item.dataset.uid;

      item.classList.add('removing');
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        store.deselect(uid);
      };
      item.addEventListener('animationend', finish, { once: true });
      // Timeout fallback — removal must not depend solely on animationend (C6)
      setTimeout(finish, 400);
    });

    this.querySelectorAll('.selection-item-poster').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    });
  }

  _updateList(movies) {
    const sig = movies.map(m => m.uid).join('|');
    if (sig === this._lastListSig) return;
    this._lastListSig = sig;

    const list = this.querySelector('#selectionList');
    if (list) list.innerHTML = this._renderList(movies);

    const actions = this.querySelector('#selectionActions');
    if (actions) actions.style.display = movies.length ? '' : 'none';

    this.querySelectorAll('.selection-item-poster').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    });
  }

  _updateCount(count) {
    const badge = this.querySelector('#selectionCount');
    if (badge) badge.textContent = count;
  }
}

customElements.define('selection-sidebar', SelectionSidebar);
