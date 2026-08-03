/**
 * ConfirmModal Component
 * Reusable confirmation dialog matching the application's design language
 */

class ConfirmModal extends HTMLElement {
  constructor() {
    super();
    this._isOpen = false;
    this._onConfirm = null;
    this._onCancel = null;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 id="modalTitle">تأیید عملیات</h3>
            <button class="btn-icon modal-close" id="closeBtn" title="بستن">
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
    this._applyStyles();
  }

  _applyStyles() {
    const styleId = 'confirm-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      confirm-modal {
        display: none;
      }
      confirm-modal.open {
        display: block;
      }
      confirm-modal .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
      }
      confirm-modal .modal-dialog {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-xl);
        width: 90%;
        max-width: 400px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      confirm-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border-primary);
      }
      confirm-modal .modal-header h3 {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      confirm-modal .modal-body {
        padding: var(--space-5);
      }
      confirm-modal .confirm-message {
        margin: 0 0 var(--space-6) 0;
        font-size: var(--font-size-base);
        color: var(--color-text-secondary);
        line-height: 1.6;
      }
      confirm-modal .form-actions {
        display: flex;
        gap: var(--space-3);
        justify-content: flex-end;
      }
      confirm-modal .btn {
        padding: var(--space-2) var(--space-5);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: all var(--transition-base);
      }
      confirm-modal .btn-ghost {
        background: transparent;
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
      }
      confirm-modal .btn-ghost:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
      }
      confirm-modal .btn-primary {
        background: var(--color-accent-primary);
        border: 1px solid var(--color-accent-primary);
        color: white;
      }
      confirm-modal .btn-primary:hover {
        background: var(--color-accent-hover);
        border-color: var(--color-accent-hover);
      }
    `;
    document.head.appendChild(style);
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

    this.querySelector('#modalTitle').textContent = title || 'تأیید عملیات';
    this.querySelector('#confirmMessage').textContent = message;

    this._isOpen = true;
    this.classList.add('open');
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
  }
}

customElements.define('confirm-modal', ConfirmModal);
