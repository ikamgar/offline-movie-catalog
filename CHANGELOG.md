# Changelog

All notable changes to the Offline Movie Catalog, one entry per phase, in
reverse chronological order. Defect IDs and findings refer to the internal
quality and security remediation program (detailed internal verification records
are retained in private project archives).
Format follows [Keep a Changelog](https://keepachangelog.com/). Phases are
not dated releases — see `git history` for dates.

## [6.0.1] — 2026-11-06

Maintenance and repository-hygiene release following the public repository privacy and artifact audit.

### Changed & Maintained

- **Repository Hygiene & Privacy:** Removed internal development artifacts, temporary phase reports, reproduction test scripts, and private audit records (`mimo/`, `AGENTS.md`, and `docs/audit/`) from the current public repository.
- **Reference Cleanup:** Eliminated obsolete development-only references, debug scripts, and internal artifact paths across documentation, package scripts, and test helpers.
- **Git Ignore Hardening:** Strengthened `.gitignore` rules to reliably prevent accidental commits of runtime databases, local configuration (`config.json`, `.env`), temporary files, debug logs, and test screenshot artifacts, while explicitly ensuring example configuration templates (`config.example.json`, `.env.example`, `.env.sample`) remain trackable.
- **Documentation & Tooling:** Maintained and sanitized developer documentation (`docs/CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/types.js`, `README.md`), updated ESLint ignore configuration, and aligned CI test artifact paths with the sanitized open-source repository layout.

## [6.0.0] — 2026-11-05

Comprehensive production release upgrading the Offline Movie Catalog from the v5.4.0 baseline.

### Summary of Changes Since 5.4.0

- **Security:** Strict authentication on all mutating admin REST routes via Bearer token (`requireAdmin`, SEC-02); first-run PBKDF2 admin password setup over loopback only (SEC-05); CSP, nosniff, and frame protections (SEC-07); HTML/XSS escaping with zero raw HTML injection (SEC-04); path traversal prevention (`safe-path.js`, SEC-03); poster upload sniffing rejecting ISO-BMFF/HTML/PHP binaries (F32); WebSocket role authorization and message rate limiting (SEC-06, F1); CSV formula neutralization in order exports (F42).
- **Durable Storage:** Atomic JSON persistence (`writeJsonAtomic`) with tempfile write, `fs.fsyncSync` buffer flush, and rename-with-retry across Windows file locks (I13); corruption auto-quarantine for `data/auth.json` (F39); rolling backups of orders, metadata, catalog, and auth.
- **Catalog Fixes:** Filesystem is source of truth (I1); numeric ID preservation with leading zeros (I2); multi-genre movie synchronization across genre folders (DATA-03); Series identity normalisation (I5); Games catalog support with PS4/PS5 platform merging (I8, F31); non-destructive watcher that retains ratings/summaries on hot renames (DATA-01, DATA-02).
- **Manager Features:** Soft-delete trash bin with full metadata restoration (`Library/.trash/`, P6b); in-place metadata editor for IMDb ratings and Persian plot summaries (P6a); real-time WebSocket selection observation and order management (P6d) with soft delete and undo window; CSV export with Excel-compatible UTF-8 BOM and formula neutralization; print view with barcodes and styled RTL receipts (P3g).
- **Launchers, Config & Logging:** Robust Windows launchers (`Start.bat`, `Stop.bat`, `install.bat`); supervisor process (`scripts/supervisor.js`) with crash backoff and automatic child restart; graceful shutdown via `logs/stop.request` detected in ≤ 1 second; zero-secrets request logging with 7-day log rotation (`server/logger.js`); LAN URL banner printing IPv4 network addresses on boot.
- **Thumbnails & Font:** On-the-fly WebP thumbnail generation via optional `sharp` with cache in `data/thumbs` (FE-12, D4) and graceful fail-open fallback; bundled offline Vazirmatn variable font for crisp Persian typography without internet connection.
- **Startup Speed:** Instant server boot from `data/catalog.json` cache with non-blocking background library reconciliation (G6); cached payloads for `/api/movies` and `/api/games` with sha1 ETags and 304 Not Modified support.
- **Audit Fixes:** Comprehensive resolution of all 42 audit findings (F1–F42); 100% of codebase ledger audited; all 14 domain invariants verified; mutation test harness verifying test gap closures (F33 save honesty, WebSocket timers, genre limits, games ETag invalidation, search prefix boost, series-key whitespace collapsing).

### Upgrade Notes

- **First-run Admin Setup:** The old hardcoded `admin` / `123456` login has been removed. On first run, access `http://localhost:3000` directly from the server machine to create an admin password.
- **New Runtime Directories:** `data/metadata.json` (stores manager-entered IMDb ratings and plot summaries separately from catalog cache) and `data/thumbs/` (stores WebP poster thumbnails) are created automatically inside `data/`.
- **Manager Guide:** Comprehensive Persian documentation is available in [`docs/راهنمای-مدیر.md`](docs/راهنمای-مدیر.md).

## [Unreleased] — R5 final remediation (F42, surviving-mutant test gap closure, audit verification)

### Fixed & Hardened

- **F42 — CSV formula neutralisation in order exports.** In `js/utils/csv.js` (`buildOrdersCsv` and `csvCell`), any exported field starting with a formula trigger character (`=`, `+`, `-`, `@`, `\t`, `\r`) is prefixed with a single quote (`'`) to neutralize spreadsheet formula injection (CWE-1236) in Excel/LibreOffice, while preserving UTF-8 BOM, existing quote escaping, and Persian text. Added unit tests in `test/unit/csv.test.js` and documented in `README.md`.
- **FIX-F38-FAILOPEN — Thumbs fail-open test gap.** In `test/unit/thumbs.test.js`, asserted that when `data/thumbs` exists as a regular file before server startup (blocking directory creation), the poster route serves the original poster bytes with HTTP 200 without throwing.
- **ETAG-GAMES-INVALIDATE — Games ETag payload invalidation test gap.** In `test/unit/etag-coverage.test.js`, added step 17 asserting that an external game poster added to disk moves the `/api/games` ETag after watcher debounce and indexer change.
- **FIX-WS-CLEARINTERVAL — WebSocket timers test gap.** In `test/unit/ws.test.js`, asserted that the heartbeat interval timer (`_heartbeatTimer`) is destroyed via `clearInterval` on server close and that socket abort/handshake timers are destroyed on socket close and server stop.
- **VALIDATE-INPUT-GENRES-CAP — Genre array limit test gap.** In `test/unit/validate-input.test.js`, asserted exact boundary: 30 genres is accepted (`ok: true`), 31 genres returns 400 `GENRE_INVALID` (`تعداد ژانرها بیش از حد مجاز است`).
- **FIX-F15-RECONCILE-WARN — Reconcile swap guard fix & negative warning branch.** Fixed bug in `server.js:631` where `indexer.getMovieCount()` was called instead of `indexer.count`, causing TypeError on cacheless boot; in `test/unit/reconcile-failure.test.js`, asserted that a missing library root on a fresh clone reports `library root unreadable before swap` without claiming `keeping cached catalog`.
- **Surviving mutants classification in docs/audit/AUDIT-P9d1.md.** Classified all 6 equivalent/redundant surviving mutants as defence-in-depth protections.
- **docs/audit/AUDIT-P9d2.md correction.** Corrected reference from Owner Decision D7 (Series/Serries folder naming) to FE-14 dialog accessibility.

## [Unreleased] — R4 test gap closure & cleanups (F1, F32, F16, FE-11/F5, F2, F26, F27/F25, F6, F7, F8, F15, F24)

### Fixed & Cleanups

- **F1 — WebSocket heartbeat & rate limiting tests.** Protocol ping/pong terminates dead sockets within injectable window; rate-limiting closes flooding clients (>30 msgs/s) with code 4008 while 30/s stays open; heartbeat interval cleanly cleared on close and server stop.
- **F32 — Poster upload sniffing across all routes.** Poster uploads on POST /api/movies, POST /api/games, PUT /api/movies/by-uid/:uid, and POST /api/movies/preview strictly validate image magic bytes. ISO-BMFF containers (brands isom, mp42, 3gp5), HTML, and PHP scripts are rejected with `IMG_UNSUPPORTED` (400); AVIF (avif/avis), JPEG, PNG, and WebP are accepted.
- **F16 — Order size cap boundary.** Enforced exact 500-item order boundary (500 accepted, 501 rejected with Persian validation message).
- **FE-11 (F5) — Admin empty-state UI.** Corrected Persian string assertion in rendered admin-panel empty state.
- **Sort (Invariant I11) — Persian and English article stripping.** Series titles starting with «یک » and «آن » sort by remainder in both directions alongside English The/A/An.
- **F2 — Live createServer references.** `createServer()` exposes live instances for `wsServer`, `diagnostics`, `movieCreator`, `movieEditor`, `movieTrash`, and `watcher` via getters after `start()`.
- **F26 — Shared game-key normaliser.** Extracted canonical `gameKey` helper to `backend/utils/game-key.js`, unified across `CatalogIndexer`, `GameEditor`, and `MovieTrash` with parity tests.
- **F27/F25 — UI stub protocol version & game-poster route.** `ui-stub.js` imports `PROTOCOL_VERSION` from `backend/constants.js` and serves stubbed SVGs for `/api/game-poster/`.
- **F6 — Removed unused export.** Removed dead `escapeHtml` export from `js/utils/helpers.js` (0 references).
- **F7 — Fixture library unique titles.** Updated `scripts/make-fixture-library.js` series and games loops to generate cycle-suffixed unique titles without overwriting files.
- **F8 — Playwright browser availability check.** `scripts/run-tests.js` and UI tests verify Chromium browser presence before launching, printing a clear instruction (`npx playwright install chromium`) instead of crashing.
- **F15 — Pristine clone warning cleanup.** Reconcile catch handler checks for cache existence before warning; fresh clones without a cache do not claim "keeping cached catalog".
- **F24 — Updated documentation.** Updated repository map, routes, error codes, and invariants. Documented accepted limitations (F4, F9, F10, F11, F17, F18, F19, F20, F21, F22, F23) in README.

## [Unreleased] — R3 validation & auth hardening (F29, F30, F31-watcher, F32, F35, F36, F38, F39, F40)

### Fixed

- **F29/F36 — shared input validator for create/edit/preview.** New
  `backend/utils/validate-input.js` used by POST /api/movies, POST /api/games,
  PUT /api/movies/by-uid/:uid, PUT /api/movies/:id and POST /api/movies/preview.
  Wrong-typed or malformed input (genres as string, numeric id, null/array title,
  object poster, 300-char strings, path characters) returns structured 400 with
  code + Persian message — never a 500 with raw JS text. Preview runs the same
  poster validation as create.
- **F30 — logout accepts Authorization header OR body token.** `/api/auth/logout`
  no longer requires the header via `requireAdmin`; it accepts either the Bearer
  token or a body token, validates the session is admin, then invalidates it
  (closing its WebSocket sockets).
- **F31 watcher — dropped game platforms/games removed from index.**
  `watcher._reconcileGames()` now uses `indexer.replaceGames()` (build aside,
  swap in one step) instead of `processGameResults()` which only added platforms
  and never removed them. Deleting one platform's poster or all of a game's files
  is reflected through the watcher without a manual rescan.
- **F35 — client-facing errors never forward raw OS/JS text.** `orders:error` and
  all `/api` error paths send only a Persian message + code; raw detail is logged
  server-side. `sendEditError`/`sendCreateError` use a generic Persian 500 for
  non-structured errors.
- **F38 — thumbnails fail-open when ensureDir throws.** If `data/thumbs` is a
  file or locked, `thumbs.js` logs one line, stops retrying, and the poster route
  serves the original with 200 instead of 500.
- **F39/F40 — auth.json hardening.** Writes use the atomic writer
  (`writeJsonAtomic`); an unusable auth.json is quarantined to
  `auth.corrupt-<timestamp>.json` with a plain-words warning and the app returns
  to first-run setup; setup/change-password return `PERSIST_FAILED` (Persian)
  without changing in-memory credentials when the write fails. A global error
  middleware for all `/api` routes returns JSON only — no HTML, no stack, no raw
  English message.
- **F32 — documented upload validation** in README security notes (magic-byte
  sniffing, nosniff, image/* content types; accepted polyglot risk on trusted LAN).

### Tests

- `test/unit/watcher.test.js` (F31 platform-drop + full-game-delete),
  `test/unit/order-manager.test.js` (F35 raw-OS-text suppression),
  `test/unit/http.test.js` (F30 header + body logout → 401),
  `test/unit/thumbs.test.js` (F38 thumbs-as-file → 200 original),
  `test/unit/auth.test.js` (F39/F40 characterization). All green; `npm audit
  --omit=dev` clean.

## [Unreleased] — R2 integrity fixes (F33, F37, F31, F3)

### Fixed

- **F33 — success must mean durable.** The metadata-store write
  (`imdbRating` / `plotSummary`) now joins the create/edit plan-then-execute
  undo stack: `flush()` returns the save result; on failure every visible
  change rolls back, the route answers `500 {code:'PERSIST_FAILED'}` with a
  Persian message, and `recordWarning({kind:'persist-failed'})` is logged for
  diagnostics (movie-creator, movie-editor, metadata-store).
- **F37 — game create rejects uncleanable titles and never leaves ghost
  posters.** The title is cleaned and validated (`cleanTitle`, now exported
  from `backend/utils/filename.js`) before any file is written; the cleaned
  title is used for both the on-disk filename and the index key so they
  always agree; a commit/post-write failure unlinks every poster copy
  written so far (game-creator).
- **F31 — games reconcile replaces the catalog wholesale.** New
  `indexer.replaceGames()` builds the games map aside and swaps it in with
  one synchronous step, dropping games whose files are gone and re-pointing
  `absolutePosterPath`/platforms to surviving copies. Used by `POST /api/rescan`,
  `POST /api/games/rescan` and the startup reconcile (server.js), so a
  request never sees a half-applied games catalog.
- **F3 — source-level invalidation for game writes.** Explicit
  `indexer.notifyChanged()` calls in game-creator (post-commit),
  game-editor (post-update) and movie-trash (game delete + game restore)
  refresh the cached `/api/games` payload at the indexer source even when
  called without HTTP, matching movie-editor's P8c c4 pattern.

### Tests

- `test/unit/movie-editor.test.js`, `test/unit/movie-creator.test.js`,
  `test/unit/metadata-store.test.js` (F33), `test/unit/game-services.test.js`
  (F37, F31, F3), `test/unit/startup-reconcile.test.js` (F31),
  `test/unit/etag-coverage.test.js` (F3 — extended to game platform edit,
  poster edit, delete, restore). All mutation-verified; every commit green.

## [Unreleased] — R1 audit follow-up (high findings)

### Fixed

- **F28 — 100 KB body guard rejected game posters.** The SEC-06 middleware
  hard-coded its exemptions (`POST /api/movies`, `PUT /api/movies/*`) and
  missed `POST /api/games`, so any game create with a poster over 100 KB
  answered `413 {"error":"Request body too large"}`. The exemption decision
  now lives in ONE exported definition beside the shared decoder
  (`POSTER_BODY_ROUTES` / `routeCarriesPosterBody` in `server.js`): game
  create is exempt like the movie routes, while `preview`/`rescan`/`restore`
  stay guarded and a >8 MB payload keeps the structured
  `413 IMG_TOO_LARGE` from the shared decoder on both create routes.
- **F41 / DATA-10 — manager metadata vanished after restart or rescan.**
  The scan-rebuild attach passed the indexer's MAP key (`Movie:0001`, bare
  series key) where the store keys bare uids (`0001`, `series:breaking
  bad`) — regression from the DATA-05 phase (`724b8178`). All key
  derivation now flows through one helper,
  `backend/utils/metadata-key.js` (`metadataKeyFor`): uid when present,
  else derived per I6; used by the three indexer attach sites (catalog load,
  watcher reconcile, scan rebuild), the store's migration + `attach`
  default, and the editor/creator metadata writes. Journey tests cover edit
  → restart → rescan → watcher re-add for Movie/Series plus the P8c
  scanning-window serve; a real-browser leg proves a >100 KB game poster
  end-to-end (`test/ui/game-poster-real.test.js`).
- **F14/F15 — pinned the `next-id` survivors:** exact values
  `0003` (Movie/Iranian, 4-wide) and `00003` (Animation, 5-wide), built as
  `max + 1` over all non-Series types (`test/unit/http.test.js`).

### Tests

- `test/unit/guard-exemption.test.js` (6 — game create/served, movie
  control, decoder parity, preview/rescan guard, source-of-truth
  enumeration), `test/unit/metadata-journey.test.js` (4, incl. the P8c
  window leg), `test/ui/game-poster-real.test.js` (1, real server +
  Playwright), exact-value `next-id` assertions. Mutation-verified for
  every fix point.

## [Unreleased] — P8c Startup & payload performance

### Changed

- **Startup no longer blocks on the scan** (G6 / ARCH-04): `start()` loads
  `data/catalog.json`, opens the port, then reconciles the library in the
  background. `GET /api/movies` answers immediately from the cache with
  `meta.scanning: true`; on the 20k fixture the first answer went from
  ~10.7 s (blocking) to **~0.3–0.5 s**. When the scan swaps in, the server
  broadcasts `catalog:changed` (even with a zero diff) and the header
  shows «در حال بروزرسانی…» until the client's next load.
- While `scanning` is true, the 8 catalog-mutating admin routes answer
  `503 {code:'SCAN_IN_PROGRESS'}` (Persian message) so writes cannot race
  the atomic index swap; they lift the moment the reconcile settles.
- The filesystem watcher gained `holdReconcile()`/`releaseHold()`:
  events during the startup scan are recorded and replayed idempotently
  (B6) against the swapped index, so a file added mid-scan is never lost.
- `GET /api/movies` and `GET /api/games` are served from
  `backend/payload-cache.js`: JSON body built once per catalog revision
  with a **stable quoted-sha1 ETag** (`If-None-Match` → empty `304`; the
  pre-P8c handler stamped `lastUpdated` per request, so ETags never
  matched), **gzip** via built-in `zlib` (~9.5× smaller on 20k: 3.57 MB →
  0.38 MB), `Vary: Accept-Encoding`, `Cache-Control: no-cache`. Rebuilds
  are trailing-debounced (100 ms) off a new `indexer.onChange` hook plus
  a post-success hook on every mutating route.

### Added

- `scripts/bench.js` + `scripts/bench-lag-monitor.js` — 20k-fixture
  startup/payload benchmark (cold+warm runs, event-loop lag, RSS, payload
  bytes raw/gzip, p50/p95 latencies, `BENCH_RESULT` JSON line); covered
  by a tiny smoke test. BEFORE/AFTER numbers in the phase report.
- Tests: `test/unit/startup-reconcile.test.js` (5 — gate-controlled
  scanning window: serve-from-cache, 503s, held-event replay, final
  broadcast) and `test/unit/payload-cache.test.js` (7 — PayloadCache
  unit + ETag/304/gzip/mutation-invalidation over HTTP).

## [Unreleased] — P8b Thumbnails, caching, fonts

### Added

- `backend/thumbs.js` — WebP grid thumbnails generated on demand with
  `sharp`, declared as an **optionalDependency** (D4): when `sharp` is
  missing or a conversion fails, the original poster is served with a
  one-time log line and the app behaves identically. Cache lives in
  `data/thumbs/` (git-ignored), file name = `sha256(absPath|mtimeMs|width)`
  so a changed source or a different width yields a different name —
  invalidation needs no eviction logic (stale files are swept at startup).
  Atomic tmp→rename writes, concurrency-2 generation pool, and an optional
  warm-up of the first 40 movies after boot (skipped in quiet/test mode).
- Poster routes accept `?w=300|600` (any other width → 400) and every
  poster URL the server hands out carries `?v=<mtimeMs>`: a matching `?v`
  (or any thumbnail) gets `Cache-Control: public, max-age=31536000,
  immutable`, anything else `public, max-age=3600`; ETag/304 via sendFile.
  Movies **and** games share the contract; the internal `mtime` field is
  stripped from API payloads (SEC-08 guard test).
- `assets/fonts/Vazirmatn-Variable.woff2` + `OFL.txt` (G5): bundled
  Persian variable font served from `/assets` (static allow-list) with CSP
  `font-src 'self'`. `@font-face` (`font-display: swap`) in
  `css/themes.css`; `--font-family-primary` and the inline `index.html`
  stack list Vazirmatn first.
- Tests: `test/unit/thumbs.test.js` (service + route headers/validation +
  real-sharp end-to-end), `test/ui/p8b-assets.test.js` (grid `srcset`,
  `document.fonts.check('16px Vazirmatn')`, zero external-origin
  requests), `/assets` + CSP assertions in `http.test.js`.

### Changed

- Grid cards request the `w=300` thumbnail with a 300 1x / 600 2x
  `srcset` instead of the full-size original (detail view unchanged).
  Measured with 40 realistic fixtures (avg 333 KB) — first screen
  6 posters **2024.0 KB → 182.8 KB**, full grid **13,345.9 KB →
  1,214.8 KB**, reload **0 poster bytes** (immutable cache hit),
  verified via before/after layout measurements.
- Persian UI text renders in Vazirmatn (111 KB woff2, cached immutably —
  no external font request, offline invariant test).

## [Unreleased] — P8a Launchers, config, logging

### Added

- `config.json` support: optional `port` / `libraryPath` / `dataDir`,
  merged **under** environment variables (env > config.json > defaults)
  by `server/config.js`. An unusable file **stops the server** with exit
  code 2 and a bilingual explanation (malformed/unreadable JSON, a
  non-object top level, or `libraryPath`/`dataDir` present but not a
  non-empty text value — silently switching folders could look like lost
  data); the supervisor does not restart on code 2. Unknown keys, an
  invalid port, an invalid env `PORT` and a missing `Library` folder keep
  warning and falling back. A UTF-8 BOM is stripped so valid files saved
  by old Notepad still load. `config.example.json` committed;
  `config.json` git-ignored.
- `logs/app-YYYYMMDD.log`: per-day structured log (7 newest kept) with
  startup lines, one line per HTTP request (method, path, status, duration
  — never bodies, tokens or passwords) and `FATAL` stack capture for
  uncaught exceptions/unhandled rejections (console shows a short
  bilingual line; the process exits non-zero). `logs/` git-ignored.
- `Start.bat` rewritten (CRLF): `chcp 65001`, Node ≥ 18 check with a
  readable Persian + English message (no stack traces), automatic
  `npm ci --omit=dev` on first run, LAN URL list from
  `scripts/print-urls.js` (every non-internal IPv4), default browser
  opened on the server PC, window title version read from `package.json`,
  and a crash-restart loop via `scripts/supervisor.js` (restart after 3 s;
  stop after 5 crashes in 2 minutes with a bilingual explanation pointing
  at the log file). After a clean stop (exit 0) the window closes itself;
  every error exit (Node missing, install failed, config error, crash
  storm) keeps the window open with the message. `install.bat` unchanged
  and still works.
- `Stop.bat`: writes `logs/stop.request`; the server watches it (1 s
  poll; a stale file left by a previous run is removed at startup —
  `server/stop-file.js` — so the fresh run is not instantly stopped) and
  shuts down gracefully — data flushed first, then sockets, exit code 0
  so the supervisor does not restart it.
- `scripts/supervisor.js` — cross-platform restart loop (Start.bat on
  Windows, `node scripts/supervisor.js` anywhere else); crash-window
  policy is a pure injected-clock function under unit test; exit code 2
  (broken config.json) passes through without a restart and is not
  counted as a crash.
- README: Configuration precedence section, Logs section, and a
  "LAN & firewall" section (private-profile `netsh advfirewall` rule,
  fixed-IP/hostname advice, phones-cannot-connect checklist);
  `docs/راهنمای-مدیر.md` gained a Persian راه‌اندازی و توقف section.

## P7c — CI + repo hygiene

### Added

- `.github/workflows/ci.yml` — push/PR matrix (ubuntu + windows × Node
  18/20/22) running `npm ci`, `npm audit --omit=dev`, `npm run lint`,
  `npm test`, plus a Playwright UI job (Ubuntu, Node 22) that uploads
  screenshots when it fails (F5).
- `.github/dependabot.yml` — weekly grouped PRs for npm and
  `github-actions` dependencies (F5).
- `.editorconfig` + `.gitattributes` (UTF-8, LF; `*.bat` CRLF);
  `package.json` now `private` with `license: "UNLICENSED"` (F6).

### Security

- `npm audit fix`: 4 findings in the express tree cleared — 1 critical
  (`proxy-addr` IP spoofing) and 3 moderate (`qs` / `body-parser` chain);
  lockfile-only patch bumps, no manifest changes (F5).

### Fixed

- ARCH-01 (CI half): audit + lint + unit now run automatically on every
  push across the OS/Node matrix; UI suite runs on Ubuntu.
- The four P7b carry-overs: first-run hint/header show real
  `Movies/…`, `Series/…`, `Games/…` examples instead of a nonexistent
  `TV Series/…S01E01` path; architecture docs match the shipped routes and
  WS messages; `docs/types.js` documents all WS message types (10 added);
  `data/metadata.json` is ignored.

## P7b — Documentation

### Added

- `README.md` rewritten end to end: what the app is, Windows/Linux quick
  start, first-run admin setup, all eight environment variables, Library
  layout with real examples per type, filename cheat-sheet, orders,
  backups/restore, troubleshooting via the System Status panel, security
  notes. No LICENSE section/file (owner: skip entirely).
- `docs/ARCHITECTURE.md` — module map, scan→index→API→store→components
  data flow, REST table (26 routes verified in `server.js`), WebSocket
  protocol table (all 28 message types verified in `ws-server.js`),
  invariants I1–I12, storage ownership.
- `docs/راهنمای-مدیر.md` — one-page Persian guide for the shop owner.
- `docs/CONTRIBUTING.md` — branch/commit rules, lint/test/repro commands,
  how to add a defect test.

### Fixed

- ARCH-02 (README inaccuracy): poster images (not video files) with
  numeric 1–6 digit IDs; Games/PS4/PS5 documented; single shared selection
  wording kept; `PORT`/`LIBRARY_PATH` and the rest of the env vars
  documented; `Series/` vs `Serries/` explained (D7).
- ARCH-07 (README half): Node requirement now 18+ to match `engines`
  (engines half was closed in P0).

## P7a — Lint, single source of truth, type comments

### Added

- ESLint flat config + `npm run lint`; 365 findings fixed by editing code,
  not by disabling rules.
- `GET /api/config` — one runtime payload (version, media types, labels,
  pinned genres, extensions, protocol) consumed by the front end.
- `docs/types.js` JSDoc typedefs (Movie, Game, Order, AppConfig, WS
  messages) and JSDoc on `store.js` public methods.

### Fixed

- ARCH-01 (lint + hard-coded version parts): version now comes from
  `package.json` only (server banner/meta, indexer, `.bat` files, UI badge).
  CI half remains for F5.
- ARCH-03: every shared constant has exactly one definition —
  `backend/constants.js`, `backend/utils/series-key.js`, genre colours in
  one map, `backend/utils/filename.js`.

## P6 — Manager features (P6a–P6e6)

### Added

- Add-movie flow with upload limits and filename preview (E2), games
  add/edit pipeline (E4), soft delete to `Library/.trash/` with 20-item
  restore (E3/D6), orders workflow with statuses, edit, 10 s undo and WS
  protocol 2→3 (E5).

### Fixed

- FE-13 (posters larger than ~75 KB upload; 12 MB JSON limit + exemptions) ·
  ARCH-05 (README states the single shared selection honestly, D1).

## P5 — Search, CSS consolidation, accessibility, dead code (P5a–P5c)

### Fixed

- FE-07 (Persian search normalisation, `null` matching, locale sorting) ·
  FE-03 (search Worker removed after measuring; no phantom cloning) ·
  FE-10 (injected CSS, hard-coded z-index, reduced-motion) ·
  FE-14 (dialog focus trap/restore + ARIA + contrast) ·
  FE-06 (copy/print IDs for games) · FE-15 (Ctrl+B shortcut) ·
  FE-09 (dead code removed: floating-selection, selection-state,
  movies.json fallback, stale `.gitignore` entries) ·
  FE-11 (Persian typo «آیمی» → «آیتمی»).

## P4 — Front-end core

### Fixed

- FE-01 (grid no longer rebuilt on every store notification; scroll and
  render calls stable) · FE-02 (one WebSocket + one Worker, no leaks on
  rescan/add/edit) · FE-08 (stale admin token after server restart is
  detected and surfaced).

## P3 — Backend correctness (P3a–P3i)

### Fixed

- DATA-02 (typed hot-add, directories, `catalog:changed` notify) ·
  DATA-04 (Games excluded from movie scan) · DATA-05 (per-type ID
  namespacing) · DATA-06 (`%` in titles no longer 500s) ·
  DATA-11 (Animation/Iranian keep the year) · DATA-12 (release tags no
  longer eat real titles) · DATA-17 (resolution tags not read as the year) ·
  DATA-18 (7-digit IDs rejected) · DATA-01 (edit keeps rating/plot/year) ·
  DATA-03 (multi-genre rename of every copy) · DATA-09 (creator rollback
  safe for Series) · DATA-13 (uploads staged outside `Library/`) ·
  DATA-15 (diagnostics blind spots populated, cached, no per-file
  `existsSync`) · FE-05 (Series editable via by-uid) ·
  owner-reported escaping regressions (P3F-ESC-1…4) · ARCH-04 (request-path
  sync I/O removed; rest deferred to P8).

## P2 — Storage durability (P2–P2c)

### Fixed

- DATA-07 (order numbers never reused) · DATA-08 (atomic JSON writes,
  corrupt-file quarantine + backup restore, sane backup rotation) ·
  DATA-10 (manager metadata moved to `data/metadata.json`) ·
  DATA-14 (consistent save sort for Series) · ARCH-04 (partial: debounced
  catalog saves off the request path).

## P1 — Security (P1a–P1c3)

### Fixed

- SEC-01 (no static serving of project root) · SEC-02 (admin REST behind
  `requireAdmin`) · SEC-05 (no hard-coded password; first-run loopback
  setup, scrypt, rate limit) · SEC-07 (CORS opt-in, security headers) ·
  SEC-03 (path traversal) · SEC-06 (WS payload validation, re-hydrated
  orders, payload caps) · SEC-08 (no absolute paths in API responses) ·
  SEC-04 (stored XSS; escaping `html` tagged template) · FE-04 (apostrophe
  titles) · FE-08 (started: auth error surfaced).

## P0 — Safety net (P0b, P0d, P0e)

### Added

- Characterization tests marking every known defect as failing `todo`
  (30 + 35 cases across SEC/DATA/FE/ARCH IDs).
- Test runner `scripts/run-tests.js` (Node 18–24, Windows and Linux).
- `engines: { "node": ">=18" }` (ARCH-07 engines half; D8).
- No defects closed by design — this phase only built the net.
