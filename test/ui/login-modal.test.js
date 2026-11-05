'use strict';
/**
 * P7C-LOGIN-FLAKE (fix 0eb0944) — login-modal autofocus must not steal
 * focus from a field the caller already focused.
 *
 * show() schedules username.focus() 100 ms after open. If #password has
 * focus when that timer fires, the old code yanked focus back to
 * #username — Playwright's fill then appended the password text into the
 * username field, the login guard saw an empty password and returned
 * before POSTing /api/auth/login, and #adminPanel never appeared (the
 * historical 5 s before-hook flake).
 *
 * Regression: open the modal, focus #password inside the 100 ms window,
 * wait comfortably past it (250 ms), assert focus stayed on #password,
 * type a value and assert it landed in #password with #username untouched.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : { skip: 'Playwright browsers not installed' };

const catalog = [
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null }
];

describe('P7C-LOGIN-FLAKE - login modal autofocus keeps caller focus', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('keeps focus on #password through the 100ms autofocus timer; typed text lands there', async () => {
    await page.click('#loginBtn');
    // Focus #password immediately — inside the 100 ms autofocus window.
    await page.evaluate(() => document.querySelector('#password').focus());
    const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(focusedId, 'password',
      `sanity: #password focused inside the window (activeElement.id=${focusedId})`);

    // Comfortably past the 100 ms timer — before the fix this stole focus.
    await page.waitForTimeout(250);
    const afterId = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(afterId, 'password',
      `autofocus must not steal focus (activeElement.id=${afterId} after 250ms)`);

    await page.keyboard.type('hunter2');
    const user = await page.inputValue('#username');
    const pass = await page.inputValue('#password');
    assert.equal(user, '', `#username untouched: '${user}'`);
    assert.equal(pass, 'hunter2', `typed value lands in #password: '${pass}'`);
  });
});
