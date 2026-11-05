# PHASE REPORT - P6c add flow & games management (E2, E4)

Branch: `phase/P6c-add-games` (from `003d776` = P6b head) — Commits: 6 build + this docs commit (+ shots)

Scope per `mimo/prompts/P6-manager-features.md`: **tasks E2 (add modal, FE-13/ARCH-03) and E4 (games management) only**, per the owner's STOP-GATE instruction. **Stop after this report — do not start E5/E6 or any later phase.**

## Commits

| # | Commit | Content |
|---|---|---|
| 1 | `3294ff0` | `test(p6c): red — E2 add flow: filename builder, preview, creator codes, modal E2E [FE-13,ARCH-03]` — TDD red first (6 files, +911: new `filename.test.js` (5), http +11, `movie-creator.test.js` +4, new `add-modal.test.js` (8), new `add-flow-real.test.js` (1), ui-stub + test helpers) |
| 2 | `2d618ca` | `feat(p6c): shared filename builder, preview endpoint, creator error codes [FE-13,ARCH-03]` (6 files, +200 −46; AGENTS §5 gains `POST /api/movies/preview`) |
| 3 | `c998c95` | `feat(p6c): add-modal downscale, distinct toasts, inline genre, dup warning [FE-13]` (6 files, +359 −90) |
| 4 | `2601b1b` | `test(p6c): red - E4 games create/edit/delete + trash generalization [P6c-E4]` (5 files, +1026 −15: http +11 −1, new `game-services.test.js` (14), movie-trash +2 −1, new `game-manage.test.js` (7), ui-stub games handlers) |
| 5 | `7ff3817` | `feat(p6c): game create/edit services, trash generalization, game routes [P6c-E4]` (7 files, +623 −50) |
| 6 | `f56d663` | `feat(p6c): game add/edit/delete UI, platform fields, media-mode labels [P6c-E4]` (7 files, +237 −63) |
| 7 | (this) | `docs(p6c): phase report + add-flow/game dialog screenshots [FE-13,P6c-E4]` — report, `p6c-shots.js` + 12 PNGs, AGENTS §5 gains `POST /api/games` (doc gap found while writing this report) |

Every commit ≤ 15 files (max 7).

## Owner decisions applied (STOP-GATE answers)

| Q | Decision applied |
|---|---|
| Q1 trash for games | **One unified trash service/manifest/panel** (`movie-trash.js`); games distinguished by `entry.type === 'Game'`. No second trash system. |
| Q2 REST surface | `PUT`/`DELETE /api/movies/by-uid/:uid` **dispatch on the `game:` uid prefix**; the only *new* endpoint is `POST /api/games` (plus E2's `POST /api/movies/preview`); `DELETE` route name/shape unchanged. |
| Q3 service layout | Own service files **`backend/services/game-creator.js`** and **`game-editor.js`** (movie services untouched apart from a guard). |
| Q4 client guards | Client rejects **> 30 MB** with a Persian toast before any upload; oversized-but-valid photos are ** downscaled and accepted**. Admin game cards flip **SELECT → EDIT** (`movie-card.js`, `movie-detail.js` gate on `isAdmin`). |

## Requirement → test evidence

### E2 — add modal (FE-13, ARCH-03)

| Prompt requirement | Change | Evidence |
|---|---|---|
| Client-side downscale: canvas, max 1400 px longest side, JPEG q0.85 (WebP when source has transparency), show resulting size | `add-modal.js` `_downscalePoster` always re-encodes from a `data:` URL (app CSP `img-src 'self' data:` blocks `blob:`); `#posterSizeHint` shows «حجم نهایی: N KB» | UI `downscales a >4 MB poster before upload: payload cut ≈4x, longest side <= 1400px, size shown` (add-modal.test.js:113) |
| Distinguish error causes in the toast: validation 400 / too large 413 / conflict 409 / auth 401 / network | per-cause toasts in `add-modal.js` (401 handled only by `api.js` — no second toast leaks the raw code); server codes below | UI `every failure cause gets its own distinct Persian toast (400/409/413/network/401)` (:271); http `create: missing title → 400 TITLE_REQUIRED…` (:964), `taken id → 409 ID_TAKEN (conflict must NOT surface as a generic 400)` (:976), `decoded poster beyond 8 MB → 413 IMG_TOO_LARGE` (:1022), `JSON body beyond the express limit → 413 JSON IMG_TOO_LARGE (not an HTML error page)` (:1033) |
| > 30 MB rejected client-side; non-image renamed `.jpg` rejected (AC2) | `MAX_POSTER_BYTES` guard → «حجم فایل بیش از حد مجاز است (حداکثر ۳۰ مگابایت)»; extension guard → «فرمت تصویر نامعتبر است»; undecodable → «تصویر پوستر قابل پردازش نیست» | UI `rejects a >30 MB file with a Persian message before any upload` (:238), `rejects a non-image renamed .jpg with a Persian message` (:256) |
| Allow creating a new genre (validated name, becomes a folder) | inline «افزودن» beside the genre list; name rides the create request | UI `inline genre creation: new genre becomes a checked checkbox and rides the create request` (:167); http `create: a new genre name becomes a real folder and the movie lands in it` (:1001); http `create: unsafe genre → 400 GENRE_INVALID, nothing written outside its folder` (:986); **real end-to-end** add-flow-real:46 `inline genre + create → real folder, I4 filename, live catalog entry` |
| Warn on probable duplicate (same normalised title + year) — never blocks | `_handleSubmit` dup check via `normalizeFa(title)` + year → «احتمال تکرار» confirm | UI `probable duplicate (same normalised title + year): warns, does not block` (:197), `duplicate warning can be cancelled: modal stays open, nothing submitted` (:218) |
| Filename preview from the **same builder as the server** — no third copy (ARCH-03) | new **`backend/utils/filename.js`** (single builder incl. `buildGameFilename`); creator, editor and preview all import it; `POST /api/movies/preview` (admin) answers with the builder's string; modal debounces 250 ms with a `_previewSeq` race guard | unit filename.test.js 5/5 (`describe('P6c E2 shared filename builder (ARCH-03, I4)')`, I4 shapes for every type, `buildGameFilename`, forbidden-char sanitising); http `POST /api/movies/preview requires admin (401…)` (:886), `preview returns the exact I4 filename for every type (shared builder, ARCH-03)` (:905), **`preview filename === server-written filename for the same inputs (no third copy)`** (:930), `preview rejects an unsafe title with 400 TITLE_INVALID (traversal, I10)` (:952); UI `filename preview displays the SERVER builder result (ARCH-03, no local copy)` (:155) |
| AC6 for the new endpoint | preview behind `requireAdmin` | http :886 (401 without token) |

### E4 — games management (prompt line 19; AC4, AC6)

| Prompt requirement | Change | Evidence |
|---|---|---|
| Add game (title, platforms PS4/PS5, poster), files `Games/PS4\|PS5/{Title}.ext`, **both copies managed together** | new `game-creator.js`: validate title → platforms → poster/filename *before any write*, per-copy write with undo (all-or-nothing), `watcher.expect`, then `scanGames()` commit + re-lookup via `getGameByTitle` (else `CREATE_FAILED` 500); route `POST /api/games` = `requireAdmin` → `decodePosterPayload` (magic bytes) → `createGame` | http `create: writes Games/PS4 and Games/PS5 copies and merges into the catalog (AC4)` (:1130); unit game-services `create: writes a copy per platform and indexes the game (AC4)` (:57), `rollback: injected write failure on the 2nd platform removes the 1st; not indexed` (:137) |
| Same safety rules: safe-path, magic bytes, validation | shared `decodePosterPayload` in the route; title traversal rejected before anything is written; structured codes with Persian messages | http `validation: title/platforms/poster and traversal produce structured 400s (AC6)` (:1095) — covers `TITLE_REQUIRED`/`PLATFORM_INVALID` (empty + `PS6`)/`IMG_REQUIRED`/`TITLE_INVALID` («..», asserts no `..jpg` on disk)/`IMG_UNSUPPORTED` (HTML bytes disguised as `image/jpeg`) + `no partial writes from validation failures`; unit `validation: structured codes … statusOf → 400 (AC6)` (:75) |
| Edit games: title / platforms / poster | `game-editor.js`: **plan-then-execute** — renames → platform additions (donor bytes read at plan time, immune to a later rename) → poster writes (backed up) → unlinks **last**; collision pre-check `FILE_EXISTS` before any mutation; commit = `removeGame(oldTitle)` + rescan; `PUT /api/movies/by-uid/:uid` dispatches on the `game:` prefix | http `PUT by-uid: rename moves both platform copies; uid follows the title` (:1155), `platform removal deletes the copy, adding re-creates it, empty set → 400` (:1175), `poster replace rewrites every platform copy` (:1201), `PUT by-uid unknown game → 404 NOT_FOUND` (:1219); unit GameEditor suite 7/7 (`rename moves every platform copy…`, `rename onto an existing game → 409 GAME_EXISTS, nothing touched`, `platform removal…`, `poster replace…`, `blank title → 400 TITLE_REQUIRED`, `traversal title → 400 TITLE_INVALID`, `unknown game uid → 404 NOT_FOUND`, `watcher.expect receives every old and new path on rename`) |
| Duplicate title refused | `GAME_EXISTS` pre-check | http `create: duplicate title → 409 GAME_EXISTS` (:1146); unit `duplicate title → 409 GAME_EXISTS` (:114), `unindexed file already at a target → 409 FILE_EXISTS, nothing written, not indexed` (:124) |
| Delete → **soft delete** (Q1 unified trash), both copies | `_collectGameSources()` (readdir `Games/PS4\|PS5` for the title) → same undo-stack moves into `.trash/<id>/` with `type: 'Game'`; catalog drops the game; restore branch re-enters the games index | http `DELETE game: both copies to trash, entry type Game, catalog drops it (AC4)` (:1230), `restore game: files back and the game re-enters the catalog; occupied destination → 409` (:1256); unit movie-trash `delete: game uid soft-deletes every platform copy into .trash (P6c E4)` (:147), `restore: game entry moves the files back and re-enters the games index (P6c E4)` (:170); http :762 (`game uid deletes like a movie (E4)` — the old `400 GAME_UNSUPPORTED` behaviour, test rewritten) |
| Movie pipeline must never receive a game uid | `movie-editor.js` guard `GAME_UNSUPPORTED` (400) **before any file is touched**, `statusOf` mapping kept as a belt | unit `updateMovie(game:.) → 400 GAME_UNSUPPORTED before any file is touched` (game-services:309) |
| 401 for non-admin, 400 for traversal (AC6) | `POST /api/games` + dispatch behind `requireAdmin` | http `POST /api/games requires admin (401, AC6)` (:1089) + :1095 (above) |
| Manager can drive all of it from the UI | add-modal «بازی» chip + `#platformFieldGroup` (PS4/PS5, PS4 pre-checked in games mode); edit-modal game mode (`#editPlatforms`, «ویرایش بازی», «حذف بازی»); media-mode-aware labels; grid refresh after every mutation | **UI game-manage.test.js 7/7**: `admin panel add button follows the media mode…` (:119), `game chip shows platforms and hides movie fields; no platform → Persian toast, no POST` (:132), `a valid game posts to /api/games and appears in the grid` (:176), `probable duplicate game: warns with the title, cancel keeps the modal, continue posts` (:205), `edit modal for a game: platform checkboxes, no movie fields, «حذف بازی», PUT carries the game uid` (:249), `deleting a game confirms, issues the DELETE, and the card disappears` (:298), `restore: game entries toast the game wording and the game returns to the grid` (:319) |

**Acceptance mapping:** AC1 (Series rename) = P6a ✓ · **AC2 ✓** (downscale UI:113, 30 MB UI:238, non-image UI:256, 413/400 server paths) · AC3 = P6b ✓ · **AC4 ✓** (create both copies, delete both → trash, restore) · AC5 = E5 not started · **AC6 ✓** for the new/changed endpoints.

## Decisions taken + assumptions

- **Dispatch, not duplication**: by-uid `game:` prefix → `GameEditor`/`movie-trash` game branch; movie routes and message shapes untouched; the game PUT answers `{success, game}` (additive response key only). **No WS protocol change → no version bump.**
- **All-or-nothing ordering**: creator validates *everything* before the first write and undoes completed copies on a later failure; editor pre-checks every destination (`FILE_EXISTS`) **before** mutating, then executes renames → additions → poster writes → unlinks last (a failed unlink leaves the old title's entry, repaired by the rescan commit — never a half-renamed set).
- **`GameCreator` is async and takes an options object** (`createGame({title, platforms}, buffer, ext)`), `GameEditor.updateGame` is synchronous — externally mirroring the movie services, internally dual-copy aware.
- **Errors map through `GameCreator.statusOf` / `GameEditor.statusOf`** via optional `statusOfFn` on the shared `sendCreateError`/`sendEditError` helpers (Q6 Persian message pattern preserved).
- **Trash**: `_collectGameSources` re-reads `Games/PS4|PS5` from disk (title-keyed), so a game copy added after indexing is still collected; restore counts moves for the «بازگردانی» toast.
- **Game save skips the generic-save confirm** (Q3-style «ادامه می‌دهید؟» dialog) — contract pinned by the red test; movies keep it. Flagged as a question below.
- **`store.fetchGames()` now calls `this._applyFilters()`** on both branches (game grid renders from the filtered list, so add/edit/delete/restore would otherwise show a stale grid); `_scheduleCatalogReload` also refetches games. Minimal fix; the fuller `loadGames()` unification is out of scope.
- **`_isSeries` now excludes games** (games have `id == null` too — the old check mis-classified them); `_updateFieldVisibility` gained ids (`#imdbFieldGroup`, `#plotFieldGroup`) so game mode can hide id/year/genre/imdb/plot while Series keeps its id-hide.
- **Test-infra fixes made while greening**: `ui-stub`'s `/api/games` handler needed a **GET method guard** (the POST from the add modal was answered with `{games}` — silently "succeeding"); the `FILE_EXISTS` unit test needed its parent dir created first. Both are test-setup bugs, not product bugs.
- AGENTS §5 gained `POST /api/movies/preview` in commit 2 and `POST /api/games` in this commit (doc lag found while writing the report).

## Tests: before → after

| Suite | P6b head `003d776` | After E2 (`c998c95`) | **Final (this report)** |
|---|---|---|---|
| Unit (`npm test`) | 561 / 559 pass / 0 fail / 2 todo | 581 / 579 / 0 / 2 (+20 = 5 filename + 11 http + 4 movie-creator) | **606 / 604 / 0 / 2** (+25 E4 = 14 new game-services + 10 http net + 1 movie-trash net: +2 E4 tests, −1 obsolete Q3 `GAME_UNSUPPORTED` boundary test) |
| UI (`npm run test:ui`) | 44 / 44 | 53 (+9 = 8 add-modal + 1 add-flow-real) | **60** (+7 game-manage) |

**Red evidence (test-first):** each red commit ran failing before its feature commit —
- E2 red `3294ff0` (+911): `backend/utils/filename.js` did not exist, no `POST /api/movies/preview` route (404), creator had no structured codes, modal had no downscale/toasts/dup/genre/preview. Green in commits 2–3.
- E4 red `2601b1b` (+1026): the 14 `game-services` tests failed at module load (`backend/services/game-creator` missing), the http `POST /api/games` tests received `{games}` from the handler-less stub (which exposed the missing GET method guard), `game-manage` 7 failed (no platform group, no endpoint), movie-trash still expected `400 GAME_UNSUPPORTED`. Green in commits 5–6.

## User-visible behaviour changes

- **Add modal:** posters > 30 MB are refused before any upload («حجم فایل بیش از حد مجاز است (حداکثر ۳۰ مگابایت)»); valid posters are downscaled with the resulting size shown («حجم نهایی: N KB»); every failure cause has its own Persian toast; a new genre can be created inline («افزودن»); a probable duplicate opens «احتمال تکرار» (never blocks, cancel keeps the modal); the filename preview is the server builder's exact string (debounced).
- **New content type «بازی»** in the add modal (games mode preselects it): platform group **پلتفرم** (PS4/PS5, PS4 pre-checked in games mode), movie-only fields (شناسه/کد، سال انتشار، ژانرها، IMDB، خلاصه داستان) hidden; no platform → «حداقل یک پلتفرم انتخاب کنید» with no request; success → «بازی با موفقیت اضافه شد».
- **Edit modal:** in games mode the title becomes «ویرایش بازی», platform checkboxes replace the movie fields, the delete button reads **«حذف بازی»**, save → «بازی با موفقیت بروزرسانی شد»; game uids no longer hit the movie 400.
- **Admin panel:** the add button follows the media mode («افزودن بازی» / «افزودن فیلم»); restoring a game entry toasts «بازی به کتابخانه بازگردانده شد» and the game reappears in the grid; game cards open edit in admin mode (SELECT → EDIT gate on `isAdmin`).
- **Server:** new `POST /api/games` + `POST /api/movies/preview` (both admin), by-uid PUT/DELETE now serve `game:` uids, trash entries gain `type: 'Game'`. All new user-visible strings are Persian; no existing Persian wording was reworded.

## Verification (raw)

**1/4 `npm test`** → `EXIT=0`
```
ℹ tests 606
ℹ pass 604
ℹ fail 0
ℹ todo 2
```

**2/4 `npm run test:ui`** → `EXIT=1` — **only** the documented P4-C5 perf assertion failed (59/60 green; same single failure in all four full-suite runs this session: `loadCatalogToPaintMs` 326 / 368 / 430 / 618 in-suite)
```
ℹ tests 60
ℹ pass 59
ℹ fail 1
ℹ cancelled 0
ℹ todo 0
P4-C5 metrics: {"firstPaintFullMs":1545,"loadCatalogToPaintMs":326,"selectMs":9,"longTasks":[50,55],"searchMs":258,"cards":40}
AssertionError [ERR_ASSERTION]: first grid paint after data must be ≤ 300ms, got 326ms: {...}
```
Same metric **standalone** (same machine, `node --test test/ui/perf.test.js`) → `EXIT=0`, `loadCatalogToPaintMs: 213` (earlier standalone runs: 244, 231) —
```
P4-C5 metrics: {"firstPaintFullMs":513,"loadCatalogToPaintMs":213,...}
ℹ tests 1
ℹ pass 1
ℹ fail 0
```
The `paint2` path does **not** call `fetchGames`, so E4's store change cannot deterministically affect it; the in-suite gap is same-process/machine load (the runner already uses `--test-concurrency=1`).

**3/4 `node mimo/repro/repro-backend.js`** → `EXIT=0`
```
0 present, 13 fixed, 0 error
```
**4/4 `node mimo/repro/repro-ui.js`** → `EXIT=0`
```
0 present, 4 fixed, 0 error
```

**Boot smoke** (two runs, temp dirs, §6.6):
- Run 1 — empty `LIBRARY_PATH`, `PORT=45731`: alive after 7 s, full startup sequence, «Ready.», stderr empty. **Mistake:** `DATA_DIR` was not set, so the repo's default `data/` was used and `data/catalog.json` (a rebuildable cache, I1) was rewritten to 0 movies; `metadata.json` / `orders.json` / `auth.json` were only read, never written. Self-heals on the next real boot (the scan of the real `Library/` rebuilds it); disclosed under Risks.
- Run 2 (isolated) — empty `LIBRARY_PATH` + empty `DATA_DIR`, `PORT=45732`: alive after 7 s, Steps 1–7 clean, «Ready. Add movies to Library/ and refresh the browser.», stderr empty, isolated catalog written inside the temp dir only.

**Screenshots** (`node mimo/repro/p6c-shots.js`, deterministic ui-stub, frozen CSS, dark theme, both viewports — 12 shots + manifest):
```
mimo/shots/p6c/admin-dark-desktop-add-movie.png            add modal (movie): chips + fields (E2)
mimo/shots/p6c/admin-dark-desktop-add-movie-filename.png   scrolled to the live server-builder filename (E2)
mimo/shots/p6c/admin-dark-desktop-add-game.png             games mode: «بازی» chip, PS4/PS5, movie fields hidden (E4)
mimo/shots/p6c/admin-dark-desktop-dup-confirm.png          «احتمال تکرار» naming «Hades» (warn-never-block)
mimo/shots/p6c/admin-dark-desktop-edit-game.png            «ویرایش بازی» + platforms + «حذف بازی» (E4)
mimo/shots/p6c/admin-dark-desktop-confirm-delete.png       second-click confirm for the game (D6 promise)
mimo/shots/p6c/admin-dark-mobile-*.png                     the same 6 states at 390×844
```

## Risks / could not verify

- **P4-C5 perf flake** (seen in P6a/P6b, dominant here): in-suite `loadCatalogToPaintMs` 326–618 ms vs budget 300, while standalone runs of the identical metric are green (213/231/244). The full UI suite has exited 1 in all four runs this session **only** because of this assertion; every other test (including the whole `game-manage` suite) is green in all runs. Needs a cool-machine re-run or an owner decision (raise budget for in-suite runs / mark `todo`).
- **Smoke-run cache write (my mistake):** boot smoke 1 wrote `data/catalog.json` (cache) with 0 movies because `DATA_DIR` defaulted to the repo. Rebuildable from `Library/` on the next real boot (I1); `metadata.json`/`orders.json`/`auth.json` untouched. Smoke 2 was fully isolated. No `Library/` file was ever touched.
- **No WS broadcast for game mutations** (movies have `movie:updated`/`movie:added`): a *second* open admin screen only learns of game changes on its next REST refetch (the acting screen refreshes itself). Adding `game:*` messages is a protocol change → deliberately out of scope.
- **Manual 20k-fixture walkthrough** from the prompt's Verify section not run (no fixture in the repo, same as P6b); Playwright suites cover the flows against the real app served by the stub, and the standalone perf suite covers the budget.
- **WebP-on-transparency branch** of the downscorer relies on the browser encoder and is not separately asserted (JPEG path is).
- **Native file-input chrome** in the edit modal shows English «No file chosen / Choose File» (browser control, pre-existing, all types) — localising it needs a custom control.
- Screenshot matrix: dark theme only (both required viewports).

## Discovered (out of scope — not in the diff)

- `store.loadCatalog()`'s doc comment claims it fetches games — it never did; the minimal consequence was fixed (`fetchGames()` self-applies filters), a proper `loadGames()` unification remains.
- `IMAGE_EXTENSIONS` is duplicated **3×** (ARCH-03 shrank — filename builder now has one copy — but this one remains).
- My P6a report said `validateMovieInput` is mounted globally; it is only mounted for create/preview — correction for the register.
- AGENTS §3 repo map still lists only `movie-creator.js` under `services/` (movie-trash/editor + the new game services and `utils/filename.js` are missing); §5 was fixed in commits 2 and 7 — §3 follow-up left for a later docs pass (P6a/P6b precedent: §3 was not updated when services were added).
- `GET /api/game-poster/:title` has no ui-stub handler (cards render anyway) — stub gap only.
- Persian test titles in `game-manage.test.js` render as mojibake in the Windows console (cosmetic; files themselves are UTF-8 clean).

## Files changed (26 code/doc files + 13 shot artifacts)

```
AGENTS.md                          §5 REST: + POST /api/movies/preview (c2), + POST /api/games (this commit)
backend/utils/filename.js          NEW: the single filename builder (I4) incl. buildGameFilename (E2/ARCH-03)
backend/services/movie-creator.js  structured error codes, shared builder, preview support (E2)
backend/services/movie-editor.js   shared builder + GAME_UNSUPPORTED guard for game uids (E2/E4)
backend/services/game-creator.js   NEW: async createGame, all-or-nothing per-platform writes (E4)
backend/services/game-editor.js    NEW: plan-then-execute updateGame (renames/additions/posters/unlinks)
backend/services/movie-trash.js    game delete/restore via _collectGameSources, type 'Game' entries (E4)
backend/indexer.js                 removeGame(title) + getGameByTitle re-lookup (E4)
server.js                          preview + games routes, service wiring, game: dispatch, statusOf hooks
js/components/add-modal.js         downscale/toasts/inline genre/dup/preview + «بازی» chip/platforms (E2+E4)
js/components/edit-modal.js        game mode (#editPlatforms, «ویرایش بازی»/«حذف بازی», skip Q3 confirm)
js/components/movie-card.js        SELECT→EDIT gate on isAdmin (Q4)
js/components/movie-detail.js      same gate + «ویرایش بازی» label (Q4)
js/components/admin-panel.js       media-mode add label, game restore toast + fetchGames
js/store.js                        fetchGames→_applyFilters, _scheduleCatalogReload→fetchGames
css/components.css                 poster size hint, dup dialog, platform group, game field hiding
test/helpers/ui-stub.js            preview + games handlers, GET method guard, seeds (test-only)
test/helpers/safe-port.js          E2 test-infra adjustment
test/helpers/test-server.js        E2 test-infra adjustment
test/unit/filename.test.js         NEW, 5 tests (E2)
test/unit/http.test.js             +11 E2, +10 net E4, 1 rewritten (game delete semantics)
test/unit/movie-creator.test.js    +4 structured-code tests (E2)
test/unit/game-services.test.js    NEW, 14 tests (GameCreator/GameEditor/movie-editor guard)
test/unit/movie-trash.test.js      +2 game E4, −1 obsolete Q3 boundary test (net +1)
test/ui/add-modal.test.js          NEW, 8 tests (E2)
test/ui/add-flow-real.test.js      NEW, 1 end-to-end genre-folder test (E2)
test/ui/game-manage.test.js        NEW, 7 tests (E4)
mimo/repro/p6c-shots.js            screenshot harness, 6 states × 2 viewports
mimo/shots/p6c/*                   12 PNGs + manifest.txt
mimo/PHASE-REPORT-P6c.md           this report
```

## Questions for the owner

1. **Next scope** — E5 (orders workflow) and E6 (D1 documentation) remain; is P6d = E5? (Stopped here as instructed.)
2. **P4-C5 in-suite flake** — re-run on a cool machine, raise the in-suite budget, or move the metric to `todo`? (Standalone is green; 59/60 UI tests green in all four runs.)
3. **Game save confirm** — game saves currently post immediately (the red-test contract); movies keep the «ادامه می‌دهید؟» dialog. Keep the asymmetry or add the confirm for games?
4. **WS for games** — schedule `game:added`/`game:updated`/`game:deleted` broadcasts (protocol bump) in a later phase, or accept REST-refetch-only?
5. **Screenshots** — dark theme only at both viewports, as in P6b; is a light-theme round wanted?

**Stopped here as instructed — E5/E6 and P6-B (D1 unchanged) not started.**
