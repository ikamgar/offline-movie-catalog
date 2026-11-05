'use strict';
/**
 * Front-end reproductions (headless Chromium via Playwright) against a STUB API — the real server is not needed.
 * Setup once:   npm i -D playwright && npx playwright install chromium
 * Run:          node mimo/repro/repro-ui.js
 * If the DOM was refactored, update selectors — but never weaken what is asserted.
 */
const http = require('http');
const crypto = require('crypto');
const { ROOT, check, done, path, fs } = require('./_lib');
const { publicConfig } = require('../../backend/constants');
const { version: APP_VERSION } = require('../../package.json');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const json = (res, obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const POSTER = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="#345"/></svg>';

function startStub(catalog) {
  const openWs = new Set();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/api/movies') return json(res, { meta: {}, movies: catalog });
    if (url === '/api/games') return json(res, { games: [] });
    if (url === '/api/rescan') return json(res, { success: true });
    if (url === '/api/config') return json(res, publicConfig(APP_VERSION));
    if (url === '/api/poster/missing') { res.statusCode = 404; return res.end('nf'); }
    if (url.startsWith('/api/poster/')) { res.setHeader('Content-Type', 'image/svg+xml'); return res.end(POSTER); }
    if (url.startsWith('/api/')) { res.statusCode = 404; return res.end('nf'); }
    const f = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
  });
  server.on('upgrade', (req, socket) => {            // minimal WebSocket server: handshake + clean close only
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    openWs.add(socket);
    socket.on('close', () => openWs.delete(socket));
    socket.on('error', () => {});
    socket.on('data', (buf) => { if ((buf[0] & 0x0f) === 0x8) { socket.write(Buffer.from([0x88, 0x00])); socket.end(); } });
  });
  return new Promise((r) => server.listen(0, () => r({ server, openWs, port: server.address().port })));
}

const many = Array.from({ length: 400 }, (_, i) => {
  const id = String(i + 1).padStart(4, '0');
  return { uid: id, id, title: 'Movie ' + (i + 1), year: 2000 + (i % 25), genres: ['Action'], type: 'Movie', poster: '/api/poster/' + id, imdbRating: null, plotSummary: null };
});

(async () => {
  const browser = await chromium.launch();

  // ---------- FE-01 + FE-02 ----------
  {
    const { server, openWs, port } = await startStub(many);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript(() => { window.__workers = 0; const W = window.Worker; window.Worker = function (...a) { window.__workers++; return new W(...a); }; });
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40);
    const info = () => page.evaluate(() => {
      let el = document.querySelector('#scrollSentinel'), sc = null;
      while (el && el !== document.documentElement) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5) { sc = el; break; } el = el.parentElement; }
      sc = sc || document.scrollingElement;
      return { cards: document.querySelectorAll('movie-card').length, scrollTop: Math.round(sc.scrollTop) };
    });
    for (let i = 0; i < 15; i++) { await page.evaluate(() => (document.querySelector('#scrollSentinel') || document.body).scrollIntoView()); await page.waitForTimeout(200); }
    const before = await info();
    await page.evaluate(() => { window.__renders = 0; const p = customElements.get('movie-card').prototype, o = p.render; p.render = function () { window.__renders++; return o.apply(this, arguments); }; });
    await page.evaluate((n) => document.querySelectorAll('movie-card')[n - 5].querySelector('[data-action="select"]').click(), before.cards);
    await page.waitForTimeout(500);
    const after = await info(); const renders = await page.evaluate(() => window.__renders);
    await check('FE-01', 'selecting one card must not rebuild the grid or lose scroll position', async () => ({
      present: after.cards !== before.cards || Math.abs(after.scrollTop - before.scrollTop) >= 2 || renders > 2,
      detail: `cards ${before.cards} -> ${after.cards}, scrollTop ${before.scrollTop} -> ${after.scrollTop}, MovieCard.render() calls: ${renders}`
    }));

    const wkBefore = await page.evaluate(() => window.__workers);
    await page.evaluate(async () => { const { store } = await import('/js/store.js'); for (let i = 0; i < 3; i++) await store.rescan(); });
    await page.waitForTimeout(800);
    const wkAfter = await page.evaluate(() => window.__workers);
    await check('FE-02', 'rescan x3 must keep exactly one WebSocket and not spawn extra Workers', async () => ({
      present: openWs.size > 1 || wkAfter > Math.max(wkBefore, 1),
      detail: `open WebSockets: ${openWs.size}, Workers: ${wkBefore} -> ${wkAfter}`
    }));
    await page.close(); server.close();
  }

  // ---------- SEC-04 + FE-04 ----------
  {
    const evil = [
      { uid: '0001', id: '0001', title: '<img src=x onerror="window.__xss=1">Evil', year: 2020, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001' },
      { uid: 'series:greys', id: null, title: "Grey's Anatomy", year: null, genres: [], type: 'Series', poster: '/api/poster/missing', plotSummary: '<img src=x onerror="window.__xss2=1">' }
    ];
    const { server, port } = await startStub(evil);
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
    await page.waitForTimeout(400);
    const gridXss = await page.evaluate(() => !!window.__xss);
    await page.evaluate(() => document.querySelectorAll('movie-card')[1].click());
    await page.waitForTimeout(700);
    const detailXss = await page.evaluate(() => !!window.__xss2);
    const src = await page.evaluate(() => (document.querySelector('movie-detail img') || {}).src || '');
    await check('SEC-04', 'markup in title / plotSummary must be rendered as text, never executed', async () => ({ present: gridXss || detailXss, detail: `grid executed: ${gridXss}, detail executed: ${detailXss}` }));
    await check('FE-04', 'a Series whose title contains an apostrophe must still get the placeholder when its poster 404s', async () => ({
      present: !src.startsWith('data:image/svg+xml') || errors.some((e) => /Unexpected|Invalid|Syntax/i.test(e)),
      detail: `poster src: ${src.slice(0, 50)} | script errors: ${errors.filter((e) => /Unexpected|Invalid|Syntax/i.test(e)).join(';') || 'none'}`
    }));
    await page.close(); server.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error('repro-ui failed to run:', e.message); process.exit(2); });
