## PHASE REPORT — P3h P1c CSS-deletion sweep

**Branch / commits:** `phase/P3h-p1c-css-audit` (from P3g `55ef7a0`)

| Commit | Summary |
|---|---|
| `cf5451c` | `fix(ui): restore confirm-dialog animation + pre-line message lost by SEC-04 [P3H]` |
| *(report)* | `docs(P3h): phase report — 10-file CSS sweep, confirm-dialog properties restored` |

**Date:** 2026-09-23 · **Scope:** (1) confirm/locate P3f report · (2) systematic CSS-deletion sweep of the 10 files touched by P1c `4777e40` · (3) fix any genuinely missing rules with failing test first + before/after evidence · (4) 4 exact verification commands.

---

### Task 1 — P3f phase report

**Finding: not missing.** `mimo/PHASE-REPORT-P3f.md` already exists (158 lines), committed at `ab5bd94` (`docs(P3f): phase report — nested-raw sweep, Iranian claim corrected`). Checklist vs request:

| Requested element | Present? |
|---|---|
| Which files had the bug | ✅ § “How widespread” table — 6 component files ≈16 nested-`html\`\`` sites + 1 missing-`esc` site in `movie-grid.js` |
| Exactly how many separate instances | ✅ ≈16 nested-`raw` sites + 1 `esc` site; per-file site counts listed |
| Why Iranian/Series “unaffected” vs Animation/Movie | ✅ § “Iranian / Series vs Animation/Movie — empirical confirmation” — **corrects the premise**: Iranian WAS broken (`literalIdBadge=true`); only Series was clean because `m.id === null` → no badge slot. Shared `infoSection` path for Movie/Animation/Iranian. |
| Raw verification output from that session | ✅ § “Verification (raw output)” — unit 417/415/0/2, ui 11/9/0/2, repro-backend `0 present, 13 fixed`, repro-ui `2 present, 2 fixed` |

No rewrite performed (rule: no drive-by rewrites of committed reports).

---

### Task 2 — CSS-deletion sweep (10 files, baseline `7bbf743` → HEAD)

**Method:** `mimo/repro/p3h-css-sweep.js` extracts every CSS selector from each file’s baseline `style.textContent` block and classifies: kept / moved / intentionally superseded / MISSING. Raw: `mimo/shots/p3h/sweep-raw.json`, `sweep-summary.txt`; human table: `mimo/shots/p3h/dispositions.md`.

**Headline:** only **1 of 10** files had embedded CSS at baseline — `admin-panel.js`. The other 9 had `style.textContent` absent (their classes live in `css/*.css`, and `git log baseline-5.4.0..HEAD -- css/` is **empty** — no P1c commit touched `css/`).

#### `admin-panel.js` (92 baseline selectors)

| Group | Count | Disposition |
|---|---|---|
| Order Detail block | ~38 | **kept** — deleted by `4777e40`, **already restored by P3g `2892345`** (P3G test green) |
| `.admin-panel-actions .btn-primary:hover:not(:disabled)` + `.btn-danger:hover:not(:disabled)` | 2 | **intentionally superseded** — baseline `css/main.css` already had byte-identical generic `.btn-primary:hover` / `.btn-danger:hover`; disabled state still forced by surviving `.btn:disabled` + `!important` |
| `confirm-modal.*` structural rules | 10 | **moved** → `confirm-modal.js` `_applyStyles()` (component already owned equivalents) |
| `confirm-modal .btn-danger` / `:hover` | 2 | **intentionally superseded** — confirm button is `btn-primary` (`confirm-modal.js:34`); rule was dead even at baseline |

#### Genuine MISSING found (property level, inside the moved confirm-modal rules)

Baseline **duplicated** confirm-dialog styles in both `admin-panel.js` and `confirm-modal.js`. `4777e40` deleted the admin-panel copy; two properties existed **only** there and were never migrated:

1. `confirm-modal .modal-dialog { animation: modalIn 0.3s ease; }` — dialog no longer animates open
2. `confirm-modal .confirm-message { white-space: pre-line; }` — admin confirm messages contain `\n\n` (e.g. order save/clear) and collapsed to a single line

**Fixed** by restoring both into `confirm-modal.js` `_applyStyles()` (correct owner per FE-10).

#### Other 9 files

`movie-card`, `movie-detail`, `edit-modal`, `add-modal`, `selection-sidebar`, `order-card`, `order-panel`, `diagnostics-modal`, `genre-sidebar`: **0 embedded CSS at baseline → 0 CSS deleted by P1c.** (Extractor false-positives on three files were HTML fragments with inline `style=` attributes — noted in dispositions.md.)

---

### Task 3 — Test-first fix (P3H)

TDD: wrote failing Playwright test → measured `animationName:"none"`, `whiteSpace:"normal"` → applied 2-line fix → green.

**BEFORE** (`mimo/shots/p3h/metrics-before.txt`, screenshot `confirm-modal-open-before.png`):
```
animationName: none
animationDuration: 0s
animation: none 0s ease
whiteSpace: normal
dialogBox: {"w":400,"h":195}
dialogVisible: true
```

**AFTER** (`metrics-after.txt`, `confirm-modal-open-after.png`):
```
animationName: modalIn
animationDuration: 0.3s
animation: modalIn 0.3s ease
whiteSpace: pre-line
dialogBox: {"w":400,"h":243}
dialogVisible: true
```

(Dialog height 195 → 243 because `pre-line` preserves the blank line in the two-line Persian message.)

---

### Verification (raw output)

```
npm test
ℹ tests 417
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23233.0072

npm run test:ui
  ✔ P3F-ESC-1: grid cards show no literal <div>/<span> badge markup (report per type) (5.9974ms)
  ✔ P3F-ESC-2: movie-detail meta/actions show no literal nested html (1020.1654ms)
  ✔ P3F-ESC-3: selection sidebar items show no literal nested html (826.781ms)
  ✔ P3F-ESC-4: diagnostics panel shows no literal <div style> / double-escaped quotes (1253.9949ms)
  ✔ P3G: order-detail poster renders ≤ thumbnail size and view stays on screen (1082.8625ms)
  ✔ P3H: confirm-dialog animates with modalIn and preserves message newlines (642.3373ms)
ℹ tests 13
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23565.9865

node mimo/repro/repro-backend.js
0 present, 13 fixed, 0 error
exit=0

node mimo/repro/repro-ui.js
PRESENT  FE-01  selecting one card must not rebuild the grid or lose scroll position
         cards 400 -> 40, scrollTop 68784 -> 6675, MovieCard.render() calls: 480
PRESENT  FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
         open WebSockets: 4, Workers: 1 -> 4
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
2 present, 2 fixed, 0 error
exit=1
```

(FE-01 / FE-02 still PRESENT — expected P4 scope; exit 1 is the repro’s “found present defects” code.)

### Tests: total / passing / todo — before → after

- **Before (P3g `55ef7a0`):** unit **417 / 415 / 2 todo** · ui **12 / 10 / 2 todo**
- **After (P3h):** unit **417 / 415 / 2 todo** · ui **13 / 11 / 2 todo**
- Delta: **+1 UI test** (P3H), 0 failures, unit unchanged, todo unchanged (2+2).

### Files changed

**Code commit `cf5451c` (13 files):**
- `js/components/confirm-modal.js` — +`animation: modalIn 0.3s ease` on `.modal-dialog`; +`white-space: pre-line` on `.confirm-message`
- `test/ui/ui.test.js` — new `P3H` suite (1 test), fails before fix with measured `none`/`normal`
- `mimo/repro/p3h-css-sweep.js` — baseline→HEAD selector extraction + disposition classifier
- `mimo/shots/p3h/*` — `dispositions.md`, `sweep-raw.json`, `sweep-summary.txt`, before/after metrics + screenshots, `ui-summary.txt`

**Report commit:** `mimo/PHASE-REPORT-P3h.md`

### Decisions taken / assumptions

- No new D#; no owner overrides.
- Assumption: P3f report already complete → document finding rather than rewrite (scope discipline §6.4).
- Assumption: 2 hover rules superseded by identical `main.css` generics need no restore — disabled `!important` rules still win (visually verified by specificity + declarations).
- Assumption: dead `confirm-modal .btn-danger` rules need no restore (markup uses `btn-primary` only).
- Restored properties go in `confirm-modal.js` (component-owned styles, FE-10), not back into `admin-panel.js`.

### User-visible behaviour changes

- Confirm dialog (order save / clear selection / order delete) **animates open again** (`modalIn 0.3s`) — matches baseline.
- Confirm dialog messages with embedded newlines (admin order save shows a blank line before item count) **display on two lines** again instead of collapsing.

### Risks / could not verify

- Sweep extractor can miss selectors written without `style.textContent` (none found in the 10 files at baseline).
- Animation visually verified via computed-style assertion + screenshot; exact frame-by-frame motion not recorded (computed `animationName`/`duration` is the stable contract).
- Windows local commits only — not pushed.
- FE-01 / FE-02 / ARCH-01 todos untouched (P4 / P8 scope).

### Discovered (out of scope)

- `admin-panel.js` still defines its own `@keyframes modalIn` **and** `css/components.css` defines the same name — harmless identical duplicate (pre-existing); change-password dialog uses the admin-panel copy.
- Baseline `confirm-modal .btn-danger` was already dead CSS (confirm button has always been `btn-primary` in this tree) — candidate for a future cleanup pass, not restored.
- The 9 non-CSS files’ classes are all present in `css/` today (sampled movie-card/edit-modal/selection-sidebar/add-movie/diagnostics); full class-by-class audit of `css/` not performed (out of P1c scope).

### Questions for the owner

1. None blocking. Optional: should a follow-up pass dedupe `@keyframes modalIn` (admin-panel vs components.css), or leave both (identical, harmless)?
