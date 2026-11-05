# PHASE REPORT — P6d orders workflow (E5)

Branch: `phase/P6d-orders` (from `074de1a` = P6c head) → Commits: 3 build + this docs commit (+ 11 shots)

Scope per `mimo/prompts/P6-manager-features.md`: **task E5 only.** E6 (D1 documentation) and P6-B were **not started** — stopping here for review as instructed.

## Commits

| # | Commit | Content |
|---|---|---|
| 1 | `a1c6c76` | `test(p6d): red - E5 order fields, status/info WS, soft delete undo, UI workflow [P6d-E5]` — TDD red first (3 files, +560: `order-manager.test.js` +11 (file: 29), `ws.test.js` +5 (file: 11), new `test/ui/orders-workflow.test.js` (9)) |
| 2 | `40005d6` | `feat(p6d): order workflow backend - status/edit/undo soft-delete, protocol 3 [P6d-E5]` (7 files, +338 −9; AGENTS §5 WS docs gain the three orders messages + `protocol: 3`) |
| 3 | `bdf729f` | `feat(p6d): orders workflow UI - status chips/filters, info edit, print, CSV, undo toast, selection badge [P6d-E5]` (9 files, +689 −36; new `js/utils/csv.js`) |
| 4 | (this) | `docs(p6d): phase report + orders workflow screenshots [P6d-E5]` — report, `mimo/repro/p6d-shots.js` + 11 PNGs + manifest |

Every commit ≤ 15 files (max 9).

## Decisions taken (no owner STOP-GATE was needed)

| Decision | Rationale |
|---|---|
| **WS protocol bump 2 → 3** with the three new messages; `defects.test.js` S9 assertions (:1702/:1730) and the `ui-stub` fake `hello:ack` updated in the **same commit** (AGENTS rule 5) | Message set changed; the client never sends/reads `protocol`, LAN runs one version, so no client change was needed |
| **Soft delete = park in memory**: disk write + forced P2 backup happen *at delete*; the order is held in an in-memory map for `undoWindowMs` (default 10000 ms, constructor option) and purged from memory afterwards | Keeps the P2 backup rule intact, keeps `nextNumber` never-lowered semantics, and satisfies "purged afterwards"; `dispose()` cancels purge timers at shutdown (keeps parked entries) |
| **Legacy auto-migration on load**: unknown/absent status → `done`, missing name/note → `''`, missing `updatedAt` → `createdAt`, clamp to 200 | Prompt-prescribed defaults (additive fields); not an owner decision, not a new dependency, not an on-disk format change (the file shape stays `{version,nextNumber,orders}`) |
| **`showToast(msg, type, options)`** extended with `{duration, action:{label,onClick}}` — backward compatible (all existing 2-arg calls unchanged) | Needed for the 10 s undo toast |
| **Order delete loses the confirm dialog** (E5 mandates soft delete + undo toast). Save-order / clear-selection confirms are untouched | Per prompt |
| Persian status labels: **جدید / در حال آماده‌سازی / انجام شده**; toast «سفارش با موفقیت حذف شد» + action «بازگردانی» | New UI strings are Persian (rule) |
| CSV `date` column carries the raw ISO `createdAt`; status column carries the **raw enum** (`new/preparing/done`, required by AC5 checks) | Fixed header contract, Excel-safe |

Assumptions: badge counts the **shared** customer selection (D1 default — P6-B not done); date filter compares the **local** calendar day of `createdAt` (fixture times 10:00Z are safe for UTC−10…+13).

## Requirement → test evidence (E5)

| Prompt requirement | Change | Evidence (test name :file line) |
|---|---|---|
| Fields additive: `customerName?`, `note?` ≤ 200, `status ∈ new\|preparing\|done` (legacy default `done`), `updatedAt` | `order-manager.js`: `createOrder` defaults (`status:'new'`, empty fields, `updatedAt=createdAt`); `_normalizeOrder()` on load | unit `P6d E5: new orders get workflow defaults…` (order-manager.test.js:236), `P6d E5: legacy orders load with defaults… and persist on next save` (:245), `P6d E5: an invalid status in a stored file loads as done` (:266) |
| name/note ≤ 200 | server `clampString(…, MAX_INFO_LEN=200)` + rollback on save failure; inputs `maxlength=200` | unit `P6d E5: updateOrderInfo clamps name/note to 200 chars, bumps updatedAt, persists` (:308); UI `detail: name/note inputs are clamped to 200 chars and sent via orders:edit` |
| WS `orders:update-status {orderId,status}` → broadcast `orders:update` | `ws-server.js` `_handleOrderStatus` → `_broadcastToManagers`; route gated on `role==='manager'`; invalid → Persian `orders:error`, **no** broadcast | ws `status change reaches a second manager client (AC5)` (ws.test.js:243), `invalid status is refused with a Persian orders:error and broadcasts nothing` (:261); unit `…updateOrderStatus persists the new status and bumps updatedAt` (:279), `…rejects unknown statuses…changes nothing` (:291), `…unknown id returns false` (:303) |
| Status chips + filter (status/date) | `order-panel.js`: chip per card, `#orderStatusFilter`, `#orderDateFilter` (local-day match), re-render signature now includes status/updatedAt/name/note | UI `order cards show a Persian status chip; the status filter narrows the list`, `the date filter narrows to one local day` |
| Edit name/note | `orders:edit` message → `_handleOrderEdit` → `updateOrderInfo`; UI detail form + `#orderInfoSaveBtn` | ws `orders:edit persists customerName/note and broadcasts (E5 fields)` (:278); UI detail edit test (prefill `علی` / `ساعت ۶ عصر` asserted) |
| Print view (A5, RTL, big IDs, date, order number) | `store.printOrder()` popup: `<html lang="fa" dir="rtl">`, header «سفارش N» + fa-IR date, `.order-print-id` 26 px, DOM-built rows (no interpolation → no XSS), auto `window.print()` | UI `print: the popup is RTL, headed with order number/date, and lists big IDs (AC5)` (dir/lang/`سفارش 1`/`0001`/no `undefined`/fontSize 26 ≥ 24 asserted); shot `admin-dark-desktop-order-print.png` |
| CSV export UTF-8 **with BOM**; columns order,date,status,name,id,title,year,type | new `js/utils/csv.js` `buildOrdersCsv()`; `store.exportOrderCsv()` downloads `order-<number>.csv` | UI `CSV builder: UTF-8 BOM + exact header + Persian data (AC5)` (`0xFEFF`, exact header, 1+4 rows, `علی` ×2) and `detail: the CSV button downloads order-N.csv starting with the BOM` (**bytes EF BB BF** on disk, `order-1.csv`, content carries `Heat`) |
| Deleting an order is soft with a 10 s undo toast (purged afterwards; P2 backup rule) | `deleteOrder` parks the order (backup already forced by the pre-existing A4 path); `undoDeleteOrder` re-inserts the same id/number; store toast with action for 10 s; confirm dialog removed; `dispose()` on shutdown | unit `…soft delete removes the order everywhere but undo restores the same id and number` (:338), `…undo after the window returns null; dispose() cancels the purge timer` (:362), `…undo of an order that was never deleted returns null` (:380); ws `orders:undo restores the deleted order with the same number (AC5)` (:298), `orders:undo for an expired or unknown id answers with orders:error` (:322); UI `delete skips the confirm dialog, shows the 10 s undo toast, and undo calls orders:undo`; regression: `forces a backup before deleting an order (A4 / destructive op)` (:181) still green |
| Manager header shows a badge with the live customer-selection count | `app.js` `#selectionBadge` in `#headerActions`, subscribed to `adminSelection` | UI `manager header badge shows the live customer selection count` (count 2 visible → 0 hidden) |
| **AC5** (automated): status reaches a 2nd manager; CSV opens with Persian (BOM bytes); undo restores order **and number** | — | ws.test.js:243 (two sockets) + UI download test head = `EF BB BF` + order-manager:338 / ws:298 (same id **and** `number`) |

## Raw verification outputs

`npm test` → **EXIT=0**
```
ℹ tests 622
ℹ suites 141
ℹ pass 620
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 25256.5658
```
(todo = the pre-existing ARCH-01 pair, listed under node:test's `✖ failing tests:` section as `# TODO`.)

`npm run test:ui` (final, after commit `bdf729f`) → **EXIT=0**
```
ℹ tests 69
ℹ suites 24
ℹ pass 69
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 52596.2407
```
One intermediate full-UI run in this phase failed on the known flake only:
```
AssertionError [ERR_ASSERTION]: first grid paint after data must be ≤ 300ms, got 390ms: {"firstPaintFullMs":866,"loadCatalogToPaintMs":390,"selectMs...
UI_EXIT=1   (tests 69 / pass 68 / fail 1)
```
`node --test test/ui/perf.test.js` standalone → **EXIT=0**
```
✔ P4-C5 — 20k performance budgets (2739.4317ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

`node mimo/repro/repro-backend.js` → **EXIT=0**
```
FIXED    DATA-01  title edit must keep imdbRating/plotSummary/year after the watcher settles
FIXED    DATA-03  editing a multi-genre movie must rename all copies (movie-editor), no ghost after rescan

0 present, 13 fixed, 0 error
```

`node mimo/repro/repro-ui.js` → **EXIT=0**
```
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  A Series whose title contains an apostrophe must still get the placeholder when its poster 404s

0 present, 4 fixed, 0 error
```

Boot smoke (fresh clone behaviour) — isolated `DATA_DIR`/`LIBRARY_PATH` under `os temp` (the P6c cache-write incident is **not** repeated), empty `Library`:
```
ALIVE_AFTER_6S=True
  [ORDERS] No existing orders file found, starting fresh
  Path: C:\Users\Ali\AppData\Local\Temp\p6d-smoke\Library
  Found 0 image files, parsed 0 movies
  Ready. Add movies to Library/ and refresh the browser.
err.log: (empty)
repo data/ mtimes: auth.json 9/22, catalog.json 10/1 03:08, metadata.json 10/1 23:49, orders.json 9/28  (now 10/2 05:34 — untouched)
```

## Files changed (grouped)

- **Backend**: `server/orders/order-manager.js` (E5 methods, load normalisation, park/undo/dispose) · `server/realtime/ws-server.js` (protocol 3, 3 routes, 3 handlers) · `server.js` (`stop()` → `orderManager.dispose()`)
- **Frontend**: `js/store.js` (toast options, undo toast, 5 order methods, 2 callbacks) · `js/realtime/sync-client.js` (3 senders, `orders:restored`/`orders:error`, 2 registrations) · `js/components/order-panel.js` (filters, chips, direct delete) · `js/components/order-card.js` (chips/fields/print/CSV controls) · `js/app.js` (header badge) · `js/utils/csv.js` *(new)* · `css/main.css` (badge + `.toast-action`) · `css/admin.css` (filters, card chip, detail sections)
- **Tests**: `test/unit/order-manager.test.js` (+11) · `test/unit/ws.test.js` (+5; helper no longer double-delivers to waiters) · `test/unit/defects.test.js` (S9 protocol 2→3) · `test/helpers/ui-stub.js` (fake ack protocol 3) · `test/ui/orders-workflow.test.js` *(new, 9; 3 fixes: `m.default`, real `_onOrderDeletedCallback`, toast scoped via `:has(.toast-action)`)*
- **Docs/shots**: `AGENTS.md` §5 · this report · `mimo/repro/p6d-shots.js` *(new)* · `mimo/shots/p6d/` (11 PNG + `manifest.txt`, *new*)

## Tests: total / passing / todo — before → after

| Suite | Before (`074de1a`) | After |
|---|---|---|
| unit (`npm test`) | 606 / 604 / 0 / **2** (EXIT=0) | **622 / 620 / 0 / 2** (EXIT=0) — P6d +16 |
| UI (`npm run test:ui`) | 60 / 59 / 1 (EXIT=1, P4-C5) | **69 / 69 / 0** (EXIT=0) — P6d +9 |

## User-visible behaviour changes

- Every order card shows a coloured **Persian status chip** (جدید / در حال آماده‌سازی / انجام شده) and the panel gains a **status select + date filter** row («سفارشی با این فیلتر یافت نشد» when nothing matches).
- Order detail overlay: **status chips** (one click sends `orders:update-status`), **name/note fields** (max 200) + «ذخیره اطلاعات», «چاپ سفارش» (RTL print popup, big IDs) and «خروجی CSV» (`order-<number>.csv` with BOM).
- **Delete no longer asks for confirmation**: one click → «سفارش با موفقیت حذف شد» toast with a **«بازگردانی»** action for 10 s; undo brings back the same order number. Server-side undo failure/expiry surfaces as a red toast; a restored order toasts «سفارش N بازگردانی شد».
- Manager header: red **badge** with the live customer-selection count (hidden at 0; inside `#headerActions`, so customers never see it).
- Internal: WS protocol 2 → 3 (client does not read it; no customer-facing change).

## Risks / could not verify

- **P4-C5 flake** reappeared once in-suite (390 ms vs 300 ms budget; same history as P6c: in-suite 326/368/430/618); standalone runs pass (213/231/244/273 ms).
- The real **paper print dialog** (`window.print()`) is not asserted — only the popup DOM/typography is (screenshot + test).
- **Undo across restart**: a server restart inside the 10 s window drops the parked copy (the order itself is already deleted from disk + P2 backup, so nothing is lost — undo is simply no longer offered). Accepted as the practical reading of "purged afterwards".
- AC5's "second manager" is proven with **two WS manager sockets** in `ws.test.js`, not two full browser sessions (the ui-stub has no order backend).
- Native `type=date` input renders its placeholder in the **browser locale** (`mm/dd/yyyy` on this machine) — cosmetic only.
- `orders:error` → red toast is a small additive UX choice (E5 does not spell it out).

## Discovered (out of scope)

- The legacy shots `mimo/shots/p3g/order-view-{desktop,mobile}.png` and `mimo/shots/p3h/{confirm-modal-open.png,metrics.txt}` now differ (the detail overlay gained controls; UI runs regenerate them) — **restored, not refreshed**; recommend a shots refresh pass in a later docs commit.
- `AGENTS.md` §3 repo map still lists no `backend/services/*` (carried from P6c).
- `DATA-07` (nextNumber reuse after restart) and `DATA-08` (non-atomic order writes) remain open — E5 does not touch either.
- `FE-06` (selection print shows `undefined` for games) remains open — `printOrder()` is a separate, guarded implementation for orders only; `printSelectedIds()` untouched.
- Test-infra bugs fixed while going green: `CollectingClient._onMessage` delivered a message to a pending waiter **and** kept it queued (a second `waitFor` of the same type resolved with the stale first message); the UI test's seam used the wrong private field name (`_onOrdersDeletedCallback` vs `_onOrderDeletedCallback`) and the wrong import (`m.syncClient` vs `m.default`).

## Questions for the owner

1. Proceed to **E6** (D1 documentation in README) next, or stop here for review?
2. Refresh the legacy P3G/P3H screenshots now that the order detail overlay changed, or leave them to a final docs sweep?
3. Optional scope: make the **card's status chip clickable** to cycle status from the list (faster triage without opening the detail), or keep status changes detail-only as now?

**STOP — E6/P6-B not started.**
