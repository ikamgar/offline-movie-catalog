## PHASE REPORT — P2 Durable storage, metadata store, orders

Branch / commits: phase/P2-storage-and-orders — 3679606 storage helpers; 131dd67 indexer persistence; 7bf8c28 orders+server wiring; da197e1 diagnostics A7 + durable OrderManager; plus this docs commit

Defects closed: [DATA-07] — evidence: test `DATA-07: order numbers must never be reused`; repro `FIXED DATA-07 deleted order-0002, next created order-0003` · [DATA-08] — evidence: test `quarantines a corrupt orders.json and restores from backup (DATA-08)`; repro `FIXED DATA-08` · [DATA-10] — evidence: tests `migrates imdbRating/plotSummary from an old catalog.json…`, `deleting catalog.json loses nothing…`, `DATA-10: set rating/plot, delete catalog.json…` · [DATA-14] — evidence: tests `DATA-14: catalog sort is a total order…`, `DATA-14: saveToDisk writes movies in compareForPersist order`

Defects partially closed or deferred: none — all four phase IDs closed. Related but out of scope (still open): DATA-01/02/03/09 watcher & PUT merge bugs (P3+), DATA-04/05 scanner key collisions, DATA-06 poster % URI, DATA-11/12/17/18 parser, ARCH-01 version source.

Files changed:
- backend/storage/{atomic-json,backup,metadata-store,warnings}.js (new) — A1/A2/A3 + warning registry
- backend/indexer.js — readJsonSafe load, compareForPersist (DATA-14), debounced scheduleSave/flush, strip custom fields on catalog save, metadata attach (A5/A3)
- backend/services/movie-creator.js — metadataStore ctor arg, set/flush metadata, atomic catalog write that tolerates missing file (A3 + empty-library fix)
- server/orders/order-manager.js — v1 {version,nextNumber,orders}, never-lower counter, snapshot whitelist, atomic+backup, error object (A4/DATA-07)
- server/realtime/ws-server.js — orders:error Persian forwarding on save/delete failure (A4)
- server.js — MetadataStore+backupManager wiring, startup backups, migration load, PUT→metadataStore, stop() flush, SIGINT/SIGTERM double-signal (A3/A6)
- backend/diagnostics.js + js/components/diagnostics-modal.js — storage.warnings in report + escaped Persian modal (A7)
- test/unit/storage-atomic.test.js (new, 19+2 tests), test/unit/metadata-store.test.js (new, 10), test/unit/order-manager.test.js (expanded), test/unit/defects.test.js — flipped DATA-07/08 todos, added DATA-10/14 tests

Tests: 330 / 315 pass / 0 fail / 15 todo — before → after (P1c3 ending was 290/273/17 unit; todo dropped 17→15 as DATA-07/08 flipped active)

Decisions taken: none needing new D# — followed A1–A7 as specified. Assumptions: (1) `indexer.flush()` always writes so empty library creates catalog.json on first start (fixes POST /api/movies ENOENT when scan finds 0 files); (2) DATA-14 antisymmetry asserted with distinct Series keys (equal normalised titles compare 0, which is correct); (3) startupBackup mtime test bumps utimes on Windows due to coarse timestamp resolution; (4) movie-creator `_updateCatalog` creates empty catalog structure if file missing.

User-visible behaviour changes:
- Order numbers are never reused after deleting an order (even across restarts).
- Corrupt `orders.json` is quarantined (`*.corrupt-<ts>.json`), history restored from newest backup; warning appears in diagnostics (Persian).
- `imdbRating`/`plotSummary` now live in `data/metadata.json`; deleting `catalog.json` loses nothing. First start after upgrade migrates them automatically.
- Order saves fail with a Persian WS `orders:error` instead of throwing.
- Diagnostics modal lists storage warnings (quarantine / restore / metadata migration).
- catalog.json is written atomically (compact JSON, debounced 500ms); backups for orders/metadata/auth only (not catalog).

Risks / could not verify: acceptance #6 (20k-poster fixture, 100ms storage budget) not measured — no fixture in repo; manual `kill -9` during save burst not run on Windows (only unit-level atomic/quarantine tests). Perf budget §7 for full cold scan unchanged from prior phases.

Discovered (out of scope): movie-creator still uses its own `catalog_backup_*.json` copies (old path, not wired to BackupManager) — left alone per scope discipline; catalog backup dir may grow unbounded on repeated POSTs (pre-existing).

Questions for the owner: none blocking. Optional follow-up: wire movie-creator backups into BackupManager; measure A6 #6 with a generated 20k fixture in P9.

---

### Migration (plain language for the owner)

**What changes on first start after this update:**

1. **orders.json** — If the old file was a bare array of orders, it is read, upgraded to `{version:1, nextNumber, orders:…}` and written back on the next save. Old format is still readable if you roll the app back; the new format is only written when a save happens.

2. **metadata.json (new file)** — If `data/metadata.json` does not exist yet, the app looks inside the existing `catalog.json` for `imdbRating` / `plotSummary` and copies them into the new file. The old `catalog.json` is **not** deleted or rewritten by this step. After that, ratings/summaries are read and written only from `metadata.json`.

3. **catalog.json** — Still a rebuildable cache of which posters exist. It no longer stores ratings/plots going forward. It is written atomically (temp file → rename) so a crash mid-write cannot truncate it. It is **not** backed up (safe to delete; it rebuilds from `Library/`).

4. **Backups** — `data/backups/` keeps timestamped copies of `orders.json`, `metadata.json`, and `auth.json`: one at startup if the file changed, at most one per 10 minutes while changing, always one right before deleting an order. Keeps newest 30 + one per day for 14 days; never deletes the last valid backup.

5. **Corrupt files** — If a JSON file is unreadable, it is renamed to `<name>.corrupt-<timestamp>.json` (bytes preserved), the newest good backup is loaded if any, otherwise the app starts empty for that file. A warning appears in diagnostics. Nothing is silently overwritten.

**How to roll back:**
- Restore an older git tag/commit of the code. Old code can still read old `orders.json` (array or object). If orders were saved in v1 format, old code may need the file converted back to a plain array (or restore a pre-upgrade backup from `data/backups/`).
- `metadata.json` can be ignored by old code (fields remain duplicated in whatever catalog.json was last written). To undo the metadata split manually: merge `metadata.json` items back into `catalog.json` movie entries by key, then delete `metadata.json`.
- Backups and `*.corrupt-*` files are plain JSON — safe to inspect by hand.

**Questions for the owner:** none. Ready for review.
