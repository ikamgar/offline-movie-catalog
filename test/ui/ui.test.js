'use strict';
/**
 * UI defect tests — run against the REAL app served by a stub API + WS server.
 * Ported from mimo/repro/repro-ui.js.  Each test is { todo: '<ID>' } and must fail
 * with MEASURED values in the failure message.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');

// Screenshots go to a temp dir by default so a full run leaves `git status`
// clean; set KEEP_SHOTS=1 to write them into mimo/shots/ for review.
const SHOTS_DIR = process.env.KEEP_SHOTS
  ? path.join(__dirname, '..', '..', 'mimo', 'shots', 'p3g')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'ui-test-shots-p3g-'));

const many = Array.from({ length: 400 }, (_, i) => {
  const id = String(i + 1).padStart(4, '0');
  return { uid: id, id, title: 'Movie ' + (i + 1), year: 2000 + (i % 25), genres: ['Action'], type: 'Movie', poster: '/api/poster/' + id, imdbRating: null, plotSummary: null };
});

const evil = [
  { uid: '0001', id: '0001', title: '<img src=x onerror="window.__xss=1">Evil', year: 2020, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001' },
  { uid: 'series:greys', id: null, title: "Grey's Anatomy", year: null, genres: [], type: 'Series', poster: '/api/poster/missing', plotSummary: '<img src=x onerror="window.__xss2=1">' }
];

// ─── FE-01 + FE-02 ──────────────────────────────────────────────────────────

describe('FE-01 + FE-02 — grid rebuild + socket/worker leak', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript(() => {
      window.__workers = 0;
      const W = window.Worker;
      window.Worker = function (...a) { window.__workers++; return new W(...a); };
    });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('FE-01: selecting one card must not rebuild the grid or lose scroll position', async () => {
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => (document.querySelector('#scrollSentinel') || document.body).scrollIntoView());
      await page.waitForTimeout(200);
    }
    const info = () => page.evaluate(() => {
      let el = document.querySelector('#scrollSentinel'), sc = null;
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5) { sc = el; break; }
        el = el.parentElement;
      }
      sc = sc || document.scrollingElement;
      return { cards: document.querySelectorAll('movie-card').length, scrollTop: Math.round(sc.scrollTop) };
    });
    const before = await info();
    await page.evaluate(() => {
      window.__renders = 0;
      const p = customElements.get('movie-card').prototype, o = p.render;
      p.render = function () { window.__renders++; return o.apply(this, arguments); };
    });
    await page.evaluate((n) => document.querySelectorAll('movie-card')[n - 5].querySelector('[data-action="select"]').click(), before.cards);
    await page.waitForTimeout(500);
    const after = await info();
    const renders = await page.evaluate(() => window.__renders);
    assert.ok(after.cards === before.cards && Math.abs(after.scrollTop - before.scrollTop) < 2 && renders <= 2,
      `cards ${before.cards} -> ${after.cards}, scrollTop ${before.scrollTop} -> ${after.scrollTop}, MovieCard.render() calls: ${renders}`);
  });

  it('FE-02: rescan x3 must keep exactly one WebSocket and not spawn extra Workers', async () => {
    const wkBefore = await page.evaluate(() => window.__workers);
    await page.evaluate(async () => { const { store } = await import('/js/store.js'); for (let i = 0; i < 3; i++) await store.rescan(); });
    await page.waitForTimeout(800);
    const wkAfter = await page.evaluate(() => window.__workers);
    assert.ok(stub.openWs.size <= 1 && wkAfter <= Math.max(wkBefore, 1),
      `open WebSockets: ${stub.openWs.size}, Workers: ${wkBefore} -> ${wkAfter}`);
  });
});

// ─── SEC-04 + FE-04 ─────────────────────────────────────────────────────────

describe('SEC-04 + FE-04 — XSS + onerror placeholder', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(evil);
    page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    page.__errors = errors;
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
    await page.waitForTimeout(400);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('SEC-04: markup in title / plotSummary must be rendered as text, never executed', async () => {
    const gridXss = await page.evaluate(() => !!window.__xss);
    await page.evaluate(() => document.querySelectorAll('movie-card')[1].click());
    await page.waitForTimeout(700);
    const detailXss = await page.evaluate(() => !!window.__xss2);
    assert.ok(!gridXss && !detailXss, `grid executed: ${gridXss}, detail executed: ${detailXss}`);
  });

  it('FE-04: a Series with apostrophe in title must get the placeholder when poster 404s', async () => {
    const detailImg = await page.evaluate(() => {
      const detail = document.querySelector('movie-detail');
      if (!detail) return { src: '', shadow: false };
      const img = detail.shadowRoot
        ? detail.shadowRoot.querySelector('img')
        : detail.querySelector('img');
      return { src: img ? img.src : '', shadow: !!detail.shadowRoot };
    });
    const hasScriptErr = page.__errors.some((e) => /Unexpected|Invalid|Syntax/i.test(e));
    assert.ok(detailImg.src.startsWith('data:image/svg+xml'),
      `(a) movie-detail img src after 404: ${detailImg.src.slice(0, 80)} (shadow=${detailImg.shadow})`);
    assert.ok(!hasScriptErr,
      `(b) no script error from onerror handler: ${page.__errors.filter((e) => /Unexpected|Invalid|Syntax/i.test(e)).join(';') || 'none'}`);
  });
});

// ─── SEC-04b — double-escaping (special chars in title) ─────────────────────

const specialTitle = ` Ocean's "Eleven" & Twelve <Remastered> `;
const specialMovie = [
  { uid: '0999', id: '0999', title: specialTitle, year: 2023, genres: ['Action'], type: 'Movie', poster: '/api/poster/0999' },
];

describe('SEC-04b — double-escaping: special chars rendered as text, not HTML entities', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(specialMovie);
    page = await browser.newPage();
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    await page.waitForTimeout(300);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('SEC-04b: title with quotes, ampersand, angle brackets must display as literal text', async () => {
    const cardText = await page.evaluate(() => {
      const card = document.querySelector('movie-card');
      return card ? card.textContent : '';
    });
    assert.ok(cardText.includes(specialTitle.trim()),
      `card textContent must include the exact title. Got: "${cardText.slice(0, 120)}"`);

    await page.evaluate(() => document.querySelector('movie-card').click());
    await page.waitForTimeout(700);
    const detailText = await page.evaluate(() => {
      const detail = document.querySelector('movie-detail');
      return detail ? detail.textContent : '';
    });
    assert.ok(detailText.includes(specialTitle.trim()),
      `detail textContent must include the exact title. Got: "${detailText.slice(0, 120)}"`);
  });
});

// ─── P3F-ESC — double-escaped nested html`` fragments ───────────────────────
// Owner reports: (1) diagnostics "تداخل اطلاعات" shows literal <div style=…>
// and &amp;quot;; (2) movie-card ID badge shows literal
// <div class="movie-card-id-large">#7669</div>. Owner says Series + Iranian
// look fine, Movie + Animation broken — confirm empirically per type.

const escapeCatalog = [
  { uid: '0001', id: '0001', title: 'Tom & Jerry\'s "Greatest"', year: 2001, genres: ['دوبله فارسی'], type: 'Movie', poster: '/api/poster/0001' },
  { uid: '00002', id: '00002', title: 'Toy <Story> & "More"', year: 1995, genres: ['Animation'], type: 'Animation', poster: '/api/poster/00002' },
  { uid: '0003', id: '0003', title: 'ایرانی & Test "Quote"', year: 2020, genres: ['عاشقانه'], type: 'Iranian', poster: '/api/poster/0003' },
  { uid: 'series:test', id: null, title: 'Series "Test" & <Tag>', year: null, genres: [], type: 'Series', poster: '/api/poster/series' }
];

const escapeDiagnostics = {
  timestamp: new Date().toISOString(),
  summary: {
    totalMovies: escapeCatalog.length,
    totalFiles: escapeCatalog.length,
    totalGenres: 3,
    typeCounts: { Movie: 1, Animation: 1, Iranian: 1, Series: 1 },
    yearRange: { min: 1995, max: 2020 },
    totalIssues: 5
  },
  issues: {
    duplicateIds: [{ id: '0001', count: 2, paths: ['Movies/Action/0001-a.jpg', 'Movies/Drama/0001-b.jpg'] }],
    duplicateSeriesTitles: [{ title: 'Grey\'s "Anatomy" & Co', count: 2 }],
    missingPosters: [{ id: '0004', title: 'Missing "Poster" & <Film>' }],
    invalidFilenames: [{ file: 'bad file <name> & "quote".jpg', reason: 'Invalid format' }],
    missingYears: [],
    unknownTypes: [{ id: '0005', title: 'Unknown "Type" & <Thing>' }],
    brokenLinks: [],
    emptyGenres: [],
    orphanMetadata: [{ key: 'orphan:999 "meta" & <tag>' }],
    conflictingMetadata: [
      {
        key: 'Movie:1596',
        type: 'Movie',
        entries: [
          { title: 'Tom & Jerry\'s "Greatest"', year: 2001, path: 'Movies/Action/0001-t.jpg' },
          { title: 'Tom & Jerry\'s "Best"', year: 2002, path: 'Movies/Comedy/0001-t.jpg' }
        ]
      }
    ]
  },
  storage: {
    warnings: [
      { kind: 'corrupt-quarantined', file: 'file & "name" <bad>.jpg', detail: 'checksum mismatch' }
    ]
  },
  stats: { genreDistribution: {}, yearDistribution: {}, topDecades: {} }
};

describe('P3F-ESC — no literal tags / double-escaped entities in rendered UI', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(escapeCatalog, { diagnostics: escapeDiagnostics });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 4);
    await page.waitForTimeout(400);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P3F-ESC-1: grid cards show no literal <div>/<span> badge markup (report per type)', async () => {
    const results = await page.evaluate(() => {
      const out = {};
      for (const t of ['Movie', 'Animation', 'Iranian', 'Series']) {
        const card = Array.from(document.querySelectorAll('movie-card'))
          .find(c => c.movie && c.movie.type === t);
        if (!card) { out[t] = { found: false }; continue; }
        const text = card.textContent || '';
        out[t] = {
          found: true,
          text: text.slice(0, 300),
          literalIdBadge: text.includes('<div class="movie-card-id-large">'),
          literalDiv: /<div[\s>]/.test(text),
          doubleEscQuote: text.includes('&amp;quot;'),
          doubleEscLt: text.includes('&lt;')
        };
      }
      return out;
    });
    console.log('P3F typeReport:', JSON.stringify(results, null, 2));
    const failures = [];
    for (const [type, report] of Object.entries(results)) {
      if (!report.found) { failures.push(`[${type}] not found`); continue; }
      if (report.literalIdBadge || report.literalDiv || report.doubleEscQuote || report.doubleEscLt) {
        failures.push(`[${type}] literalIdBadge=${report.literalIdBadge}, literalDiv=${report.literalDiv}, ` +
          `doubleEscQuote=${report.doubleEscQuote}, doubleEscLt=${report.doubleEscLt}, text="${report.text}"`);
      }
    }
    assert.equal(failures.length, 0, `broken types: ${failures.join(' | ')}`);
  });

  it('P3F-ESC-2: movie-detail meta/actions show no literal nested html', async () => {
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => c.movie && c.movie.type === 'Movie');
      if (card) card.click();
    });
    await page.waitForTimeout(700);
    const detail = await page.evaluate(() => {
      const el = document.querySelector('movie-detail');
      const text = el ? el.textContent || '' : '';
      return {
        text: text.slice(0, 400),
        literalSpan: /<span[\s>]/.test(text),
        literalButton: /<button[\s>]/.test(text),
        literalDiv: /<div[\s>]/.test(text),
        doubleEscQuote: text.includes('&amp;quot;'),
        doubleEscLt: text.includes('&lt;'),
        hasIdBadge: text.includes('#0001'),
        hasTitle: text.includes('Tom & Jerry\'s "Greatest"')
      };
    });
    assert.ok(!detail.literalSpan && !detail.literalButton && !detail.literalDiv &&
      !detail.doubleEscQuote && !detail.doubleEscLt,
      `movie-detail must not show literal nested markup. Got: "${detail.text}" ` +
      `(literalSpan=${detail.literalSpan}, literalButton=${detail.literalButton}, ` +
      `literalDiv=${detail.literalDiv}, doubleEscQuote=${detail.doubleEscQuote})`);
    assert.ok(detail.hasIdBadge, `detail must show real #0001 badge text, got: "${detail.text}"`);
    assert.ok(detail.hasTitle, `detail must show real title, got: "${detail.text}"`);
    await page.evaluate(() => {
      const btn = document.querySelector('movie-detail #detailClose') ||
        document.querySelector('movie-detail [data-action="close"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
  });

  it('P3F-ESC-3: selection sidebar items show no literal nested html', async () => {
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => c.movie && c.movie.type === 'Movie');
      const btn = card && card.querySelector('[data-action="select"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);
    const sel = await page.evaluate(() => {
      const list = document.querySelector('selection-sidebar #selectionList');
      const text = list ? list.textContent || '' : '';
      return {
        text: text.slice(0, 400),
        literalDiv: /<div[\s>]/.test(text),
        literalSpan: /<span[\s>]/.test(text),
        doubleEscQuote: text.includes('&amp;quot;'),
        doubleEscLt: text.includes('&lt;'),
        hasId: text.includes('#0001'),
        hasYear: text.includes('2001')
      };
    });
    assert.ok(!sel.literalDiv && !sel.literalSpan && !sel.doubleEscQuote && !sel.doubleEscLt,
      `selection sidebar must not show literal nested markup. Got: "${sel.text}" ` +
      `(literalDiv=${sel.literalDiv}, literalSpan=${sel.literalSpan})`);
    assert.ok(sel.hasId, `selection must show real #0001, got: "${sel.text}"`);
    assert.ok(sel.hasYear, `selection must show real year 2001, got: "${sel.text}"`);
    await page.evaluate(() => {
      document.querySelector('selection-sidebar #clearAll')?.click();
      document.querySelector('selection-sidebar #closeSelection')?.click();
    });
    await page.waitForTimeout(300);
  });

  it('P3F-ESC-4: diagnostics panel shows no literal <div style> / double-escaped quotes', async () => {
    await page.evaluate(() => {
      document.body.style.overflow = '';
      document.querySelector('movie-detail #detailClose')?.click();
      document.querySelector('selection-sidebar #clearAll')?.click();
      document.querySelector('selection-sidebar #closeSelection')?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#loginBtn')?.click());
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn', { timeout: 5000 });
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#diagnosticsBtn:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('#diagnosticsBtn')?.click());
    await page.waitForSelector('diagnostics-modal .diag-stat-card', { timeout: 8000 });
    await page.waitForTimeout(300);
    const diag = await page.evaluate(() => {
      const modal = document.querySelector('diagnostics-modal');
      const text = modal ? modal.textContent || '' : '';
      return {
        text: text.slice(0, 800),
        fullLength: text.length,
        literalDivStyle: /<div\s+style=/.test(text),
        literalDiv: /<div[\s>]/.test(text),
        doubleEscQuote: text.includes('&amp;quot;'),
        doubleEscLt: text.includes('&lt;'),
        doubleEscGt: text.includes('&gt;'),
        hasConflictTitle: text.includes('Tom & Jerry\'s "Greatest"'),
        hasSection: text.includes('تداخل اطلاعات'),
        hasInvalidFile: text.includes('bad file <name> & "quote".jpg')
      };
    });
    assert.ok(!diag.literalDivStyle && !diag.literalDiv,
      `diagnostics must not show literal <div> tags. Got: "${diag.text}" ` +
      `(literalDivStyle=${diag.literalDivStyle}, literalDiv=${diag.literalDiv})`);
    assert.ok(!diag.doubleEscQuote && !diag.doubleEscLt && !diag.doubleEscGt,
      `diagnostics must not show double-escaped entities. Got: "${diag.text}" ` +
      `(doubleEscQuote=${diag.doubleEscQuote}, doubleEscLt=${diag.doubleEscLt}, doubleEscGt=${diag.doubleEscGt})`);
    assert.ok(diag.hasSection, `diagnostics must render تداخل اطلاعات section, got: "${diag.text}"`);
    assert.ok(diag.hasConflictTitle,
      `diagnostics must show conflict title as real text (not JSON.stringify/escaped), got: "${diag.text}"`);
    assert.ok(diag.hasInvalidFile,
      `diagnostics must show invalid filename as real text, got: "${diag.text}"`);
  });
});

// ─── P3G — order detail poster must be a fixed thumbnail ────────────────────

describe('P3G — order view posters are fixed-size thumbnails', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many.slice(0, 5));
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('FE-11 (F5): admin empty state renders the corrected string ("آیتمی", not "آیمی")', async () => {
    await page.waitForSelector('#adminPanel .admin-empty-text', { timeout: 5000 });
    const emptyText = await page.$eval('#adminPanel .admin-empty-text', el => el.textContent);
    assert.ok(emptyText.includes('هنوز آیتمی انتخاب نشده است'),
      `admin empty state must render "هنوز آیتمی انتخاب نشده است", got: "${emptyText}"`);
    assert.ok(!emptyText.includes('آیمی'),
      `admin empty state must not contain typo "آیمی", got: "${emptyText}"`);
  });

  it('P3G: order-detail poster renders ≤ thumbnail size and view stays on screen', async () => {
    // Inject an order with three full-size (600×900) posters — the stub's
    // /api/poster SVG is only 20×30 and would hide the missing-CSS bug.
    await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      const big = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">' +
        '<rect width="600" height="900" fill="#c23a3a"/>' +
        '<text x="300" y="460" font-size="48" fill="#fff" text-anchor="middle">FULL</text></svg>'
      );
      const order = {
        id: 'order-0001',
        number: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
        movies: [
          { uid: '0001', id: '0001', title: 'Alpha', year: 2020, type: 'Movie', poster: big },
          { uid: '0002', id: '0002', title: 'Beta', year: 2021, type: 'Movie', poster: big },
          { uid: '0003', id: '0003', title: 'Gamma', year: 2022, type: 'Movie', poster: big }
        ]
      };
      store._set({ orders: [order] });
      store.viewOrder(order);
    });
    await page.waitForSelector('.order-detail-overlay.active .order-detail-movie-poster', { timeout: 5000 });
    await page.waitForTimeout(400);

    const metrics = await page.evaluate(() => {
      const posters = Array.from(document.querySelectorAll('.order-detail-movie-poster'));
      const boxes = posters.map(img => {
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      });
      const overlay = document.querySelector('.order-detail-overlay');
      const detail = document.querySelector('.order-detail');
      const ov = overlay ? overlay.getBoundingClientRect() : null;
      const dt = detail ? detail.getBoundingClientRect() : null;
      const cssApplied = overlay && getComputedStyle(overlay).position === 'fixed';
      return {
        boxes,
        overlayPos: overlay ? getComputedStyle(overlay).position : null,
        detailMaxWidth: detail ? getComputedStyle(detail).maxWidth : null,
        cssApplied,
        overlayBox: ov && { w: Math.round(ov.width), h: Math.round(ov.height) },
        detailBox: dt && { w: Math.round(dt.width), h: Math.round(dt.height) },
        viewport: { w: window.innerWidth, h: window.innerHeight }
      };
    });

    // BEFORE screenshots (desktop + mobile width)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'order-view-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'order-view-mobile.png'), fullPage: false });
    const mobileBoxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.order-detail-movie-poster')).map(img => {
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(200);

    const summary = `desktop=${JSON.stringify(metrics.boxes)} mobile=${JSON.stringify(mobileBoxes)} ` +
      `overlayPos=${metrics.overlayPos} detailMaxWidth=${metrics.detailMaxWidth} ` +
      `cssApplied=${metrics.cssApplied} detailBox=${JSON.stringify(metrics.detailBox)} ` +
      `shots=${SHOTS_DIR}`;

    assert.ok(metrics.cssApplied,
      `order-detail overlay CSS missing (regression from P1c 4777e40): ${summary}`);
    assert.equal(metrics.overlayPos, 'fixed', `overlay must be position:fixed: ${summary}`);
    for (const b of metrics.boxes) {
      assert.ok(b.w <= 80 && b.h <= 120,
        `desktop poster must be ≤80×120 thumbnail, got ${b.w}×${b.h}: ${summary}`);
    }
    for (const b of mobileBoxes) {
      assert.ok(b.w <= 80 && b.h <= 120,
        `mobile poster must be ≤80×120 thumbnail, got ${b.w}×${b.h}: ${summary}`);
    }
    assert.ok(metrics.detailBox && metrics.detailBox.w <= 640,
      `order-detail modal must be ≤640px wide, got ${JSON.stringify(metrics.detailBox)}: ${summary}`);
  });
});

// ─── CSP-SAN — full-app CSP sanity check ────────────────────────────────────

describe('CSP-SAN — zero CSP violations during full app walkthrough', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.__cspViolations = [];
    page.__pageErrors = [];
    page.__consoleErrors = [];
    page.on('securitypolicyviolation', (e) => {
      page.__cspViolations.push({ directive: e.violatedDirective, uri: e.blockedURI, sample: e.sample?.slice(0, 80) });
    });
    page.on('pageerror', (e) => page.__pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') page.__consoleErrors.push(msg.text());
    });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40);
    await page.waitForTimeout(500);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('CSP-SAN: customer + admin walkthrough — zero CSP violations / pageerrors / console errors', async () => {
    // ── Customer: browse, select, detail, search ──
    await page.evaluate(() => document.querySelectorAll('movie-card')[0].click());
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const btn = document.querySelector('movie-detail #detailSelect') || document.querySelector('movie-detail [data-action="select"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const close = document.querySelector('movie-detail #detailClose') || document.querySelector('movie-detail [data-action="close"]');
      if (close) close.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('movie-card')[1].click());
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const close = document.querySelector('movie-detail #detailClose') || document.querySelector('movie-detail [data-action="close"]');
      if (close) close.click();
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const input = document.querySelector('#searchInput') || document.querySelector('input[type="search"]') || document.querySelector('header input');
      if (input) { input.value = 'Movie 5'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(300);

    // ── Admin login ──
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#headerActions:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);

    // ── Diagnostics modal ──
    await page.click('#diagnosticsBtn');
    await page.waitForSelector('diagnostics-modal .diag-stat-card', { timeout: 5000 });
    await page.click('#closeDiag');
    await page.waitForTimeout(300);

    // ── Add-movie modal (hits next-id) ──
    await page.click('#addMovieBtn');
    await page.waitForSelector('add-modal #addModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(400);
    await page.click('add-modal #addCancelBtn');
    await page.waitForTimeout(300);

    // ── Assertions: Node-side collectors (window.__cspViolations was never set — old assert was vacuous) ──
    assert.equal(page.__cspViolations.length, 0,
      `CSP violations: ${JSON.stringify(page.__cspViolations)}`);
    assert.equal(page.__pageErrors.length, 0,
      `pageerrors: ${JSON.stringify(page.__pageErrors)}`);
    assert.equal(page.__consoleErrors.length, 0,
      `console errors: ${JSON.stringify(page.__consoleErrors)}`);
  });
});

// ─── FE-08 — 401 → customer mode + toast + login modal ──────────────────────

describe('FE-08 — 401 drops admin to customer with toast and login modal', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many, { denyAdmin: true });
    page = await browser.newPage();
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('FE-08: admin session + 401 → customer mode, Persian toast, login modal visible', async () => {
    // Pre-set admin session in localStorage before navigating, so the store
    // restores the admin role on page load.
    await page.goto(`http://localhost:${stub.port}/`);
    await page.evaluate(() => {
      localStorage.setItem('mc_adminSession', JSON.stringify({ token: 'test-token', role: 'admin', timestamp: Date.now() }));
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 10);
    await page.waitForTimeout(500);

    // Confirm admin mode is active
    const beforeRole = await page.evaluate(() => {
      const ls = JSON.parse(localStorage.getItem('mc_adminSession') || '{}');
      return ls.role;
    });
    assert.equal(beforeRole, 'admin', 'precondition: role must be admin');

    // Make a direct POST to a 401-returning admin endpoint via the api wrapper
    // This simulates what happens when any admin API call gets a 401 response.
    const result = await page.evaluate(async () => {
      const mod = await import('/js/utils/api.js');
      const resp = await mod.api('/api/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      return { status: resp.status };
    });
    assert.equal(result.status, 401, 'stub must return 401');
    await page.waitForTimeout(800);

    // Verify: localStorage must be cleared after 401 → customer
    const afterLs = await page.evaluate(() => localStorage.getItem('mc_adminSession'));
    assert.ok(!afterLs || afterLs === 'null', `localStorage must be cleared, got: ${afterLs}`);

    // Verify: Persian toast appeared
    const toastText = await page.evaluate(() => {
      const toasts = document.querySelectorAll('.toast');
      return Array.from(toasts).map(t => t.textContent).join(' | ');
    });
    assert.ok(toastText.includes('منقضی شده است'), `toast must mention expiry, got: "${toastText}"`);

    // Verify: login modal is visible
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('login-modal');
      return modal && modal.classList.contains('open');
    });
    assert.ok(modalVisible, 'login modal must be visible after 401');
  });
});

// ─── P3H — confirm-dialog animation + pre-line message (P1c CSS sweep) ──────

const P3H_SHOTS_DIR = process.env.KEEP_SHOTS
  ? path.join(__dirname, '..', '..', 'mimo', 'shots', 'p3h')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'ui-test-shots-p3h-'));

describe('P3H — confirm modal keeps baseline animation and message white-space', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many.slice(0, 5));
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    fs.mkdirSync(P3H_SHOTS_DIR, { recursive: true });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P3H: confirm-dialog animates with modalIn and preserves message newlines', async () => {
    await page.evaluate(() => {
      const modal = document.getElementById('confirmModal');
      modal.show('سطر اول\n\nسطر دوم پس از خط خالی', 'عنوان آزمایشی', () => {}, () => {});
    });
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    await page.waitForTimeout(350);

    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('confirm-modal .modal-dialog');
      const msg = document.querySelector('confirm-modal .confirm-message');
      const cs = dialog ? getComputedStyle(dialog) : null;
      const ms = msg ? getComputedStyle(msg) : null;
      const r = dialog ? dialog.getBoundingClientRect() : null;
      return {
        animationName: cs ? cs.animationName : null,
        animationDuration: cs ? cs.animationDuration : null,
        animation: cs ? `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : null,
        whiteSpace: ms ? ms.whiteSpace : null,
        messageText: msg ? msg.textContent : null,
        dialogBox: r && { w: Math.round(r.width), h: Math.round(r.height) },
        dialogVisible: !!(r && r.width > 0 && r.height > 0)
      };
    });

    await page.screenshot({ path: path.join(P3H_SHOTS_DIR, 'confirm-modal-open.png'), fullPage: false });
    fs.writeFileSync(
      path.join(P3H_SHOTS_DIR, 'metrics.txt'),
      `P3H confirm-modal metrics\n` +
      `animationName: ${metrics.animationName}\n` +
      `animationDuration: ${metrics.animationDuration}\n` +
      `animation: ${metrics.animation}\n` +
      `whiteSpace: ${metrics.whiteSpace}\n` +
      `dialogBox: ${JSON.stringify(metrics.dialogBox)}\n` +
      `dialogVisible: ${metrics.dialogVisible}\n`
    );

    const summary = JSON.stringify(metrics);

    assert.ok(metrics.dialogVisible,
      `confirm dialog must be visible: ${summary}`);
    assert.equal(metrics.animationName, 'modalIn',
      `confirm-dialog animation lost by P1c 4777e40 (never migrated to confirm-modal.js): ${summary}`);
    assert.ok(metrics.animationDuration.startsWith('0.3'),
      `confirm-dialog animation must be 0.3s: ${summary}`);
    assert.equal(metrics.whiteSpace, 'pre-line',
      `confirm-message white-space:pre-line lost by P1c 4777e40 (admin messages use \\n\\n): ${summary}`);
    assert.ok(metrics.messageText && metrics.messageText.includes('\n'),
      `message newlines must be preserved in DOM text: ${summary}`);
  });
});


// ─── P3I — FE-05: Series edit modal must not require a numeric ID ───────────

describe('P3I - Series edit modal (FE-05)', () => {
  let browser, stub, page;

  const seriesCatalog = [
    { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series', poster: '/api/poster/missing', imdbRating: null, plotSummary: null },
    { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null }
  ];

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(seriesCatalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
    // Admin login (cards re-render with edit buttons on role change)
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P3I: Series edit hides ID field, saves via PUT by-uid, movie identified by new title', async () => {
    // Open the Series edit modal from the card edit button
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => (c.textContent || '').includes('Breaking Bad'));
      if (!card) throw new Error('series card not found');
      card.querySelector('[data-action="edit"]').click();
    });
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });

    // ID field must not be present (Series have no numeric ID — FE-05)
    const idState = await page.evaluate(() => {
      const el = document.querySelector('#editId');
      return {
        present: !!el,
        required: el ? el.required : null,
        seriesFieldPresent: !!document.querySelector('#editTitle')
      };
    });
    assert.ok(idState.present === false,
      `Series edit modal must not render #editId (present=${idState.present})`);
    assert.ok(idState.required !== true,
      `ID field must not be required (required=${idState.required})`);
    assert.ok(idState.seriesFieldPresent, 'title field must still be present');

    // Change title only; save is gated by the in-app confirm dialog (D7/FE-14
    // replaced window.confirm), so confirm it before the PUT fires.
    await page.fill('#editTitle', 'Breaking Bad Extra');
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    await page.click('#confirmBtn');
    await page.waitForFunction(() => document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 5000 });

    // Request must have hit PUT /api/movies/by-uid/series%3Abreaking%20bad
    const puts = stub.requests.filter(r => r.method === 'PUT');
    assert.equal(puts.length, 1, `exactly one PUT expected, got ${JSON.stringify(puts)}`);
    const put = puts[0];
    assert.ok(put.path.startsWith('/api/movies/by-uid/'),
      `Series save must use by-uid URL, got: ${put.path}`);
    assert.ok(decodeURIComponent(put.path).includes('series:breaking bad'),
      `by-uid URL must carry the series uid, got: ${put.path}`);
    assert.ok(!put.path.match(/\/api\/movies\/null/) && !put.path.match(/\/api\/movies\/$/),
      `must not call PUT /api/movies/null (FE-05), got: ${put.path}`);
    assert.equal(put.found, true, 'stub must find the series by uid');
    assert.equal(put.patch.title, 'Breaking Bad Extra');

    // Movie still identified by new title after loadCatalog() refresh
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('movie-card'));
      const hit = cards.find(c => (c.textContent || '').includes('Breaking Bad Extra'));
      const stale = cards.find(c => (c.textContent || '').includes('Breaking Bad') &&
        !(c.textContent || '').includes('Breaking Bad Extra'));
      return { hasNewTitle: !!hit, hasStaleTitle: !!stale };
    });
    assert.ok(after.hasNewTitle,
      'catalog must show the new Series title after save');
    assert.ok(!after.hasStaleTitle,
      'old Series title must be gone from the catalog after save');
  });

  it('P3I: Movie edit still shows required ID field (regression guard)', async () => {
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => (c.textContent || '').includes('Heat'));
      if (!card) throw new Error('movie card not found');
      card.querySelector('[data-action="edit"]').click();
    });
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });
    const idState = await page.evaluate(() => {
      const el = document.querySelector('#editId');
      return { present: !!el, required: el ? el.required : null };
    });
    assert.ok(idState.present, 'Movie edit must still render #editId');
    assert.equal(idState.required, true, 'Movie #editId must remain required');
    // Cancel without saving
    await page.click('#editCancelBtn');
    await page.waitForFunction(() => document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 5000 });
  });
});

// ─── P4 — C8 listener & subscription hygiene ────────────────────────────────

describe('P4 — listener & subscription hygiene', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many.slice(0, 50));
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 10);
    await page.waitForTimeout(300);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P4-C8: mount/unmount grid 100× returns subscriber count and document listeners to baseline', async () => {
    const result = await page.evaluate(async () => {
      const { store } = await import('/js/store.js');

      // Spy on document add/removeEventListener
      const origAdd = document.addEventListener.bind(document);
      const origRemove = document.removeEventListener.bind(document);
      let addCount = 0;
      let removeCount = 0;
      document.addEventListener = (...args) => { addCount++; return origAdd(...args); };
      document.removeEventListener = (...args) => { removeCount++; return origRemove(...args); };

      const baselineSubs = store.subscriberCount;
      const baselineAdd = addCount;
      const baselineRemove = removeCount;

      try {
        for (let i = 0; i < 100; i++) {
          const g = document.createElement('movie-grid');
          document.body.appendChild(g);
          await new Promise(r => setTimeout(r, 0));
          g.remove();
        }
      } finally {
        document.addEventListener = origAdd;
        document.removeEventListener = origRemove;
      }

      // Allow microtask notifies to flush
      await new Promise(r => setTimeout(r, 50));

      return {
        subsBefore: baselineSubs,
        subsAfter: store.subscriberCount,
        docAdds: addCount - baselineAdd,
        docRemoves: removeCount - baselineRemove,
        // movie-edit/movie-detail/keydown live on app-root, not per grid mount
        netDocListeners: (addCount - baselineAdd) - (removeCount - baselineRemove)
      };
    });

    assert.equal(result.subsAfter, result.subsBefore,
      `store subscribers must return to baseline: before=${result.subsBefore} after=${result.subsAfter}`);
    assert.ok(result.netDocListeners <= 0,
      `document listener leak: adds=${result.docAdds} removes=${result.docRemoves} net=${result.netDocListeners}`);
  });
});

// ─── P4 — role change: every visible card flips select → edit ──────────────

describe('P4 — role change flips every visible card select→edit', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many.slice(0, 40));
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P4-C4: every visible card switches select→edit on admin login; edit opens the right movie', async () => {
    // ── Before login (customer): every visible card must offer select only ──
    const before = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('movie-card'));
      return {
        count: cards.length,
        uids: cards.map(c => (c._movie || {}).uid),
        titles: cards.map(c => (c._movie || {}).title),
        ids: cards.map(c => String((c._movie || {}).id ?? '')),
        allSelect: cards.every(c =>
          c.querySelector('[data-action="select"]') && !c.querySelector('[data-action="edit"]')),
        editCount: cards.filter(c => c.querySelector('[data-action="edit"]')).length
      };
    });
    assert.ok(before.count >= 40, `expected ≥40 visible cards, got ${before.count}`);
    assert.ok(before.uids.every(Boolean), 'every visible card must expose its uid');
    assert.ok(before.allSelect,
      `before login every card must have select and no edit (editCount=${before.editCount})`);

    // ── Admin login ──
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);

    // ── After login: EVERY visible card must now offer edit only ──
    const after = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('movie-card'));
      return {
        count: cards.length,
        uids: cards.map(c => (c._movie || {}).uid),
        allEdit: cards.every(c =>
          c.querySelector('[data-action="edit"]') && !c.querySelector('[data-action="select"]')),
        leftoverSelect: cards.filter(c => c.querySelector('[data-action="select"]')).length,
        missingEdit: cards.filter(c => !c.querySelector('[data-action="edit"]')).length
      };
    });
    assert.equal(after.count, before.count,
      `card count must not change on login: before=${before.count} after=${after.count}`);
    assert.deepEqual(after.uids, before.uids,
      'same cards must remain in the same order (no grid rebuild on login)');
    assert.ok(after.allEdit,
      `every visible card must show edit and no select after login ` +
      `(leftoverSelect=${after.leftoverSelect} missingEdit=${after.missingEdit})`);

    // ── Click edit on a card that EXISTED BEFORE login → right movie in modal ──
    const idx = 0;
    const targetUid = before.uids[idx];
    const targetTitle = before.titles[idx];
    const targetId = before.ids[idx];
    const clicked = await page.evaluate((uid) => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => (c._movie || {}).uid === uid);
      if (!card) return false;
      card.querySelector('[data-action="edit"]').click();
      return true;
    }, targetUid);
    assert.ok(clicked, `pre-login card uid=${targetUid} must still exist after login`);
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });

    const modal = await page.evaluate(() => ({
      title: (document.querySelector('#editTitle') || {}).value,
      id: (document.querySelector('#editId') || {}).value
    }));
    assert.equal(modal.title, targetTitle,
      `edit modal must show the title of the clicked movie ` +
      `(expected "${targetTitle}", got "${modal.title}")`);
    assert.equal(String(modal.id), targetId,
      `edit modal must show the id of the clicked movie ` +
      `(expected "${targetId}", got "${modal.id}")`);

    // Cancel without saving
    await page.click('#editCancelBtn');
    await page.waitForFunction(() => document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 5000 });
  });
});

// ─── P5a — Persian search normalisation (FE-07) ────────────────────────────

describe('P5a - Persian search normalisation (FE-07)', () => {
  let browser, stub, page;

  const faCatalog = [
    { uid: '0001', id: '0001', title: 'کمدی', year: 2020, genres: ['کمدی'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
    { uid: '0002', id: '0002', title: 'كمدي بزرگ', year: 2019, genres: ['کمدی'], type: 'Movie', poster: '/api/poster/0002', imdbRating: null, plotSummary: null },
    { uid: '0003', id: '0003', title: 'The Dark Knight', year: 2008, genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0003', imdbRating: null, plotSummary: null },
    { uid: 'series:bb', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series', poster: '/api/poster/missing', imdbRating: null, plotSummary: null }
  ];

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(faCatalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 4);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  const typeQuery = async (q) => {
    await page.evaluate((q) => {
      const input = document.querySelector('#searchInput') ||
        document.querySelector('.search-input') || document.querySelector('header input');
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await page.waitForTimeout(500); // debounce 120ms + apply + grid update
  };
  const cardCount = () => page.evaluate(() => document.querySelectorAll('movie-card').length);

  it('P5a: Arabic-typed and Persian-typed کمدی queries each find both stored forms', async () => {
    await typeQuery('كمدي'); // Arabic Kaf + Arabic Yeh
    assert.equal(await cardCount(), 2,
      'Arabic-typed query must find both کمدی titles (stored Persian + stored Arabic)');
    await typeQuery('کمدی'); // Persian
    assert.equal(await cardCount(), 2,
      'Persian-typed query must find both کمدی titles');
    await typeQuery('');
  });

  it('P5a: ۲۰۲۰ finds year 2020; سریال finds Series; null finds nothing', async () => {
    await typeQuery('۲۰۲۰');
    assert.equal(await cardCount(), 1,
      'Persian-digit query ۲۰۲۰ must find the year-2020 item');
    await typeQuery('2020');
    assert.equal(await cardCount(), 1,
      'ASCII 2020 must find the same item');
    await typeQuery('سریال');
    assert.equal(await cardCount(), 1,
      'Persian type label سریال must find the Series');
    await typeQuery('null');
    assert.equal(await cardCount(), 0,
      'typing "null" must not match the Series (id/year are null — FE-07)');
    await typeQuery('');
    assert.equal(await cardCount(), 4,
      'clearing the query must restore all cards');
  });

  it('P5a: movie:updated / movie:added keep the search index fresh (hot patch)', async () => {
    // Hot title patch — the card text changes via state, but search reads the
    // precomputed index; a stale index would make "rises" match nothing.
    stub.broadcast('movie:updated', { movie: { uid: '0003', title: 'The Dark Knight Rises' } });
    await page.waitForTimeout(600);
    await typeQuery('rises');
    assert.equal(await cardCount(), 1,
      'search must find a hot-patched title (index rebuilt on movie:updated)');

    // Hot add — the new item must be searchable without a page reload
    stub.broadcast('movie:added', {
      movie: {
        uid: '0099', id: '0099', title: 'Newly Added Film', year: 2024,
        genres: ['اکشن'], type: 'Movie', poster: '/api/poster/0099',
        imdbRating: null, plotSummary: null
      }
    });
    await page.waitForTimeout(600);
    await typeQuery('added film');
    assert.equal(await cardCount(), 1,
      'a hot-added movie must be searchable without reload (index rebuilt on movie:added)');
    await typeQuery('');
  });
});

// ─── P4 — AC5 catalog:changed refresh without losing scroll ─────────────────

describe('P4 — AC5 catalog:changed refreshes grid without losing scroll', () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(many);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P4-AC5: catalog:changed reloads within 1s and keeps scrollTop when list unchanged', async () => {
    // Scroll down to load more cards
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => (document.querySelector('#scrollSentinel') || document.body).scrollIntoView());
      await page.waitForTimeout(150);
    }
    const before = await page.evaluate(() => {
      let el = document.querySelector('#scrollSentinel'), sc = null;
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5) { sc = el; break; }
        el = el.parentElement;
      }
      sc = sc || document.scrollingElement;
      return { cards: document.querySelectorAll('movie-card').length, scrollTop: Math.round(sc.scrollTop) };
    });

    // Mutate a title that is always in the first rendered batch
    // (Movie 400 has year 2024 → sorts first under year-DESC).
    const target = many.find(m => m.uid === '0400');
    target.title = 'Movie 400 Updated';
    stub.broadcast('catalog:changed', { added: 1, updated: 1, removed: 0 });

    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Movie 400 Updated')),
      null,
      { timeout: 4000 }
    );
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      let el = document.querySelector('#scrollSentinel'), sc = null;
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5) { sc = el; break; }
        el = el.parentElement;
      }
      sc = sc || document.scrollingElement;
      return { cards: document.querySelectorAll('movie-card').length, scrollTop: Math.round(sc.scrollTop) };
    });

    assert.equal(after.cards, before.cards,
      `card count must be unchanged when list uids unchanged: ${before.cards} -> ${after.cards}`);
    assert.ok(Math.abs(after.scrollTop - before.scrollTop) < 50,
      `scrollTop must be preserved: ${before.scrollTop} -> ${after.scrollTop}`);
    target.title = 'Movie 400';
  });
});

// ─── P4 — AC4 restart resync (bootId) ───────────────────────────────────────

describe('P4 — AC4 customer selection survives server restart', () => {
  let browser, stub, page;

  const catalog3 = Array.from({ length: 3 }, (_, i) => {
    const id = String(i + 1).padStart(4, '0');
    return { uid: id, id, title: 'Pick ' + (i + 1), year: 2020, genres: ['Action'], type: 'Movie', poster: '/api/poster/' + id };
  });

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog3, {
      bootId: 'boot-A',
      selectionOnAck: { updatedAt: null, movies: [] }
    });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 3);
    await page.waitForTimeout(500);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P4-AC4: after restart (new bootId) with empty server selection, client re-sends local selection', async () => {
    // Select all 3 cards
    await page.evaluate(() => {
      document.querySelectorAll('movie-card [data-action="select"]').forEach(btn => btn.click());
    });
    await page.waitForFunction(() => {
      return document.querySelectorAll('.movie-card.selected').length === 3;
    }, null, { timeout: 3000 });
    await page.waitForTimeout(400);

    const localCount = await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      return store.state.selectedMovies.length;
    });
    assert.equal(localCount, 3, `precondition: 3 selected, got ${localCount}`);

    // Simulate server restart: new bootId, empty selection, reconnect
    stub.wsState.bootId = 'boot-B';
    stub.wsState.selectionOnAck = { updatedAt: null, movies: [] };
    stub.wsState.received = [];

    await page.evaluate(async () => {
      const mod = await import('/js/realtime/sync-client.js');
      const syncClient = mod.default;
      syncClient.close();
      syncClient.connect(null);
    });

    // Client must re-send its local selection (server would accept it)
    await page.waitForFunction(() => {
      // observe via stub state on Node side — use a marker in the page instead
      return true;
    }, null, { timeout: 100 });

    // Wait for selection:update to arrive at the stub
    const deadline = Date.now() + 3000;
    let resent = null;
    while (Date.now() < deadline) {
      const upd = stub.wsState.received.find(m => m.type === 'selection:update');
      if (upd && Array.isArray(upd.payload.movies) && upd.payload.movies.length === 3) {
        resent = upd;
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    assert.ok(resent, `client must re-send selection:update after bootId change; received=${JSON.stringify(stub.wsState.received.map(m => m.type))}`);
    assert.equal(resent.payload.movies.length, 3, 're-sent selection must keep all 3 titles');

    const stillLocal = await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      return store.state.selectedMovies.length;
    });
    assert.equal(stillLocal, 3, `local selection must not be wiped by empty server state after restart, got ${stillLocal}`);
  });
});

