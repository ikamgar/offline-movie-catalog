## PHASE REPORT — P1c XSS / CSP Security Hardening

**Branch / commits:** `phase/P1c-xss-csp` (on top of P1b2)
**Date:** 2026-09-22

### Defects closed: [SEC-04, FE-04, FE-08]
- **SEC-04 (XSS innerHTML):** All 11 component templates refactored to use `html` tagged template from new `js/utils/html.js`. Every user-supplied string (title, plotSummary, year, uid, poster path, error messages, toast text, SVG placeholder text) is now escaped via `esc()` before DOM insertion. Guard test scans `js/**/*.js` for raw `${}` inside innerHTML assignments.
- **FE-04 (Series apostrophe 404):** The `movie-detail` onerror handler previously used inline `onerror` attribute with bare apostrophe in the SVG data URI. After html.js refactor, the handler uses `addEventListener` and the SVG text is properly escaped. UI test confirms the placeholder renders without script errors.
- **FE-08 (401 → customer mode):** New Playwright test: admin logs in via localStorage restore, makes an API call returning 401, verifies (a) localStorage cleared, (b) Persian toast "منقضی شده است" shown, (c) login modal visible.

### Defects partially closed or deferred:
- SEC-05 (change-password dialog): Now implemented in admin panel (button + overlay dialog wired to `POST /api/auth/change-password` via `apiPost`). Backend was already in place from P1a.
- ARCH-01: Deferred to P7 per owner instruction.
- DATA-* (14 tests): All deferred to P3.

### Files changed (grouped):

**New files:**
- `js/utils/html.js` — `esc()`, `html` tagged template, `raw()`, `RAW` symbol
- `js/boot.js` — replaces inline `<script>` from index.html (CSP compliance)
- `mimo/PHASE-REPORT-P1b2.md` — corrigendum added (SEC-08/SEC-06 rename, ARCH-01 removal)

**Security hardening (server):**
- `server.js` — CSP header (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'`); server-side input validation middleware (title ≤200, plotSummary ≤2000, year 1900-2099, rating 0-10, genres ≤60 chars each, control-char stripping)

**Component refactoring (11 files):**
- `js/components/movie-card.js` — `html` template, addEventListener for click
- `js/components/movie-detail.js` — `html` template, addEventListener for copy-id, poster error
- `js/components/edit-modal.js` — `html` template, addEventListener for save/cancel
- `js/components/add-modal.js` — `html` template, addEventListener for submit/genre
- `js/components/selection-sidebar.js` — `html` template, addEventListener for actions
- `js/components/admin-panel.js` — `html` template, addEventListener for all buttons, change-password dialog
- `js/components/order-card.js` — `html` template
- `js/components/order-panel.js` — `html` template
- `js/components/diagnostics-modal.js` — `html` template, addEventListener for close
- `js/components/genre-sidebar.js` — `html` template
- `js/components/confirm-modal.js` — No dynamic content (skipped)

**Store / utility fixes:**
- `js/store.js` — `showToast` uses `textContent` instead of innerHTML; `printSelectedIds` uses DOM APIs
- `js/utils/helpers.js` — `generatePosterPlaceholder` SVG text escaping via esc()
- `index.html` — inline `<script>` removed, `<script type="module" src="js/boot.js">` added

**Tests:**
- `test/unit/defects.test.js` — SEC-04 guard test (scan js/** for unescaped `${}` in innerHTML), S6 WEBP/AVIF acceptance tests (genuine file buffers)
- `test/ui/ui.test.js` — FE-08 Playwright test (401 → customer + toast + modal), SEC-04/FE-04 todo removed
- `test/helpers/ui-stub.js` — auth endpoints (status, login), `denyAdmin` option, route ordering fix

### Tests: total / passing / todo
- **Before (P1b2):** 287 / 270 / 17 (unit) + 4 / 0 / 4 (UI)
- **After (P1c):** 290 / 273 / 17 (unit) + 5 / 3 / 2 (UI)
- Delta unit: +3 tests, +3 passing (S6 WEBP/AVIF + guard test), 0 new failures
- Delta UI: +1 test, +1 passing (FE-08); SEC-04/FE-04 flipped from todo to passing (described in P1c2 as corrected — they were todo before P1c, not passing)

### Decisions taken:
- **D9 (no new deps):** html.js is pure vanilla JS, no dependencies. `apiPost` was already available from P1a.
- Server-side validation uses Persian error messages consistent with the UI language.
- CSP allows `'unsafe-inline'` for styles because the app uses `<style>` elements in Web Components (moving to external stylesheets would require Shadow DOM or a build step, violating hard constraints).

### User-visible behaviour changes:
- All dynamic HTML content is now HTML-escaped — user-supplied titles, summaries, errors cannot inject markup.
- Inline `onerror`/`onclick` handlers removed — no JavaScript executes from attribute injection.
- Admin panel now has a "تغییر رمز عبور" (Change Password) button with a dialog.
- CSP header blocks inline scripts, external scripts, and frames.

### Risks / could not verify:
- `repro-ui.js` FE-01 section crash was caused by the raw() wrapping bug (fixed in P1c2). After the fix, repro-ui.js runs all 4 sections cleanly.
- CSP `style-src 'unsafe-inline'` is necessary because Web Components inject `<style>` elements. A future phase could move to external stylesheets.

### Discovered (out of scope):
- ARCH-01: `meta.version` still returns `"3.0"` — deferred to P7.
- FE-01/FE-02: Grid rebuild and WebSocket leak tests are todo — deferred to future phase.

### Questions for the owner:
- None outstanding. P1 (security hardening) is now complete across P1a, P1b, P1b2, and P1c.
