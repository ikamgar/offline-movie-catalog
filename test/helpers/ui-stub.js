'use strict';
/**
 * Stub HTTP + WebSocket server for Playwright UI tests.
 * Serves the REAL index.html, js/ and css/ from the project root.
 * Fakes only /api/* and the WebSocket handshake (minimal protocol).
 *
 * Usage:
 *   const { startUIStub } = require('./ui-stub');
 *   const { server, openWs, port, close } = await startUIStub(catalog);
 *   const { server, openWs, port, close } = await startUIStub(catalog, { denyAdmin: true });
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { isRestrictedPort } = require('./safe-port');
const { publicConfig, MOVIE_TYPES, PROTOCOL_VERSION } = require('../../backend/constants');
const { seriesKey } = require('../../backend/utils/series-key');
const { version: APP_VERSION } = require('../../package.json');

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const json = (res, obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const POSTER = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="#345"/></svg>';

function startUIStub(catalog, { denyAdmin = false, diagnostics = null, bootId = 'stub-boot-1', selectionOnAck = null, games: gamesSeed = [], failPut = null, trash: trashSeed = [] } = {}) {
  const openWs = new Set();
  const requests = [];
  const wsClients = new Set();
  // P6c E4: mutable games list (create/edit/delete/restore mutate it).
  const games = gamesSeed.map(g => ({ ...g }));
  // P6a E1: mutable PUT failure injection — tests set stub.failState.current
  // to { status, code, error } to simulate server rejections (409/400).
  const failState = { current: failPut };
  // P6b E3: soft-delete trash log (newest-first). Entries keep a `_movie`
  // snapshot so restore can put the movie back into the catalog array.
  const trash = trashSeed.map(e => ({ ...e }));
  let trashIdCounter = Date.now();
  const wsState = {
    bootId,
    selectionOnAck: selectionOnAck || { updatedAt: null, movies: [] },
    received: []
  };

  const encodeFrame = (str) => {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    if (len < 126) {
      return Buffer.concat([Buffer.from([0x81, len]), payload]);
    }
    if (len < 65536) {
      const header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
      return Buffer.concat([header, payload]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    return Buffer.concat([header, payload]);
  };

  const sendTo = (socket, obj) => {
    try { socket.write(encodeFrame(JSON.stringify(obj))); } catch {}
  };

  const broadcast = (type, payload) => {
    for (const socket of openWs) sendTo(socket, { type, payload });
  };

  const decodeClientFrame = (buf) => {
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[0] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    let mask = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      mask = buf.slice(offset, offset + 4);
      offset += 4;
    }
    if (buf.length < offset + len) return null;
    let payload = Buffer.from(buf.slice(offset, offset + len));
    if (mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    return { opcode, text: payload.toString('utf8') };
  };

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/api/movies' && req.method === 'GET') return json(res, { meta: {}, movies: catalog });
    if (url === '/api/games' && req.method === 'GET') return json(res, { games });
    if (url === '/api/config' && req.method === 'GET') return json(res, publicConfig(APP_VERSION));

    // ─── P6c E2: filename preview + create (payload capture, failState) ────
    if (req.method === 'POST' && url === '/api/movies/preview') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch {}
        requests.push({ method: 'POST', path: url, body: b });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        // SRV:: marker: the client must display THIS string verbatim — it
        // proves the preview comes from the server builder (ARCH-03), not
        // from a local copy of the naming logic.
        const type = b.type || 'Movie';
        const title = String(b.title || '').trim() || 'X';
        const id = b.id ? String(b.id) : '';
        const year = b.year != null && b.year !== '' ? String(b.year) : '';
        const ext = String(b.extension || 'jpg').replace(/^\./, '');
        let filename;
        if (type === 'Series' || type === 'Game') {
          filename = `${title}.${ext}`;
        } else if (type === 'Movie') {
          filename = `${id || '0000'}- ${title}${year ? ' ' + year : ''}.${ext}`;
        } else {
          filename = `${id || '0000'}-${title}.${ext}`;
        }
        return json(res, { success: true, filename: 'SRV::' + filename });
      });
      return;
    }
    // ─── P6c E4: game create (payload capture, failState, mutable games) ──
    if (req.method === 'POST' && url === '/api/games') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let gameData = {};
        try { gameData = JSON.parse(body || '{}'); } catch {}
        const poster = typeof gameData.poster === 'string' ? gameData.poster : '';
        const b64 = poster.includes(',') ? poster.split(',')[1] : poster;
        requests.push({
          method: 'POST', path: url, gameData,
          posterB64: b64,
          posterBytes: Math.floor(b64.length * 3 / 4),
          bodyBytes: Buffer.byteLength(body)
        });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        const title = String(gameData.title || '').trim();
        const key = title.replace(/\s+/g, ' ').toLowerCase();
        const game = {
          uid: 'game:' + key,
          title,
          platforms: Array.isArray(gameData.platforms) ? [...gameData.platforms].sort() : [],
          type: 'Game',
          poster: '/api/game-poster/' + encodeURIComponent(key)
        };
        const at = games.findIndex(g => g.uid === game.uid);
        if (at >= 0) games[at] = game; else games.push(game);
        return json(res, { success: true, game });
      });
      return;
    }
    if (req.method === 'POST' && url === '/api/movies') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let movieData = {};
        try { movieData = JSON.parse(body || '{}'); } catch {}
        const poster = typeof movieData.poster === 'string' ? movieData.poster : '';
        const b64 = poster.includes(',') ? poster.split(',')[1] : poster;
        requests.push({
          method: 'POST', path: url, movieData,
          posterB64: b64,
          posterBytes: Math.floor(b64.length * 3 / 4),
          bodyBytes: Buffer.byteLength(body)
        });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        return json(res, {
          success: true,
          movie: {
            uid: movieData.id || 'stub-uid', id: movieData.id || null,
            title: movieData.title || '', type: movieData.type || 'Movie',
            year: movieData.year || null, genres: movieData.genres || [],
            poster: '/api/poster/stub'
          }
        });
      });
      return;
    }

    // Track mutations for assertions (P3I Series edit via by-uid)
    if (req.method === 'PUT' && url.startsWith('/api/movies/by-uid/')) {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let patch = {};
        try { patch = JSON.parse(body || '{}'); } catch {}
        const uid = url.slice('/api/movies/by-uid/'.length);
        // P6c E4: game uids live in `games`, not `catalog`
        if (uid.startsWith('game:')) {
          const g = games.find(x => String(x.uid) === uid);
          requests.push({ method: 'PUT', path: url, uid, patch, found: !!g, isGame: true });
          if (failState.current) {
            res.statusCode = failState.current.status || 400;
            return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
          }
          if (!g) { res.statusCode = 404; return json(res, { success: false, error: 'فایل یافت نشد', code: 'NOT_FOUND' }); }
          if (patch.title != null) {
            g.title = patch.title;
            g.uid = 'game:' + String(patch.title).trim().replace(/\s+/g, ' ').toLowerCase();
          }
          if (Array.isArray(patch.platforms)) g.platforms = [...patch.platforms].sort();
          return json(res, { success: true, game: { ...g } });
        }
        const m = catalog.find(x => String(x.uid) === uid);
        requests.push({ method: 'PUT', path: url, uid, patch, found: !!m });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        if (!m) { res.statusCode = 404; return json(res, { success: false, error: 'not found' }); }
        if (patch.title != null) {
          m.title = patch.title;
          if (m.type === 'Series') {
            m.uid = 'series:' + seriesKey(String(patch.title));
          }
        }
        if (patch.year !== undefined) m.year = patch.year;
        if (patch.imdbRating !== undefined) m.imdbRating = patch.imdbRating;
        if (patch.plotSummary !== undefined) m.plotSummary = patch.plotSummary;
        if (Array.isArray(patch.genres)) m.genres = patch.genres;
        return json(res, { success: true, movie: { ...m } });
      });
      return;
    }
    if (req.method === 'PUT' && url.startsWith('/api/movies/')) {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let patch = {};
        try { patch = JSON.parse(body || '{}'); } catch {}
        const id = url.slice('/api/movies/'.length);
        const m = catalog.find(x => String(x.id) === id);
        requests.push({ method: 'PUT', path: url, id, patch, found: !!m });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        if (!m) { res.statusCode = 404; return json(res, { success: false, error: 'not found' }); }
        if (patch.title != null) m.title = patch.title;
        if (patch.year !== undefined) m.year = patch.year;
        if (patch.id != null) m.id = patch.id;
        if (patch.imdbRating !== undefined) m.imdbRating = patch.imdbRating;
        if (patch.plotSummary !== undefined) m.plotSummary = patch.plotSummary;
        if (Array.isArray(patch.genres)) m.genres = patch.genres;
        return json(res, { success: true, movie: { ...m } });
      });
      return;
    }

    // ─── P6b E3: soft delete / restore / trash list ────────────────────────
    if (req.method === 'DELETE' && url.startsWith('/api/movies/by-uid/')) {
      const uid = url.slice('/api/movies/by-uid/'.length);
      // P6c E4: games delete from `games`, one trash row per platform copy
      if (uid.startsWith('game:')) {
        const gidx = games.findIndex(x => String(x.uid) === uid);
        requests.push({ method: 'DELETE', path: url, uid, found: gidx >= 0, isGame: true });
        if (failState.current) {
          res.statusCode = failState.current.status || 400;
          return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
        }
        if (gidx < 0) {
          res.statusCode = 404;
          return json(res, { success: false, error: 'فایل یافت نشد', code: 'NOT_FOUND' });
        }
        const [g] = games.splice(gidx, 1);
        const id = String(trashIdCounter++);
        trash.unshift({
          id,
          uid: String(g.uid),
          title: g.title,
          type: 'Game',
          originalPaths: (g.platforms || ['PS4']).map(p => 'Games/' + p + '/' + g.title + '.jpg'),
          deletedBy: 'admin',
          deletedAt: new Date().toISOString(),
          _game: g
        });
        return json(res, { success: true, id, uid: String(g.uid), title: g.title, moved: (g.platforms || []).length });
      }
      const idx = catalog.findIndex(x => String(x.uid) === uid);
      requests.push({ method: 'DELETE', path: url, uid, found: idx >= 0 });
      if (failState.current) {
        res.statusCode = failState.current.status || 400;
        return json(res, { success: false, error: failState.current.error || 'stub failure', code: failState.current.code || null });
      }
      if (idx < 0) {
        res.statusCode = 404;
        return json(res, { success: false, error: 'فایل یافت نشد', code: 'NOT_FOUND' });
      }
      const [m] = catalog.splice(idx, 1);
      const id = String(trashIdCounter++);
      trash.unshift({
        id,
        uid: String(m.uid),
        title: m.title,
        type: m.type,
        originalPaths: ['Movies/Action/' + (m.id || '') + '.jpg'],
        deletedBy: 'admin',
        deletedAt: new Date().toISOString(),
        _movie: m
      });
      return json(res, { success: true, id, uid: String(m.uid), title: m.title, moved: 1 });
    }
    if (req.method === 'GET' && url === '/api/trash') {
      requests.push({ method: 'GET', path: url });
      const entries = trash
        .filter(e => !e.purgedAt)
        .slice(0, 20)
        .map(({ _movie, _game, ...rest }) => rest);
      return json(res, { success: true, entries });
    }
    if (req.method === 'POST' && /^\/api\/trash\/[^/]+\/restore$/.test(url)) {
      const id = url.split('/')[3];
      requests.push({ method: 'POST', path: url, id });
      const i = trash.findIndex(e => String(e.id) === id && !e.purgedAt);
      if (i < 0) {
        res.statusCode = 404;
        return json(res, { success: false, error: 'این مورد در سطل زباله یافت نشد', code: 'TRASH_NOT_FOUND' });
      }
      const [entry] = trash.splice(i, 1);
      if (entry._game) {
        // P6c E4: restored games go back into `games`, not the movie catalog
        const g = entry._game;
        if (!games.some(x => String(x.uid) === String(g.uid))) games.push(g);
        return json(res, { success: true, id, restored: 1, type: entry.type, uid: entry.uid });
      }
      if (entry._movie) catalog.push(entry._movie);
      return json(res, { success: true, id, restored: 1 });
    }

    // When denyAdmin is set, return 401 for protected admin endpoints
    if (denyAdmin && req.method === 'POST' &&
        (url === '/api/rescan' || url === '/api/orders' || url === '/api/auth/logout')) {
      res.statusCode = 401;
      return json(res, { success: false, error: 'UNAUTHORIZED' });
    }

    if (url === '/api/rescan') return json(res, { success: true });

    // Admin diagnostics report (CSP-SAN admin walkthrough)
    if (url === '/api/diagnostics') {
      if (diagnostics) return json(res, diagnostics);
      return json(res, {
        timestamp: new Date().toISOString(),
        summary: {
          totalMovies: catalog.length,
          totalFiles: catalog.length,
          totalGenres: 1,
          typeCounts: { Movie: catalog.length },
          yearRange: { min: null, max: null },
          totalIssues: 0
        },
        issues: {
          duplicateIds: [], duplicateSeriesTitles: [], missingPosters: [],
          invalidFilenames: [], missingYears: [], unknownTypes: [],
          brokenLinks: [], emptyGenres: [], conflictingMetadata: [], orphanMetadata: []
        },
        stats: { genreDistribution: {}, yearDistribution: {}, topDecades: {} }
      });
    }

    // next-id (query string kept: url above strips ?…)
    if (req.url.startsWith('/api/movies/next-id')) {
      const type = new URLSearchParams(req.url.split('?')[1] || '').get('type');
      if (!type || !MOVIE_TYPES.includes(type)) {
        return json(res, { success: false, error: 'Invalid type' });
      }
      if (type === 'Series') return json(res, { success: true, nextId: null });
      let maxId = 0;
      for (const m of catalog) {
        if (m.type === type && m.id) {
          const n = parseInt(m.id, 10);
          if (!Number.isNaN(n) && n > maxId) maxId = n;
        }
      }
      const width = type === 'Animation' ? 5 : 4;
      return json(res, { success: true, nextId: String(maxId + 1).padStart(width, '0') });
    }

    if (url === '/favicon.ico') { res.statusCode = 204; return res.end(); }

    // Auth endpoints for FE-08 testing
    if (url === '/api/auth/status') {
      return json(res, { setupRequired: false });
    }
    if (url === '/api/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { username, password } = JSON.parse(body);
          if (username === 'admin' && password === 'password123') {
            return json(res, { success: true, token: 'test-token-for-fe08', role: 'manager' });
          }
          return json(res, { success: false, error: 'نام کاربری یا رمز عبور اشتباه است' });
        } catch { return json(res, { success: false, error: 'bad request' }); }
      });
      return;
    }

    if (url === '/api/poster/missing' || url === '/api/game-poster/missing') { res.statusCode = 404; return res.end('nf'); }
    if (url.startsWith('/api/poster/') || url.startsWith('/api/game-poster/')) { res.setHeader('Content-Type', 'image/svg+xml'); return res.end(POSTER); }

    if (url.startsWith('/api/')) { res.statusCode = 404; return res.end('nf'); }
    const f = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  server.on('upgrade', (req, socket) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    openWs.add(socket);
    wsClients.add(socket);
    socket.on('close', () => { openWs.delete(socket); wsClients.delete(socket); });
    socket.on('error', () => {});
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      // close frame
      if (buf.length >= 2 && (buf[0] & 0x0f) === 0x8) {
        try { socket.write(Buffer.from([0x88, 0x00])); } catch {}
        socket.end();
        return;
      }
      // parse one or more text frames (hello, selection:update, …)
      while (buf.length >= 2) {
        const frame = decodeClientFrame(buf);
        if (!frame) break;
        // consume: approximate — recompute length from header
        const masked = (buf[0] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let headerLen = 2;
        if (len === 126) { len = buf.readUInt16BE(2); headerLen = 4; }
        else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); headerLen = 10; }
        if (masked) headerLen += 4;
        const total = headerLen + len;
        if (buf.length < total) break;
        buf = buf.slice(total);

        if (frame.opcode !== 1) continue;
        let msg = null;
        try { msg = JSON.parse(frame.text); } catch { continue; }
        if (!msg || !msg.type) continue;
        wsState.received.push(msg);

        if (msg.type === 'hello') {
          const role = (msg.payload && msg.payload.role) === 'manager' ? 'manager' : 'customer';
          sendTo(socket, {
            type: 'hello:ack',
            payload: { role, username: null, protocol: PROTOCOL_VERSION, bootId: wsState.bootId }
          });
          sendTo(socket, {
            type: 'selection:state',
            payload: wsState.selectionOnAck
          });
        } else if (msg.type === 'selection:update' && msg.payload) {
          wsState.selectionOnAck = {
            updatedAt: new Date().toISOString(),
            movies: Array.isArray(msg.payload.movies) ? msg.payload.movies : []
          };
          broadcast('selection:state', wsState.selectionOnAck);
        } else if (msg.type === 'ping') {
          sendTo(socket, { type: 'pong', payload: {} });
        }
      }
    });
  });
  // Chromium refuses restricted ports (ERR_UNSAFE_PORT) — re-roll ephemeral
  // port 0 until we land on a browser-safe one.
  const listenSafe = (attempt) => new Promise((r, rej) => {
    server.listen(0, () => {
      const p = server.address().port;
      if (!isRestrictedPort(p)) {
        r({
          server,
          openWs,
          requests,
          trash,
          wsState,
          failState,
          broadcast,
          port: p,
          close: () => new Promise((done) => { for (const s of openWs) try { s.destroy(); } catch {} server.close(done); })
        });
        return;
      }
      server.close(() => {
        if (attempt >= 25) { rej(new Error('startUIStub: no browser-safe port after 25 attempts')); return; }
        listenSafe(attempt + 1).then(r, rej);
      });
    });
  });
  return listenSafe(0);
}

module.exports = { startUIStub };
