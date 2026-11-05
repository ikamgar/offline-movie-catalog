'use strict';
/**
 * P6b E3 — admin panel trash section («سطل زباله»):
 * lists the last 20 deletions newest-first after admin login, and the
 * restore button POSTs /api/trash/:id/restore, drops the row and puts
 * the movie back into the catalog.
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
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
  { uid: '0002', id: '0002', title: 'Inception', year: 2010, genres: ['Comedy'], type: 'Movie', poster: '/api/poster/0002', imdbRating: null, plotSummary: null }
];

const trashSeed = [
  {
    id: '300', uid: '0003', title: 'Older Film', type: 'Movie',
    originalPaths: ['Movies/Action/0003- Older 1990.jpg'],
    deletedBy: 'admin', deletedAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: '200', uid: '0004', title: 'Newer Film', type: 'Movie',
    originalPaths: ['Movies/Drama/0004- Newer 2001.jpg', 'Movies/Action/0004- Newer 2001.jpg'],
    deletedBy: 'admin', deletedAt: '2026-09-02T11:30:00.000Z',
    _movie: {
      uid: '0004', id: '0004', title: 'Newer Film', year: 2001, genres: ['Drama', 'Action'],
      type: 'Movie', poster: '/api/poster/0004', imdbRating: null, plotSummary: null
    }
  }
];

describe('P6b E3 - admin trash panel', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog, { trash: trashSeed });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
    // Admin login — the trash list loads on the role transition
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForSelector('#trashList .admin-trash-item', { timeout: 5000 });
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('lists trash entries newest-first with title, date and file count', async () => {
    const items = await page.$$eval('#trashList .admin-trash-item',
      els => els.map(el => el.textContent));
    assert.equal(items.length, 2, `both entries listed: ${JSON.stringify(items)}`);
    assert.ok(items[0].includes('Newer Film'), `newest first: ${items[0]}`);
    assert.ok(items[1].includes('Older Film'), `oldest last: ${items[1]}`);

    const newer = items[0];
    assert.ok(newer.includes('2'), `file count of the 2-copy entry shown: ${newer}`);
    assert.ok(/\d{4}/.test(newer.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
      `deletion date shown: ${newer}`);
  });

  it('restore posts to /api/trash/:id/restore, removes the row, and the movie returns to the grid', async () => {
    const restoreReqs = () => stub.requests.filter(r => r.method === 'POST' && /\/restore$/.test(r.path));
    const before = restoreReqs().length;

    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#trashList .admin-trash-item'))
        .find(r => (r.textContent || '').includes('Newer Film'));
      if (!row) throw new Error('trash row not found');
      row.querySelector('[data-action="restore"]').click();
    });

    await page.waitForFunction(() =>
      !document.querySelector('#trashList')?.textContent.includes('Newer Film'), null, { timeout: 5000 });

    const rr = restoreReqs();
    assert.equal(rr.length, before + 1, `one restore POST: ${JSON.stringify(rr)}`);
    assert.equal(String(rr[rr.length - 1].id), '200', 'restore targets the entry id');

    // Server-side restore pushes the movie back; the handler reloads the catalog
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Newer Film')), null, { timeout: 5000 });

    const stillListed = await page.$$eval('#trashList .admin-trash-item',
      els => els.map(el => el.textContent));
    assert.equal(stillListed.length, 1, 'restored entry removed from the list');
    assert.ok(stillListed[0].includes('Older Film'), 'the other entry stays');
  });

  it('empty trash shows the empty state after the last entry is restored', async () => {
    await page.evaluate(() => {
      const row = document.querySelector('#trashList .admin-trash-item [data-action="restore"]');
      if (row) row.click();
    });
    await page.waitForFunction(() =>
      (document.querySelector('#trashList')?.textContent || '').includes('خالی'), null, { timeout: 5000 });
  });
});
