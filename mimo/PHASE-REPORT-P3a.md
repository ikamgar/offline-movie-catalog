## PHASE REPORT — P3a Parser + Scanner + ID policy (B1–B5)

**Branch / commits:** `phase/P3a-parser-scanner` (on top of `cc315fa` P2c report)

| Commit | Summary |
|---|---|
| `ba99fc5` | `fix(parser): rewrite parseFilename + add parseFilenameEx [DATA-11 DATA-12 DATA-17 DATA-18]` |
| `5990ab8` | `fix(scanner): shared scanFile pipeline, skip Games/dot-folders, report invalid [DATA-04]` |
| `88645f5` | `fix(scanner): flip DATA-02 todo (type-aware hot-add via scanFile) [DATA-04 DATA-02]` |
| `16f70cf` | `feat(scanner): resolveTypeFolder for Series/Serries alias, drop hard-coded Serries [D7]` |
| `724b817` | `fix(indexer): type:id map keys, global id-generator, no double-decode [DATA-05 DATA-06]` |

**Date:** 2026-09-23 · **Scope:** B1–B5 only (B6 watcher rewrite and B7–B10 are separate sessions).

### Defects closed: [DATA-02, DATA-04, DATA-05, DATA-06, DATA-11, DATA-12, DATA-17, DATA-18]

Evidence (todo flags removed + matching tests green + repro FIXED):

| ID | Test / repro |
|---|---|
| DATA-02 | `defects.test.js` → `DATA-02: watcher keeps year/type on hot-add` (via shared `scanFile`); repro `FIXED DATA-02` |
| DATA-04 | `defects.test.js` → `DATA-04: Games never appear in movie index`; `scanner.test.js` → Games skip + dot-folder skip; repro `FIXED DATA-04` |
| DATA-05 | `defects.test.js` → `DATA-05: Movie 0001 and Iranian 0001 must both be indexed`; `id-generator` cross-type `nextId`/`assertIdFree`; diagnostics `duplicateIds` with both paths; repro `FIXED DATA-05` (`2 poster files -> 2 indexed`) |
| DATA-06 | `defects.test.js` → `DATA-06: poster lookup must survive titles containing %` (no second `decodeURIComponent` in `getMovieById`/`getPosterPath`); repro `FIXED DATA-06` |
| DATA-11 | `defects.test.js` + `parser.test.js` (Animation/Iranian keep year, D3); repro `FIXED DATA-11` |
| DATA-12 | `parser.test.js` → `cleanTitle` table (ambiguous release tags no longer strip real words); repro `FIXED DATA-12` |
| DATA-17 | `parser.test.js` → last bare `19xx/20xx`, prefer `(YYYY)`, `1080p`/`2160p` cannot match; repro `FIXED DATA-17` |
| DATA-18 | `parser.test.js` → 7+ digit run → `id-too-long`; repro `FIXED DATA-18` (`null`) |

### Defects partially closed or deferred:
- **DATA-01** (edit loses metadata) — still `{ todo }`; needs **B7** edit service (`movie-editor.js`, multi-copy rename + `watcher.expect`). Repro still `PRESENT`.
- **DATA-03** (multi-genre edit ghost copy) — still `{ todo }`; same **B7** dependency. Repro still `PRESENT`.
- **DATA-09** (Series rollback wipes catalog) — still `{ todo }`; **B8** creator rewrite.
- **ARCH-01**, **FE-01/FE-02** — out of P3a scope.
- Full P3 ACs 2–8 (order-independent watcher, `catalog:changed`, async rescan, diagnostics DATA-15, 20k budgets) require **B6–B10** — not claimed here.

### Task → Evidence Table (B1–B5)

| Task (P3 prompt) | Evidence | Status |
|---|---|---|
| **B1 Parser** | `backend/parser.js`: `parseFilenameEx` reasons `no-id`/`id-too-long`/`no-year`/`empty-title`/`unsupported-ext`; ID `^(\d{1,6})(?=\D|$)`; year last bare 19xx/20xx preferring `(YYYY)`; technical-only `RELEASE_TAGS` (ambiguous Web/Amazon/… deleted); NFC + raw-title fallback. `test/unit/parser.test.js` table ≥40 rows + rejects + `parseFilenameEx` shape; 97/97 green | ✅ |
| **B2 Shared pipeline** | `scanner.scanFile(abs, lib)` → `{ok,entry}|{ok:false,reason,file}`; `scanLibrary` = `{results,stats,invalid}`; skips root `Games/` + dot-dirs; `DEBUG_SCAN=1` quiet logs; `watcher._processEvent` → `scanFile`. Tests: Games skip, dot-folder skip, `invalid[]`, `scanFile` ok/fail | ✅ |
| **B3 Series alias (D7)** | `resolveTypeFolder(libraryPath, type)` — existing `series`/`serries` dir (case-insensitive) else `Series`; `movie-creator` no longer hard-codes `'Serries'`. 4 tests in `scanner.test.js` | ✅ |
| **B4 ID policy (D2 default)** | New `backend/services/id-generator.js`: `nextId` = max over **all** non-Series + 1, pad Movie 4 / Animation 5 / Iranian 4, `null` for Series; `assertIdFree` → Persian `ID_TAKEN`. Wired: `GET /api/movies/next-id`, `movie-creator._generateNextId`/`_validateId`. Indexer `_movieMap` key = `type:id` (uid stays bare id); `replaceFromScan` records `_scanConflicts.duplicateIds` (both paths/types) + `conflictingMetadata`; `runDiagnostics()` + `diagnostics.js` surface them; PUT re-keys via `getKey` + `posterUrl`. Tests: DATA-05 both indexed | ✅ |
| **B5 Lookups** | `indexer.getByUid(uid)`: `game:`→games map, `series:`→bare seriesKey, else bare id→`getMovieById`; **no** `decodeURIComponent` in `getMovieById`/`getPosterPath` (Express already decodes). `getMovieById` exact `type:id` then bare-id fallback Movie > Iranian > Animation. DATA-06 test green; repro FIXED | ✅ |

### Requirement → Test / Evidence (P3 ACs in P3a scope)

| Acceptance | Evidence | Status |
|---|---|---|
| **AC1 partial — repro FIXED + todos removed** for IDs closed by B1–B5 | `repro-backend`: `2 present, 11 fixed, 0 error` (DATA-01/03 remain by design → B7); DATA-02/04/05/06/11/12/17/18 FIXED; matching `{ todo }` removed | ✅ for B1–B5 IDs |
| **AC4 — Movie `0001` + Iranian `0001` both present or `duplicateIds`; `nextId` never proposes existing ID across types** | DATA-05 test (`count >= 2`); `id-generator.nextId` scans all non-Series; `assertIdFree` throws before write | ✅ |
| **AC7-ish — `npm test` / `test:ui` fail 0** | Raw summaries below | ✅ |

### Files changed (P3a, 11 files):
- **backend/parser.js** — B1 rewrite (`parseFilenameEx`, extractYear, cleanTitle, RELEASE_TAGS, classifyFromPath)
- **backend/scanner.js** — B2 `scanFile`/`invalid[]`/quiet logs; B3 `resolveTypeFolder`
- **backend/watcher.js** — B2: `_processEvent` uses shared `scanFile`
- **backend/indexer.js** — B4/B5: `getKey`=`type:id`, `getByUid`, no double-decode, `_scanConflicts`, diagnostics merge, `posterUrl` export
- **backend/services/id-generator.js** — **new** B4 `nextId` + `assertIdFree`
- **backend/services/movie-creator.js** — B3 `resolveTypeFolder`; B4 delegates to id-generator; poster via `getKey`
- **backend/diagnostics.js** — B4: merge scan-time `duplicateIds`/`conflictingMetadata` (paths)
- **server.js** — B4: PUT re-key via `getKey`/`posterUrl`; `next-id` → id-generator
- **test/unit/parser.test.js** — B1 table-driven rewrite (≥40 rows)
- **test/unit/scanner.test.js** — B2/B3 tests (Games/dot-folder skip, `scanFile`, `resolveTypeFolder`)
- **test/unit/defects.test.js** — flip todos DATA-02, DATA-04, DATA-05, DATA-06, DATA-11, DATA-12, DATA-17, DATA-18

### Tests: total / passing / todo — before → after
- **Before (P2c `cc315fa`):** unit **335 / 320 / 15 todo** · ui **7 / 5 / 2 todo**
- **After (P3a `724b817`):** unit **389 / 384 / 5 todo** · ui **7 / 5 / 2 todo**
- Delta: **+54 tests**, **+64 passing**, **−10 todo**, **0 fail**; UI unchanged (FE-01/02 deferred).

### Decisions taken:
- **D2 default** adopted: `uid` remains bare `id`; internal `_movieMap` key is `type:id` so cross-type collisions never collapse; collisions reported in diagnostics `duplicateIds` with both paths (never dropped).
- **D3** — Animation/Iranian keep year when present (parser).
- **D7** — accept `Series`/`Serries` case-insensitively; new libs use `Series`.
- Assumption: P3a stops at B5 per session plan; B6–B10 not in this diff.

### User-visible behaviour changes:
- Titles that used to lose real words (e.g. `Web`, `Limited`, `Extended` stripped by old `RELEASE_TAGS`) now keep them; only bracketed technical groups are removed.
- Filenames whose “year” was a resolution tag (`… 1080p`) no longer mis-parse; parenthesized years win.
- Iranian/Animation posters with a year in the filename are no longer rejected (kept year).
- Series folder can be named `Series` or `Serries` (old libraries still work); new creates go to `Series`.
- Movie and Iranian can share numeric ID `0001` without one vanishing; next-id suggestion is globally unique across types.
- Diagnostics now reports cross-type duplicate IDs **with both file paths** and metadata conflicts.
- Posters with `%` in the title (e.g. `100% Wolf`) resolve correctly (no URIError).
- Unparseable posters are listed in scan `invalid[]` + a one-line warning (per-file only with `DEBUG_SCAN=1`).

### Risks / could not verify:
- **B6+ not done:** rename/edit still hits only the PUT path’s single-file assumptions → DATA-01/DATA-03 repro still `PRESENT` (expected until B7).
- **movie-creator** still does its own `catalog.json` read/modify/write (B8 will remove) — rollback-by-key (DATA-09) still open.
- **Diagnostics** still `existsSync`-per-movie (DATA-15 / ARCH-04) and does not yet populate `invalidFilenames`/`orphanMetadata`/games (B9).
- **`POST /api/rescan`** still sync/blocking (B10).
- `catalog.json` disk format: movie objects still store `type`/`id` fields (unchanged); load re-keys via `getKey` — no migration required. Manual smoke on a **real** Library with mixed `Serries`/`Series` not run (tests use temp fixtures only).
- Windows local commits only — not pushed.

### Discovered (out of scope):
- `movie-creator._buildMovieObject` poster URL used raw `uid` (would miss `type:id` after B4) — fixed inside B4 so new movies resolve; worth a regression test when B8 rewrites the creator.
- `diagnostics.js` built its own `duplicateIds` without paths — merged scan-time conflicts in B4; full DATA-15 pass still B9.
- Pre-existing: `POST /api/rescan` ~2.3 s scan + sync save on 20k (ARCH-04).
- Pre-existing: PUT rename builds filename as `newId-title year.ext` regardless of type-specific conventions (I4) — B7’s `movie-editor` should own that.

### Questions for the owner:
1. Ready for **P3b (B6 watcher rewrite)** next, or do you want a stop-gate review of B1–B5 first?
2. None blocking — no new dependencies, no format change without migration, no commit >15 files.

### Verification commands — raw summary lines

**1) `npm test`**
```
ℹ tests 389
ℹ pass 384
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 5
ℹ duration_ms 13634.5309
```

**2) `npm run test:ui`**
```
ℹ tests 7
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 17476.9091
```

**3) `node mimo/repro/repro-backend.js`**
```
2 present, 11 fixed, 0 error
```
(includes `FIXED DATA-02`, `FIXED DATA-04`, `FIXED DATA-05`, `FIXED DATA-06`, `FIXED DATA-11`, `FIXED DATA-12`, `FIXED DATA-17`, `FIXED DATA-18`; `PRESENT DATA-01`, `PRESENT DATA-03` → B7)

**4) `node mimo/repro/repro-ui.js`**
```
2 present, 2 fixed, 0 error
```
