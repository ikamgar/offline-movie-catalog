/**
 * Sync Client Module
 *
 * Customer-side WebSocket client that mirrors selection state to the server.
 * This is the synchronization layer that wraps around the Selection Store.
 *
 * Flow:
 *   store.toggleSelection() → store._syncSelectedMovies() → syncClient.send()
 *
 * The Selection Store remains the single source of truth for the customer UI.
 * This module only mirrors that state to the server.
 */

import Connection from './connection.js';

class SyncClient {
  constructor() {
    this._connection = null;
    this._isReady = false;
    this._pendingSelection = null;
    this._onClearCallback = null;
    this._onCustomerStateCallback = null; // For customer: sync selection from server
    this._onAdminStateCallback = null; // For admin: view customer selection
    this._onOrdersUpdateCallback = null;
    this._onOrderSavedCallback = null;
    this._onOrderDeletedCallback = null;
    this._onOrdersListCallback = null;
    this._onMovieUpdatedCallback = null; // For movie updates
    this._onMovieAddedCallback = null; // For new movie additions
    this._onAuthErrorCallback = null;
    this._connectionCounter = 0;
    this._authFailed = false;
  }

  /**
   * Initialize the WebSocket connection.
   * @param {string|null} sessionToken - Optional session token for admin authentication
   */
  connect(sessionToken = null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${window.location.host}`;

    // Role is 'manager' if token provided, 'customer' otherwise
    const role = sessionToken ? 'manager' : 'customer';

    // Connection ID ensures stale onClose handlers from old connections
    // don't interfere with the current connection's state.
    const connectionId = ++this._connectionCounter;

    this._connection = new Connection(url, role, {
      onOpen: () => {
        // Do NOT set _isReady here — wait for hello:ack
      },
      onMessage: (message) => {
        this._handleMessage(message);
      },
      onClose: () => {
        // Ignore events from stale (superseded) connections
        if (connectionId !== this._connectionCounter) return;
        this._isReady = false;
        // If hello:error was received, the session token is invalid.
        // Reconnect as customer so the manager can still see selections.
        if (this._authFailed) {
          this._authFailed = false;
          if (this._onAuthErrorCallback) {
            this._onAuthErrorCallback();
          }
        }
      },
      onError: (error) => {
        console.error('[SYNC] Connection error');
      }
    }, sessionToken);

    this._connection.connect();
  }

  /**
   * Handle incoming messages from the server.
   *
   * @param {object} message
   */
  _handleMessage(message) {
    switch (message.type) {
      case 'hello:ack':
        // Handshake complete — now ready to send messages
        this._isReady = true;

        // Send any pending selection
        if (this._pendingSelection) {
          this.send(this._pendingSelection);
          this._pendingSelection = null;
        }
        break;

      case 'hello:error':
        this._isReady = false;
        this._authFailed = true;
        break;

      case 'selection:state':
        // Handle selection state update
        // Both customer and admin receive this
        if (this._onCustomerStateCallback) {
          this._onCustomerStateCallback(message.payload);
        }
        if (this._onAdminStateCallback) {
          this._onAdminStateCallback(message.payload);
        }
        break;

      case 'selection:cleared':
        // Customer should clear their selection
        if (this._onClearCallback) {
          this._onClearCallback();
        }
        break;

      case 'selection:saved':
        // Selection was saved by admin
        break;

      case 'orders:update':
        // Orders list updated (after save/delete)
        if (this._onOrdersUpdateCallback) {
          this._onOrdersUpdateCallback(message.payload.orders);
        }
        break;

      case 'orders:saved':
        // Order saved confirmation
        if (this._onOrderSavedCallback) {
          this._onOrderSavedCallback(message.payload.order);
        }
        break;

      case 'orders:deleted':
        // Order deleted confirmation
        if (this._onOrderDeletedCallback) {
          this._onOrderDeletedCallback(message.payload.orderId);
        }
        break;

      case 'orders:list':
        // Orders list response
        if (this._onOrdersListCallback) {
          this._onOrdersListCallback(message.payload.orders);
        }
        break;

      case 'movie:updated':
        // Movie was updated by admin
        if (this._onMovieUpdatedCallback) {
          this._onMovieUpdatedCallback(message.payload.movie);
        }
        break;

      case 'movie:added':
        // New movie was added by admin
        if (this._onMovieAddedCallback) {
          this._onMovieAddedCallback(message.payload.movie);
        }
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        // Unknown message type - silently ignore
    }
  }

  /**
   * Set callback for customer state sync (when server sends selection:state to customer).
   * Used to restore/sync customer's own selection from server state.
   *
   * @param {function} callback
   */
  onCustomerStateSync(callback) {
    this._onCustomerStateCallback = callback;
  }

  /**
   * Set callback for admin view of customer selection (when server sends selection:state to admin).
   *
   * @param {function} callback
   */
  onAdminStateUpdate(callback) {
    this._onAdminStateCallback = callback;
  }

  /**
   * Set callback for selection cleared event.
   *
   * @param {function} callback
   */
  onSelectionCleared(callback) {
    this._onClearCallback = callback;
  }

  /**
   * Set callback for orders list updates.
   *
   * @param {function} callback
   */
  onOrdersUpdate(callback) {
    this._onOrdersUpdateCallback = callback;
  }

  /**
   * Set callback for order saved event.
   *
   * @param {function} callback
   */
  onOrderSaved(callback) {
    this._onOrderSavedCallback = callback;
  }

  /**
   * Set callback for order deleted event.
   *
   * @param {function} callback
   */
  onOrderDeleted(callback) {
    this._onOrderDeletedCallback = callback;
  }

  /**
   * Set callback for orders list response.
   *
   * @param {function} callback
   */
  onOrdersList(callback) {
    this._onOrdersListCallback = callback;
  }

  /**
   * Set callback for movie updated event.
   *
   * @param {function} callback
   */
  onMovieUpdated(callback) {
    this._onMovieUpdatedCallback = callback;
  }

  /**
   * Set callback for movie added event.
   *
   * @param {function} callback
   */
  onMovieAdded(callback) {
    this._onMovieAddedCallback = callback;
  }

  /**
   * Send the current selection to the server.
   * If not connected, stores as pending for when connection is established.
   *
   * @param {Array} movies - Full movie objects from the Selection Store
   */
  send(movies) {
    if (!this._connection || !this._isReady) {
      this._pendingSelection = movies;
      return;
    }

    this._connection.send({
      type: 'selection:update',
      payload: { movies }
    });
  }

  /**
   * Send a save command to the server (admin only).
   */
  saveSelection() {
    if (!this._connection || !this._isReady) {
      return;
    }

    this._connection.send({
      type: 'selection:save',
      payload: {}
    });
  }

  /**
   * Send a clear command to the server (admin only).
   */
  clearSelection() {
    if (!this._connection || !this._isReady) {
      return;
    }

    this._connection.send({
      type: 'selection:clear',
      payload: {}
    });
  }

  /**
   * Save movies as an order (admin only).
   *
   * @param {Array} movies - Array of movie objects to save as order
   */
  saveOrder(movies) {
    if (!this._connection || !this._isReady) {
      return;
    }

    this._connection.send({
      type: 'orders:save',
      payload: { movies }
    });
  }

  /**
   * Delete an order (admin only).
   *
   * @param {string} orderId - The order ID to delete
   */
  deleteOrder(orderId) {
    if (!this._connection || !this._isReady) return;

    this._connection.send({
      type: 'orders:delete',
      payload: { orderId }
    });
  }

  /**
   * Request the orders list from the server (admin only).
   */
  requestOrders() {
    if (!this._connection || !this._isReady) return;

    this._connection.send({
      type: 'orders:list',
      payload: {}
    });
  }

  /**
   * Set callback for authentication error (invalid/expired session).
   * Called when the server rejects the hello handshake due to an invalid token.
   *
   * @param {function} callback
   */
  onAuthError(callback) {
    this._onAuthErrorCallback = callback;
  }

  /**
   * Close the connection.
   */
  close() {
    if (this._connection) {
      this._connection.close();
    }
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  get isConnected() {
    return this._isReady;
  }
}

// Singleton instance
const syncClient = new SyncClient();
export default syncClient;
