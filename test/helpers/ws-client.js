'use strict';

const WebSocket = require('ws');

class WSClient {
  constructor(url) {
    this._url = url;
    this._ws = null;
    this._pending = new Map();
    this._role = null;
  }

  connect(role, token) {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._url);
      this._role = role;

      const onOpen = () => {
        cleanup();
        this._ws.on('message', (data) => this._onMessage(data));
        this._ws.send(JSON.stringify({ type: 'hello', payload: { role, token } }));
        resolve();
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this._ws.removeListener('open', onOpen);
        this._ws.removeListener('error', onError);
      };

      this._ws.on('open', onOpen);
      this._ws.on('error', onError);
    });
  }

  _onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const pending = this._pending.get(msg.type);
    if (pending) {
      this._pending.delete(msg.type);
      pending.resolve(msg);
    }

    if (this._onMessageCallback) {
      this._onMessageCallback(msg);
    }
  }

  waitFor(type, timeoutMs) {
    const ms = timeoutMs || 5000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(type);
        reject(new Error(`Timeout waiting for ${type}`));
      }, ms);

      this._pending.set(type, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });
  }

  onMessage(callback) {
    this._onMessageCallback = callback;
  }

  send(message) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    }
  }

  close() {
    return new Promise((resolve) => {
      if (!this._ws || this._ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      this._ws.on('close', () => resolve());
      this._ws.close();
    });
  }

  get readyState() {
    return this._ws ? this._ws.readyState : WebSocket.CLOSED;
  }
}

module.exports = { WSClient };
