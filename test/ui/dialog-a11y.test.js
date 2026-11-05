'use strict';
/**
 * D7 / FE-14 — modal accessibility (P5b).
 *
 * Every dialog must have role="dialog" + aria-modal + aria-labelledby pointing
 * at a real Persian title, receive focus on open, trap Tab/Shift+Tab inside,
 * close on Escape (TOP dialog only), restore focus to the opener, replace the
 * native window.confirm() with the in-app confirm modal, and carry Persian
 * aria-labels on icon-only buttons.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const catalog = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null },
  { uid: 'series:breaking bad', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series', poster: '/api/poster/missing', imdbRating: null, plotSummary: null }
];

/** activeElement is the container itself or inside it */
function focusInside(page, containerSelector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const a = document.activeElement;
    return !!c && (a === c || c.contains(a));
  }, containerSelector);
}

function dialogAria(page, selector) {
  return page.evaluate((sel) => {
    const dlg = document.querySelector(sel);
    if (!dlg) return { found: false };
    const id = dlg.getAttribute('aria-labelledby');
    const label = id ? document.getElementById(id) : null;
    return {
      found: true,
      role: dlg.getAttribute('role'),
      ariaModal: dlg.getAttribute('aria-modal'),
      labelledby: id,
      labelText: label ? label.textContent.trim() : null
    };
  }, selector);
}

describe('D7 / FE-14 — modal accessibility', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 2);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('FE-14a: login dialog — role/aria, focus-in, Tab trap, Escape, focus restore', async () => {
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open .modal-dialog', { timeout: 5000 });

    const aria = await dialogAria(page, 'login-modal.open .modal-dialog');
    assert.ok(aria.found, 'login dialog element must exist');
    assert.equal(aria.role, 'dialog', `role: ${JSON.stringify(aria)}`);
    assert.equal(aria.ariaModal, 'true', `aria-modal: ${JSON.stringify(aria)}`);
    assert.ok(aria.labelledby, `aria-labelledby must be set: ${JSON.stringify(aria)}`);
    assert.ok(aria.labelText && aria.labelText.length > 0,
      `aria-labelledby must resolve to a titled element: ${JSON.stringify(aria)}`);

    const closeLabel = await page.evaluate(() =>
      document.querySelector('login-modal #closeBtn')?.getAttribute('aria-label') || '');
    assert.ok(closeLabel.length > 0, 'login close button must carry a Persian aria-label');

    assert.ok(await focusInside(page, 'login-modal .modal-dialog'),
      `focus must move into the dialog on open (activeElement=${await page.evaluate(() => document.activeElement && document.activeElement.id)})`);

    for (let i = 1; i <= 12; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await focusInside(page, 'login-modal .modal-dialog'),
        `Tab press #${i} escaped the login dialog trap`);
    }
    await page.keyboard.press('Shift+Tab');
    assert.ok(await focusInside(page, 'login-modal .modal-dialog'),
      'Shift+Tab escaped the login dialog trap');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('login-modal')?.classList.contains('open'),
      null, { timeout: 5000 });
    const restored = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(restored, 'loginBtn',
      `Escape must close the dialog and restore focus to its opener (activeElement=#${restored})`);

    // log in as admin for the remaining tests
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);
  });

  it('FE-14b: save is gated by confirm modal (not window.confirm); Escape cancels top only', async () => {
    await page.evaluate(() => {
      window.__nativeConfirm = 0;
      const native = window.confirm;
      window.confirm = function (...args) { window.__nativeConfirm++; return native.apply(window, args); };
    });

    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('movie-card'))
        .find((c) => (c.textContent || '').includes('Heat'));
      if (!card) throw new Error('Heat card not found');
      card.querySelector('[data-action="edit"]').click();
    });
    await page.waitForSelector('edit-modal:not(.hidden) #editForm', { timeout: 5000 });
    assert.ok(await focusInside(page, 'edit-modal #editModal'),
      'focus must move into the edit dialog on open');

    await page.fill('#editTitle', 'Heat Edited');
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });

    const confirmAria = await dialogAria(page, 'confirm-modal.open .modal-dialog');
    assert.equal(confirmAria.role, 'dialog', `confirm role: ${JSON.stringify(confirmAria)}`);
    assert.equal(confirmAria.ariaModal, 'true', `confirm aria-modal: ${JSON.stringify(confirmAria)}`);
    assert.equal(confirmAria.labelledby, 'confirmTitle', `confirm labelledby: ${JSON.stringify(confirmAria)}`);
    assert.ok(await focusInside(page, 'confirm-modal .modal-dialog'),
      'focus must move into the confirm dialog on open');
    const editOpen = await page.evaluate(() =>
      !document.querySelector('edit-modal').classList.contains('hidden'));
    assert.ok(editOpen, 'edit dialog must stay open behind the confirm dialog (stacking)');

    // Escape closes ONLY the top dialog
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('confirm-modal').classList.contains('open'),
      null, { timeout: 5000 });
    const editStill = await page.evaluate(() =>
      !document.querySelector('edit-modal').classList.contains('hidden'));
    assert.ok(editStill, 'Escape must close only the confirm dialog, not the edit dialog behind it');
    assert.ok(await focusInside(page, 'edit-modal #editModal'),
      'focus must return into the edit dialog after the confirm dialog closes');
    assert.equal(await page.evaluate(() => window.__nativeConfirm), 0,
      'native window.confirm must not be called anywhere in the save flow');

    // Confirming completes the save
    const putsBefore = stub.requests.filter((r) => r.method === 'PUT').length;
    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    await page.click('#confirmBtn');
    await page.waitForFunction(() => document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 5000 });
    const puts = stub.requests.filter((r) => r.method === 'PUT');
    assert.equal(puts.length, putsBefore + 1,
      `confirming must issue exactly one PUT, got ${puts.length - putsBefore} new`);
    assert.equal(await page.evaluate(() => window.__nativeConfirm), 0,
      'native window.confirm must not be called even after confirming');
    assert.ok(await page.evaluate(() => {
      const a = document.activeElement;
      return a === document.body || (a && !a.closest('confirm-modal'));
    }), 'focus must not remain stuck in the closed confirm dialog');
  });

  it('FE-14c: movie-detail, shortcuts and diagnostics dialogs expose aria and close on Escape', async () => {
    // movie-detail
    await page.evaluate(() => document.querySelectorAll('movie-card')[0].click());
    await page.waitForSelector('movie-detail:not(.hidden) [role="dialog"]', { timeout: 5000 });
    let aria = await dialogAria(page, 'movie-detail:not(.hidden) [role="dialog"]');
    assert.equal(aria.role, 'dialog', `movie-detail: ${JSON.stringify(aria)}`);
    assert.equal(aria.ariaModal, 'true', `movie-detail: ${JSON.stringify(aria)}`);
    assert.ok(aria.labelText && aria.labelText.length > 0, `movie-detail title: ${JSON.stringify(aria)}`);
    assert.ok(await focusInside(page, 'movie-detail'),
      'focus must move into the movie detail dialog on open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('movie-detail')?.classList.contains('hidden'),
      null, { timeout: 5000 });

    // shortcuts (?)
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('?');
    await page.waitForSelector('shortcuts-modal:not(.hidden) [role="dialog"]', { timeout: 5000 });
    aria = await dialogAria(page, 'shortcuts-modal:not(.hidden) [role="dialog"]');
    assert.equal(aria.role, 'dialog', `shortcuts: ${JSON.stringify(aria)}`);
    assert.ok(aria.labelText && aria.labelText.length > 0, `shortcuts title: ${JSON.stringify(aria)}`);
    assert.ok(await focusInside(page, 'shortcuts-modal'),
      'focus must move into the shortcuts dialog on open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('shortcuts-modal')?.classList.contains('hidden'),
      null, { timeout: 5000 });

    // diagnostics (admin header button)
    await page.click('#diagnosticsBtn');
    await page.waitForSelector('diagnostics-modal:not(.hidden) [role="dialog"]', { timeout: 5000 });
    aria = await dialogAria(page, 'diagnostics-modal [role="dialog"]');
    assert.equal(aria.role, 'dialog', `diagnostics: ${JSON.stringify(aria)}`);
    assert.equal(aria.ariaModal, 'true', `diagnostics: ${JSON.stringify(aria)}`);
    assert.ok(aria.labelText && aria.labelText.length > 0, `diagnostics title: ${JSON.stringify(aria)}`);
    assert.ok(await focusInside(page, 'diagnostics-modal'),
      'focus must move into the diagnostics dialog on open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() =>
      document.querySelector('diagnostics-modal')?.classList.contains('hidden'), null, { timeout: 5000 });
  });

  it('FE-14d: icon-only header buttons carry Persian aria-labels', async () => {
    const labels = await page.evaluate(() =>
      ['rescanBtn', 'diagnosticsBtn', 'toggleTheme'].map((id) => {
        const el = document.getElementById(id);
        return { id, ariaLabel: el ? el.getAttribute('aria-label') : null };
      }));
    for (const { id, ariaLabel } of labels) {
      assert.ok(ariaLabel && ariaLabel.trim().length > 0,
        `#${id} must have a non-empty Persian aria-label (got ${JSON.stringify(ariaLabel)})`);
    }
  });
});
