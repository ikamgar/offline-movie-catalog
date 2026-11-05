# P3 — Scanner, parser, watcher, edit & create pipeline

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P3-catalog-pipeline.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P2 · **Closes:** DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-09, DATA-11, DATA-12, DATA-13, DATA-15, DATA-17, DATA-18; ARCH-03 (ID/filename/series-key duplication), ARCH-04 (partial); enables FE-05 · **Branch:** `phase/P3-catalog-pipeline`
**Owner decisions used:** D2 (default: keep `uid = id`), D3 (keep year), D7 (`Series`/`Serries`).

## Goal
The catalog always mirrors the poster folders correctly: every valid poster is indexed exactly once with the right type/ID/title/year, hot changes are picked up regardless of event order, edits rename **all** copies atomically, and anything that cannot be indexed is reported instead of silently vanishing.

## Context (read these first)
`backend/parser.js`, `scanner.js`, `indexer.js`, `watcher.js`, `diagnostics.js`, `services/movie-creator.js`, and the `PUT /api/movies/:id` + `next-id` handlers in `server.js`. Reproductions: `mimo/repro/repro-backend.js` (DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-11, DATA-12, DATA-17, DATA-18, SEC-03).

## Tasks (test-first; flip the matching `todo` tests)

**B1 — Parser.** Keep `parseFilename(filename, type)` (returns object or `null`) and add `parseFilenameEx()` returning `{ok:true,…}` or `{ok:false, reason}` (`no-id`, `id-too-long`, `no-year`, `empty-title`, `unsupported-ext`). Rules:
- ID = `^(\d{1,6})(?=\D|$)`; a longer digit run → `id-too-long` (DATA-18).
- Year = the **last** token matching `(?<!\d)(19\d{2}|20\d{2})(?!\d)`, preferring `(YYYY)`; resolution tags like `1080p`/`2160p` can never match (DATA-17). If taking it would leave an empty title, the number *is* the title. Movie requires a year; Animation/Iranian keep it when present (D3, DATA-11).
- Tag stripping (DATA-12): only remove bracketed/parenthesised groups made of technical tokens (`[1080p]`, `(BluRay)`, `[x265]`, `WEB-DL`, `HDRip` …). **Delete ambiguous words from `RELEASE_TAGS`** (`Web, Amazon, Apple, Disney, Netflix, Hulu, HBO, Limited, Extended, Multi, Final Cut, Uncut …`). If cleaning empties the title, fall back to the raw title — a file is never dropped because of cleaning.
- Normalise titles to NFC, trim; keep ZWNJ (U+200C).
- Table-driven test with ≥ 40 filenames (all documented formats, Persian, `'`, `%`, `&`, `#`, `1917 2019`, `Blade Runner 2049 2017`, `Apple`, `Charlotte's Web`).

**B2 — One per-file pipeline.** `scanner.scanFile(absPath, libraryPath)` → `{ok:true, entry}` | `{ok:false, reason, file}`; used by **both** `scanLibrary` and the watcher so they can never diverge. `scanLibrary` skips `Games/` (own pipeline, DATA-04) and any dot-folder (`.trash`, `.tmp`), returns `{results, stats, invalid:[{file,reason}]}`. Quiet logging (summary + warnings; per-file lines only with `DEBUG_SCAN=1`).

**B3 — Series folder alias (D7).** `resolveTypeFolder(libraryPath, type)` finds `Series`/`Serries` case-insensitively; new libraries use `Series`. Remove every hard-coded `'Serries'`.

**B4 — ID policy (D2 default).** One `backend/services/id-generator.js`: `nextId(indexer, type)` = (max numeric id over **all** non-Series types) + 1, zero-padded to the type's width (Movie 4, Animation 5, Iranian 4); `assertIdFree(indexer, id)` checks across types. Both the REST route and the creator use it (delete the duplicate). During a scan, resolve collisions deterministically and **report, never drop**: same ID in different types → winner by priority Movie > Iranian > Animation, then path order, loser recorded in diagnostics `duplicateIds` with both file paths; same ID+type with different title/year → `conflictingMetadata`. (DATA-05)

**B5 — Lookups.** Add `indexer.getByUid(uid)`; poster route `/api/poster/:key` and all handlers use the Express-decoded param **without** a second `decodeURIComponent` (DATA-06). Keep `getMovieById` as a thin compatible wrapper.

**B6 — Watcher rewrite (order-independent).** Keep the class API. Design: any fs event marks the affected directory dirty → debounce 500 ms → `reconcile(dir)`: list poster files under that directory (recursively if new) with `scanFile`, diff against `_fileIndex` entries **under that directory prefix**, apply adds/updates/removals idempotently. A movie is removed only when *no* file with its key remains; custom fields live in the metadata store (P2) so remove→add never loses data (DATA-01). Handle new directories (start watching + scan), deleted/renamed directories (drop watchers + remove all entries by prefix), and Games changes (route to the games pipeline). `watcher.expect(paths, ttlMs=3000)` lets server-initiated operations suppress their own events (belt and braces). After applying changes call `onChange({added,updated,removed})` → server schedules the debounced save **and broadcasts** a new WS message `catalog:changed {added:n,updated:n,removed:n}` (DATA-02). Optional safety net `LIBRARY_POLL_SEC` (default off): periodic stat-diff reconcile from the root for network drives.

**B7 — Edit service** `backend/services/movie-editor.js`: `updateMovie(uid, patch)` with `patch = {title?, year?, id?, imdbRating?, plotSummary?}`.
1. Validate with P1's `safe-path` helpers; compute the new key and filenames per type (I4).
2. Collect **all** files belonging to the item (every `_fileIndex` entry with that key — all genre copies).
3. Pre-check target collisions (case-insensitive on Windows) and cross-type ID uniqueness (B4) → `409` with a Persian message on conflict.
4. Rename all files; on any failure roll back the ones already renamed and leave memory untouched.
5. Re-key the indexer, `metadata.rename`, `watcher.expect(old+new paths)`, broadcast canonical `movie:updated`.
6. Metadata-only patches (rating/plot) touch no files.
Routes: `PUT /api/movies/by-uid/:uid` (admin, uid URL-encoded — works for **Series**, FE-05 backend); keep `PUT /api/movies/:id` as a delegating alias for non-Series.

**B8 — Creator** (`movie-creator.js`): use the indexer as the **only** catalog writer (delete its private `catalog.json` read/modify/write); roll back **by key** (fixes the Series wipe, DATA-09); temp uploads go to `os.tmpdir()` (or `data/tmp`) — never inside `Library/` (DATA-13); use `id-generator` + `safe-path`; write every genre copy with `flag:'wx'`; all-or-nothing with rollback; `watcher.expect`; broadcast `movie:added`.

**B9 — Diagnostics** (DATA-15): populate `invalidFilenames` (with reasons), `duplicateIds`, `conflictingMetadata`, `unknownTypes`, `orphanMetadata`, `storage` (from P2), and include games. No per-movie `existsSync` — use the file index and verify lazily; cache the report for 30 s, invalidated by `catalog:changed`. Update the diagnostics modal to show the new sections (escaped).

**B10 — Rescan.** `POST /api/rescan` rescans **movies and games** in one call, without blocking the event loop for long (async walker with `fs.promises.readdir(withFileTypes)` or chunked `setImmediate`); responds with counts and the `invalid` count.

## Constraints
- No new dependencies; keep response shapes additive (new fields only). New WS messages: `catalog:changed` only (the client handles it in P4; until then it must be ignored harmlessly).
- Do not reformat untouched code. Do not change sort rules or badges (I11/I12).
- Files in a real Library are never modified by tests; use temp dirs.

## Acceptance criteria (automated)
1. `repro-backend.js` shows **FIXED** for DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-11, DATA-12, DATA-17, DATA-18 and SEC-03; the matching `todo` flags are removed.
2. **Order independence:** a test feeds the watcher {remove-old, add-new} and {add-new, remove-old} for a rename → identical final state, metadata intact.
3. Renaming/editing a 3-genre movie (ID change) leaves exactly one movie after a fresh scan; rolling back on an injected failure leaves all three files untouched.
4. Movie `0001` + Iranian `0001` → both present or one present + one `duplicateIds` diagnostic (never silent); `nextId` never proposes an existing ID across types.
5. Editing a Series title via `PUT /api/movies/by-uid/series%3A…` works and renames its poster; `100% Wolf` round-trips through poster route and PUT.
6. Hot-adding `0005- Fresh 2021.jpg` and `Breaking Bad.jpg` shows up in `GET /api/movies` with correct year/type within 2 s and a `catalog:changed` message reaches a test WS client.
7. `Games/` never produces movie entries; `Library/.tmp` / `.trash` are ignored.
8. With the 20k fixture: cold scan ≤ 10 s, event-loop stall during `POST /api/rescan` ≤ 200 ms per tick (measure with `setImmediate` lag probe), diagnostics ≤ 300 ms.

## Verify
`npm test`; `node mimo/repro/repro-backend.js` (expect only unrelated items left); manual: rename a poster in Explorer while the server runs; delete a whole genre folder; drop a new series poster.

## Report
PHASE REPORT. List every behaviour change staff could notice (e.g. titles that used to lose words now keep them; files that used to disappear now appear in diagnostics).
