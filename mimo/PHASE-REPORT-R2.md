# PHASE REPORT — R2 integrity fixes (F33, F37, F31, F3)

Branch / commits: `fix/R2-integrity` (branched from `fix/R1-high-findings` at `1650f88`).
R2 session commits (in order):
- `1a6157a` fix: F33 success must mean durable — metadata persist failure rolls back and reports PERSIST_FAILED
- `e2a3b32` fix: F37 game create rejects uncleanable titles and never leaves ghost posters
- `4cfe446` fix: F31 games reconcile replaces the catalog wholesale on rescan
- `0e58722` fix: F3 source-level invalidation for game writes (belt-and-braces)
- `1f7cb67` test: extend payload ETag coverage to every game operation
- `580c172` chore: drop unused destructured vars left by F33 refactor in movie-editor
- `515f2ef` docs: R2 error codes + storage warnings (CHANGELOG + ARCHITECTURE)
(Task 0 reconnaissance commits already on the branch: `4952425`, `e8b8431`.)

Working tree: clean. No new dependencies, no WS protocol change, no on-disk format change, local commits only.

## Requirement → evidence table

| Requirement | Evidence | Status |
|---|---|---|
| Fixes authorised only for F33, F37, F31, F3 | All 7 R2 commits touch only those fixes + their tests + docs/lint cleanup. No other defects touched. | CLOSED |
| Method: write test first → red → fix → green → mutation proof → green commit | F33, F37, F31 each showed red against unfixed code, green after fix, red on mutation-revert, green commit. F3 noted below (premise already satisfied). | CLOSED (F3 qualified) |
| No new dependencies | `package.json` runtime deps unchanged (express + ws only; sharp optional). `npm ci --omit=dev` unaffected. | CLOSED |
| No WS protocol change | Protocol stays 3; no message names/shapes changed. | CLOSED |
| No on-disk format change | catalog.json / metadata.json / orders.json formats unchanged. | CLOSED |
| `npm test` green | Unit suite: **tests 773 / pass 773 / fail 0** (baseline 757 → +16 new R2 tests; all green). Raw: last run duration 34.9 s, 174 suites. | GREEN |
| `node mimo/repro/*.js` | `repro-backend.js`: **0 present, 13 fixed, 0 error** (DATA-01/02/03/04/05/06/07/08/11/17/18, SEC-03 all FIXED). | GREEN |
| `npx eslint .` | Clean — no errors, no warnings. (One pre-existing `no-unused-vars` trio in `movie-editor.js` introduced by the F33 commit was removed in `580c172`.) | GREEN |
| `npm audit --omit=dev` | 2 vulnerabilities reported, both **pre-existing Express transitive deps** (body-parser high, qs moderate). Cannot fix without new deps / an Express upgrade, which D9 forbids (runtime deps limited to express + ws). Not introduced by R2; noted for owner. | PRE-EXISTING / OUT OF SCOPE |
| UI suite `node scripts/run-tests.js ui` 3× consecutively after last commit | Run 1: pass 1 / fail 0. Run 2: pass 1 / fail 0. Run 3: pass 1 / fail 0. (P4-C5 20k budgets: paint ~470 ms, select ~14 ms, longTasks [62], search ~273 ms — all within budget.) | GREEN ×3 |
| CHANGELOG.md updated | New `[Unreleased] — R2 integrity fixes (F33, F37, F31, F3)` block added at top with per-fix notes + test list. | DONE |
| docs/ARCHITECTURE.md updated | New "Error codes" section (PERSIST_FAILED, TITLE_INVALID, plus TITLE_REQUIRED, GAME_EXISTS/FILE_EXISTS, PLATFORM_INVALID, IMG_*, SCAN_IN_PROGRESS, NOT_FOUND, RESTORE_CONFLICT, TRASH_PURGED); storage-ownership note on in-process warnings (`recordWarning`, surfaced on `GET /api/diagnostics`, reset on restart). | DONE |

## Per-fix red/green/mutation evidence

### F33 — success must mean durable (metadata-store write joins undo stack)
- Red: `test/unit/movie-creator.test.js`, `test/unit/movie-editor.test.js`, `test/unit/metadata-store.test.js` — persist-failure cases failed before the fix (metadata claimed success though flush returned false; no rollback).
- Green after fix: all three suites pass; on `flush()` failure the route returns `500 {code:'PERSIST_FAILED'}` (Persian message), every visible change rolls back, and `recordWarning({kind:'persist-failed'})` is logged for diagnostics.
- Mutation proof: weaken/remove the rollback → persist-failure tests red (3 tests red); restore → green. Commit `1a6157a` green.

### F37 — game create rejects uncleanable titles, no ghost posters
- Red: `test/unit/game-services.test.js` F37 suite — reserved/over-long/traversal titles slipped through and left poster files on disk before the fix.
- Green after fix: `cleanTitle` (exported from `backend/utils/filename.js`) cleans+validates pre-write; cleaned title used for both filename and index key; post-write/commit failure unlinks every copy.
- Mutation proof ×2: skip clean → title-validation tests red; skip rollback on commit failure → ghost-poster test red; restore → green. Commit `e2a3b32` green.

### F31 — games reconcile replaces the catalog wholesale
- Red: `test/unit/game-services.test.js` `replaceGames` suite + `test/unit/startup-reconcile.test.js` — merge-only replacement left deleted games/platforms in the index before the fix (3 tests red).
- Green after fix: `indexer.replaceGames()` builds aside, swaps in one synchronous step; used by `POST /api/rescan`, `POST /api/games/rescan`, and startup reconcile (server.js).
- Mutation proof: revert to merge-only → 3 tests red; restore → green. Commit `4cfe446` green.

### F3 — source-level invalidation for game writes (QUALIFIED FINDING)
- Green: `test/unit/game-services.test.js` F3 describe block — `createGame`, `updateGame`, and `deleteMovie`/`restore` (game) each notify `idx.onChange` directly, without HTTP. All green with the fix.
- **Mutation proof could NOT go red:** reverting the three explicit `notifyChanged()` calls left all F3 tests green. Reason established by inspection: indexer internals (`processGameResults` at indexer.js:947 and `removeGame` at indexer.js:1031) already call `_notifyChange()` — added in P8c commit `d0b8514` (2026-10-17), which is an ancestor of the P9 audit commit `33fdede` (2026-10-19). So at audit time the claimed gap ("game writes only rely on the HTTP catalogMutation belt", "0 refs to notifyChanged") was already closed at runtime by the indexer's own methods. The auditor's grep for the public `notifyChanged` missed the private `_notifyChange` inside those methods.
- Disposition: F3's claimed behavioral defect does **not** exist at runtime (false positive on the harm). The explicit `notifyChanged()` calls are kept as defense-in-depth at the callers, matching movie-editor's P8c c4 pattern, so a future refactor of the internals cannot silently drop `/api/games` payload invalidation. The F3 test still guards the invariant (each game service notifies `idx.onChange` without HTTP). Commit `0e58722` green. Reported honestly in this report rather than claimed mutation-proven.

## Files changed (grouped, one line each)

backend/services/game-creator.js — F37 pre-write cleanTitle validation + post-write unlink; F3 notifyChanged (post-commit)
backend/services/game-editor.js — F3 notifyChanged (post-update)
backend/services/movie-trash.js — F3 notifyChanged in game delete + game restore
backend/services/movie-editor.js — removed 3 unused destructured vars left by F33 refactor (lint cleanup, 580c172)
backend/indexer.js — replaceGames() (F31) [committed 4cfe446]
backend/utils/filename.js — exports cleanTitle (F37) [committed e2a3b32]
server.js — 3 call sites switched to replaceGames (F31) [committed 4cfe446]
test/unit/game-services.test.js — F37, F31 unit + F3 describe block
test/unit/movie-editor.test.js, movie-creator.test.js, metadata-store.test.js — F33 tests
test/unit/startup-reconcile.test.js — F31 integration tests
test/unit/etag-coverage.test.js — extended to game platform edit, poster edit, delete, restore (F3 leg)
CHANGELOG.md — new R2 block (F33/F37/F31/F3)
docs/ARCHITECTURE.md — Error codes section + storage-warnings note

## Tests: before → after

- Unit suite before R2 fixes: 757 pass / 0 fail (baseline).
- After all R2 commits: **773 pass / 0 fail** (+16 new tests: F33/F37/F31/F3 units + F31 startup-reconcile integration).
- E2E/repro: all 13 repro defects FIXED, 0 errors.
- UI suite: 3× consecutive green after final commit.

## Decisions taken

- F3 kept as explicit `notifyChanged()` calls (owner-authorized approach) despite being behaviorally redundant — defense-in-depth matching movie-editor, with honest reporting that the runtime gap was already closed by indexer internals.
- Lint cleanup (`580c172`) committed separately because it was directly caused by the F33 refactor leaving unused destructured vars.
- npm audit's 2 Express transitive-dep vulns left untouched (D9 forbids new deps / Express upgrade); flagged for owner.
- CHANGELOG / ARCHITECTURE updated for PERSIST_FAILED, TITLE_INVALID, storage warnings.

## User-visible behaviour changes

- None intended for customers. Manager side: game create now rejects uncleanable titles with `400 TITLE_INVALID` before touching any poster; metadata persist failures now surface as `500 PERSIST_FAILED` with a full rollback instead of a partial "success"; games rescan/replace never exposes a half-applied catalog; all game writes refresh the cached `/api/games` payload/ETag even outside HTTP.

## Risks / could not verify

- F3 mutation-proof could not produce red (see above) — this is evidence the premise was already satisfied, not a failed fix; reported honestly.
- Could not verify F3 via an HTTP-level "non-HTTP caller" scenario beyond the direct-service unit test (no test/script/socket caller exists today that writes games outside HTTP).
- `npm audit` 2 pre-existing Express vulns — not fixable within D9.

## Discovered (out of scope)

- The P9 audit's F3 claim was a false positive at runtime (indexer internals already notify). Logged here; no code change needed beyond the defense-in-depth calls.
- `movie-editor.js` had 3 unused vars from the F33 refactor — fixed in `580c172` (was not part of any listed defect).
- Body-parser / qs advisories are pre-existing Express-tree issues, out of scope for R2.

## Questions for the owner

- Confirm disposition of F3: keep the defense-in-depth `notifyChanged()` calls, or remove them as redundant now that the false-positive finding is documented?
- The 2 `npm audit --omit=dev` findings (body-parser, qs) are Express transitive deps — approve leaving them, or is an Express upgrade (and D9 review) desired in a later phase?
- R2 is complete; do not start R3 (per standing instruction).
