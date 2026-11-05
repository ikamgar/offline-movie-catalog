## PHASE REPORT — P3b Watcher rewrite (B6)

**Branch / commits:** `phase/P3b-watcher` (on top of `c089b02` P3a report)

| Commit | Summary |
|---|---|
| *(B6 implementation)* | `feat(watcher): order-independent directory reconcile, expect(), catalog:changed [B6 DATA-02]` |

**Date:** 2026-09-23 · **Scope:** B6 only (B7–B10 separate sessions).

### Boundary confirmation (P3a watcher change)

P3a commit `5990ab8` changed **only** the body of `_processEvent`'s file-exists branch: `parseFilename` + `classifyFromPath` → shared `scanFile`. It did **not** touch debouncing (still per-file 500 ms at that time), directory watching, reconciliation, or `onChange` shape. Nothing to undo; B6 is a clean rewrite on top.

### Defects closed / affected

| ID | Status in P3b | Evidence |
|---|---|---|
| **DATA-02** | **Already closed in P3a** (todo already removed); B6 completes the remaining register items: deleted/renamed directories, `onChange` → WS notify | Register: "deleted/renamed *directories* are not handled; `onChange` never notifies WebSocket clients" — both fixed in B6. Repro `FIXED DATA-02`. New tests: new-dir, deleted-dir, `catalog:changed` WS. |
| **DATA-01** | **Watcher side fixed; todo stays open for B7** | Repro now `FIXED DATA-01` (`{"title":"Heat Renamed","year":1995,"imdb":8.3,"plot":"A heist story"}`) — reconcile does adds before removes so remove→add never drops the movie; metadata reattached from `MetadataStore`. **Todo not flipped:** the defect register also covers PUT’s single-file rename assumption (B7 `movie-editor` owns multi-copy rename + `watcher.expect`). Per instructions DATA-01/03 stay open for B7. |
| **DATA-03** | **Unchanged — still `{ todo }` for B7** | Repro still `PRESENT` (`["0099:Action","0002:Drama"]`). Watcher cannot fix PUT renaming only one genre copy. |
| **DATA-09** | Untouched | B8. |

**Todos flipped this phase:** none (DATA-01/03 explicitly held for B7; DATA-02 was already flipped in P3a).

### Task → Evidence Table (B6)

| Requirement (B6 / P3 prompt) | Evidence | Status |
|---|---|---|
| **Any fs event → mark directory dirty → debounce 500 ms → `reconcile(dir)`** | `backend/watcher.js`: `_handleEvent` → `_markDirty(dir)` → 500 ms timer → `_reconcile(dir)` | ✅ |
| **List poster files under dir (recursive if new) with `scanFile`; diff against `_fileIndex` under prefix; adds/updates/removals idempotent** | `_reconcileTree`: `walkDir` → `scanFile` each → Phase 1 adds/updates → Phase 2 removals by prefix | ✅ |
| **Movie removed only when no file with its key remains** | Reuses `indexer.removeFile` (checks other `_fileIndex` entries with same key); test *delete one copy … keeps the movie* still green | ✅ |
| **Custom fields survive remove→add (DATA-01 watcher side)** | Adds applied **before** removes in one reconcile; `addFile` reattaches from metadata store and now refreshes filename-derived `title`/`year` from disk (I1); AC2 test asserts rating/plot/year/title intact in **both** event orders | ✅ |
| **New directories: start watching + scan** | `_handleEvent` isDir → `_markDirty(fullPath)` + parent; `_reconcile` → `_watchRecursive` + `_reconcileTree`. Test: *new directory is watched and its files are indexed* | ✅ |
| **Deleted/renamed directories: drop watchers + remove entries by prefix** | `_handleEvent` missing path that was a watched dir → `_dropWatchersUnder` + dirty that path; `_reconcileDeletedDir` removes `_fileIndex` entries under prefix. Test: *deleting a whole directory removes its files; movie removed only when no copy remains* | ✅ |
| **Games changes → games pipeline** | `_isGamesPath` → `_reconcileGames` (`scanGames` full diff into `_gamesMap`, never movie index). Test: *Games changes go to the games pipeline, never the movie index* | ✅ |
| **`watcher.expect(paths, ttlMs=3000)`** | `expect()` stores absolute path → expiry; `_isExpected` checked before dirtying (also prunes expired). Test: *expect(paths) suppresses server-initiated events until TTL* | ✅ |
| **`onChange({added,updated,removed})` → scheduleSave + broadcast `catalog:changed`** | `_emit` calls `onChange({added,updated,removed})`; `server.js` `handleFileChange(diff)` → `indexer.scheduleSave()` + `wsServer.broadcastCatalogChanged(diff)`; `ws-server.js` `broadcastCatalogChanged` → `{type:'catalog:changed', payload:{added,updated,removed}}`. Client `sync-client.js` `default:` ignores unknown types. Tests: onChange shape; WS *hot-added poster broadcasts catalog:changed* | ✅ |
| **Class API kept** | `constructor(libraryPath, indexer, onChange)`, `start()`, `stop()` unchanged; `expect` is additive | ✅ |
| **Optional `LIBRARY_POLL_SEC` (default off)** | Parsed in `start()`; `setInterval` → `_reconcile(root)` when > 0; `unref`’d | ✅ |
| **No new dependencies** | Only `fs`/`path` + existing `scanner`/`indexer` | ✅ |

### Requirement → Test / Evidence (P3 ACs in B6 scope)

| Acceptance | Evidence | Status |
|---|---|---|
| **AC2 — Order independence:** feed watcher `{remove-old, add-new}` **and** `{add-new, remove-old}` for the same rename → identical final state, metadata intact | `watcher.test.js` → **`AC2: {remove-old, add-new} and {add-new, remove-old} → identical final state, metadata intact`** — runs both orders end-to-end with `MetadataStore`, `deepEqual(snapshotA, snapshotB)`, asserts rating/plot/year/title and disk paths in both | ✅ |
| **AC1 partial — DATA-02 directory handling + WS notify** (remainder of DATA-02 after P3a) | New-dir, deleted-dir, `catalog:changed` tests; repro still `FIXED DATA-02` | ✅ |
| **AC6-ish — hot-add reaches a WS client as `catalog:changed`** (P3 AC6 full wording also needs `GET /api/movies` within 2 s — covered by watcher index update + existing API) | `ws.test.js` → `hot-added poster broadcasts catalog:changed {added,updated,removed}` — writes `0005- Fresh 2021.jpg`, waits for message, asserts `payload.added >= 1` | ✅ |
| **AC1 full list (DATA-01/03 todos)** | Not claimed — held for B7 | ⏸ deferred |

### Design notes / judgment calls

1. **Directory-level debounce (not per-file)** is what makes AC2 pass: both event orders collapse into one reconcile of the **final** disk state before the 500 ms timer fires. A deleted *file* only dirties its **parent**; dirtying the missing file path itself as if it were a directory caused a second reconcile that raced the parent and broke order-independence (caught by the first AC2 run — fixed in `_handleEvent`).
2. **Adds before removes** within one `_reconcileTree` pass: same-key rename keeps the movie object (and in-memory fields) while `removeFile` sees the new path still present.
3. **`indexer.addFile` now refreshes `title`/`year` from the scan entry** when the key already exists — filesystem is source of truth for filename-derived fields (I1); without this, add-then-remove left the old title while remove-then-add picked up the new one (the other AC2 failure mode).
4. **`onChange` signature change** `(type, data)` → `({added,updated,removed})` is required by B6; only `server.handleFileChange` consumed the old shape (tests used `() => {}` or count-only callbacks). Server updated in the same commit.
5. **`walkDir` now exported** from `scanner.js` so the watcher reuses the same walker (skip rules, image filter) instead of a second implementation.
6. **DATA-01 repro is FIXED but todo kept open** — explicit instruction: B7 owns PUT multi-copy rename; the watcher half is done.
7. **`LIBRARY_POLL_SEC`** implemented as a thin full-root `_reconcile` on an interval; not covered by an automated test (env-gated, default off) — noted under risks.
8. **Games reconcile** does a full `scanGames` diff (games catalogs are small by design); no incremental platform-prefix walk — simpler and order-free.

### Files changed (P3b, 7 files):
- **backend/watcher.js** — full B6 rewrite: directory dirty + 500 ms debounce, `_reconcile` / `_reconcileTree` / `_reconcileDeletedDir` / `_reconcileGames`, `expect()`, `onChange({added,updated,removed})`, optional `LIBRARY_POLL_SEC`
- **backend/scanner.js** — export `walkDir`
- **backend/indexer.js** — `addFile`: refresh `title`/`year`/`poster` from scan when key exists (I1 / AC2)
- **server.js** — `handleFileChange(diff)` → `scheduleSave` + `broadcastCatalogChanged`
- **server/realtime/ws-server.js** — `broadcastCatalogChanged(diff)` → `catalog:changed`
- **test/unit/watcher.test.js** — AC2 both-orders test + new-dir, deleted-dir, expect, Games, onChange-shape; characterization year assertion updated (DATA-02 already fixed)
- **test/unit/ws.test.js** — `catalog:changed` end-to-end broadcast test

### Tests: total / passing / todo — before → after
- **Before (P3a `c089b02`):** unit **389 / 384 / 5 todo** · ui **7 / 5 / 2 todo**
- **After (P3b):** unit **395 / 390 / 5 todo** · ui **7 / 5 / 2 todo**
- Delta: **+6 unit tests**, **+6 passing**, **0 new failures**, todo count unchanged (DATA-01/03/09, ARCH-01, FE-01/02).

### Decisions taken:
- No new D# needed. D2/D3/D7 from P3a unchanged.
- Assumption: full `scanGames` on any Games dirty path is acceptable (not a perf budget item for P3).
- Assumption: `catalog:changed` payload is `{added,updated,removed}` (counts only), matching the prompt’s `{added:n,updated:n,removed:n}`.

### User-visible behaviour changes:
- Hot file changes (add/rename/delete, including whole folders) are picked up **regardless of event order** within ~500 ms; staff no longer see ghosts after Explorer renames.
- Deleting one genre copy keeps the movie (already true) and no longer risks a full drop when the other copy is re-written in the same burst.
- Connected browsers receive `catalog:changed` on hot catalog changes (ignored harmlessly until P4 wires the UI).
- Series/Movie posters dropped into a **newly created** folder appear without a manual rescan.
- Games dropped/removed under `Library/Games/**` update the games list only — never the movie grid.
- `LIBRARY_POLL_SEC=<n>` (env, optional) adds an n-second safety-net reconcile for network drives.

### Risks / could not verify:
- **DATA-01/03 todos still open** — real `PUT /api/movies/:id` still renames only `absolutePosterPath` (one copy); B7 must land before flipping those tests. Repro DATA-01 is FIXED (watcher half); DATA-03 still PRESENT.
- **Manual smoke** on a real Windows Library (Explorer rename while server runs, delete a genre folder, drop a series poster) not run — automated tests use temp fixtures only.
- **`LIBRARY_POLL_SEC`** path not covered by a test.
- Windows local commits only — not pushed.
- AC6 full wording (20 k fixture: cold scan ≤ 10 s, rescan stall ≤ 200 ms, diagnostics ≤ 300 ms) is **B10/B9** — not claimed here.

### Discovered (out of scope):
- `_reconcileGames` always rescans the full Games tree on any Games event — fine for typical sizes; if Games ever grows huge, a platform-prefix walk would be the next step (not registered).
- `sync-client.js` already has `default: // Unknown message type - silently ignore` — no FE change needed for `catalog:changed` (P4 will add a handler).
- Pre-existing: PUT still uses `newId-title year.ext` for all types (I4 mismatch) — B7.

### Questions for the owner:
1. **DATA-01:** repro now shows FIXED from the watcher side alone. Confirm we still hold the **todo open until B7** (current behaviour per your instruction), or should P3b flip it and treat remaining PUT multi-copy work as DATA-03-only?
2. Ready for **P3c (B7 edit service)** next?

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 395
ℹ pass 390
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 5
ℹ duration_ms 23317.8152
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 16941.6586
```

**3) `node mimo/repro/repro-backend.js`**
```
1 present, 12 fixed, 0 error
```
(includes `FIXED DATA-01`, `FIXED DATA-02`; `PRESENT DATA-03` → B7)

**4) `node mimo/repro/repro-ui.js`**
```
2 present, 2 fixed, 0 error
```
