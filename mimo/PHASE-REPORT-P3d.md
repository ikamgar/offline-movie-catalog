## PHASE REPORT — P3d Creator rewrite (B8)

**Branch / commits:** `phase/P3d-creator` (on top of `d4c0da8` P3c report)

| Commit | Summary |
|---|---|
| `b33ed5c` | `feat(creator): indexer-only catalog write, key rollback, tmpdir staging [B8 DATA-09 DATA-13]` |
| *(report)* | `docs(P3d): phase report — B8 creator, DATA-09/13 closed` |

**Date:** 2026-09-23 · **Scope:** B8 only (B9 diagnostics + B10 rescan → P3e).

### Defects closed / affected

| ID | Status in P3d | Evidence |
|---|---|---|
| **DATA-09** | **Closed — todo flipped** | `{ todo: 'DATA-09' }` removed. Two real tests now drive `MovieCreator` with injected write failure: (1) failed Series creation leaves existing Series intact + no orphan `New Show.jpg`; (2) multi-genre partial write → `idx.count === 0`, both genre folders clean, no `Library/.tmp`. Rollback is `removeMovieByKey` (never filter by bare `id`/`null`). |
| **DATA-13** | **Closed — fixed + covered by new regular test** | No pre-existing todo (register-only CODE defect). Creator stages under `os.tmpdir()` (`movie-upload-*`); new test asserts `Library/.tmp` and `upload_*` never appear under the library root. |

**Todos flipped this phase:** **DATA-09** (unit todo count **3 → 2**: remaining ARCH-01 ×2).

### Requirement → Test / Evidence (B8)

| Requirement (B8 / P3 prompt) | Evidence | Status |
|---|---|---|
| **Indexer is the only catalog writer — delete private `catalog.json` read/modify/write** | `_rollbackCatalogUpdate` / `_updateCatalog` gone (grep: 0 hits). Catalog mutated only via `addFile` / `addMovieToIndex` / `removeMovieByKey` + `indexer.flush()` | ✅ |
| **Roll back by key (fixes Series wipe, DATA-09)** | New `CatalogIndexer.removeMovieByKey(key)` deletes `_movieMap` entry **and** every `_fileIndex` entry with that key. Creator pushes `removeMovieByKey(movieKey)` after index touch. Tests: failed Series create → 2 Series still present; multi-genre fail → index empty | ✅ |
| **Temp uploads → `os.tmpdir()`, never inside `Library/` (DATA-13)** | `fs.mkdtempSync(path.join(os.tmpdir(), 'movie-upload-'))`; staging write there; dropped after genre copies land; rollback removes temp dir. Test asserts no `Library/.tmp` / `upload_*` | ✅ |
| **Use `id-generator` + `safe-path`** | `_generateNextId` → `nextId(indexer, type)`; `_validateId` → `validateId` + `assertIdFree`; `_buildFilename` uses `safeSegment`; `_getTargetFolders` uses `resolveInside` / `resolveTypeFolder` | ✅ |
| **Write every genre copy with `flag:'wx'` (never silently overwrite)** | Staging + each `targetPaths[i]` written with `{ flag: 'wx' }` via injectable `this._writeFile`. Duplicate filename pre-check still runs first (Persian 409-style error before any write) | ✅ |
| **All-or-nothing with rollback** | Single `rollbackActions` LIFO: backup file, temp dir, each written genre copy, metadata store entry, `removeMovieByKey`. Any throw in the try block reverses them; index mutation only after all disk writes succeed | ✅ |
| **`watcher.expect(target paths)`** | Before genre copies: `this._watcher.expect(targetPaths)` when watcher present (server.js wires it as 6th ctor arg) | ✅ |
| **Broadcast `movie:added` via `toPublicMovie` (SEC-08)** | `wsServer.broadcastMovieAdded(CatalogIndexer.toPublicMovie(fromIndex \|\| newMovie))` — no `absolutePosterPath` leak | ✅ |
| **Server wires watcher into creator** | `server.js:208` → `new MovieCreator(LIBRARY_PATH, CATALOG_PATH, indexer, wsServer, metadataStore, watcher)` | ✅ |
| **Close DATA-09; cover DATA-13** | Todo flipped + 2 new defect tests; DATA-13 regular test in `movie-creator.test.js` | ✅ |

### Design notes / judgment calls

1. **Rollback never runs on a half-indexed state for disk failures** — all genre files are written first; only then `scanFile` + `addFile` per copy. If a write throws, `indexTouched` is still false so no `removeMovieByKey` is needed (but it is pushed as soon as index is touched, covering metadata/flush failures after that point).
2. **Staging is write-then-copy semantics without a second buffer copy** — the same `posterBuffer` is written to tmpdir first (validates `wx` + full buffer), then written again to each genre path. Tmpdir file is deleted once all copies succeed. Slightly more I/O than needed; keeps a single injectable write path for tests.
3. **`options.writeFileSync` injectable** — production default `fs.writeFileSync`. Tests inject a counting wrapper that passes non-`lib` paths through and throws on the Nth library write (failure-injection convention).
4. **`indexer.flush()` is synchronous on the create path** — manager POST is not a hot path (A5 prefers `scheduleSave` on watcher hot paths); characterization tests read `catalog.json` immediately after `createMovie` resolves.
5. **Backup is best-effort and rolled back on failure** — `_createBackup` never blocks creation; on failure the backup file created for this attempt is removed (it would otherwise be a misleading “successful” catalog snapshot).
6. **`_buildFilename` still local to creator** — mirrors editor’s I4 template (ARCH-03 flavour, noted in P3c as discovered). Not shared this phase (scope: B8 only).
7. **`removeMovieFromIndex` left in place** — no longer called by creator; may still be used elsewhere / kept for API stability. Not deleted (no drive-by cleanup).

### Files changed (P3d B8, 5 files):
- **backend/indexer.js** — new `removeMovieByKey(key)` (rollback by map key, drops matching `_fileIndex` entries)
- **backend/services/movie-creator.js** — full B8 rewrite: indexer-only writes, tmpdir staging, `wx` genre copies, LIFO rollback (files + metadata + key), `watcher.expect`, `broadcastMovieAdded(toPublicMovie)`, injectable `writeFileSync`
- **server.js** — pass `watcher` as 6th `MovieCreator` constructor argument
- **test/unit/defects.test.js** — **DATA-09 todo removed**; 2 new tests (failed Series create; multi-genre partial write rollback + no `Library/.tmp`)
- **test/unit/movie-creator.test.js** — characterization flush-before-read; **DATA-13 test** (no temp under `Library/`); rollback test asserts no `.tmp` left

### Tests: total / passing / todo — before → after
- **Before (P3c `d4c0da8`):** unit **408 / 405 / 3 todo** · ui **7 / 5 / 2 todo**
- **After (P3d):** unit **410 / 408 / 2 todo** · ui **7 / 5 / 2 todo**
- Delta: **+2 unit tests**, **+3 passing** (2 new + 1 former todo now counted as pass), **0 failures**, todo **3 → 2** (DATA-09 flipped; remaining = ARCH-01 ×2).

### Decisions taken:
- No new D#; no owner overrides this phase.
- Assumption: synchronous `indexer.flush()` on create is acceptable (manager path, not scanner hot path).
- Assumption: failure-injection via `options.writeFileSync` is the right seam (matches editor’s injectable `renameSync` pattern from B7).

### User-visible behaviour changes:
- **Creating a movie/series that fails mid-write no longer corrupts the catalog** — previously a failed Series create could wipe every Series from `catalog.json` (DATA-09); now existing titles survive and no orphan poster is left.
- **Failed multi-genre create leaves zero partial copies** — no half-written Action/Drama files after a disk error.
- **Temp upload files never appear under `Library/`** — no more `Library/.tmp` flicker in Explorer / scanner / watcher (DATA-13).
- **Create never silently overwrites an existing poster** — `wx` flag + duplicate filename pre-check.
- **Connected managers receive a canonical `movie:added`** (public-safe fields only) after a successful create.
- Server-initiated creates suppress their own watcher events via `expect()` — no double-index flash.

### Risks / could not verify:
- **Manual smoke** on real Library (add movie via UI while server runs) not run — temp fixtures only; owner deferred consolidated smoke to after B8–B10.
- **`wx` + case-insensitive Windows FS** — duplicate pre-check uses `existsSync` (true on win32); a race between check and write would still surface as `EEXIST` from `wx` and roll back (acceptable).
- **Rollback only on caught exceptions** — a hard kill mid-create (not a thrown error) can still leave genre copies without index entries (or vice versa if killed after `addFile` before `flush`); next rescan/watcher reconcile heals disk→index. Same sequential-atomicity note as B7.
- Windows local commits only — not pushed.
- B9–B10 not touched (DATA-15, rescan still open → P3e).

### Discovered (out of scope):
- `movie-creator._buildFilename` still duplicates the editor’s I4 filename template (ARCH-03); candidate to extract in P7.
- `CatalogIndexer.removeMovieFromIndex(id)` is now unused by creator but still exported — left alone (no drive-by delete).
- `repro-backend.js` constructs `new MovieCreator(lib, catalogPath, idx, null)` (4 args) — still valid (watcher/options default to null); no DATA-09/DATA-13 repro entry exists (covered by unit tests instead).
- Startup log still prints `[INDEXER] 0 scan conflicts: 0 cross-type id(s), 7 metadata clash(es)` on the sample Library — diagnostics surface for B9.

### Questions for the owner:
1. Ready for **P3e (B9 diagnostics DATA-15 + B10 rescan)** next — or pause for the consolidated manual smoke first?
2. Confirm leaving `removeMovieFromIndex` in place (unused by B8) is OK vs deleting it as dead code — I left it to avoid scope creep.

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 410
ℹ pass 408
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23567.0858
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 17507.4266
```

**3) `node mimo/repro/repro-backend.js`**
```
0 present, 13 fixed, 0 error
```
(exit 0)

**4) `node mimo/repro/repro-ui.js`**
```
PRESENT  FE-01  selecting one card must not rebuild the grid or lose scroll position
PRESENT  FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
2 present, 2 fixed, 0 error
```
(exit 1 — FE-01/FE-02 expected remaining → later phase)

**Boot check:** `PORT=3999 node server.js` — starts clean (`Step 7: Initializing Movie Creator…`, `Total movies: 35`, indexer conflict summary only; no new console errors).
