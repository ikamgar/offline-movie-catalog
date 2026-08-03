/**
 * FloatingSelection Component
 * Floating bar showing selection count with quick actions
 */

import { store, showToast } from '../store.js';

class FloatingSelection extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      this._update(state.selectedMovies.length);
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    const count = store.state.selectedMovies.length;
    this.innerHTML = `
      <div class="floating-selection ${count ? '' : 'hidden'}" id="floatingBar">
        <span class="floating-selection-count">${count} فیلم انتخاب شده</span>
        <span class="floating-selection-divider"></span>
        <button class="btn btn-sm btn-ghost" id="floatCopy" title="کپی شناسه‌ها">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
          کپی شناسه‌ها
        </button>
        <button class="btn btn-sm btn-ghost" id="floatShowPanel" title="نمایش پنل انتخاب">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
          نمایش پنل
        </button>
      </div>
    `;

    this.querySelector('#floatCopy')?.addEventListener('click', () => store.copySelectedIds());
    this.querySelector('#floatShowPanel')?.addEventListener('click', () => store.toggleSelectionSidebar());
  }

  _update(count) {
    const bar = this.querySelector('#floatingBar');
    if (bar) {
      bar.classList.toggle('hidden', !count);
      const countEl = bar.querySelector('.floating-selection-count');
      if (countEl) countEl.textContent = `${count} فیلم انتخاب شده`;
    }
  }
}

customElements.define('floating-selection', FloatingSelection);
