/**
 * LoginModal Component
 * Modal dialog for admin login and first-run setup
 */

import { store, showToast } from '../store.js';
import { trapFocus } from '../utils/dialog.js';

class LoginModal extends HTMLElement {
  constructor() {
    super();
    this._isOpen = false;
    this._setupMode = false;
    this._releaseFocus = null;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
          <div class="modal-header">
            <h3 id="loginTitle">ورود مدیر</h3>
            <button class="btn-icon modal-close" id="closeBtn" title="بستن" aria-label="بستن">
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
              <label for="password" id="passwordLabel">رمز عبور</label>
              <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••">
            </div>
            <div class="form-group" id="confirmGroup" style="display:none">
              <label for="confirmPassword">تکرار رمز عبور</label>
              <input type="password" id="confirmPassword" name="confirmPassword" autocomplete="new-password" placeholder="••••••">
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
  }

  _bindEvents() {
    this.querySelector('#closeBtn').addEventListener('click', () => this.close());
    this.querySelector('#cancelBtn').addEventListener('click', () => this.close());
    this.querySelector('#modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    this.querySelector('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (this._setupMode) {
        this._handleSetup();
      } else {
        this._handleLogin();
      }
    });
  }

  async _checkSetupRequired() {
    try {
      const resp = await fetch('/api/auth/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.setupRequired) {
          this._enterSetupMode();
          return;
        }
      }
    } catch {
      // Server not reachable — stay in login mode
    }
  }

  _enterSetupMode() {
    this._setupMode = true;
    this.querySelector('#loginTitle').textContent = 'ایجاد حساب مدیر';
    this.querySelector('#passwordLabel').textContent = 'رمز عبور جدید';
    this.querySelector('#confirmGroup').style.display = '';
    this.querySelector('#submitBtn').textContent = 'ایجاد حساب';
  }

  _exitSetupMode() {
    this._setupMode = false;
    this.querySelector('#loginTitle').textContent = 'ورود مدیر';
    this.querySelector('#passwordLabel').textContent = 'رمز عبور';
    this.querySelector('#confirmGroup').style.display = 'none';
    this.querySelector('#submitBtn').textContent = 'ورود';
  }

  async _handleSetup() {
    const username = this.querySelector('#username').value.trim();
    const password = this.querySelector('#password').value;
    const confirmPassword = this.querySelector('#confirmPassword').value;
    const submitBtn = this.querySelector('#submitBtn');

    if (!username || !password) {
      showToast('لطفاً نام کاربری و رمز عبور را وارد کنید', 'error');
      return;
    }

    if (password.length < 8) {
      showToast('رمز عبور باید حداقل ۸ کاراکتر باشد', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('رمز عبور و تکرار آن مطابقت ندارند', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'در حال ایجاد...';

    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success && data.token) {
        store.setAdminSession(data.token);
        showToast('حساب مدیر با موفقیت ایجاد شد', 'success');
        this._exitSetupMode();
        this.close();
      } else {
        showToast(data.error || 'خطا در ایجاد حساب مدیر', 'error');
      }
    } catch {
      showToast('خطا در اتصال به سرور', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this._setupMode ? 'ایجاد حساب' : 'ورود';
    }
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
    const confirmGroup = this.querySelector('#confirmGroup');
    if (confirmGroup) confirmGroup.querySelector('#confirmPassword').value = '';
    this._checkSetupRequired();
    setTimeout(() => {
      const active = document.activeElement;
      const typing = active && this.contains(active)
        && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      if (!typing) this.querySelector('#username').focus();
    }, 100);
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this.querySelector('.modal-dialog'), {
        onClose: () => this.close()
      });
    }
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
    this._exitSetupMode();
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
  }
}

customElements.define('login-modal', LoginModal);
