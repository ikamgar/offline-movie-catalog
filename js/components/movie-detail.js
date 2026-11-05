/**
 * MovieDetail Component
 * Modal popup showing full movie details
 */

import { store, showToast } from '../store.js';
import { generatePosterPlaceholder } from '../utils/helpers.js';
import { html, raw } from '../utils/html.js';
import { trapFocus } from '../utils/dialog.js';

class MovieDetail extends HTMLElement {
  constructor() {
    super();
    this._movie = null;
    this._releaseFocus = null;
  }

  show(movie) {
    if (!movie) return;
    this._movie = movie;
    this.classList.remove('hidden');
    this.render();
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this, { onClose: () => this.hide() });
    }
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.classList.add('hidden');
    this._movie = null;
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
    document.body.style.overflow = '';
  }

  render() {
    const m = this._movie;
    if (!m) return;

    const isSelected = store.isSelected(m.uid);
    const isAdmin = store.role === 'admin';
    const isGame = m.type === 'Game';

    const imdbRatingHtml = !isGame && m.imdbRating && m.imdbRating > 0 ? html`
      <div class="movie-detail-imdb">
        <span class="imdb-rating-badge">
          <span class="star">★</span> ${m.imdbRating}
        </span>
      </div>
    ` : '';

    const plotHtml = !isGame && m.plotSummary ? html`
      <div class="movie-detail-plot">
        <div class="movie-detail-plot-label">خلاصه داستان</div>
        <div class="movie-detail-plot-text">${m.plotSummary}</div>
      </div>
    ` : '';

    const typeLabel = isGame
      ? raw((m.platforms || []).map(p => html`<span class="platform-badge platform-badge--${p.toLowerCase()}">${p}</span>`).join(' '))
      : raw(html`<span style="color:var(--color-text-secondary)">${m.type === 'Movie' ? 'فیلم' : m.type === 'Series' ? 'سریال' : m.type === 'Animation' ? 'انیمیشن' : m.type === 'Iranian' ? 'ایرانی' : m.type || 'فیلم'}</span>`);

    const genresHtml = !isGame && m.genres ? html`
      <div class="movie-detail-genres">
        ${raw(m.genres.map(g => html`<span class="movie-detail-genre genre-tag" data-genre="${g}">${g}</span>`).join(''))}
      </div>
    ` : '';

    // P6c E4: admin detail edits games too (owner decision — SELECT→EDIT)
    const actionButtons = isAdmin ? html`
      <div class="movie-detail-actions">
        <button class="btn btn-secondary" id="detailEdit">
          ${isGame ? 'ویرایش بازی' : 'ویرایش فیلم'}
        </button>
        ${m.id !== null ? raw(html`
        <button class="btn btn-secondary" id="detailCopyId">
          کپی شناسه (#${m.id})
        </button>
        `) : ''}
      </div>
    ` : html`
      <div class="movie-detail-actions">
        <button class="btn btn-primary" id="detailSelect">
          ${isSelected ? '✓ انتخاب شده' : '+ افزودن به لیست'}
        </button>
        ${!isGame && m.id !== null ? raw(html`
        <button class="btn btn-secondary" id="detailCopyId">
          کپی شناسه (#${m.id})
        </button>
        `) : ''}
      </div>
    `;

    this.innerHTML = html`
      <div class="movie-detail-backdrop" id="detailBackdrop">
        <div class="movie-detail" id="detailModal" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
          <img
            class="movie-detail-poster"
            src="${m.poster}"
            alt="${m.title}"
            id="detailPoster"
          />
          <div class="movie-detail-body">
            <div class="movie-detail-header">
              <h2 class="movie-detail-title" id="detailTitle">${m.title}</h2>
              <button class="movie-detail-close modal-close" id="detailClose" title="بستن" aria-label="بستن">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
            <div class="movie-detail-meta">
              ${!isGame && m.id !== null ? raw(html`<span class="movie-detail-id">#${m.id}</span>`) : ''}
              ${!isGame && m.year ? raw(html`<span class="movie-detail-year">${m.year}</span>`) : ''}
              ${!isGame && (m.id !== null || m.year) ? raw('<span style="color:var(--color-text-tertiary)">•</span>') : ''}
              ${raw(typeLabel)}
            </div>
            ${raw(imdbRatingHtml)}
            ${raw(genresHtml)}
            ${raw(plotHtml)}
            ${raw(actionButtons)}
          </div>
        </div>
      </div>
    `;

    this.querySelector('#detailModal').addEventListener('click', (e) => e.stopPropagation());
    this.querySelector('#detailClose').addEventListener('click', () => this.hide());
    this.querySelector('#detailBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });

    const posterImg = this.querySelector('#detailPoster');
    posterImg.addEventListener('error', () => {
      posterImg.src = generatePosterPlaceholder(m.title, m.id || m.title);
    });

    const editBtn = this.querySelector('#detailEdit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.hide();
        this.dispatchEvent(new CustomEvent('movie-edit', {
          detail: { movie: m },
          bubbles: true,
          composed: true
        }));
      });
    }

    const selectBtn = this.querySelector('#detailSelect');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        store.toggleSelection(m.uid);
        this.render();
      });
    }

    this.querySelector('#detailCopyId')?.addEventListener('click', () => {
      if (m.id !== null) {
        navigator.clipboard.writeText(String(m.id)).then(() => {
          showToast(`شناسه #${m.id} کپی شد`, 'success');
        });
      }
    });
  }
}

customElements.define('movie-detail', MovieDetail);
