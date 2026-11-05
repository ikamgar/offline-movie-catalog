# P4 — Front-end core: store, grid, realtime lifecycle

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P4-frontend-core.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P3 (`catalog:changed`, `movie:*` events, uid routes) · **Closes:** FE-01, FE-02, FE-08 (remaining), part of ARCH-05 prep · **Branch:** `phase/P4-frontend-core`

## Goal
Selecting, searching and scrolling stay instant with 20,000 posters, the browser holds exactly one WebSocket, and nothing re-renders that did not change.

## Context (measured with `mimo/repro/repro-ui.js`)
- Every `store._set()` notifies **all** subscribers. `MovieGrid` rebuilds from scratch (`innerHTML=''`, first 40 cards) and every old `MovieCard` re-renders itself (`_updateRole → render()`); new cards render twice (property setter + `connectedCallback`). Result after scrolling 400 cards: one click → DOM 400→40 cards, scroll 68,784 px → 6,675 px, **480 renders** (FE-01).
- `Store.init()` is re-run by `rescan()` and by the add/edit modals; each run creates a new Worker and calls `syncClient.connect()` without closing the previous connection → 3 rescans = 4 sockets + 4 workers (FE-02).
- After a server restart the customer's restored selection is overwritten by the (empty) server state.

## Tasks (test-first; flip FE-01/FE-02 `todo` tests)

**C1 — Store lifecycle.** Split `init()` into `boot()` (once: theme, preferences, admin-session restore, sync connect) and `loadCatalog()` (idempotent: fetch movies + games, rebuild indexes, apply filters). `rescan()` = `POST /api/rescan` then `loadCatalog()`. Add/edit modals call `loadCatalog()` (or patch the local list from the WS `movie:*` event). `syncClient.connect()` **closes any existing connection first**; a role change reconnects; there is never more than one socket. Handle `catalog:changed` with a 500 ms debounced `loadCatalog()`; apply `movie:updated`/`movie:added` by patching the list by `uid`.

**C2 — Granular notifications.** `_set(partial)` compares each key with `Object.is`, does nothing when nothing changed, batches multiple `_set` calls in one microtask, and notifies only subscribers that declared interest: `subscribe(fn, ['filteredMovies','viewMode'])` (no keys = all, kept for compatibility). Keep the public store API used by components.

**C3 — MovieGrid.** Rebuild only when `filteredMovies` (reference), `viewMode`, `mediaMode` or `isLoading` change. Selection changes must **not** touch the list: maintain a `Map<uid, cardElement>` and toggle only the affected cards' `selected` state (class + `aria-pressed`). Scroll position is preserved on every update that does not change the list; a new list (search/filter/category) intentionally scrolls to top.

**C4 — MovieCard.** Render exactly once per (movie, role) — no double render; no per-card `store.subscribe`; **event delegation** at grid level for select / edit / open-detail (no per-card listeners, no listener accumulation); role/selection changes update the existing DOM (attribute/class/label), not `innerHTML`. Poster fallback via `addEventListener('error')` (P1 already removed inline handlers). Add `content-visibility:auto; contain-intrinsic-size:` to the card CSS and `decoding="async"` on images.

**C5 — Scale to 20k.** Build the 20k stub catalog in `test/ui/perf.test.js` (from `scripts/make-fixture-library.js` data). If the budget below is not met with C3/C4/`content-visibility`, implement **windowing** in the grid (render only rows in the viewport ± 2 screens with spacer elements; keep keyboard focus, selection state and infinite-scroll semantics). Record measured numbers in the report.

**C6 — Panels.** `selection-sidebar`, `admin-panel`, `order-panel` re-render only when their own keys change (`selectedMovies`, `orders`, `role`) and skip work when the rendered list is identical (compare uids). No `animationend`-dependent removal without a timeout fallback.

**C7 — Reconnect / restart resync.** `hello:ack` carries `bootId` (server start id — add it, additive). If a reconnect reveals a **different** `bootId` and the server selection is empty while the local selection is not, the customer client re-sends its local selection instead of adopting the empty state. Otherwise the server state stays authoritative (I9).

**C8 — Listener & subscription hygiene.** Every component that adds `document`/`window` listeners or store subscriptions removes them in `disconnectedCallback`. Add a test that mounts/unmounts the grid 100× and asserts that the store's subscriber count and the number of live listeners return to baseline.

**C9 — Search worker.** Only stop the "one Worker per init" leak here (creating it once in `boot()`); its fate (remove or use) is decided in P5.

## Constraints
- No framework, no build step, no new dependencies; Web Components stay light-DOM.
- Keep component tag names, store method names used elsewhere, and all Persian text. Visual result identical (compare screenshots at 1400×900 and 390×844 before/after).
- Do not implement features (P6) or change CSS beyond the `content-visibility` line.

## Acceptance criteria (automated, Playwright)
1. FE-01: with 400 cards loaded, selecting one card leaves the DOM/scroll unchanged (same card count, `scrollTop` delta < 2 px) and triggers **≤ 2** `MovieCard.render()` calls.
2. FE-02: 3× rescan, 3× add-movie flow, admin login/logout → **exactly one** open WebSocket at every checkpoint; Workers ≤ 1.
3. 20k catalog: first grid paint ≤ 300 ms after data arrives; select-click → next frame ≤ 50 ms; scrolling 10 screens produces no long task > 100 ms; search keystroke → visible results ≤ 50 ms.
4. Restart-resync: customer with 3 selected titles survives a server restart with the selection intact; a second device still gets server state.
5. `catalog:changed` from a test WS server refreshes the grid within 1 s without losing scroll when the visible list is unchanged.
6. Both repro scripts: FE-01, FE-02 **FIXED**; P0/P1 tests still green.

## Verify
`npm test && npm run test:ui`; `node mimo/repro/repro-ui.js`; manual with `scripts/make-fixture-library.js` (20k): scroll to the bottom, select 10 items, search, switch Games, rescan.

## Report
PHASE REPORT with a small table of the measured numbers (before → after) for each acceptance criterion.
