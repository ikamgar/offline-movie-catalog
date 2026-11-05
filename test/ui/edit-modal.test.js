'use strict';
/**
 * P6a E1 — edit modal: genre editing (Movie only), poster input,
 * confirm-before-PUT on genre removal, inline Persian errors mapped
 * by structured error code (Q6), not by parsing Persian text.
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
  { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series', poster: '/api/poster/missing', imdbRating: null, plotSummary: null }
];

describe('P6a E1 - edit modal genres/poster/inline errors', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 3);
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

  async function openEdit(title) {
    await page.evaluate((t) => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find(c => (c.textContent || '').includes(t));
      if (!card) throw new Error('card not found: ' + t);
      card.querySelector('[data-action="edit"]').click();
    }, title);
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });
  }

  async function closeEdit() {
    const open = await page.evaluate(() =>
      !document.querySelector('edit-modal').classList.contains('hidden'));
    if (!open) return;
    await page.click('#editCancelBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 5000 });
  }

  const puts = () => stub.requests.filter(r => r.method === 'PUT');

  it('renders genre checkboxes + poster input for a Movie; no genre section for Series', async () => {
    await openEdit('Heat');
    const s = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('#editGenres input[type="checkbox"]'));
      return {
        count: boxes.length,
        checked: boxes.filter(b => b.checked).map(b => b.value),
        poster: !!document.querySelector('#editPosterInput'),
        posterErr: !!document.querySelector('#editPosterError'),
        formErr: !!document.querySelector('#editFormError')
      };
    });
    assert.ok(s.count >= 2, `store genres must render as checkboxes, got ${s.count}`);
    assert.deepEqual([...s.checked].sort(), ['Action', 'Drama'],
      'current movie genres must be pre-checked');
    assert.ok(s.poster, 'poster file input must exist for a Movie');
    assert.ok(s.posterErr, 'poster inline error slot must exist');
    assert.ok(s.formErr, 'form-level inline error slot must exist');
    await closeEdit();

    await openEdit('Breaking Bad');
    const series = await page.evaluate(() => ({
      genres: !!document.querySelector('#editGenres'),
      poster: !!document.querySelector('#editPosterInput')
    }));
    assert.equal(series.genres, false, 'Series must not render the genre section');
    assert.ok(series.poster, 'poster replace must be offered for Series too');
    await closeEdit();
  });

  it('removing a genre: one confirm naming it, no PUT before confirm, exact patch after', async () => {
    await openEdit('Heat');
    await page.click('#editGenres input[value="Drama"]');
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    const msg = await page.textContent('#confirmMessage');
    assert.ok(msg.includes('Drama'), `confirm must name the removed genre: ${msg}`);
    assert.equal(puts().length, 0, 'no PUT may fire before the confirm');

    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 5000 });
    const p = puts();
    assert.equal(p.length, 1, `exactly one PUT expected: ${JSON.stringify(p)}`);
    assert.deepEqual([...p[0].patch.genres].sort(), ['Action'],
      `patch must keep only remaining genres: ${JSON.stringify(p[0].patch.genres)}`);
  });

  it('adding a genre: checked value included in the PUT patch', async () => {
    await openEdit('Inception');
    await page.click('#editGenres input[value="Action"]');
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 5000 });
    const p = puts();
    const last = p[p.length - 1];
    assert.deepEqual([...last.patch.genres].sort(), ['Action', 'Comedy'],
      `patch must include the added genre: ${JSON.stringify(last.patch.genres)}`);
  });

  it('server 409 ID_TAKEN maps to the inline ID field error; modal stays open', async () => {
    stub.failState.current = {
      status: 409, code: 'ID_TAKEN', error: 'شناسه 9999 قبلاً استفاده شده است'
    };
    try {
      await openEdit('Heat');
      await page.fill('#editId', '9999');
      await page.click('#editSaveBtn');
      await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
      await page.click('#confirmBtn');
      await page.waitForFunction(() => {
        const e = document.querySelector('#editIdError');
        return e && !e.hidden && e.textContent.includes('شناسه 9999 قبلاً استفاده شده است');
      }, null, { timeout: 5000 });
      const stillOpen = await page.evaluate(() =>
        !document.querySelector('edit-modal').classList.contains('hidden'));
      assert.ok(stillOpen, 'modal must stay open after a server error');
    } finally {
      stub.failState.current = null;
      await closeEdit();
    }
  });

  it('unmapped server error code shows the form-level inline alert with the Persian text', async () => {
    stub.failState.current = { status: 400, code: 'WEIRD_INTERNAL', error: 'خطای داخلی سرور' };
    try {
      await openEdit('Heat');
      await page.click('#editSaveBtn');
      await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
      await page.click('#confirmBtn');
      await page.waitForFunction(() => {
        const e = document.querySelector('#editFormError');
        return e && !e.hidden && e.textContent.includes('خطای داخلی سرور');
      }, null, { timeout: 5000 });
      const stillOpen = await page.evaluate(() =>
        !document.querySelector('edit-modal').classList.contains('hidden'));
      assert.ok(stillOpen, 'modal must stay open after a server error');
    } finally {
      stub.failState.current = null;
      await closeEdit();
    }
  });

  it('empty title: inline field error before any confirm or PUT', async () => {
    await openEdit('Heat');
    await page.fill('#editTitle', '');
    const before = puts().length;
    await page.click('#editSaveBtn');
    await page.waitForFunction(() => {
      const e = document.querySelector('#editTitleError');
      return e && !e.hidden && e.textContent.trim().length > 0;
    }, null, { timeout: 5000 });
    const confirmOpen = await page.evaluate(() =>
      document.querySelector('confirm-modal').classList.contains('open'));
    assert.ok(!confirmOpen, 'client validation must run before the confirm dialog');
    assert.equal(puts().length, before, 'no PUT may fire when client validation fails');
    await closeEdit();
  });

  // ─── P6b E3 — soft delete from the edit modal (second-click, Q1) ────────

  const deletes = () => stub.requests.filter(r => r.method === 'DELETE');

  it('P6b E3: server delete failure shows the Persian error toast and keeps the modal open', async () => {
    stub.failState.current = { status: 500, code: 'DELETE_FAILED', error: 'حذف فیلم ناموفق بود: simulated' };
    const before = deletes().length;
    try {
      await openEdit('Inception');
      const hasDelete = await page.evaluate(() => !!document.querySelector('#editDeleteBtn'));
      assert.ok(hasDelete, 'حذف فیلم button exists for a Movie');

      await page.click('#editDeleteBtn');
      await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
      await page.click('#confirmBtn');
      await page.waitForFunction(() => {
        const toasts = Array.from(document.querySelectorAll('.toast'));
        return toasts.some(t => (t.textContent || '').includes('حذف فیلم ناموفق بود'));
      }, null, { timeout: 5000 });

      const stillOpen = await page.evaluate(() =>
        !document.querySelector('edit-modal').classList.contains('hidden'));
      assert.ok(stillOpen, 'modal must stay open after a failed delete');
      assert.equal(deletes().length, before + 1, 'DELETE was attempted once');
      const inCatalog = await page.evaluate(() =>
        Array.from(document.querySelectorAll('movie-card'))
          .some(c => (c.textContent || '').includes('Inception')));
      assert.ok(inCatalog, 'movie must remain in the catalog after a failed delete');
    } finally {
      stub.failState.current = null;
      await closeEdit();
    }
  });

  it('P6b E3: delete fires no DELETE before the confirm; second click sends exactly one; card disappears', async () => {
    const before = deletes().length;
    await openEdit('Heat');
    await page.click('#editDeleteBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    const msg = await page.textContent('#confirmMessage');
    assert.ok(msg.includes('Heat'), `confirm must name the title being deleted: ${msg}`);
    assert.ok(/سطل زباله/.test(msg), `confirm must promise recoverability from the trash: ${msg}`);
    assert.equal(deletes().length, before, 'no DELETE may fire before the second click (Q1)');

    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 5000 });

    const d = deletes();
    assert.equal(d.length, before + 1, `exactly one DELETE: ${JSON.stringify(d)}`);
    assert.equal(d[d.length - 1].uid, '0001', 'DELETE targets the by-uid route');

    await page.waitForFunction(() =>
      !Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Heat')), null, { timeout: 5000 });
  });

  it('P6b E3: Series also offers delete (uid route supports series)', async () => {
    await openEdit('Breaking Bad');
    const hasDelete = await page.evaluate(() => !!document.querySelector('#editDeleteBtn'));
    assert.ok(hasDelete, 'delete button exists for a Series too');
    await closeEdit();
  });
});
