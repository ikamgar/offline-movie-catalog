/**
 * SearchBar Component
 * Instant search with keyboard shortcut support
 */

import { store } from '../store.js';
import { debounce } from '../utils/helpers.js';

class SearchBar extends HTMLElement {
  constructor() {
    super();
    this._debouncedSearch = debounce((q) => store.setSearch(q), 150);
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
    this._updatePlaceholder();
    this._unsubscribeMediaMode = store.subscribe((state) => {
      this._updatePlaceholder();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribeMediaMode) this._unsubscribeMediaMode();
  }

  _updatePlaceholder() {
    const input = this.querySelector('.search-input');
    if (!input) return;
    const isGames = store.state.mediaMode === 'games';
    input.placeholder = isGames
      ? 'جستجو بر اساس نام بازی یا پلتفرم...'
      : 'جستجو بر اساس نام، شناسه، سال یا ژانر...';
    input.setAttribute('aria-label', isGames ? 'جستجوی بازی' : 'جستجوی فیلم');
  }

  render() {
    this.innerHTML = `
      <div class="search-container">
        <div class="search-input-wrapper">
          <span class="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            type="text"
            class="search-input"
            placeholder="جستجو بر اساس نام، شناسه، سال یا ژانر..."
            aria-label="جستجوی فیلم"
          />
          <span class="search-shortcut" id="searchShortcut">/</span>
          <button class="search-clear" id="searchClear" style="display:none" aria-label="پاک کردن جستجو">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const input = this.querySelector('.search-input');
    const clearBtn = this.querySelector('#searchClear');
    const shortcut = this.querySelector('#searchShortcut');

    input.addEventListener('input', (e) => {
      const val = e.target.value;
      this._debouncedSearch(val);
      clearBtn.style.display = val ? 'flex' : 'none';
      shortcut.style.display = val ? 'none' : 'block';
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      store.setSearch('');
      clearBtn.style.display = 'none';
      shortcut.style.display = 'block';
      input.focus();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !this._isInputFocused()) {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        store.setSearch('');
        clearBtn.style.display = 'none';
        shortcut.style.display = 'block';
        input.blur();
      }
    });

    store.subscribe((state) => {
      if (state.searchQuery === '') {
        input.value = '';
        clearBtn.style.display = 'none';
        shortcut.style.display = 'block';
      }
    });
  }

  _isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }
}

customElements.define('search-bar', SearchBar);
