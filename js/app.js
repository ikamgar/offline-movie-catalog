/**
 * App Component - Main Application Shell
 * Orchestrates all components, handles global keyboard shortcuts,
 * and manages the application lifecycle
 *
 * v5.4.0: Realtime architecture update
 */

import { store, showToast } from './store.js';
import { throttle } from './utils/helpers.js';

/* ---- Import all Web Components ---- */
import './components/search-bar.js';
import './components/genre-sidebar.js';
import './components/movie-grid.js';
import './components/selection-sidebar.js';
import './components/movie-detail.js';
import './components/shortcuts-modal.js';
import './components/diagnostics-modal.js';
import './components/login-modal.js';
import './components/admin-panel.js';
import './components/confirm-modal.js';
import './components/edit-modal.js';
import './components/add-modal.js';

class App extends HTMLElement {
  constructor() {
    super();
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  async connectedCallback() {
    this.renderShell();
    await store.init();
    this._bindEvents();
    this._applyState(store.state);
    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  renderShell() {
    this.innerHTML = `
      <header class="app-header">
        <div class="app-logo" id="appLogo">
          <div class="app-logo-icon">🎬</div>
          <span class="app-logo-text">MovieCatalog</span>
          <span class="app-logo-badge" id="versionBadge">v5.4.0</span>
        </div>

        <div class="media-mode-toggle" id="mediaModeToggle">
          <button class="media-mode-btn active" data-mode="movies" title="فیلم‌ها">
            <span class="media-mode-icon">🎬</span>
            <span class="media-mode-label">فیلم‌ها</span>
          </button>
          <button class="media-mode-btn" data-mode="games" title="بازی‌ها">
            <span class="media-mode-icon">🎮</span>
            <span class="media-mode-label">بازی‌ها</span>
          </button>
        </div>

        <div class="header-search" id="headerSearch">
          <search-bar></search-bar>
        </div>

        <div class="header-right">
          <div class="header-actions" id="headerActions">
            <button class="btn-icon" id="rescanBtn" title="بروزرسانی کتابخانه">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
            </button>
            <button class="btn-icon" id="diagnosticsBtn" title="وضعیت سیستم">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            </button>
            <button class="theme-toggle" id="toggleTheme" title="تغییر حالت نمایش (Ctrl+Shift+D)">
              <span class="theme-toggle-icon moon">🌙</span>
              <span class="theme-toggle-icon sun">☀️</span>
            </button>
          </div>
          <button class="btn btn-sm btn-ghost header-login-btn" id="loginBtn" title="ورود مدیر">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            <span>ورود مدیر</span>
          </button>
        </div>
      </header>

      <div class="app-body">
        <selection-sidebar id="selectionSidebar"></selection-sidebar>
        <admin-panel id="adminPanel" class="hidden"></admin-panel>
        <div class="overlay" id="overlay"></div>
        <main class="main-content" id="mainContent">
          <movie-grid id="movieGrid"></movie-grid>
        </main>
        <genre-sidebar id="genreSidebar"></genre-sidebar>
      </div>

      <footer class="app-footer">
        <div class="app-footer-content">
          <span>Designed &amp; Developed by</span>
          <strong>Ali Kamgar</strong>
        </div>
      </footer>

      <movie-detail id="movieDetail"></movie-detail>
      <edit-modal id="editModal" class="hidden"></edit-modal>
      <add-modal id="addModal" class="hidden"></add-modal>
      <shortcuts-modal id="shortcutsModal"></shortcuts-modal>
      <diagnostics-modal id="diagnosticsModal"></diagnostics-modal>
      <login-modal id="loginModal"></login-modal>
      <confirm-modal id="confirmModal"></confirm-modal>
    `;
  }

  _bindEvents() {
    /* Theme toggle */
    this.querySelector('#toggleTheme').addEventListener('click', () => {
      store.toggleTheme();
    });

    /* Media mode toggle (Movies / Games) */
    this.querySelector('#mediaModeToggle').addEventListener('click', async (e) => {
      const btn = e.target.closest('.media-mode-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode) {
        await store.setMediaMode(mode);
        this._applyMediaMode(store.state.mediaMode);
      }
    });

    /* Rescan / Refresh catalog from disk */
    this.querySelector('#rescanBtn').addEventListener('click', async () => {
      const btn = this.querySelector('#rescanBtn');
      btn.classList.add('spinning');
      await store.rescan();
      btn.classList.remove('spinning');
    });

    /* Diagnostics modal */
    this.querySelector('#diagnosticsBtn').addEventListener('click', () => {
      this.querySelector('#diagnosticsModal').show();
    });

    /* Login button */
    this.querySelector('#loginBtn').addEventListener('click', () => {
      const { role } = store.state;
      if (role === 'admin') {
        // Show confirmation dialog before logout
        this.querySelector('#confirmModal').show(
          'آیا از خروج از حالت مدیر مطمئن هستید؟',
          'تأیید خروج',
          () => {
            // Confirmed - proceed with logout
            store.logout();
          }
        );
      } else {
        this.querySelector('#loginModal').show();
      }
    });

    /* Overlay click closes sidebars on mobile */
    this.querySelector('#overlay').addEventListener('click', () => {
      if (store.state.selectionSidebarOpen) store.toggleSelectionSidebar();
      this._applySidebarState();
    });

    /* Movie detail event from cards */
    document.addEventListener('movie-detail', (e) => {
      this.querySelector('#movieDetail').show(e.detail.movie);
    });

    /* Subscribe to state changes for sidebar visibility and role */
    store.subscribe((state) => {
      this._applySidebarState();
      this._applyRoleState(state);
      this._applyMediaMode(state.mediaMode);
    });
  }

  _applyState(state) {
    this._applySidebarState();
    this._applyRoleState(state);
    this._applyMediaMode(state.mediaMode);
  }

  _applyMediaMode(mediaMode) {
    const isGames = mediaMode === 'games';
    document.documentElement.setAttribute('data-gaming', isGames ? 'true' : 'false');

    const toggle = this.querySelector('#mediaModeToggle');
    if (toggle) {
      toggle.querySelectorAll('.media-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mediaMode);
      });
    }

    // Update logo icon
    const logoIcon = this.querySelector('.app-logo-icon');
    if (logoIcon) {
      logoIcon.textContent = isGames ? '🎮' : '🎬';
    }
  }

  /**
   * Apply UI state based on authentication role.
   * Single source of truth: store.state.role
   *
   * Guest/Customer mode:
   *   - Logo, admin actions, theme toggle: hidden
   *   - Search bar: expanded (customer-only style)
   *   - Login button: visible
   *   - Selection sidebar: visible
   *   - Admin panel: hidden
   *
   * Admin/Manager mode:
   *   - Logo, admin actions, theme toggle: visible
   *   - Search bar: normal size
   *   - Logout button: visible (login button transforms into logout)
   *   - Selection sidebar: hidden
   *   - Admin panel: visible
   */
  _applyRoleState(state) {
    const { role } = state;
    const isAdmin = role === 'admin';

    // Elements - with null checks for safety
    const appLogo = this.querySelector('#appLogo');
    const headerActions = this.querySelector('#headerActions');
    const headerSearch = this.querySelector('#headerSearch');
    const loginBtn = this.querySelector('#loginBtn');
    const selectionSidebar = this.querySelector('#selectionSidebar');
    const adminPanel = this.querySelector('#adminPanel');

    // ── Header visibility ──
    if (appLogo) appLogo.classList.toggle('hidden', !isAdmin);
    if (headerActions) headerActions.classList.toggle('hidden', !isAdmin);
    if (headerSearch) headerSearch.classList.toggle('customer-only', !isAdmin);

    // ── Login/Logout button ──
    // The same button serves as login (guest) or logout (admin).
    // It is ALWAYS visible — never hidden.
    if (loginBtn) {
      loginBtn.classList.remove('hidden'); // Always visible

      if (isAdmin) {
        loginBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>خروج مدیر</span>
        `;
        loginBtn.title = 'خروج از حالت مدیر';
        loginBtn.classList.add('admin-active');
      } else {
        loginBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span>ورود مدیر</span>
        `;
        loginBtn.title = 'ورود مدیر';
        loginBtn.classList.remove('admin-active');
      }
    }

    // ── Body panels ──
    if (selectionSidebar) selectionSidebar.classList.toggle('hidden', isAdmin);
    if (adminPanel) adminPanel.classList.toggle('hidden', !isAdmin);
  }

  _applySidebarState() {
    const { selectionSidebarOpen } = store.state;
    const selectionSidebar = this.querySelector('#selectionSidebar');
    const overlay = this.querySelector('#overlay');

    if (selectionSidebar) selectionSidebar.classList.toggle('collapsed', !selectionSidebarOpen);

    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      if (selectionSidebar) selectionSidebar.classList.toggle('open', selectionSidebarOpen);
      overlay.classList.toggle('active', selectionSidebarOpen);
    }
  }

  _handleKeydown(e) {
    const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    /* Ctrl+Shift+D: Toggle theme */
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      store.toggleTheme();
      showToast(`حالت نمایش به ${store.state.theme === 'dark' ? 'تاریک' : 'روشن'} تغییر کرد`, 'info');
    }

    /* Ctrl+Shift+C: Copy selected IDs */
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      if (store.state.selectedMovies.length) {
        store.copySelectedIds();
      }
    }

    /* F5 or Ctrl+R: Rescan (prevent default browser refresh, use API rescan) */
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
      // Let the browser handle normal refresh — user can also click the rescan button
    }
  }
}

customElements.define('app-root', App);
