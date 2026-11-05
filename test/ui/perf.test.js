'use strict';
/**
 * P4-C5 — 20k catalog performance budgets (Playwright against stub API).
 *
 * Budgets (P4 prompt):
 *   - first grid paint ≤ 300 ms after data arrives
 *   - select-click → next frame ≤ 50 ms
 *   - scrolling 10 screens produces no long task > 100 ms
 *   - search keystroke → visible results ≤ 50 ms
 *
 * Windowing is NOT required if content-visibility + keyed updates meet budget.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const fs = require('fs');
const skipIfNoBrowser = () => {
  try {
    if (!chromium) return 'Playwright not installed';
    const p = chromium.executablePath();
    return p && fs.existsSync(p) ? false : 'Playwright Chromium browser not installed';
  } catch {
    return 'Playwright browser unavailable';
  }
};

// Deterministic 20k catalog (same shape as scripts/make-fixture-library.js output)
function makeCatalog(n) {
  const genres = ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi'];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const id = String(i + 1).padStart(5, '0');
    out[i] = {
      uid: id,
      id,
      title: `Fixture Movie ${i + 1}`,
      year: 1970 + (i % 56),
      genres: [genres[i % genres.length]],
      type: i % 10 === 0 ? 'Animation' : 'Movie',
      poster: '/api/poster/' + id,
      imdbRating: null,
      plotSummary: null
    };
  }
  return out;
}

describe('P4-C5 — 20k performance budgets', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;
  const twentyK = makeCatalog(20000);

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(twentyK);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript(() => {
      window.__longTasks = [];
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__longTasks.push(e.duration);
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch { /* longtask may be unavailable */ }
    });
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('P4-C5: first grid paint ≤ 300ms; select ≤ 50ms; scroll no long task >100ms; search ≤ 50ms', async () => {
    // ── First paint after data arrives ──
    const paintStart = Date.now();
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40, null, { timeout: 15000 });
    const firstPaintMs = Date.now() - paintStart;
    // subtract navigation overhead allowance: measure data→cards more tightly on reload
    const paint2 = await page.evaluate(async () => {
      const t0 = performance.now();
      const { store } = await import('/js/store.js');
      store._set({ isLoading: true });
      await store.loadCatalog();
      // wait for a frame after filteredMovies notify (microtask + render)
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    });

    // ── Select click → next frame ──
    const selectMs = await page.evaluate(async () => {
      const btn = document.querySelector('movie-card [data-action="select"]');
      const t0 = performance.now();
      btn.click();
      await new Promise(r => requestAnimationFrame(r));
      return performance.now() - t0;
    });

    // ── Scroll 10 screens ──
    await page.evaluate(() => { window.__longTasks = []; });
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => (document.querySelector('#scrollSentinel') || document.body).scrollIntoView());
      await page.waitForTimeout(80);
    }
    const longTasks = await page.evaluate(() => window.__longTasks.slice());

    // ── Search keystroke → visible results ──
    const searchMs = await page.evaluate(async () => {
      const input = document.querySelector('#searchInput') ||
        document.querySelector('header input') ||
        document.querySelector('.search-input');
      if (!input) return -1;
      const t0 = performance.now();
      input.value = 'Fixture Movie 1999';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // wait until filter applies (debounce 120ms + filter)
      await new Promise(r => setTimeout(r, 250));
      await new Promise(r => requestAnimationFrame(r));
      return performance.now() - t0;
    });

    const summary = JSON.stringify({
      firstPaintFullMs: firstPaintMs,
      loadCatalogToPaintMs: Math.round(paint2),
      selectMs: Math.round(selectMs),
      longTasks,
      searchMs: Math.round(searchMs),
      cards: await page.evaluate(() => document.querySelectorAll('movie-card').length)
    });
    console.log('P4-C5 metrics:', summary);

    assert.ok(paint2 <= 300,
      `first grid paint after data must be ≤ 300ms, got ${Math.round(paint2)}ms: ${summary}`);
    assert.ok(selectMs <= 50,
      `select-click → next frame must be ≤ 50ms, got ${Math.round(selectMs)}ms: ${summary}`);
    const worst = longTasks.length ? Math.max(...longTasks) : 0;
    assert.ok(worst <= 100,
      `scroll 10 screens: no long task > 100ms, worst=${worst}ms tasks=${JSON.stringify(longTasks)}: ${summary}`);
    // search includes 120ms debounce by design — budget is keystroke→results ≤ 50ms AFTER debounce;
    // measure total with debounce allowance of 120 + 50 = 170, plus frame slack
    assert.ok(searchMs <= 400,
      `search keystroke → results must be prompt (debounce 120 + 50 + slack), got ${Math.round(searchMs)}ms: ${summary}`);

    // ── P5a/D2: actual post-debounce processing on 20k (no debounce, no fixed sleep) ──
    const proc = await page.evaluate(async () => {
      const { store } = await import('/js/store.js');
      const t0 = performance.now();
      store.setSearch('Fixture Movie 1999'); // sync filter + rank + _set
      const filterMs = performance.now() - t0;
      const matched = store.state.filteredMovies.length;
      await new Promise(r => requestAnimationFrame(r)); // grid committed
      const toFrameMs = performance.now() - t0;
      store.setSearch('');
      await new Promise(r => requestAnimationFrame(r));
      return {
        filterMs: Math.round(filterMs * 100) / 100,
        toFrameMs: Math.round(toFrameMs * 100) / 100,
        matched
      };
    });
    console.log('P5a search processing:', JSON.stringify(proc));
    assert.ok(proc.matched > 0 && proc.matched < 20000,
      `search must actually filter (matched=${proc.matched} of 20000)`);
    assert.ok(proc.filterMs <= 50,
      `post-debounce filter must be ≤ 50ms on 20k, got ${proc.filterMs}ms`);
    assert.ok(proc.toFrameMs <= 50,
      `filter → grid frame must be ≤ 50ms on 20k, got ${proc.toFrameMs}ms`);
  });
});
