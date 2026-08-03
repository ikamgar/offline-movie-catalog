/**
 * AddModal Component
 * Modal dialog for managers to add new movies
 */

import { store, showToast } from '../store.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

class AddModal extends HTMLElement {
  constructor() {
    super();
    this._posterFile = null;
    this._posterPreview = null;
    this._handleKeydown = this._handleKeydown.bind(this);
    this._genres = [];
    this._selectedGenres = new Set();
  }

  show() {
    this.classList.remove('hidden');
    this._loadGenres();
    this.render();
    document.addEventListener('keydown', this._handleKeydown);
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.classList.add('hidden');
    this._posterFile = null;
    this._posterPreview = null;
    this._selectedGenres.clear();
    document.removeEventListener('keydown', this._handleKeydown);
    document.body.style.overflow = '';
  }

  _loadGenres() {
    // Load genres from the store
    this._genres = store.state.genres || [];
  }

  render() {
    this.innerHTML = `
      <div class="edit-modal-backdrop" id="addBackdrop">
        <div class="edit-modal" onclick="event.stopPropagation()">
          <div class="edit-modal-header">
            <h2 class="edit-modal-title">افزودن فیلم جدید</h2>
            <button class="edit-modal-close" id="addClose" title="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form class="edit-modal-body" id="addForm">
            <!-- Poster Upload -->
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
            </div>

            <!-- Type Selector -->
            <div class="edit-form-group">
              <label>نوع محتوا <span class="required">*</span></label>
              <div class="type-selector" id="typeSelector">
                <button type="button" class="type-btn active" data-type="Movie">فیلم</button>
                <button type="button" class="type-btn" data-type="Animation">انیمیشن</button>
                <button type="button" class="type-btn" data-type="Iranian">ایرانی</button>
                <button type="button" class="type-btn" data-type="Series">سریال</button>
              </div>
              <input type="hidden" id="contentType" name="type" value="Movie">
            </div>

            <!-- ID Field -->
            <div class="edit-form-group" id="idFieldGroup">
              <label for="addId">شناسه/کد</label>
              <input type="text" id="addId" name="id" placeholder="خودکار تولید می‌شود">
              <span class="form-hint" id="idHint">شناسه به صورت خودکار تولید می‌شود</span>
            </div>

            <!-- Title -->
            <div class="edit-form-group">
              <label for="addTitle">عنوان <span class="required">*</span></label>
              <input type="text" id="addTitle" name="title" required placeholder="نام فیلم">
            </div>

            <!-- Year -->
            <div class="edit-form-group" id="yearFieldGroup">
              <label for="addYear">سال انتشار</label>
              <input type="number" id="addYear" name="year" min="1900" max="2100" placeholder="مثال: 2024">
            </div>

            <!-- Genre Selector (for Movie type) -->
            <div class="edit-form-group" id="genreFieldGroup">
              <label>ژانرها <span class="required">*</span></label>
              <div class="genre-selector" id="genreSelector">
                ${this._renderGenreOptions()}
              </div>
            </div>

            <!-- IMDB Rating -->
            <div class="edit-form-group">
              <label for="addImdb">امتیاز IMDB</label>
              <input type="number" id="addImdb" name="imdbRating" step="0.1" min="0" max="10" placeholder="مثال: 8.5">
            </div>

            <!-- Plot Summary -->
            <div class="edit-form-group">
              <label for="addPlot">خلاصه داستان</label>
              <textarea id="addPlot" name="plotSummary" rows="4" placeholder="خلاصه‌ای از داستان فیلم..."></textarea>
            </div>

            <!-- Filename Preview -->
            <div class="filename-preview" id="filenamePreview">
              <span class="filename-preview-label">نام فایل:</span>
              <span class="filename-preview-value" id="filenameValue">—</span>
            </div>

            <!-- Actions -->
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
    this._updateFilenamePreview();
  }

  _renderGenreOptions() {
    return this._genres.map(genre => `
      <label class="genre-checkbox">
        <input type="checkbox" name="genres" value="${genre}">
        <span class="genre-checkbox-label">${genre}</span>
      </label>
    `).join('');
  }

  _bindEvents() {
    // Close buttons
    this.querySelector('#addClose').addEventListener('click', () => this.hide());
    this.querySelector('#addCancelBtn').addEventListener('click', () => this.hide());
    this.querySelector('#addBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });

    // Form submission
    this.querySelector('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    // Poster upload
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

    // Type selector
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

    // Genre checkboxes
    this.querySelectorAll('input[name="genres"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this._updateFilenamePreview();
      });
    });

    // Title and year changes
    this.querySelector('#addTitle').addEventListener('input', () => {
      this._updateFilenamePreview();
    });
    this.querySelector('#addYear').addEventListener('input', () => {
      this._updateFilenamePreview();
    });
  }

  _handlePosterSelect(file) {
    // Validate file type
    const ext = file.name.split('.').pop().toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      showToast('فرمت تصویر نامعتبر است', 'error');
      return;
    }

    this._posterFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this._posterPreview = e.target.result;
      const preview = this.querySelector('#posterPreview');
      preview.innerHTML = `<img src="${e.target.result}" alt="پوستر" class="poster-preview-img">`;
    };
    reader.readAsDataURL(file);
  }

  async _updateIdPreview() {
    const type = this.querySelector('#contentType').value;
    const idInput = this.querySelector('#addId');
    const idHint = this.querySelector('#idHint');
    const idFieldGroup = this.querySelector('#idFieldGroup');

    // For Series, hide ID field
    if (type === 'Series') {
      idFieldGroup.style.display = 'none';
      idInput.value = '';
      return;
    }

    idFieldGroup.style.display = '';
    idInput.value = '';

    try {
      // Fetch next available ID from server
      const response = await fetch(`/api/movies/next-id?type=${type}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.nextId) {
          idInput.value = data.nextId;
          idHint.textContent = `شناسه پیشنهادی: ${data.nextId}`;
        }
      }
    } catch {
      // Fallback: show placeholder
      idHint.textContent = 'شناسه به صورت خودکار تولید می‌شود';
    }
  }

  _updateFilenamePreview() {
    const type = this.querySelector('#contentType').value;
    const title = this.querySelector('#addTitle').value.trim();
    const year = this.querySelector('#addYear').value;
    const id = this.querySelector('#addId').value;
    const previewEl = this.querySelector('#filenameValue');

    if (!title) {
      previewEl.textContent = '—';
      return;
    }

    // Get selected genres for preview
    const selectedGenres = [];
    this.querySelectorAll('input[name="genres"]:checked').forEach(cb => {
      selectedGenres.push(cb.value);
    });

    const cleanTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim();
    let filename = '';

    switch (type) {
      case 'Movie':
        filename = `${id || '????'}- ${cleanTitle} ${year || '????'}.jpg`;
        break;
      case 'Animation':
        filename = `${id || '?????'}-${cleanTitle}.jpg`;
        break;
      case 'Iranian':
        filename = `${id || '????'}-${cleanTitle}.jpg`;
        break;
      case 'Series':
        filename = `${cleanTitle}.jpg`;
        break;
    }

    previewEl.textContent = filename;

    // Show target folders for Movie type
    if (type === 'Movie' && selectedGenres.length > 0) {
      const folders = selectedGenres.map(g => `Library/Movies/${g}/`).join(', ');
      previewEl.title = `ذخیره در: ${folders}`;
    }
  }

  _updateFieldVisibility() {
    const type = this.querySelector('#contentType').value;
    const yearGroup = this.querySelector('#yearFieldGroup');
    const genreGroup = this.querySelector('#genreFieldGroup');

    // Year is required for Movie, optional for others
    if (type === 'Movie') {
      yearGroup.querySelector('label').innerHTML = 'سال انتشار <span class="required">*</span>';
    } else {
      yearGroup.querySelector('label').innerHTML = 'سال انتشار';
    }

    // Genres only for Movie type
    if (type === 'Movie') {
      genreGroup.style.display = '';
    } else {
      genreGroup.style.display = 'none';
    }
  }

  async _handleSubmit() {
    const type = this.querySelector('#contentType').value;
    const title = this.querySelector('#addTitle').value.trim();
    const year = this.querySelector('#addYear').value ? parseInt(this.querySelector('#addYear').value) : null;
    const id = this.querySelector('#addId').value.trim();
    const imdbRating = this.querySelector('#addImdb').value ? parseFloat(this.querySelector('#addImdb').value) : null;
    const plotSummary = this.querySelector('#addPlot').value.trim();

    // Collect selected genres
    const genres = [];
    this.querySelectorAll('input[name="genres"]:checked').forEach(cb => {
      genres.push(cb.value);
    });

    // Validation
    if (!title) {
      showToast('عنوان فیلم الزامی است', 'error');
      return;
    }

    if (!this._posterFile) {
      showToast('تصویر پوستر الزامی است', 'error');
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

    // Convert poster to base64
    const base64Poster = await this._fileToBase64(this._posterFile);

    // Prepare data
    const movieData = {
      title,
      type,
      year,
      genres,
      id: id || undefined,
      imdbRating,
      plotSummary,
      poster: base64Poster
    };

    const saveBtn = this.querySelector('#addSaveBtn');
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');

    saveBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      const response = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movieData)
      });

      const data = await response.json();

      if (data.success) {
        showToast('فیلم با موفقیت اضافه شد', 'success');
        this.hide();
        // Refresh movie list
        await store.init();
      } else {
        showToast(data.error || 'خطا در افزودن فیلم', 'error');
      }
    } catch (error) {
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      saveBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') this.hide();
  }
}

customElements.define('add-modal', AddModal);
