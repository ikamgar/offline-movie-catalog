/**
 * MovieCard Component
 * Individual movie card with poster, info, and selection
 */

import { store, showToast } from '../store.js';
import { generatePosterPlaceholder, getGenreColor, getBadge } from '../utils/helpers.js';
import lazyLoader from '../utils/lazy-loader.js';

class MovieCard extends HTMLElement {
  constructor() {
    super();
    this._movie = null;
    this._unsubscribe = null;
  }

  set movie(m) {
    this._movie = m;
    this.render();
  }

  get movie() {
    return this._movie;
  }

  connectedCallback() {
    if (this._movie) this.render();
    this._unsubscribe = store.subscribe((state) => {
      this._updateSelection();
      this._updateRole();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  render() {
    const m = this._movie;
    if (!m) return;

    const isSelected = store.isSelected(m.uid);
    const posterAlt = `${m.title} poster`;
    const isAdmin = store.role === 'admin';
    const isGame = m.type === 'Game';

    this.className = `movie-card${isSelected ? ' selected' : ''}${isGame ? ' game-card' : ''}`;

    // IMDB Badge - only show for movies if rating exists and > 0
    const imdbBadge = !isGame && m.imdbRating && m.imdbRating > 0 ? `
      <span class="imdb-badge">
        <span class="imdb-logo">IMDb</span>
        <span>${m.imdbRating}</span>
      </span>
    ` : '';

    // Type badge - movie badge for movies, platform badges for games
    let typeBadge = '';
    if (isGame) {
      typeBadge = (m.platforms || []).map(p =>
        `<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`
      ).join('');
    } else {
      const badgeConfig = getBadge(m);
      if (badgeConfig) {
        typeBadge = `<span class="movie-card-type-badge ${badgeConfig.cls}">${badgeConfig.text}</span>`;
      }
    }

    // Action button: Edit for admin, Select for customer
    const actionButton = isAdmin && !isGame ? `
      <button class="movie-card-edit-btn" data-action="edit">
        ویرایش
      </button>
    ` : `
      <button class="movie-card-select-btn ${isSelected ? 'selected' : ''}" data-action="select">
        ${isSelected ? '✓ انتخاب شده' : 'انتخاب'}
      </button>
    `;

    // Info section - different for games vs movies
    const infoSection = isGame ? `
      <div class="movie-card-info">
        <div class="movie-card-title-line" title="${m.title}">${m.title}</div>
        <div class="movie-card-platforms">
          ${(m.platforms || []).map(p => `<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`).join('')}
        </div>
      </div>
    ` : `
      <div class="movie-card-info">
        <div class="movie-card-title-line" title="${m.title}">${m.title}${m.year ? ' ' + m.year : ''}</div>
        ${m.id !== null ? `<div class="movie-card-id-large">#${m.id}</div>` : ''}
        <div class="movie-card-genres">
          ${m.genres.map(g => `<span class="movie-card-genre-tag genre-tag" data-genre="${g}" style="background:${getGenreColor(g)}22;color:${getGenreColor(g)}">${g}</span>`).join('')}
        </div>
      </div>
    `;

    this.innerHTML = `
      <div class="movie-card-poster-wrapper">
        ${imdbBadge}
        ${typeBadge ? (isGame ? `<div class="movie-card-platform-badges">${typeBadge}</div>` : typeBadge) : ''}
        <img
          class="movie-card-poster"
          data-src="${m.poster}"
          alt="${posterAlt}"
          loading="lazy"
        />
        <div class="movie-card-poster-placeholder" id="posterPlaceholder">
          <span class="movie-card-poster-placeholder-icon">${isGame ? '🎮' : '🎬'}</span>
          <span class="movie-card-poster-placeholder-text">${m.title.split(' ')[0]}</span>
        </div>
        <div class="movie-card-overlay">
          ${actionButton}
        </div>
      </div>
      ${infoSection}
    `;

    const img = this.querySelector('.movie-card-poster');
    const placeholder = this.querySelector('#posterPlaceholder');

    img.addEventListener('load', () => {
      placeholder.style.display = 'none';
    });

    img.addEventListener('error', () => {
      img.src = generatePosterPlaceholder(m.title, isGame ? m.title : m.id);
      placeholder.style.display = 'none';
    });

    lazyLoader.observe(img);

    // Bind action button event
    const editBtn = this.querySelector('[data-action="edit"]');
    const selectBtn = this.querySelector('[data-action="select"]');

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Dispatch custom event to open edit modal
        this.dispatchEvent(new CustomEvent('movie-edit', {
          detail: { movie: m },
          bubbles: true,
          composed: true
        }));
      });
    }

    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.toggleSelection(m.uid);
      });
    }

    this.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('movie-detail', {
        detail: { movie: m },
        bubbles: true,
        composed: true
      }));
    });
  }

  _updateSelection() {
    if (!this._movie) return;
    const isSelected = store.isSelected(this._movie.uid);
    this.classList.toggle('selected', isSelected);
    const btn = this.querySelector('.movie-card-select-btn');
    if (btn) {
      btn.classList.toggle('selected', isSelected);
      btn.textContent = isSelected ? '✓ انتخاب شده' : 'انتخاب';
    }
  }

  _updateRole() {
    // Re-render when role changes to show correct button
    if (this._movie) this.render();
  }
}

customElements.define('movie-card', MovieCard);
