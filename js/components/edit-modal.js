/**
 * EditModal Component
 * Modal dialog for managers to edit movie details (P6a E1: genres + poster + inline errors)
 * P6c E4: games edit here too — platform checkboxes replace the movie fields,
 * the delete button says «حذف بازی» and hits the same by-uid DELETE.
 */

import { store, showToast } from '../store.js';
import { api } from '../utils/api.js';
import { html, raw } from '../utils/html.js';
import { trapFocus } from '../utils/dialog.js';
import { config } from '../config.js';

/**
 * Q6: structured error code → the inline slot that must show the message.
 * The Persian text from the server is displayed verbatim — never parsed.
 * Anything unmapped (or 409 without a known code) lands in #editFormError.
 */
const CODE_FIELD = {
  TITLE_REQUIRED: '#editTitleError',
  TITLE_INVALID: '#editTitleError',
  GAME_EXISTS: '#editTitleError',
  PLATFORM_INVALID: '#editPlatformsError',
  ID_REQUIRED: '#editIdError',
  ID_TAKEN: '#editIdError',
  YEAR_INVALID: '#editYearError',
  RATING_INVALID: '#editImdbError',
  GENRE_REQUIRED: '#editGenresError',
  GENRE_INVALID: '#editGenresError',
  NON_MOVIE_GENRE_EDIT: '#editGenresError',
  IMG_REQUIRED: '#editPosterError',
  IMG_INVALID: '#editPosterError',
  IMG_UNSUPPORTED: '#editPosterError',
  IMG_TOO_LARGE: '#editPosterError'
};

class EditModal extends HTMLElement {
  constructor() {
    super();
    this._movie = null;
    this._releaseFocus = null;
    this._posterFile = null;
    this._genres = [];
  }

  show(movie) {
    if (!movie) return;
    this._movie = movie;
    this._posterFile = null;
    // Movie-only: checkbox chips from the catalog's genres (Q2), plus this
    // movie's own genres in case the catalog list is stale.
    this._genres = movie.type === 'Movie'
      ? [...new Set([...(store.state.genres || []), ...(movie.genres || [])])]
      : [];
    this.classList.remove('hidden');
    this.render();
    this._releaseFocus = trapFocus(this.querySelector('#editModal'), {
      onClose: () => this.hide()
    });
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.classList.add('hidden');
    this._movie = null;
    this._posterFile = null;
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
    document.body.style.overflow = '';
  }

  _isSeries(m) {
    if (!m) return false;
    // Games carry no id but are NOT series — they get their own branch (E4)
    if (this._isGame(m)) return false;
    return m.type === 'Series' || m.id == null ||
      (m.uid != null && String(m.uid).startsWith('series:'));
  }

  _isMovie(m) {
    return !!m && m.type === 'Movie';
  }

  /** Games: typed Game or a `game:` uid (P6c E4). */
  _isGame(m) {
    if (!m) return false;
    return m.type === 'Game' ||
      (m.uid != null && String(m.uid).startsWith('game:'));
  }

  _renderGenreSection(m) {
    if (this._isGame(m)) {
      // The group must still EXIST (hidden) so the form layout stays stable;
      // games have no genres (I8).
      return html`<div class="edit-form-group" id="editGenres" style="display:none"></div>`;
    }
    if (!this._isMovie(m)) return '';
    const boxes = this._genres.map(g => html`
      <label class="genre-checkbox">
        <input type="checkbox" name="genres" value="${g}">
        <span class="genre-checkbox-label">${g}</span>
      </label>
    `).join('');
    return html`
      <div class="edit-form-group" id="editGenres">
        <label>ژانرها <span class="required">*</span></label>
        <div class="edit-genre-list">${raw(boxes)}</div>
        <span class="edit-form-error" id="editGenresError" hidden></span>
      </div>`;
  }

  _renderPlatformSection(m) {
    if (!this._isGame(m)) return '';
    return html`
      <div class="edit-form-group" id="editPlatforms">
        <label>پلتفرم <span class="required">*</span></label>
        <div class="edit-genre-list">
          <label class="genre-checkbox">
            <input type="checkbox" name="platforms" value="PS4">
            <span class="genre-checkbox-label">PS4</span>
          </label>
          <label class="genre-checkbox">
            <input type="checkbox" name="platforms" value="PS5">
            <span class="genre-checkbox-label">PS5</span>
          </label>
        </div>
        <span class="edit-form-error" id="editPlatformsError" hidden></span>
      </div>`;
  }

  _renderPosterSection() {
    return html`
      <div class="edit-form-group">
        <label for="editPosterInput">پوستر فیلم</label>
        <input type="file" id="editPosterInput" accept="image/jpeg,image/png,image/webp,image/avif">
        <span class="edit-poster-name" id="editPosterName"></span>
        <span class="edit-form-error" id="editPosterError" hidden></span>
      </div>`;
  }

  render() {
    const m = this._movie;
    if (!m) return;
    const isSeries = this._isSeries(m);
    const isGame = this._isGame(m);
    const idField = isSeries ? '' : html`
              <div class="edit-form-group">
                <label for="editId">شناسه/کد <span class="required">*</span></label>
                <input type="number" id="editId" name="id" required value="${m.id || ''}" placeholder="مثال: 5273">
                <span class="edit-form-error" id="editIdError" hidden></span>
              </div>`;

    this.innerHTML = html`
      <div class="edit-modal-backdrop" id="editBackdrop">
        <div class="edit-modal" id="editModal" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
          <div class="edit-modal-header">
            <h2 class="edit-modal-title" id="editModalTitle">${isGame ? 'ویرایش بازی' : 'ویرایش فیلم'}</h2>
            <button class="edit-modal-close modal-close" id="editClose" title="بستن" aria-label="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form class="edit-modal-body" id="editForm" novalidate>
            <div class="edit-form-error edit-form-error-block" id="editFormError" role="alert" hidden></div>
            <div class="edit-form-group">
              <label for="editTitle">عنوان <span class="required">*</span></label>
              <input type="text" id="editTitle" name="title" required value="${m.title || ''}" placeholder="${isGame ? 'عنوان بازی' : 'عنوان فیلم'}">
              <span class="edit-form-error" id="editTitleError" hidden></span>
            </div>
            <div class="edit-form-row" style="${isGame ? 'display:none' : ''}">
              <div class="edit-form-group">
                <label for="editYear">سال انتشار</label>
                <input type="number" id="editYear" name="year" min="1900" max="2100" value="${m.year || ''}" placeholder="مثال: 2024">
                <span class="edit-form-error" id="editYearError" hidden></span>
              </div>
              ${raw(idField)}
            </div>
            <div class="edit-form-group" style="${isGame ? 'display:none' : ''}">
              <label for="editImdb">امتیاز IMDB</label>
              <input type="number" id="editImdb" name="imdbRating" step="0.1" min="0" max="10" value="${m.imdbRating || ''}" placeholder="مثال: 8.5">
              <span class="edit-form-error" id="editImdbError" hidden></span>
            </div>
            <div class="edit-form-group" style="${isGame ? 'display:none' : ''}">
              <label for="editPlot">خلاصه داستان</label>
              <textarea id="editPlot" name="plotSummary" rows="4" placeholder="خلاصه‌ای از داستان فیلم...">${m.plotSummary || ''}</textarea>
            </div>
            ${raw(this._renderGenreSection(m))}
            ${raw(this._renderPlatformSection(m))}
            ${raw(this._renderPosterSection())}
            <div class="edit-form-actions">
              <button type="button" class="btn btn-danger edit-delete-btn" id="editDeleteBtn">${isGame ? 'حذف بازی' : 'حذف فیلم'}</button>
              <button type="button" class="btn btn-secondary" id="editCancelBtn">انصراف</button>
              <button type="submit" class="btn btn-primary" id="editSaveBtn">
                <span class="btn-text">ذخیره</span>
                <span class="btn-loading" style="display:none;">در حال ذخیره...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.querySelector('#editClose').addEventListener('click', () => this.hide());
    this.querySelector('#editCancelBtn').addEventListener('click', () => this.hide());
    this.querySelector('#editDeleteBtn')?.addEventListener('click', () => this._handleDelete());
    this.querySelector('#editBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });
    this.querySelector('#editModal').addEventListener('click', (e) => e.stopPropagation());
    this.querySelector('#editForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    // Pre-check this movie's genres (Movie only)
    const selected = new Set(this._movie && this._movie.genres ? this._movie.genres : []);
    this.querySelectorAll('#editGenres input[name="genres"]').forEach(cb => {
      cb.checked = selected.has(cb.value);
    });

    // Pre-check the game's platforms (P6c E4)
    const platforms = new Set(this._movie && this._movie.platforms ? this._movie.platforms : []);
    this.querySelectorAll('#editPlatforms input[name="platforms"]').forEach(cb => {
      cb.checked = platforms.has(cb.value);
    });

    const posterInput = this.querySelector('#editPosterInput');
    if (posterInput) {
      posterInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files.length ? e.target.files[0] : null;
        this._posterFile = null;
        this._clearErrors('#editPosterError');
        const nameEl = this.querySelector('#editPosterName');
        if (nameEl) nameEl.textContent = '';
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!(config.imageExtensions || []).includes(ext)) {
          this._setFieldError('#editPosterError', 'فرمت تصویر نامعتبر است');
          e.target.value = '';
          return;
        }
        this._posterFile = file;
        if (nameEl) nameEl.textContent = file.name;
      });
    }
  }

  _clearErrors(only) {
    const scope = only ? [this.querySelector(only)].filter(Boolean)
      : [...this.querySelectorAll('.edit-form-error')];
    for (const el of scope) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  _setFieldError(sel, msg) {
    const el = this.querySelector(sel);
    if (el) {
      el.textContent = msg;
      el.hidden = false;
      return;
    }
    this._setFormError(msg);
  }

  _setFormError(msg) {
    const el = this.querySelector('#editFormError');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async _handleSubmit() {
    const isSeries = this._isSeries(this._movie);
    const isMovie = this._isMovie(this._movie);
    const isGame = this._isGame(this._movie);
    let formData;
    if (isGame) {
      // Games: title + platforms only — the movie fields are hidden (E4)
      formData = {
        title: this.querySelector('#editTitle').value.trim(),
        platforms: [...this.querySelectorAll('#editPlatforms input[name="platforms"]:checked')]
          .map(b => b.value)
      };
    } else {
      formData = {
        title: this.querySelector('#editTitle').value.trim(),
        year: this.querySelector('#editYear').value ? parseInt(this.querySelector('#editYear').value) : null,
        imdbRating: this.querySelector('#editImdb').value ? parseFloat(this.querySelector('#editImdb').value) : null,
        plotSummary: this.querySelector('#editPlot').value.trim()
      };
      if (!isSeries) {
        const idInput = this.querySelector('#editId');
        formData.id = idInput ? idInput.value.trim() : '';
      }
      if (isMovie) {
        formData.genres = [...this.querySelectorAll('#editGenres input[name="genres"]:checked')]
          .map(b => b.value);
      }
    }

    // Client validation → inline field errors, BEFORE any confirm or request
    this._clearErrors();
    let invalid = false;
    if (!formData.title) {
      this._setFieldError('#editTitleError', 'عنوان فیلم الزامی است');
      invalid = true;
    }
    if (isGame && formData.platforms.length === 0) {
      this._setFieldError('#editPlatformsError', 'حداقل یک پلتفرم انتخاب کنید');
      invalid = true;
    }
    if (!isSeries && !isGame && !formData.id) {
      this._setFieldError('#editIdError', 'شناسه/کد فیلم الزامی است');
      invalid = true;
    }
    if (isMovie && formData.genres.length === 0) {
      this._setFieldError('#editGenresError', 'حداقل یک ژانر برای فیلم الزامی است');
      invalid = true;
    }
    if (invalid) return;

    // P6c E4: game edits skip the confirm when nothing is destroyed — a
    // rename has no destructive side effect (movie saves keep the Q3 merged
    // confirmation). Removing a platform deletes the poster copy in that
    // platform's folder, so it confirms first and names the platforms
    // (mirrors the genre-removal confirmation).
    if (isGame) {
      const currentPlatforms = new Set(this._movie.platforms || []);
      const nextPlatforms = new Set(formData.platforms || []);
      const removedPlatforms = [...currentPlatforms].filter(p => !nextPlatforms.has(p));
      if (removedPlatforms.length) {
        document.getElementById('confirmModal').show(
          `پلتفرم‌های حذف‌شده: ${removedPlatforms.join('، ')}\n` +
            'پوستر مربوط از پوشه آن پلتفرم حذف می‌شود.\n' +
            'آیا از ذخیره این تغییرات اطمینان دارید؟',
          'تأیید ذخیره تغییرات',
          () => this._performSave(formData)
        );
        return;
      }
      await this._performSave(formData);
      return;
    }

    // Q3: ONE merged confirmation — it names the genres that will be removed
    // (also serves as the save confirmation; D7 in-app dialog, no window.confirm)
    const current = new Set(this._movie.genres || []);
    const next = new Set(formData.genres || []);
    const removed = [...current].filter(g => !next.has(g));
    let message = 'آیا از ذخیره این تغییرات اطمینان دارید؟';
    if (removed.length) {
      message = `ژانرهای حذف‌شده: ${removed.join('، ')}\n` +
        'پوستر مربوط از پوشه آن ژانر حذف می‌شود.\n' +
        'آیا از ذخیره این تغییرات اطمینان دارید؟';
    }
    document.getElementById('confirmModal').show(
      message,
      'تأیید ذخیره تغییرات',
      () => this._performSave(formData)
    );
  }

  _readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async _performSave(formData) {
    const isGame = this._isGame(this._movie);
    const saveBtn = this.querySelector('#editSaveBtn');
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');

    saveBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      let body = formData;
      if (this._posterFile) {
        const dataUrl = await this._readAsDataURL(this._posterFile);
        body = { ...formData, poster: dataUrl };
      }
      // Q1: canonical by-uid URL for every type — poster rides the same PUT
      const url = `/api/movies/by-uid/${encodeURIComponent(this._movie.uid)}`;
      const resp = await api(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      let data = {};
      try { data = await resp.json(); } catch {}

      if (resp.ok && data.success) {
        showToast(isGame ? 'بازی با موفقیت بروزرسانی شد' : 'فیلم با موفقیت بروزرسانی شد', 'success');
        this.hide();
        await store.loadCatalog();
        // Games never ride the movie catalog fetch — refetch them explicitly (E4)
        if (isGame) await store.fetchGames();
      } else {
        this._showServerError(resp.status, data);
      }
    } catch {
      this._setFormError('خطا در اتصال به سرور');
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      saveBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }

  /**
   * Q6: map the structured `code` to an inline slot; display the server's
   * Persian text verbatim. Unknown codes fall back to the form-level alert.
   */
  _showServerError(status, data) {
    const code = data && data.code;
    const msg = (data && data.error) || 'خطا در بروزرسانی فیلم';
    const sel = code ? CODE_FIELD[code] : null;
    if (sel) {
      this._setFieldError(sel, msg);
    } else {
      this._setFormError(msg);
    }
  }

  /**
   * P6b E3: second-click confirmation (Q1, owner-approved) — nothing is
   * deleted before the confirm dialog. The message names the title and
   * promises recoverability from the trash (D6 soft delete). Games delete the
   * same way with game wording (P6c E4).
   */
  _handleDelete() {
    const m = this._movie;
    if (!m) return;
    const isGame = this._isGame(m);
    const message = `«${m.title || ''}» حذف و به سطل زباله منتقل می‌شود.\n` +
      'از بخش «سطل زباله» در پنل مدیر قابل بازگردانی است.\n' +
      'آیا مطمئن هستید؟';
    document.getElementById('confirmModal').show(
      message,
      isGame ? 'حذف بازی' : 'حذف فیلم',
      () => this._performDelete()
    );
  }

  async _performDelete() {
    const m = this._movie;
    if (!m) return;
    const isGame = this._isGame(m);
    try {
      const resp = await api(`/api/movies/by-uid/${encodeURIComponent(m.uid)}`, {
        method: 'DELETE'
      });
      let data = {};
      try { data = await resp.json(); } catch {}

      if (resp.ok && data.success) {
        showToast(`«${m.title}» به سطل زباله منتقل شد`, 'success');
        this.hide();
        document.dispatchEvent(new CustomEvent('trash-changed'));
        await store.loadCatalog();
        // Games never ride the movie catalog fetch — refetch them explicitly (E4)
        if (isGame) await store.fetchGames();
      } else {
        // Server's Persian error verbatim — modal stays open, movie stays put
        showToast((data && data.error) || 'حذف فیلم ناموفق بود', 'error');
      }
    } catch {
      showToast('خطا در اتصال به سرور', 'error');
    }
  }
}

customElements.define('edit-modal', EditModal);
