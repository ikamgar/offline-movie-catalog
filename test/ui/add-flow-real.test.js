'use strict';
/**
 * P6c E2 — add flow against the REAL server (not the ui-stub):
 * inline genre creation produces a brand-new genre folder on disk with an
 * I4-conformant filename, and the movie lands in the live catalog.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startTestServer } = require('../helpers/test-server');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const GENRE = 'ژانر-تست-پ۶سی';

describe('P6c E2 - real add flow writes a new genre folder', { skip: skipIfNoBrowser() }, () => {
  let browser, srv, page;

  before(async () => {
    srv = await startTestServer({
      tree: { 'Movies/Action/0001- Heat 1995.jpg': null },
      admin: { username: 'admin', password: 'testadmin123456' }
    });
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(srv.baseUrl);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'testadmin123456');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close();
    if (srv) await srv.close();
  });

  it('inline genre + create → real folder, I4 filename, live catalog entry', async () => {
    // Decodable poster generated in-page (canvas is the only reliable source)
    const posterB64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 480;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#2a6';
      ctx.fillRect(0, 0, 320, 480);
      return c.toDataURL('image/png').split(',')[1];
    });
    const poster = Buffer.from(posterB64, 'base64');

    await page.click('#addMovieBtn');
    await page.waitForSelector('add-modal #addModal', { state: 'visible', timeout: 5000 });

    // Inline genre creation (P6c E2)
    const addResult = await page.evaluate((g) => {
      const btn = document.querySelector('#genreCreateBtn');
      const input = document.querySelector('#newGenreInput');
      if (!btn || !input) return `missing: btn=${!!btn} input=${!!input}`;
      input.value = g;
      btn.click();
      const cb = document.querySelector(`input[name="genres"][value="${g}"]`);
      return cb && cb.checked ? 'ok' : 'added but not checked';
    }, GENRE);
    assert.equal(addResult, 'ok', `inline genre creation must work (${addResult})`);

    await page.fill('#addTitle', 'Genre Form Probe');
    await page.fill('#addYear', '2024');
    await page.setInputFiles('#posterInput', {
      name: 'probe.png', mimeType: 'image/png', buffer: poster
    });
    await page.click('#addSaveBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 10000 });

    // 1. Real folder + I4-conformant filename on disk
    const genreDir = path.join(srv.libraryPath, 'Movies', GENRE);
    assert.ok(fs.existsSync(genreDir), `genre folder must exist on disk: ${genreDir}`);
    const files = fs.readdirSync(genreDir);
    const match = files.find(f =>
      /^\d{1,6}- Genre Form Probe 2024\.(jpg|jpeg|png|webp|avif)$/.test(f));
    assert.ok(match,
      `I4-named poster expected in the new genre folder, got: ${JSON.stringify(files)}`);

    // 2. Server catalog knows the movie (extension from magic bytes = png)
    const listed = await page.evaluate(async () => {
      const r = await fetch('/api/movies');
      const d = await r.json();
      return (d.movies || [])
        .filter(m => m.title === 'Genre Form Probe')
        .map(m => ({ genres: m.genres, type: m.type, year: m.year }));
    });
    assert.equal(listed.length, 1, `exactly one Genre Form Probe in catalog: ${JSON.stringify(listed)}`);
    assert.deepEqual(listed[0].genres, [GENRE], 'the inline-created genre must ride the request');
    assert.equal(listed[0].type, 'Movie');
    assert.equal(listed[0].year, 2024);
  });
});
