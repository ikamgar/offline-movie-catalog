## PHASE REPORT — P3f Escaping fix (nested `html\`\`` double-escape)

**Branch / commits:** `phase/P3f-escaping-fix` (on top of `e4d8af8` P3e report)

| Commit | Summary |
|---|---|
| `9191060` | `fix(ui): wrap nested html\`\` in raw() across components [P3F ESC]` |
| *(report)* | `docs(P3f): phase report — nested-raw sweep, Iranian claim corrected` |

**Date:** 2026-09-23 · **Scope:** owner-reported double-escape bugs (diagnostics conflict section + movie-card ID badge) + full `js/components/` sweep both directions.

### Defects closed / affected

| ID | Status in P3f | Evidence |
|---|---|---|
| **Owner report #1** (diagnostics `تداخل اطلاعات` literal `<div style=…>` / `&amp;quot;`) | **Closed** | `P3F-ESC-4` failed before fix (`literalDivStyle=true`, `literalDiv=true`); passes after. Root cause: `_renderIssueSection` interpolated `.map(…html\`\`)` and `renderFn(item)` without `raw()`; nested `html\`\`` for paths/detail/overflow also unraw'd. |
| **Owner report #2** (movie-card ID badge literal `<div class="movie-card-id-large">#7669</div>`) | **Closed** | `P3F-ESC-1` failed before fix on Movie/Animation/Iranian (`literalIdBadge=true`); passes after. Root cause: `movie-card.js:89` nested `html\`\`` inside `infoSection` without `raw()`. |
| **Same pattern elsewhere** (detail meta/actions, selection sidebar, admin selection, order-card meta, type breakdown, storage warnings, overflow) | **Closed** (sweep) | Fixed in same commit; covered by `P3F-ESC-2` (movie-detail) and `P3F-ESC-3` (selection sidebar). Admin selection + order-card fixed by identical pattern (no dedicated Playwright walk — see *Risks*). |
| **Reverse direction: missing `esc()`** | **Closed** (one site) | `movie-grid.js` category banner interpolated `label` in a plain (non-`html\`\``) `innerHTML` template → wrapped with `esc()`. Grep of other plain templates (`confirm-modal`, `login-modal`, `shortcuts-modal`, `search-bar`, `floating-selection`, empty-state) found only static/constant content — no other missing-`esc` sites. |

**Todos flipped this phase:** none. Unit todo count unchanged **2** (ARCH-01 ×2). UI todo count unchanged **2** (FE-01, FE-02).

### How widespread was the bug?

**Not a one-off — systemic pattern across 6 component files (≈16 individual sites), plus one missing-`esc` site.**

| File | Sites fixed | Pattern |
|---|---|---|
| `movie-card.js` | 2 | ID badge (L89); game platform-badges container (L99) |
| `movie-detail.js` | 5 | admin copy-ID button, customer copy-ID button, `movie-detail-id` span, `movie-detail-year` span (L71/82/109/110) + bullet already raw'd (unchanged) |
| `selection-sidebar.js` | 3 | game platforms ternary branch, year div, selection ID badge (L94/95/98) |
| `admin-panel.js` | 1 | admin selection ID badge (L554) |
| `order-card.js` | 3 | movie id / year / type spans inside `map→html\`\`` (L94–96); also added missing `raw` import |
| `diagnostics-modal.js` | 6 | `_renderIssueSection` map join + `renderFn(item)` + overflow div (L228/230/233); typeCounts map (L181); storage-warnings map + nested `detail` (L207/209); duplicateIds nested paths (L129) |
| `movie-grid.js` | 1 (esc) | category banner `label` in plain template |

**Already correct (no change):** `add-modal` (`raw(_renderGenreOptions())` at use site), `order-panel` (`raw(_renderOrderList())` at use site), `genre-sidebar` (all maps already `raw(…)`), `edit-modal`, `confirm-modal`, `login-modal`, `shortcuts-modal`, `search-bar`, `floating-selection` (static content only).

### Iranian / Series vs Animation/Movie — empirical confirmation

**Owner claim that "Series and Iranian cards look FINE" is half-wrong.**

`P3F-ESC-1` evaluated all four types in one pass (pre-fix output):

| Type | `literalIdBadge` | `literalDiv` | Verdict |
|---|---|---|---|
| Movie | **true** | **true** | **BROKEN** (owner correct) |
| Animation | **true** | **true** | **BROKEN** (owner correct) |
| **Iranian** | **true** | **true** | **BROKEN — owner claim incorrect** |
| Series | false | false | CLEAN (owner correct) |

**Why:** the ID badge lives behind `m.id !== null` in the **shared** non-game `infoSection` branch of `movie-card.js`. Movie, Animation, and Iranian all have string IDs (I2/I6) → the nested `html\`\`<div class="movie-card-id-large">…</div>\`` always runs → double-escaped when `infoSection` itself is built. **Series has `id === null` (I5)** → the ternary yields `''` → no nested badge fragment → no double-escape **for that slot**.

There is no type-specific rendering path that spares Iranian. Owner likely mis-tested Iranian (e.g. glanced at title/year text, which use single-level `html\`\`` and render fine, and missed the ID badge line — or had Iranian fixtures without a visible ID badge for another reason). **Code path is identical for Movie / Animation / Iranian.**

Post-fix typeReport (from the same test): all four types `literalIdBadge=false, literalDiv=false`.

### Requirement → Test / Evidence

| Requirement | Evidence | Status |
|---|---|---|
| Failing Playwright test **before** fix; green **after** | TDD: wrote 4 tests → ran → 4 failed (`tests 11 / pass 5 / fail 4`) → applied `raw()` sweep → 4 passed (`tests 11 / pass 9 / fail 0`) | ✅ |
| Grid: Movie + Animation cards — no literal `<div`, `&amp;quot;`, `&lt;`, `&gt;` in `textContent` | `P3F-ESC-1` (also asserts Iranian + Series for the scope question) | ✅ |
| Diagnostics panel: conflict/invalid/orphan data incl. `Tom & Jerry's "Greatest"` — no literal `<div style>` / double-escaped entities | `P3F-ESC-4`; stub extended with `diagnostics` option returning full issue sample (`ui-stub.js`) | ✅ |
| movie-detail meta + copy-ID actions: no literal nested tags | `P3F-ESC-2` (asserts `#0001` badge is real text, title with quotes/ampersand renders) | ✅ |
| selection-sidebar items: no literal nested tags | `P3F-ESC-3` (asserts real `#0001` + year `2001`) | ✅ |
| Repo-wide sweep `js/components/` both directions | Grep: nested `html\`\`` without `raw` → 0 remaining; `.map(→html\`\`)` feeding an outer `html\`\`` without `raw` → 0; plain-`innerHTML` templates with dynamic `${}` → only `movie-grid` label (fixed with `esc`) | ✅ |
| conflictingMetadata readable if quick | Replaced `JSON.stringify(item)` fallback with Persian sentence: `«title1» و «title2»` built from `item.entries[].title` | ✅ |
| 4 exact verification commands | Raw summary lines below | ✅ |

### Verification (raw output)

```
npm test
ℹ tests 417
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23653.5998

npm run test:ui
▶ P3F-ESC — no literal tags / double-escaped entities in rendered UI
  ✔ P3F-ESC-1: grid cards show no literal <div>/<span> badge markup (report per type) (8.0996ms)
  ✔ P3F-ESC-2: movie-detail meta/actions show no literal nested html (1026.3248ms)
  ✔ P3F-ESC-3: selection sidebar items show no literal nested html (829.6074ms)
  ✔ P3F-ESC-4: diagnostics panel shows no literal <div style> / double-escaped quotes (1380.176ms)
✔ P3F-ESC — no literal tags / double-escaped entities in rendered UI (4117.3324ms)
ℹ tests 11
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 21666.0757

node mimo/repro/repro-backend.js
0 present, 13 fixed, 0 error
exit=0

node mimo/repro/repro-ui.js
2 present, 2 fixed, 0 error
exit=1
```

(FE-01 / FE-02 still PRESENT — expected, those are P4 scope; exit 1 is the repro’s “found present defects” code.)

### Tests: total / passing / todo — before → after

- **Before (P3e `e4d8af8`):** unit **417 / 415 / 2 todo** · ui **7 / 5 / 2 todo**
- **After (P3f):** unit **417 / 415 / 2 todo** · ui **11 / 9 / 2 todo**
- Delta: **+4 UI tests** (P3F-ESC-1..4), **0 failures**, unit unchanged, todo unchanged (2+2).

### Files changed (P3f, 9 files):

- `js/components/movie-card.js` — `raw()` on ID badge + game platform-badges container
- `js/components/movie-detail.js` — `raw()` on copy-ID buttons (both branches) + id/year meta spans
- `js/components/selection-sidebar.js` — `raw()` on platforms/year/id branches
- `js/components/admin-panel.js` — `raw()` on selection ID badge
- `js/components/order-card.js` — import `raw`; `raw()` on id/year/type spans
- `js/components/diagnostics-modal.js` — `raw()` on issue-section map + `renderFn` + overflow + typeCounts map + storage-warnings map/detail + duplicateIds paths; conflictingMetadata → readable Persian sentence (no `JSON.stringify`)
- `js/components/movie-grid.js` — `esc(label)` in category banner (plain template)
- `test/helpers/ui-stub.js` — optional `diagnostics` option to inject full issue sample
- `test/ui/ui.test.js` — new `P3F-ESC` suite (4 tests) with special-char catalog + diagnostics fixture

### Decisions taken / assumptions

- No new D#; no owner overrides.
- Assumption: wrapping with `raw(html\`\`…\`\`)` (rather than restructuring every site to single-level `html\`\``) is the minimal, pattern-consistent fix — matches how P1c2 fixed the outer `.join('')` sites.
- Assumption: Iranian cards being broken is a **correction of the owner’s observation**, not a reason to special-case Iranian — one shared fix covers Movie/Animation/Iranian.
- conflictingMetadata message is intentionally short Persian (two titles + key); deep per-entry path listing deferred if owner wants more detail (P7 polish note not needed — this was quick).

### User-visible behaviour changes

- Diagnostics **تداخل اطلاعات** (and every other issue section) now shows real HTML rows + readable Persian conflict lines instead of literal `<div style=…>` / JSON dumps.
- Movie / Animation / **Iranian** card ID badges render as styled `#0001` chips instead of literal `<div class="movie-card-id-large">…` text.
- Movie detail meta (`#id`, year) and **کپی شناسه** buttons render correctly (were literal `<span>`/`<button>` text when nested).
- Selection sidebar items show real ID/year chips; admin selection list and order detail meta likewise.
- Category banner label with special characters is now escaped (no markup injection via genre/category name).
- **Series unchanged** (already clean — no badge slot to fix).

### Risks / could not verify

- **Admin selection list (`admin-panel`) and order-card meta** were fixed by identical code-pattern sweep but not driven through a dedicated Playwright walk (would need multi-socket WS selection setup). Low residual risk: same `raw(html\`\`)` idiom as the tested sites.
- **Game cards** were not in the Playwright fixture (owner report was about Movie/Animation/Iranian/Series). Game platform-badges container got the same `raw()` fix; Games use `platforms` array not ID badge — residual risk low but not browser-proven this phase.
- Windows local commits only — not pushed.
- FE-01 / FE-02 / ARCH-01 todos untouched (P4 / P8 scope).

### Discovered (out of scope)

- `edit-modal.js` `value="${m.title}"` etc. go through `html\`\`` attribute escaping — already correct (P1c).
- `helpers.escapeHtml` still exists unused (pre-existing P1 note) — left alone.
- P1c2 fixed the *outer* `.join('') → innerHTML` layer; this phase fixed the *inner* nested-`html\`\`` layer that P1c2 left — two layers of the same `raw()` discipline.

### Questions for the owner

1. None blocking. Optional: should `admin-panel` selection list get its own Playwright walk in a later phase, or is pattern-fix + code review enough?
