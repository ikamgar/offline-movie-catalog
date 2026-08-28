/**
 * Movie Catalog - State Management Store
 * Reactive store for application state with subscriber pattern
 *
 * v2.0: Fetches from /api/movies (backend auto-scan) with fallback to data/movies.json
 * v5.4.0: Realtime architecture update
 */

import { sortMovies, compareAllMovies } from './utils/sort.js';
import syncClient from './realtime/sync-client.js';

const GENRE_COLORS = {
  'Action': '#ef4444',
  'Drama': '#8b5cf6',
  'Romance': '#ec4899',
  'Sci-Fi': '#06b6d4',
  'Horror': '#7c3aed',
  'Comedy': '#f59e0b',
  'Thriller': '#64748b',
  'Animation': '#10b981',
  'Documentary': '#6366f1'
};

class Store {
  constructor() {
    this._selectedUids = new Set();
    this._state = {
      movies: [],
      filteredMovies: [],
      genres: [],
      genreCounts: {},
      selectedGenre: null,
      selectedCategory: null, // Can be a genre (e.g., "اکشن") or a type (e.g., "Animation") or a platform (e.g., "PS4")
      searchQuery: '',
      viewMode: 'grid',
      selectedMovies: [],
      theme: 'dark',
      selectionSidebarOpen: true,
      isLoading: true,
      totalMovies: 0,
      // Media mode: 'movies' or 'games'
      mediaMode: 'movies',
      games: [],
      totalGames: 0,
      // Role-based state
      role: 'customer', // 'customer' or 'admin'
      sessionToken: null,
      isAdminConnected: false,
      // Admin view of customer selection
      adminSelection: [],
      adminSelectionUpdatedAt: null,
      // Orders state
      orders: [],
      selectedOrder: null, // For viewing order details
    };
    this._subscribers = [];
    this._searchWorker = null;
  }

  get state() {
    return this._state;
  }

  /**
   * Whether the current session is authenticated as admin.
   * Use this for clean role checks in UI components.
   */
  get isAuthenticated() {
    return this._state.role === 'admin' && this._state.sessionToken != null;
  }

  /**
   * Current role: 'customer' or 'admin'.
   */
  get role() {
    return this._state.role;
  }

  subscribe(fn) {
    this._subscribers.push(fn);
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== fn);
    };
  }

  _notify(changes) {
    this._subscribers.forEach(fn => fn(this._state, changes));
  }

  _set(partial) {
    const prev = { ...this._state };
    Object.assign(this._state, partial);
    this._notify({ prev, next: this._state });
  }

  /**
   * Initialize the store by loading movie data.
   * v2.0: Tries the backend API first (/api/movies), falls back to local JSON.
   * This allows the app to work both with and without the Node.js server.
   */
  async init() {
    this._loadTheme();
    this._initSearchWorker();

    try {
      let data = null;

      // Attempt 1: Fetch from backend API (auto-scanned from Library folder)
      try {
        const apiResp = await fetch('/api/movies');
        if (apiResp.ok) {
          const text = await apiResp.text();
          if (text) {
            data = JSON.parse(text);
          }
        }
      } catch {
        // Backend not running — fall through to local JSON
      }

      // Attempt 2: Fall back to static JSON file
      if (!data) {
        try {
          const localResp = await fetch('data/movies.json');
          if (localResp.ok) {
            const text = await localResp.text();
            if (text) {
              data = JSON.parse(text);
            }
          }
        } catch {
          // Neither source available
        }
      }

      if (!data) throw new Error('No data source available');

      const movies = Array.isArray(data.movies) ? data.movies : [];

      const genres = {};
      movies.forEach(m => {
        if (Array.isArray(m.genres)) {
          m.genres.forEach(g => {
            genres[g] = (genres[g] || 0) + 1;
          });
        }
      });

      const sortedGenres = Object.keys(genres).sort((a, b) => {
        const order = { 'دوبله فارسی': 0, 'اکشن': 1, 'عاشقانه': 2 };
        const oa = order[a] !== undefined ? order[a] : 3;
        const ob = order[b] !== undefined ? order[b] : 3;
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b, 'fa');
      });

      this._set({
        movies,
        totalMovies: movies.length,
        genres: sortedGenres,
        genreCounts: genres,
        isLoading: false
      });

      this._loadPreferences();
      this._indexMovies(movies);
      this._applyFilters();

      // Restore admin session if exists (before initializing sync)
      this._restoreAdminSession();

      // Initialize WebSocket sync
      this._initSync();
    } catch (err) {
      this._set({ isLoading: false });
    }
  }

  /**
   * Rescan the library by re-initializing from the backend API.
   * Called when the user clicks the refresh button in the header.
   */
  async rescan() {
    try {
      const resp = await fetch('/api/rescan', { method: 'POST' });
      if (!resp.ok) throw new Error('Rescan failed');
      await this.init();
      // Also refresh games if we have them loaded
      if (this._state.games.length > 0 || this._state.mediaMode === 'games') {
        await this.fetchGames();
      }
      const movieCount = this.state.totalMovies;
      const gameCount = this.state.totalGames;
      let msg = `کتابخانه بروزرسانی شد: ${movieCount} فیلم`;
      if (gameCount > 0) msg += `، ${gameCount} بازی`;
      showToast(msg, 'success');
    } catch {
      showToast('بروزرسانی ممکن نیست — سرور در حال اجرا نیست', 'error');
    }
  }

  /**
   * Fetch diagnostics report from the backend.
   * Returns the full diagnostics object or null on failure.
   */
  async fetchDiagnostics() {
    try {
      const resp = await fetch('/api/diagnostics');
      if (!resp.ok) return null;
      const text = await resp.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch catalog statistics from the backend.
   */
  async fetchStats() {
    try {
      const resp = await fetch('/api/stats');
      if (!resp.ok) return null;
      const text = await resp.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  _initSearchWorker() {
    try {
      this._searchWorker = new Worker('js/workers/search-worker.js');
      this._searchWorker.onmessage = (e) => {
        if (e.data.type === 'results') {
          this._set({ filteredMovies: e.data.movies });
        }
      };
    } catch (err) {
      console.warn('Web Worker not available, using main thread search');
    }
  }

  _indexMovies(movies) {
    if (this._searchWorker) {
      this._searchWorker.postMessage({ type: 'index', movies, games: this._state.games });
    }
  }

  /**
   * Initialize the real-time sync connection.
   * Connects as admin (if session exists) or customer to the WebSocket server.
   * Server is the single source of truth — client state is synced from server.
   */
  _initSync() {
    // Set up callback for customer state sync (server sends current selection on connect)
    syncClient.onCustomerStateSync((state) => {
      if (this._state.role === 'customer') {
        // Server is source of truth — replace local selection with server state
        const serverMovies = state.movies || [];
        const serverUids = new Set(serverMovies.map(m => m.uid).filter(uid => uid != null));

        // Update local selection to match server
        this._selectedUids = serverUids;
        this._state.selectedMovies = serverMovies;

        // Update UI without re-syncing to server (avoid loop)
        this._set({
          selectedMovies: serverMovies
        });

        // Update localStorage to match
        this._savePreference('selectedMovies', Array.from(this._selectedUids));
      }
    });

    // Set up callback for admin view of customer selection
    syncClient.onAdminStateUpdate((state) => {
      if (this._state.role === 'admin') {
        this._set({
          adminSelection: state.movies,
          adminSelectionUpdatedAt: state.updatedAt,
          isAdminConnected: true
        });
      }
    });

    syncClient.onSelectionCleared(() => {
      // Customer receives clear command from admin
      if (this._state.role === 'customer') {
        this.clearSelection();
        showToast('لیست انتخاب شما توسط مدیر پاک شد', 'info');
      }
    });

    // Order-related callbacks
    syncClient.onOrdersUpdate((orders) => {
      if (this._state.role === 'admin') {
        this._set({ orders });
      }
    });

    syncClient.onOrderSaved((order) => {
      if (this._state.role === 'admin') {
        showToast(`سفارش ${order.number} با موفقیت ذخیره شد`, 'success');
      }
    });

    syncClient.onOrderDeleted((orderId) => {
      if (this._state.role === 'admin') {
        showToast('سفارش با موفقیت حذف شد', 'info');
        // Clear selected order if it was deleted
        if (this._state.selectedOrder && this._state.selectedOrder.id === orderId) {
          this._set({ selectedOrder: null });
        }
      }
    });

    syncClient.onOrdersList((orders) => {
      if (this._state.role === 'admin') {
        this._set({ orders });
      }
    });

    // Movie update callback (when admin edits a movie)
    syncClient.onMovieUpdated((movie) => {
      // Update the movie in the local store
      const movies = this._state.movies.map(m => {
        if (m.id === movie.id || m.uid === movie.uid) {
          return { ...m, ...movie };
        }
        return m;
      });

      this._set({ movies });
      this._applyFilters();
    });

    // Movie added callback (when admin adds a new movie)
    syncClient.onMovieAdded((movie) => {
      // Add the new movie to the local store
      const movies = [...this._state.movies, movie];
      this._set({
        movies,
        totalMovies: movies.length
      });
      this._applyFilters();
    });

    // Auth error callback: when the server rejects the restored session token
    // (e.g., after server restart where in-memory sessions are lost),
    // gracefully reconnect as customer so the manager can still see selections.
    // The client-side role stays 'admin' so the admin panel remains visible.
    syncClient.onAuthError(() => {
      localStorage.removeItem('mc_adminSession');
      this._state.sessionToken = null;
      // Close old connection to prevent it from auto-reconnecting with the invalid token
      if (syncClient._connection) {
        syncClient._connection.close();
      }
      syncClient.connect(null);
    });

    // Connect with admin token if restoring session, otherwise as customer
    const token = this._state.sessionToken;
    syncClient.connect(token || null);
  }

  /**
   * Set admin session after successful login.
   *
   * @param {string} token - Session token from server
   */
  setAdminSession(token) {
    this._set({
      role: 'admin',
      sessionToken: token,
      isAdminConnected: true
    });

    // Persist session to localStorage
    this._saveAdminSession(token);

    // Reconnect WebSocket with admin token
    syncClient.close();
    syncClient.connect(token);

    showToast('حالت مدیر فعال شد', 'success');
  }

  /**
   * Save admin session to localStorage.
   *
   * @param {string} token - Session token
   */
  _saveAdminSession(token) {
    try {
      localStorage.setItem('mc_adminSession', JSON.stringify({
        token,
        role: 'admin',
        timestamp: Date.now()
      }));
    } catch {
      // Quota exceeded or private mode
    }
  }

  /**
   * Restore admin session from localStorage on startup.
   * Uses _set() to properly notify subscribers of role change.
   */
  _restoreAdminSession() {
    try {
      const saved = localStorage.getItem('mc_adminSession');
      if (!saved) return;

      const session = JSON.parse(saved);
      if (session && session.token && session.role === 'admin') {
        // Restore admin state using _set() to notify subscribers
        // WebSocket will reconnect in _initSync with the restored token
        this._set({
          role: 'admin',
          sessionToken: session.token,
          isAdminConnected: false // Will be set true when WS connects
        });
      }
    } catch (e) {
      // Invalid session data, clear it
      localStorage.removeItem('mc_adminSession');
    }
  }

  /**
   * Logout admin and return to customer mode.
   */
  logout() {
    // Invalidate session on server
    if (this._state.sessionToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this._state.sessionToken })
      }).catch(() => {});
    }

    this._set({
      role: 'customer',
      sessionToken: null,
      isAdminConnected: false,
      adminSelection: [],
      adminSelectionUpdatedAt: null,
      orders: [],
      selectedOrder: null
    });

    // Clear persisted admin session
    localStorage.removeItem('mc_adminSession');

    // Reconnect WebSocket as customer
    syncClient.close();
    syncClient.connect();

    showToast('از حالت مدیر خارج شدید', 'info');
  }

  /**
   * Save the current admin selection (admin only).
   */
  saveAdminSelection() {
    if (this._state.role !== 'admin') return;
    syncClient.saveSelection();
  }

  /**
   * Save the current admin selection as an order (admin only).
   */
  saveAdminSelectionAsOrder() {
    if (this._state.role !== 'admin') {
      return;
    }
    if (!this._state.adminSelection.length) {
      return;
    }
    syncClient.saveOrder(this._state.adminSelection);
  }

  /**
   * Delete an order (admin only).
   *
   * @param {string} orderId - The order ID to delete
   */
  deleteOrder(orderId) {
    if (this._state.role !== 'admin') return;
    syncClient.deleteOrder(orderId);
  }

  /**
   * View order details (admin only).
   *
   * @param {object} order - The order to view
   */
  viewOrder(order) {
    this._set({ selectedOrder: order });
  }

  /**
   * Clear selected order (close detail view).
   */
  clearSelectedOrder() {
    this._set({ selectedOrder: null });
  }

  /**
   * Clear the customer selection (admin only).
   */
  clearAdminSelection() {
    if (this._state.role !== 'admin') {
      return;
    }
    syncClient.clearSelection();
  }

  setSearch(query) {
    this._set({ searchQuery: query });
    this._applyFilters();
  }

  /**
   * Switch between movie mode and game mode.
   * Fetches games data on first switch to games mode.
   *
   * @param {'movies'|'games'} mode - The media mode to switch to
   */
  async setMediaMode(mode) {
    if (mode === this._state.mediaMode) return;

    this._set({ mediaMode: mode, selectedCategory: null, selectedGenre: null, searchQuery: '' });

    // Fetch games on first switch to games mode
    if (mode === 'games' && this._state.games.length === 0) {
      await this.fetchGames();
    }

    this._applyFilters();
  }

  /**
   * Fetch games from the backend API.
   */
  async fetchGames() {
    try {
      const resp = await fetch('/api/games');
      if (!resp.ok) throw new Error('Failed to fetch games');
      const data = await resp.json();
      const games = Array.isArray(data.games) ? data.games : [];
      this._set({ games, totalGames: games.length });
      // Re-index for search
      this._indexMovies(this._state.movies);
    } catch (err) {
      console.warn('Failed to fetch games:', err);
      this._set({ games: [], totalGames: 0 });
    }
  }

  setGenre(genre) {
    const current = this._state.selectedGenre;
    this._set({ selectedGenre: current === genre ? null : genre });
    this._applyFilters();
  }

  /**
   * Select a single active genre. Replaces any previous selection.
   */
  selectGenre(genre) {
    this._set({ selectedGenre: genre, selectedCategory: genre });
    this._applyFilters();
  }

  /**
   * Clear the active genre filter. Shows all movies.
   */
  clearGenre() {
    this._set({ selectedGenre: null, selectedCategory: null });
    this._applyFilters();
  }

  /**
   * Select a category (genre or type). Replaces any previous selection.
   * @param {string|null} category - Genre name (e.g., "اکشن") or type (e.g., "Animation")
   */
  selectCategory(category) {
    const current = this._state.selectedCategory;
    const next = current === category ? null : category;
    this._set({ selectedCategory: next, selectedGenre: next });
    this._applyFilters();
  }

  /**
   * Clear the active category filter. Shows all movies.
   */
  clearCategory() {
    this._set({ selectedCategory: null, selectedGenre: null });
    this._applyFilters();
  }

  /**
   * Returns the currently active genre (or null for "All Movies").
   */
  get activeGenre() {
    return this._state.selectedGenre;
  }

  /**
   * Returns the filtered movie list (genre + search + sort applied).
   */
  getFilteredMovies() {
    return this._state.filteredMovies;
  }

  setViewMode(mode) {
    this._set({ viewMode: mode });
    this._savePreference('viewMode', mode);
  }

  toggleSelectionSidebar() {
    this._set({ selectionSidebarOpen: !this._state.selectionSidebarOpen });
  }

  toggleTheme() {
    const next = this._state.theme === 'dark' ? 'light' : 'dark';
    this._set({ theme: next });
    document.documentElement.setAttribute('data-theme', next);
    this._savePreference('theme', next);
  }

  /* ── Selection API (single source of truth: _selectedUids Set) ── */

  isSelected(uid) {
    return this._selectedUids.has(uid);
  }

  toggleSelection(uid) {
    if (uid == null) return;
    if (this._selectedUids.has(uid)) {
      this._selectedUids.delete(uid);
    } else {
      this._selectedUids.add(uid);
    }
    this._syncSelectedMovies();
  }

  select(uid) {
    if (uid == null) return;
    this._selectedUids.add(uid);
    this._syncSelectedMovies();
  }

  deselect(uid) {
    if (uid == null) return;
    this._selectedUids.delete(uid);
    this._syncSelectedMovies();
  }

  clearSelection() {
    this._selectedUids.clear();
    this._syncSelectedMovies();
    localStorage.removeItem('mc_selectedMovies');
  }

  getSelectedMovies() {
    // Build lookup from both movies and games
    const movieMap = new Map(this._state.movies.map(m => [m.uid, m]));
    for (const g of this._state.games) {
      movieMap.set(g.uid, g);
    }
    return Array.from(this._selectedUids)
      .map(uid => movieMap.get(uid))
      .filter(Boolean);
  }

  _syncSelectedMovies() {
    const selected = this.getSelectedMovies();
    this._set({ selectedMovies: selected });
    this._savePreference('selectedMovies', Array.from(this._selectedUids));

    // Mirror selection to server via WebSocket
    syncClient.send(selected);
  }

  copySelectedIds() {
    const selected = this.getSelectedMovies();
    const ids = selected.map(m => m.id !== null ? m.id : m.title).join('\n');
    navigator.clipboard.writeText(ids).then(() => {
      showToast('شناسه‌های فیلم کپی شد', 'success');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = ids;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('شناسه‌های فیلم کپی شد', 'success');
    });
  }

  printSelectedIds() {
    const selected = this.getSelectedMovies();
    const ids = selected.map(m => {
      return `${m.id !== null ? m.id : m.title} - ${m.title}`;
    }).join('\n');

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>انتخاب فیلم</title>
      <style>body{font-family:monospace;padding:40px;font-size:14px;}
      h1{margin-bottom:20px;}pre{white-space:pre-wrap;}</style></head>
      <body><h1>فیلم‌های انتخاب شده (${selected.length})</h1><pre>${ids}</pre>
      <script>window.onload=function(){window.print();}<\/script></body></html>
    `);
    win.document.close();
  }

  _applyFilters() {
    const { searchQuery, selectedCategory, mediaMode } = this._state;

    // Games mode
    if (mediaMode === 'games') {
      let result = [...this._state.games];

      // Platform filter (PS4 / PS5)
      if (selectedCategory === 'PS4') {
        result = result.filter(g => g.platforms.includes('PS4'));
      } else if (selectedCategory === 'PS5') {
        result = result.filter(g => g.platforms.includes('PS5'));
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(g =>
          g.title.toLowerCase().includes(q) ||
          g.platforms.some(p => p.toLowerCase().includes(q))
        );
      }

      // Sort alphabetically by title
      result.sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));

      this._set({ filteredMovies: result });
      return;
    }

    // Movie mode (existing logic)
    const { movies } = this._state;
    let result = [...movies];

    // Filter by category (can be a genre or a type)
    if (selectedCategory) {
      const MEDIA_TYPES = ['Movie', 'Animation', 'Series', 'Iranian'];
      if (MEDIA_TYPES.includes(selectedCategory)) {
        // Filter by type
        result = result.filter(m => m.type === selectedCategory);
      } else {
        // Filter by genre
        result = result.filter(m => m.genres.includes(selectedCategory));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m =>
        String(m.id).includes(q) ||
        m.title.toLowerCase().includes(q) ||
        String(m.year).includes(q) ||
        m.genres.some(g => g.toLowerCase().includes(q)) ||
        (m.type && m.type.toLowerCase().includes(q))
      );
    }

    // Centralized type-aware sorting
    // Use compareAllMovies for "All Movies" view (no category selected)
    // Use sortMovies for specific category views
    if (selectedCategory) {
      sortMovies(result);
    } else {
      result.sort(compareAllMovies);
    }

    this._set({ filteredMovies: result });
  }

  _loadTheme() {
    const saved = localStorage.getItem('mc_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this._state.theme = saved;
  }

  _savePreference(key, value) {
    try {
      localStorage.setItem('mc_' + key, JSON.stringify(value));
    } catch {
      // Quota exceeded or private mode
    }
  }

  _loadPreferences() {
    try {
      const viewMode = JSON.parse(localStorage.getItem('mc_viewMode'));
      if (viewMode) this._state.viewMode = viewMode;

      const savedUids = JSON.parse(localStorage.getItem('mc_selectedMovies'));
      if (Array.isArray(savedUids)) {
        this._selectedUids = new Set(savedUids.filter(uid => uid != null));
        this._state.selectedMovies = this.getSelectedMovies();
      }
    } catch {
      // Ignore invalid localStorage data
    }
  }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const store = new Store();
export { store, GENRE_COLORS, showToast };
