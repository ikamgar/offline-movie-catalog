'use strict';
/**
 * P6c E2 — add modal: client-side downscale (FE-13), distinct error toasts,
 * inline genre creation, duplicate-title warning, server-driven filename
 * preview (ARCH-03: no local copy of the naming logic).
 *
 * Runs against the REAL app served by the ui-stub.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const catalog = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action', 'Drama'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['Comedy'], type: 'Movie', poster: '/api/poster/0002', imdbRating: null, plotSummary: null },
  { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series', poster: '/api/poster/missing', plotSummary: null }
];

/** Parse JPEG SOF0/SOF2 dimensions — proves the downscale really shrank the image. */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

describe('P6c E2 - add modal downscale/errors/genre/dup/preview', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page, smallPng;

  const createReqs = () => stub.requests.filter(r => r.method === 'POST' && r.path === '/api/movies');
  const toastTexts = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.toast')).map(t => (t.textContent || '').trim()));

  async function openAdd() {
    // Isolation: dismiss leftovers from a previously failed test so a
    // lingering backdrop/confirm dialog never blocks the next one.
    await page.evaluate(() => {
      const add = document.querySelector('add-modal');
      if (add && !add.classList.contains('hidden')) add.hide();
      const confirm = document.querySelector('confirm-modal');
      if (confirm && confirm.classList.contains('open')) confirm.close();
    });
    await page.click('#addMovieBtn');
    await page.waitForSelector('add-modal #addModal', { state: 'visible', timeout: 5000 });
  }

  async function closeAdd() {
    const open = await page.evaluate(() =>
      !document.querySelector('add-modal').classList.contains('hidden'));
    if (!open) return;
    await page.click('#addCancelBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 5000 });
  }

  /** Render noise/wave on a canvas in the page → base64 PNG. */
  function makePng(width, height) {
    return page.evaluate(({ w, h }) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      let seed = 42;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = seed & 0xff;
        img.data[i + 1] = (seed >> 8) & 0xff;
        img.data[i + 2] = (seed >> 16) & 0xff;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, { w: width, h: height });
  }

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 3);
    // Admin login
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
    // Small decodable PNG reused as a valid poster across tests
    const b64 = await makePng(320, 480);
    smallPng = Buffer.from(b64, 'base64');
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('downscales a >4 MB poster before upload: payload cut ≥4×, longest side <= 1400px, size shown', async () => {
    const bigB64 = await makePng(1600, 1600);
    const big = Buffer.from(bigB64, 'base64');
    assert.ok(big.length > 4 * 1024 * 1024,
      `test image must be >4 MB to prove downscale: got ${Math.round(big.length / 1024)} KB`);

    const before = createReqs().length;
    await openAdd();
    await page.setInputFiles('#posterInput', {
      name: 'huge-noise.png', mimeType: 'image/png', buffer: big
    });
    await page.waitForFunction(() =>
      /حجم نهایی/.test(document.querySelector('#posterSizeHint')?.textContent || ''),
      null, { timeout: 10000 });
    const hint = await page.textContent('#posterSizeHint');
    assert.match(hint, /حجم نهایی/, `resulting size must be shown before submit: ${hint}`);

    await page.fill('#addTitle', 'Downscale Probe');
    await page.fill('#addYear', '2020');
    await page.click('input[name="genres"][value="Action"]');
    await page.click('#addSaveBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 10000 });

    const recs = createReqs().slice(before);
    assert.equal(recs.length, 1, `one create POST expected: ${JSON.stringify(recs.map(r => r.path))}`);
    const rec = recs[0];
    // Budget note: q85/1400px of *worst-case noise* measures ~1.15 MB; real
    // photos land at 200–500 KB. The requirement is a material cut, so assert
    // both an absolute ceiling and a ≥4× reduction vs the source PNG.
    assert.ok(rec.posterBytes < 1500 * 1024,
      `payload must shrink under 1.5 MB: original ${Math.round(big.length / 1024)} KB → sent ${Math.round(rec.posterBytes / 1024)} KB`);
    assert.ok(rec.posterBytes < big.length / 4,
      `payload must be ≥4× smaller than the source: original ${Math.round(big.length / 1024)} KB → sent ${Math.round(rec.posterBytes / 1024)} KB`);

    const sent = Buffer.from(rec.posterB64, 'base64');
    const dims = jpegSize(sent);
    assert.ok(dims, 'downscaled payload must be a JPEG');
    assert.ok(dims.width <= 1400 && dims.height <= 1400,
      `longest side must be <= 1400px: got ${dims.width}x${dims.height}`);
  });

  it('filename preview displays the SERVER builder result (ARCH-03, no local copy)', async () => {
    await openAdd();
    await page.fill('#addTitle', 'Server Preview Probe');
    await page.waitForFunction(() =>
      (document.querySelector('#filenameValue')?.textContent || '').startsWith('SRV::'),
      null, { timeout: 8000 });
    const text = await page.textContent('#filenameValue');
    assert.ok(text.includes('Server Preview Probe'),
      `preview must be the stubbed server response, got: ${text}`);
    await closeAdd();
  });

  it('inline genre creation: new genre becomes a checked checkbox and rides the create request', async () => {
    const genre = 'ژانر-تست-پ۶سی';
    const before = createReqs().length;
    await openAdd();

    const addResult = await page.evaluate((g) => {
      const btn = document.querySelector('#genreCreateBtn');
      const input = document.querySelector('#newGenreInput');
      if (!btn || !input) return `missing: btn=${!!btn} input=${!!input}`;
      input.value = g;
      btn.click();
      const cb = document.querySelector(`input[name="genres"][value="${g}"]`);
      if (!cb) return 'checkbox not added';
      return cb.checked ? 'ok' : 'added but not checked';
    }, genre);
    assert.equal(addResult, 'ok', `inline genre creation must add a checked checkbox (${addResult})`);

    await page.fill('#addTitle', 'Genre Form Probe');
    await page.fill('#addYear', '2024');
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.click('#addSaveBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 8000 });

    const recs = createReqs().slice(before);
    assert.equal(recs.length, 1, 'one create POST');
    assert.ok(recs[0].movieData.genres.includes(genre),
      `submitted genres must include the inline-created one: ${JSON.stringify(recs[0].movieData.genres)}`);
  });

  it('probable duplicate (same normalised title + year): warns, does not block', async () => {
    const before = createReqs().length;
    await openAdd();
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'Heat');
    await page.fill('#addYear', '1995');
    await page.click('input[name="genres"][value="Action"]');
    await page.click('#addSaveBtn');

    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 8000 });
    const msg = await page.textContent('#confirmMessage');
    assert.ok(msg.includes('Heat'), `duplicate warning must name the existing title: ${msg}`);
    assert.equal(createReqs().length, before, 'no POST before the warning is answered');

    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 8000 });
    assert.equal(createReqs().length, before + 1,
      'continuing past the warning must still create the movie (warn, never block)');
  });

  it('duplicate warning can be cancelled: modal stays open, nothing submitted', async () => {
    const before = createReqs().length;
    await openAdd();
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'Heat');
    await page.fill('#addYear', '1995');
    await page.click('input[name="genres"][value="Action"]');
    await page.click('#addSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 8000 });

    await page.click('confirm-modal #cancelBtn');
    await page.waitForFunction(() =>
      !document.querySelector('confirm-modal')?.classList.contains('open'), null, { timeout: 5000 });
    const stillOpen = await page.evaluate(() =>
      !document.querySelector('add-modal').classList.contains('hidden'));
    assert.ok(stillOpen, 'add modal must stay open after cancelling the warning');
    assert.equal(createReqs().length, before, 'no POST after cancelling');
    await closeAdd();
  });

  it('rejects a >30 MB file with a Persian message before any upload', async () => {
    const before = createReqs().length;
    await openAdd();
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles('#posterInput', {
      name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(31 * 1024 * 1024, 7)
    });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.toast'))
        .some(t => (t.textContent || '').includes('حداکثر ۳۰ مگابایت')),
      null, { timeout: 8000 });
    const hint = await page.evaluate(() =>
      document.querySelector('#posterSizeHint')?.textContent || '');
    assert.equal(hint, '', 'no size hint for a rejected file');
    assert.equal(createReqs().length, before, 'rejected file never reaches the create endpoint');
    await closeAdd();
  });

  it('rejects a non-image renamed .jpg with a Persian message', async () => {
    const before = createReqs().length;
    await openAdd();
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles('#posterInput', {
      name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html><body>evil</body></html>')
    });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.toast'))
        .some(t => (t.textContent || '').includes('قابل پردازش نیست')),
      null, { timeout: 8000 });
    assert.equal(createReqs().length, before, 'undecodable file never reaches the create endpoint');
    await closeAdd();
  });

  it('every failure cause gets its own distinct Persian toast (400/409/413/network/401)', async () => {
    const cases = [
      {
        name: 'validation 400',
        fail: { status: 400, code: 'TITLE_REQUIRED', error: 'عنوان فیلم الزامی است' },
        expect: 'عنوان فیلم الزامی است'
      },
      {
        name: 'conflict 409',
        fail: { status: 409, code: 'ID_TAKEN', error: 'شناسه 0001 قبلاً استفاده شده است' },
        expect: 'قبلاً استفاده شده'
      },
      {
        name: 'too large 413',
        fail: { status: 413, code: 'IMG_TOO_LARGE', error: 'تصویر پوستر خیلی بزرگ است (حداکثر ۸ مگابایت)' },
        expect: 'خیلی بزرگ'
      }
    ];
    const recorded = [];

    for (const c of cases) {
      stub.failState.current = c.fail;
      try {
        await openAdd();
        await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
        await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
        await page.fill('#addTitle', 'Err Probe ' + c.name);
        await page.fill('#addYear', '2021');
        await page.click('input[name="genres"][value="Action"]');
        await page.click('#addSaveBtn');
        await page.waitForFunction((needle) =>
          Array.from(document.querySelectorAll('.toast'))
            .some(t => (t.textContent || '').includes(needle)),
          c.expect, { timeout: 8000 });
        const texts = await toastTexts();
        const hit = texts.find(t => t.includes(c.expect));
        assert.ok(hit, `[${c.name}] toast must carry the server message: ${JSON.stringify(texts)}`);
        recorded.push(hit);
      } finally {
        stub.failState.current = null;
        await closeAdd();
      }
    }

    // network failure
    await page.route('**/api/movies', route => route.abort('failed'));
    try {
      await openAdd();
      await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
      await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
      await page.fill('#addTitle', 'Err Probe Network');
      await page.fill('#addYear', '2021');
      await page.click('input[name="genres"][value="Action"]');
      await page.click('#addSaveBtn');
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('.toast'))
          .some(t => (t.textContent || '').includes('خطا در اتصال به سرور')),
        null, { timeout: 8000 });
      const texts = await toastTexts();
      const hit = texts.find(t => t.includes('خطا در اتصال به سرور'));
      recorded.push(hit);
    } finally {
      await page.unroute('**/api/movies');
      await closeAdd();
    }

    // auth failure (401) — LAST: api.js logs the user out.
    // The debounced filename preview also hits /api/movies/preview, and the
    // stub applies failState there too — a preview 401 would open the login
    // modal before the save click. So: enter all input first, let the preview
    // settle, THEN arm the 401.
    try {
      await openAdd();
      await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
      await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
      await page.fill('#addTitle', 'Err Probe Auth');
      await page.fill('#addYear', '2021');
      await page.click('input[name="genres"][value="Action"]');
      await page.waitForTimeout(500);
      stub.failState.current = { status: 401, code: 'UNAUTHORIZED', error: 'UNAUTHORIZED' };
      await page.click('#addSaveBtn');
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('.toast'))
          .some(t => (t.textContent || '').includes('نشست شما منقضی شده')),
        null, { timeout: 8000 });
      const texts = await toastTexts();
      assert.ok(!texts.some(t => t.includes('UNAUTHORIZED')),
        `raw error codes must never leak into toasts: ${JSON.stringify(texts)}`);
      const hit = texts.find(t => t.includes('نشست شما منقضی شده'));
      recorded.push(hit);
    } finally {
      stub.failState.current = null;
    }

    assert.equal(recorded.length, 5, `five causes recorded: ${JSON.stringify(recorded)}`);
    assert.equal(new Set(recorded).size, 5,
      `every cause must show a distinct message: ${JSON.stringify(recorded)}`);
  });
});
