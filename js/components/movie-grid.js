/**
 * MovieGrid Component
 * Grid display of movie cards with infinite scroll
 *
 * P4: rebuild only when the visible list (or viewMode/mediaMode/isLoading)
 * changes; selection toggles existing cards via a uid→element map;
 * select/edit/detail handled by event delegation on the grid.
 */

import { store } from '../store.js';
import { getGenreColor } from '../utils/helpers.js';
import { esc } from '../utils/html.js';
import './movie-card.js';

const CATEGORY_LABELS = {
  'Animation': 'انیمیشن',
  'Iranian': 'ایرانی',
  'Series': 'سریال',
  'Movie': 'فیلم‌ها',
  'Game': 'بازی‌ها',
  'PS4': 'پلی‌استیشن ۴',
  'PS5': 'پلی‌استیشن ۵',
};

const CATEGORY_COLORS = {
  'Movie': '#EF4444',
  'Series': '#F97316',
  'Iranian': '#22C55E',
  'Animation': '#FACC15',
  'Game': '#00d4ff',
  'PS4': '#0066CC',
  'PS5': '#003087',
};

const LIST_KEYS = ['filteredMovies', 'viewMode', 'mediaMode', 'isLoading', 'selectedCategory'];
const STATE_KEYS = [...LIST_KEYS, 'selectedMovies', 'role'];

class MovieGrid extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._renderedCount = 0;
    this._batchSize = 40;
    this._isLoadingMore = false;
    this._cardMap = new Map();
    this._onClick = null;
    this._lastListSig = null;
    this._lastViewMode = null;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state, changes) => {
      const keys = changes && changes.keys;
      if (!keys) {
        this._renderGrid(state.filteredMovies, state.viewMode);
        this._updateCategoryBanner();
        return;
      }
      const listChanged = keys.some(k => LIST_KEYS.includes(k));
      const roleChanged = keys.includes('role');
      const selectionChanged = keys.includes('selectedMovies');
      if (listChanged) {
        this._renderGrid(state.filteredMovies, state.viewMode);
        this._updateCategoryBanner();
      } else if (roleChanged) {
        // role swaps select↔edit buttons — re-render existing cards only (keeps scroll)
        for (const card of this._cardMap.values()) {
          if (card.isConnected) card.render();
        }
      } else if (selectionChanged) {
        this._syncCardStates();
      }
    }, STATE_KEYS);
    this._setupInfiniteScroll();
    this._onClick = (e) => this._handleClick(e);
    this.addEventListener('click', this._onClick);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._scrollObserver) this._scrollObserver.disconnect();
    if (this._onClick) {
      this.removeEventListener('click', this._onClick);
      this._onClick = null;
    }
    this._cardMap.clear();
  }

  render() {
    const { filteredMovies, viewMode, isLoading, selectedCategory } = store.state;
    const label = this._getCategoryLabel(selectedCategory);
    const color = this._getCategoryColor(selectedCategory);
    const bgColor = this._hexToRgba(color, 0.12);

    this.innerHTML = `
      <div class="category-banner" id="categoryBanner" style="background:${bgColor}; border-bottom: 2px solid ${color};">
        <span class="category-banner-name" id="categoryBannerName" style="color:${color};">${esc(label)}</span>
      </div>
      <div class="movie-grid-container" id="gridContainer">
        <div class="movie-grid ${viewMode === 'list' ? 'list-view' : ''}" id="movieGrid">
          ${isLoading ? this._renderLoading() : ''}
        </div>
        <div id="scrollSentinel" style="height:1px;"></div>
      </div>
    `;

    this._cardMap.clear();
    this._lastListSig = null;
    this._renderGrid(filteredMovies, viewMode);
    this._setupInfiniteScroll();
  }

  _renderGrid(movies, viewMode) {
    const grid = this.querySelector('#movieGrid');
    if (!grid) return;

    const sig = movies.map(m => m.uid).join('|');
    const sameList = sig === this._lastListSig &&
      viewMode === this._lastViewMode &&
      this._cardMap.size > 0 &&
      this._cardMap.size === this._renderedCount;

    if (sameList) {
      // Same visible list (e.g. catalog:changed reload) — keep DOM + scroll;
      // refresh only cards whose movie data actually changed.
      for (const movie of movies) {
        const card = this._cardMap.get(movie.uid);
        if (card && MovieGrid._movieNeedsUpdate(card.movie, movie)) {
          card.movie = movie;
        }
      }
      return;
    }

    this._lastListSig = sig;
    this._lastViewMode = viewMode;
    this._renderedCount = 0;
    this._cardMap.clear();
    grid.className = `movie-grid ${viewMode === 'list' ? 'list-view' : ''}`;
    grid.innerHTML = '';

    // New list (search/filter/category) intentionally scrolls to top (C3)
    this._scrollToTop();

    if (!movies.length) {
      const isGames = store.state.mediaMode === 'games';
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">${isGames ? '🎮' : '🔍'}</div>
          <div class="empty-state-title">${isGames ? 'بازی یافت نشد' : 'فیلمی یافت نشد'}</div>
          <div class="empty-state-text">${isGames ? 'فیلترها یا عبارت جستجو را تغییر دهید.' : 'فیلترها یا عبارت جستجو را تغییر دهید.'}</div>
        </div>
      `;
      return;
    }

    this._appendBatch(movies);
  }

  static _movieNeedsUpdate(a, b) {
    if (a === b) return false;
    if (!a || !b) return true;
    return a.title !== b.title ||
      a.year !== b.year ||
      a.id !== b.id ||
      a.poster !== b.poster ||
      a.type !== b.type ||
      a.imdbRating !== b.imdbRating ||
      a.plotSummary !== b.plotSummary ||
      (a.genres || []).join('|') !== (b.genres || []).join('|') ||
      (a.platforms || []).join('|') !== (b.platforms || []).join('|');
  }

  _scrollToTop() {
    let el = this.querySelector('#scrollSentinel');
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5) {
        el.scrollTop = 0;
        return;
      }
      el = el.parentElement;
    }
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }

  _appendBatch(movies) {
    const grid = this.querySelector('#movieGrid');
    if (!grid) return;

    const start = this._renderedCount;
    const end = Math.min(start + this._batchSize, movies.length);
    const fragment = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const movie = movies[i];
      const card = document.createElement('movie-card');
      card.movie = movie;
      this._cardMap.set(movie.uid, card);
      fragment.appendChild(card);
    }

    grid.appendChild(fragment);
    this._renderedCount = end;
    this._isLoadingMore = false;
  }

  /** Toggle selected chrome on existing cards without touching the list (C3). */
  _syncCardStates() {
    for (const [uid, card] of this._cardMap) {
      if (card.isConnected) {
        card.syncSelected(store.isSelected(uid));
      }
    }
  }

  /** Event delegation for select / edit / open-detail (C4). */
  _handleClick(e) {
    const card = e.target.closest('movie-card');
    if (!card || !this.contains(card) || !card.movie) return;

    const actionEl = e.target.closest('[data-action]');
    const action = actionEl ? actionEl.dataset.action : null;

    if (action === 'select') {
      e.stopPropagation();
      store.toggleSelection(card.movie.uid);
      return;
    }
    if (action === 'edit') {
      e.stopPropagation();
      const editModal = document.getElementById('editModal');
      if (editModal) editModal.show(card.movie);
      return;
    }

    this.dispatchEvent(new CustomEvent('movie-detail', {
      detail: { movie: card.movie },
      bubbles: true,
      composed: true
    }));
  }

  _setupInfiniteScroll() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
      this._scrollObserver = null;
    }
    const sentinel = this.querySelector('#scrollSentinel');
    if (!sentinel) return;

    this._scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this._isLoadingMore) {
        const { filteredMovies } = store.state;
        if (this._renderedCount < filteredMovies.length) {
          this._isLoadingMore = true;
          requestAnimationFrame(() => this._appendBatch(filteredMovies));
        }
      }
    }, { rootMargin: '400px' });

    this._scrollObserver.observe(sentinel);
  }

  _renderLoading() {
    return `
      <div class="movie-grid" id="loadingGrid">
        ${Array(12).fill('').map(() => `
          <div class="movie-card">
            <div class="movie-card-poster-wrapper">
              <div class="skeleton" style="width:100%;height:100%;position:absolute;top:0;left:0;"></div>
            </div>
            <div class="movie-card-info">
              <div class="skeleton" style="height:16px;width:70%;margin-bottom:8px;"></div>
              <div class="skeleton" style="height:12px;width:50%;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _updateCategoryBanner() {
    const { selectedCategory } = store.state;
    const banner = this.querySelector('#categoryBanner');
    const nameEl = this.querySelector('#categoryBannerName');
    if (!banner || !nameEl) return;

    const label = this._getCategoryLabel(selectedCategory);
    const color = this._getCategoryColor(selectedCategory);
    const bgColor = this._hexToRgba(color, 0.12);

    nameEl.textContent = label;
    nameEl.style.color = color;
    banner.style.background = bgColor;
    banner.style.borderBottomColor = color;
  }

  _getCategoryLabel(category) {
    if (!category) {
      return store.state.mediaMode === 'games' ? 'همه بازی‌ها' : 'همه فیلم‌ها';
    }
    return CATEGORY_LABELS[category] || category;
  }

  _getCategoryColor(category) {
    if (!category) {
      return store.state.mediaMode === 'games' ? '#00d4ff' : '#64748B';
    }
    return CATEGORY_COLORS[category] || getGenreColor(category);
  }

  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

customElements.define('movie-grid', MovieGrid);
