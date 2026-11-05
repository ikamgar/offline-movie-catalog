## PHASE REPORT — P1c2 Contradiction Fixes + raw() Bug

**Branch / commits:** `phase/P1c-xss-csp` (uncommitted on top of P1c work)
**Date:** 2026-09-22
**Parent:** P1c XSS / CSP Security Hardening

### Defects closed: [raw()-BUG]
- **raw() wrapping bug (critical):** The `html` tagged template auto-escapes ALL `${}` interpolations. ~25 sites across 8 components interpolated HTML-containing variables (built from prior `html` calls or `.join('')`) WITHOUT `raw()` wrappers. Result: all rendered HTML (select buttons, edit buttons, IMDb badges, info sections, genre tags, platform badges) appeared as escaped text entities (`&lt;`, `&amp;`) in the DOM instead of rendering as actual HTML. Fixed by wrapping every `.innerHTML =` result from `_render*()` methods with `raw()`.

### Files changed:

**raw() fixes (8 components):**
- `js/components/movie-card.js` — wrapped `imdbBadge`, `actionButton`, `infoSection`, game platform `.join('')`, genre tags `.join('')`
- `js/components/movie-detail.js` — wrapped `typeLabel`, `imdbRatingHtml`, `genresHtml`, `plotHtml`, `actionButtons`, genre `.join('')`
- `js/components/selection-sidebar.js` — wrapped `_renderList()`, platform `.join(' ')`
- `js/components/genre-sidebar.js` — added `raw` import; wrapped `_renderGameCategories()`, `_renderAllCategories()`, `closeBtn`, `.join('')`
- `js/components/admin-panel.js` — wrapped `_renderList(adminSelection)`
- `js/components/order-panel.js` — added `raw` import; wrapped `_renderOrderList(orders)`
- `js/components/diagnostics-modal.js` — wrapped `_renderTypeBreakdown()`, all 6 `_renderIssueSection()` calls
- `js/components/add-modal.js` — added `raw` import; wrapped `_renderGenreOptions()`

**New tests:**
- `test/ui/ui.test.js` — SEC-04b (double-escaping: `Ocean's "Eleven" & Twelve <Remastered>` via textContent), CSP-SAN (zero CSP violations during full app walkthrough)

### Contradictions corrected in P1c report:

1. **UI test baseline was wrong.** P1c report line 50 claimed "Before (P1b2): 4/2/2 (UI)". Git history shows at P0e (commit `c9753b7`, last committed state before P1c), ALL 4 UI tests had `{ todo }` markers on their describe blocks — SEC-04 and FE-04 were NOT passing before P1c. The true P1b2 baseline was **4/0/4** (4 tests, 0 passing, 4 todo). The P1c work flipped SEC-04/FE-04 from todo to passing — this was done during P1c, not before.

2. **repro-ui.js FE-01 section crash.** P1c report line 67 claimed "repro-ui.js FE-01 section crashes before reaching SEC-04/FE-04 — pre-existing issue". This was caused by the same raw() wrapping bug: movie cards had no select buttons, so the FE-01 test (which clicks a select button) failed. After fixing raw() wrapping, repro-ui.js runs all 4 sections cleanly: 2 PRESENT (FE-01, FE-02), 2 FIXED (SEC-04, FE-04), 0 error.

### Tests: total / passing / todo
- **Before P1c2 (P1c ending):** 290 / 273 / 17 (unit) + 5 / 3 / 2 (UI)
- **After P1c2 (re-run now):** 290 / 273 / 17 (unit) + 7 / 5 / 2 (UI)
- Delta unit: 0 / 0 / 0 — "292 / 275" in the previous draft was a mistyped row; `npm test` reports 290 / 273 / 17, no extra unit tests exist.
- Delta UI: +2 tests, +2 passing (SEC-04b, CSP-SAN), todo unchanged at 2.

### Confirm-modal.js investigation:
All 3 call sites checked. No refactoring needed:
- `app.js:158` — static Persian string `'آیا از خروج از حالت مدیر مطمئن هستید؟'`
- `admin-panel.js:614` — static string + `adminSelection.length` (numeric, safe)
- `admin-panel.js:636` — static Persian string
- `order-panel.js:159` — template with `orderNumber` (server-generated sequential integer, safe)

### CSP-SAN Playwright test — steps performed (verbatim source)

```js
it('CSP-SAN: browse, select, detail, search — zero CSP violations', async () => {
  await page.evaluate(() => document.querySelectorAll('movie-card')[0].click());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = document.querySelector('movie-detail [data-action="select"]') || document.querySelector('movie-detail .btn-select');
    if (btn) btn.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const close = document.querySelector('movie-detail .close-btn') || document.querySelector('movie-detail [data-action="close"]');
    if (close) close.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('movie-card')[1].click());
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const input = document.querySelector('#searchInput') || document.querySelector('input[type="search"]') || document.querySelector('header input');
    if (input) { input.value = 'Movie 5'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(300);

  const violations = await page.evaluate(() => window.__cspViolations || []);
  assert.ok(violations.length === 0,
    `CSP violations: ${JSON.stringify(violations)}`);
});
```

Plus `before`: launch chromium → `startUIStub(many)` → new page → `securitypolicyviolation` listener → `page.goto` → wait for ≥40 `movie-card` → 500 ms settle.

**Does NOT include:** admin login (no `mc_adminSession` write / no `login-modal` interaction), diagnostics modal, add-modal, or edit-modal. Current coverage is customer-side only: open detail → select → close → second detail → search.

### Verification output:

**npm test:**
```
ℹ tests 290
ℹ suites 95
ℹ pass 273
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 17
ℹ duration_ms 12154.23
```

**npm run test:ui:**
```
ℹ tests 7
ℹ suites 5
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 12853.2761

▶ SEC-04 + FE-04 — XSS + onerror placeholder
  ✔ SEC-04: markup in title / plotSummary must be rendered as text, never executed (717.2217ms)
  ✔ FE-04: a Series with apostrophe in title must get the placeholder when poster 404s (2.2062ms)
▶ SEC-04b — double-escaping: special chars rendered as text, not HTML entities
  ✔ SEC-04b: title with quotes, ampersand, angle brackets must display as literal text (718.2259ms)
▶ CSP-SAN — zero CSP violations during full app walkthrough
  ✔ CSP-SAN: browse, select, detail, search — zero CSP violations (1966.1994ms)
▶ FE-08 — 401 drops admin to customer with toast and login modal
  ✔ FE-08: admin session + 401 → customer mode, Persian toast, login modal visible (1593.5176ms)
▶ FE-01 + FE-02 — grid rebuild + socket/worker leak
  ⚠ FE-01 ... # TODO
  ⚠ FE-02 ... # TODO
```

### Edit-modal.js / order-card.js — no raw() bug (evidence)

`git grep -n "innerHTML"` in both files returns only one line each, and both assignments wrap a static `html` literal (no nested/joined HTML sub-strings):

```
edit-modal.js:56:    this.innerHTML = html`...static dialog markup...`;
order-card.js:31:    this.innerHTML = html`...static card markup...`;
```

`git grep -n "raw\|join\|_render"` on both files returns no matches — neither file builds `.join('')` HTML fragments nor needs `raw()`. (Both were listed as "NEEDS INVESTIGATION" in the prior handoff; they are clean.)

**repro-backend.js:**
```
12 present, 1 fixed, 0 error
```

**repro-ui.js:**
```
PRESENT  FE-01  selecting one card must not rebuild the grid or lose scroll position
PRESENT  FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
2 present, 2 fixed, 0 error
```
