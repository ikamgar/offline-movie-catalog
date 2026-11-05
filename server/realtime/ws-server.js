/**
 * WebSocket Server Module
 *
 * Manages WebSocket connections with role-based routing.
 *
 * Connection Lifecycle:
 *   CONNECT → UNAUTHENTICATED → HELLO → ROLE VALIDATION → CUSTOMER or MANAGER → NORMAL ROUTING
 *
 * Architecture:
 *   - Role is determined ONLY after hello handshake
 *   - Multiple customer connections coexist (all treated as ONE logical customer session)
 *   - Multiple manager connections coexist (all receive identical state)
 *   - Server is the single source of truth for selection state
 *   - Customer sends selection:update → Server updates global state → Broadcasts to ALL managers AND ALL customers
 *   - Managers are read-only observers (except for save/clear commands)
 *   - Order management with persistent storage
 *
 * Event Protocol:
 *   Customer → Server: { type: "selection:update", payload: { movies: [...] } }
 *   Manager → Server: { type: "selection:save" }
 *   Manager → Server: { type: "selection:clear" }
 *   Manager → Server: { type: "orders:save", payload: { movies: [...] } }
 *   Manager → Server: { type: "orders:delete", payload: { orderId: "..." } }
 *   Manager → Server: { type: "orders:list" }
 *   Manager → Server: { type: "orders:update-status", payload: { orderId, status } }
 *   Manager → Server: { type: "orders:edit", payload: { orderId, customerName?, note? } }
 *   Manager → Server: { type: "orders:undo", payload: { orderId } }
 *   Server → All: { type: "selection:state", payload: { updatedAt, movies } }
 *   Server → All: { type: "selection:saved", payload: { timestamp } }
 *   Server → All: { type: "selection:cleared", payload: { timestamp } }
 *   Server → Managers: { type: "orders:update", payload: { orders: [...] } }
 *   Server → Managers: { type: "orders:deleted", payload: { orderId: "..." } }
 *   Server → Managers: { type: "orders:restored", payload: { order } }
 */

const WebSocket = require('ws');
const { getClientRole } = require('../auth/role-provider');
const { validateSession } = require('../auth/auth');
const CatalogIndexer = require('../../backend/indexer');
const { PROTOCOL_VERSION } = require('../../backend/constants');

// Handshake timeout: 10 seconds to send hello
const HANDSHAKE_TIMEOUT_MS = 10000;

// S9 — Security limits
const WS_MAX_PAYLOAD = 256 * 1024;       // 256 KB
const SELECTION_MAX_ITEMS = 500;          // max movies in a selection
const RATE_LIMIT_MSGS = 30;              // max messages per second
const RATE_LIMIT_WINDOW_MS = 1000;

class WebSocketServer {
  /**
   * @param {import('http').Server} httpServer - The HTTP server to attach to
   * @param {object} orderManager - OrderManager instance for persistent storage
   * @param {import('../../backend/indexer')} [indexer] - CatalogIndexer for uid re-hydration (S9)
   */
  constructor(httpServer, orderManager, indexer, options = {}) {
    this._wss = new WebSocket.Server({ server: httpServer, maxPayload: WS_MAX_PAYLOAD });
    this._indexer = indexer || null;
    this._customerSockets = new Set(); // Multiple customers can coexist
    this._managerSockets = new Set();
    this._socketInfo = new Map(); // socket → { state, role, sessionToken, username, handshakeTimer, msgTimestamps }
    this._orderManager = orderManager;
    this._heartbeatIntervalMs = (options && options.heartbeatIntervalMs) || 30000;
    // C7 — server start id for restart detection (additive in hello:ack)
    this._bootId = `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Active customer selection state (server is single source of truth)
    this._activeCustomerSelection = {
      updatedAt: null,
      movies: []
    };

    this._setupConnectionHandler();

    // Heartbeat to keep connections alive
    this._startHeartbeat(this._heartbeatIntervalMs);

    console.log('  [WS] WebSocket server initialized');
  }

  /**
   * Set up the connection handler for new WebSocket clients.
   * New connections start as UNAUTHENTICATED — no role assigned yet.
   */
  _setupConnectionHandler() {
    this._wss.on('connection', (socket, request) => {
      const remoteAddr = request.socket.remoteAddress;
      console.log(`  [WS] New connection from ${remoteAddr} — state: UNAUTHENTICATED`);

      // Store initial state: no role assigned
      this._socketInfo.set(socket, {
        state: 'UNAUTHENTICATED',
        role: null,
        sessionToken: null,
        username: null,
        handshakeTimer: null,
        isAlive: true,                // S9 — heartbeat tracking
        msgTimestamps: []             // S9 — per-socket rate limiter
      });

      // Start handshake timeout
      const timer = setTimeout(() => {
        const info = this._socketInfo.get(socket);
        if (info && info.state === 'UNAUTHENTICATED') {
          console.log(`  [WS] Handshake timeout from ${remoteAddr} — closing`);
          this._removeSocketInfo(socket);
          socket.close(4001, 'Handshake timeout');
        }
      }, HANDSHAKE_TIMEOUT_MS);
      this._socketInfo.get(socket).handshakeTimer = timer;

      // Set up message handler
      socket.on('message', (data) => {
        this._handleMessage(socket, data);
      });

      // Handle disconnection
      socket.on('close', (code, reason) => {
        this._handleDisconnect(socket, code, reason);
      });

      // S9 — pong response marks socket alive
      socket.on('pong', () => {
        const info = this._socketInfo.get(socket);
        if (info) info.isAlive = true;
      });

      socket.on('error', (err) => {
        console.error(`  [WS] Socket error from ${remoteAddr}: ${err.message}`);
        this._handleDisconnect(socket, 1006, 'Error');
      });
    });
  }

  /**
   * Handle an incoming message from any socket.
   * Routes based on connection state:
   *   UNAUTHENTICATED → only accept hello messages
   *   AUTHENTICATED → route based on role
   *
   * @param {WebSocket} socket
   * @param {Buffer|string} data
   */
  _handleMessage(socket, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('  [WS] Invalid message JSON:', err.message);
      return;
    }

    if (!message.type) {
      console.warn('  [WS] Message missing type field');
      return;
    }

    const info = this._socketInfo.get(socket);
    if (!info) {
      console.warn('  [WS] Message from unknown socket — ignoring');
      return;
    }

    // S9 — Per-socket rate limit: >RATE_LIMIT_MSGS messages in 1 s → close 4008
    const now = Date.now();
    info.msgTimestamps.push(now);
    info.msgTimestamps = info.msgTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (info.msgTimestamps.length > RATE_LIMIT_MSGS) {
      console.warn(`  [WS] Rate limit exceeded from ${info.username || info.role || 'unknown'} — closing 4008`);
      this._removeSocketInfo(socket);
      socket.close(4008, 'Rate limit exceeded');
      return;
    }

    // UNAUTHENTICATED: only accept hello
    if (info.state === 'UNAUTHENTICATED') {
      if (message.type === 'hello') {
        this._handleHello(socket, message);
      } else {
        console.warn(`  [WS] UNAUTHENTICATED socket sent "${message.type}" — expected "hello"`);
        this._send(socket, {
          type: 'error',
          payload: { message: 'Handshake required. Send hello first.' }
        });
      }
      return;
    }

    // AUTHENTICATED: route based on role
    this._routeMessage(socket, info.role, message);
  }

  /**
   * Handle the hello handshake message.
   * Validates role and completes authentication.
   *
   * Expected format:
   *   { type: "hello", payload: { role: "customer" } }
   *   { type: "hello", payload: { role: "manager", token: "..." } }
   *
   * @param {WebSocket} socket
   * @param {object} message
   */
  _handleHello(socket, message) {
    const { role: requestedRole, token } = message.payload || {};
    const info = this._socketInfo.get(socket);
    const remoteAddr = socket._socket?.remoteAddress || 'unknown';

    // Clear handshake timeout
    if (info.handshakeTimer) {
      clearTimeout(info.handshakeTimer);
      info.handshakeTimer = null;
    }

    // Validate role using role-provider
    const validatedRole = getClientRole(requestedRole);
    if (!validatedRole) {
      console.warn(`  [WS] Invalid role "${requestedRole}" from ${remoteAddr} — closing`);
      this._send(socket, {
        type: 'hello:error',
        payload: { message: `Invalid role: ${requestedRole}` }
      });
      this._removeSocketInfo(socket);
      socket.close(4003, 'Invalid role');
      return;
    }

    // For manager role, validate session token
    let username = null;
    if (validatedRole === 'manager') {
      if (!token) {
        console.warn(`  [WS] Manager connection from ${remoteAddr} missing token — closing`);
        this._send(socket, {
          type: 'hello:error',
          payload: { message: 'Manager role requires authentication token' }
        });
        this._removeSocketInfo(socket);
        socket.close(4004, 'Token required for manager');
        return;
      }

      const session = validateSession(token);
      if (!session) {
        console.warn(`  [WS] Invalid/expired token from ${remoteAddr} — closing`);
        this._send(socket, {
          type: 'hello:error',
          payload: { message: 'Invalid or expired session token' }
        });
        this._removeSocketInfo(socket);
        socket.close(4004, 'Invalid session token');
        return;
      }

      username = session.username;
    }

    // Update socket info with authenticated role
    info.state = 'AUTHENTICATED';
    info.role = validatedRole;
    info.sessionToken = token || null;
    info.username = username;

    // Register the socket with its validated role
    this._registerSocket(socket, validatedRole, username);

    // Send hello acknowledgment (S9 — protocol version for new clients; C7 — bootId)
    this._send(socket, {
      type: 'hello:ack',
      payload: {
        role: validatedRole,
        username: username,
        protocol: PROTOCOL_VERSION,
        bootId: this._bootId
      }
    });

    // Send initial state after successful authentication
    this._sendInitialState(socket, validatedRole);
  }

  /**
   * Register an authenticated socket into the appropriate role bucket.
   *
   * Multiple customer connections coexist — no replacement.
   * Multiple manager connections coexist.
   *
   * @param {WebSocket} socket
   * @param {string} role - 'customer' or 'manager' (validated)
   * @param {string|null} username
   */
  _registerSocket(socket, role, username) {
    if (role === 'customer') {
      this._customerSockets.add(socket);
      console.log(`  [WS] Customer authenticated and connected (total: ${this._customerSockets.size})`);
    } else if (role === 'manager') {
      this._managerSockets.add(socket);
      console.log(`  [WS] Manager authenticated: ${username || 'unknown'} (total: ${this._managerSockets.size})`);
    }
  }

  /**
   * Route a message from an authenticated socket based on role.
   *
   * @param {WebSocket} socket
   * @param {string} role - 'customer' or 'manager'
   * @param {object} message
   */
  _routeMessage(socket, role, message) {
    switch (message.type) {
      case 'selection:update':
        if (role === 'customer') {
          this._handleSelectionUpdate(message.payload);
        }
        break;

      case 'selection:save':
        if (role === 'manager') {
          this._handleSelectionSave(socket);
        }
        break;

      case 'selection:clear':
        if (role === 'manager') {
          this._handleSelectionClear(socket);
        }
        break;

      case 'orders:save':
        if (role === 'manager') {
          this._handleOrderSave(socket, message.payload);
        }
        break;

      case 'orders:delete':
        if (role === 'manager') {
          this._handleOrderDelete(socket, message.payload);
        }
        break;

      case 'orders:list':
        if (role === 'manager') {
          this._handleOrderList(socket);
        }
        break;

      case 'orders:update-status':
        if (role === 'manager') {
          this._handleOrderStatus(socket, message.payload);
        }
        break;

      case 'orders:edit':
        if (role === 'manager') {
          this._handleOrderEdit(socket, message.payload);
        }
        break;

      case 'orders:undo':
        if (role === 'manager') {
          this._handleOrderUndo(socket, message.payload);
        }
        break;

      case 'ping':
        this._send(socket, { type: 'pong', payload: {} });
        break;

      default:
        console.warn(`  [WS] Unknown message type from ${role}: ${message.type}`);
    }
  }

  /**
   * Handle a selection:update from the customer.
   * Updates the global selection state and broadcasts to ALL clients.
   *
   * @param {object} payload - { movies: [...] }
   */
  _handleSelectionUpdate(payload) {
    if (!payload || !Array.isArray(payload.movies)) {
      console.warn('  [WS] Invalid selection:update payload');
      return;
    }

    // S9 — Re-hydrate from uid only; drop unknown uids, ignore injected fields.
    // If indexer is not available (test mode), fall through to raw payload.
    let movies;
    if (this._indexer) {
      movies = payload.movies
        .filter(item => item && typeof item === 'object' && typeof item.uid === 'string')
        .slice(0, SELECTION_MAX_ITEMS)
        .map(item => {
          const found = this._indexer.getByUid(item.uid);
          return found ? CatalogIndexer.toPublicMovie(found) : null;
        })
        .filter(Boolean);
    } else {
      // Fallback for tests without indexer: keep basic shape, cap size
      movies = payload.movies
        .filter(item => item && typeof item === 'object' && typeof item.uid === 'string')
        .slice(0, SELECTION_MAX_ITEMS)
        .map(item => ({
          uid: item.uid,
          id: item.id || null,
          title: item.title || '',
          year: item.year || null,
          genres: Array.isArray(item.genres) ? item.genres : [],
          type: item.type || 'Movie',
          poster: item.poster || null
        }));
    }

    this._activeCustomerSelection = {
      updatedAt: new Date().toISOString(),
      movies
    };

    // Broadcast to ALL clients (customers + managers)
    this._broadcastToAll({
      type: 'selection:state',
      payload: this._activeCustomerSelection
    });

    console.log(`  [WS] Selection updated: ${this._activeCustomerSelection.movies.length} movies — broadcast to all clients`);
  }

  /**
   * Handle a selection:save from a manager.
   *
   * @param {WebSocket} socket
   */
  _handleSelectionSave(socket) {
    if (!this._activeCustomerSelection.movies.length) {
      this._send(socket, {
        type: 'selection:error',
        payload: { message: 'No selection to save' }
      });
      return;
    }

    console.log(`  [WS] Selection saved: ${this._activeCustomerSelection.movies.length} movies`);

    this._broadcastToAll({
      type: 'selection:saved',
      payload: {
        timestamp: new Date().toISOString(),
        count: this._activeCustomerSelection.movies.length
      }
    });

    this._clearSelection();
  }

  /**
   * Handle a selection:clear from a manager.
   *
   * @param {WebSocket} _socket - sender (unused; kept for handler symmetry)
   */
  _handleSelectionClear(_socket) {
    console.log('  [WS] Selection cleared by manager');

    this._broadcastToAll({
      type: 'selection:cleared',
      payload: { timestamp: new Date().toISOString() }
    });

    this._clearSelection();
  }

  /**
   * Handle orders:save from a manager.
   *
   * @param {WebSocket} socket
   * @param {object} payload - { movies: [...] }
   */
  _handleOrderSave(socket, payload) {
    if (!payload || !Array.isArray(payload.movies) || payload.movies.length === 0) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'No movies to save as order' }
      });
      return;
    }

    const info = this._socketInfo.get(socket);
    const createdBy = info ? info.username || 'unknown' : 'unknown';

    // S9 — Re-hydrate from uid only; drop unknown uids, ignore injected fields.
    let movies;
    if (this._indexer) {
      movies = payload.movies
        .filter(item => item && typeof item === 'object' && typeof item.uid === 'string')
        .slice(0, SELECTION_MAX_ITEMS)
        .map(item => {
          const found = this._indexer.getByUid(item.uid);
          return found ? CatalogIndexer.toPublicMovie(found) : null;
        })
        .filter(Boolean);
    } else {
      movies = payload.movies
        .filter(item => item && typeof item === 'object' && typeof item.uid === 'string')
        .slice(0, SELECTION_MAX_ITEMS);
    }

    if (movies.length === 0) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'No valid movies to save as order' }
      });
      return;
    }

    try {
      const result = this._orderManager.createOrder(movies, createdBy);

      // A4 — save failure returns a clear error object (Persian message)
      if (result && result.success === false) {
        this._send(socket, {
          type: 'orders:error',
          payload: { message: result.error || 'ذخیره سفارش انجام نشد' }
        });
        return;
      }

      const order = result;

      this._send(socket, {
        type: 'orders:saved',
        payload: { order }
      });

      this._broadcastToManagers({
        type: 'orders:update',
        payload: { orders: this._orderManager.getOrders() }
      });

      this._clearSelection();

      console.log(`  [WS] Order ${order.id} created by ${createdBy}`);
    } catch (err) {
      console.error(`  [WS] Failed to save order: ${err.message}`);
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'ذخیره سفارش انجام نشد — لطفاً دوباره تلاش کنید' }
      });
    }
  }

  /**
   * Handle orders:delete from a manager.
   *
   * @param {WebSocket} socket
   * @param {object} payload - { orderId: "..." }
   */
  _handleOrderDelete(socket, payload) {
    if (!payload || !payload.orderId) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'Order ID required' }
      });
      return;
    }

    const info = this._socketInfo.get(socket);
    const deletedBy = info ? info.username || 'unknown' : 'unknown';

    const success = this._orderManager.deleteOrder(payload.orderId);

    // A4 — save failure returns { success:false, error }
    if (success && success.success === false) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: success.error || 'حذف سفارش انجام نشد' }
      });
      return;
    }

    if (success === true) {
      this._send(socket, {
        type: 'orders:deleted',
        payload: { orderId: payload.orderId }
      });

      this._broadcastToManagers({
        type: 'orders:update',
        payload: { orders: this._orderManager.getOrders() }
      });

      console.log(`  [WS] Order ${payload.orderId} deleted by ${deletedBy}`);
    } else {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'Order not found' }
      });
    }
  }

  /**
   * Handle orders:list from a manager.
   *
   * @param {WebSocket} socket
   */
  _handleOrderList(socket) {
    this._send(socket, {
      type: 'orders:list',
      payload: { orders: this._orderManager.getOrders() }
    });
  }

  /**
   * Handle orders:update-status from a manager (P6d E5).
   * Broadcasts the refreshed list to every manager (AC5: the change
   * reaches the other manager clients).
   *
   * @param {WebSocket} socket
   * @param {object} payload - { orderId, status }
   */
  _handleOrderStatus(socket, payload) {
    if (!payload || typeof payload.orderId !== 'string' || !payload.orderId) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'شناسه سفارش الزامی است' }
      });
      return;
    }

    const result = this._orderManager.updateOrderStatus(payload.orderId, payload.status);

    if (result === false) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'سفارش مورد نظر یافت نشد' }
      });
      return;
    }

    if (result && result.success === false) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: result.error || 'بروزرسانی وضعیت سفارش انجام نشد' }
      });
      return;
    }

    this._broadcastToManagers({
      type: 'orders:update',
      payload: { orders: this._orderManager.getOrders() }
    });

    console.log(`  [WS] Order ${payload.orderId} status -> ${payload.status}`);
  }

  /**
   * Handle orders:edit from a manager (P6d E5) — customerName / note.
   *
   * @param {WebSocket} socket
   * @param {object} payload - { orderId, customerName?, note? }
   */
  _handleOrderEdit(socket, payload) {
    if (!payload || typeof payload.orderId !== 'string' || !payload.orderId) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'شناسه سفارش الزامی است' }
      });
      return;
    }

    const result = this._orderManager.updateOrderInfo(payload.orderId, {
      customerName: payload.customerName,
      note: payload.note
    });

    if (result && result.success === false) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: result.error || 'بروزرسانی سفارش انجام نشد' }
      });
      return;
    }

    this._broadcastToManagers({
      type: 'orders:update',
      payload: { orders: this._orderManager.getOrders() }
    });

    console.log(`  [WS] Order ${payload.orderId} info edited`);
  }

  /**
   * Handle orders:undo from a manager (P6d E5) — restores a soft-deleted
   * order while its parked copy is still inside the undo window.
   *
   * @param {WebSocket} socket
   * @param {object} payload - { orderId }
   */
  _handleOrderUndo(socket, payload) {
    if (!payload || typeof payload.orderId !== 'string' || !payload.orderId) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'شناسه سفارش الزامی است' }
      });
      return;
    }

    const order = this._orderManager.undoDeleteOrder(payload.orderId);

    if (!order) {
      this._send(socket, {
        type: 'orders:error',
        payload: { message: 'سفارش قابل بازگردانی نیست — مهلت بازگردانی گذشته است' }
      });
      return;
    }

    this._send(socket, {
      type: 'orders:restored',
      payload: { order }
    });

    this._broadcastToManagers({
      type: 'orders:update',
      payload: { orders: this._orderManager.getOrders() }
    });

    console.log(`  [WS] Order ${payload.orderId} restored`);
  }

  /**
   * Clear the active customer selection.
   * Broadcasts cleared state to ALL clients.
   */
  _clearSelection() {
    this._activeCustomerSelection = {
      updatedAt: new Date().toISOString(),
      movies: []
    };

    // Broadcast to ALL clients (customers + managers)
    this._broadcastToAll({
      type: 'selection:cleared',
      payload: { timestamp: new Date().toISOString() }
    });

    // Also send updated empty state
    this._broadcastToAll({
      type: 'selection:state',
      payload: this._activeCustomerSelection
    });
  }

  /**
   * Send initial state to a newly authenticated client.
   *
   * @param {WebSocket} socket
   * @param {string} role
   */
  _sendInitialState(socket, role) {
    this._send(socket, {
      type: 'selection:state',
      payload: this._activeCustomerSelection
    });

    if (role === 'manager' && this._orderManager) {
      this._send(socket, {
        type: 'orders:list',
        payload: { orders: this._orderManager.getOrders() }
      });
    }
  }

  /**
   * Handle a client disconnection.
   * Removes socket from the appropriate role Set.
   * Does NOT clear selection state when customer disconnects.
   *
   * @param {WebSocket} socket
   * @param {number} code
   * @param {string} _reason - close reason text (unused by this handler)
   */
  _handleDisconnect(socket, code, _reason) {
    const info = this._socketInfo.get(socket);
    if (!info) return;

    // Clean up handshake timer if still pending
    if (info.handshakeTimer) {
      clearTimeout(info.handshakeTimer);
    }

    if (info.state === 'UNAUTHENTICATED') {
      console.log(`  [WS] Unauthenticated connection closed (${code})`);
    } else if (info.role === 'customer') {
      this._customerSockets.delete(socket);
      console.log(`  [WS] Customer disconnected (remaining: ${this._customerSockets.size})`);
      // Do NOT clear selection — state persists until admin saves/clears
    } else if (info.role === 'manager') {
      this._managerSockets.delete(socket);
      console.log(`  [WS] Manager disconnected: ${info.username || 'unknown'} (total: ${this._managerSockets.size})`);
    }

    this._removeSocketInfo(socket);
  }

  /**
   * Remove socket info from the tracking map.
   *
   * @param {WebSocket} socket
   */
  _removeSocketInfo(socket) {
    const info = this._socketInfo.get(socket);
    if (info && info.handshakeTimer) {
      clearTimeout(info.handshakeTimer);
    }
    this._socketInfo.delete(socket);
  }

  /**
   * Broadcast a message to all connected managers.
   *
   * @param {object} message
   */
  _broadcastToManagers(message) {
    const data = JSON.stringify(message);
    for (const socket of this._managerSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }

  /**
   * Broadcast a message to all connected clients (customers + managers).
   *
   * @param {object} message
   */
  _broadcastToAll(message) {
    const data = JSON.stringify(message);

    // Send to all customers
    for (const socket of this._customerSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }

    // Send to all managers
    for (const socket of this._managerSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }

  /**
   * Send a message to a specific socket.
   *
   * @param {WebSocket} socket
   * @param {object} message
   */
  _send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat using WebSocket protocol-level ping/pong (S9).
   * Sockets that do not respond to ping within the interval are terminated.
   */
  _startHeartbeat(intervalMs = this._heartbeatIntervalMs || 30000) {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
    }
    this._heartbeatTimer = setInterval(() => {
      for (const socket of this._wss.clients) {
        const info = this._socketInfo.get(socket);
        if (info && !info.isAlive) {
          // Socket did not respond to previous ping → terminate
          try { socket.terminate(); } catch {}
          this._handleDisconnect(socket, 1006, 'Heartbeat timeout');
          continue;
        }
        if (info) info.isAlive = false;
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.ping(); } catch {}
        }
      }
    }, intervalMs);
  }

  /**
   * Get the current selection state.
   * @returns {{ updatedAt: string|null, movies: Array }}
   */
  getSelectionState() {
    return this._activeCustomerSelection;
  }

  /**
   * Broadcast a movie update to all connected clients.
   * This allows real-time UI updates when a movie is edited.
   *
   * @param {object} movie - The updated movie object
   */
  broadcastMovieUpdate(movie) {
    const message = {
      type: 'movie:updated',
      payload: { movie }
    };
    this._broadcastToAll(message);
  }

  /**
   * Broadcast a new movie addition to all connected clients.
   * This allows real-time UI updates when a movie is added.
   *
   * @param {object} movie - The new movie object
   */
  broadcastMovieAdded(movie) {
    const message = {
      type: 'movie:added',
      payload: { movie }
    };
    this._broadcastToAll(message);
  }

  /**
   * Broadcast a catalog reconciliation summary (B6 / DATA-02).
   * Additive message — clients that do not handle it ignore it (P4 wires the UI).
   *
   * @param {{added?:number, updated?:number, removed?:number}} diff
   */
  broadcastCatalogChanged(diff) {
    const message = {
      type: 'catalog:changed',
      payload: {
        added: (diff && diff.added) | 0,
        updated: (diff && diff.updated) | 0,
        removed: (diff && diff.removed) | 0
      }
    };
    this._broadcastToAll(message);
  }

  /**
   * Get connection statistics.
   * @returns {{ customers: number, managers: number }}
   */
  getStats() {
    return {
      customers: this._customerSockets.size,
      managers: this._managerSockets.size
    };
  }

  /**
   * Close all manager sockets that were authenticated with the given token.
   * Called when a session is invalidated (logout or expiry).
   *
   * @param {string} token
   */
  closeManagersByToken(token) {
    for (const socket of this._managerSockets) {
      const info = this._socketInfo.get(socket);
      if (info && info.sessionToken === token) {
        try { socket.close(4001, 'Session invalidated'); } catch {}
        this._managerSockets.delete(socket);
        this._removeSocketInfo(socket);
      }
    }
  }

  /**
   * Close all connections and shut down the WebSocket server.
   */
  close() {
    console.log('  [WS] Shutting down WebSocket server...');

    // Stop heartbeat
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    // Close all tracked sockets (including unauthenticated)
    for (const [socket] of this._socketInfo) {
      try { socket.close(1001, 'Server shutting down'); } catch {}
    }
    this._customerSockets.clear();
    this._managerSockets.clear();

    // Clear all timers
    for (const [, info] of this._socketInfo) {
      if (info.handshakeTimer) {
        clearTimeout(info.handshakeTimer);
      }
    }
    this._socketInfo.clear();

    this._wss.close(() => {
      console.log('  [WS] WebSocket server closed');
    });
  }
}

module.exports = WebSocketServer;
