/**
 * GenreSidebar Component
 * Single-active category filter sidebar with media types + genres
 *
 * Shows:
 *   - "All Movies" at top
 *   - Media type categories: Animation 🎬, Iranian 🇮🇷, Series 📺
 *   - Separator
 *   - Genre categories: Action, Drama, Romance, etc.
 *
 * When no category is active: "All Movies" is highlighted.
 * When a category is active: that category is highlighted with a ✕ deselect button.
 */

import { store, GENRE_COLORS } from '../store.js';
import { getGenreColor } from '../utils/helpers.js';

const MEDIA_TYPE_CATEGORIES = [
  { value: 'Animation', label: 'انیمیشن', icon: '🎬', color: '#10b981' },
  { value: 'Iranian', label: 'ایرانی', icon: '🇮🇷', color: '#14b8a6' },
  { value: 'Series', label: 'سریال', icon: '📺', color: '#64748b' },
];

class GenreSidebar extends HTMLElement {
  constructor() {
    super();
    this._unsubscribe = null;
    this._prevMovies = null;
    this._prevGenres = null;
    this._prevCategory = undefined;
  }

  connectedCallback() {
    this.render();
    this._unsubscribe = store.subscribe((state) => {
      const moviesChanged = state.movies !== this._prevMovies;
      const genresChanged = state.genres !== this._prevGenres;
      const categoryChanged = state.selectedCategory !== this._prevCategory;

      this._prevMovies = state.movies;
      this._prevGenres = state.genres;
      this._prevCategory = state.selectedCategory;

      if (moviesChanged || genresChanged || categoryChanged) {
        this.render();
      }
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    this._prevMovies = null;
    this._prevGenres = null;
    this._prevCategory = undefined;
  }

  render() {
    const { genres, genreCounts, selectedCategory, movies, totalMovies } = store.state;

    // Count movies by type
    const typeCounts = {};
    for (const m of movies) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }

    this.innerHTML = `
      <div class="genre-sidebar-header">
        <span class="genre-sidebar-title">دسته‌بندی‌ها</span>
        <span class="genre-sidebar-subtitle">انتخاب فیلتر</span>
      </div>
      <div class="genre-sidebar-stats">
        <div class="genre-sidebar-stat">
          <span class="genre-sidebar-stat-label">تعداد کل فیلم‌ها</span>
          <span class="genre-sidebar-stat-value">${totalMovies}</span>
        </div>
      </div>
      <div class="genre-list" id="genreList">
        ${this._renderAllCategories(genres, genreCounts, typeCounts, totalMovies, selectedCategory)}
      </div>
    `;

    this.querySelector('#genreList').addEventListener('click', (e) => {
      const item = e.target.closest('.genre-item');
      if (!item) return;

      // ✕ button clicked → clear filter
      if (e.target.closest('.genre-item-close')) {
        store.clearCategory();
        return;
      }

      const category = item.dataset.category || null;
      if (category) {
        store.selectCategory(category);
      } else {
        store.clearCategory();
      }
    });
  }

  _renderAllCategories(genres, genreCounts, typeCounts, totalMovies, selectedCategory) {
    const closeBtn = `<button class="genre-item-close" title="پاک کردن فیلتر" aria-label="پاک کردن فیلتر">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
      </svg>
    </button>`;

    return `
      <div class="genre-item${!selectedCategory ? ' active' : ''}" data-category="" tabindex="0">
        <span class="genre-item-color" style="background: var(--color-accent-primary)"></span>
        <span class="genre-item-name">همه فیلم‌ها</span>
        <span class="genre-item-count">${totalMovies}</span>
      </div>
      ${MEDIA_TYPE_CATEGORIES.map(t => {
        const isActive = selectedCategory === t.value;
        return `
        <div class="genre-item${isActive ? ' active' : ''}" data-category="${t.value}" tabindex="0">
          <span class="genre-item-color" style="background: ${t.color}"></span>
          <span class="genre-item-name">${t.icon} ${t.label}</span>
          <span class="genre-item-count">${typeCounts[t.value] || 0}</span>
          ${isActive ? closeBtn : ''}
        </div>`;
      }).join('')}
      <div class="genre-separator"></div>
      ${genres.map(g => {
        const isActive = selectedCategory === g;
        return `
        <div class="genre-item${isActive ? ' active' : ''}" data-category="${g}" tabindex="0">
          <span class="genre-item-color" style="background: ${getGenreColor(g)}"></span>
          <span class="genre-item-name">${g}</span>
          <span class="genre-item-count">${genreCounts[g] || 0}</span>
          ${isActive ? closeBtn : ''}
        </div>`;
      }).join('')}
    `;
  }

}

customElements.define('genre-sidebar', GenreSidebar);
