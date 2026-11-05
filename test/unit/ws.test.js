'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

async function loginAsAdminWs(baseUrl) {
  return loginAsAdmin(baseUrl, 'admin', 'testadmin123456');
}

class CollectingClient {
  constructor(url) {
    this._url = url;
    this._ws = null;
    this._messages = [];
    this._waiters = new Map();
  }

  connect(role, token) {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._url);
      const onOpen = () => {
        this._ws.removeListener('open', onOpen);
        this._ws.removeListener('error', onError);
        this._ws.on('message', (data) => this._onMessage(data));
        this._ws.send(JSON.stringify({ type: 'hello', payload: { role, token } }));
        resolve();
      };
      const onError = (err) => {
        this._ws.removeListener('open', onOpen);
        this._ws.removeListener('error', onError);
        reject(err);
      };
      this._ws.on('open', onOpen);
      this._ws.on('error', onError);
    });
  }

  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const waiter = this._waiters.get(msg.type);
    if (waiter) {
      // Consumed by a pending waitFor — do NOT also queue it, otherwise the
      // next waitFor of the same type resolves with this stale message (P6d).
      this._waiters.delete(msg.type);
      waiter(msg);
      return;
    }
    this._messages.push(msg);
  }

  waitFor(type, timeoutMs) {
    const ms = timeoutMs || 5000;
    return new Promise((resolve, reject) => {
      // Check if already received
      const idx = this._messages.findIndex(m => m.type === type);
      if (idx !== -1) {
        const [msg] = this._messages.splice(idx, 1);
        resolve(msg);
        return;
      }
      const timer = setTimeout(() => {
        this._waiters.delete(type);
        reject(new Error(`Timeout waiting for ${type}`));
      }, ms);
      this._waiters.set(type, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
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
}

describe('WebSocket (characterization)', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
      },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
  });

  after(async () => {
    if (server) await server.close();
  });

  describe('hello handshake', () => {
    it('customer connects and receives hello:ack', async () => {
      const client = new CollectingClient(server.wsUrl);
      await client.connect('customer');
      const ack = await client.waitFor('hello:ack');
      assert.equal(ack.payload.role, 'customer');
      await client.close();
    });

    it('manager connects with valid token', async () => {
      const token = await loginAsAdminWs(server.baseUrl);
      assert.ok(token, 'login should return a token');

      const client = new CollectingClient(server.wsUrl);
      await client.connect('manager', token);
      const ack = await client.waitFor('hello:ack');
      assert.equal(ack.payload.role, 'manager');
      await client.close();
    });

    it('manager with invalid token gets hello:error', async () => {
      const client = new CollectingClient(server.wsUrl);
      await client.connect('manager', 'bad-token');
      const errMsg = await client.waitFor('hello:error');
      assert.ok(errMsg.payload.message);
      await client.close();
    });
  });

  describe('selection broadcast', () => {
    it('customer selection is broadcast to manager', async () => {
      const token = await loginAsAdminWs(server.baseUrl);

      const customer = new CollectingClient(server.wsUrl);
      const manager = new CollectingClient(server.wsUrl);

      await customer.connect('customer');
      await manager.connect('manager', token);

      // Drain initial state messages
      await manager.waitFor('hello:ack');
      await manager.waitFor('selection:state');
      await manager.waitFor('orders:list');

      // Customer sends selection
      const movies = [{ uid: '0001', title: 'Heat', id: '0001' }];
      customer.send({ type: 'selection:update', payload: { movies } });

      const state = await manager.waitFor('selection:state');
      assert.equal(state.payload.movies.length, 1);
      assert.equal(state.payload.movies[0].title, 'Heat');

      await customer.close();
      await manager.close();
    });
  });

  describe('orders round trip', () => {
    it('manager can save and list orders via WS', async () => {
      const token = await loginAsAdminWs(server.baseUrl);

      const manager = new CollectingClient(server.wsUrl);
      await manager.connect('manager', token);

      // Drain initial state messages
      await manager.waitFor('hello:ack');
      await manager.waitFor('selection:state');
      await manager.waitFor('orders:list');

      // Save an order
      const movies = [{ uid: '0001', title: 'Heat', id: '0001' }];
      manager.send({ type: 'orders:save', payload: { movies } });

      const saved = await manager.waitFor('orders:saved');
      assert.ok(saved.payload.order);
      assert.equal(saved.payload.order.movies[0].title, 'Heat');

      await manager.close();
    });
  });

  describe('catalog:changed (B6)', () => {
    it('hot-added poster broadcasts catalog:changed {added,updated,removed}', async () => {
      const fs = require('fs');
      const path = require('path');
      const s = await startTestServer({
        tree: { 'Movies/Action/0001- Heat 1995.jpg': true },
        admin: { username: 'admin', password: 'testadmin123456' }
      });
      try {
        const client = new CollectingClient(s.wsUrl);
        await client.connect('customer');
        await client.waitFor('hello:ack');

        const jpeg = Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
          0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
        ]);
        fs.writeFileSync(path.join(s.libraryPath, 'Movies', 'Action', '0005- Fresh 2021.jpg'), jpeg);

        const changed = await client.waitFor('catalog:changed', 5000);
        assert.equal(typeof changed.payload.added, 'number', 'payload.added');
        assert.equal(typeof changed.payload.updated, 'number', 'payload.updated');
        assert.equal(typeof changed.payload.removed, 'number', 'payload.removed');
        assert.ok(changed.payload.added >= 1, `expected added >= 1, got ${changed.payload.added}`);

        await client.close();
      } finally {
        await s.close();
      }
    });
  });

  // ── P6d E5: orders workflow (status/info edits, soft delete + undo) ──

  describe('P6d E5 - orders workflow via WS', () => {
    async function connectedManagers() {
      const token = await loginAsAdminWs(server.baseUrl);
      const a = new CollectingClient(server.wsUrl);
      await a.connect('manager', token);
      const b = new CollectingClient(server.wsUrl);
      await b.connect('manager', token);
      for (const c of [a, b]) {
        await c.waitFor('hello:ack');
        await c.waitFor('selection:state');
        await c.waitFor('orders:list');
      }
      return { a, b };
    }

    async function saveOrder(client) {
      client.send({ type: 'orders:save', payload: { movies: [{ uid: '0001', title: 'Heat', id: '0001' }] } });
      const saved = await client.waitFor('orders:saved');
      return saved.payload.order;
    }

    it('status change reaches a second manager client (AC5)', async () => {
      const { a, b } = await connectedManagers();
      const order = await saveOrder(a);
      const created = (await b.waitFor('orders:update')).payload.orders.find((o) => o.id === order.id);
      assert.ok(created, 'B sees the new order');
      assert.equal(created.status, 'new', 'new orders start as new');

      a.send({ type: 'orders:update-status', payload: { orderId: order.id, status: 'preparing' } });
      const upd = await b.waitFor('orders:update');
      const changed = upd.payload.orders.find((o) => o.id === order.id);
      assert.ok(changed, 'order still listed after the status change');
      assert.equal(changed.status, 'preparing', 'AC5: the change reached the second client');
      assert.ok(changed.updatedAt, 'updatedAt travels with the order');

      await a.close();
      await b.close();
    });

    it('invalid status is refused with a Persian orders:error and broadcasts nothing', async () => {
      const { a, b } = await connectedManagers();
      const order = await saveOrder(a);
      await b.waitFor('orders:update');

      const before = b._messages.filter((m) => m.type === 'orders:update').length;
      a.send({ type: 'orders:update-status', payload: { orderId: order.id, status: 'archived' } });
      const err = await a.waitFor('orders:error');
      assert.ok(/[\u0600-\u06FF]/.test(err.payload.message || ''), `expected a Persian message, got: ${err.payload.message}`);
      await new Promise((r) => setTimeout(r, 300));
      const after = b._messages.filter((m) => m.type === 'orders:update').length;
      assert.equal(after, before, 'no broadcast for a refused change');

      await a.close();
      await b.close();
    });

    it('orders:edit persists customerName/note and broadcasts (E5 fields)', async () => {
      const { a, b } = await connectedManagers();
      const order = await saveOrder(a);
      await b.waitFor('orders:update');

      a.send({
        type: 'orders:edit',
        payload: { orderId: order.id, customerName: '\u0639\u0644\u06cc \u0631\u0636\u0627\u06cc\u06cc', note: '\u0633\u0627\u0639\u062a \u06f6 \u0639\u0635\u0631' }
      });
      const upd = await b.waitFor('orders:update');
      const edited = upd.payload.orders.find((o) => o.id === order.id);
      assert.ok(edited, 'order still listed after the edit');
      assert.equal(edited.customerName, '\u0639\u0644\u06cc \u0631\u0636\u0627\u06cc\u06cc');
      assert.equal(edited.note, '\u0633\u0627\u0639\u062a \u06f6 \u0639\u0635\u0631');
      assert.equal(edited.status, 'new', 'status untouched by the info edit');

      await a.close();
      await b.close();
    });

    it('orders:undo restores the deleted order with the same number (AC5)', async () => {
      const { a, b } = await connectedManagers();
      const order = await saveOrder(a);
      await b.waitFor('orders:update');

      a.send({ type: 'orders:delete', payload: { orderId: order.id } });
      await a.waitFor('orders:deleted');
      const gone = await b.waitFor('orders:update');
      assert.equal(gone.payload.orders.some((o) => o.id === order.id), false, 'B sees the deletion');

      a.send({ type: 'orders:undo', payload: { orderId: order.id } });
      const restoredMsg = await a.waitFor('orders:restored');
      assert.equal(restoredMsg.payload.order.id, order.id, 'same id comes back');
      assert.equal(restoredMsg.payload.order.number, order.number, 'AC5: the original number is restored');

      const back = await b.waitFor('orders:update');
      const found = back.payload.orders.find((o) => o.id === order.id);
      assert.ok(found, 'B sees the order again');
      assert.equal(found.number, order.number);

      await a.close();
      await b.close();
    });

    it('orders:undo for an expired or unknown id answers with orders:error', async () => {
      const { a, b } = await connectedManagers();
      a.send({ type: 'orders:undo', payload: { orderId: 'order-9999' } });
      const err = await a.waitFor('orders:error');
      assert.ok(/[\u0600-\u06FF]/.test(err.payload.message || ''), `expected a Persian message, got: ${err.payload.message}`);
      await a.close();
      await b.close();
    });
  });

  describe('F1 — WebSocket heartbeat, rate limiting and lifecycle', () => {
    it('heartbeat terminates a dead socket (no pong) within the heartbeat window', async () => {
      const fastHeartbeatServer = await startTestServer({
        admin: { username: 'admin', password: 'testadmin123456' },
        wsOptions: { heartbeatIntervalMs: 50 }
      });

      const client = new WebSocket(fastHeartbeatServer.wsUrl, { autoPong: false });
      let closed = false;
      let closeCode = null;
      client.on('close', (code) => {
        closed = true;
        closeCode = code;
      });

      await new Promise((resolve) => client.on('open', resolve));
      client.send(JSON.stringify({ type: 'hello', payload: { role: 'customer' } }));

      // Wait for 2-3 heartbeat cycles (50ms * 3 = 150ms)
      const t0 = Date.now();
      while (!closed && Date.now() - t0 < 800) {
        await new Promise((r) => setTimeout(r, 20));
      }

      assert.equal(closed, true, 'dead socket must be terminated by heartbeat');
      assert.equal(closeCode, 1006, 'heartbeat termination code is 1006');
      await fastHeartbeatServer.close();
    });

    it('rate limiting: 30 msgs/s stays open, >30 msgs/s closes with 4008', async () => {
      const testServer = await startTestServer({
        admin: { username: 'admin', password: 'testadmin123456' }
      });

      // 1. Send exactly 30 messages in burst -> stays open
      const client30 = new WebSocket(testServer.wsUrl);
      await new Promise((resolve) => client30.on('open', resolve));
      client30.send(JSON.stringify({ type: 'hello', payload: { role: 'customer' } }));
      for (let i = 0; i < 29; i++) {
        client30.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(client30.readyState, WebSocket.OPEN, '30 msgs in 1s must stay open');
      client30.close();

      // 2. Send 31 messages (> 30 msgs/s) -> closed with 4008
      const client31 = new WebSocket(testServer.wsUrl);
      let closeCode = null;
      client31.on('close', (code) => { closeCode = code; });
      await new Promise((resolve) => client31.on('open', resolve));
      client31.send(JSON.stringify({ type: 'hello', payload: { role: 'customer' } }));
      for (let i = 0; i < 30; i++) {
        client31.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
      const t0 = Date.now();
      while (closeCode === null && Date.now() - t0 < 1000) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(closeCode, 4008, 'more than 30 msgs/s must close with 4008');
      await testServer.close();
    });

    it('heartbeat interval is cleared on close and on server stop', async () => {
      const testServer = await startTestServer({
        admin: { username: 'admin', password: 'testadmin123456' }
      });
      const wsServer = testServer.server.wsServer;
      assert.ok(wsServer, 'wsServer reference exists');
      const timer = wsServer._heartbeatTimer;
      assert.ok(timer, 'heartbeat timer is active while running');
      assert.equal(timer._destroyed, false, 'timer must be active before close');

      await testServer.close();
      assert.equal(timer._destroyed, true, 'heartbeat interval timer must be destroyed via clearInterval');
      assert.equal(wsServer._heartbeatTimer, null, 'heartbeat timer is set to null on stop');
    });

    it('socket abort timer is cleared on socket close and on server stop', async () => {
      const testServer = await startTestServer({
        admin: { username: 'admin', password: 'testadmin123456' }
      });
      const wsServer = testServer.server.wsServer;

      // 1. Unauthenticated socket abort timer cleared on socket close
      const client1 = new WebSocket(testServer.wsUrl);
      await new Promise((r) => client1.on('open', r));
      let timer1 = null;
      for (const [, info] of wsServer._socketInfo) {
        if (info.handshakeTimer) {
          timer1 = info.handshakeTimer;
          break;
        }
      }
      assert.ok(timer1, 'unauthenticated socket has active abort timer');
      assert.equal(timer1._destroyed, false);

      client1.close();
      const t0 = Date.now();
      while (!timer1._destroyed && Date.now() - t0 < 1000) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(timer1._destroyed, true, 'socket abort timer cleared on close');

      // 2. Unauthenticated socket abort timer cleared on server stop
      const client2 = new WebSocket(testServer.wsUrl);
      await new Promise((r) => client2.on('open', r));
      let timer2 = null;
      for (const [, info] of wsServer._socketInfo) {
        if (info.handshakeTimer && info.handshakeTimer !== timer1) {
          timer2 = info.handshakeTimer;
          break;
        }
      }
      assert.ok(timer2, 'second unauthenticated socket has active abort timer');
      assert.equal(timer2._destroyed, false);

      await testServer.close();
      assert.equal(timer2._destroyed, true, 'socket abort timer cleared on server stop');
      client2.close();
    });
  });
});
