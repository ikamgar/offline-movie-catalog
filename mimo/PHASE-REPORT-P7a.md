# PHASE REPORT — P7a lint, single source of truth, type comments

Branch / commits: `phase/P7a-lint-sot` (from `c98cce7`), 9 commits, 50 files changed (+2003 / −155):

- `ebfa8a2` chore(p7a): add ESLint flat config and lint script, fix backend/server findings [ARCH-01]
- `f13aec1` chore(p7a): fix front-end and test lint findings [ARCH-01]
- `145eb0d` chore(p7a): declare js/ as an ES module package, silencing MODULE_TYPELESS warnings [ARCH-01]
- `e982976` refactor(p7a): single-source backend constants and series-key [ARCH-03]
- `55c0088` feat(p7a): serve GET /api/config from backend constants and package.json [ARCH-03]
- `74e0fdf` refactor(p7a): single-source the version from package.json [ARCH-01]
- `932737d` feat(p7a): front end consumes GET /api/config - labels, pins, extensions, version [ARCH-01, ARCH-03]
- `9933577` docs(p7a): JSDoc typedefs in docs/types.js and store public-method docs [P7a-F3]
- `77a7854` refactor(p7a): image extensions and series key read from the single source [ARCH-03]

## Requirement → evidence

| Task | Acceptance criterion | Evidence |
|---|---|---|
| F1 | `npm run lint` exits 0, no mass-disabling | `eslint.config.js` (159 lines): flat config, only intentional overrides (test Node globals, `mimo/**` + `docs/**` excluded per approved STOP-GATE); rules fixed in code, not suppressed. Raw run below: no output, exit 0. 365 problems / 30 files → 0. |
| F2 | Version defined once, read from `package.json` | `grep "5.4\.0" -- *.js *.bat *.html` clean (exit 1). `APP_VERSION` (server.js) → banner, both meta tags, `GET /api/config`; indexer meta; `Start.bat`/`install.bat` via `node -p "require('./package.json').version"` (manual run prints `Movie Catalog v5.4.0`); p3h repro resolves baseline tag at runtime; fixtures use `'0.0'`. |
| F2 | `GET /api/config` serves version + shared constants | Route in server.js returning `publicConfig(APP_VERSION)` from `backend/constants.js` (version, protocol, mediaTypes, movieTypes, imageExtensions, typeLabels, badgeLabels, pinnedGenres); AGENTS.md §5 updated; `test/unit/http.test.js` asserts payload equals `package.json.version`. |
| F2 | ARCH-03 collapse | Front end stopped embedding constants: new `js/config.js` (`applyConfig`, filled at boot from `/api/config`); `GENRE_COLORS`, `TYPE_LABELS`, media-type and extension lists deleted from `js/` (grep: zero leftovers). |
| F3 | `docs/types.js` typedefs, store JSDoc, no new deps | New comments-only `docs/types.js` (206 lines: Movie/MovieType/MediaType/Game/Order/ApiError/AppConfig + 13 WS message typedefs, shapes verified against `toPublicMovie`, `order-manager`, ws-server payload sites); 14 store public methods JSDoc'd; zero new runtime/dev deps beyond `eslint` (dev). |

### AC3 single-definition greps (final state)

```
--- image extensions:
backend/constants.js:34:const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

--- series uid builders (all compose canonical seriesKey):
backend/indexer.js:65:  if (type === 'Series') return 'series:' + seriesKey(title);
backend/services/movie-editor.js:215:    const nextUid = isSeries ? 'series:' + nextKey : String(nextId);
backend/storage/metadata-store.js:106:          ? 'series:' + seriesKey(movie.title)
test/helpers/ui-stub.js:240:            m.uid = 'series:' + seriesKey(String(patch.title));
```

- media-type list: `backend/constants.js:28` (`MEDIA_TYPES`) and `:31` (`MOVIE_TYPES`) are the two intentional constants; the only other literal is `test/ui/ui.test.js:255` — kept deliberately as an independent test fixture.
- genre colour map: `js/utils/helpers.js:77` only.
- filename builder: `backend/utils/filename.js:44` only (4 call sites).
- roles: `WS_ROLES` defined once in `backend/constants.js`, consumed by `role-provider.js` and `ws-server.js`.
- Backend IMAGE_EXTENSIONS copies found by the AC3 grep in 4 services (movie/game creator+editor) and a second series-key normalisation in `backend/diagnostics.js` were fixed in `77a7854`.

## Defects closed

- **ARCH-01 (lint + hard-coded-version parts)** — lint exit 0; version single-sourced; todo markers removed (todo 0). *CI part stays open → F5.*
- **ARCH-03** — every AC3 constant now has exactly one definition (greps above); `GET /api/config` exposes the backend list to the front end.
- **F1, F2, F3** — all ACs met (table).

## Defects partially closed or deferred

- ARCH-01 CI absence → **F5** (out of P7a scope); ARCH-02 (README) → **F4** (P7b); register file intentionally untouched (todo flips recorded here only).

## Files changed (grouped)

- Lint: `eslint.config.js`, `package.json`, `package-lock.json`; fixes across `backend/` (5), `server.js`, `server/realtime/ws-server.js`, `js/` (7), `test/` (7).
- SoT: `backend/constants.js` (new), `backend/utils/series-key.js` (new), parser/indexer/movie-creator/metadata-store/movie-trash/server.js/ws-server/role-provider rewired; 4 services + `diagnostics.js` image-extension/series-key fold-in (`77a7854`).
- Config route: `server.js`, `test/unit/http.test.js`, `test/helpers/ui-stub.js`, `mimo/repro/repro-ui.js`, `AGENTS.md`.
- Version: `server.js`, `backend/indexer.js`, `Start.bat`, `install.bat`, `mimo/repro/p3h-css-sweep.js`, fixtures (`defects.test.js`, `metadata-store.test.js`, `http.test.js`).
- Front end: `js/config.js` (new), `js/package.json`, `js/app.js`, `js/store.js`, `js/utils/{search,helpers}.js`, add/edit modals, `test/unit/search.test.js`.
- Docs: `docs/types.js` (new), store JSDoc.
- New tests: `test/unit/constants.test.js`, `test/unit/esm-package.test.js`, `test/unit/http.test.js` config test.

## Tests: total / passing / todo — before → after

- unit: **622 / 620 / 2 → 635 / 635 / 0**
- UI: **69 + 1 perf / 69 + 1 / 0 → 69 + 1 / 69 + 1 / 0** (same scope; `ui-stub` config route added)
- lint: **365 problems (30 files) → 0**
- MODULE_TYPELESS warnings: **present → 0**

## Raw verification output (final state, `77a7854`)

```
> npm run lint (npx eslint .)
(no output)
EXIT=0
```

```
ℹ tests 635
ℹ suites 145
ℹ pass 635
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 25234.9285
TEST_EXIT=0   (MODULE_TYPELESS=0)
```

```
npm run test:ui — EXIT=0
ℹ tests 69
ℹ suites 23
ℹ pass 69
ℹ fail 0
ℹ skipped 0
ℹ todo 0
… P4-C5 metrics: {"firstPaintFullMs":304,"loadCatalogToPaintMs":114,"selectMs":11,"longTasks":[],"searchMs":264,"cards":40}
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ todo 0
```

```
node mimo/repro/repro-backend.js
… (13 FIXED lines: DATA-12, DATA-17, DATA-18, DATA-11, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, SEC-03, DATA-02, DATA-01, DATA-03)
0 present, 13 fixed, 0 error
EXIT=0

node mimo/repro/repro-ui.js
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error
EXIT=0
```

## Decisions taken

- Approved STOP-GATE defaults: `eslint@^9`; `mimo/**`, `docs/**` lint-excluded; baseline tag resolved at runtime via `git tag -l "baseline-*" --sort=-v:refname` (fails fast if none — sole tag `baseline-5.4.0`); F3 scope = `docs/types.js` + 14 store public methods.
- `js/package.json` minimal-but-public note implemented as a valid-JSON `"//"` key (owner override: no LICENSE file in P7).
- ARCH-01/ARCH-03 closure recorded here only; `mimo/DEFECT-REGISTER.md` untouched.
- `test/ui/ui.test.js:256` media-type literal kept explicit (test-independence fixture); `ui-stub` next-id list switched to `MOVIE_TYPES`.
- Changelog comments `v5.4.0:` reworded (ARCH-01 lint regex catches versions in comments) — comments only, no behaviour.
- Assumptions: ARCH-01 = lint + version halves of the register entry; CI half belongs to F5.

## User-visible behaviour changes

- New endpoint `GET /api/config` (additive, public).
- None other: header version still shows `v5.4.0` (now sourced from `package.json`); genre pins, type/badge labels and accepted image extensions served by the backend with identical values; all Persian strings byte-identical (diff of ± lines containing Arabic script: empty).

## Risks / could not verify

- `npm audit --omit=dev`: 3 moderate, pre-existing (addressed by F5).
- ESLint on Node 18 not executed locally (host is Node 24); ESLint 9.39 declares Node ≥18.18 — F5 CI must confirm.
- `.bat` version extraction verified by running the snippet, not by a full double-click of `Start.bat`.
- No scan of the real `Library/` (forbidden) — repros used temp dirs.

## Discovered (out of scope)

- `backend/services/movie-trash.js` maintains its own game-key normalisation (commented "indexer `_gameKey` parity") — a `game-key` SoT module would mirror `series-key` in a future phase.
- `test/helpers/ui-stub.js` echoes the WS `protocol: 3` literal; a protocol bump would silently desynchronise the stub (client does not validate today).
- `backend/indexer.js` `_gameKey` is the implicit game-key canonical.
- ARCH-01's CI half (F5) and README accuracy (ARCH-02 / F4) remain open.

## Questions for the owner

- Proceed to **P7b (F4 README / ARCH-02)** next?
