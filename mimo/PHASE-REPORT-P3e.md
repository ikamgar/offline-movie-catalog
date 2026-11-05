## PHASE REPORT — P3e Diagnostics + Rescan (B9, B10)

**Branch / commits:** `phase/P3e-diagnostics-rescan` (on top of `fb4e254` P3d report)

| Commit | Summary |
|---|---|
| `731db90` | `feat(pipeline): B9 diagnostics + B10 async rescan, file-index no existsSync [B9 B10 DATA-15]` |
| *(report)* | `docs(P3e): phase report — B9/B10 closed, carry-overs 1+2` |

**Date:** 2026-09-23 · **Scope:** carry-overs 1–2 first, then B9 + B10 (last P3 session).

### Defects closed / affected

| ID | Status in P3e | Evidence |
|---|---|---|
| **DATA-15** | **Closed** | No matching `todo` test (register-only CODE defect). All four blind spots populated: `invalidFilenames` (reasons), `conflictingMetadata`, `unknownTypes`, `orphanMetadata`; games included (`totalGames`, `typeCounts.Game`, `gamePlatforms`); **no per-movie `existsSync`** (file-index membership only in both `diagnostics.js` and `indexer.runDiagnostics`); report cached 30 s, invalidated on `catalog:changed` / rescan. Cold diagnostics on 20k: **958.65 ms → 80–126 ms** (target ≤ 300 ms). |
| **B10** | **Closed** | `POST /api/rescan` is async (movies **and** games in one call), responds with `count` + `gamesCount` + `invalid` + `invalidFiles`; event-loop lag probe during cold scan: **≤ 62 ms** (budget ≤ 200 ms). `POST /api/games/rescan` also async (response shape unchanged). |
| **ARCH-04** | **Partially improved** | Request-path `existsSync` loop in diagnostics removed (was the DATA-15 hot path). Other ARCH-04 items (startup `readdirSync`, pretty-printed sync JSON writes) still open → P8. |

**Todos flipped this phase:** none (DATA-15 was never a `todo` test). Unit todo count unchanged **2** (remaining: ARCH-01 ×2).

### Carry-overs (executed first)

1. **`movie-creator.js` flush → scheduleSave** — `this._indexer.flush()` → `this._indexer.scheduleSave()` with A5/P2c comment (`catalog.json` is rebuildable, invariant I1). Covered by new test `A5: createMovie does not call saveToDisk synchronously (debounced via scheduleSave)` in `movie-creator.test.js`.
2. **Report note (P5 dead code)** — `CatalogIndexer.removeMovieFromIndex(id)` is no longer called by the creator (B8 uses `removeMovieByKey`). **P5 one-line cleanup: delete `removeMovieFromIndex` if nothing else references it.** Left in place this phase (no drive-by delete).

### Requirement → Test / Evidence (B9, B10)

| Requirement (B9 / B10 / P3 prompt) | Evidence | Status |
|---|---|---|
| **B9 — populate `invalidFilenames` (with reasons)** | `diagnostics.js` maps `indexer.getLastInvalid()` → `{file, reason}`. Set at startup + every rescan via `indexer.setLastInvalid(scan.invalid)`. Test: *invalidFilenames from last scan…* asserts `broken-name` present with reason | ✅ |
| **B9 — populate `duplicateIds` (with paths), `conflictingMetadata`, `unknownTypes`** | Merge from `indexer.runDiagnostics()` / `_scanConflicts` (B4 shape preserved: both file paths, never dropped) | ✅ |
| **B9 — populate `orphanMetadata`** | New optional 3rd ctor arg `metadataStore`; `metadataStore.orphans(uidSet)` → `{key}` list. Test: `series:gone` orphan reported, `0001` not | ✅ |
| **B9 — include games** | `summary.totalGames`, `typeCounts.Game`, `stats.gamePlatforms` from `indexer.getGames()`. Test: FIFA 24 counted | ✅ |
| **B9 — no per-movie `existsSync`** | `diagnostics.js` + `indexer.runDiagnostics()`: missingPosters = `absolutePosterPath ∈ _fileIndex`; brokenLinks = `_fileIndex.entry.key ∈ _movieMap`. Grep: zero `fs.existsSync` in either hot loop. Test: *missing posters come from file index membership* (delete/restore fileIndex entry, no disk touch) | ✅ |
| **B9 — cache 30 s, invalidated by `catalog:changed`** | `CACHE_TTL_MS = 30000`; `invalidate()` called in `server.js` `handleFileChange` + both rescan routes. Test: *report is cached for 30s and invalidate() forces rebuild* (identity equal → not equal after invalidate) | ✅ |
| **B9 — diagnostics modal shows new sections (escaped)** | `diagnostics-modal.js` uses `html\`\`` auto-escape throughout; new sections: duplicateIds (+paths), duplicateSeriesTitles, conflictingMetadata, invalidFilenames, unknownTypes, orphanMetadata, missingPosters, missingYears, emptyGenres, brokenLinks; empty-state extended with `\|\| []` guards; games stat card | ✅ |
| **B10 — `POST /api/rescan` rescans movies AND games in one call** | `server.js` L536–565: `scanLibraryAsync` → `replaceFromScan` → `setLastInvalid` → `scanGamesAsync` → `processGameResults` → `scheduleSave` → `diagnostics.invalidate`. Response additive: `count`, `gamesCount`, `invalid`, `invalidFiles`, `scanStats`, `gameStats`, `lastUpdated` | ✅ |
| **B10 — non-blocking (async walker / chunked `setImmediate`)** | `scanner.js`: `yieldTick()` = promisified `setImmediate`; `walkDirAsync` yields between dirs; `scanLibraryAsync` yields every 64 files; `scanGamesAsync` yields between platforms. Lag probe test + AC6 measure both under 200 ms | ✅ |
| **B10 — responds with counts + invalid count** | Tests: *returns counts + invalid* and *picks up an invalid filename into invalid count* | ✅ |
| **AC6 — 20k fixture: cold scan ≤ 10 s, lag ≤ 200 ms, diagnostics ≤ 300 ms** | `mimo/repro/p3e-ac6-measure.js` — all three PASS (raw numbers below) | ✅ |
| **Carry-over 1 — creator `flush` → `scheduleSave`** | `movie-creator.js:168` + new A5 test (0 `saveToDisk` calls during `createMovie`, ≥1 after 700 ms) | ✅ |
| **Carry-over 2 — P5 note on `removeMovieFromIndex`** | This report, *Discovered* section | ✅ |

### Design notes / judgment calls

1. **`getMovies()` returns SEC-08 public copies** (strips `absolutePosterPath`). Diagnostics must read raw `_movieMap.values()` for internal fields — first draft of the missing-poster test failed with `absolutePosterPath: undefined` because it used `getMovies()`. Fixed by mapping raw entries (and asserting `getMovies()` still works).
2. **`indexer.runDiagnostics()` was the hidden hot path** — even after `diagnostics.js` dropped its own `existsSync` loops, the merge call still ran ~37k `existsSync` (~2.5 s). Fixed the same way (file-index membership) so both layers are consistent and `runDiagnostics()` stays safe for any future caller.
3. **Invalid list = last full scan only** — not re-derived on every report (would need a full re-walk). Watcher incremental changes do not update `_lastInvalid`; next full rescan does. Acceptable for the admin view (rescan is one click).
4. **Response shape stays additive** — old clients that only read `count`/`success` still work; new fields are extra. No WS protocol bump (no message shape change).
5. **`gamesCount` naming** — additive sibling of `count` (movies). `POST /api/games/rescan` still returns `count` (games) for backward compat.
6. **30 s cache vs watcher `catalog:changed`** — `invalidate()` on every watcher apply means the admin always sees a fresh report after a hot change; the 30 s TTL only protects against rapid repeated `GET /api/diagnostics` with no underlying change.
7. **Lag probe interval** — first `setImmediate` tick ignored (`last` bootstrap) to avoid a false first-sample spike.

### Files changed (P3e, 10 files):

- **backend/diagnostics.js** — full B9 rewrite: 30 s cache + `invalidate()`, raw `_movieMap` for internal fields, file-index missingPosters/brokenLinks, invalidFilenames, orphanMetadata (3rd ctor arg), games in summary/stats, no `fs` import
- **backend/indexer.js** — `_lastInvalid` + `setLastInvalid`/`getLastInvalid`; `runDiagnostics()` missingPosters/brokenLinks switched from `existsSync` to file-index membership
- **backend/scanner.js** — `yieldTick`, `walkDirAsync`, `scanLibraryAsync`, `scanGamesAsync`; exports updated
- **server.js** — startup `setLastInvalid`; `new Diagnostics(indexer, LIBRARY_PATH, metadataStore)`; `handleFileChange` → `diagnostics.invalidate()`; async `POST /api/rescan` (movies+games) and async `POST /api/games/rescan`
- **js/components/diagnostics-modal.js** — new escaped issue sections + games stat card + empty-state guards
- **backend/services/movie-creator.js** — carry-over 1: `flush()` → `scheduleSave()`
- **test/unit/movie-creator.test.js** — new A5 non-blocking create test
- **test/unit/diagnostics.test.js** — 4 new B9 tests (invalid/orphan/games, cache+invalidate, file-index missing posters)
- **test/unit/http.test.js** — 3 new B10 tests (counts+invalid, invalid filename, lag probe)
- **mimo/repro/p3e-ac6-measure.js** — **new** AC6/AC8 measure script (20k fixture)

### Tests: total / passing / todo — before → after

- **Before (P3d `fb4e254`):** unit **410 / 408 / 2 todo** · ui **7 / 5 / 2 todo**
- **After (P3e):** unit **417 / 415 / 2 todo** · ui **7 / 5 / 2 todo**
- Delta: **+7 unit tests**, **+7 passing**, **0 failures**, todo **unchanged 2** (ARCH-01 ×2).

### Decisions taken:
- No new D#; no owner overrides this phase.
- Assumption: `Diagnostics` gains an optional 3rd ctor arg `metadataStore` (only `server.js` + tests construct it).
- Assumption: rescan response is **additive** (constraint: keep shapes stable).
- Assumption: invalid list = last full scan only (not re-walked per report).

### User-visible behaviour changes:
- **Admin → وضعیت سیستم now shows real problems**: invalid filenames with reasons, cross-type duplicate IDs with both paths, conflicting metadata, orphan metadata keys, missing posters (file-index based), games count/platforms — previously several of these were always empty or the whole report was slow.
- **Diagnostics is fast** — no more multi-second freeze opening the panel on a large library (958 ms → ~80–126 ms on 18.5k).
- **Rescan no longer freezes the UI/server** — movies **and** games refresh in one click; the event loop keeps serving (lag ≤ 62 ms on the 20k fixture).
- **Rescan reports how many files were invalid** instead of silently dropping them.
- **Creating a movie no longer blocks on a full `catalog.json` rewrite** (carry-over 1) — save is debounced; durability unchanged (`stop()` still flushes).

### Risks / could not verify:
- **Manual smoke on real Library** still deferred to the owner’s consolidated pass after B8–B10 (temp fixtures only here).
- **Invalid list staleness** between full rescans (watcher adds/deletes do not update `_lastInvalid`) — by design this session; note if the owner wants live invalid tracking.
- **20k fixture file count** on this machine is **18,540** files (`p2b-fixture-20k`), not the original 19,600 — measurements are on the existing fixture as-is (same path as P2b/P2c).
- Windows local commits only — not pushed.
- **UI diagnostics modal** verified by `node --check` + ui suite green; no dedicated UI test for the new sections (would need a diagnostics fixture response — out of P3 scope).

### Discovered (out of scope):
- **P5 one-line cleanup (carry-over 2):** `CatalogIndexer.removeMovieFromIndex(id)` is dead code after B8 (creator uses `removeMovieByKey`). Delete it in **P5** if no other reference appears by then.
- `indexer.runDiagnostics()` still returns the full issue bag including `missingPosters`/`missingYears`/`emptyGenres` — now consistent with `diagnostics.js` (both file-index based), but the shapes are only partially merged (paths only for `duplicateIds` from scan-time). Could be unified in P7.
- Sample Library boot still logs `7 metadata clash(es)` on stderr (pre-existing B4 surface, now visible in the modal’s تداخل اطلاعات section).
- `mimo/repro/p3e-ac6-measure.js` is a measure script, not a defect repro — it is not wired into `repro-backend.js`.

### Questions for the owner:
1. Ready to **close P3** (B1–B10 all done) and move to **P4 (frontend core)**?
2. Run the **consolidated manual smoke** (owner screen + kiosk: browse, select, manager sees selection, add/edit movie, rescan, diagnostics panel) before P4 — or proceed and smoke later?

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 417
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 23240.0487
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 15834.7907
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
(exit 1 — FE-01/FE-02 expected remaining → P4)

**Boot check:** `PORT=3999 node server.js` — starts clean (`Step 7: Initializing Movie Creator…`, `Total movies: 35`, `Total games: 13`; indexer conflict summary on stderr only; `GET /api/stats` → 200).

### AC6 / AC8 raw measurement (20k fixture, `mimo/repro/p3e-ac6-measure.js`)

```
fixture: C:\Users\Ali\AppData\Local\Temp\p2b-fixture-20k
       3830.47 ms  scanLibraryAsync cold (movies)
          1.41 ms  scanGamesAsync cold (games)
        127.16 ms  indexer.replaceFromScan + processGameResults
         62.00 ms  max event-loop lag during async scans  [budget ≤200ms]
        126.08 ms  diagnostics.runFullReport cold  [target ≤300ms]
          0.02 ms  diagnostics.runFullReport warm (30s cache)
  movies=18520 games=10 files=18520 issues=1500 invalid=0
         85.88 ms  diagnostics.runFullReport cold after invalidate
AC8 cold scan ≤10s: PASS; lag ≤200ms: PASS; diagnostics ≤300ms: PASS
```

| Metric | P2c baseline | P3e now | Budget | Status |
|---|---|---|---|---|
| `diagnostics.runFullReport` cold | **958.65 ms** | **80–126 ms** | ≤ 300 ms | **PASS** |
| cold scan (movies async) | ~2.3 s sync | **2.1–3.8 s async** | ≤ 10 s | **PASS** |
| max event-loop lag during scan | (blocking) | **15–62 ms** | ≤ 200 ms | **PASS** |
