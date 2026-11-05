## PHASE REPORT — P2b Evidence hardening (P2 acceptance walk-through)

**Branch / commits:** `phase/P2-storage-and-orders` (on top of `90b27d5` P2 report)
**Date:** 2026-09-22

### Task 0 — CSP-SAN scope (confirmed)
Commit `72a4602` `test(P2-task0): extend CSP-SAN to admin login, diagnostics, add-movie [CSP-SAN]` — `test/helpers/ui-stub.js` (+41), `test/ui/ui.test.js` (+53). CSP-SAN now walks customer **and** admin (login → diagnostics modal → add-movie). Covered by `npm run test:ui` below.

### Defects closed: [DATA-07, DATA-08, DATA-10, DATA-14]
No new functional fixes in P2b — evidence only. Closure evidence restated in the AC table.

### Defects partially closed or deferred:
- **AC6 partial:** two request-path ops exceed 100 ms on the 20k fixture — both are already-registered **ARCH-04** / **DATA-15** (diagnostics `existsSync` loop; full-catalog `saveToDisk` still called synchronously from `PUT`/`POST /api/rescan`). Deferred P3/P8 per register; not fixed here (scope discipline).
- Todo tests unchanged: DATA-01…06, 09, 11, 12, 17, 18, ARCH-01 → P3/P7+.

### Requirement → Test / Evidence Table

| Acceptance (P2 prompt) | Evidence | Status |
|---|---|---|
| **Task 0 — CSP-SAN admin walkthrough** | Commit `72a4602`; `test/ui/ui.test.js` CSP-SAN suite (admin login, `#diagnosticsBtn`, add-movie); UI run: pass 5 / todo 2 / fail 0 | ✅ PASS |
| **AC1 — Simulated crash: stop between temp-write and rename → target still parses and equals previous version** | `storage-atomic.test.js` → `AC1: crash between temp-write and rename leaves target at previous version` (writes previous version, plants `.tmp` with next version as if rename never ran, asserts `readJsonSafe` status `ok` and deep-equals previous; later successful write still wins) | ✅ PASS |
| **AC2 — DATA-08: truncated `orders.json` → quarantine + restore + bytes on disk + warning in diagnostics** | Restore/bytes: `order-manager.test.js` → `quarantines a corrupt orders.json and restores from backup (DATA-08)`; `storage-atomic.test.js` → `readJsonSafe quarantines…`, `…restores from newest valid backup…`, `…skips invalid backups…`; **diagnostics warning (new):** `diagnostics.test.js` → `AC2/A7: storage warnings from a corrupt orders.json appear in diagnostics.storage.warnings` | ✅ PASS |
| **AC3 — DATA-07: delete newest order → restart → new number; repro FIXED** | `defects.test.js` → `DATA-07: order numbers must never be reused` (delete → `new OrderManager(f)` → next id ≠ deleted id); `order-manager.test.js` → `persists {version, nextNumber, orders} format (A4)`, legacy upgrade tests; **repro raw:** `FIXED    DATA-07  deleted order numbers must never be reused (even after restart)` / `deleted order-0002, next created order-0003` | ✅ PASS |
| **AC4 — DATA-10: delete `catalog.json` keeps values; rename follows; migration fixture; orphans()** | `defects.test.js` → `DATA-10: set rating/plot, delete catalog.json, restart → values intact` (includes `rename('0001','0099')`); `metadata-store.test.js` → `migrates imdbRating/plotSummary from an old catalog.json on first start (DATA-10)`, `deleting catalog.json loses nothing…`, `does not migrate when metadata.json already exists`; **orphans:** `metadata-store.test.js` → `orphans lists keys not in the existing key set` (asserts `['series:gone']` for key missing from catalog set) | ✅ PASS |
| **AC5 — 1,000 rapid saves → ≤ 40 backups; oldest-per-day (fake clock)** | `storage-atomic.test.js` → `1,000 rapid saves produce ≤ 40 backup files (acceptance 5)` (`{force:true}` × 1000, fake clock +1s/save, `≤ 40`); `retention keeps newest 30 + one per day for 14 days (fake clock)` (20 days × 6/day forced; asserts all last-14 UTC days retained + newest-30 exist) | ✅ PASS |
| **AC6 — 20k fixture: no single sync storage op on request path > 100 ms (measure and print)** | Fixture: `node scripts/make-fixture-library.js --out %TEMP%\p2b-fixture-20k --movies 15000 --animation 2000 --iranian 1500 --series 800 --games 300` → **19,600 files**. Measured (`p2b-ac6-measure.js`, `LIBRARY_PATH` = fixture): see numbers below | ⚠️ **PARTIAL** |
| **AC7 — `repro-backend.js` DATA-07+08 FIXED; P0 characterization still pass** | **Raw:** `10 present, 3 fixed, 0 error` with `FIXED DATA-07`, `FIXED DATA-08`, `FIXED SEC-03`; `npm test` fail **0** | ✅ PASS |

### AC6 raw measurement (20k fixture)

```
   2309.38 ms  scanLibrary (startup baseline)           [not request path]
      1.60 ms  scanGames (startup baseline)             [not request path]
     31.83 ms  indexer.replaceFromScan 20k              [rescan body]
    627.47 ms  indexer.saveToDisk / writeJsonAtomic 20k catalog  *** OVER 100ms ***
           catalog.json size: 7387.0 KB
     85.86 ms  readJsonSafe(catalog.json) load          [startup]
      6.74 ms  OrderManager.createOrder → writeJsonAtomic(orders)
      1.31 ms  backup force (pre-delete destructive op)
      5.40 ms  metadata.set + flush (rating/plot edit)
     62.44 ms  metadata.flush all 19.6k keys (worst-case)
     19.72 ms  JSON.stringify movies in memory (17020 items)
    899.95 ms  diagnostics.runFullReport (existsSync per movie)  *** OVER 100ms ***
      0.17 ms  indexer.scheduleSave (debounce, returns immediately)
```

**Request-path verdict:**
| Op | ms | ≤100? | Notes |
|---|---|---|---|
| OrderManager.createOrder | 6.74 | yes | WS `orders:save` |
| backup force | 1.31 | yes | pre-delete |
| metadata set+flush | 5.40 | yes | PUT rating/plot |
| metadata bulk flush 19.6k | 62.44 | yes | worst-case |
| JSON.stringify movies (GET body) | 19.72 | yes | in-memory |
| indexer.scheduleSave | 0.17 | yes | watcher path (A5) |
| **indexer.saveToDisk 20k** | **627.47** | **no** | still sync from `PUT /api/movies/:id` and `POST /api/rescan` → **ARCH-04** |
| **diagnostics.runFullReport** | **899.95** | **no** | `existsSync` per movie → **DATA-15 / ARCH-04** |

Cold scan 2.31 s ≤ 10 s budget. P2-introduced storage helpers (atomic write for orders/metadata, backups, scheduleSave) all ≤ 63 ms.

### Files changed (P2b only):
- **test/unit/storage-atomic.test.js**: +AC1 crash-between-temp-and-rename test
- **test/unit/diagnostics.test.js**: +AC2/A7 storage-warnings-in-diagnostics test; imports `readJsonSafe` / warnings registry
- **mimo/PHASE-REPORT-P2b.md**: this report

### Tests: total / passing / todo
- **Before (P2 report `90b27d5`):** unit 330 / 315 / 15 · ui 7 / 5 / 2
- **After (P2b):** unit **332 / 317 / 15** · ui **7 / 5 / 2**
- Delta: +2 unit tests (AC1, AC2-diagnostics), +2 passing, 0 new failures

### Decisions taken:
- None needing D#. AC6 overruns left unfixed: already ARCH-04/DATA-15 (P3/P8); fixing them would exceed P2 scope (>15-file or non-storage work).
- AC1 simulated by planting a fully-written `.tmp` sibling without rename (deterministic; no process kill). Matches `writeJsonAtomic`’s same-directory temp contract.

### Assumptions made:
- AC6 “request path” = work that can run inside an HTTP/WS handler; startup scan/load reported as baseline only.
- AC6 “storage operation” includes in-request `existsSync` loops (diagnostics) — if owner intends only durable JSON writes, P2 helpers alone all pass.
- Orphans coverage is unit-level (`MetadataStore.orphans`); wiring into diagnostics `orphanMetadata` is P3 B9.

### Windows mtime note (`startupBackup` + `fs.utimesSync`)
**Test-only workaround**, not a product workaround. `startupBackup` decides “file changed” by comparing source `mtimeMs` to the mtime recorded at the previous startup check (or the newest backup file). The test does `writeFileSync` immediately after the prior check; on Windows the write can land in the same mtime tick, so `stat.mtimeMs <= lastBacked` and the manager would correctly report “unchanged.” `fs.utimesSync(srcFile, +2s, +2s)` forces a visible mtime advance so the third assertion means “changed → backup.” **Real Windows behavior:** NTFS mtimes are fine-grained enough that order/metadata saves separated by human or even sub-second time still update mtime; risk of a missed startup backup is only two mutations inside one timestamp quantum — next startup after any later change still backs up, and in-run backups (10-min / force) are independent of this check. **Owner impact:** none in practice; no code change required.

### User-visible behaviour changes:
- None in P2b (tests + report only).

### Risks / could not verify:
- AC6 not fully green: ARCH-04/DATA-15 remain open by design.
- Manual `kill -9` during save burst still not run on Windows (unit-level AC1 + quarantine tests only).
- UI suite todo 2 (pre-existing) — not P2.

### Discovered (out of scope):
- `POST /api/rescan` blocks ~2.3 s scan + 0.63 s `indexer.flush()` on 20k — ARCH-04/P3.
- `readJsonSafe(catalog)` 86 ms at 7.4 MB — under 100 ms but grows with library; compact JSON already applied (A5).
- movie-creator still uses its own `catalog_backup_*.json` (not BackupManager) — pre-existing, noted in P2 report.

### Questions for the owner:
1. **AC6 wording:** should “storage operation” mean only durable JSON writes (P2 helpers → all pass), or any sync FS work in a handler (diagnostics/rescan → fail until P3)? Report uses the broader reading (PARTIAL).
2. Ready for **P3** (catalog pipeline / DATA-01…06 / ARCH-04) or another phase first?

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 332
ℹ pass 317
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 15
ℹ duration_ms 13576.7874
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 16726.2167
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
