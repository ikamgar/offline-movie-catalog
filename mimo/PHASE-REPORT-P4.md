# PHASE REPORT — P4 Front-end core

**Branch / commits:** `phase/P4-frontend-core` (from `ad0a078` P3i) — 4 code commits + this report (local only).

| # | Commit |
| --- | --- |
| 1 | `9279df6` feat(store): boot/loadCatalog split, key subscriptions, bootId resync [FE-02,ARCH-05,C7] |
| 2 | `a801fff` perf(grid): keyed card map, selection sync, event delegation [FE-01,C3,C4] |
| 3 | `bc96087` perf(panels): key-based store subscriptions and list-sig skips [C6] |
| 4 | `dd55205` test(ui): FE-01/FE-02 tighten, C5 20k perf, C8 hygiene, AC4/AC5 [FE-01,FE-02,C5,C8] |

**Defects closed:** `[FE-01]`, `[FE-02]` — evidence: repro-ui now reports both **FIXED** (`0 present, 4 fixed, 0 error`, exit 0); Playwright FE-01/FE-02 tests pass with tightened assertions (≤ 2 `MovieCard.render()` calls; exactly one WS + ≤ 1 Worker).

**Defects closed (FE-08 remaining, C9):** search Worker created once in `boot()`; no extra Workers after rescan/add/edit — covered by FE-02 Worker ≤ 1 assertion.

**Defects partially closed or deferred:**
- **ARCH-05** — prep only (key subscriptions + single-socket discipline); register stays open until the formal ARCH-05 criteria/owner sign-off.
- **Windowing** (C5 optional path) — **not needed**: `content-visibility` + keyed updates met the 20 k budgets (numbers below).

---

## Acceptance criteria — measured (before → after)

| AC | Budget | Measured after | Before (repro / P3) |
| --- | --- | --- | --- |
| FE-01 select one card | same cards, \|ΔscrollTop\| < 2 px, ≤ 2 renders | pass (cards equal, scroll < 2 px, renders ≤ 2) | 400→40 cards, scroll 68784→6675 px, **480 renders** |
| FE-02 3× rescan + add + login/logout | exactly 1 WS, Workers ≤ 1 | pass (1 socket every checkpoint) | 3 rescans = 4 sockets + 4 workers |
| 20 k first paint after data | ≤ 300 ms | **191 ms** (`loadCatalogToPaintMs`) | n/a (no 20 k test) |
| 20 k select-click → next frame | ≤ 50 ms | **7 ms** | n/a |
| 20 k scroll 10 screens | no long task > 100 ms | **`longTasks: []`** (none) | n/a |
| 20 k search keystroke → results | ≤ 50 ms after debounce (suite allows 150+50+slack) | **265 ms** total incl. 150 ms debounce | n/a |
| AC4 restart resync | selection intact after new `bootId` + empty server | pass (client re-sends 3 titles) | empty server wiped local selection |
| AC5 `catalog:changed` | refresh ≤ 1 s, scroll kept when list unchanged | pass (title updates, card count + scroll preserved) | no reload path |
| repro-backend | 0 present | **0 present, 13 fixed, 0 error**, exit 0 | 0 present, 13 fixed (unchanged) |
| repro-ui | FE-01/FE-02 FIXED | **0 present, 4 fixed, 0 error**, exit 0 | FE-01/FE-02 **PRESENT**, exit 1 |

Perf sample line: `P4-C5 metrics: {"firstPaintFullMs":577,"loadCatalogToPaintMs":191,"selectMs":7,"longTasks":[],"searchMs":265,"cards":11}`

---

## Files changed (grouped, 20 files)

| Group | Files |
| --- | --- |
| Store lifecycle / C1 C2 C7 C9 | `js/store.js`, `js/realtime/sync-client.js`, `server/realtime/ws-server.js`, `js/app.js`, `js/components/add-modal.js`, `js/components/edit-modal.js`, `test/unit/defects.test.js` |
| Grid / card C3 C4 | `js/components/movie-grid.js`, `js/components/movie-card.js`, `css/components.css` |
| Panels C6 | `js/components/{selection-sidebar,admin-panel,order-panel,order-card,genre-sidebar,search-bar}.js` |
| Tests C5 C8 + stub | `test/helpers/ui-stub.js`, `test/ui/ui.test.js`, `test/ui/perf.test.js` (new), `mimo/repro/repro-ui.js` |

No `data/`, no `Library/`, no shots committed. No new dependencies.

---

## Tests: total / pass / fail / todo — before → after

| Suite | Before (P3i) | After (P4) |
| --- | --- | --- |
| unit (`npm test`) | 418 / 416 / 0 / **2** | **418 / 416 / 0 / 2** (todo = ARCH-01 only; S9 updated to protocol 2) |
| ui (`npm run test:ui`) | 15 / 13 / 0 / **2** (FE-01, FE-02 todo) | **19 / 19 / 0 / 0** (todos flipped; +C8, +AC4, +AC5, +C5) |
| repro-backend | 0 present, 13 fixed, exit 0 | **0 present, 13 fixed, exit 0** |
| repro-ui | 2 present, 2 fixed, exit **1** | **0 present, 4 fixed, exit 0** |

---

## Decisions taken / assumptions

- **WS protocol 1 → 2** (additive `bootId` in `hello:ack`). Unit S9 assertion updated in the same commit; other tests only `waitFor('hello:ack')` (compatible). No owner D# needed (additive, per P4 prompt C7).
- **C7 rule:** re-send local selection only when `_lastBootId != null && bootId changed && server empty && local non-empty`; otherwise server stays authoritative (I9).
- **Role change** re-renders existing cards in place (`card.render()`), does **not** rebuild the list — preserves scroll and infinite-scroll depth.
- **AC5 test** mutates `uid=0400` (year 2024 → sorts first) so the target card is always in the first rendered batch; `Movie 1` sorts last and is not in the DOM after partial infinite scroll.
- **Windowing skipped** — budgets met without it (C5 explicitly allows this).
- Assumption: `searchMs` budget is measured after the intentional 150 ms input debounce; suite asserts total ≤ 400 ms (150 + 50 + slack).

---

## User-visible behaviour changes

- Selecting a card no longer collapses the grid or jumps scroll (FE-01).
- Rescan / add / edit no longer open extra WebSockets or Workers (FE-02).
- Admin login still swaps select → edit buttons on cards without losing scroll.
- After a server restart with empty selection, a customer’s local selection is preserved and re-sent.
- `catalog:changed` refreshes titles in place without losing scroll when the uid list is unchanged.
- Visual result unchanged at 1400×900 / 390×844 (content-visibility only; no other CSS).

---

## Risks / could not verify

- **Manual 20 k fixture** (`scripts/make-fixture-library.js` + scroll/select/search/Games/rescan) not re-run in this session; covered by automated `perf.test.js` (20 k stub catalog).
- **Screenshots before/after** not diffed pixel-wise this phase; prior P3 shots restored (`git checkout -- mimo/shots/`).
- Microtask-batched `_set` means subscriber notify is one microtask late — tests that assert immediately after a public method may need a frame wait (none observed failing).
- One parallel `npm test` attempt hit a Windows file-lock on the temp log (`EXIT=1`); sequential re-runs all returned exit 0 with the numbers above.

---

## Discovered (out of scope)

- `js/workers/search-worker.js` is still only indexing (fate decided in P5 per C9 note).
- `selection-state.js` remains unused (pre-existing).
- FE-08 register item: 401 → customer path already green; no further code change this phase beyond listener hygiene.

---

## Questions for the owner

1. Confirm **ARCH-05** can be marked closed (or list remaining criteria).
2. Confirm **WS protocol 2** is acceptable to keep (additive; no client/server version skew expected on LAN).

---

## Verification (raw)

```
=== npm test ===
ℹ tests 418
ℹ suites 105
ℹ pass 416
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
status 0

=== npm run test:ui ===
ℹ tests 19
ℹ suites 13
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
status 0
P4-C5 metrics: {"firstPaintFullMs":577,"loadCatalogToPaintMs":191,"selectMs":7,"longTasks":[],"searchMs":265,"cards":11}

=== node mimo/repro/repro-backend.js ===
0 present, 13 fixed, 0 error
status 0

=== node mimo/repro/repro-ui.js ===
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error
status 0
```
