/**
 * LoginModal Component
 * Modal dialog for admin login
 */

import { store, showToast } from '../store.js';

class LoginModal extends HTMLElement {
  constructor() {
    super();
    this._isOpen = false;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>ورود مدیر</h3>
            <button class="btn-icon modal-close" id="closeBtn" title="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <form class="modal-body" id="loginForm">
            <div class="form-group">
              <label for="username">نام کاربری</label>
              <input type="text" id="username" name="username" required autocomplete="username" placeholder="admin">
            </div>
            <div class="form-group">
              <label for="password">رمز عبور</label>
              <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••">
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost" id="cancelBtn">انصراف</button>
              <button type="submit" class="btn btn-primary" id="submitBtn">ورود</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._bindEvents();
    this._applyStyles();
  }

  _applyStyles() {
    const style = document.createElement('style');
    style.textContent = `
      login-modal {
        display: none;
      }
      login-modal.open {
        display: block;
      }
      login-modal .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
      }
      login-modal .modal-dialog {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-xl);
        width: 90%;
        max-width: 400px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      login-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border-primary);
      }
      login-modal .modal-header h3 {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      login-modal .modal-body {
        padding: var(--space-5);
      }
      login-modal .form-group {
        margin-bottom: var(--space-4);
      }
      login-modal .form-group label {
        display: block;
        margin-bottom: var(--space-2);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
      }
      login-modal .form-group input {
        width: 100%;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-input);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: var(--font-size-base);
        transition: border-color var(--transition-base);
        box-sizing: border-box;
      }
      login-modal .form-group input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
        box-shadow: 0 0 0 3px rgba(91, 127, 255, 0.2);
      }
      login-modal .form-group input::placeholder {
        color: var(--color-text-muted);
      }
      login-modal .form-actions {
        display: flex;
        gap: var(--space-3);
        justify-content: flex-end;
        margin-top: var(--space-6);
      }
      login-modal .btn {
        padding: var(--space-2) var(--space-5);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: all var(--transition-base);
      }
      login-modal .btn-ghost {
        background: transparent;
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
      }
      login-modal .btn-ghost:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
      }
      login-modal .btn-primary {
        background: var(--color-accent-primary);
        border: 1px solid var(--color-accent-primary);
        color: white;
      }
      login-modal .btn-primary:hover {
        background: var(--color-accent-hover);
        border-color: var(--color-accent-hover);
      }
      login-modal .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  _bindEvents() {
    this.querySelector('#closeBtn').addEventListener('click', () => this.close());
    this.querySelector('#cancelBtn').addEventListener('click', () => this.close());
    this.querySelector('#modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    this.querySelector('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleLogin();
    });
  }

  async _handleLogin() {
    const username = this.querySelector('#username').value.trim();
    const password = this.querySelector('#password').value;
    const submitBtn = this.querySelector('#submitBtn');

    if (!username || !password) {
      showToast('لطفاً نام کاربری و رمز عبور را وارد کنید', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'در حال ورود...';

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        store.setAdminSession(data.token);
        showToast('ورود موفقیت‌آمیز بود', 'success');
        this.close();
      } else {
        showToast(data.error || 'نام کاربری یا رمز عبور اشتباه است', 'error');
      }
    } catch {
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ورود';
    }
  }

  show() {
    this._isOpen = true;
    this.classList.add('open');
    this.querySelector('#username').value = '';
    this.querySelector('#password').value = '';
    setTimeout(() => this.querySelector('#username').focus(), 100);
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
  }
}

customElements.define('login-modal', LoginModal);
