'use strict';
/**
 * P8b (FE-12 / G4 / G5) — grid loads w=300/600 thumbnails via srcset;
 * Vazirmatn is bundled and active; no external font/script request is made.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let chromium;
try { chromium = require('playwright').chromium; } catch {}
const { startUIStub } = require('../helpers/ui-stub');
const skipIfNoBrowser = () => chromium ? false : 'Playwright browsers not installed';

function makeCatalog(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const id = String(i + 1).padStart(5, '0');
    out[i] = {
      uid: id, id,
      title: `Fixture Movie ${i + 1}`,
      year: 1970 + (i % 56),
      genres: ['Action'],
      type: 'Movie',
      poster: '/api/poster/' + id + '?v=1000',
      imdbRating: null, plotSummary: null
    };
  }
  return out;
}

describe('P8b assets — grid thumbnails + bundled font', { skip: skipIfNoBrowser() }, () => {
  let browser, stub, page;
  const externalRequests = [];

  before(async () => {
    browser = await chromium.launch();
    stub = await startUIStub(makeCatalog(40));
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    // Fail the test if any request leaves the stub origin (offline invariant).
    page.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(`http://localhost:${stub.port}`) && !u.startsWith('data:')) {
        externalRequests.push(u);
      }
    });
    await page.goto(`http://localhost:${stub.port}/`);
    await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 40, null, { timeout: 15000 });
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (stub) await stub.close();
    if (browser) await browser.close();
  });

  it('movie-card img carries data-src w=300 and data-srcset "300 1x, 600 2x" (rides ?v)', async () => {
    const samples = await page.evaluate(() => {
      return [...document.querySelectorAll('movie-card')].map((card) => {
        const img = card.querySelector('img');
        return img ? {
          uid: card.getAttribute('uid') || String(card.uid || ''),
          src: img.getAttribute('data-src') || img.getAttribute('src'),
          srcset: img.getAttribute('data-srcset') || img.getAttribute('srcset')
        } : null;
      }).filter(Boolean).slice(0, 6);
    });
    assert.ok(samples.length >= 1, 'at least one rendered card with an img');
    for (const s of samples) {
      assert.match(s.src || '', /\?v=1000&w=300$/, `uid=${s.uid} data-src=${s.src}`);
      assert.match(s.srcset || '', /\?v=1000&w=300 1x, .*[?&]v=1000&w=600 2x$/, `uid=${s.uid} srcset=${s.srcset}`);
    }
  });

  it('lazy-loader promotes srcset before src (loaded cards get real src + srcset)', async () => {
    // wait for the IntersectionObserver to promote at least one in-viewport card
    await page.waitForFunction(
      () => [...document.querySelectorAll('movie-card img')].some((i) => i.hasAttribute('src')),
      null, { timeout: 5000 }
    );
    const promoted = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('movie-card img')];
      const loaded = imgs.filter((i) => i.hasAttribute('src') && i.src);
      return loaded.slice(0, 3).map((i) => ({ src: i.getAttribute('src'), srcset: i.getAttribute('srcset') }));
    });
    assert.ok(promoted.length >= 1, 'at least one card should have been lazy-loaded');
    for (const p of promoted) {
      assert.match(p.src || '', /w=300$/, `src=${p.src}`);
      assert.match(p.srcset || '', /w=300 1x, .*w=600 2x$/, `srcset=${p.srcset}`);
    }
  });

  it('Vazirmatn webfont is bundled and active (document.fonts.check)', async () => {
    const ok = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        vazir: document.fonts.check('16px Vazirmatn'),
        vazirBold: document.fonts.check('bold 16px Vazirmatn'),
        loadedFaces: [...document.fonts].filter((f) => f.family === 'Vazirmatn').map((f) => f.status)
      };
    });
    assert.equal(ok.vazir, true, 'Vazirmatn must be loaded and checkable');
    assert.equal(ok.vazirBold, true, 'Vazirmatn bold weights must be checkable (variable font)');
    assert.ok(ok.loadedFaces.length >= 1, 'at least one Vazirmatn face must be registered');
  });

  it('computed body font-family lists Vazirmatn first', async () => {
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(family, /Vazirmatn/, `body font-family=${family}`);
  });

  it('no request left the stub origin (offline / no-CDN invariant)', () => {
    assert.deepEqual(externalRequests, [], `external requests: ${externalRequests.join(', ')}`);
  });
});
