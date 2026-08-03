/**
 * WebSocket Connection Manager
 *
 * Shared connection logic for both customer and manager clients.
 * Handles connection, reconnection, and message routing.
 *
 * This module is role-agnostic — it manages the raw WebSocket connection.
 * Role-specific logic lives in sync-client.js and manager-store.js.
 */

class Connection {
  /**
   * @param {string} url - WebSocket server URL (e.g., ws://localhost:3000)
   * @param {string} role - Client role: 'customer' or 'manager'
   * @param {object} handlers - Event handlers: { onOpen, onMessage, onClose, onError }
   * @param {string|null} token - Session token for manager authentication
   */
  constructor(url, role, handlers = {}, token = null) {
    this._url = url;
    this._role = role;
    this._handlers = handlers;
    this._token = token;
    this._ws = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000; // Start at 1 second
    this._maxReconnectDelay = 30000; // Max 30 seconds
    this._isConnected = false;
    this._isClosed = false;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect() {
    if (this._isClosed) return;

    try {
      this._ws = new WebSocket(this._url);

      this._ws.onopen = () => {
        this._isConnected = true;
        this._reconnectDelay = 1000; // Reset delay on successful connection

        // Send hello handshake
        this._sendHello();

        if (this._handlers.onOpen) {
          this._handlers.onOpen();
        }
      };

      this._ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (this._handlers.onMessage) {
            this._handlers.onMessage(message);
          }
        } catch {
          // Silently ignore malformed messages
        }
      };

      this._ws.onclose = (event) => {
        this._isConnected = false;

        if (this._handlers.onClose) {
          this._handlers.onClose(event);
        }

        // Auto-reconnect unless intentionally closed
        if (!this._isClosed) {
          this._scheduleReconnect();
        }
      };

      this._ws.onerror = (error) => {
        if (this._handlers.onError) {
          this._handlers.onError(error);
        }
      };
    } catch {
      this._scheduleReconnect();
    }
  }

  /**
   * Send the hello handshake message.
   * Server expects: { type: "hello", payload: { role: "...", token: "..." } }
   */
  _sendHello() {
    const hello = {
      type: 'hello',
      payload: {
        role: this._role
      }
    };
    if (this._token) {
      hello.payload.token = this._token;
    }
    this.send(hello);
  }

  /**
   * Send a message to the server.
   *
   * @param {object} message
   */
  send(message) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  _scheduleReconnect() {
    if (this._reconnectTimer) return;

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._reconnectDelay);

    // Exponential backoff
    this._reconnectDelay = Math.min(
      this._reconnectDelay * 2,
      this._maxReconnectDelay
    );
  }

  /**
   * Close the connection intentionally.
   */
  close() {
    this._isClosed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close(1000, 'Client closing');
    }
  }

  /**
   * Check if the connection is open.
   * @returns {boolean}
   */
  get isConnected() {
    return this._isConnected;
  }
}

export default Connection;
