/**
 * AddModal Component
 * Modal dialog for managers to add new movies
 *
 * P6c E2 (FE-13 / ARCH-03):
 *  - posters are re-encoded client-side (max 1400px, JPEG q0.85) before upload
 *  - files > 30 MB or undecodable images are rejected with Persian messages
 *  - every failure cause gets its own toast (400/409/413/network; 401 is
 *    handled by api.js — its raw code must never leak into a second toast)
 *  - managers can create a genre inline while adding a movie
 *  - a probable duplicate (same normalised title + year) asks for confirmation
 *    and NEVER blocks the create
 *  - the filename preview comes from POST /api/movies/preview — the server
 *    shares the ONE builder with creator/editor, so this file keeps no copy
 *
 * P6c E4 (games management):
 *  - a «بازی» content-type chip swaps id/year/genre/imdb/plot for PS4/PS5
 *    platform checkboxes and POSTs /api/games (AC4)
 *  - no platform selected → Persian toast, no request (AC6)
 *  - a probable duplicate GAME (normalised title, no year) asks the same
 *    warn-never-block confirmation against store.state.games
 */

import { store, showToast } from '../store.js';
import { api } from '../utils/api.js';
import { html, raw } from '../utils/html.js';
import { trapFocus } from '../utils/dialog.js';
import { normalizeFa } from '../utils/text.js';
import { config } from '../config.js';

const MAX_POSTER_BYTES = 30 * 1024 * 1024;
const DOWNSCALE_MAX_SIDE = 1400;
const DOWNSCALE_QUALITY = 0.85;

class AddModal extends HTMLElement {
  constructor() {
    super();
    this._posterFile = null;
    this._posterPreview = null;
    this._posterExt = null;
    this._releaseFocus = null;
    this._genres = [];
    this._selectedGenres = new Set();
    this._previewTimer = null;
    this._previewSeq = 0;
  }

  show() {
    this.classList.remove('hidden');
    this._loadGenres();
    this.render();
    this._releaseFocus = trapFocus(this.querySelector('#addModal'), {
      onClose: () => this.hide()
    });
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.classList.add('hidden');
    clearTimeout(this._previewTimer);
    this._posterFile = null;
    this._posterPreview = null;
    this._posterExt = null;
    this._selectedGenres.clear();
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
    document.body.style.overflow = '';
  }

  _loadGenres() {
    this._genres = store.state.genres || [];
  }

  render() {
    // In games mode the add dialog opens on the game type («افزودن بازی») —
    // the manager can still switch chips freely (P6c E4).
    const gamesMode = store.state.mediaMode === 'games';
    const defaultType = gamesMode ? 'Game' : 'Movie';
    this.innerHTML = html`
      <div class="edit-modal-backdrop" id="addBackdrop">
        <div class="edit-modal" id="addModal" role="dialog" aria-modal="true" aria-labelledby="addModalTitle">
          <div class="edit-modal-header">
            <h2 class="edit-modal-title" id="addModalTitle">افزودن فیلم جدید</h2>
            <button class="edit-modal-close modal-close" id="addClose" title="بستن" aria-label="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form class="edit-modal-body" id="addForm">
            <div class="edit-form-group">
              <label>پوستر فیلم <span class="required">*</span></label>
              <div class="poster-upload-area" id="posterUploadArea">
                <div class="poster-preview" id="posterPreview">
                  <div class="poster-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span>برای آپلود کلیک کنید یا فایل را بکشید</span>
                    <span class="poster-formats">فرمت‌های پشتیبانی: JPG, PNG, WebP, AVIF</span>
                  </div>
                </div>
                <input type="file" id="posterInput" accept="image/*" style="display:none">
              </div>
              <div class="poster-size-hint" id="posterSizeHint"></div>
            </div>

            <div class="edit-form-group">
              <label>نوع محتوا <span class="required">*</span></label>
              <div class="type-selector" id="typeSelector">
                <button type="button" class="type-btn${defaultType === 'Movie' ? ' active' : ''}" data-type="Movie">فیلم</button>
                <button type="button" class="type-btn${defaultType === 'Animation' ? ' active' : ''}" data-type="Animation">انیمیشن</button>
                <button type="button" class="type-btn${defaultType === 'Iranian' ? ' active' : ''}" data-type="Iranian">ایرانی</button>
                <button type="button" class="type-btn${defaultType === 'Series' ? ' active' : ''}" data-type="Series">سریال</button>
                <button type="button" class="type-btn${defaultType === 'Game' ? ' active' : ''}" data-type="Game">بازی</button>
              </div>
              <input type="hidden" id="contentType" name="type" value="${defaultType}">
            </div>

            <div class="edit-form-group" id="platformFieldGroup" style="display:none">
              <label>پلتفرم <span class="required">*</span></label>
              <div class="genre-selector" id="platformSelector">
                <label class="genre-checkbox">
                  <input type="checkbox" name="platforms" value="PS4" ${gamesMode ? raw('checked') : ''}>
                  <span class="genre-checkbox-label">PS4</span>
                </label>
                <label class="genre-checkbox">
                  <input type="checkbox" name="platforms" value="PS5">
                  <span class="genre-checkbox-label">PS5</span>
                </label>
              </div>
            </div>

            <div class="edit-form-group" id="idFieldGroup">
              <label for="addId">شناسه/کد</label>
              <input type="text" id="addId" name="id" placeholder="خودکار تولید می‌شود">
              <span class="form-hint" id="idHint">شناسه به صورت خودکار تولید می‌شود</span>
            </div>

            <div class="edit-form-group">
              <label for="addTitle">عنوان <span class="required">*</span></label>
              <input type="text" id="addTitle" name="title" required placeholder="نام فیلم">
            </div>

            <div class="edit-form-group" id="yearFieldGroup">
              <label for="addYear" id="addYearLabel">سال انتشار</label>
              <input type="number" id="addYear" name="year" min="1900" max="2100" placeholder="مثال: 2024">
            </div>

            <div class="edit-form-group" id="genreFieldGroup">
              <label>ژانرها <span class="required">*</span></label>
              <div class="genre-selector" id="genreSelector">
                ${raw(this._renderGenreOptions())}
              </div>
              <div class="genre-create-row">
                <input type="text" id="newGenreInput" placeholder="نام ژانر جدید..." maxlength="60">
                <button type="button" class="btn btn-secondary btn-sm" id="genreCreateBtn">افزودن</button>
              </div>
            </div>

            <div class="edit-form-group" id="imdbFieldGroup">
              <label for="addImdb">امتیاز IMDB</label>
              <input type="number" id="addImdb" name="imdbRating" step="0.1" min="0" max="10" placeholder="مثال: 8.5">
            </div>

            <div class="edit-form-group" id="plotFieldGroup">
              <label for="addPlot">خلاصه داستان</label>
              <textarea id="addPlot" name="plotSummary" rows="4" placeholder="خلاصه‌ای از داستان..."></textarea>
            </div>

            <div class="filename-preview" id="filenamePreview">
              <span class="filename-preview-label">نام فایل:</span>
              <span class="filename-preview-value" id="filenameValue">—</span>
            </div>

            <div class="edit-form-actions">
              <button type="button" class="btn btn-secondary" id="addCancelBtn">انصراف</button>
              <button type="submit" class="btn btn-primary" id="addSaveBtn">
                <span class="btn-text">ذخیره</span>
                <span class="btn-loading" style="display:none;">در حال ذخیره...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._bindEvents();
    this._updateIdPreview();
    this._updateFieldVisibility();
    this._updateFilenamePreview();
  }

  _renderGenreOptions() {
    return this._genres.map(genre => html`
      <label class="genre-checkbox">
        <input type="checkbox" name="genres" value="${genre}">
        <span class="genre-checkbox-label">${genre}</span>
      </label>
    `).join('');
  }

  _bindEvents() {
    this.querySelector('#addClose').addEventListener('click', () => this.hide());
    this.querySelector('#addCancelBtn').addEventListener('click', () => this.hide());
    this.querySelector('#addBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });
    this.querySelector('#addModal').addEventListener('click', (e) => e.stopPropagation());

    this.querySelector('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    const uploadArea = this.querySelector('#posterUploadArea');
    const posterInput = this.querySelector('#posterInput');

    uploadArea.addEventListener('click', () => posterInput.click());
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this._handlePosterSelect(files[0]);
      }
    });

    posterInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this._handlePosterSelect(e.target.files[0]);
      }
    });

    this.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.querySelector('#contentType').value = btn.dataset.type;
        this._updateIdPreview();
        this._updateFilenamePreview();
        this._updateFieldVisibility();
      });
    });

    this.querySelectorAll('input[name="genres"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this._updateFilenamePreview();
      });
    });

    this.querySelector('#addTitle').addEventListener('input', () => {
      this._updateFilenamePreview();
    });
    this.querySelector('#addYear').addEventListener('input', () => {
      this._updateFilenamePreview();
    });

    this.querySelector('#genreCreateBtn').addEventListener('click', () => this._handleAddGenre());
    this.querySelector('#newGenreInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._handleAddGenre();
      }
    });
  }

  async _handlePosterSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!(config.imageExtensions || []).includes(ext)) {
      showToast('فرمت تصویر نامعتبر است', 'error');
      return;
    }

    if (file.size > MAX_POSTER_BYTES) {
      showToast('حجم فایل بیش از حد مجاز است (حداکثر ۳۰ مگابایت)', 'error');
      return;
    }

    try {
      const { dataUrl, bytes } = await this._downscalePoster(file);
      this._posterFile = file;
      this._posterPreview = dataUrl;
      this._posterExt = dataUrl.startsWith('data:image/webp') ? 'webp'
        : dataUrl.startsWith('data:image/png') ? 'png'
        : 'jpg';
      const preview = this.querySelector('#posterPreview');
      preview.innerHTML = html`<img src="${dataUrl}" alt="پوستر" class="poster-preview-img">`;
      const hint = this.querySelector('#posterSizeHint');
      if (hint) hint.textContent = `حجم نهایی: ${Math.round(bytes / 1024)} KB`;
      this._updateFilenamePreview();
    } catch {
      showToast('تصویر پوستر قابل پردازش نیست', 'error');
    }
  }

  /**
   * Always re-encode: longest side ≤ 1400px, JPEG q0.85 (WebP when the image
   * actually has transparency and the browser can encode it). Rejects
   * undecodable files (the caller shows a Persian toast).
   * The File is read as a data: URL — the app CSP is `img-src 'self' data:`,
   * which blocks the blob: URLs a naive implementation would use.
   */
  _downscalePoster(file) {
    return new Promise((resolve, reject) => {
      const failLocal = (err) => reject(err || new Error('poster decode failed'));
      const reader = new FileReader();
      reader.onerror = () => failLocal();
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => failLocal();
        img.onload = () => {
          try {
            const scale = Math.min(1, DOWNSCALE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            let hasAlpha = false;
            if (file.type !== 'image/jpeg') {
              const data = ctx.getImageData(0, 0, w, h).data;
              for (let i = 3; i < data.length; i += 4) {
                if (data[i] < 255) {
                  hasAlpha = true;
                  break;
                }
              }
            }

            let mime = 'image/jpeg';
            if (hasAlpha) {
              const webp = canvas.toDataURL('image/webp', DOWNSCALE_QUALITY);
              if (webp.startsWith('data:image/webp')) mime = 'image/webp';
            }
            const dataUrl = canvas.toDataURL(mime, DOWNSCALE_QUALITY);
            const b64 = dataUrl.split(',')[1] || '';
            resolve({ dataUrl, bytes: Math.floor(b64.length * 3 / 4) });
          } catch (err) {
            failLocal(err);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async _updateIdPreview() {
    const type = this.querySelector('#contentType').value;
    const idInput = this.querySelector('#addId');
    const idHint = this.querySelector('#idHint');
    const idFieldGroup = this.querySelector('#idFieldGroup');

    if (type === 'Series' || type === 'Game') {
      // Series have no id (I5); games have no id either and the next-id
      // endpoint only knows Movie/Animation/Iranian/Series (P6c E4).
      idFieldGroup.style.display = 'none';
      idInput.value = '';
      return;
    }

    idFieldGroup.style.display = '';
    idInput.value = '';

    try {
      const response = await api(`/api/movies/next-id?type=${type}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.nextId) {
          idInput.value = data.nextId;
          idHint.textContent = `شناسه پیشنهادی: ${data.nextId}`;
          this._updateFilenamePreview();
        }
      }
    } catch {
      idHint.textContent = 'شناسه به صورت خودکار تولید می‌شود';
    }
  }

  _updateFieldVisibility() {
    const type = this.querySelector('#contentType').value;
    const isGame = type === 'Game';
    const yearLabel = this.querySelector('#addYearLabel');
    const idGroup = this.querySelector('#idFieldGroup');
    const yearGroup = this.querySelector('#yearFieldGroup');
    const genreGroup = this.querySelector('#genreFieldGroup');
    const imdbGroup = this.querySelector('#imdbFieldGroup');
    const plotGroup = this.querySelector('#plotFieldGroup');
    const platformGroup = this.querySelector('#platformFieldGroup');

    if (type === 'Movie') {
      yearLabel.innerHTML = 'سال انتشار <span class="required">*</span>';
    }

    // Games carry platforms instead of id/year/genre/imdb/plot (P6c E4);
    // Series keep their year but never an id (I5).
    if (idGroup) idGroup.style.display = (isGame || type === 'Series') ? 'none' : '';
    if (yearGroup) yearGroup.style.display = isGame ? 'none' : '';
    if (genreGroup) genreGroup.style.display = type === 'Movie' ? '' : 'none';
    if (imdbGroup) imdbGroup.style.display = isGame ? 'none' : '';
    if (plotGroup) plotGroup.style.display = isGame ? 'none' : '';
    if (platformGroup) platformGroup.style.display = isGame ? '' : 'none';
  }

  _updateFilenamePreview() {
    const previewEl = this.querySelector('#filenameValue');
    if (!previewEl) return;
    const type = this.querySelector('#contentType').value;
    const title = this.querySelector('#addTitle').value.trim();
    clearTimeout(this._previewTimer);

    const selectedGenres = [];
    this.querySelectorAll('input[name="genres"]:checked').forEach(cb => {
      selectedGenres.push(cb.value);
    });
    if (type === 'Movie' && selectedGenres.length > 0) {
      const folders = selectedGenres.map(g => `Library/Movies/${g}/`).join(', ');
      previewEl.title = `ذخیره در: ${folders}`;
    } else {
      previewEl.title = '';
    }

    if (!title) {
      previewEl.textContent = '—';
      return;
    }

    this._previewTimer = setTimeout(() => this._fetchFilenamePreview(), 250);
  }

  /** ARCH-03: the value shown here is whatever the server builder returns. */
  async _fetchFilenamePreview() {
    const previewEl = this.querySelector('#filenameValue');
    if (!previewEl) return;
    const body = {
      type: this.querySelector('#contentType').value,
      title: this.querySelector('#addTitle').value.trim(),
      year: this.querySelector('#addYear').value || null,
      id: this.querySelector('#addId').value.trim() || undefined,
      extension: this._posterExt || 'jpg'
    };
    const seq = ++this._previewSeq;
    try {
      const response = await api('/api/movies/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (seq !== this._previewSeq) return;
      if (!response.ok) {
        previewEl.textContent = '—';
        return;
      }
      const data = await response.json();
      if (seq !== this._previewSeq) return;
      if (data.success && data.filename) {
        previewEl.textContent = data.filename;
      }
    } catch {
      if (seq === this._previewSeq) previewEl.textContent = '—';
    }
  }

  _handleAddGenre() {
    const input = this.querySelector('#newGenreInput');
    if (!input) return;
    const name = (input.value || '').trim();
    if (!name || name.length > 60 || name === '..' || /[/\\]/.test(name)) {
      showToast('نام ژانر نامعتبر است', 'error');
      return;
    }

    const existing = this._findGenreCheckbox(name);
    if (existing) {
      existing.checked = true;
      input.value = '';
      this._updateFilenamePreview();
      return;
    }

    const label = document.createElement('label');
    label.className = 'genre-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'genres';
    checkbox.value = name;
    checkbox.checked = true;
    const span = document.createElement('span');
    span.className = 'genre-checkbox-label';
    span.textContent = name;
    label.appendChild(checkbox);
    label.appendChild(span);
    this.querySelector('#genreSelector').appendChild(label);
    checkbox.addEventListener('change', () => this._updateFilenamePreview());

    input.value = '';
    this._updateFilenamePreview();
  }

  _findGenreCheckbox(name) {
    const boxes = Array.from(this.querySelectorAll('input[name="genres"]'));
    return boxes.find(cb => cb.value === name) || null;
  }

  /** Probable duplicate: same normalised title AND same year (warn, never block). */
  _findProbableDuplicate(title, year) {
    const target = normalizeFa(title);
    if (!target) return null;
    const y = year || null;
    return (store.state.movies || []).find(m =>
      m && m.title && normalizeFa(m.title) === target && (m.year || null) === y
    ) || null;
  }

  /** Probable duplicate GAME: games have no year — title only (P6c E4). */
  _findProbableGameDuplicate(title) {
    const target = normalizeFa(title);
    if (!target) return null;
    return (store.state.games || []).find(g =>
      g && g.title && normalizeFa(g.title) === target
    ) || null;
  }

  async _handleSubmit() {
    const type = this.querySelector('#contentType').value;
    const isGame = type === 'Game';
    const title = this.querySelector('#addTitle').value.trim();
    const year = this.querySelector('#addYear').value ? parseInt(this.querySelector('#addYear').value) : null;
    const id = this.querySelector('#addId').value.trim();
    const imdbRating = this.querySelector('#addImdb').value ? parseFloat(this.querySelector('#addImdb').value) : null;
    const plotSummary = this.querySelector('#addPlot').value.trim();

    const genres = [];
    this.querySelectorAll('input[name="genres"]:checked').forEach(cb => {
      genres.push(cb.value);
    });

    const platforms = [];
    this.querySelectorAll('#platformFieldGroup input[name="platforms"]:checked').forEach(cb => {
      platforms.push(cb.value);
    });

    if (!title) {
      showToast('عنوان فیلم الزامی است', 'error');
      return;
    }

    if (!this._posterFile) {
      showToast('تصویر پوستر الزامی است', 'error');
      return;
    }

    if (isGame && platforms.length === 0) {
      showToast('حداقل یک پلتفرم انتخاب کنید', 'error');
      return;
    }

    if (type === 'Movie') {
      if (!year) {
        showToast('سال انتشار برای فیلم الزامی است', 'error');
        return;
      }
      if (genres.length === 0) {
        showToast('حداقل یک ژانر برای فیلم الزامی است', 'error');
        return;
      }
    }

    const payload = isGame
      ? { type, title, platforms }
      : { type, title, year, id, imdbRating, plotSummary, genres };

    const duplicate = isGame
      ? this._findProbableGameDuplicate(title)
      : this._findProbableDuplicate(title, year);
    if (duplicate) {
      const message = isGame
        ? `عنوان «${title}» از قبل وجود دارد. آیا ادامه می‌دهید؟`
        : `عنوان «${title}» با سال ${year || '—'} از قبل وجود دارد. آیا ادامه می‌دهید؟`;
      document.getElementById('confirmModal').show(
        message,
        'احتمال تکرار',
        () => this._performSubmit(payload)
      );
      return;
    }

    await this._performSubmit(payload);
  }

  async _performSubmit(payload) {
    const isGame = payload.type === 'Game';
    const movieData = isGame
      ? {
          title: payload.title,
          platforms: payload.platforms,
          poster: this._posterPreview
        }
      : {
          title: payload.title,
          type: payload.type,
          year: payload.year,
          genres: payload.genres,
          id: payload.id || undefined,
          imdbRating: payload.imdbRating,
          plotSummary: payload.plotSummary,
          poster: this._posterPreview
        };

    const saveBtn = this.querySelector('#addSaveBtn');
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');

    saveBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      const response = await api(isGame ? '/api/games' : '/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movieData)
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        // non-JSON body — fall through to the generic message below
      }

      if (data.success) {
        showToast(isGame ? 'بازی با موفقیت اضافه شد' : 'فیلم با موفقیت اضافه شد', 'success');
        this.hide();
        await store.loadCatalog();
        // Games never ride the movie catalog fetch — refetch them explicitly (E4)
        if (isGame) await store.fetchGames();
      } else if (response.status === 401) {
        // api() already toasted the session message and dropped us to
        // customer mode (FE-08) — the raw UNAUTHORIZED code must not leak.
      } else {
        showToast(data.error || (isGame ? 'خطا در افزودن بازی' : 'خطا در افزودن فیلم'), 'error');
      }
    } catch {
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      saveBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }
}

customElements.define('add-modal', AddModal);
