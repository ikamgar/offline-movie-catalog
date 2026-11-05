## PHASE REPORT — P2c Non-blocking catalog persistence (A5 route wiring)

**Branch / commits:** `phase/P2-storage-and-orders` (on top of `724c820` P2b report)
**Date:** 2026-09-22

### Defects closed: [ARCH-04 (partial)]
- **ARCH-04 (request-path portion):** `PUT /api/movies/:id` and `POST /api/rescan` no longer call `indexer.flush()` (full sync catalog rewrite) on the response path — both now `indexer.scheduleSave()` (500 ms trailing debounce; `stop()` still `flush()`es, so A6 durability is unchanged). Catalog is a rebuildable cache (invariant I1); rating/plot persist via `metadataStore.flush()` which stays sync (A3).

### Defects partially closed or deferred:
- **ARCH-04 rest:** startup `readdirSync` scan, diagnostics `existsSync` loop — P3/P8 (P3 prompt claims ARCH-04 partial).
- **DATA-15:** diagnostics still ~959 ms on the 20k fixture — **left as-is per owner instruction** (scoped to P3 B9).
- Todo tests unchanged: DATA-01…06, 09, 11, 12, 17, 18, ARCH-01 → P3+.

### Scope note (P2c directives)
- Games rescan (`POST /api/games/rescan`) change was applied then **reverted** — only `PUT` and `/api/rescan` were in scope (games rescan never had a pre-P2 `flush()`).
- Startup `indexer.flush()` (server.js:189) and `stop()` flush (server.js:824) intentionally left synchronous.
- Diagnostics 889–2403 ms number left untouched (owner: do not touch — P3/DATA-15).

### Requirement → Test / Evidence Table

| Requirement (P2c directive) | Evidence | Status |
|---|---|---|
| **1 — Route PUT/rescan catalog persistence through scheduleSave (non-blocking); response must not wait on full catalog.json rewrite** | `server.js` `POST /api/rescan` (~L522) and `PUT /api/movies/:id` (~L662): `indexer.flush()` → `indexer.scheduleSave()` with A5 comments; `metadataStore.flush()` still sync | ✅ PASS |
| **1a — Test: PUT response not delayed by full catalog write** | `http.test.js` → `PUT /api/movies/:id does not call saveToDisk synchronously (debounced via scheduleSave)` — spies `saveToDisk`=0 at response, elapsed <500 ms, ≥1 call after 700 ms sleep | ✅ PASS |
| **1b — Test: rescan response not delayed** | `http.test.js` → `POST /api/rescan does not call saveToDisk synchronously` — same spy + timing pattern | ✅ PASS |
| **2 — A6: stop()/SIGINT/SIGTERM still flush before exit; only mid-crash loses ~hundreds of ms of cache staleness (self-heals on rescan)** | `server.js` stop path unchanged (`flush()`); signals wiring unchanged. **Test:** `http.test.js` → `stop() flushes a pending scheduleSave before exit (A6)` — PUT queues debounced write (saveCalls=0 precondition), `await s.server.stop()` → saveCalls≥1. Signal handlers not re-tested (same `stop()` path) | ✅ PASS |
| **3 — Re-run AC6 on same 20k fixture; update saveToDisk numbers; leave diagnostics as-is** | Fixture `%TEMP%\p2b-fixture-20k` (19,600 files); `p2b-ac6-measure.js` with `LIBRARY_PATH`=fixture — numbers below; diagnostics number untouched in product code | ✅ PASS (updated below) |
| **4 — Test asserting PUT not blocked by full write** | Covered by 1a (spy `saveToDisk` not called synchronously + response < debounce window) | ✅ PASS |
| **5 — Four verification commands with raw summaries** | Raw lines pasted verbatim at the end of this report | ✅ PASS |

### AC6 raw measurement — P2c re-run (same 20k fixture)

```
   2774.77 ms  scanLibrary (startup baseline)            [not request path]
      32.53 ms  indexer.replaceFromScan 17020 movies     [rescan body]
     465.42 ms  indexer.saveToDisk / writeJsonAtomic 20k *** now off the request path (debounce timer / stop only) ***
            catalog.json size: 7564328 bytes (7387 KB)
      80.72 ms  readJsonSafe(catalog.json) load          [startup]
      10.20 ms  OrderManager.createOrder → writeJsonAtomic(orders)
       1.80 ms  backup force (pre-delete destructive op)
       6.18 ms  metadata.set + flush (rating/plot edit)  [PUT — still sync, A3]
      54.70 ms  metadata.flush all 19.6k keys (worst-case)
      14.84 ms  JSON.stringify movies (GET /api/movies body)
     958.65 ms  diagnostics.runFullReport                *** STILL OVER 100ms — DATA-15, left as-is per owner ***
       0.12 ms  indexer.scheduleSave (debounce, returns immediately)  ← what PUT/rescan now call
```

**Request-path verdict after P2c:**
| Op | ms | ≤100? | Notes |
|---|---|---|---|
| OrderManager.createOrder | 10.20 | yes | WS `orders:save` |
| backup force | 1.80 | yes | pre-delete |
| metadata set+flush | 6.18 | yes | PUT rating/plot (A3, intentionally sync) |
| metadata bulk flush 19.6k | 54.70 | yes | worst-case |
| JSON.stringify movies (GET body) | 14.84 | yes | in-memory |
| indexer.scheduleSave | 0.12 | yes | **PUT/rescan now take this path (was flush)** |
| **indexer.saveToDisk 20k** | **465.42** | n/a | **no longer on any request path** — fires on 500 ms debounce / `stop()`; direct measurement only |
| **diagnostics.runFullReport** | **958.65** | **no** | `existsSync` per movie → **DATA-15 / ARCH-04**, untouched per owner |

P2b baseline for comparison: `saveToDisk` 627.47 ms → **465.42 ms** (same op, run-to-run variance on same fixture); `scheduleSave` 0.17 → **0.12 ms**. Cold/startup scan 2.77 s ≤ 10 s budget.

### Files changed (P2c only):
- **server.js**: `POST /api/rescan` `indexer.flush()` → `indexer.scheduleSave()` (+comment); `PUT /api/movies/:id` `indexer.flush()` → `indexer.scheduleSave()` (+comment). Games rescan edit reverted.
- **test/unit/http.test.js**: +113 lines — new describe `A5 non-blocking catalog persistence` (3 tests: PUT spy, rescan spy, stop()-flush A6).
- **mimo/PHASE-REPORT-P2c.md**: this report.

### Tests: total / passing / todo
- **Before (P2b `724c820`):** unit 332 / 317 / 15 · ui 7 / 5 / 2
- **After (P2c):** unit **335 / 320 / 15** · ui **7 / 5 / 2**
- Delta: +3 unit tests (A5/A6 trio), +3 passing, 0 new failures
- Isolated: `node --test test/unit/http.test.js` → tests 14 / pass 14 / fail 0 / todo 0

### Decisions taken:
- None needing D#. Followed owner directives exactly: diagnostics number left as-is; only PUT + `/api/rescan` re-routed; A6 flush confirmed not removed.
- `metadataStore.flush()` in PUT stays synchronous (A3 durability for manager-entered data); only the rebuildable `catalog.json` write is debounced (I1).

### Assumptions made:
- AC6 “request path” = work that can run inside an HTTP/WS handler; `saveToDisk` measured directly is reported as “off path” after this change (timer/stop only).
- `stop()` flush test stands in for SIGINT/SIGTERM — signal handlers call the same `stop()`; not re-tested at process level.
- Debounce window test uses 500 ms trailing + 700 ms wait (matches `scheduleSave` contract).

### User-visible behaviour changes:
- None visible in the UI. Server responses for movie edit/rescan return without waiting for the catalog cache rewrite; the cache lands ≤500 ms later (or immediately on shutdown). A hard crash within that window leaves a stale-but-valid `catalog.json` that self-heals on next rescan/restart — manager-entered rating/plot are unaffected (metadata store, sync flush).

### Risks / could not verify:
- Crash inside the 500 ms debounce window loses only the rebuildable catalog cache (not orders/metadata) — accepted per I1 and owner’s A6 framing (“only mid-crash loses ~hundreds of ms of cache staleness”).
- Signal-path (`SIGINT`/`SIGTERM` → `stop()`) not re-verified at process level in this pass (same `stop()` the test drives).
- Diagnostics still far over 100 ms on 20k — known, deferred P3 (DATA-15/B9).
- UI suite todo 2 (pre-existing) — not P2.

### Discovered (out of scope):
- Rescan still blocks ~2.8 s on the scan walk itself (ARCH-04 scanner portion → P3/P8); only the post-scan catalog write is now debounced.
- `readJsonSafe(catalog)` 80.72 ms at 7.4 MB — under 100 ms but grows with library size.

### Questions for the owner:
1. Ready to **commit P2c** (2 commits: fix+tests, then report) and move to **P3** (catalog pipeline / DATA-01…06 / DATA-15 / ARCH-04 rest)?
2. Re-raise only if wanted: AC6 “storage operation” wording (P2b Q1) — under the broad reading, only diagnostics remains over budget after this change.

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 335
ℹ pass 320
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 15
ℹ duration_ms 15419.2635
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 15867.3349
```

**3) `node mimo/repro/repro-backend.js`**
```
10 present, 3 fixed, 0 error
```
(includes `FIXED DATA-07`, `FIXED DATA-08`, `FIXED SEC-03`)

**4) `node mimo/repro/repro-ui.js`**
```
2 present, 2 fixed, 0 error
```
