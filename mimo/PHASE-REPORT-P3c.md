## PHASE REPORT — P3c Edit service (B7)

**Branch / commits:** `phase/P3c-edit-service` (on top of `6db08c2` P3b report)

| Commit | Summary |
|---|---|
| `4e8805d` | `feat(edit): movie-editor multi-copy rename, by-uid route, rollback [B7 DATA-01 DATA-03]` |
| *(report)* | `docs(P3c): phase report — B7 edit service, DATA-01/03 closed` |

**Date:** 2026-09-23 · **Scope:** B7 only (B8–B10 separate sessions — P3d).

### Defects closed / affected

| ID | Status in P3c | Evidence |
|---|---|---|
| **DATA-01** | **Closed — todo flipped** | Owner override confirmed B6 fixed the watcher half; `{ todo: 'DATA-01' }` removed. `defects.test.js` → `DATA-01: PUT must preserve imdbRating/plotSummary/year after watcher settles` now runs as a normal test and **passes**. Repro `FIXED DATA-01`. B7’s multi-copy rename + `watcher.expect` closes the remaining PUT-side single-file assumption. |
| **DATA-03** | **Closed — todo flipped; test rewritten to real service path** | Test now drives `MovieEditor.updateMovie` (not a one-file manual rename): both genre copies renamed on disk, fresh rescan → exactly 1 movie under new id, old id gone. Repro rewritten to use `movie-editor` → `FIXED DATA-03` (`["0099:Action,Drama"]`). |
| **DATA-09** | Untouched | B8 creator. |

**Todos flipped this phase:** **DATA-01**, **DATA-03** (unit todo count **5 → 3**: remaining DATA-09, ARCH-01 ×2).

### Requirement → Test / Evidence (B7)

| Requirement (B7 / P3 prompt) | Evidence | Status |
|---|---|---|
| **Build `backend/services/movie-editor.js`: `updateMovie(uid, patch)`** with `{title?, year?, id?, imdbRating?, plotSummary?}` | `backend/services/movie-editor.js` — partial patch, validates with safe-path, computes new key/filenames per type (I4) | ✅ |
| **1. Validate with P1 safe-path; new key + filenames per type (I4)** | `validateId` for id, `safeSegment` for title-derived segment; `_buildFilename`: Movie `{id}- {title} {year}.ext`, Animation/Iranian `{id}-{title}.ext`, Series `{title}.ext` | ✅ |
| **2. Collect every file belonging to the item (all `_fileIndex` entries for the key — all genre copies)** | `_planRenames`: walks `_fileIndex` for `entry.key === oldKey`, plus `absolutePosterPath` fallback. Test *renames every genre copy* asserts both Action + Drama files renamed and both `_fileIndex` paths updated | ✅ |
| **3. Pre-check target collisions (case-insensitive on Windows) + cross-type ID uniqueness (B4) → 409 Persian before touching any file** | `_assertNoTargetCollision` (existsSync = case-insensitive on Windows; own-source set excluded) → `FILE_EXISTS` 409; `getMovieById(newId)` conflict → `ID_TAKEN` 409 `شناسه … قبلاً استفاده شده است`. Tests *cross-type id conflict → 409* and *target filename collision → 409* assert index + disk untouched | ✅ |
| **4. Rename all files; on failure roll back completed renames; leave in-memory index untouched** | `_renameAll` + `_rollback` (reverse); injectable `renameSync`. Test *rollback: failure partway through multi-file rename…* fails call 2 of 2, asserts both originals restored, no leftover renamed file, `movie.title` still `Heat`, `_fileIndex` keys unchanged | ✅ |
| **5. Re-key indexer, `metadataStore.rename(oldKey,newKey)`, `watcher.expect(old+new)`, broadcast canonical `movie:updated` via `toPublicMovie`** | `_applyToIndex`: re-keys `_movieMap` + `_fileIndex` entries, updates `absolutePosterPath`/`poster`; metadata `rename` on uid change + `set`/`flush`; `watcher.expect([...from,...to])` before renames; `broadcastMovieUpdate(toPublicMovie(movie))`. Tests: *id change re-keys map key*, *watcher.expect called with old and new paths*, http by-uid asserts no `absolutePosterPath` leak | ✅ |
| **6. Metadata-only patch (rating/plot only) touches no files** | `needsFileRename` false when no title/year(Movie)/id change → no `_planRenames`/`_renameAll`. Test *metadata-only patch touches no files*: `_fileIndex` keys deepEqual before/after; disk still only original filename | ✅ |
| **Route: `PUT /api/movies/by-uid/:uid` (admin, uid URL-encoded — works for Series)** | `server.js` registers by-uid **before** `:id`; Express-decodes param. Tests: *requires admin auth* → 401; *updates Movie by bare uid* → 200 + file renamed; *updates Series by URL-encoded uid* (`series%3Abreaking%20bad`) → 200 + `Breaking Bad Edited.jpg` on disk | ✅ |
| **Route: keep `PUT /api/movies/:id` as delegating alias for non-Series** | Same commit: `:id` resolves via `getMovieById`, rejects Series with Persian 400 (`برای ویرایش سریال از مسیر by-uid استفاده کنید`), else delegates to `updateMovie(uid, …)`. Test *legacy PUT /api/movies/:id still works as a delegating alias* → 200. Existing SEC-02/SEC-03/A5 PUT tests still green | ✅ |
| **Close DATA-03; DATA-09 stays out of scope (B8)** | DATA-03 test + repro rewritten through `movie-editor` → FIXED; DATA-09 todo unchanged | ✅ |
| **Flip DATA-01’s todo if still marked** | Owner override: flipped (it may already have shown as passing after B6; `{ todo }` tag now **removed**) | ✅ |

### Design notes / judgment calls

1. **Rollback is files-only until index mutation** — renames complete first; `_applyToIndex` runs only after all renames succeed. Index mutation is pure in-memory (Map deletes/sets); if it somehow threw we would not have a mid-disk half-state from renames. The **rollback test** injects failure on the 2nd rename and asserts originals restored + index still has old title/paths.
2. **Collision pre-check excludes our own sources** — multi-genre renames share basenames across *different* directories; a target path that is one of *our* `from` paths is not a conflict (same operation will vacate it). Any *other* existing file at the target → 409 `FILE_EXISTS` before any rename.
3. **Year-only edits for Animation/Iranian/Series do not rename** — those types have no year in the filename (I4); only `Movie` year is part of the filename template. Metadata year still updates in memory/`toPublicMovie`.
4. **Metadata keys stay bare uid (D2)** — `metadataStore.rename(oldMetaKey, nextUid)` where both are bare id / `series:<title>` (not `type:id` map key). Matches P2 DATA-10 key convention.
5. **Partial patch semantics** — omitted fields keep current values; `hasOwn` distinguishes “clear year to null” from “leave year alone”. Empty/whitespace title → 400 Persian.
6. **Legacy `:id` rejects Series** — Series have no numeric id; clients must use by-uid (FE-05 backend). Persian error message, 400.
7. **Injectable `renameSync`** is constructor-only for tests; production path uses `fs.renameSync`.
8. **`metaOnly` local flag** is unused for control flow beyond skipping rename (plans empty) — rating/plot still flow through `_applyToIndex`; no separate code path to diverge.

### Files changed (P3c B7, 6 files):
- **backend/services/movie-editor.js** — **new** B7 `updateMovie`, plan/rollback, collision pre-check, re-key, metadata, expect, broadcast
- **server.js** — wire `MovieEditor`; replace inline PUT body with **by-uid** + delegating **`:id`** alias; export `movieEditor`; drop unused `validateId` import (validation lives in editor)
- **test/unit/movie-editor.test.js** — **new** 9 tests: multi-copy rename, metadata-only, 409×2, **rollback**, Series by-uid, re-key, expect, validation
- **test/unit/defects.test.js** — **DATA-01 todo removed**; **DATA-03 todo removed** + rewritten to drive `MovieEditor` and assert both copies + post-rescan count
- **test/unit/http.test.js** — **+4** by-uid/alias route tests (auth 401, Movie, Series encoded, legacy alias)
- **mimo/repro/repro-backend.js** — DATA-01 title no longer says “emulates”; DATA-03 now exercises `movie-editor` (was single-file rename emulation)

### Tests: total / passing / todo — before → after
- **Before (P3b `6db08c2`):** unit **395 / 390 / 5 todo** · ui **7 / 5 / 2 todo**
- **After (P3c):** unit **408 / 405 / 3 todo** · ui **7 / 5 / 2 todo**
- Delta: **+13 unit tests**, **+15 passing** (13 new + 2 former todos now counted as pass), **0 failures**, todo **5 → 3** (DATA-01, DATA-03 flipped).

### Decisions taken:
- No new D#; owner override only on DATA-01 todo flip.
- Assumption: Express route registration order puts by-uid before `:id` — `by-uid/:uid` is two segments so `:id` (one segment) would not capture it anyway; belt-and-braces order kept.
- Assumption: legacy alias 400 for Series (not 404) is clearer for FE; FE-05 will switch Series clients to by-uid.

### User-visible behaviour changes:
- Manager edits of **multi-genre** movies now rename **every** genre poster copy — no more ghost `0002`/`0099` after restart/rescan.
- Title/year/id edits keep `imdbRating` / `plotSummary` / `year` through the watcher settle (repro FIXED).
- Series can be edited via `PUT /api/movies/by-uid/series%3A…` (URL-encoded uid).
- Old `PUT /api/movies/:id` clients keep working for non-Series.
- Failed multi-file rename rolls files back; response is 500 with Persian message; index not mutated.
- Target file already exists (other movie) → **409** with Persian message before any rename; id already used cross-type → **409** Persian.

### Risks / could not verify:
- **Manual smoke** on real multi-genre Library (Explorer edit while server runs) not run — temp fixtures only.
- **Case-insensitive collision** relies on Windows `fs.existsSync` (true on win32); Linux CI would be case-sensitive (OS match for owner).
- **Atomicity across two renames is sequential, not single-syscall** — a hard kill between rename 1 and 2 (not a thrown error) could still leave one copy updated; rollback only runs on caught exceptions. Acceptable for P3; true atomic multi-rename would need a journaled temp phase (out of scope).
- Windows local commits only — not pushed.
- B8–B10 not touched (DATA-09, DATA-13, DATA-15, B10 rescan still open).

### Discovered (out of scope):
- Pre-existing PUT required `title` + `id` always (400); new editor is **partial-patch** — omitted title keeps current. Stricter clients that relied on forced title resubmission will no longer get 400 for omitted title (only for empty string). Not registered as a defect.
- `movie-creator` still has its own `_buildFilename` — B8 will share or keep in sync with editor’s template (I4 duplication with ARCH-03 flavour).
- `defects.test.js` DATA-01 test name still says “PUT” but drives watcher+manual rename characterization (kept from P0); B7 service is covered in `movie-editor.test.js` + rewritten DATA-03 + http by-uid tests.

### Questions for the owner:
1. Ready for **P3d (B8 creator)** next — or another phase first?
2. Confirm **partial-patch** PUT semantics are OK (empty title → 400; omitted title → keep) — FE-05 may send full bodies anyway.

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 408
ℹ pass 405
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 3
ℹ duration_ms 23624.6183
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 17518.9222
```

**3) `node mimo/repro/repro-backend.js`**
```
FIXED    DATA-01  title edit must keep imdbRating/plotSummary/year after the watcher settles
         {"title":"Heat Renamed","year":1995,"imdb":8.3,"plot":"A heist story"}
FIXED    DATA-03  editing a multi-genre movie must rename all copies (movie-editor), no ghost after rescan
         ["0099:Action,Drama"]

0 present, 13 fixed, 0 error
```
(exit 0)

**4) `node mimo/repro/repro-ui.js`**
```
PRESENT  FE-01  selecting one card must not rebuild the grid or lose scroll position
PRESENT  FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s

2 present, 2 fixed, 0 error
```
(exit 1 — FE-01/FE-02 expected remaining → later phase)

**Boot check:** `PORT=3999 node server.js` — starts clean (`Step 7: Initializing Movie Creator…`, `Total movies: 35`, no new console errors); port 3000 EADDRINUSE was a leftover process during an earlier attempt, not a code fault.
