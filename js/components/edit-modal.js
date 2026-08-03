/**
 * EditModal Component
 * Modal dialog for managers to edit movie details
 */

import { store, showToast } from '../store.js';

class EditModal extends HTMLElement {
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

    this.innerHTML = `
      <div class="edit-modal-backdrop" id="editBackdrop">
        <div class="edit-modal" onclick="event.stopPropagation()">
          <div class="edit-modal-header">
            <h2 class="edit-modal-title">ویرایش فیلم</h2>
            <button class="edit-modal-close" id="editClose" title="بستن">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form class="edit-modal-body" id="editForm">
            <div class="edit-form-group">
              <label for="editTitle">عنوان <span class="required">*</span></label>
              <input type="text" id="editTitle" name="title" required value="${m.title || ''}" placeholder="عنوان فیلم">
            </div>
            <div class="edit-form-row">
              <div class="edit-form-group">
                <label for="editYear">سال انتشار</label>
                <input type="number" id="editYear" name="year" min="1900" max="2100" value="${m.year || ''}" placeholder="مثال: 2024">
              </div>
              <div class="edit-form-group">
                <label for="editId">شناسه/کد <span class="required">*</span></label>
                <input type="number" id="editId" name="id" required value="${m.id || ''}" placeholder="مثال: 5273">
              </div>
            </div>
            <div class="edit-form-group">
              <label for="editImdb">امتیاز IMDB</label>
              <input type="number" id="editImdb" name="imdbRating" step="0.1" min="0" max="10" value="${m.imdbRating || ''}" placeholder="مثال: 8.5">
            </div>
            <div class="edit-form-group">
              <label for="editPlot">خلاصه داستان</label>
              <textarea id="editPlot" name="plotSummary" rows="4" placeholder="خلاصه‌ای از داستان فیلم...">${m.plotSummary || ''}</textarea>
            </div>
            <div class="edit-form-actions">
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
    this.querySelector('#editBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });
    this.querySelector('#editForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });
  }

  async _handleSubmit() {
    const formData = {
      title: this.querySelector('#editTitle').value.trim(),
      year: this.querySelector('#editYear').value ? parseInt(this.querySelector('#editYear').value) : null,
      id: this.querySelector('#editId').value.trim(),
      imdbRating: this.querySelector('#editImdb').value ? parseFloat(this.querySelector('#editImdb').value) : null,
      plotSummary: this.querySelector('#editPlot').value.trim()
    };

    // Validation
    if (!formData.title) {
      showToast('عنوان فیلم الزامی است', 'error');
      return;
    }
    if (!formData.id) {
      showToast('شناسه/کد فیلم الزامی است', 'error');
      return;
    }

    // Confirmation dialog
    const isConfirmed = window.confirm("آیا از ذخیره این تغییرات اطمینان دارید؟");
    if (!isConfirmed) {
      return; // Abort — modal stays open, no data sent
    }

    const saveBtn = this.querySelector('#editSaveBtn');
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');
    
    saveBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      const response = await fetch(`/api/movies/${this._movie.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        showToast('فیلم با موفقیت بروزرسانی شد', 'success');
        this.hide();
        // Refresh movie list
        await store.init();
      } else {
        showToast(data.error || 'خطا در بروزرسانی فیلم', 'error');
      }
    } catch (error) {
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      saveBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') this.hide();
  }
}

customElements.define('edit-modal', EditModal);
