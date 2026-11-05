/**
 * ShortcutsModal Component
 * Keyboard shortcuts reference modal
 */

import { trapFocus } from '../utils/dialog.js';

class ShortcutsModal extends HTMLElement {
  constructor() {
    super();
    this._handleKeydown = this._handleKeydown.bind(this);
    this._releaseFocus = null;
  }

  connectedCallback() {
    this.render();
    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  show() {
    this.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this.querySelector('.modal'), {
        onClose: () => this.hide()
      });
    }
  }

  hide() {
    this.classList.add('hidden');
    document.body.style.overflow = '';
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
  }

  render() {
    this.className = 'modal-backdrop hidden';
    this.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="shortcutsTitle">
        <div class="modal-header">
          <h3 class="modal-title" id="shortcutsTitle">میانبرهای صفحه‌کلید</h3>
          <button class="btn-icon modal-close" id="closeShortcuts" aria-label="بستن">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="shortcut-row">
            <span class="shortcut-label">رفتن به جستجو</span>
            <div class="shortcut-keys"><span class="kbd">/</span></div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">پاک کردن جستجو</span>
            <div class="shortcut-keys"><span class="kbd">Esc</span></div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">تغییر حالت نمایش</span>
            <div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">Shift</span><span class="kbd">D</span></div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">پنل انتخاب‌شده‌ها</span>
            <div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">B</span></div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">کپی شناسه‌های انتخابی</span>
            <div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">Shift</span><span class="kbd">C</span></div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">نمایش میانبرها</span>
            <div class="shortcut-keys"><span class="kbd">?</span></div>
          </div>
        </div>
      </div>
    `;

    this.addEventListener('click', (e) => {
      if (e.target === this) this.hide();
    });
    this.querySelector('#closeShortcuts').addEventListener('click', () => this.hide());
  }

  _handleKeydown(e) {
    if (e.key === '?' && !this._isInputFocused()) {
      e.preventDefault();
      this.show();
    }
  }

  _isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }
}

customElements.define('shortcuts-modal', ShortcutsModal);
