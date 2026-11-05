# P2 — Durable storage, metadata store, orders

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P2-storage-and-orders.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P1 · **Closes:** DATA-07, DATA-08, DATA-10, DATA-14 · **Branch:** `phase/P2-storage`
**On-disk formats change here → a migration is mandatory (STOP-GATE rule).**

## Goal
Nothing the owner or staff typed can be lost: order history survives crashes and corrupt files, manager-entered ratings/summaries live in their own durable store (not in a rebuildable cache), and every write is atomic.

## Context
- `data/orders.json` and `data/catalog.json` are written with plain `writeFileSync` (a power cut mid-write truncates them). A truncated `orders.json` loads as empty and the next save overwrites the history (reproduced: DATA-08).
- `imdbRating` / `plotSummary` exist only inside `catalog.json`, the cache that is rebuilt from posters (DATA-10).
- Backups are created on every save and pruned to the last 10 by name → a burst of saves erases all useful history.
- `OrderManager` recomputes the next number from the remaining orders and ignores the persisted counter (DATA-07).

## Tasks (test-first; flip the matching `todo` tests)
**A1 — Atomic JSON helper** `backend/storage/atomic-json.js`:
- `writeJsonAtomic(file, data, {pretty})`: write to a temp file in the **same directory**, `fsync`, then `rename` over the target. On Windows retry `EPERM`/`EBUSY`/`EACCES` up to 5× with 40 ms back-off (antivirus/indexer locks).
- `readJsonSafe(file)` → `{status:'ok'|'missing'|'corrupt', data}`. On `corrupt`: **first** rename the bad file to `<name>.corrupt-<timestamp>.json`, then try the newest valid backup; if none, start empty and record a `storageWarning`. **Never overwrite a corrupt file.**

**A2 — Backup policy** `backend/storage/backup.js` → `data/backups/<name>.<yyyymmdd-HHMMSS>.json`. Rules: one at startup if the file changed since its last backup; at most one per 10 minutes while changing; always one immediately before a destructive operation (order delete, restore); retention = newest 30 + one per day for 14 days; never delete the last valid backup. Applies to `orders.json`, `metadata.json`, `auth.json`. **Not** to `catalog.json` (rebuildable).

**A3 — Metadata store** `backend/storage/metadata-store.js` → `data/metadata.json` = `{version:1, items:{ "<key>": {imdbRating, plotSummary, updatedAt} }}` where `<key>` is the indexer key (id string, or normalised series title).
- API: `get(key)`, `set(key, patch)`, `rename(oldKey,newKey)`, `remove(key)`, `orphans(existingKeys)`.
- **Migration on first start:** if `metadata.json` is missing and an old `catalog.json` contains `imdbRating`/`plotSummary`, import them (do not delete or rewrite the old file). Idempotent; log one summary line.
- Indexer: attach metadata on `replaceFromScan`/`addFile`; `catalog.json` must no longer be the source of custom fields. Editing rating/plot writes the metadata store only (no file rename). Deleting `catalog.json` must lose nothing.

**A4 — OrderManager** (keep its public API):
- File becomes `{version:1, nextNumber, orders}`; on load `nextNumber = max(persisted, maxExistingNumber+1)`; **deleting never lowers it** (DATA-07). Old-format files load and are upgraded on first save.
- Whitelist/validate each order's movie snapshot (`uid,id,title,year,type,poster,genres`; string lengths capped; ≤ 500 items).
- Atomic writes, corruption-safe load (A1), backup rule (A2). Return a clear error object to the caller instead of throwing on save failure; the WS handler must forward `orders:error` (Persian message).

**A5 — Indexer persistence:** replace per-change synchronous pretty-printed `saveToDisk` + per-save backup with a **debounced async** save (trailing 500 ms, max wait 5 s) using `writeJsonAtomic` (compact JSON). Expose `flush()`. Fix the comparator (DATA-14): total order = type priority, then key via `localeCompare(…, 'en', {numeric:true})`, nulls impossible because Series keys are strings.

**A6 — Clean shutdown:** `server.stop()` awaits `flush()` of indexer, orders and metadata; `SIGINT`/`SIGTERM` (only when run as main) call it once and exit 0; a second signal forces exit.

**A7 — Storage warnings in diagnostics:** `GET /api/diagnostics` gains `storage:{warnings:[{file,kind,detail,at}]}` (`corrupt-quarantined`, `restored-from-backup`, `migrated-metadata`). The diagnostics modal renders them (escaped; Persian labels).

## Constraints
- No new dependencies. Keep REST/WS shapes (only additive fields).
- Do not touch scanning/parsing/watching (P3) or UI beyond A7.
- Everything must be safe when `data/` does not exist yet or is read-only (clear Persian error at startup, no crash loop).

## Acceptance criteria (automated)
1. Simulated crash: stop the process between temp-write and rename → target file still parses and equals the previous version.
2. DATA-08: truncated `orders.json` → server starts, history restored from newest valid backup (or empty + quarantine file present); the original bytes are still on disk under `*.corrupt-*`; warning visible in diagnostics.
3. DATA-07: delete newest order → restart → next order gets a **new** number; repro script prints FIXED.
4. DATA-10: set rating/plot, delete `catalog.json`, restart → values intact; rename an item's key → metadata follows; migration test with an old-format `catalog.json` fixture.
5. 1,000 rapid saves produce ≤ 40 backup files; the oldest-per-day rule is honoured (fake clock).
6. With the 20k-poster fixture, no single synchronous storage operation on the request path exceeds 100 ms (measure and print).
7. `node mimo/repro/repro-backend.js` → DATA-07 and DATA-08 FIXED; all P0 characterization tests still pass.

## Verify
`npm test`; repro script; manual: create orders, `kill -9`/End Task the server during a burst of saves, restart, confirm history intact.

## Report
PHASE REPORT. Include the migration description (what is read, what is written, how to roll back) in plain language for the owner.
