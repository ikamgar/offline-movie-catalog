'use strict';
/**
 * P6c E4 — games management UI: add a game (platforms, POST /api/games),
 * edit a game (platform checkboxes, no movie fields), delete a game,
 * restore a game from the trash with game wording, admin-panel label.
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
  { uid: '0001', id: '0001', title: 'Heat', year: 1995, genres: ['Action'], type: 'Movie', poster: '/api/poster/0001', imdbRating: null, plotSummary: null }
];

const games = [
  { uid: 'game:fifa 24', title: 'FIFA 24', platforms: ['PS4'], type: 'Game', poster: '/api/game-poster/fifa%2024' },
  { uid: 'game:hades', title: 'Hades', platforms: ['PS4', 'PS5'], type: 'Game', poster: '/api/game-poster/hades' }
];

const trashSeed = [
  {
    id: '9001', uid: 'game:celeste', title: 'Celeste', type: 'Game',
    originalPaths: ['Games/PS4/Celeste.jpg'],
    deletedBy: 'admin', deletedAt: '2026-01-01T00:00:00.000Z',
    _game: { uid: 'game:celeste', title: 'Celeste', platforms: ['PS4'], type: 'Game', poster: '/api/game-poster/celeste' }
  }
];

describe('P6c E4 - games add/edit/delete/restore UI', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page, smallPng;

  const gameReqs = () => stub.requests.filter(r => r.method === 'POST' && r.path === '/api/games');
  const toastTexts = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.toast')).map(t => (t.textContent || '').trim()));

  async function toGamesMode() {
    await page.click('#mediaModeToggle [data-mode="games"]');
    await page.waitForFunction(() =>
      document.querySelector('#mediaModeToggle [data-mode="games"]')?.classList.contains('active') &&
      document.querySelectorAll('movie-card').length >= 2, null, { timeout: 8000 });
  }

  async function openAdd() {
    await page.evaluate(() => {
      const add = document.querySelector('add-modal');
      if (add && !add.classList.contains('hidden')) add.hide();
      const confirm = document.querySelector('confirm-modal');
      if (confirm && confirm.classList.contains('open')) confirm.close();
      const edit = document.querySelector('edit-modal');
      if (edit && !edit.classList.contains('hidden') && typeof edit.hide === 'function') edit.hide();
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

  /** Click the edit pencil on the card whose title matches. */
  async function openEditFor(title) {
    const clicked = await page.evaluate((t) => {
      const cards = Array.from(document.querySelectorAll('movie-card'));
      const card = cards.find(c => (c.textContent || '').includes(t));
      if (!card) return 'card-not-found';
      const btn = card.querySelector('.movie-card-edit-btn');
      if (!btn) return 'edit-btn-not-found';
      btn.click();
      return 'ok';
    }, title);
    assert.equal(clicked, 'ok',
      `edit button must be present on the "${title}" game card (got: ${clicked})`);
    await page.waitForSelector('edit-modal #editModal', { state: 'visible', timeout: 5000 });
  }

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(catalog, { games, trash: trashSeed });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
    // Admin login
    await page.click('#loginBtn');
    await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('#submitBtn');
    await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
    // Small decodable PNG reused as a valid poster across tests
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 480;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#248';
      ctx.fillRect(0, 0, 320, 480);
      return c.toDataURL('image/png').split(',')[1];
    });
    smallPng = Buffer.from(b64, 'base64');
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('admin panel add button follows the media mode: «افزودن بازی» in games mode', async () => {
    const moviesLabel = await page.textContent('#addMovieBtn');
    assert.ok(moviesLabel.includes('افزودن فیلم'),
      `movies mode keeps its label: ${moviesLabel}`);

    await toGamesMode();
    await page.waitForFunction(() =>
      (document.querySelector('#addMovieBtn')?.textContent || '').includes('افزودن بازی'),
      null, { timeout: 5000 });
    const label = await page.textContent('#addMovieBtn');
    assert.ok(label.includes('افزودن بازی'), `games mode label expected: ${label}`);
  });

  it('add modal: game chip shows platforms and hides movie fields; no platform → Persian toast, no POST', async () => {
    await openAdd();
    await page.click('.type-btn[data-type="Game"]', { timeout: 5000 });
    await page.waitForSelector('add-modal #platformFieldGroup', { state: 'visible', timeout: 5000 });

    const fields = await page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(`add-modal ${sel}`);
        if (!el) return 'missing';
        return el.style.display === 'none' ? 'hidden' : 'visible';
      };
      return {
        id: vis('#idFieldGroup'),
        year: vis('#yearFieldGroup'),
        genre: vis('#genreFieldGroup'),
        imdb: vis('#imdbFieldGroup'),
        plot: vis('#plotFieldGroup'),
        platforms: vis('#platformFieldGroup'),
        boxes: Array.from(document.querySelectorAll('add-modal input[name="platforms"]'))
          .map(i => i.value)
      };
    });
    assert.deepEqual(fields.boxes, ['PS4', 'PS5'], `both platforms offered: ${JSON.stringify(fields.boxes)}`);
    assert.equal(fields.platforms, 'visible', 'platform group shown for games');
    for (const key of ['id', 'year', 'genre', 'imdb', 'plot']) {
      assert.equal(fields[key], 'hidden', `${key} field group must be hidden for games`);
    }

    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'No Platform Probe');
    await page.evaluate(() => {
      document.querySelectorAll('add-modal input[name="platforms"]').forEach(i => { i.checked = false; });
    });
    const before = gameReqs().length;
    await page.click('#addSaveBtn');
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.toast'))
        .some(t => (t.textContent || '').includes('حداقل یک پلتفرم')),
      null, { timeout: 8000 });
    assert.equal(gameReqs().length, before, 'no POST /api/games without a platform');
    await closeAdd();
  });

  it('add modal: a valid game posts to /api/games and appears in the grid', async () => {
    const before = gameReqs().length;
    await openAdd();
    await page.click('.type-btn[data-type="Game"]', { timeout: 5000 });
    await page.waitForSelector('add-modal #platformFieldGroup', { state: 'visible', timeout: 5000 });
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'Stub Game');
    await page.evaluate(() => {
      document.querySelectorAll('add-modal input[name="platforms"]').forEach(i => { i.checked = true; });
    });
    await page.click('#addSaveBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 10000 });

    const recs = gameReqs().slice(before);
    assert.equal(recs.length, 1, `one POST /api/games expected: ${JSON.stringify(recs.map(r => r.path))}`);
    assert.equal(recs[0].gameData.title, 'Stub Game');
    assert.deepEqual([...recs[0].gameData.platforms].sort(), ['PS4', 'PS5']);
    assert.ok(recs[0].posterBytes > 0, 'poster rides the request');

    const texts = await toastTexts();
    assert.ok(texts.some(t => t.includes('بازی با موفقیت اضافه شد')),
      `game success toast expected: ${JSON.stringify(texts)}`);

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Stub Game')), null, { timeout: 8000 });
  });

  it('probable duplicate game: warns with the title, cancel keeps the modal, continue posts', async () => {
    // Cancel first
    let before = gameReqs().length;
    await openAdd();
    await page.click('.type-btn[data-type="Game"]', { timeout: 5000 });
    await page.waitForSelector('add-modal #platformFieldGroup', { state: 'visible', timeout: 5000 });
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'Hades');
    await page.evaluate(() => {
      document.querySelectorAll('add-modal input[name="platforms"]').forEach(i => { i.checked = true; });
    });
    await page.click('#addSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 8000 });
    const msg = await page.textContent('#confirmMessage');
    assert.ok(msg.includes('Hades'), `duplicate warning must name the existing game: ${msg}`);
    assert.equal(gameReqs().length, before, 'no POST before the warning is answered');

    await page.click('confirm-modal #cancelBtn');
    await page.waitForFunction(() =>
      !document.querySelector('confirm-modal')?.classList.contains('open'), null, { timeout: 5000 });
    const stillOpen = await page.evaluate(() =>
      !document.querySelector('add-modal').classList.contains('hidden'));
    assert.ok(stillOpen, 'add modal must stay open after cancelling the warning');
    assert.equal(gameReqs().length, before, 'no POST after cancelling');
    await closeAdd();

    // Continue
    await openAdd();
    await page.click('.type-btn[data-type="Game"]', { timeout: 5000 });
    await page.waitForSelector('add-modal #platformFieldGroup', { state: 'visible', timeout: 5000 });
    await page.setInputFiles('#posterInput', { name: 'p.png', mimeType: 'image/png', buffer: smallPng });
    await page.fill('#addTitle', 'Hades');
    await page.evaluate(() => {
      document.querySelectorAll('add-modal input[name="platforms"]').forEach(i => { i.checked = true; });
    });
    await page.click('#addSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 8000 });
    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('add-modal')?.classList.contains('hidden'), null, { timeout: 8000 });
    assert.equal(gameReqs().length, before + 1,
      'continuing past the warning must still create the game (warn, never block)');
  });

  it('edit modal for a game: platform checkboxes, no movie fields, «حذف بازی», PUT carries the game uid', async () => {
    await openEditFor('Hades');

    const state = await page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(`edit-modal ${sel}`);
        if (!el) return 'missing';
        if (el.style.display === 'none') return 'hidden';
        return el.offsetParent === null ? 'hidden' : 'visible';
      };
      return {
        platforms: vis('#editPlatforms'),
        genres: vis('#editGenres'),
        id: vis('#editId'),
        year: vis('#editYear'),
        imdb: vis('#editImdb'),
        plot: vis('#editPlot'),
        boxes: Array.from(document.querySelectorAll('edit-modal input[name="platforms"]'))
          .map(i => ({ v: i.value, checked: i.checked })),
        deleteText: (document.querySelector('#editDeleteBtn')?.textContent || '').trim(),
        title: document.querySelector('#editTitle')?.value || ''
      };
    });
    assert.equal(state.platforms, 'visible', 'platform group must show for games');
    assert.deepEqual(state.boxes, [
      { v: 'PS4', checked: true }, { v: 'PS5', checked: true }
    ], `both platform boxes checked: ${JSON.stringify(state.boxes)}`);
    for (const key of ['genres', 'id', 'year', 'imdb', 'plot']) {
      assert.equal(state[key], 'hidden', `${key} must be hidden for games`);
    }
    assert.ok(state.deleteText.includes('حذف بازی'),
      `delete button must say «حذف بازی»: "${state.deleteText}"`);
    assert.equal(state.title, 'Hades', 'title loaded');

    const puts = () => stub.requests.filter(r => r.method === 'PUT' &&
      r.path.startsWith('/api/movies/by-uid/') && r.isGame);
    const before = puts().length;
    await page.fill('#editTitle', 'Hades II');
    await page.click('#editSaveBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 8000 });

    // _performSave hides the modal BEFORE loadCatalog/fetchGames resolve, and
    // a title change re-keys the game uid (stub ui-stub.js and the real
    // server both derive uid from the title, I6). Wait until the grid renders
    // the new title so the next test can never open the edit modal against
    // the stale `game:hades` uid and 404 its save (P7C stall root cause).
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Hades II')),
      null, { timeout: 8000 });

    const recs = puts().slice(before);
    assert.equal(recs.length, 1, `one game PUT expected: ${JSON.stringify(recs)}`);
    assert.equal(recs[0].uid, 'game:hades');
    assert.ok(recs[0].found, 'stub found the game under its game: uid');
    assert.equal(recs[0].patch.title, 'Hades II');
  });

  it('removing a platform: one confirm naming it, no PUT before confirm, exact patch after', async () => {
    await openEditFor('Hades');
    await page.click('#editPlatforms input[value="PS5"]');
    const puts = () => stub.requests.filter(r => r.method === 'PUT' &&
      r.path.startsWith('/api/movies/by-uid/') && r.isGame);
    const before = puts().length;

    await page.click('#editSaveBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 5000 });
    const msg = await page.textContent('#confirmMessage');
    assert.ok(msg.includes('PS5'), `confirm must name the removed platform: ${msg}`);
    assert.equal(puts().length, before, 'no PUT may fire before the confirm');

    await page.click('#confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'),
      null, { timeout: 8000 });
    const recs = puts().slice(before);
    assert.equal(recs.length, 1, `exactly one game PUT expected: ${JSON.stringify(recs)}`);
    assert.deepEqual([...recs[0].patch.platforms].sort(), ['PS4'],
      `patch must keep only remaining platforms: ${JSON.stringify(recs[0].patch.platforms)}`);
  });

  it('deleting a game confirms, issues the DELETE, and the card disappears', async () => {
    await openEditFor('FIFA 24');
    await page.click('#editDeleteBtn');
    await page.waitForSelector('confirm-modal.open .modal-dialog', { timeout: 8000 });

    const dels = () => stub.requests.filter(r => r.method === 'DELETE' && r.isGame);
    const before = dels().length;
    await page.click('confirm-modal #confirmBtn');
    await page.waitForFunction(() =>
      document.querySelector('edit-modal')?.classList.contains('hidden'), null, { timeout: 8000 });

    const recs = dels().slice(before);
    assert.equal(recs.length, 1, `one game DELETE expected: ${JSON.stringify(recs)}`);
    assert.equal(recs[0].uid, 'game:fifa 24');
    assert.ok(recs[0].found, 'stub had the game before the delete');

    await page.waitForFunction(() =>
      !Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('FIFA 24')), null, { timeout: 8000 });
  });

  it('restore: game entries toast the game wording and the game returns to the grid', async () => {
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    const clicked = await page.evaluate(() => {
      const row = document.querySelector('.admin-trash-item[data-id="9001"]');
      if (!row) return 'row-not-found';
      const btn = row.querySelector('[data-action="restore"]');
      if (!btn) return 'btn-not-found';
      btn.click();
      return 'ok';
    });
    assert.equal(clicked, 'ok', `trash row for the game entry must render (got: ${clicked})`);

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.toast'))
        .some(t => (t.textContent || '').includes('بازی به کتابخانه بازگردانده شد')),
      null, { timeout: 8000 });
    const texts = await toastTexts();
    assert.ok(texts.some(t => t.includes('بازی به کتابخانه بازگردانده شد')),
      `game wording expected, got: ${JSON.stringify(texts)}`);

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('movie-card'))
        .some(c => (c.textContent || '').includes('Celeste')), null, { timeout: 8000 });
  });
});
