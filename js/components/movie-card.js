/**
 * MovieCard Component
 * Individual movie card with poster, info, and selection
 *
 * P4: renders exactly once per (movie, role); no per-card store subscription;
 * select/edit/detail handled by grid-level event delegation.
 */

import { store } from '../store.js';
import { generatePosterPlaceholder, getGenreColor, getBadge } from '../utils/helpers.js';
import { html, raw } from '../utils/html.js';
import lazyLoader from '../utils/lazy-loader.js';

class MovieCard extends HTMLElement {
  constructor() {
    super();
    this._movie = null;
    this._rendered = false;
  }

  set movie(m) {
    this._movie = m;
    this._rendered = false;
    if (this.isConnected) this._renderOnce();
  }

  get movie() {
    return this._movie;
  }

  connectedCallback() {
    this._renderOnce();
  }

  disconnectedCallback() {
    // no subscriptions or external listeners to clean (grid owns delegation)
  }

  _renderOnce() {
    if (this._rendered || !this._movie) return;
    this._rendered = true;
    this.render();
  }

  /** Update selected chrome without a full re-render (C3/C4). */
  syncSelected(isSelected) {
    this.classList.toggle('selected', isSelected);
    this.setAttribute('aria-pressed', String(isSelected));
    const btn = this.querySelector('[data-action="select"]');
    if (btn) {
      btn.classList.toggle('selected', isSelected);
      btn.textContent = isSelected ? '✓ انتخاب شده' : 'انتخاب';
    }
  }

  render() {
    const m = this._movie;
    if (!m) return;

    const isSelected = store.isSelected(m.uid);
    const posterAlt = `${m.title} poster`;
    const isAdmin = store.role === 'admin';
    const isGame = m.type === 'Game';

    this.className = `movie-card${isSelected ? ' selected' : ''}${isGame ? ' game-card' : ''}`;
    this.setAttribute('aria-pressed', String(isSelected));

    const imdbBadge = !isGame && m.imdbRating && m.imdbRating > 0 ? html`
      <span class="imdb-badge">
        <span class="imdb-logo">IMDb</span>
        <span>${m.imdbRating}</span>
      </span>
    ` : '';

    let typeBadge = '';
    if (isGame) {
      typeBadge = (m.platforms || []).map(p =>
        html`<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`
      ).join('');
    } else {
      const badgeConfig = getBadge(m);
      if (badgeConfig) {
        typeBadge = html`<span class="movie-card-type-badge ${badgeConfig.cls}">${badgeConfig.text}</span>`;
      }
    }

    // P6c E4: admin cards edit games too (owner decision — SELECT→EDIT)
    const actionButton = isAdmin ? html`
      <button class="movie-card-edit-btn" data-action="edit">
        ویرایش
      </button>
    ` : html`
      <button class="movie-card-select-btn ${isSelected ? 'selected' : ''}" data-action="select">
        ${isSelected ? '✓ انتخاب شده' : 'انتخاب'}
      </button>
    `;

    const infoSection = isGame ? html`
      <div class="movie-card-info">
        <div class="movie-card-title-line" title="${m.title}">${m.title}</div>
        <div class="movie-card-platforms">
          ${raw((m.platforms || []).map(p => html`<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`).join(''))}
        </div>
      </div>
    ` : html`
      <div class="movie-card-info">
        <div class="movie-card-title-line" title="${m.title}">${m.title}${m.year ? ' ' + m.year : ''}</div>
        ${m.id !== null ? raw(html`<div class="movie-card-id-large">#${m.id}</div>`) : ''}
        <div class="movie-card-genres">
          ${raw(m.genres.map(g => html`<span class="movie-card-genre-tag genre-tag" data-genre="${g}" style="background:${getGenreColor(g)}22;color:${getGenreColor(g)}">${g}</span>`).join(''))}
        </div>
      </div>
    `;

    // FE-12 / G4: grid loads the w=300 thumbnail (srcset 300/600 for HiDPI);
    // the detail view keeps the original. ?w rides after ?v= when present.
    const posterAt = (w) => {
      if (!m.poster) return '';
      return m.poster.includes('?') ? `${m.poster}&w=${w}` : `${m.poster}?w=${w}`;
    };

    this.innerHTML = html`
      <div class="movie-card-poster-wrapper">
        ${raw(imdbBadge)}
        ${typeBadge ? (isGame ? raw(html`<div class="movie-card-platform-badges">${raw(typeBadge)}</div>`) : raw(typeBadge)) : ''}
        <img
          class="movie-card-poster"
          data-src="${posterAt(300)}"
          data-srcset="${posterAt(300)} 1x, ${posterAt(600)} 2x"
          alt="${posterAlt}"
          loading="lazy"
          decoding="async"
        />
        <div class="movie-card-poster-placeholder" id="posterPlaceholder">
          <span class="movie-card-poster-placeholder-icon">${isGame ? '🎮' : '🎬'}</span>
          <span class="movie-card-poster-placeholder-text">${m.title.split(' ')[0]}</span>
        </div>
        <div class="movie-card-overlay">
          ${raw(actionButton)}
        </div>
      </div>
      ${raw(infoSection)}
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
  }
}

customElements.define('movie-card', MovieCard);
