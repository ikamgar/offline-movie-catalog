/**
 * MovieDetail Component
 * Modal popup showing full movie details
 */

import { store, showToast } from '../store.js';
import { generatePosterPlaceholder } from '../utils/helpers.js';

class MovieDetail extends HTMLElement {
  constructor() {
    super();
    this._movie = null;
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  show(movie) {
    if (!movie) return;
    this._movie = movie;
    this.classList.remove('hidden');
    this.render();
    document.addEventListener('keydown', this._handleKeydown);
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.classList.add('hidden');
    this._movie = null;
    document.removeEventListener('keydown', this._handleKeydown);
    document.body.style.overflow = '';
  }

  render() {
    const m = this._movie;
    if (!m) return;

    const isSelected = store.isSelected(m.uid);
    const isAdmin = store.role === 'admin';

    // IMDB Rating badge
    const imdbRatingHtml = m.imdbRating && m.imdbRating > 0 ? `
      <div class="movie-detail-imdb">
        <span class="imdb-rating-badge">
          <span class="star">★</span> ${m.imdbRating}
        </span>
      </div>
    ` : '';

    // Plot summary
    const plotHtml = m.plotSummary ? `
      <div class="movie-detail-plot">
        <div class="movie-detail-plot-label">خلاصه داستان</div>
        <div class="movie-detail-plot-text">${m.plotSummary}</div>
      </div>
    ` : '';

    // Action buttons
    const actionButtons = isAdmin ? `
      <div class="movie-detail-actions">
        <button class="btn btn-secondary" id="detailEdit">
          ویرایش فیلم
        </button>
        ${m.id !== null ? `
        <button class="btn btn-secondary" id="detailCopyId">
          کپی شناسه (#${m.id})
        </button>
        ` : ''}
      </div>
    ` : `
      <div class="movie-detail-actions">
        <button class="btn btn-primary" id="detailSelect">
          ${isSelected ? '✓ انتخاب شده' : '+ افزودن به لیست'}
        </button>
        ${m.id !== null ? `
        <button class="btn btn-secondary" id="detailCopyId">
          کپی شناسه (#${m.id})
        </button>
        ` : ''}
      </div>
    `;

    this.innerHTML = `
      <div class="movie-detail-backdrop" id="detailBackdrop">
        <div class="movie-detail" onclick="event.stopPropagation()">
          <img
            class="movie-detail-poster"
            src="${m.poster}"
            alt="${m.title}"
            onerror="this.src='${generatePosterPlaceholder(m.title, m.id)}'"
          />
          <div class="movie-detail-body">
            <div class="movie-detail-header">
              <h2 class="movie-detail-title">${m.title}</h2>
              <button class="movie-detail-close" id="detailClose" title="بستن">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
            <div class="movie-detail-meta">
              ${m.id !== null ? `<span class="movie-detail-id">#${m.id}</span>` : ''}
              ${m.year ? `<span class="movie-detail-year">${m.year}</span>` : ''}
              ${(m.id !== null || m.year) ? '<span style="color:var(--color-text-tertiary)">•</span>' : ''}
              <span style="color:var(--color-text-secondary)">${m.type === 'Movie' ? 'فیلم' : m.type === 'Series' ? 'سریال' : m.type === 'Animation' ? 'انیمیشن' : m.type === 'Iranian' ? 'ایرانی' : m.type || 'فیلم'}</span>
            </div>
            ${imdbRatingHtml}
            <div class="movie-detail-genres">
              ${m.genres.map(g => `<span class="movie-detail-genre genre-tag" data-genre="${g}">${g}</span>`).join('')}
            </div>
            ${plotHtml}
            ${actionButtons}
          </div>
        </div>
      </div>
    `;

    this.querySelector('#detailClose').addEventListener('click', () => this.hide());
    this.querySelector('#detailBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });
    
    // Edit button for admin
    const editBtn = this.querySelector('#detailEdit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.hide();
        // Dispatch edit event
        this.dispatchEvent(new CustomEvent('movie-edit', {
          detail: { movie: m },
          bubbles: true,
          composed: true
        }));
      });
    }
    
    // Select button for customer
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

  _handleKeydown(e) {
    if (e.key === 'Escape') this.hide();
  }
}

customElements.define('movie-detail', MovieDetail);
