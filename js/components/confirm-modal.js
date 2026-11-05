/**
 * ConfirmModal Component
 * Reusable confirmation dialog matching the application's design language
 */

import { trapFocus } from '../utils/dialog.js';

class ConfirmModal extends HTMLElement {
  constructor() {
    super();
    this._isOpen = false;
    this._onConfirm = null;
    this._onCancel = null;
    this._releaseFocus = null;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <div class="modal-header">
            <h3 id="confirmTitle">تأیید عملیات</h3>
            <button class="btn-icon modal-close" id="closeBtn" title="بستن" aria-label="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="confirm-message" id="confirmMessage">آیا مطمئن هستید؟</p>
            <div class="form-actions">
              <button class="btn btn-ghost" id="cancelBtn">خیر</button>
              <button class="btn btn-primary" id="confirmBtn">بله</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.querySelector('#closeBtn').addEventListener('click', () => this._handleCancel());
    this.querySelector('#cancelBtn').addEventListener('click', () => this._handleCancel());
    this.querySelector('#confirmBtn').addEventListener('click', () => this._handleConfirm());
    this.querySelector('#modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._handleCancel();
    });
  }

  _handleConfirm() {
    this.close();
    if (typeof this._onConfirm === 'function') {
      this._onConfirm();
    }
  }

  _handleCancel() {
    this.close();
    if (typeof this._onCancel === 'function') {
      this._onCancel();
    }
  }

  /**
   * Show the confirmation dialog
   * @param {string} message - The confirmation message
   * @param {string} title - The dialog title
   * @param {function} onConfirm - Callback when confirmed
   * @param {function} onCancel - Callback when cancelled (optional)
   */
  show(message, title, onConfirm, onCancel) {
    this._onConfirm = onConfirm;
    this._onCancel = onCancel;

    this.querySelector('#confirmTitle').textContent = title || 'تأیید عملیات';
    this.querySelector('#confirmMessage').textContent = message;

    this._isOpen = true;
    this.classList.add('open');
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this.querySelector('.modal-dialog'), {
        onClose: () => this._handleCancel()
      });
    }
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
  }
}

customElements.define('confirm-modal', ConfirmModal);
