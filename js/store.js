/**
 * Movie Catalog - State Management Store
 * Reactive store for application state with subscriber pattern
 *
 * v2.0: Fetches from /api/movies (backend auto-scan)
 * Changelog: realtime architecture update
 */

import { sortMovies, compareMovies, compareAllMovies, faCollator } from './utils/sort.js';
import { buildSearchIndex, searchItems } from './utils/search.js';
import { idOrTitle } from './utils/helpers.js';
import { buildOrdersCsv } from './utils/csv.js';
import syncClient from './realtime/sync-client.js';
import { api, apiPost } from './utils/api.js';
import { applyConfig, config } from './config.js';

class Store {
  /**
   * Build an empty store. Call boot() once to load the server config,
   * theme/preferences, the admin session, WS sync and the catalog.
   */
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
      // P8c G6: true while the server's background reconcile is running
      // (meta.scanning) — drives the header "در حال بروزرسانی…" indicator
      scanning: false,
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
    this._movieSearchIndex = [];
    this._gameSearchIndex = [];
    this._booted = false;
    this._syncBound = false;
    this._catalogReloadTimer = null;
    this._scanPollTimer = null;
    this._notifyScheduled = false;
    this._batchPrev = null;
    this._lastBootId = null;
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

  /**
   * Subscribe to state changes.
   * @param {function} fn - Called with (state, changes) where changes.keys lists changed keys
   * @param {string[]|null} [keys] - Interest list; omit/null = all keys (compat)
   * @returns {function} unsubscribe
   */
  subscribe(fn, keys = null) {
    const entry = { fn, keys: Array.isArray(keys) && keys.length ? keys : null };
    this._subscribers.push(entry);
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== entry);
    };
  }

  get subscriberCount() {
    return this._subscribers.length;
  }

  _notify(changes) {
    const keys = changes.keys;
    for (const entry of this._subscribers) {
      if (!entry.keys || !keys || keys.some(k => entry.keys.includes(k))) {
        entry.fn(this._state, changes);
      }
    }
  }

  _set(partial) {
    if (!this._notifyScheduled) {
      this._batchPrev = { ...this._state };
    }
    let changed = false;
    for (const key of Object.keys(partial)) {
      if (!Object.is(this._state[key], partial[key])) {
        this._state[key] = partial[key];
        changed = true;
      }
    }
    if (!changed) return;
    if (this._notifyScheduled) return;
    this._notifyScheduled = true;
    queueMicrotask(() => {
      const batchPrev = this._batchPrev;
      this._batchPrev = null;
      this._notifyScheduled = false;
      const keys = Object.keys(this._state).filter(k => !Object.is(batchPrev[k], this._state[k]));
      if (!keys.length) return;
      this._notify({ prev: batchPrev, next: this._state, keys });
    });
  }

  /**
   * One-time app boot: theme, preferences, admin session, WS sync.
   * Safe to call again — subsequent calls only reload the catalog.
   */
  async boot() {
    if (this._booted) {
      await this.loadCatalog();
      return;
    }
    this._booted = true;
    await this._loadConfig();
    this._loadTheme();
    this._loadPreferences();
    this._restoreAdminSession();
    this._initSync();
    await this.loadCatalog();
  }

  /**
   * Fetch GET /api/config once per boot into the shared holder.
   * On failure the holder stays empty — call-time reads degrade gracefully.
   */
  async _loadConfig() {
    try {
      const resp = await fetch('/api/config');
      if (resp.ok) applyConfig(await resp.json());
    } catch {
      // Backend not running — config stays empty
    }
  }

  /**
   * Idempotent catalog load: fetch movies + games, rebuild indexes, apply filters.
   * Does NOT create extra WebSockets or Workers.
   */
  async loadCatalog() {
    try {
      let data = null;

      try {
        const apiResp = await fetch('/api/movies');
        if (apiResp.ok) {
          const text = await apiResp.text();
          if (text) {
            data = JSON.parse(text);
          }
        }
      } catch {
        // Backend not running
      }

      if (!data) throw new Error('No data source available');

      const movies = Array.isArray(data.movies) ? data.movies : [];
      // P8c G6 — true while the server's startup reconcile is still running
      const scanning = !!(data.meta && data.meta.scanning === true);

      const genres = {};
      movies.forEach(m => {
        if (Array.isArray(m.genres)) {
          m.genres.forEach(g => {
            genres[g] = (genres[g] || 0) + 1;
          });
        }
      });

      const sortedGenres = Object.keys(genres).sort((a, b) => {
        const pinned = config.pinnedGenres || [];
        const rank = (g) => { const i = pinned.indexOf(g); return i === -1 ? pinned.length : i; };
        const oa = rank(a);
        const ob = rank(b);
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b, 'fa');
      });

      // Resolve selection against freshly loaded movies (temp-swap so getSelectedMovies sees them)
      const prevMovies = this._state.movies;
      this._state.movies = movies;
      const selectedMovies = this.getSelectedMovies();
      this._state.movies = prevMovies;

      this._set({
        movies,
        selectedMovies,
        totalMovies: movies.length,
        genres: sortedGenres,
        genreCounts: genres,
        isLoading: false,
        scanning
      });

      this._movieSearchIndex = buildSearchIndex(movies);
      this._applyFilters();
      // G6 — keep polling until the reconcile finishes (a dropped WS must
      // not strand the header indicator)
      if (scanning) this._scheduleScanPoll();
      return true;
    } catch {
      this._set({ isLoading: false });
      if (this._state.scanning) this._scheduleScanPoll();
      return false;
    }
  }

  /**
   * Rescan the library, then reload the catalog (no re-boot of socket/worker).
   */
  async rescan() {
    try {
      const resp = await api('/api/rescan', { method: 'POST' });
      if (!resp.ok) throw new Error('Rescan failed');
      await this.loadCatalog();
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

  _scheduleCatalogReload() {
    if (this._catalogReloadTimer) {
      clearTimeout(this._catalogReloadTimer);
    }
    this._catalogReloadTimer = setTimeout(() => {
      this._catalogReloadTimer = null;
      this.loadCatalog();
      // Games have no WS broadcast of their own — refetch them on every
      // catalog reload so a game create/delete elsewhere shows up (P6c E4).
      this.fetchGames();
    }, 500);
  }

  /**
   * P8c G6 — re-poll the catalog every 2 s while meta.scanning is true so
   * the header indicator clears even if the catalog:changed WS message is
   * missed. Each poll re-reads the flag and stops itself when it clears.
   */
  _scheduleScanPoll() {
    if (this._scanPollTimer) clearTimeout(this._scanPollTimer);
    this._scanPollTimer = setTimeout(() => {
      this._scanPollTimer = null;
      this.loadCatalog();
      this.fetchGames();
    }, 2000);
  }

  /**
   * Fetch diagnostics report from the backend.
   * Returns the full diagnostics object or null on failure.
   */
  async fetchDiagnostics() {
    try {
      const resp = await api('/api/diagnostics');
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

  /**
   * Initialize the real-time sync connection.
   * Connects as admin (if session exists) or customer to the WebSocket server.
   * Server is the single source of truth — client state is synced from server.
   */
  _initSync() {
    if (this._syncBound) {
      syncClient.connect(this._state.sessionToken || null);
      return;
    }
    this._syncBound = true;

    // Set up callback for customer state sync (server sends current selection on connect)
    syncClient.onCustomerStateSync((state) => {
      if (this._state.role === 'customer') {
        const serverMovies = state.movies || [];
        const bootId = syncClient.bootId;
        const bootChanged = this._lastBootId != null && bootId != null && bootId !== this._lastBootId;
        const serverEmpty = serverMovies.length === 0;
        const localNonEmpty = this._selectedUids.size > 0;

        // C7: server restarted (new bootId) and lost selection — re-send local (I9 keeps server authoritative otherwise)
        if (bootChanged && serverEmpty && localNonEmpty) {
          this._lastBootId = bootId;
          syncClient.send(this.getSelectedMovies());
          this._set({ selectedMovies: this.getSelectedMovies() });
          return;
        }

        if (bootId != null) this._lastBootId = bootId;

        const serverUids = new Set(serverMovies.map(m => m.uid).filter(uid => uid != null));
        this._selectedUids = serverUids;
        this._state.selectedMovies = serverMovies;
        this._set({
          selectedMovies: serverMovies
        });
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
        // P6d E5 — soft delete gets a 10 s undo toast instead of a confirm dialog
        showToast('سفارش با موفقیت حذف شد', 'info', {
          duration: 10000,
          action: { label: 'بازگردانی', onClick: () => this.undoOrderDelete(orderId) }
        });
        // Clear selected order if it was deleted
        if (this._state.selectedOrder && this._state.selectedOrder.id === orderId) {
          this._set({ selectedOrder: null });
        }
      }
    });

    syncClient.onOrderRestored((order) => {
      if (this._state.role === 'admin' && order) {
        showToast(`سفارش ${order.number} بازگردانی شد`, 'success');
      }
    });

    syncClient.onOrdersError((message) => {
      if (this._state.role === 'admin') {
        showToast(message || 'خطا در عملیات سفارش', 'error');
      }
    });

    syncClient.onOrdersList((orders) => {
      if (this._state.role === 'admin') {
        this._set({ orders });
      }
    });

    // Movie update callback (when admin edits a movie) — patch by uid only
    syncClient.onMovieUpdated((movie) => {
      if (!movie || movie.uid == null) return;
      const movies = this._state.movies.map(m => {
        if (m.uid === movie.uid) {
          return { ...m, ...movie };
        }
        return m;
      });
      this._set({ movies });
      // Patched objects are new references — rebuild the search index (P5a)
      this._movieSearchIndex = buildSearchIndex(movies);
      this._applyFilters();
    });

    // Movie added callback (when admin adds a new movie)
    syncClient.onMovieAdded((movie) => {
      if (!movie || movie.uid == null) return;
      const movies = this._state.movies.some(m => m.uid === movie.uid)
        ? this._state.movies.map(m => (m.uid === movie.uid ? { ...m, ...movie } : m))
        : [...this._state.movies, movie];
      this._set({
        movies,
        totalMovies: movies.length
      });
      // New item must become searchable immediately (P5a)
      this._movieSearchIndex = buildSearchIndex(movies);
      this._applyFilters();
    });

    // Hot catalog change → debounced reload (500 ms)
    syncClient.onCatalogChanged(() => {
      this._scheduleCatalogReload();
    });

    // Auth error callback: when the server rejects the restored session token
    // (e.g., after server restart where in-memory sessions are lost),
    // gracefully drop back to customer mode with a toast and login modal.
    syncClient.onAuthError(() => {
      this.logout({ reason: 'expired' });
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
    } catch {
      // Invalid session data, clear it
      localStorage.removeItem('mc_adminSession');
    }
  }

  /**
   * Logout admin and return to customer mode.
   *
   * @param {object} [opts]
   * @param {string} [opts.reason] - 'expired' for session expiry (different toast)
   */
  logout({ reason } = {}) {
    // Invalidate session on server
    if (this._state.sessionToken) {
      apiPost('/api/auth/logout', { token: this._state.sessionToken }).catch(() => {});
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

    if (reason === 'expired') {
      showToast('نشست شما منقضی شده است، دوباره وارد شوید', 'error');
      const modal = document.querySelector('login-modal');
      if (modal) modal.show();
    } else {
      showToast('از حالت مدیر خارج شدید', 'info');
    }
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
   * Change an order's workflow status (P6d E5).
   *
   * @param {string} orderId
   * @param {string} status - new | preparing | done
   */
  updateOrderStatus(orderId, status) {
    if (this._state.role !== 'admin') return;
    syncClient.updateOrderStatus(orderId, status);
  }

  /**
   * Edit customerName / note of an order (P6d E5).
   *
   * @param {string} orderId
   * @param {{ customerName?: string, note?: string }} fields
   */
  editOrderInfo(orderId, fields) {
    if (this._state.role !== 'admin') return;
    syncClient.editOrder(orderId, fields || {});
  }

  /**
   * Undo a soft-deleted order while the server's undo window is open (P6d E5).
   *
   * @param {string} orderId
   */
  undoOrderDelete(orderId) {
    if (this._state.role !== 'admin') return;
    syncClient.undoOrderDelete(orderId);
  }

  /**
   * Open the A5 print view for one order (P6d E5): RTL document, order
   * number + date in the header, one row per movie with big IDs.
   *
   * @param {object} order
   */
  printOrder(order) {
    if (!order) return;

    const win = window.open('', '_blank');
    if (!win) return;
    const doc = win.document;
    doc.open();
    doc.write('<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title></title><style>' +
      'body{font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:24px;color:#111}' +
      '.order-print-head{display:flex;justify-content:space-between;align-items:baseline;' +
      'border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:16px}' +
      '.order-print-head h1{font-size:22px;margin:0}' +
      '.order-print-head .order-print-date{font-size:14px;color:#444}' +
      '.order-print-info{font-size:14px;color:#333;margin-bottom:14px}' +
      '.order-print-table{width:100%;border-collapse:collapse}' +
      '.order-print-table th,.order-print-table td{border:1px solid #999;' +
      'padding:8px 10px;text-align:right;font-size:14px}' +
      '.order-print-table th{background:#eee}' +
      '.order-print-table .order-print-id{font-size:26px;font-weight:bold;min-width:72px;text-align:center;}' +
      '</style></head><body></body></html>');
    doc.close();
    doc.title = `سفارش ${order.number}`;

    const head = doc.createElement('div');
    head.className = 'order-print-head';
    const h1 = doc.createElement('h1');
    h1.textContent = `سفارش ${order.number}`;
    const date = doc.createElement('span');
    date.className = 'order-print-date';
    date.textContent = order.createdAt ? new Date(order.createdAt).toLocaleString('fa-IR') : '—';
    head.appendChild(h1);
    head.appendChild(date);
    doc.body.appendChild(head);

    const info = doc.createElement('div');
    info.className = 'order-print-info';
    const parts = [];
    if (order.customerName) parts.push(`نام مشتری: ${order.customerName}`);
    if (order.note) parts.push(`یادداشت: ${order.note}`);
    parts.push(`تعداد فیلم: ${(order.movies || []).length}`);
    info.textContent = parts.join(' — ');
    doc.body.appendChild(info);

    const table = doc.createElement('table');
    table.className = 'order-print-table';
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    for (const label of ['کد', 'عنوان', 'سال', 'نوع']) {
      const th = doc.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    for (const movie of order.movies || []) {
      const tr = doc.createElement('tr');
      const idTd = doc.createElement('td');
      idTd.className = 'order-print-id';
      idTd.textContent = movie.id == null ? '—' : String(movie.id);
      const titleTd = doc.createElement('td');
      titleTd.textContent = movie.title == null ? '' : String(movie.title);
      const yearTd = doc.createElement('td');
      yearTd.textContent = movie.year == null ? '—' : String(movie.year);
      const typeTd = doc.createElement('td');
      typeTd.textContent = movie.type == null ? '—' : String(movie.type);
      tr.appendChild(idTd);
      tr.appendChild(titleTd);
      tr.appendChild(yearTd);
      tr.appendChild(typeTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    doc.body.appendChild(table);

    const script = doc.createElement('script');
    script.textContent = 'window.onload=function(){window.print();}';
    doc.body.appendChild(script);
  }

  /**
   * Download one order as a UTF-8-BOM CSV (P6d E5, `order-<number>.csv`).
   *
   * @param {object} order
   */
  exportOrderCsv(order) {
    if (!order) return;
    const csv = buildOrdersCsv([order]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${order.number}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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

  /**
   * Update the live search query and re-run the filter pipeline.
   * @param {string} query - raw user input (normalised inside searchItems)
   */
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
      // Rebuild game search index (P5a)
      this._gameSearchIndex = buildSearchIndex(games);
      // The grid renders from the filtered list — rebuild it so a game
      // create/delete/restore shows up without a mode switch (P6c E4)
      this._applyFilters();
    } catch (err) {
      console.warn('Failed to fetch games:', err);
      this._set({ games: [], totalGames: 0 });
      this._applyFilters();
    }
  }

  /**
   * Toggle a genre filter: clicking the active genre clears it.
   * @param {string} genre
   */
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

  /**
   * Switch the catalog between grid and list layout, persisting the choice.
   * @param {'grid'|'list'} mode
   */
  setViewMode(mode) {
    this._set({ viewMode: mode });
    this._savePreference('viewMode', mode);
  }

  /** Show/hide the selection sidebar (no persistence — UI-only state). */
  toggleSelectionSidebar() {
    this._set({ selectionSidebarOpen: !this._state.selectionSidebarOpen });
  }

  /**
   * Flip dark/light theme, persist the choice and mirror it on
   * `<html data-theme>` so CSS picks it up immediately.
   */
  toggleTheme() {
    const next = this._state.theme === 'dark' ? 'light' : 'dark';
    this._set({ theme: next });
    document.documentElement.setAttribute('data-theme', next);
    this._savePreference('theme', next);
  }

  /* ── Selection API (single source of truth: _selectedUids Set) ── */

  /**
   * Whether a uid (movie id, `series:…` or `game:…`) is currently ticked.
   * @param {string} uid
   * @returns {boolean}
   */
  isSelected(uid) {
    return this._selectedUids.has(uid);
  }

  /**
   * Tick an unticked uid or untick a ticked one, then sync state,
   * preferences and the server mirror (see _syncSelectedMovies).
   * @param {string|null} uid - null/undefined is ignored
   */
  toggleSelection(uid) {
    if (uid == null) return;
    if (this._selectedUids.has(uid)) {
      this._selectedUids.delete(uid);
    } else {
      this._selectedUids.add(uid);
    }
    this._syncSelectedMovies();
  }

  /**
   * Tick uid (no-op when already ticked) and sync the selection.
   * @param {string|null} uid - null/undefined is ignored
   */
  select(uid) {
    if (uid == null) return;
    this._selectedUids.add(uid);
    this._syncSelectedMovies();
  }

  /**
   * Untick uid (no-op when not ticked) and sync the selection.
   * @param {string|null} uid - null/undefined is ignored
   */
  deselect(uid) {
    if (uid == null) return;
    this._selectedUids.delete(uid);
    this._syncSelectedMovies();
  }

  /**
   * Untick everything: state, the persisted preference and the server
   * mirror are all reset to the empty selection.
   */
  clearSelection() {
    this._selectedUids.clear();
    this._syncSelectedMovies();
    localStorage.removeItem('mc_selectedMovies');
  }

  /**
   * Resolve ticked uids against the loaded movies AND games.
   * @returns {(Movie|Game)[]} in tick order; uids with no catalog match are dropped
   */
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

  /**
   * Copy one identifier per line (ID, or title where there is no ID —
   * D4/FE-06 idOrTitle) to the clipboard, with a hidden-textarea fallback.
   * Shows the Persian success toast in both paths.
   */
  copySelectedIds() {
    const selected = this.getSelectedMovies();
    const ids = selected.map(idOrTitle).join('\n');
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

  /**
   * Open a blank RTL window listing the selected identifiers and trigger
   * the browser print dialog on load (styled by css/print.css).
   */
  printSelectedIds() {
    const selected = this.getSelectedMovies();

    const win = window.open('', '_blank');
    const doc = win.document;
    doc.open();
    doc.write('<html lang="fa" dir="rtl"><head><title>انتخاب فیلم</title>');
    doc.write('<link rel="stylesheet" href="' + new URL('css/print.css', document.baseURI).href + '">');
    doc.write('</head><body>');
    const h1 = doc.createElement('h1');
    h1.textContent = `فیلم‌های انتخاب شده (${selected.length})`;
    doc.body.appendChild(h1);
    const pre = doc.createElement('pre');
    pre.textContent = selected.map(m => {
      const ref = idOrTitle(m);
      return ref === m.title ? String(m.title) : `${ref} - ${m.title}`;
    }).join('\n');
    doc.body.appendChild(pre);
    const script = doc.createElement('script');
    script.textContent = 'window.onload=function(){window.print();}';
    doc.body.appendChild(script);
    doc.close();
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

      // Search — normalised, ranked (P5a/D2); sort only the MATCHES with the
      // shared fa collator as tie-break, so the full list is never re-sorted
      if (searchQuery.trim()) {
        result = searchItems(result, this._gameSearchIndex, searchQuery,
          (a, b) => faCollator.compare(a.title, b.title));
      } else {
        // Sort alphabetically by title (shared fa collator — P5a/D3)
        result.sort((a, b) => faCollator.compare(a.title, b.title));
      }

      this._set({ filteredMovies: result });
      return;
    }

    // Movie mode (existing logic)
    const { movies } = this._state;
    let result = [...movies];

    // Filter by category (can be a genre or a type)
    if (selectedCategory) {
      if ((config.mediaTypes || []).includes(selectedCategory)) {
        // Filter by type
        result = result.filter(m => m.type === selectedCategory);
      } else {
        // Filter by genre
        result = result.filter(m => m.genres.includes(selectedCategory));
      }
    }

    // Centralized type-aware sorting (I11) — with a query, only the matches
    // are sorted (rank first, type comparator as tie-break, P5a/D2); without
    // one, the whole list sorts exactly as before.
    // Use compareAllMovies for "All Movies" view (no category selected)
    // Use compareMovies for specific category views
    if (searchQuery.trim()) {
      const cmp = selectedCategory ? compareMovies : compareAllMovies;
      result = searchItems(result, this._movieSearchIndex, searchQuery, cmp);
    } else if (selectedCategory) {
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
      }
    } catch {
      // Ignore invalid localStorage data
    }
  }
}

/**
 * Show a toast. `options` (P6d E5):
 *   duration — ms before auto-dismiss (default 3000)
 *   action   — { label, onClick } adds a clickable `.toast-action` button
 */
function showToast(message, type = 'info', options = {}) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);

  if (options.action && options.action.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = options.action.label;
    btn.addEventListener('click', () => {
      toast.remove();
      if (typeof options.action.onClick === 'function') {
        options.action.onClick();
      }
    });
    toast.appendChild(btn);
  }

  container.appendChild(toast);

  const duration = typeof options.duration === 'number' ? options.duration : 3000;
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

const store = new Store();
export { store, showToast };
