'use strict';
/** One-shot P3G after-metrics capture (screenshots + measurements). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { startUIStub } = require('../../test/helpers/ui-stub');

const SHOTS = path.join(__dirname, '..', 'shots', 'p3g');

function catalog(n) {
  return Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(4, '0');
    return { uid: id, id, title: 'Movie ' + (i + 1), year: 2000 + i, genres: ['Action'], type: 'Movie', poster: '/api/poster/' + id };
  });
}

const BIG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">' +
  '<rect width="600" height="900" fill="#c23a3a"/>' +
  '<text x="300" y="460" font-size="48" fill="#fff" text-anchor="middle">FULL</text></svg>'
);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const stub = await startUIStub(catalog(5));
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://localhost:${stub.port}/`);
  await page.waitForFunction(() => document.querySelectorAll('movie-card').length >= 1);
  await page.click('#loginBtn');
  await page.waitForSelector('login-modal.open #username', { state: 'visible', timeout: 5000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'password123');
  await page.click('#submitBtn');
  await page.waitForSelector('#adminPanel:not(.hidden)', { timeout: 5000 });
  await page.waitForTimeout(400);

  await page.evaluate(async (big) => {
    const { store } = await import('/js/store.js');
    const order = {
      id: 'order-0001', number: 1, createdAt: new Date().toISOString(), createdBy: 'admin',
      movies: [
        { uid: '0001', id: '0001', title: 'Alpha', year: 2020, type: 'Movie', poster: big },
        { uid: '0002', id: '0002', title: 'Beta', year: 2021, type: 'Movie', poster: big },
        { uid: '0003', id: '0003', title: 'Gamma', year: 2022, type: 'Movie', poster: big }
      ]
    };
    store._set({ orders: [order] });
    store.viewOrder(order);
  }, BIG);

  await page.waitForSelector('.order-detail-overlay.active .order-detail-movie-poster', { timeout: 5000 });
  await page.waitForTimeout(500);

  const desktop = await page.evaluate(() => {
    const posters = Array.from(document.querySelectorAll('.order-detail-movie-poster')).map(img => {
      const r = img.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    const overlay = document.querySelector('.order-detail-overlay');
    const detail = document.querySelector('.order-detail');
    const dr = detail.getBoundingClientRect();
    return {
      posters,
      overlayPos: overlay ? getComputedStyle(overlay).position : null,
      detailMaxWidth: detail ? getComputedStyle(detail).maxWidth : null,
      cssApplied: overlay ? getComputedStyle(overlay).position === 'fixed' : false,
      detailBox: { w: Math.round(dr.width), h: Math.round(dr.height) }
    };
  });

  await page.screenshot({ path: path.join(SHOTS, 'order-view-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'order-view-mobile.png') });
  const mobile = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.order-detail-movie-poster')).map(img => {
      const r = img.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })
  );

  const report =
    'P3G AFTER metrics (post-fix, 2026-09-23)\n' +
    `desktop posters: ${JSON.stringify(desktop.posters)}\n` +
    `mobile posters: ${JSON.stringify(mobile)}\n` +
    `overlayPos: ${desktop.overlayPos} (expected fixed)\n` +
    `detailMaxWidth: ${desktop.detailMaxWidth}\n` +
    `cssApplied: ${desktop.cssApplied}\n` +
    `detailBox: ${JSON.stringify(desktop.detailBox)}\n` +
    'screenshots: mimo/shots/p3g/order-view-desktop.png, order-view-mobile.png\n';
  fs.writeFileSync(path.join(SHOTS, 'metrics-after.txt'), report);
  console.log(report);

  await page.close();
  await stub.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
