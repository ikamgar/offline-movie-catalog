# PHASE REPORT — P3i edit fixes

**Branch / commits:** `phase/P3i-edit-fixes` (from `ced7d16` P3h) — code commit + this report commit (local only).

**Defects closed:** `[FE-05]` — evidence: Playwright suite `P3I - Series edit modal (FE-05)` (2 tests pass); server by-uid Series route covered by existing `http.test.js` *updates a Series by URL-encoded uid* and `movie-editor.test.js` *Series: update by uid renames title-only filename and re-keys*.

**Defects closed (BUG-2, no register ID):** diagnostics stale cache after edit — evidence: new unit test `BUG-2 diagnostics freshness after edit` (pass); hypothesis investigation below.

**Defects partially closed or deferred:**
- **FE-05** remains open in the register until the owner marks it: this phase unblocks Series edit in the modal and routes via `by-uid`; genre editing and poster replacement for Series stay out of scope (P6).
- **BUG-2 conflictingMetadata scan-frozen aspect** — `conflictingMetadata` is rebuilt only in `indexer.replaceFromScan` (full rescan/startup). Explicit `invalidate()` refreshes every field derived from the live `_movieMap` (missingYears/emptyGenres/titles/totalMovies/timestamp) but not scan-time conflict snapshots until the next rescan. Documented, not fixed (would require rescan-on-edit or rebuilding conflicts from `_fileIndex` — out of scope).

---

## BUG-2 investigation (hypothesis a vs b)

**(a) Fresh-fixture ID collision — NOT the cause of the owner’s “old+new title conflict after rename”.**
- Unique-ID fixture (`0001- Alpha` + `0002- Beta`): `conflictingMetadata = []` before and after edit; no phantom conflict.
- Multi-genre same title (I7): `conflictingMetadata = []` (same title → not a clash).
- Pre-existing same-ID different-title fixture: conflict exists **before** any edit (correct — real two-file clash on one ID); after edit both disk files rename to the new title but diagnostics still lists the **old** scan-time entries (stale cache + scan-frozen conflicts).

**(b) CONFIRMED — editor/creator never invalidate; `watcher.expect` suppresses the only onChange path.**
- `movie-editor.js` / `movie-creator.js`: zero `diagnostics.invalidate` calls (grep before fix).
- `watcher.expect(old+new)` (editor L151, creator L98) → `_handleEvent` returns early → `server.handleFileChange` (the only mutation-path `invalidate`) never runs.
- Metadata-only edits (rating/plot) touch no files at all → no watcher event either.
- End-to-end proof: warm `GET /api/diagnostics`, `PUT` title, immediate re-GET → **same `timestamp`** (cache hit / stale). After fix: timestamp changes and `missingYears[].title` shows the post-edit title.

**Fix (b):** both services take an optional `diagnostics` dep and call `invalidate()` after a successful mutation; `server.js` wires the existing `Diagnostics` instance into both constructors.

---

## Files changed (grouped)

| File | Change |
| --- | --- |
| `js/components/edit-modal.js` | FE-05: `_isSeries()`; hide `#editId` for Series (`raw(idField)`); skip ID validation for Series; Series save → `PUT /api/movies/by-uid/:uid` |
| `backend/services/movie-editor.js` | Accept `deps.diagnostics`; `invalidate()` after successful `updateMovie` |
| `backend/services/movie-creator.js` | Accept `options.diagnostics`; `invalidate()` after successful `createMovie` |
| `server.js` | Wire `diagnostics` into `MovieCreator` + `MovieEditor` construction |
| `test/helpers/ui-stub.js` | Handle `PUT /api/movies/by-uid/:uid` and `PUT /api/movies/:id`; record `requests[]` for assertions |
| `test/unit/http.test.js` | **+1 test:** BUG-2 — edit title (+year null) then immediate `GET /api/diagnostics` reflects post-edit state |
| `test/ui/ui.test.js` | **+2 tests:** P3I Series edit (no ID field, by-uid save, new title in catalog); Movie edit still has required `#editId` (regression guard) |

7 files, +258/−12. No `data/`, no `Library/`, no shots committed.

---

## Verification (raw output)

```
=== npm test ===
ℹ tests 418
ℹ suites 105
ℹ pass 416
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 24728.0154
status 0

=== npm run test:ui ===
ℹ tests 15
ℹ suites 9
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 2
ℹ duration_ms 30274.4079
status 0

=== node mimo/repro/repro-backend.js ===
0 present, 13 fixed, 0 error
exit=0

=== node mimo/repro/repro-ui.js ===
PRESENT  FE-01  selecting one card must not rebuild the grid or lose scroll position
         cards 400 -> 40, scrollTop 68784 -> 6675, MovieCard.render() calls: 480
PRESENT  FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
         open WebSockets: 4, Workers: 1 -> 4
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
         grid executed: false, detail executed: false
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
         poster src: data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F% | script errors: none
2 present, 2 fixed, 0 error
exit=1
```

### Tests: total / passing / todo — before → after

| Suite | Before (P3h `ced7d16`) | After (P3i) |
| --- | --- | --- |
| Unit | **417 / 415 / 2 todo** | **418 / 416 / 2 todo** (+1 BUG-2) |
| UI | **13 / 11 / 2 todo** | **15 / 13 / 2 todo** (+2 P3I) |

`repro-backend` / `repro-ui` unchanged (FE-01/FE-02 still PRESENT as expected; 13/13 backend FIXED; 2/2 UI FIXED for SEC-04/FE-04).

---

## Decisions taken
- **BUG-1 scope:** Movies keep legacy `PUT /api/movies/:id`; only Series route via `by-uid` (minimal FE-05 close; P6 can migrate all types).
- **BUG-2 hypothesis:** (b) confirmed and fixed; (a) documented as non-cause for unique-ID libraries; pre-existing same-ID clashes remain a real diagnostics finding until rescan.
- No owner decision D1–D9 needed; no new dependency; no on-disk format change.

## Assumptions made
- Observable post-edit diagnostics field for the test = `missingYears[].title` (requires `year: null` on the Movie so it lands in that issue list — scanner rejects no-year Movies at scan time, but editor accepts `year: null` in-memory).
- `conflictingMetadata` staying scan-frozen until rescan is accepted for this phase (see deferred above).

## User-visible behaviour changes
1. **Series edit modal:** no شناسه/کد field; title-only (or year/IMDB/plot) edits save successfully. Movies unchanged (ID still required).
2. **Diagnostics panel:** after any successful add/edit (not just external file drops / full rescan), the next `GET /api/diagnostics` reflects the change immediately instead of serving a ≤30 s stale report.

## Risks / could not verify
- Did not re-run the full Playwright suite in a single process after every micro-edit (ran P3I standalone + full suite once — full suite green: 15/13/0/2).
- Browser-only paths (lazy-loaded edit modal edge cases) covered by the two P3I tests; no visual screenshot artifacts for P3I (not required by phase).
- `data/metadata.json` remains untracked (never commit).

## Discovered (out of scope)
- `conflictingMetadata` / `_scanConflicts` only rebuild on `replaceFromScan` — a rename never refreshes those entries until a full rescan (noted above; candidate for a later phase if the owner wants conflicts to track live disk state).
- Scanner rejects Movies with no year (`no-year`) at scan time even though the editor can set `year: null` — asymmetry left as-is (I4/I11 territory).

## Questions for the owner
1. Should FE-05 be marked **closed** in the register after your review, or kept open until genre editing / poster replacement for Series (P6)?
2. For BUG-2: is the remaining scan-frozen `conflictingMetadata` after a rename acceptable, or do you want conflicts recomputed from `_fileIndex` (or a silent rescan) on every edit in a follow-up?
