# PHASE REPORT - P6a edit modal (E1)

Branch: `phase/P6a-edit-modal` (from `c823464` = P5c head) — Commits: 6 build commits (+ this report)

Scope per `mimo/prompts/P6-manager-features.md`: **task E1 only** (genre editing, poster replacement, inline Persian validation in the edit modal). Owner instruction: implement after plan + STOP-GATE answers; **stop after this report — do not start P6b/E2-E6 or any later phase.**

## Commits

| # | Commit | Content |
|---|---|---|
| 1 | `7cd1ee4` | `test(p6a): failing tests — E1 genre edit, poster replace, inline validation [FE-05,FE-13]` — TDD red first (24 tests: 18 movie-editor + 6 http, plus the 6 UI tests in the new file; ui-stub gained `failState`/`failPut`) |
| 2 | `74437fd` | `feat(p6a): MovieEditor genre edits + poster replace with plan-then-execute rollback [FE-05,FE-13]` |
| 3 | `303c81a` | `feat(p6a): shared poster decode, PUT by-uid poster body, guard exemption, error codes [FE-13]` |
| 4 | `9dd8628` | `feat(p6a): edit modal genre chips, poster replace, code-mapped inline errors [FE-05,FE-13]` |
| 5 | `2163eb4` | `test(p6a): FE-13 — >100KB create poster must not be blocked by body guard [FE-13]` |

## Requirement → test evidence

### FE-05 (P6 portion) — edit modal: genres + poster + inline errors
(The P3 portion — Series edited via canonical by-uid URL instead of `PUT /api/movies/null` — was already closed in P3; this phase makes the modal a complete editor.)

| Change | File | Evidence |
|---|---|---|
| `MovieEditor.updateMovie(uid, patch, options)` — plan-then-mutate: renames → genre additions → additions-before-removals → removals (move-aside to `os.tmpdir()`) → poster (backup all → write-new → delete-old); single reverse undo stack; phase-aware error codes; `watcher.expect` once with a deduped path Set | `backend/services/movie-editor.js` | movie-editor tests **18/18**: `E1 genre add …`, `E1 genre remove …` (×2 incl. `absolutePosterPath` repoint), `E1 genre edit: combined …`, `E1 genre rollback …`, `E1 genre add: pre-existing unindexed file at target → 409 FILE_EXISTS`, `E1: genres patch on a Series → 400 NON_MOVIE_GENRE_EDIT`, `E1: empty genres … → 400 GENRE_REQUIRED`, `E1: non-array genres → 400 GENRE_INVALID`, `E1: unsafe genre name (traversal) …`, `E1 poster replace:` ext-change / same-ext / `IMG_UNSUPPORTED`, both **write-new rollback** tests (thrown failure → old files untouched, no new-ext file remains), `watcher.expect` paths, `E1 combined patch: rename + genre change + poster replace`, `E1 codes (Q6)` |
| Genre UI: checkbox chips for Movie only (`store.state.genres` + own genres, imperative `checked`); no genre section for Series | `js/components/edit-modal.js` | UI test `renders genre checkboxes + poster input for a Movie; no genre section for Series` |
| Poster input: file picker, client ext pre-check (`jpg jpeg png webp avif`) | `js/components/edit-modal.js` | same UI test (poster input present) |
| One merged confirm (names the genres being removed); **no PUT before confirm**; exact patch after | `js/components/edit-modal.js` | UI `removing a genre: one confirm naming it, no PUT before confirm, exact patch after`, `adding a genre: checked value included in the PUT patch` |
| Client validation → inline field error **before** any confirm/request | `js/components/edit-modal.js` | UI `empty title: inline field error before any confirm or PUT` |
| Inline error slots + code → field mapping (Q6) | `js/components/edit-modal.js` | UI `server 409 ID_TAKEN maps to the inline ID field error; modal stays open`, `unmapped server error code shows the form-level inline alert with the Persian text` |
| Error styles (field + form-level alert) | `css/components.css` | exercised by all UI error tests; `--color-accent-danger` token (both themes) |

### FE-13 — poster size limit on movie routes + structured codes

Register symptom: *adding a movie fails for posters larger than ~75 KB (`express.json()` 100 KB default), shown as "server connection error"*.

| Change | File | Evidence |
|---|---|---|
| 100 KB Content-Length guard exempts **`POST /api/movies`** (create) and **`PUT /api/movies/*`** (edit, Q1); `express.json({limit:'12mb'})`; 8 MB decoded cap + magic bytes via shared `decodePosterPayload`/`decodePosterOption` | `server.js` | **new** defects test `FE-13: POST /api/movies accepts a >100KB poster body (guard exemption)` — body 214 KB, explicit `Content-Length`, expects 200 + file written with matching bytes. **Sensitivity proof:** temporarily removing the POST exemption line → red `413 Request body too large` (`%TEMP%\p6a-fe13-red.log`, defects.test.js:1413) → restored → green. `express.json` 12 mb + POST exemption predate P6a (landed with SEC-06); P6a added the **PUT** exemption and pins both with tests. |
| PUT by-uid carries optional base64 poster in the same request | `server.js` | http `allows a >100KB poster PUT body (guard exemption for by-uid)`, `replaces poster bytes on disk for a valid payload (single PUT, Q1)` |
| Magic-byte/size rejection codes surfaced instead of generic failure | `server.js` | http `rejects a disguised non-image poster with IMG_UNSUPPORTED; file untouched` (+ pre-existing S6 >8MB 413 test still green) |

## Owner decisions applied (STOP-GATE answers)

| Q | Decision applied |
|---|---|
| Q1 | Poster travels in the same `PUT /api/movies/by-uid/:uid` as `{..., poster: 'data:…;base64,…'}`; shared decoder; body-guard exemption for the PUT route; modal always uses the canonical by-uid URL for all types. |
| Q2 | Genres = checkboxes from `store.state.genres` (existing genres only; creating a new genre = E2). Genres patch on a non-Movie → `400 NON_MOVIE_GENRE_EDIT`. Movie must keep ≥1 genre → `400 GENRE_REQUIRED`. |
| Q3 | Exactly **one** merged confirm dialog (D7 in-app, no `window.confirm`); when genres are removed the message names them. |
| Q4 | `updateMovie` exec order: renames → genre additions → removals (additions before removals — the source may be a file being removed) → poster. |
| Q5 (owner-adjusted) | Crash-window wording per owner: a **hard kill** between write-new and delete-old leaves two same-id files → surfaces as **DATA-05 duplicate-ID diagnostic on the next scan, never a silent merge**; any **caught** exception during write-new → full rollback (tested: injected thrown failure during write-new in both ext-change and same-ext variants → old files untouched, no new-ext file). Documented in the `movie-editor.js` docstring. |
| Q6 (owner-replaced) | **Structured error codes** instead of Persian-prefix parsing: `TITLE_REQUIRED`, `ID_REQUIRED`, `YEAR_INVALID`, `GENRE_REQUIRED`, `GENRE_INVALID`, `NON_MOVIE_GENRE_EDIT`, `IMG_UNSUPPORTED`, `IMG_TOO_LARGE`, `IMG_INVALID`, `IMG_REQUIRED` (POST), `GENRE_OP_FAILED`, `POSTER_WRITE_FAILED` + existing `ID_TAKEN`/`FILE_EXISTS`/`NOT_FOUND`/`RENAME_FAILED`. Client maps UI slot off `code`; Persian text is **displayed verbatim, never parsed**. Assumption: `validateMovieInput` middleware errors carry no code → form-level inline alert (covered by the UI test with `code:'WEIRD_INTERNAL'`). |

## Tests: before → after

| Suite | Before (`c823464`) | After | New tests |
|---|---|---|---|
| Unit (`npm test`) | 511 / 509 pass / 0 fail / 2 todo | **536 / 534 / 0 / 2** | +25 = 18 movie-editor E1 + 6 http E1 + 1 defects FE-13 |
| UI (`npm run test:ui`) | 32 / 32 | **38 / 38** | +6 (new `test/ui/edit-modal.test.js`) |

**Red evidence (test-first):**
- TDD red run: unit `535 / 510 pass / 23 fail / 2 todo` — 23 of the 24 new unit tests failed before commits 2–3 (the one already-green was `requires admin auth for poster PUT (401)` — `requireAdmin` predates P6a). UI red: `38 / 31 / 7` = my 6 edit-modal tests + the P4-C5 perf flake (see Risks).
- FE-13 sensitivity red described above (guard-exemption line removed → 413).

## User-visible behaviour changes

- Edit modal (manager): new **«ژانرها»** checkbox-chip section (Movie only), **«پوستر فیلم»** file picker with chosen-file name, and **inline Persian errors** directly under the failing field (or a form-level alert) instead of toast-only feedback; the save button keeps its loading state; saving always targets the canonical by-uid URL.
- One confirmation dialog before saving; when genres were unticked it lists them («ژانرهای حذف‌شده: …») and warns the folder copy will be deleted.
- Client-side validation (required title, required ID for non-Series, ≥1 genre for Movie, poster extension) blocks the confirm/request until fixed.
- Server: edit/create errors now carry a structured `code` beside the Persian message; >100 KB poster bodies are accepted on movie create/edit routes (up to the 8 MB decoded cap).
- All new user-visible strings are Persian; no existing Persian wording was reworded.

## Verification (raw)

**1/4 `npm test`** → `EXIT=0`
```
ℹ tests 536
ℹ pass 534
ℹ fail 0
ℹ todo 2
```
**2/4 `npm run test:ui`** → `EXIT=0`
```
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ todo 0
```
(run-on-cool-machine; see Risks for two load-sensitive flakes observed on warm runs)

**3/4 `node mimo/repro/repro-backend.js`** → `EXIT=0`
```
… 13 FIXED lines (DATA-01…18, SEC-03, SEC-04-era ids as printed)
0 present, 13 fixed, 0 error
```
**4/4 `node mimo/repro/repro-ui.js`** → `EXIT=0`
```
FIXED FE-01 / FE-02 / SEC-04 / FE-04
0 present, 4 fixed, 0 error
```
**Boot smoke** `node server.js` with empty temp `LIBRARY_PATH`/`DATA_DIR`, `PORT=3999`: alive after 5 s, full startup sequence clean, stderr empty, “Ready.” reached, no new console noise. (Persian banner glyphs render as mojibake in the PowerShell capture only — display artifact, unchanged.)

## Risks / could not verify

- **P4-C5 perf budget (`loadCatalogToPaintMs ≤ 300ms`) is load-sensitive.** Observed: 150 ms (solo), 235/291 ms (cool full runs) → pass; 367/373/519 ms immediately after `npm test` → fail. The metric measures `double rAF` after `loadCatalog()`; Chromium/GC contention on this machine (≈2 GB free RAM with user browsers open) pushes rAF delivery past 300 ms. Re-run solo: `EXIT=0` with 150 ms. No app code in the P6a diff touches store/grid/card; the file is unchanged vs baseline.
- **P4-C4 login test intermittent 2/7 this session** (timeout waiting `#adminPanel:not(.hidden)` 5 s): both failures occurred in the warm window right after a full UI suite; 5 subsequent runs passed (3/3 isolated back-to-back). `ui.test.js`, `login-modal.js`, `store.js`, `app.js` and the ui-stub login endpoint are all **unchanged vs baseline**; the only front-end diff (edit-modal module eval, additive CSS) is on the boot path that demonstrably works in every run (login modal opens, fills succeed). Treated as environmental like P4-C5; **not** hardened (changing P4 budgets/timeouts is out of scope).
- **Q5 crash window** (accepted by owner): hard kill mid-poster-write → duplicate-id files on disk → DATA-05 diagnostic on next scan; no silent merge. Caught-exception rollback is tested.
- Genre folder copies verified only in temp fixture trees — the real `Library/` and `data/` were never touched (per §6.6).

## Discovered (out of scope — not in the diff)

- `validateMovieInput` passes `title` through `safeSegment()`, which throws a plain `Error` (no `status`/`code`) → route answers **500** for unsafe-title input instead of a coded 400. Pre-existing; unmapped errors fall back to the form-level alert on the client.
- FE-13 mentions **client-side poster downscaling**; the server now accepts ≤ 8 MB, but no downscale exists in `add-modal.js`. Whether any P6 task requires it is an owner call.
- Baseline already had `express.json({limit:'12mb'})` + the POST exemption (SEC-06); FE-13 was effectively server-side-fixed before P6a — P6a added the PUT exemption, the shared decoder, codes, and both missing success-path tests.
- P4-C5/P4-C4 environmental sensitivity (numbers above) — candidate for a machine-load note in future perf phases.
- Unused helpers flagged in FE-09 remain (P7): `escapeHtml`, `formatNumber`, `genreClass`, `truncate`, unused `throttle` import.

## Files changed (9 + this report)

```
backend/services/movie-editor.js   E1 core: genres + poster + plan-then-execute rollback + codes
server.js                          shared poster decode, PUT guard exemption, sendEditError code, route refactor
js/components/edit-modal.js        genre chips, poster input, inline errors, code→field map, by-uid save
css/components.css                 .edit-form-error / .edit-genre-list / .edit-poster-name styles
test/helpers/ui-stub.js            failState/failPut injection + genres on PUT (test-only)
test/unit/movie-editor.test.js     +18 E1 tests
test/unit/http.test.js             +6 E1 tests
test/unit/defects.test.js          +1 FE-13 test
test/ui/edit-modal.test.js         new file, +6 tests
```

## Questions for the owner

1. **P6b scope** — E2–E6 as listed in the prompt (add-modal validation, diagnostics, D6 soft-delete…)? Which tasks exactly, and does D6 (soft-delete) enter P6b?
2. **FE-13 downscale** — required in some later task, or should the register line be trimmed to the server-side limit (now tested)?
3. **Perf/login flakes (P4-C5, P4-C4)** — leave budgets as-is (green on a quiet machine, documented above), or schedule a hardening pass?

**Stopped here as instructed — P6b/E2–E6 not started.**
