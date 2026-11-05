## PHASE REPORT — P3g Order-view CSS regression

**Branch / commits:** `phase/P3g-order-view-css` (from P3f HEAD `ab5bd94`)

| Commit | Summary |
|---|---|
| *(fix)* | `fix(ui): restore order-detail CSS deleted by SEC-04 refactor [P3G]` |
| *(report)* | `docs(P3g): phase report — order-view poster sizing, P1c regression` |

**Date:** 2026-09-23 · **Scope:** owner-reported oversized posters in the order «مشاهده» view; fix sizing to a thumbnail; identify introducing phase; check class reuse.

### Owner reports closed

| # | Report | Status | Evidence |
|---|---|---|---|
| 1 | Order view («مشاهده») posters render far too large and break the screen | **Closed** | `P3G` test failed before fix with measured values (below); passes after. Screenshots + metrics in `mimo/shots/p3g/`. |
| 2 | Constrain poster to a reasonable thumbnail (similar to browsing grid) | **Closed** | After: **40×60 px** (same as baseline `.order-detail-movie-poster`); `object-fit: cover`. Grid thumbs are aspect-box ~150% height; order rows are list rows, so fixed 40×60 matches the design that existed at baseline. |
| 3 | State plainly which phase introduced it (new vs P1c regression) | **Closed** | **Regression from P1c**, commit `4777e40` (`fix(frontend): escape templates and wrap raw() html fragments in 10 components [SEC-04]`). See *Root cause* below. |
| 4 | Check if the class is reused elsewhere in `css/` + `js/components/` | **Closed** | See *Class reuse* — only `order-card.js` (markup) and `admin-panel.js` (restored CSS). No other component affected. |

### Root cause (P1c regression)

- At baseline `7bbf743`, `js/components/admin-panel.js` `_applyStyles()` contained a full **Order Detail Overlay** block (~138 lines): `.order-detail-overlay`, `.order-detail`, header/title/close, meta/stats, `.order-detail-movies`, `.order-detail-movie`, and **`.order-detail-movie-poster { width: 40px; height: 60px; object-fit: cover; … }`**.
- P1c commit **`4777e40`** rewrote large parts of that style template while wrapping raw HTML fragments and **deleted the entire Order Detail block** (and a Confirmation Modal block that was later superseded by `confirm-modal.js`).
- `order-card.js` markup (`class="order-detail-movie-poster"` etc.) was untouched — CSS went missing while the DOM kept using the classes.
- With no rules: global `img { max-width: 100% }` only caps width to the container (admin sidebar ~319 px), no height cap → **319×479 px** posters stacked in the sidebar; overlay `position: static` (not a modal); `.order-detail` had no `max-width: 600px`.

**Introduced by: P1c (`4777e40`).** Not a new P3-era bug; not an intentional change.

### Reproduction & measurements (Playwright)

Order injected with 3× full-size (600×900) posters (stub `/api/poster` SVG is only 20×30 and would hide the bug). Desktop 1400×900 and mobile 390×844.

| Metric | BEFORE (pre-fix) | AFTER (post-fix) |
|---|---|---|
| Desktop poster box | **319×479** ×3 (x=1080, y=190/714/1237) | **40×60** ×3 |
| Mobile poster box | **319×479** ×3 | **40×60** ×3 |
| Overlay `position` | `static` | `fixed` |
| `.order-detail` max-width | `none` | `600px` |
| Detail modal box | 319×1697 (sidebar column) | 600×427 (centered modal) |
| `cssApplied` | `false` | `true` |

**Screenshots** (hashes differ; ~49k sampled pixel diffs on desktop):

| File | Viewport |
|---|---|
| `mimo/shots/p3g/order-view-desktop-before.png` | 1400×900 |
| `mimo/shots/p3g/order-view-mobile-before.png` | 390×844 |
| `mimo/shots/p3g/order-view-desktop.png` | 1400×900 |
| `mimo/shots/p3g/order-view-mobile.png` | 390×844 |
| `mimo/shots/p3g/metrics-before.txt` / `metrics-after.txt` | raw measurements |

### Class reuse (owner task)

| Location | `order-detail*` usage |
|---|---|
| `css/*.css` | **none** (styles live in `admin-panel.js` per FE-10) |
| `js/components/order-card.js` | 23 matches — sole markup consumer (overlay, movie row, poster, meta…) |
| `js/components/admin-panel.js` | 20 matches — restored CSS rules only |
| Other `js/components/*` | **none** |

No other component needed a fix.

### Fix

Restored the baseline Order Detail CSS block into `admin-panel.js` `_applyStyles()` (between `.order-card-actions .btn-danger:hover` and `.change-password-overlay`), including `@keyframes modalIn` (also present in `css/components.css:366` — identical definition, harmless duplicate, matches baseline). Poster rule: `width: 40px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); background: var(--color-poster-bg);`.

### Verification (raw summary lines)

```
npm test
ℹ tests 417
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23937.488

npm run test:ui
ℹ tests 12
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 22441.5099
```
*(P3G suite: `✔ P3G: order-detail poster renders ≤ thumbnail size and view stays on screen` — was failing before fix.)*

```
node mimo/repro/repro-backend.js
0 present, 13 fixed, 0 error
exit=0

node mimo/repro/repro-ui.js
2 present, 2 fixed, 0 error
exit=1
```
*(repro-ui exit 1 = FE-01/FE-02 still PRESENT, expected; FE-04/SEC-04 FIXED.)*

### Tests: before → after

| Suite | Before | After |
|---|---|---|
| Unit | 417 / 415 / 0 fail / 2 todo | **417 / 415 / 0 fail / 2 todo** (unchanged) |
| UI | 11 / 9 / 0 fail / 2 todo | **12 / 10 / 0 fail / 2 todo** (+1 P3G pass) |

### Files changed

- `js/components/admin-panel.js` — restore Order Detail CSS block (+138)
- `test/ui/ui.test.js` — new `P3G` Playwright size/screenshot test (+115)
- `mimo/repro/p3g-capture-after.js` — one-shot AFTER metrics/screenshot helper
- `mimo/shots/p3g/*` — before/after screenshots + metrics
- `mimo/PHASE-REPORT-P3g.md` — this report

### Decisions / assumptions

- No new D# needed; restored baseline CSS rather than redesigning (scope: fix reported bug).
- Thumbnail size **40×60** = baseline design, not the grid’s aspect-box (~150% height) — order view is a compact list, not a card grid.
- `@keyframes modalIn` left in the restored block for fidelity to `7bbf743` even though `components.css` already defines it.

### User-visible behaviour changes

- Order «مشاهده» opens as a centered modal (max 600px, overlay dimmed) again.
- Posters in the order list are 40×60 thumbnails instead of filling the sidebar.
- Mobile width: same modal + 40×60 thumbs.

### Risks / could not verify

- Real full-resolution Library posters not captured in screenshots (data-URI stand-in); size assertion is on computed layout, not source pixels.
- `mimo/shots/p3g/order-view-*.png` are headless Chromium captures; theme/accent may differ slightly from owner’s browser.

### Discovered (out of scope)

- P1c also deleted a Confirmation Modal style block from `admin-panel.js`; `confirm-modal.js` supplies its own styles today — no gap observed.
- FE-10 still tracks ~500 lines of component CSS injected from JS (where this block lives).

### Questions for the owner

- None.
