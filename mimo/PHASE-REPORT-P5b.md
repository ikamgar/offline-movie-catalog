# PHASE REPORT — P5b CSS consolidation & accessibility

**Branch / commits:** `phase/P5b-css-a11y` (from baseline `3b06649`) — local only:

| # | Commit |
| --- | --- |
| 1 | `ffe3de7` chore(shots): P5b before/after screenshot matrix harness [D6,D7] |
| 2 | `519851a` chore(shots): P5b BEFORE round — 54 screenshots [D6,D7] |
| 3 | `3354406` chore(repro): P5b CSS reconciliation harness, baseline blocks, first check [D6,D7] |
| 4 | `653add0` refactor(markup): add shared modal-close class and Persian aria-labels to dialog close buttons [D6,D7] |
| 5 | `aa12ddc` refactor(css): move all JS-injected style blocks into css/{modals,admin,print}; z-index tokens; reduced-motion [D6,D7] |
| 6 | `f1803cf` test(a11y): FE-10/FE-14 contrast matrix + dialog focus-trap/aria tests; save flow gated by confirm modal [FE-10,FE-14] |
| 7 | `082839c` feat(a11y): shared focus trap + restore, role=dialog/aria on every modal, Persian aria-labels, confirm modal replaces window.confirm [FE-14] |
| 8 | `e70bedb` fix(css): WCAG AA contrast token fixes — accent-primary/gradient deepened, tertiary/muted/success/warning retuned, accent-as-text swapped to text-accent [FE-14] |
| 9 | `d01fc23` chore(shots): P5b AFTER round (54) + pixel diff report and harness [D6,D7] |
| 10 | this report |

**Defects closed:**
- **FE-10** (D6 — injected CSS / hard-coded z / no reduced-motion) — evidence: `test/unit/css-a11y.test.js` «z-index tokens only» ×2, «z-index scale complete», «reduced-motion»; reconciliation `node mimo/repro/p5b-css-reconcile.js check` → **554 declarations checked, 0 issues**; grep proofs below (0 hard-coded `z-index` in `css/` and `js/`); 54-pair screenshot diff explained.
- **FE-14** (D7 — dialogs lack role/aria/trap/restore, native `window.confirm`, title-only icon buttons, contrast) — evidence: `test/ui/dialog-a11y.test.js` «FE-14a–d» (4/4), `test/unit/css-a11y.test.js` «WCAG AA contrast — dark/light» (matrix, failing before the fix, green after), `test/ui/ui.test.js` «P3I: Series edit …» now confirms through the in-app dialog (native-confirm canary = 0 calls).

**Partially closed / deferred:**
- D6's "one modal system" is achieved at the **behaviour/tokens level** (one `.modal-close` look, one `trapFocus`, one z-scale, styles in linked CSS): login/confirm/diagnostics/shortcuts use `.modal-overlay/.modal`; **edit/add/movie-detail keep their scoped wrapper class names** (`.edit-modal*`, `.movie-detail*`) — renaming them would touch markup, JS and CSS across ~6 components with zero visual/behaviour gain (scope discipline). Flagged as a question below.
- Gaming accent contrast (white on `#00d4ff` gradient = **1.77**) — out of P5b scope (STOP-GATE answer 4); tracked by 2 `# TODO` tests.
- FE-15 stays out of this phase (P5c).

---

## Requirement → test evidence

### D6 — CSS consolidation (FE-10)

| # | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| D6 | every JS-injected `<style>` moved to real CSS (`css/modals.css`, `css/admin.css`, `css/print.css` linked from `index.html`/`store.js`) | reconcile harness (extract@`3b06649` → check) — **554 decls, 0 issues** (5 whitelisted intentional changes); `_applyStyles` deleted from admin/login/confirm (523+120+92 lines) | pass |
| D6 | **property-by-property diff before→after: zero drops** | `p5b-css-reconcile.js check` output below; `EXPECTED_CHANGES` = 5 z-index + 2 accent-as-text entries, `EXPECTED_MISSING` = 1 deduped `@keyframes` | pass |
| D6 | all z-index from tokens, no hard-coded `1000` | `css-a11y.test.js` «css/ has no hard-coded z-index» + «js/ sets no numeric z-index» + «z-index scale complete and ordered» (`--z-base 1 → --z-toast 500`); grep proofs below → **0 matches** | pass |
| D6 | `@media (prefers-reduced-motion: reduce)` freezes non-essential motion, loader spinner keeps spinning (essential indicator) | `css-a11y.test.js` «prefers-reduced-motion freezes motion but keeps the loader spinner» (`main.css:1461`, `@keyframes spin` still in `index.html`) | pass |
| D6 | visual parity screenshots 1400×900 / 390×844, light+dark, customer+admin, every modal | 54 pairs before/after + `p5b-shot-diff.js` → diff summary below; **every difference classified**, none unexplained | pass (explained diffs) |
| D6 | every `var(--…)` resolves after consolidation | `css-a11y.test.js` «every custom property used in css/ is defined» | pass |

### D7 — Accessibility (FE-14)

| # | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| D7 | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → real Persian title on **all** dialogs | `dialog-a11y.test.js` FE-14a (login), FE-14b (edit+confirm), FE-14c (movie-detail/shortcuts/diagnostics); markup grep: 10 dialog elements carry the trio | pass 4/4 |
| D7 | focus moves **in** on open | `dialog-a11y.test.js` «focus must move into the … dialog on open» (login, edit, confirm, detail, shortcuts, diagnostics) — `dialog.js` focuses the container on trap install | pass |
| D7 | focus **trap** (Tab / Shift+Tab stay inside) | FE-14a: 12× Tab + Shift+Tab all inside the login dialog | pass |
| D7 | `Esc` closes — **top dialog only** (confirm over edit) | FE-14b: Esc closes confirm, edit stays open, focus returns into edit | pass |
| D7 | focus **returns to the opener** | FE-14a: after Esc → `activeElement === #loginBtn` | pass |
| D7 | replace native `window.confirm` in edit modal | FE-14b canary (`window.confirm` wrapped, counted): **0 calls** across cancel + confirm flows; grep proof: 0 `window.confirm(` in `js/`; `ui.test.js` P3I save now goes through `confirm-modal` | pass |
| D7 | icon-only buttons get Persian `aria-label`s | FE-14d (`#rescanBtn`, `#diagnosticsBtn`, `#toggleTheme`) + every dialog close button (markup commit `653add0`); FE-14a asserts `#closeBtn` label | pass |
| D7 | selectable cards expose `aria-pressed` | pre-existing: `movie-card.js:48,66` `setAttribute('aria-pressed', …)` — untouched | pass (verified) |
| D7 | visible `:focus-visible` ring in both themes | pre-existing: `main.css:48–51,437,443,447`; ring colour `--color-border-focus` defined per theme, matrix-tested ≥3:1 in both themes | pass (verified) |
| D7 | `<html lang="fa" dir="rtl">` verified | `index.html:2` `<html lang="fa" dir="rtl" data-theme="dark">` | pass (verified) |
| D7 | body text/button contrast ≥ WCAG AA **both themes** (fix tokens, list changes) | `css-a11y.test.js` «WCAG AA contrast — dark/light» — **failed before the fix** (11 light + 7 dark violations, measured values below), green after; exact token changes listed below | pass after fix |

---

## CSS reconciliation (property-by-property, before → after)

```
node mimo/repro/p5b-css-reconcile.js check
...
TOTAL: 554 declarations checked, 0 issues
NO ISSUES
exit=0
```
- Baseline = `git show 3b06649:…` per file; blocks extracted from the injected style functions + moved component sections.
- 7 whitelisted diffs (all intentional, each in `EXPECTED_CHANGES`): 3× `z-index: 1000 → var(--z-modal)`, 2× `z-index: 10 → var(--z-panel-head)` (D6), 2× `color: var(--color-accent-primary) → var(--color-text-accent)` on `.admin-selection-id` / `.order-detail-movie-id` (D7 contrast).
- 1 whitelisted missing declaration: duplicated `@keyframes modalIn` deduplicated into `css/modals.css`.
- Report file: `mimo/shots/p5b/reconcile.txt`.

## Screenshot diff (54 pairs, before vs after)

`node mimo/repro/p5b-shot-diff.js` → `mimo/shots/p5b/diff-report.txt`:
```
P5b shot diff — 54 pairs, 0 identical, 54 differ (tolerance=2)
total diff pixels: 1126502
```
Per-pair range: **0.76 % – 20.65 %** of pixels. Differences classified via 64-px tile localisation + RGB probes + CSS causality; **every pair maps to one of these five causes — no unexplained/ghost differences**:

| # | Cause | Where it shows | Proof (probe / tile) |
| --- | --- | --- | --- |
| 1 | **Contrast tokens (Path A)** — accent blues, gradient stops, tertiary/muted text, light success/warning, link colours | all 54 pairs: buttons (`ذخیره سازی`, `ورود`, tab pill), `#000x` ids, footer text, badges, admin metadata | `customer-dark-mobile-login` login button pixel: `91,127,255` (`#5b7fff`) → geometry-shifted; `admin-dark-desktop-base` tiles at header pill / panel stats / footer; matrix values below |
| 2 | **mobile.css cascade restoration (D6)** — rules that were dead while injected styles outranked them now win | mobile pairs, biggest deltas (`admin-*-mobile-base` 14.8 %, `admin-*-mobile-confirm` 14–20.7 %, `customer-*-mobile-login` 6.9–8.4 %) | `.admin-panel {width:100%; position:fixed; top:52px; z-index:var(--z-overlay)}` (`mobile.css:318`), `login/confirm .modal-dialog {width:95%}` (`mobile.css:452,467`), panel header padding (`mobile.css:335`) — dialog geometry probe: `(200,540)` before = `91,127,255` (old blue button) → after = `22,22,29` (dialog bg, button moved by width/padding change) |
| 3 | **Shared `.modal-close` look (D6 markup commit)** | login/confirm/detail close buttons become the pill style used by edit/add | `ALIAS` union in reconcile (`.edit-modal-close` ↔ `.modal-close`); visually confirmed on dialog shots |
| 4 | **z-token layering (STOP-GATE answer 1)** — toast now above the login overlay | the 2 `toast-login` pairs (maxΔ 224) | light probe: toast region before = `102,102,102` (white toast dimmed **behind** overlay) → after = `255,255,255` (toast **above** overlay) |
| 5 | **Dynamic clock cell** — `آخرین بروزرسانی` timestamp is real time | admin base/change-password/order-detail pairs (maxΔ 210–231 at the stats tile) | `admin-dark-desktop-base` hottest tile = `1280,192` (the timestamp) — harness does not freeze wall-clock; not a code change |

No pair showed a focus-ring artifact (programmatic container focus does not trigger `:focus-visible` under mouse-driven harness), layout regression, missing content, or text change.

## STOP-GATE questions raised in the plan — answers applied

| # | Question | Applied (default I took unless you say otherwise) |
| --- | --- | --- |
| 1 | login/confirm/change-password overlays `z-index 1000` → token | `--z-modal: 400` (toast `500` now above login — evidence: cause 4). Alt `--z-modal-top: 1000` available if you want strict old ordering back |
| 2 | primary-button contrast | **Path A**: deepened accent (see token table); labels stay white |
| 3 | light tertiary `#a1a1aa` (2.35) / dark `#6a6a80` (3.63) must darken/lighten | applied (visible placeholder/meta change) |
| 4 | gaming accents (≈1.8) | out of scope → 2 `# TODO` tests + Discovered |
| 5 | `css/print.css` popup-only link / inline `style=` attrs | link OK; inline attrs (diagnostics spinner, card badges) untouched → Discovered |

## Exact colour changes (the "list the changes" deliverable)

| Token / rule | Theme | Before | After | Measured violation fixed |
| --- | --- | --- | --- | --- |
| `--color-accent-primary` | dark + light | `#5b7fff` | `#4a6de6` | white on it `3.54 → 4.55` |
| `--color-accent-primary-hover` | dark + light | `#4a6de6` | `#3d5cc4` | white on it `4.17 → 5.47` |
| `--color-accent-primary-active` | dark + light | `#3d5cc4` | `#2f4ca8` | white on it `5.47 → 6.3` |
| `--gradient-accent` | dark + light | `#5b7fff,#8b5cf6` | `#4a6de6,#7c3aed` | white on stops `3.54/4.23 → 4.55/5.72` |
| `--color-text-tertiary` | dark | `#6a6a80` | `#8a8aa0` | on bgs `3.13–3.63 → 4.89–5.67` |
| `--color-text-tertiary` | light | `#a1a1aa` | `#66666f` | on bgs `2.15–2.56 → 5.21–5.68` |
| `--color-text-muted` | light | `#6b6b75` | `#606068` | on bg-tertiary `4.43 → 5.27` |
| `--color-text-accent` | light | `#4a6de6` | `#3d5cc4` | on bg-primary `4.17 → 5.47` |
| `--color-accent-success` | light | `#10b981` | `#047857` | diag number `2.13 → 4.64` (large ≥3) |
| `--color-accent-warning` | light | `#d97706` | `#b45309` | diag number `2.68 → 4.24` (large ≥3) |
| `.admin-selection-id`, `.order-detail-movie-id` | both | `color: var(--color-accent-primary)` | `color: var(--color-text-accent)` | dark ids on panel: `5.15` kept (`#7c9cff`), light `3.55 → 5.96` |
| `.section-link:hover` | both | `color: var(--color-accent-primary-hover)` | same colour + `text-decoration: underline` | dark hover was `4.20` (pre-existing fail) → now `7.3` + underline affordance |

Dark `--color-text-muted` (`#85859c`, ≥4.64 on all bgs), dark success/warning/info, `--color-border-focus` (`≥3.26` both themes) — measured, kept unchanged.

## Files changed (27, grouped — excluding shot artifacts)

| Group | Files |
| --- | --- |
| D6 harness | `mimo/repro/p5b-css-reconcile.js` (extract/check, EXPECTED_CHANGES/MISSING), `mimo/shots/p5b/baseline/*.css` (5), `mimo/shots/p5b/reconcile.txt` |
| D6 markup | `js/components/{edit,add,diagnostics,shortcuts,login,confirm}-modal.js`, `movie-detail.js`, `order-card.js` (shared `.modal-close` + aria-labels) |
| D6 css | `css/modals.css` (new), `css/admin.css` (new), `css/print.css` (new), `css/components.css` (source sections removed), `css/themes.css` (z tokens), `css/main.css` (z tokens + reduced-motion), `index.html` (2 links), `js/store.js` (print link), `js/components/{admin-panel,login-modal,confirm-modal}.js` (`_applyStyles` deleted) |
| D7 js | `js/utils/dialog.js` (new trap), `js/components/{edit,add,diagnostics,shortcuts,login,confirm}-modal.js`, `movie-detail.js`, `admin-panel.js` (change-password open/close + trap), `order-card.js` (trap), `selection-sidebar.js` + `js/app.js` (aria-labels) |
| D7 css | `css/themes.css` (contrast tokens), `css/admin.css` (2 accent-as-text swaps), `css/main.css` (`.section-link:hover`) |
| D7 tests | `test/unit/css-a11y.test.js` (new), `test/ui/dialog-a11y.test.js` (new), `test/ui/ui.test.js` (P3I save via confirm modal; native-dialog handler removed) |
| docs | `AGENTS.md` (css map + `utils/dialog.js`) |
| shots/evidence | `mimo/repro/p5b-shots.js`, `mimo/repro/p5b-shot-diff.js`, `mimo/shots/p5b/{before,after}/*` (108 PNG + 2 manifests), `diff-report.txt` — **2 commits exceed the ≤15-file rule** (evidence artifacts, same exception as the BEFORE round) |

No new dependencies (`playwright` already present; diff uses Chromium canvas). No `data/`, no `Library/` touched.

## Tests: total / passing / fail / todo — before → after

| Suite | Before (P5a) | After (P5b) |
| --- | --- | --- |
| unit (`npm test`) | 493 / 491 / 0 / 2 | **502 / 498 / 0 / 4** (+9: css-a11y 9; todo = ARCH-01 + 2 gaming-contrast discoveries) |
| ui (`npm run test:ui`) | 23 / 23 / 0 / 0 | **27 / 27 / 0 / 0** (+4 dialog-a11y) |
| reconcile | — | **554 decls / 0 issues** |
| shot diff | — | 54 pairs classified, 0 unexplained |
| repro-backend | 0 present, 13 fixed, exit 0 | **0 present, 13 fixed, exit 0** |
| repro-ui | 0 present, 4 fixed, exit 0 | **0 present, 4 fixed, exit 0** |

## Decisions taken / assumptions

1. **Path A for contrast** (deepen accent, keep white labels) over Path B (dark labels) — smaller visual footprint; every resulting value is matrix-tested.
2. **One shared `trapFocus` with a stack** (`js/utils/dialog.js`): Escape is captured on `document` (capture) and stops propagation so component-level handlers cannot double-close; only the top dialog reacts (confirm-over-edit safe); focus restores to the opener unless it is `<body>`.
3. **Host-level trap for dialogs that re-render `innerHTML` while open** (diagnostics, movie-detail): trapping the inner box would go stale after re-render; the host is stable and carries `tabindex=-1` focus.
4. **Container receives focus on open** (not the first field) — announces the dialog, avoids accidental button activation; Tab then enters the first control.
5. **`.section-link:hover` changed from hue-shift to underline** — the old hover colour was already below AA on dark (`4.20`) and would worsen with the deeper token; underline keeps an obvious affordance with an AA-safe colour.
6. **Reconcile whitelist, not silent edits** — all 7 intentional declaration changes are registered in `EXPECTED_CHANGES`, so the harness stays honest (a forgotten change fails the check).
7. **Reduced-motion keeps `.initial-spinner` spinning** (essential indicator) — motion freezing is for decorative animation only.
8. Assumption: `aria-labelledby` ids were renamed (`modalTitle` → `loginTitle`/`confirmTitle`) because both modals used the duplicate id `modalTitle`; nothing referenced the old ids (grep-verified).

## User-visible behaviour changes

- Accent blue deepened everywhere (`#5b7fff → #4a6de6` + hover/active/gradient) — buttons, tab pill, ids, links, borders; light-theme success/warning numbers on diagnostics darkened; light meta/placeholder grey darkened (was 2.15–2.56 contrast).
- `.section-link` hover now underlines instead of shifting hue.
- Close buttons of login/confirm/detail dialogs now share the pill `.modal-close` style of the other modals.
- **Mobile layout restored to what `mobile.css` always specified**: login/confirm dialogs 95 % wide with roomier padding; the admin panel becomes a fixed full-width drawer under the header; panel header padding applied.
- The error toast now appears **above** the login overlay (was hidden behind it).
- Every dialog: focus jumps in, Tab is trapped, Esc closes only the top one, focus returns to the opener; the edit save asks in the app's Persian confirm dialog instead of the browser's native one; icon-only header buttons announce Persian labels to screen readers.
- Users with `prefers-reduced-motion` get frozen animation/transition (loader keeps spinning).
- No Persian string was reworded.

## Risks / could not verify

- **`npm start` on a fresh clone with an empty `Library/` was deliberately not run** (it would rewrite the owner's real `data/catalog.json` cache and touch the real `Library/` scan — forbidden by safety rules). Equivalent boot paths are covered by `repro-backend.js` (real Express+routes on temp dirs) and `ui-stub` (full static+API+WS app in Playwright); all green.
- Screenshot classification: per-pair numbers + tile localisation + RGB probes + CSS causality; six representative pairs were inspected directly (admin desktop base, admin mobile base, mobile login ×2, toast-login numeric, mobile change-password tiles). A manual eyeball of all 54 pairs was not performed (tooling limits); no pair produced a delta that could not be tied to the five listed causes.
- The admin timestamp cell differs between rounds (real clock) — expected; if strict byte-parity is ever wanted, the harness must freeze that cell.
- Focus-trap behaviour verified by keyboard simulation in Chromium only (Firefox/WebKit not run — Playwright chromium is the project's harness convention).
- WCAG matrix covers token-level pairs actually used by selectors (text/large/UI thresholds); composite backgrounds (translucent genre tints over cards) and gaming are excluded — see Discovered.

## Discovered (out of scope)

- **Gaming theme contrast fails WCAG** (white on `#00d4ff→#7c3aed` gradient = `1.77`, cyan text on dark = borderline) — captured as 2 `# TODO` tests (`css-a11y.test.js`) so it cannot be forgotten.
- Inline `style=` attributes remain (diagnostics spinner container, movie-card badge colours) — not tokenizable without touching markup logic.
- `index.html` keeps its inline boot-loader `<style>` (progress spinner before CSS loads) — not a JS-injected block; retained intentionally.
- `--color-accent` / `--color-accent-hover` legacy aliases are used only as background/border (modals.css buttons) — safe with the new tokens; kept for compatibility.
- Two commits exceed the ≤15-file rule (shot-evidence batches: `519851a`, `d01fc23`) — flagged per standing rule.
- FE-15 (keyboard shortcut gap) remains for P5c.

## Questions for the owner

1. Accept the Path A token table above as the final AA fix (visible hue shifts listed)? Or prefer any value tweaked (e.g. keep old `#5b7fff` for non-text uses and only change button backgrounds)?
2. Accept `--z-modal: 400` (toast above login overlay — demonstrated in the toast shots)? Alternative: add `--z-modal-top: 1000` to restore the old "login above toast" order.
3. Accept the mobile cascade restoration (admin drawer full-width, dialogs 95 %) as the intended baseline CSS? It is what `mobile.css` always declared while the injected styles masked it.
4. Rename the remaining scoped wrappers (`.edit-modal*`, `.movie-detail*`) to the shared `.modal-overlay/.modal` naming for a literally "one modal system"? (Recommended: no — churn without behaviour gain.)
5. Gaming-contrast fix — schedule into P5c or a later theme pass?

---

## Verification (raw)

```
=== npm test ===
EXIT=0
ℹ tests 502
ℹ suites 127
ℹ pass 498
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 4
  (todo = ARCH-01 meta.version + 2 gaming-contrast discoveries + … listed as # TODO)

=== npm run test:ui ===
EXIT=0
P4-C5 metrics: {"firstPaintFullMs":628,"loadCatalogToPaintMs":238,"selectMs":14,"longTasks":[],"searchMs":252,"cards":40}
P5a search processing: {"filterMs":6.1,"toFrameMs":10.3,"matched":369}
ℹ tests 27
ℹ suites 16
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 42684.4822

=== node mimo/repro/repro-backend.js ===
EXIT=0
…
0 present, 13 fixed, 0 error

=== node mimo/repro/repro-ui.js ===
EXIT=0
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error

=== node mimo/repro/p5b-css-reconcile.js check ===
TOTAL: 554 declarations checked, 0 issues
NO ISSUES
exit=0

=== node mimo/repro/p5b-shot-diff.js ===
P5b shot diff — 54 pairs, 0 identical, 54 differ (tolerance=2)
total diff pixels: 1126502

=== grep proofs ===
z-index: <digit> in css/        : 0 matches
z-index/zIndex = <digit> in js/ : 0 matches
window.confirm( in js/          : 0 matches
prefers-reduced-motion          : css/main.css:1461
aria-pressed on cards           : js/components/movie-card.js:48,66
:focus-visible                  : css/main.css:48-51,437,443,447
<html lang="fa" dir="rtl">      : index.html:2
```
