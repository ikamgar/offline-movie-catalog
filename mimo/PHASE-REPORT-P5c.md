# PHASE REPORT - P5c (D4 + D5 + D8 + gaming contrast)

Branch: `phase/P5c-cleanup` (from `d8d91bd` = P5b head) · Commits: 12 build commits (+ this report)
Scope per `mimo/prompts/P5-persian-ux-a11y.md`: **D4** (id-vs-title, FE-06), **D5** (shortcut parity, FE-15), **D8** (dead code & typos, FE-09/FE-11), **gaming contrast** (FE-14 Path A). Owner instruction: build after plan + STOP-GATE defaults; **stop after this report — do not start P6.**

## Requirement → test evidence

### D4 - id-vs-title (FE-06)
Bugs fixed: `store.copySelectedIds` and `store.printSelectedIds` used `m.id !== null` / `m.id !== null ? m.id : m.title`, but **Games have no `id` field at all** (`undefined !== null` → truthy): copy rendered the game as an **empty line** (`Array.join` stringifies `undefined` as `''`, so the item silently disappeared), print rendered the literal `undefined - Ghost Rider`. Series (`id: null`) were title-only in copy but printed `null - Title`. Order snapshot rendered **no badge** for Games inconsistently with the id-preserving rule.

| Change | File | Evidence |
|---|---|---|
| New helpers `idOrTitle(item)` / `hasId(item)` (id when present verbatim per I2, else title; never `undefined`/`null`) | `js/utils/helpers.js` | `test/unit/helpers.test.js` **8/8** — Movie/Animation/Iranian→id, leading zeros preserved, Series→title, Game(no id)→title, empty-id fallback, null item→`''`, `hasId` mirror |
| Copy uses helper | `js/store.js` | `test/ui/copy-shortcuts.test.js` T1 **PASS** (red before fix: only 2 lines) — clipboard deep-equals `['0001', 'Ghost Rider', "Grey's Anatomy"]`, no `'undefined'` |
| Print uses helper + `<html lang="fa" dir="rtl">` | `js/store.js` | T2 **PASS** (red before: `print document must be RTL`) — popup `dir=rtl lang=fa`, exactly 3 lines (`0001 - Heat`, series/game title once each), no `undefined` |
| Order snapshot (detail badges + poster id) | `js/components/order-card.js` | T3 **PASS** — `#orderDetailMovies .order-detail-movie-id` = `['#0001']`, no `undefined` |
| Manager live list badge | `js/components/admin-panel.js` | same helper; existing list tests green |

### D5 - shortcut parity (FE-15)
| Change | File | Evidence |
|---|---|---|
| **Ctrl+B** toggles the selection panel (`store.toggleSelectionSidebar()`) — the only modal-advertised shortcut that did nothing | `js/app.js` | T4 **PASS** (red before: timeout) — `#selectionSidebar` open → collapsed → open |
| Deleted no-op F5/Ctrl+R branch and unused `isInput` | `js/app.js` | grep: no F5/Ctrl+R handler, no `isInput` left |
| Parity: every row advertised in the shortcuts modal actually works | — | T5 **PASS** — walks all 6 rows (`/`, `Esc`, `Ctrl+Shift+D`, `Ctrl+B`, `Ctrl+Shift+C`, `?`) |

Note: F5/Ctrl+R already performed a normal browser refresh (the branch was a no-op comment), so no behaviour change — the misleading code is gone.

### Gaming contrast (FE-14, Path A tokens)
`test/unit/css-a11y.test.js` extended: matrix now runs over 4 scopes (`dark`, `light`, `gaming`, `gamingLight` — the light-gaming scope composition bug fixed: `{...darkScope, ...light, ...gaming, ...gamingLight}`), 2 gaming gradient tests flipped from `# TODO` to active. **11/11 PASS** (was: 8 failures across dark/light gaming + 2 todo). Full 29-pair matrix: 0 failures in all 4 scopes. Exact colour changes below.

### D8 - dead code (FE-09) + FE-11 verification
Eight deletion commits, each: grep proof → delete → `npm test` green → commit (see "D8 deletion proofs"). FE-11 (typo `آیمی` → `آیتمی`) was **already fixed in HEAD** — verified, not re-fixed (STOP-GATE default 5).

## STOP-GATE questions raised in the plan — answers applied
1. **"Order snapshot" scope** = both render sites (`order-card.js` detail **and** `admin-panel.js` live list) route through the shared helper. No WS/on-disk format touched (message shapes unchanged, no protocol bump needed).
2. **Series/Game print line** = title only (dedupe falls out of the helper: ref===title → title alone); Movies keep `0012 - Title`.
3. **Unused helper exports beyond `throttle`** (`escapeHtml`, `formatNumber`, `genreClass`, `truncate`) → left in place, listed under *Discovered*.
4. **`gamingLight` scope fix** in `css-a11y.test.js` applied (cascade composition) — required for honest measurement.
5. **FE-11 typo already fixed in HEAD** → verify + document only; no code change.

## Exact colour changes (gaming tokens, math-verified; all ratios white-on-token unless noted)

| Token | dark gaming before → after | light gaming before → after |
|---|---|---|
| `--color-accent-primary` | `#00d4ff` (1.77 ✗) → `#007d9e` (**4.74** ✓) | `#0099cc` (3.27 ✗) → `#006f9f` (**5.56** ✓) |
| `--color-accent-primary-hover` | `#00b8e6` (2.33 ✗) → `#006f9f` (**5.56** ✓) | `#007aaa` → `#005f8c` (**7.07** ✓) |
| `--color-accent-primary-active` | `#0099cc` (3.27 ✗) → `#005c88` (**7.28** ✓) | `#005c88` kept (**7.28** ✓) |
| `--gradient-accent` stop 1 (stop 2 `#7c3aed` kept, 5.72 ✓) | `#00d4ff` (1.77 ✗) → `#007d9e` (**4.74** ✓) | `#0099cc` (3.27 ✗) → `#006f9f` (**5.56** ✓) |
| `--color-text-accent` | `#00d4ff` kept (cyan on dark bg, passes) | `#0077aa` (4.45 ✗) → `#006b99` (**≥4.5** ✓) |
| `--color-border-focus` | `#00d4ff` kept (UI-component ≥3 ✓) | `#0099cc` (2.92 ✗) → `#006f9f` (**≥4.5** ✓) |

Kept the cyan gaming identity (`#00d4ff`) everywhere it is a *foreground/ring on dark*; only white-on-fill pairs and light-theme foregrounds were darkened. Verification = the css-a11y matrix itself (11/11, all scopes).

## D8 deletion proofs (grep + green `npm test` after each)

| # | Deleted | Proof | Commit |
|---|---|---|---|
| ① | `js/components/floating-selection.js` + orphan CSS (`components.css` 45 lines incl. `@keyframes slideUp` — its only user; `mobile.css` 3 rules) | no importer anywhere; no `<floating-selection>` in any HTML; post-delete grep of js/css/html = **0** | `4d3d1ac` |
| ② | `server/realtime/selection-state.js` | grep: only self-refs (`class SelectionState`, `module.exports`); `ws-server.getSelectionState()` is a different, live method; stale AGENTS.md mention dropped in same commit; post-delete grep = **0** | `db8960e` |
| ③ | `CatalogIndexer.processScanResults` (−108 lines) | grep: definition only (+ register/prompt docs); `node --check` OK; post-delete grep = **0** | `5d77239` |
| ④ | `Diagnostics.getQuickSummary` + its test block | grep: definition + own test only; suite **511/509/0/2** (−1 test) | `19bfaf2` |
| ⑤ | `data/movies.json` fallback in `loadCatalog` + stale header comment | file does not exist; grep `data/movies.json` in code = **0** post-delete | `2f48059` |
| ⑥ | `CatalogIndexer.removeMovieFromIndex` | grep: definition only (P3d/P3e explicitly carried it over as "delete in P5"); `node --check` OK; post-delete grep = **0** | `a73c9e5` |
| ⑦ | `throttle` export (`helpers.js`) + unused import (`app.js:10`) | other `throttle` matches are unrelated backup-policy comments/tests; post-delete grep in `js/` = **0** | `920d589` |
| ⑧ | `.gitignore` `posters/` section | directory absent (`Test-Path` False), 0 tracked files (`git ls-files`), 0 writers (only match = a test *description* containing "posters"); `git check-ignore posters/x.txt` exits 1 after removal | `495916d` |

Every step above: `npm test` green (`511 / 509 pass / 0 fail / 2 todo`).

### FE-11 (typo) — verification only
- Baseline `7bbf743:js/components/admin-panel.js:684` contained `آیمی`.
- `Select-String 'آیمی' js/**/*.js` in HEAD → **no matches**; `git log -S آیمی -- js/` last change = `4777e40` (P5b template-escape work).
- Current empty state: `admin-panel.js:169` = `هنوز آیتمی ...`.
- No test ever asserted the typo or the empty-state sentence; none needed.

## Commits (12)
```
5e54316 test(p5c): failing tests — FE-06 id-vs-title helper/copy/print/order, FE-15 Ctrl+B + shortcut parity, gaming contrast matrix [FE-06,FE-14,FE-15]
fcbdab4 feat(copy): idOrTitle/hasId helper drives copy, print and the order snapshot; RTL print document [FE-06]
1d3e97b feat(shortcuts): Ctrl+B toggles selection panel; drop dead F5 branch and unused isInput [FE-15]
716dcfc fix(contrast): gaming accent tokens — white-on-primary and gradient labels >= 4.5 in dark+light gaming [FE-14]
4d3d1ac refactor(dead): delete never-imported floating-selection component and orphan CSS [FE-09]
db8960e refactor(dead): remove unused selection-state.js; drop stale AGENTS mention [FE-09]
5d77239 refactor(dead): remove uncalled CatalogIndexer.processScanResults [FE-09]
19bfaf2 refactor(dead): remove uncalled Diagnostics.getQuickSummary and its test [FE-09]
2f48059 refactor(dead): drop unreachable data/movies.json fallback from store loadCatalog [FE-09]
a73c9e5 refactor(dead): remove unused CatalogIndexer.removeMovieFromIndex [FE-09]
920d589 refactor(dead): remove unused throttle export and its app.js import [FE-09]
495916d chore: drop stale posters/ gitignore entry (no such directory, no writers) [FE-09]
```
Test-first respected: commit ① contains the **failing** tests; each defect fix came after its red was captured (copy = 2 lines, print = no `dir`, Ctrl+B = timeout, matrix = 8 failures).

## Files changed (20, grouped — excluding this report)
- **Tests (5):** `test/unit/helpers.test.js` (new), `test/ui/copy-shortcuts.test.js` (new), `test/helpers/ui-stub.js` (games option), `test/unit/css-a11y.test.js` (4-scope matrix, scope fix, flip), `test/unit/diagnostics.test.js` (−QS test)
- **Front-end (6):** `js/utils/helpers.js`, `js/store.js`, `js/app.js`, `js/components/order-card.js`, `js/components/admin-panel.js`, `js/components/floating-selection.js` (deleted)
- **CSS (3):** `css/themes.css`, `css/components.css`, `css/mobile.css`
- **Backend (2):** `backend/indexer.js`, `backend/diagnostics.js`
- **Server (1):** `server/realtime/selection-state.js` (deleted)
- **Docs/infra (3):** `AGENTS.md`, `.gitignore`, `mimo/PHASE-REPORT-P5c.md` (this file)

Largest single commit: 4 files (commit ①) — well under the 15-file stop-gate.

## Tests: total / passing / fail / todo - before → after
| Suite | Before (d8d91bd) | After | Δ |
|---|---|---|---|
| unit (`npm test`) | 502 / 498 / 0 / 4 | **511 / 509 / 0 / 2** | +8 helpers, +2 matrix iterations, −1 deleted QS test, 4 css-a11y todo→active |
| ui (`npm run test:ui`) | 27 / 27 / 0 / 0 | **32 / 32 / 0 / 0** | +5 (`copy-shortcuts.test.js`) |

Remaining 2 todo = both `ARCH-01` version-string tests (pre-existing, unchanged; the `✖ failing tests` block node prints includes them — exit code stays 0).

## Decisions taken / assumptions
- **D4 decision basis = id *presence*, not type names:** `hasId` ≡ `id != null && id !== ''` (I2: ids are strings; `''` would be an invalid id anyway). Games (no field) and Series (`null`) both fall back to title automatically; no `type` switch, no truthiness on the id.
- **Print format:** `ref === m.title ? ref : `${ref} - ${m.title}`` → Movies `0012 - Title`, Series/Games title only (STOP-GATE default 2).
- **Ctrl+B has no input-field guard** — it is advertised as a global shortcut and works from anywhere; `/` and `Esc` remain scoped to the search bar (unchanged, P3 code).
- **Gaming identity preserved:** cyan `#00d4ff` kept as foreground/ring on dark; only white-on-fill pairs and light-theme foregrounds darkened (Path A, per P5b answer 4).
- **D8:** deleted only register-listed items; one commit per group, grep proof + green suite each time. `processGameResults` was checked and is **live** (watcher.js:404/409) — correctly not touched.
- Assumption: the order snapshot scope covers only rendering; WS payload shape (`orders:save {movies}`) untouched → no protocol bump.

## User-visible behaviour changes
1. **Copy (Ctrl+Shift+C)** now always includes every selected item — Games/Series as titles, Movies as zero-padded ids; previously Games vanished (empty line).
2. **Print view** lists the same refs, is explicitly RTL/Farsi (`dir="rtl" lang="fa"`), and never shows `undefined`/`null`.
3. **Order detail** shows a `#id` badge for id-carrying items and **no badge** for Series/Games (before: Games showed none *and* copy was inconsistent — now both follow one rule).
4. **Ctrl+B** collapses/reopens the selection panel (new working shortcut).
5. **Gaming mode buttons/links** are darker teal instead of cyan-on-cyan; light-gaming text/focus ring darkened — all ≥4.5 (labels) / ≥3 (rings), gaming look otherwise unchanged.
6. F5/Ctrl+R behave exactly as before (normal refresh) — dead branch removed, no user-visible change.

## Risks / could not verify
- **Flaky timing test:** one full run showed `search.test.js` worst-query **32.08 ms > 30 ms** budget (machine load); passed on immediate rerun (×4 suites green since). Pre-existing flake, unrelated to these changes.
- **`npm start` boot smoke:** ran `node server.js` 5 s — full startup (cache → scan → index → watcher → WS), alive, no new console noise; it performed the app's normal `data/catalog.json` re-save (git-ignored, same catalog; metadata re-attached from cache). Screenshots not re-taken (no visual change outside gaming mode; gaming change is token-level and covered by the matrix).
- PowerShell console mangles Persian (`?????`) — display-only; all asserts compare in-file UTF-8.

## Discovered (out of scope)
- `js/utils/helpers.js` still exports **`escapeHtml`, `formatNumber`, `genreClass`, `truncate` with 0 references** anywhere in `js/` (grep-verified this session). Not in FE-09 → left per STOP-GATE default 3; candidate for P7.
- `Array.join` silently renders `undefined` as an **empty line** (copy path), while template literals render the literal string (print path) — the same FE-06 bug had two different symptoms.
- Remaining todo pair (ARCH-01) = real pre-existing defect (server hardcodes version `3.0` vs package `5.4.0`), belongs to a P7/P9 phase.

## Questions for the owner
1. The 5 plan STOP-GATE defaults were applied as stated — confirm (esp. **#3**: leave the 4 unused helper exports for a later phase, or fold into D8 now?).
2. P5c is the last P5 session — **stopped here as instructed**; next session should start `mimo/prompts/P6-*` (or your chosen next phase).

## Verification (raw)
**1/4 `npm test`** → `EXIT=0`
```
ℹ tests 511
ℹ suites 128
ℹ pass 509
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23584.0865

✖ failing tests:

test at test\unit\defects.test.js:2074:3
⚠ ARCH-01: /api/movies meta.version must match package.json version (todo) (18.0315ms) # TODO
  AssertionError [ERR_ASSERTION]: /api/movies meta.version "3.0" must match package.json "5.4.0"
```
**2/4 `npm run test:ui`** → `EXIT=0`
```
ℹ tests 32
ℹ suites 18
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 41440.0646
```
(suite tails included all 5 new `copy-shortcuts` tests green: 3× FE-06 + 2× FE-15)

**3/4 `node mimo/repro/repro-backend.js`** → `EXIT=0`
```
FIXED    DATA-17  documented format with resolution tag must parse (year != 1080)
FIXED    DATA-18  7+ digit ID must be rejected or parsed whole, never split
FIXED    DATA-11  Animation/Iranian keep the year when the filename has one
FIXED    DATA-04  Library/Games images must never become movie entries
FIXED    DATA-05  Movie 0001 and Iranian 0001 must both survive a scan (or be reported, never silently dropped)
FIXED    DATA-06  poster lookup must survive titles containing %
FIXED    DATA-07  deleted order numbers must never be reused (even after restart)
FIXED    DATA-08  a corrupted orders.json must not be silently overwritten
FIXED    SEC-03  createMovie must not write outside Library (id / genre traversal)
FIXED    DATA-02  watcher: hot-added Movie keeps its year; hot-added Series appears
FIXED    DATA-01  title edit must keep imdbRating/plotSummary/year after the watcher settles
FIXED    DATA-03  editing a multi-genre movie must rename all copies (movie-editor), no ghost after rescan

0 present, 13 fixed, 0 error
```
**4/4 `node mimo/repro/repro-ui.js`** → `EXIT=0`
```
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s

0 present, 4 fixed, 0 error
```
Defect register coverage this phase: **FE-06 ✓, FE-15 ✓, FE-09 ✓ (8 groups), FE-11 ✓ (verify-only), FE-14 ✓ (Path A — contrast half; the P5b-side dialog/ARIA half was closed in P5b).**
