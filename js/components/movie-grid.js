/**
 * MovieGrid Component
 * Grid display of movie cards with virtual scrolling support
 */

import { store } from '../store.js';
import { getGenreColor } from '../utils/helpers.js';
import './movie-card.js';
import lazyLoader from '../utils/lazy-loader.js';

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

class MovieGrid extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._renderedCount = 0;
    this._batchSize = 40;
    this._isLoadingMore = false;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      this._renderGrid(state.filteredMovies, state.viewMode);
      this._updateCategoryBanner();
    });
    this._setupInfiniteScroll();
    this._setupEditListener();
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._scrollObserver) this._scrollObserver.disconnect();
  }

  render() {
    const { filteredMovies, viewMode, isLoading, selectedCategory } = store.state;
    const label = this._getCategoryLabel(selectedCategory);
    const color = this._getCategoryColor(selectedCategory);
    const bgColor = this._hexToRgba(color, 0.12);

    this.innerHTML = `
      <div class="category-banner" id="categoryBanner" style="background:${bgColor}; border-bottom: 2px solid ${color};">
        <span class="category-banner-name" id="categoryBannerName" style="color:${color};">${label}</span>
      </div>
      <div class="movie-grid-container" id="gridContainer">
        <div class="movie-grid ${viewMode === 'list' ? 'list-view' : ''}" id="movieGrid">
          ${isLoading ? this._renderLoading() : ''}
        </div>
        <div id="scrollSentinel" style="height:1px;"></div>
      </div>
    `;

    this._renderGrid(filteredMovies, viewMode);
  }

  _renderGrid(movies, viewMode) {
    const grid = this.querySelector('#movieGrid');
    if (!grid) return;

    this._renderedCount = 0;
    grid.className = `movie-grid ${viewMode === 'list' ? 'list-view' : ''}`;
    grid.innerHTML = '';

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

  _appendBatch(movies) {
    const grid = this.querySelector('#movieGrid');
    if (!grid) return;

    const start = this._renderedCount;
    const end = Math.min(start + this._batchSize, movies.length);
    const fragment = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const card = document.createElement('movie-card');
      card.movie = movies[i];
      fragment.appendChild(card);
    }

    grid.appendChild(fragment);
    this._renderedCount = end;
    this._isLoadingMore = false;
  }

  _setupInfiniteScroll() {
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

  _setupEditListener() {
    // Listen for movie-edit events from movie cards
    document.addEventListener('movie-edit', (e) => {
      const editModal = document.getElementById('editModal');
      if (editModal) {
        editModal.show(e.detail.movie);
      }
    });
  }
}

customElements.define('movie-grid', MovieGrid);
