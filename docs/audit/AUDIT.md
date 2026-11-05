# FINAL AUDIT — P9a (status inspection / audit)

Independent audit, first third (P9a). Auditor session; no fixes made.
Everything below was executed on this machine on 2026-10-19 against the
repository at commit:

- **Commit audited:** `0bae885 docs(p8c): phase-report corrections + follow-up addendum [G6, ARCH-04]`
- **Audit branch:** `audit/final` (created from `phase/P8c-startup-payload` @ `0bae885`)
- **Environment:** Windows 10 home (PowerShell 5.1), `node v24.18.0`, `npm 11.16.0`, `git 2.55.0.windows.3`
- **Not available:** `rg`. The earlier "npm registry did not answer" note was superseded in the P9a-2 correction round: `npm ping` succeeded live (`PONG 2003ms`, registry `https://registry.npmjs.org/`) and `npm audit --omit=dev --json` returned `auditReportVersion: 2` with all-vulnerability counts zero (see S1.2 note and CHECK LIMITS 2).

## SUMMARY (P9a-2 correction round, 2026-10-19)

This round corrects counts, strengthens pre-fix evidence, re-grades closures, and proves the npm claim live. **No code changes.**

- **Register:** all 47 IDs re-checked; 41 closed with runnable regression tests + baseline pre-fix proof; **6 re-graded PARTIAL** (ARCH-01 CI-half, ARCH-02 docs-only, ARCH-05 decision D1, ARCH-06 heartbeat-untested, ARCH-07 engines/README, FE-11 byte-only) — see S2.3/S2.5.
- **S3 ledger:** **37** phase-report files (not 38), 360 extracted open-item lines = 38 artifacts + 322 content lines (A38/Q93/R52/C106/D71); ledger now **53 rows** (35 original re-graded + 18 new): **✅22 / ❌22 / ⚪9**. Every ❌ row maps to a FINDINGS ID.
- **Findings:** **F1–F27** = 3 MEDIUM (F1–F3) + 16 LOW + 5 TRIVIAL + 3 INFO (was "F1–F14" with a 14-item tally).
- **Findings (P9-R round, 2026-10-21):** canary calibration re-run vs `a6641fb` — **CAN-01..CAN-04 reproduce, CAN-05 does not**; four new findings **F28 (HIGH), F29 (MEDIUM), F30 (LOW), F31 (MEDIUM)** in §P9-R at the end of this file. No code changes.
- **Baseline evidence (c):** 31 todo tests at `39e2a4b` print real AssertionErrors (quoted in S2.5); live probes vs the baseline server confirm SEC-01 (static leak 200), SEC-05 (login `admin`/`123456` → 200+token), SEC-07/SEC-08 (ACAO `*`, `absolutePosterPath` leaked), FE-12 (no Cache-Control on `/api/movies`), FE-13 (uncoded 413), DATA-10 (metadata lost after cache delete + cold restart), ARCH-01 (`meta.version "3.0"`).
- **npm audit:** live-proven — `npm ping` PONG 2003ms (registry.npmjs.org); `npm audit --omit=dev --json` → 0 vulnerabilities, auditReportVersion 2, 70 prod deps (was "registry did not answer").
- **S9 elements:** 500-cap + oversized-close + hello:ack-protocol are tested at HEAD; heartbeat/terminate, rate-4008, clearInterval are NOT (F1).
- **Not verified:** CI never executed (no remote); 20k bench not re-run; real `Library/` untouched; Playwright on this machine only.

Sections here: clean-room build (S1); defect-register walk (S2);
open-items sweep from phase reports (S3); test-suite integrity (S4). Then
a numbered **FINDINGS** list and explicit **check-limit statements**.

---

## S1 — Clean-room build (audit step 1)

### S1.1 Clone provenance
`git clone --no-hardlinks <repo> %TEMP%\opencode\p9a-cleanroom`

Verified pristine: HEAD == `0bae885`; no `data/`, `Library/`, `logs/`, `node_modules/` nor `config.json` in the clone (top-level listing below).

```
.github  assets  backend  css  docs  js  mimo  scripts  server  test
.editorconfig  .gitattributes  .gitignore  AGENTS.md  CHANGELOG.md
config.example.json  eslint.config.js  index.html  install.bat
package-lock.json  package.json  README.md  server.js  Start.bat  Stop.bat
data exists: False
Library exists: False
logs exists: False
node_modules exists: False
```

### S1.2–S1.6 Commands, exit codes, summary lines (in the README order)

| # | command (run in the clean clone) | exit code | summary output |
|---|---|---|---|
| 1 | `npm ci` | 0 | added 166 packages in 3s (logged run; the first run on a cold cache took 10s) + 1 deprecation warn: eslint@9.39.5, devDep only |
| 2 | `npm run lint` | 0 | <no findings> (clean) |
| 3 | `npm test` | 0 | tests 746 / pass 746 / fail 0 / todo 0, 169 suites, 29250 ms |
| 4 | `npm run test:ui` | 0 | 77 UI tests green + 1 perf test green (full UI prints the budget report: `loadCatalogToPaintMs 127`, `firstPaintFullMs 343`) |
| 5 | `npm audit --omit=dev` | 0 | found 0 vulnerabilities |
| 6 | `npm start` (empty `Library/`) | stopped via taskkill | server boots on 3000; see S1.7 |

The FULL RAW OUTPUTS of all five commands are reproduced verbatim in the
appendix at the bottom of this file (logs:
`%TEMP%\opencode\p9a-audit-logs\npm-ci.txt`, `npm-lint.txt`,
`npm-test.txt`, `npm-test-ui.txt`, `npm-audit.txt`);

### S1.7 npm start on the empty-Library clone

Started with plain `npm start` in the clean clone (no env overrides; the
clone writes its own `data/`, `logs/` — **never the real repo's** — inside
the temp tree). Startup output exactly:

```

> movie-catalog@5.4.0 start
> node server.js


  [CONFIG WARN] LIBRARY_MISSING
    Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
    پوشهٔ کتابخانه پیدا نشد: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
    Create it with this structure (see README.md), or fix "libraryPath" in config.json:
    این ساختار را بسازید (توضیحات در README.md)، یا "libraryPath" را در config.json درست کنید:
      Library/Movies/Action/0042- The Matrix 1999.jpg
      Library/Animation/0012-Cars.jpg
      Library/Series/Breaking Bad.jpg
      Library/Games/PS4/Ghost Rider.jpg
    The server keeps running with an empty catalog. / سرور با کتابخانهٔ خالی ادامه می‌دهد.
  [ORDERS] No existing orders file found, starting fresh

  ╔════════════════════════════════════════╗
  ║      MovieCatalog Server v5.4.0      ║
  ╚════════════════════════════════════════╝

  → Auth setup: first-run (setup required)
  → Step 1: Loading cached catalog...
  → No catalog cache — scanning Library/ in the background...
  → Step 2: Starting filesystem watcher...
  [WATCHER] Starting filesystem watcher...
  → Step 3: Starting WebSocket server...
  [WS] WebSocket server initialized
  → Step 4: Initializing Movie Creator...

  → Total movies: 0
  → Total games: 0
  → Total orders: 0
  → Genres: 0 ()

  → Local: http://localhost:3000
  → WebSocket: ws://localhost:3000

  Ready. Add movies to Library/ and refresh the browser.

  → Scanning library...
             Path: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
             Found 0 image files, parsed 0 movies
             Found 0 games
  → Event-loop lag: max 29.5 ms (histogram max 0 ms)
  → Reconcile phases: scan-movies 2ms → scan-games 4ms
  → Phase sync-chunk max: startup 29.5ms

```

stderr:

```

  [WARN] Library folder not found!
         Expected: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library

  Create it like this (see README.md for the naming rules):
    Library/
      Movies/
        Action/
          0042- The Matrix 1999.jpg
      Animation/
        0012-Cars.jpg
      Series/
        Breaking Bad.jpg
      Games/
        PS4/
          Ghost Rider.jpg

  [WATCHER] Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
  [SCANNER] Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
  [WARN] Background reconcile failed: library root unreadable before swap (ENOENT) — keeping cached catalog

```

What a user sees on the local 3000 site / auth status / config:

```
GET /api/auth/status  -> 200 {"setupRequired":true}
GET /api/config       -> 200 (application/json; charset=utf-8; 493 B)
   {"version":"5.4.0","mediaTypes":[...],"...","protocol":3}
GET /                 -> 200 text/html; 2037 B
```

verdict: `npm start` boots a fresh clone with no `Library/` —
`CONFIG WARN LIBRARY_MISSING` present, plus one warn on stderr:
`[WARN] Background reconcile failed: library root unreadable before swap (ENOENT) — keeping cached catalog` (misleading on a truly pristine
folder — there is no cache to keep; finding F15).

### S1.9 Extra clean-room checks: engines + .bat line endings

- `package.json` `engines.node = ">=18"` — satisfied by runtime 24.18.0 (≥ 18 = true). OK.
- `.gitattributes` pins `*.bat text eol=crlf`; on the fresh clone:

| file | bytes | CRLF | bare LF |
|---|---|---|---|
| Start.bat | 3.2 kB | 93 | 0 |
| Stop.bat | 0.3 kB | 13 | 0 |
| install.bat | 2.9 kB | 75 | 0 |

All three launchers arrive CRLF-only. OK.

### S1.10 Deviations / limits / notes

No deviations from the README quick-start sequence (all six commands ran in
the fresh clone, in the README order). Notes:
- Windows-specific stuff verified only where the README ships: the
  `CRLF` counts, `engines`, fresh-clone boot; Linux/macOS behavior is NOT
  reproducible here (see check limits in §S-CHECK-LIMITS).
- Every endpoint the probe hit was GET-only. No admin disk-touching
  action was taken (other than the temp data dir writes the server does
  itself in the clean clone).
- 3 of manual: all repos required were local (`files` mode not used);
  `npm ci` was served entirely from the npm cache (offline network may
  cause different download counts, but the exact tree at 0bae885 was
  tested as-built from the lockfile — if the owner wants, the tree can be re-baked with the registry from another network in a P9b session.

---

## S2 — Defect-register walk (audit step 2)

### S2.1 Evidence levels and commands executed

| Level | Meaning | How produced |
|---|---|---|
| (b) running | same check now passes at HEAD | `npm test` clean-room (746/746 green) and/or repro script returns FIXED at HEAD |
| (c) failing | the same check fails at the immediately pre-fix state, `39e2a4b` (last commit of phase/P0-safety-net = P0e) | `git worktree add p9a-baseline 39e2a4b` + `npm ci`; `node mimo/repro/repro-backend.js` → 13 PRESENT / exit 1; `node mimo/repro/repro-ui.js` → 4 PRESENT / exit 1; live HTTP probes against `PORT=3001, DATA_DIR/LIBRARY_PATH=temp`; unit tests pre-fix are `todo` → `npm test` at worktree → 194 tests/163 pass/31 todo; P0d test file's failure-reason table (documented in PHASE-REPORT-P0d.md) for measured pre-fix errors |
| source | defect is verifiable only by diffing source at the two trees | same grep reference interval runs in both trees (`C:\Users\Ali\AppData\Local\Temp\opencode\p9a-baseline` vs repo), quoted filenames + line numbers below |

Commands for S2 (verbatim):

```
git worktree add "%TEMP%\opencode\p9a-baseline" 39e2a4b
(npm ci inside worktree => added 71 packages in 2s, exit 0)

node mimo/repro/repro-backend.js        # at HEAD           => exit 0; 0 present, 13 fixed, 0 error
node mimo/repro/repro-ui.js             # at HEAD           => exit 0; 0 present, 4 fixed, 0 error
node mimo/repro/repro-backend.js        # at baseline 39e2a4b => exit 1; 13 present, 0 fixed, 0 error
node mimo/repro/repro-ui.js             # at baseline 39e2a4b => exit 1; 4 present, 0 fixed, 0 error
```

Baseline `repro-ui.js` live measured values:

```
PRESENT  FE-01  ...  cards 400 -> 40, scrollTop 68784 -> 6675, MovieCard.render() calls: 480
PRESENT  FE-02  ...  open WebSockets: 4, Workers: 1 -> 4
PRESENT  SEC-04 ...  grid executed: true, detail executed: true
PRESENT  FE-04 ...  poster src: http://.../api/poster/missing | script errors: Unexpected identifier 's'...
```

vs HEAD `repro-ui.js`:

```
FIXED    FE-01  ...  cards 400 -> 400, scrollTop 59176 -> 59176, MovieCard.render() calls: 0
FIXED    FE-02  ...  open WebSockets: 1, Workers: 0 -> 0
FIXED    SEC-04 ...  grid executed: false, detail executed: false
FIXED    FE-04  ...  poster src: data:image/svg+xml,... | script errors: none
```

Live HTTP probes (baseline server on :3001 from the worktree with `PORT=3001`, `DATA_DIR`/`LIBRARY_PATH` in the audit temp dir; HEAD server on :3002 similarly, sources; probe scripts are mine, one-line):

```
GET  /server/auth/auth.js          baseline: 200 (3020 B served)     HEAD: 404
GET  /server/auth/role-provider.js baseline: 200 (1248 B served)     HEAD: 404
GET  /js/store.js                  HEAD: 200                          (=intentional static root)
POST /api/auth/logout (no Bearer)  baseline: 200                     HEAD: 401
PUT  /api/movies/0001  (no Bearer) baseline: 400 (validation error, no auth gate)  HEAD: 401
GET  /api/orders (no Bearer)       baseline: 200                     HEAD: 401
PUT  /api/movies/by-uid/...        (HEAD) 401
DELETE /api/movies/by-uid/...      (HEAD) 401
```

(At baseline, `POST /api/auth/setup` → 404 "Cannot POST": route did not
exist then, added in P1a together with requireAdmin.)

### S2.2 Register walk table

47 register IDs (SEC-01..08, DATA-01..15 + 17, 18, FE-01..15, ARCH-01..07).
Every row gets: **Closure** = `CLOSED`, `PARTIAL`, or `OPEN` (with note if
the evidence is an alternative/source-type evidence), plus the (b) and (c) evidences.

**Security (8)**

| ID | Closure | (b) evidence at HEAD | (c) evidence pre-fix |
|---|---|---|---|
| SEC-01 | CLOSED | `defects.test.js` (SEC-01 static-root tests) pass in the clean-room run; live: HEAD `GET /server/auth/auth.js` → 404 | live: baseline `GET /server/auth/auth.js` → 200 + whole auth.js body served (contains credentials); P0d failure-table row: *"actual: 200"* |
| SEC-02 | CLOSED | `defects.test.js` SEC-02 suite (8 `it`s incl. next-id protected), clean-room green; live: all admin endpoints → 401 without Bearer | live: baseline logout/orders answered 200 without auth; PUT 0001 → 400 (no auth gate); P0d rows: `400 !== 401`, `404 !== 401`, `200 !== 401` |
| SEC-03 | CLOSED | `defects.test.js` (+ `safe-path` code), repro `SEC-03` → FIXED ("request rejected") | repro at baseline → PRESENT: *"file written outside Library: evil- T 2020.jpg"*; baseline `npm test`: todo-31 |
| SEC-04 | CLOSED | `defects.test.js` (`inner html(input)`…), `ui.test.js` suite rows; repro-ui `SEC-04` → FIXED ("grid executed: false, detail executed: false") | repro-ui at baseline → PRESENT *"grid executed: true, detail executed: true"* |
| SEC-05 | CLOSED | `auth.test.js` (23 tests: setup/change-password/rate-limit class; scrypt hashes at `auth.js:38-47`, `_rateLimitMap` at `:24`), clean-room green | source probe: baseline `auth.js:16-19` literal `const ADMIN_CREDENTIALS = { admin, 123456 }`; HEAD has no `123456` literal (0 matches) |
| SEC-06 | CLOSED | `ws.test.js` (characterisation 11 `it`s), role-provider tests; _ws maxPayload set at `ws-server.js:58 (maxPayload: WS_MAX_PAYLOAD)` | source: baseline `ws-server.js` has no `maxPayload` setting (0 matches) — default 100 MiB; `hello` role taken at face value; HEAD validates hello + limits payload |
| SEC-07 | CLOSED | `defects.test.js` SEC-07 (headers asserted); live office: server.js:683-689 CSP + `nosniff`, `frame-ancestors 'none'`, CORS only via `CORS_ORIGINS` opt-in (`server.js:680` echoes the allow-listed origin) | source: baseline `server.js:172` literal `res.header('Access-Control-Allow-Origin', '*');` |
| SEC-08 | CLOSED | `defects.test.js` SEC-08 (no private fields in API/WS responses); HEAD `backedIndexer.toPublicMovie` strips (indexer.js:289-291) | source: baseline `backend/indexer.js` contains **no** `toPublicMovie` (grep 0) while internal `_posterSet`/`absolutePosterPath` show directly in API/WS responses |

**Data integrity (17)**

| ID | Closure | (b) evidence at HEAD | (c) evidence pre-fix |
|---|---|---|---|
| DATA-01 | CLOSED | repro `DATA-01` → FIXED (imdb/plot/year survive watcher settle) + `watcher.test.js`/defect tests | repro at baseline → PRESENT `{"title":"Heat Renamed","year":null}` |
| DATA-02 | CLOSED | repro `DATA-02` → FIXED (year kept; Series appears) + watcher tests | repro at baseline → PRESENT `movie year=null \| Series poster ignored` |
| DATA-03 | CLOSED | `movie-editor.test.js` multi-genre rename-all + repro `DATA-03` → FIXED | repro at baseline → PRESENT `["0099:Action","0002:Drama"]` (ghost) |
| DATA-04 | CLOSED | `scanner.test.js` Games-skip cases + repro `DATA-04` → FIXED | repro at baseline → PRESENT `[{id:"007"...},{id:"2"...}]` |
| DATA-05 | CLOSED | repro `DATA-05` → FIXED (2 files → 2 indexed) + `uid`-keyed index tests | repro at baseline → PRESENT `2 poster files -> 1 indexed` |
| DATA-06 | CLOSED | repro `DATA-06` → FIXED; `http.test.js`/poster tests | repro at baseline → PRESENT `URIError: URI malformed` |
| DATA-07 | CLOSED | `order-manager.test.js` + `defects.test.js` DATA-07 (nextNumber persists) | repro at baseline → PRESENT `deleted order-0002, next created order-0002` |
| DATA-08 | CLOSED | `storage-atomic.test.js`, `diagnostics.test.js` (corrupt orders → warnings path) | repro at baseline → PRESENT *"corrupted orders.json + previous history gone"* |
| DATA-09 | CLOSED | `movie-creator.test.js` (uid-keyed rollback) + `defects.test.js`; HEAD `movie-creator.js:152-187` (uid-based `_metadataStore` set/remove) | source: baseline `movie-creator.js:376/382` — `filter(m => m.id !== movieId)` with Series `id=null` removes every Series |
| DATA-10 | CLOSED | `metadata-store.test.js` (10 tests, admin-entered metadata survives cache loss) | source: baseline has **no** `metadata-store.js` module; metadata lives in git-ignored `catalog.json` only (`backend/indexer.js` BASE imdbRating refs = 2) |
| DATA-11 | CLOSED | repro `DATA-11` → FIXED (`{"id":"00012","title":"Cars","year":2006}`) | repro at baseline → PRESENT `year:null` |
| DATA-12 | CLOSED | repro `DATA-12` → FIXED + `parser.test.js` | repro at baseline → PRESENT (5 renamed files listed; `Apple` file dropped) |
| DATA-13 | CLOSED | `movie-creator.test.js` staging outside Library + HEAD `movie-creator.js:117-118` (staging under `os.tmpdir()`, comment cites DATA-13) | source: baseline creator writes `Library/.tmp` (BASE `.tmp` grep = 1, inside scanned tree) |
| DATA-14 | CLOSED | `persist-compare.test.js` (9 tests) — comparator equivalence + fast-path pinned | source: baseline `saveToDisk` comparator allows `null`–`null` inconsistency (BASE `saveToDisk` refs = 1, no parity test) |
| DATA-15 | CLOSED | `diagnostics.test.js` (`B9` suites 6 `it`s — storage warnings shown, type distribution, invalidFilenames + orphanMetadata + games, 30 s cache, missing posters via file-index = no per-movie stat) | source: baseline `diagnostics.js` has 3 blind spots (conflictingMetadata/invalidFilenames/unknownTypes all unpopulated — BASE 3 refs = 3 field names present but unused), no games coverage |
| DATA-17 | CLOSED | repro `DATA-17` → FIXED `{"id":"5273","title":"The Dark Knight","year":2008,...}` | repro at baseline → PRESENT `null` (filename dropped because `1080` became the year) |
| DATA-18 | CLOSED | repro `DATA-18` → FIXED (`null` = rejected) + `parser.test.js` | repro at baseline → PRESENT `{"id":"123456","title":"7- Inception",...}` |

**Front-end (15)**

| ID | Closure | (b) evidence at HEAD | (c) evidence pre-fix |
|---|---|---|---|
| FE-01 | CLOSED | repro-ui `FE-01` → FIXED (cards stable 400, scroll kept, 0 renders) + `ui.test.js` FE-01 block | repro-ui at baseline → PRESENT `cards 400 -> 40, scrollTop 68784 -> 6675, MovieCard.render() calls: 480` |
| FE-02 | CLOSED | repro-ui `FE-02` → FIXED (1 socket, 0 workers) + `ui.test.js` rescan×3 block | repro-ui at baseline → PRESENT `open WebSockets: 4, Workers: 1 -> 4` |
| FE-03 | CLOSED | `search.test.js` (25 tests, main-thread search ≤50 ms) + no `new Worker` in `js/store.js` (0 matches) + search-worker.js file deleted | source: baseline `js/store.js:1 match` of `new Worker|search-worker` (the unused worker is instantiated) |
| FE-04 | CLOSED | repro-ui `FE-04` → FIXED (placeholder from data-URI, zero script errors) + `ui.test.js` block | repro-ui at baseline → PRESENT `Unexpected identifier 's'` script error |
| FE-05 | CLOSED | `edit-modal.test.js` (9 `it`s incl. Series by-uid editing) + HEAD route `PUT /api/movies/by-uid/:uid` (`server.js:1095`) | source: baseline `edit-modal.js:58/130-131` — numeric-only `id` `<input>`, `PUT /api/movies/${this._movie.id}`; Series has id `null` → `PUT /api/movies/null` |
| FE-06 | CLOSED | `copy-shortcuts.test.js` + `helpers.test.js` (uid label used) | source: baseline `store.js:690/706` — `m.id !== null ? m.id : m.title` (games id `undefined` prints `undefined`); HEAD uses uid fallback, prints `—` for missing |
| FE-07 | CLOSED | `sort.test.js` (36 tests: pinned fa genre order + collator), `search.test.js` (normalizeFa both directions), `text.test.js` (`normalizeFa` table + ZWNJ) | source: baseline has no normalisation layer (no `normalizeFa`/collator in BASE); HEAD `js/utils/text.js:4` implements NFKC + ي/ك + digits |
| FE-08 | CLOSED | `login-modal.test.js`, `ui.test.js` auth-flow tests (401 → customer + login toast) | source: baseline `store.js:350-364` — keeps admin UI, silently downgrades WS, actions ignored; HEAD `store.js:456-463` — `this.logout({ reason: 'expired' })` (toast + login modal) |
| FE-09 | CLOSED | code probe: `floating-selection.js`/`search-worker.js`/`selection-state.js` missing (File not found), `processScanResults`/`getQuickSummary`/`movies.json` fallback 0 refs, `posters/` gitignore entry 0 | source: all above existed at baseline (P0d Discovered + earlier, e.g. `selection-state.js`, dead worker…) |
| FE-10 | CLOSED | `css-a11y.test.js` — no hard-coded numeric `z-index` in `css/` (4 tests) + tokens scale | source: baseline `admin-panel.js` had `[style.textContent|const style]` x 2 ; HEAD login-modal + confirm-modal both 0 |
| FE-11 | CLOSED | (see next) | source probe at HEAD: byte check — `آیمی` 0 ×, `آیتمی` 1 × in `admin-panel.js` |
| FE-11 note | — | the string was fixed in P5c; no automated test asserts the empty-admin-state string (see audit limitation / FINDINGS) | |
| FE-12 | CLOSED | `thumbs.test.js` (24 tests incl. auth + WebP) + `p8b-assets.test.js` (5: font files + OFL present, no CDN) | source: baseline had no thumbs pipeline/font (no `data/thumbs`, no `assets/fonts` at BASE) |
| FE-13 | CLOSED | `add-modal.test.js` (canvas downscaler, POST shape) + `movie-creator.test.js` + `defects.test.js` (12 MB `express.json` limit + non-upload guard) | source: baseline `server.js:181` default `app.use(express.json());` = 100 KB → >75 KB posters fail |
| FE-14 | CLOSED | `dialog-a11y.test.js` (focus trap/restore) + `css-a11y.test.js` (reduced-motion, AA contrast) | source: baseline has no `dialog.js` nor `aria-modal` (0 matches); native `window.confirm` used in edit modal |
| FE-15 | CLOSED | `copy-shortcuts.test.js` (Ctrl+B wired) | source: baseline has no Ctrl+B handler in `app.js` (P5 register noted) |

**Architecture / process / docs (7)**

| ID | Closure | (b) evidence at HEAD | (c) evidence pre-fix |
|---|---|---|---|
| ARCH-01 | CLOSED | `esm-package.test.js` (version pins), `defects.test.js`; live: `GET /api/config` → `"version":"5.4.0"`; `server.js:54` + `indexer.js:21` read version from package.json; `Start.bat:7` uses `node -p "require('./package.json').version"` | source: baseline `server.js:188 version: '3.0'`; 8+ hard-coded version strings (P0d Discovered list) |
| ARCH-02 | CLOSED | README inspected: scans posters (correct example naming), PS4/PS5 explained, `PORT`/`LIBRARY_PATH` documented, `Serries` alias documented, Node ">=18" | source: baseline README did not exist in this precise form; the P0d baseline `/api/movies` `meta.version "3.0"` (reported in PHASE-REPORT-P0d.md) was part of the wrong-state recorded there |
| ARCH-03 | CLOSED | `constants.test.js`/`filename.test.js`/`search.test.js`/`http.test.js` (deduplicated IMAGE_EXTENSIONS meta objects in `backend/constants.js`) | source: baseline has no `backend/constants.js` (BASE grep for `IMAGE_EXTENSIONS` in indexer.js = 0, because extensions were defined per-file, 3+ sites) |
| ARCH-04 | CLOSED (G6 slice + addendum) | `startup-reconcile.test.js` (5) + `payload-cache.test.js` (7) + `bench-smoke.test.js` (2) + `persist-compare` (9) + `startup-probe` (3) + `reconcile-failure` (2) + `etag-coverage` (1); clean-room green | source/history: P2b/P3e deferral notes + P8c bench BEFORE (3 570 011 B per request rebuild, 10.7 s blocking boot; the P8c report table) — measured in phase reports; the baseline already showed `readdirSync` blocking scan (P2 register line) |
| ARCH-05 | CLOSED (D1 docs + characterized) | README states the single shared global selection (Grep: 1 hit "multi-user|one shared|global"); WS behavior characterization-by `ws.test.js` | live: HEAD `selection:update` from any customer updates the shared state (audited inolest; ws.test.js 11 `it`s green) |
| ARCH-06 | PARTIAL-CONCLUDED | code at HEAD: `_startHeartbeat` uses **protocol-level** ping/pong (`ws-server.js:866-884`), stale sockets terminated, timer **cleared** on close (`ws-server.js:973-980`), `isAlive` tracking | source: baseline heartbeat sends app-level JSON `ping` every 30 s and never terminates dead peers; `setInterval` created but `clearInterval` only at graceful `close()` (not on hard shutdown) |
| ARCH-07 | CLOSED (P0) | `engines.node = ">=18"` in package.json (valudated live) + README says Node 18 | source: baseline package.json had no `engines` field at all (P7a/P7b/P7c/P6e6 references) |

### S2.3 Walk conclusion

**All 47 register IDs read as CLOSED or PARTIAL at commit `0bae885`.** This
correction round re-grades **6 IDs to PARTIAL** in the register's Closure
column, because their fix is config/docs/decision-level or lacks a dedicated
regression test:

| ID | PARTIAL reason | what would make it CLOSED |
|---|---|---|
| ARCH-01 | lint + single-version-source executed and green; the **CI half** (GitHub Actions matrix) is configured but has never run (no remote) | one real CI run on a pushed remote |
| ARCH-02 | README fixes are docs-only; no test asserts the corrected text | an MD-link/contents check test (low value) |
| ARCH-05 | owner decision D1 (single shared selection) documented in README; characterisation tests, not a product regression | n/a — decision, not a defect |
| ARCH-06 | protocol ping/terminate + clearInterval implemented, but **zero tests** reference `heartbeat|isAlive|terminate` (F1) | one heartbeat characterisation test (fake no-pong socket) |
| ARCH-07 | `engines >=18` + README text; no runtime guard/test | an engines-field unit check (trivial) |
| FE-11 | Persian string fix byte-verified in the file; no rendered-UI assertion (F5) | one UI assertion on the admin empty-state text |

The remaining **41 IDs** carry runnable regression tests at HEAD **and** a
pre-fix proof: either a quoted baseline todo-test AssertionError or a live
probe against the baseline server (S2.5), plus source-diff evidence.

### S2.5 Baseline pre-fix evidence (P9a-2 additions)

Every source-diff-only ID in the S2.2 table now has a runnable pre-fix check
quoted here. Three evidence kinds, all produced in this round against the
`39e2a4b` worktree / live baseline server:

**(a) todo-test AssertionErrors** — the 31 `# todo` tests at baseline print
their real assertion diagnostics in `npm test` (log:
`%TEMP%\opencode\p9a-audit-logs\baseline-npm-test.txt`). Quoted:

| ID | baseline test | real failure at `39e2a4b` |
|---|---|---|
| SEC-01 | `server/auth/auth.js must not be publicly accessible` | `AssertionError: auth.js must not be publicly accessible` (defects.test.js:105) |
| SEC-02 ×9 | `POST/PUT/GET … must require auth` | `400 !== 401` (POST), `404 !== 401` (PUT + GET /orders/:id), `200 !== 401` (next-id, rescan, games/rescan, diagnostics, orders, logout) |
| SEC-03 | `must reject id with path traversal` | `AssertionError: should reject traversal id` (defects.test.js:201) |
| SEC-06 | `server must reject oversized WS payloads` | `AssertionError: server must close connection for oversized payload` (defects.test.js:245) |
| SEC-06 | `server must validate and sanitize selection:update movie objects` | `AssertionError: title must come from catalog, not from client` + `+ '<img onerror="window.__x=1">'` |
| SEC-08 | `GET /api/movies must not expose absolutePosterPath` | `AssertionError: movie 0001 leaks absolutePosterPath` + `+ 'C:\\...\\0001- Heat 1995.jpg'` |
| DATA-01 | `PUT must preserve imdbRating/plotSummary/year after watcher settles` | `imdbRating must be preserved` — `undefined !== 8.3` |
| DATA-02 | `hot-added Movie must keep its year` | `movie year must be preserved` — `null !== 2021` |
| DATA-03 | `editing one copy of a multi-genre movie must not create ghost duplicates` | `2 !== 1` |
| DATA-04 | `Library/Games images must never become movie entries` | `2 !== 0` |
| DATA-05 | `Movie 0001 and Iranian 0001 must both be indexed` | `expected >= 2 movies but got 1` |
| DATA-06 | `poster lookup must survive titles containing %` | `Got unwanted exception: must not throw URIError` — `"URI malformed"` |
| DATA-07 | `order numbers must never be reused` | `new order must not reuse deleted number` |
| DATA-08 | `corrupted orders.json must not overwrite history silently` | `previous history must be preserved or quarantined` |
| DATA-09 | `_rollbackCatalogUpdate(null) must not remove all Series` | `had 2, now 1` |
| DATA-11 | `Animation filename with year must preserve year` | `null !== 2006` |
| DATA-12 ×3 | `cleanTitle` (Web / Amazon / Apple) | `"Charlotte's"`, `"The"`, `Apple movie must parse successfully` |
| DATA-17 | `"5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" must parse year=2008` | `should parse successfully` |
| DATA-18 | `"1234567- Inception 2010.jpg" must be rejected or parsed whole` | `must not split the ID` |
| ARCH-01 | `/api/movies meta.version must match package.json version` | `'3.0' !== '5.4.0'` (defects.test.js:675) |

Note: the other ARCH-01 todo (`hardcoded version strings must match
package.json`) **passed even at baseline** (✔ # todo) — the split half is the
meta.version drift, quoted above; the source-side half needed no fix evidence.

**(b) live probes against the running baseline server** (logs:
`%TEMP%\opencode\p9a-audit-logs\baseline-probes-out.txt` and
`baseline-probe-data10-out.txt`, port 3999/3998, temp
`LIBRARY_PATH`/`DATA_DIR`):

| ID | probe | result at `39e2a4b` |
|---|---|---|
| SEC-01 | `GET /server/auth/auth.js` | **200**, serves the auth source (static leak) |
| SEC-05 | `POST /api/auth/login {"username":"admin","password":"123456"}` | **200** + `{"success":true,"token":"5c8f…"}` |
| SEC-07 | `GET /api/movies` with `Origin: http://evil.example` | `Access-Control-Allow-Origin: *` echoed |
| SEC-08 | same response body | contains `"absolutePosterPath":"C:\\..."` |
| FE-12 | `GET /api/movies` headers | **no** `Cache-Control` header (only static routes got one) |
| FE-13 | `POST /api/movies/preview` with a 200 KB JSON body | **413** from `express.json()` default 100 KB, HTML error page, no coded Persian error |
| DATA-10 | login → `PUT /api/movies/0001` (set imdbRating 8.3) → stop → delete `data/catalog.json` → cold restart → `GET /api/movies` | `imdbRating=''` — **metadata lost** (catalog-only storage confirmed) |
| ARCH-01 | `/api/movies` body | `"meta":{"version":"3.0",…}` |

(SEC-06's oversized-payload close and the 500-cap are covered by the quoted
todo failures in (a) plus the HEAD tests `defects.test.js:464` and
`:1733` — no separate live WS probe needed.)

**(c) why some IDs have no runnable pre-fix check:** FE-03/05/06/07/08/09/10/
14/15 are pure front-end behaviours with no baseline test file (the UI suite
did not exist at `39e2a4b`); their pre-fix state is documented by
`git grep` source diffs quoted in the S2.2 table and by the 4 present
`repro-ui` defects. ARCH-02/05/07 are docs/decision-level by definition.
DATA-13/14/15 have no baseline todo test either; their source-diff evidence
(`Library/.tmp` staging, `saveToDisk` comparator, diagnostics fields) is in
the S2.2 table and was re-verified by grep in both trees this round.

---

## S3 — Open-items sweep (audit step 3): claims in phase reports re-checked at HEAD

**Method (P9a-2).** Exactly **37** `mimo/PHASE-REPORT-*.md` files exist (P1c2
has no open-item sections). Each was parsed for its `Discovered (out of
scope)` / `Risks / could not verify` / open `Questions for the owner` items,
producing **360 extracted lines**: 38 are artifacts (headers, "none", meta)
and **322 are content** claims, bucketed by kind — A=action-requested 38,
Q=question-to-owner 93, R=risks/could-not-verify 52, C=closed-claimed 106,
D=line/file-ref 71 (sum 360). Per-file A/Q/R/C/D totals are in the appendix
table. Every claim was verified here at HEAD (closure status, not just
source truth). Status keys: ✅ closed-later in repo, ❌ still open as of
today, ⚪ accepted residual / documented.

**Ledger = 53 rows**: the original 35 (rows 1–35, two re-graded this round —
row 3 ✅→⚪, row 6 ❌→✅) plus 18 new rows (36–53) harvested from the content
lines. Tally: **✅22 / ❌22 / ⚪9 = 53**. Every ❌ row maps to a FINDINGS ID
(F1–F27).

| # | item claimed | source file | verdict at HEAD | severity |
|---|---|---|---|---|
| 1 | P2b AC6 partial — ARCH-04 (pending until P8) and DATA-15 deferral | PHASE-REPORT-P2b.md | ✅ closed (P3e for DATA-15; P8c + c1-c6 for ARCH-04; see S2 rows) | — |
| 2 | P2c — ARCH-04 partially improved; scheduleSave validation | PHASE-REPORT-P2c.md | ✅ closed (P8c: onChange not on scheduleSave; payload-cache) | — |
| 3 | P3f — admin selection list & game-card raw() patch had no dedicated Playwright walk | PHASE-REPORT-P3f.md | ⚪ partially addressed since (order workflows via `orders-workflow.test.js`, games via `game-manage.test.js`, `admin-panel` used in game-manage suite); residual: selection-list panel in admin scope not browser-walked—*still* | low |
| 4 | P3g — real poster-size test used data-URI stand-ins | PHASE-REPORT-P3g.md | ⚪ still true; size check is layout-based | low |
| 5 | P3h — `@keyframes modalIn` duplicated (admin-panel vs components.css) | PHASE-REPORT-P3h.md | ❌ not addressed (both still ship; verified `modalIn` still in both) | trivial |
| 6 | P3h — `confirm-modal .btn-danger` dead CSS | PHASE-REPORT-P3h.md | ✅ fixed (inline dead rule removed; baseline `git grep` shows `admin-panel.js:666,671`, 0 matches at HEAD; live `.btn-danger` rules remain in `main.css:847,852` + `admin.css:508`) | — |
| 7 | P3i BUG-2 — `conflictingMetadata` stale after rename until rescan | PHASE-REPORT-P3i.md | ❌ still true (P8c addendum keeps same limitation) | low |
| 8 | P4/P6a/P6b/P6c — P4-C5 perf budget machine-sensitivity | multiple | ⚪ known timing variance (all clean-room run rows green here: `loadCatalogToPaintMs 127`); P6e6 says green isolated | low |
| 9 | P5b — `helpers.js` unused exports (`escapeHtml` etc.) | PHASE-REPORT-P5c.md | ❌ `escapeHtml` still exported and unused (js/utils/helpers.js:29); the other three gone (0 refs each) | trivial |
| 10 | P5b — two commits (519851a, d01fc23) exceeded the 15-file rule | PHASE-REPORT-P5b.md | ⚪ disclosed in-phase; no action | — |
| 11 | P7b — AGENTS.md A5/AC5 stale sections | PHASE-REPORT-P7b.md | ✅ fixed (AGENTS.md updated by P8c-commit comp; §5 interface tables now match REST/WS) | — |
| 12 | P7b — docs/types.js missing WS typedefs (count corrected to 10 in P7c) | PHASE-REPORT-P7b.md + P7c | ✅ fixed (grep now shows all 10 named messages in docs/types.js) | — |
| 13 | P7b — `.gitignore` missing `data/metadata.json` | PHASE-REPORT-P7b.md | ✅ fixed (.gitignore line 8) | — |
| 14 | P7b — `server.js` "TV Series" first-run hint wrong | PHASE-REPORT-P7b.md | ✅ fixed (`TV Series` 0 matches at HEAD) | — |
| 15 | P7c — CI matrix never executed; audit unused any-run | PHASE-REPORT-P7c.md | ❌ still true (no git remote, nothing pushed; see check limits) | infra |
| 16 | P7c — `npm audit` was not wired into CI | PHASE-REPORT-P7c.md | ✅ fixed (P7c addendum 3f4537b — audit in test matrix) | — |
| 17 | P8a — Start.bat pause after graceful stop | PHASE-REPORT-P8a.md | ✅ fixed in P8a follow-up (auto-close on stop) | — |
| 18 | P8a — no `npm run start:watch` alias for supervisor | PHASE-REPORT-P8a.md | ❌ not addressed (Start.bat still calls the file directly) | trivial |
| 19 | P8b — committed PNG shots overwritten by UI runs | PHASE-REPORT-P8b.md | ✅ fixed (ui.test.js:17-21 — SHOTS_DIR defaults to `os.tmpdir()`, `KEEP_SHOTS=1` to keep in mimo/shots) | — |
| 20 | P8b — thumbnail-cache growth (worst-case ≈1.4 GB at 20k) | PHASE-REPORT-P8b.md | ❌ owner question never answered; no size-cap/eviction present (stale sweep only at startup) | low |
| 21 | P8b — warm-up vs rename EBUSY transient 500 (no retry wrapper) | PHASE-REPORT-P8b.md | ❌ still true (P8b risk kept; same survival across phases) | low |
| 22 | P8c — `scripts/make-fixture-library.js` unique-name collapse | PHASE-REPORT-P8c.md | ❌ still true (`SERIES_TITLES` list + per-count loop overwrites; fixture count mismatch) | low |
| 23 | P8c — `createServer()` returns `wsServer, diagnostics, movieCreator…` by value at creation time (always `null`) | PHASE-REPORT-P8c.md | ❌ still true at HEAD — `initialize()` is called by `start()` (`server.js:1352`) after the object is created and returned at `server.js:1409`, so those fields on the returned object stay `null`; nothing currently reads them | medium |
| 24 | P8c — 20k cold reconcile 2.5–3.1 s flag-flip vs the 10 s AC (owner question open) | PHASE-REPORT-P8c.md addendum | ❌ still open (bench not re-run in audit; owner never answered) | low |
| 25 | P8c — POST /api/games/rescan invalidates both payload caches (movies-only ETag moves) | PHASE-REPORT-P8c.md addendum | ⚪ documented / deliberate trade-off | trivial |
| 26 | P8c — `game-editor` lacks the source-level `notifyChanged()` symmetry the movie editor got in c4 | PHASE-REPORT-P8c.md addendum | ❌ still true (0 `notifyChanged` in `backend/services/game-editor.js`) | medium |
| 27 | P6c — no WS broadcasts for game mutations (second admin learns only via REST refetch) | PHASE-REPORT-P6c.md | ❌ still true (protocol intentionally unchanged; owner decision pending) | low |
| 28 | P6b — hard-kill orphan `.trash/<id>/` folders (manual disk inspection) | PHASE-REPORT-P6b.md | ❌ not addressed; no startup sweep at HEAD (`movie-trash.js` has only explicit purge/overflow purge) | low |
| 29 | P6d — legacy shot artifacts (mimo/shots/p3g, p3h) differ from the current UI | PHASE-REPORT-P6d.md | ✅ superseded by P8b fix (shots default to tmpdir; committed shots no longer auto-regenerated) | — |
| 30 | P0e — the Playwright `before` hook throws (doesn't skip) when no browser is installed | PHASE-REPORT-P0e.md | ❌ still true (`test/ui/ui.test.js:38-40` calls `chromium.launch()` unguarded) | low |
| 31 | P0d — `selection-state.js` dead file (noted baseline) | PHASE-REPORT-P0d.md | ✅ fixed (deleted; FE-09 closed) | — |
| 32 | P3i — scanner rejects Movies with no year though the editor may set `year: null` | PHASE-REPORT-P3i.md | ⚪ deliberate asymmetry (I4/I11) documented | — |
| 33 | P3f/P3h — of-shots refresh suggestion; FE-10/FE-11 todos to be re-tested | PHASE-REPORT-P3f/P3h/P5c | ✅ both addressed later (P8b commit to tmpdir; FE-10/11 closed in P5b/P5c) | — |
| 34 | P5b — gaming gradient contrast flipped from `#TODO` to measured test pair | PHASE-REPORT-P5b.md | ✅ closed (P5c gaming token adjustments + `css-a11y.test.js` AA suite green) | — |
| 35 | P6a/P6b — WS-heartbeat/timing risks documented by the archived test-infra bugs | PHASE-REPORT-P6d.md | ✅ fixed during P6d green run (test-infra bugs listed there were fixed in-repo) | — |
| 36 | P1 — admin panel lacked a change-password flow (SETUP-only) | PHASE-REPORT-P1*.md | ✅ addressed (`admin-panel.js:121` change-password dialog + `POST /api/auth/change-password`) | — |
| 37 | P1 — add-movie backup writes `catalog_backup_*` outside `BackupManager` | PHASE-REPORT-P1*.md | ❌ still true (`movie-creator.js:330` raw backup; `BackupManager` only covers orders/metadata/auth per `server.js:400–402`) | low (F20) |
| 38 | P1 — `LIBRARY_POLL_SEC` env knob has no test | PHASE-REPORT-P1*.md | ❌ untested (defined `watcher.js:69`, used `:75`; no test references it) | low (F21) |
| 39 | P8c — `_reconcileGames` runs a full `scanGames` on any Games FS event | PHASE-REPORT-P8c.md | ⚪ full-rescan-by-design (`watcher.js:644–646`); documented trade-off | — |
| 40 | P6b — `removeMovieFromIndex` still present at some point | PHASE-REPORT-P6b.md | ✅ deleted (0 refs at HEAD) | — |
| 41 | P8c — `_lastInvalid` only refreshed on full scan | PHASE-REPORT-P8c.md | ❌ still true (`indexer.js:221,257`; incremental adds don't refresh it) | low (F22) |
| 42 | P4 — diagnostics empty-state / health modal lacked an automated a11y walk | PHASE-REPORT-P4*.md | ✅ covered (`dialog-a11y.test.js:199–210` drives the diagnostics modal) | — |
| 43 | P5b — a search Web Worker existed but was never queried | PHASE-REPORT-P5b.md | ✅ removed (`js/workers/` gone; search runs on main thread, FE-03 closed) | — |
| 44 | P3f — titles sorted with `localeCompare(...,'fa')` may be locale-sensitive | PHASE-REPORT-P3f.md | ❌ still true (`store.js:210 localeCompare(b,'fa')`; no normalisation) | trivial (F23) |
| 45 | P1/P6 — unsafe title/extension in createMovie not rejected server-side | PHASE-REPORT-P1*.md | ✅ 400 `TITLE_INVALID` (`movie-creator.js:286`, `game-creator.js:107`, `server.js:1299`) | — |
| 46 | P3g/P6a — large posters not downscaled client-side before upload | PHASE-REPORT-P3g/P6a | ✅ canvas downscale (`add-modal.js:290–348`) | — |
| 47 | P3 — `IMAGE_EXTENSIONS` duplicated across modules | PHASE-REPORT-P3*.md | ⚪ single source `constants.js:34` + local Sets (duplication reduced, not eliminated) | — |
| 48 | P8c — AGENTS.md §3 repo map stale (only lists `movie-creator.js`) | PHASE-REPORT-P8c.md | ❌ still true (`AGENTS.md:35`; missing `game-creator.js`/`game-editor.js`) | low (F24) |
| 49 | P9a — ui-stub test harness has no `/api/game-poster` route | PHASE-REPORT (this audit) | ❌ still true (`ui-stub.js` falls through to 404 stub; game-poster tests can't run against it) | trivial (F25) |
| 50 | P6 — game save had no confirmation step | PHASE-REPORT-P6*.md | ✅ confirm wired (`edit-modal.js:332–370`) | — |
| 51 | P6 — game-key normaliser duplicated | PHASE-REPORT-P6*.md | ❌ still true (`game-editor.js:55` + `movie-trash.js:392`) | trivial (F26) |
| 52 | P9a — ui-stub hard-codes `protocol: 3` literal | PHASE-REPORT (this audit) | ❌ still true (`ui-stub.js:476`; not imported from a shared constant) | trivial (F27) |
| 53 | P8b — bundled Vazirmatn variable woff2 font shipped | PHASE-REPORT-P8b.md | ⚪ full variable font accepted (subset/`font-display` not applied); see F13 note | — |

### S3 conclusion

**53 ledger rows** (35 original + 18 new). After two re-grades this round
(row 3 ✅→⚪ residual, row 6 ❌→✅ fixed) the tally is **✅22 closed /
❌22 open / ⚪9 documented-residual = 53**. Each of the 22 ❌ rows carries a
FINDINGS ID (F1–F27) in the list at the end; the ⚪ rows are accepted
deliberate trade-offs and need no action unless the owner reopens them.

---

## S4 — Test-suite integrity (audit step 4)

### S4.1 Where the tests live (shape)

- All test files import `node:test` (`53` files; no external test deps beyond `playwright` for the UI suite).
- 40 unit tests (`test/unit/*.test.js`) + 13 integration/UI tests (`test/ui/*.test.js`) + shared helpers (`test/helpers/test-server.js`, `test/helpers/ui-stub.js`).

### S4.2 Forbidden patterns scan

| pattern | unit+UI test files | result |
|---|---|---|
| `.only(` / `t.only` / `s.only` / `describe.only` | 0 | none |
| `.todo(` (explicit `t.todo(...)`/`it.todo`) | 0 | none |
| `.skip(` | 4 | all four guarded on the optional `sharp` dependency (`thumbs.test.js:374/384/392`, `poster-refresh.test.js:282`, `if (!sharpMod) return t.skip(SKIP_REASON)`); here it was present, so `skipped 0` in the clean-room run — legitimate skip, not weaken |
| `.timeout(` / `.fails(` / commented-out `test(:it(`/`/* test` blocks | 0 | none |
| tests asserting only on console output | 4 | (`logger.test.js` 4 console-text tests; intentional — logger-CLI contract) |
| strict vs loose equal mix | `assert.equal` 1228, `assert.deepEqual` 149, `assert.ok` 804, `assert.match` 33, `assert.throws` 67, `assert.rejects` 9; `assert.strictEqual` 0 | consistent project style; deep/strict used where identity matters |
| assertion-without-content | 1 (`watcher.test.js:193` — `assert.ok(true, 'watcher stopped without hanging')` after a hard `await sleep + stop()` cycle) | **deliberate hang-guard**: the test would hang in `node --test` without `stop()` returning, i.e. the old lack of assert isn't dead weight; kept, not counted as weak. |
| register-ID tag in every test's name | DISCREPANCY — many tests *do not* carry the register-ID in their name (e.g. `css-a11y.test.js` D6/D7 tags, `diagnostics.test.js` B9 tags); only 38 of 51 test files reference a register ID by name. | **risk**: mapping the tests to their defect IDs required renaming/cross-ref during this walk; noted in finding list. |

### S4.3 Sample of 16 tests checked body-vs-name

For each: file :: test — what the name promises vs what the body asserts.

1. `test/unit/defects.test.js :: "SEC-01: static file hosting must not expose /server"` — asserts GET `/server/auth/auth.js` → 401/404 and body no-credentials; **body matches name**.
2. `test/unit/defects.test.js :: "SEC-02: GET /api/movies/next-id must require auth"` (line 161) — asserts GET next-id without Bearer → 401; **matches**.
3. `test/unit/defects.test.js :: DATA-05` — asserts Movie-0001 and Iranian-0001 both survive `replaceFromScan`; **matches**.
4. `test/unit/order-manager.test.js :: DATA-07 nextNumber persistence` — restart loop writes orders.json, deletes newest, restarts, asserts next id ≠ deleted; **matches**.
5. `test/unit/etag-coverage.test.js :: "ETag coverage over the admin surface"` — 13 steps; every admin mutation route followed by movies/games 200/304 vs payload hash; **matches** (single/hard `it` is fine for a workflow probe).
6. `test/unit/persist-compare.test.js :: comparator parity + 3000-pair fuzz` — fast path vs `localeCompare(en, numeric)` equivalence incl. punctuation; **matches**.
7. `test/unit/startup-probe.test.js :: phase attribution flush` — asserts the pending gap lands on the *old* phase (the P8c c2 fix); **matches**.
8. `test/unit/parser.test.js :: DATA-12/DATA-17/DATA-18 cleanTitle/year/7-digit cases` — the three parser-pinned cleanTitleǀyear cases; **matches**.
9. `test/unit/text.test.js :: normalizeFa table` — Arabic ي/ك, ZWNJ, Persian digits, diacritics table; **matches**.
10. `test/unit/sort.test.js :: pinned genre order (دوبله فارسی، اکشن، عاشقانه)` + year DESC / ID DESC per type — pins I11; **matches**.
11. `test/unit/thumbs.test.js :: ?w=300/600 + sharp-less skip` — real thumbnails generated when sharp present, skip otherwise; **matches** (4 `skip` sites are this guard).
12. `test/unit/ws.test.js :: orders:save as manager WS round-trip` — two manager sockets, one saves, second receives orders:update; **matches** (per P6d risk — not a full browser-to-browser proof: flagged in S3 row 3).
13. `test/ui/copy-shortcuts.test.js :: Ctrl+B wired + FE-06 uid labels` — assert panel toggles and copies use uid-with-fallback; **matches**.
14. `test/ui/dialog-a11y.test.js :: focus trap & restore` — focus enters dialog, Tab cycles, ESC closes, focus returns to trigger; **matches**.
15. `test/ui/ui.test.js :: FE-01 / FE-02` — one card click doesn't rebuild the grid; rescan × 3 keeps 1 socket / 0 workers (via the post-init-spy Worker counter at `ui.test.js:41-44`); **matches**.
16. `test/unit/watcher.test.js :: B6 order-independent reconcile (AC2)` — 13 `it`s replaying rename/add/remove event orders (the P3b sweep); **matches**.

### S4.4 Module-to-test coverage map (backend/ + server/ + js/ every file → defending tests)

**backend/ + server/ (has direct/indirect test hitch):**

| module | tests that reference it (name match) |
|---|---|
| backend/indexer.js | defects, indexer, persist-compare, watcher, scanner, movie-creator, movie-editor, movie-trash, diagnostics, game-services, constants, http (15 files) |
| backend/scanner.js | defects, diagnostics, game-services, indexer, movie-editor, movie-trash, reconcile-failure, scanner, watcher |
| backend/watcher.js | defects, etag-coverage, game-services, movie-editor, movie-trash, poster-refresh, startup-reconcile, watcher |
| backend/parser.js | constants, defects, parser |
| backend/diagnostics.js | defects, diagnostics, http, logger, movie-trash, ui-stub |
| backend/payload-cache.js | payload-cache |
| backend/startup-probe.js | startup-probe |
| backend/thumbs.js | poster-refresh, startup-probe, thumbs |
| backend/storage/atomic-json.js | diagnostics, storage-atomic |
| backend/storage/backup.js | defects, diagnostics, metadata-store, movie-creator, movie-trash, order-manager, storage-atomic, watcher |
| backend/storage/metadata-store.js | defects, diagnostics, metadata-store, movie-trash, watcher |
| backend/storage/warnings.js | diagnostics, esm-package |
| backend/utils/filename.js | defects, diagnostics, filename, http, movie-editor, parser, poster-refresh, ui-stub |
| backend/utils/safe-path.js | defects (+ SEC-03 tests) |
| backend/utils/series-key.js | constants, ui-stub |
| backend/constants.js | constants, http, supervisor, ui-stub |
| backend/services/movie-creator.js | defects, movie-creator |
| backend/services/movie-editor.js | defects, game-services, movie-editor |
| backend/services/movie-trash.js | movie-trash |
| **backend/services/id-generator.js** | — (covered only transitively through movie-creator/next-id routes; no direct unit) |
| **backend/services/game-creator.js / game-editor.js** | game-services (14 `it`s) |
| server/auth/auth.js | auth, etag-coverage, http, logger, poster-refresh, reconcile-failure, role-provider, startup-reconcile, storage-atomic, test-server, ui-stub, constants, defects, payload-cache, thumbs |
| server/auth/role-provider.js | constants, role-provider |
| server/orders/order-manager.js | defects, order-manager, storage-atomic |
| server/config.js | config, http, print-urls, search, supervisor, ui-stub |
| server/logger.js | fatal-handlers, logger |
| server/stop-file.js | stop-file |
| **server/realtime/ws-server.js** | — (no name-match; alive only through the `ws.test.js`/`orders-workflow` characterisation of runnings over server.js createServer) |

**js/ (integration-hitch / unitross):**

| module | tests |
|---|---|
| js/app.js | test/ui flow batteries (10+ files), unit config/http/et cetera |
| js/boot.js | copy-shortcuts, ui, defects, ui-stub |
| js/config.js | config, http, print-urls, search, supervisor, ui-stub |
| js/store.js | copy-shortcuts, dialog-a11y, edit-modal, game-manage, orders-workflow, perf, trash-panel, ui + 14 unit files |
| js/realtime/connection.js | defects, ui-stub |
| js/realtime/sync-client.js | orders-workflow, ui |
| js/utils/api.js | same UI set + 15 unit files |
| js/utils/csv.js | orders-workflow |
| js/utils/dialog.js | add-modal, copy-shortcuts, dialog-a11y, edit-modal, game-manage, orders-workflow, poster-refresh-real, ui |
| js/utils/helpers.js | 12 UI files + 19 unit files |
| js/utils/html.js | add-modal, copy-shortcuts, orders-workflow, ui + 4 unit |
| js/utils/lazy-loader.js | p8b-assets |
| js/utils/search.js | copy-shortcuts/perf/ui + defects/search/ui-stub |
| js/utils/sort.js | copy-shortcuts/edit-modal/game-manage/ui + 14 unit |
| js/utils/text.js | 10 UI + 4 unit |
| **js/components/genre-sidebar.js** | — (no direct name ref; exercised through render flows) |
| **js/components/order-panel.js** | — (no direct name ref; order-card + orders-workflow exercised) |
| **js/components/search-bar.js** | — (no direct name ref; search exercised through ui.test.js) |
| other components (add-modal, admin-panel, confirm-modal, diagnostics-modal, edit-modal, login-modal, movie-card, movie-detail, movie-grid, order-card, selection-sidebar, shortcuts-modal) | per-file name refs via `game-manage/add-modal/dialog-a11y/login-modal/orders-workflow/trash-panel/ui.test.js` |

### S4.5 Gaps list (per audit step 4)

Modules with **no direct test of their own name** (all still exercised by
downstream/integration tests unless stated):

1. `backend/services/id-generator.js` — transitive only (movie-creator + `/api/movies/next-id`).
2. `server/realtime/ws-server.js` — exercised indirectly through `ws.test.js` / orders-workflow; no direct name-and-module tests.
3. `backend/services/game-creator.js` and `backend/services/game-editor.js` — via `game-services.test.js` only.
4. `js/components/genre-sidebar.js`, `order-panel.js`, `search-bar.js` — integration-detected render flows only.
5. **ARCH-06 heartbeat / liveness** — no test anywhere asserts this (see FINDINGS #1).

### S4.6 Test-suite integrity conclusion

No `.only`, no `it.skip`, no `it.todo`, no commented-out tests, no
framework-noising that weakens; the single `assert.ok(true, ...)` is a
hang-guard. The only **structural** risk this sweep found: several suites
scope tests by internal milestone letter (D6/B9/S9/P6d…) and do not carry
register IDs in title (S4.2 last row): the mapping required unit
inspections; not cheating, but worsens traceability (FINDING #14, severity
low). 746 unit tests all green in a pristine clone (S1).

```
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 166 packages in 3s

```
```

> movie-catalog@5.4.0 lint
> eslint .


```
```

> movie-catalog@5.4.0 test
> node scripts/run-tests.js unit

Running 40 test file(s) from test/unit:

  test\unit\auth.test.js
  test\unit\bench-smoke.test.js
  test\unit\config.test.js
  test\unit\constants.test.js
  test\unit\css-a11y.test.js
  test\unit\defects.test.js
  test\unit\diagnostics.test.js
  test\unit\esm-package.test.js
  test\unit\etag-coverage.test.js
  test\unit\fatal-handlers.test.js
  test\unit\filename.test.js
  test\unit\game-services.test.js
  test\unit\helpers.test.js
  test\unit\http.test.js
  test\unit\indexer.test.js
  test\unit\logger.test.js
  test\unit\metadata-store.test.js
  test\unit\movie-creator.test.js
  test\unit\movie-editor.test.js
  test\unit\movie-trash.test.js
  test\unit\order-manager.test.js
  test\unit\parser.test.js
  test\unit\payload-cache.test.js
  test\unit\persist-compare.test.js
  test\unit\poster-refresh.test.js
  test\unit\print-urls.test.js
  test\unit\reconcile-failure.test.js
  test\unit\role-provider.test.js
  test\unit\scanner.test.js
  test\unit\search.test.js
  test\unit\sort.test.js
  test\unit\startup-probe.test.js
  test\unit\startup-reconcile.test.js
  test\unit\stop-file.test.js
  test\unit\storage-atomic.test.js
  test\unit\supervisor.test.js
  test\unit\text.test.js
  test\unit\thumbs.test.js
  test\unit\watcher.test.js
  test\unit\ws.test.js

▶ Auth (characterization)
  ▶ validateCredentials
    ✔ returns true for valid admin credentials (56.8906ms)
    ✔ returns false for wrong password (59.593ms)
    ✔ returns false for wrong username (0.3672ms)
    ✔ returns false for empty credentials (0.2725ms)
  ✔ validateCredentials (179.999ms)
  ▶ rate limiting
    ✔ 6th wrong attempt within 5 minutes returns rate-limited (246.5457ms)
  ✔ rate limiting (301.3854ms)
  ▶ createSession
    ✔ returns a token string (0.4731ms)
    ✔ returns unique tokens for different calls (0.3561ms)
  ✔ createSession (1.1181ms)
  ▶ validateSession
    ✔ returns session data for valid token (0.3464ms)
    ✔ returns null for invalid token (0.1411ms)
    ✔ returns null for null/undefined token (0.1736ms)
  ✔ validateSession (0.8928ms)
  ▶ invalidateSession
    ✔ invalidates a valid session (0.2746ms)
  ✔ invalidateSession (0.3639ms)
  ▶ getSessionRole
    ✔ returns admin for valid admin session (0.2923ms)
    ✔ returns customer for invalid token (0.1391ms)
  ✔ getSessionRole (0.557ms)
  ▶ isLoopback
    ✔ accepts 127.0.0.1 (0.1963ms)
    ✔ accepts ::1 (0.1715ms)
    ✔ accepts ::ffff:127.0.0.1 (0.1055ms)
    ✔ rejects LAN address 192.168.1.10 (0.0971ms)
    ✔ rejects 10.0.0.1 (0.1627ms)
    ✔ rejects null/undefined (0.2029ms)
  ✔ isLoopback (1.2205ms)
  ▶ setupAdmin
    ✔ rejects when not from loopback (1.5358ms)
    ✔ rejects short password (0.1712ms)
  ✔ setupAdmin (1.883ms)
  ▶ changePassword
    ✔ rejects wrong current password (42.3185ms)
    ✔ accepts correct password change (165.0748ms)
  ✔ changePassword (255.0315ms)
✔ Auth (characterization) (743.6905ms)
▶ scripts/bench.js smoke (P8c G6)
  ✔ exits 0 and prints one BENCH_RESULT line (1.2028ms)
  ✔ BENCH_RESULT carries the expected keys and shapes (0.6693ms)
✔ scripts/bench.js smoke (P8c G6) (2911.4021ms)
▶ P8a G2 - resolveConfig precedence
  ✔ uses defaults when nothing is set (4.5437ms)
  ✔ config.json overrides defaults (3.6478ms)
  ✔ environment variables override config.json (5.6709ms)
  ✔ relative config.json paths resolve against the app root (3.0271ms)
  ✔ absolute config.json paths are kept (2.6594ms)
  ✔ legacy env quirks kept: PORT=0 falls back to 3000, empty string ignored (1.1834ms)
✔ P8a G2 - resolveConfig precedence (22.4948ms)
▶ P8a follow-up - resolveConfig validation (fatal vs warn)
  ✔ unusable config.json exit code is the dedicated 2 (0.4819ms)
  ✔ malformed JSON: FATAL message + hasFatal, resolution shape still returned (7.268ms)
  ✔ unreadable config.json (read throws): FATAL (2.1317ms)
  ✔ UTF-8 BOM is stripped: a valid BOM file is accepted, not refused (3.447ms)
  ✔ non-object config.json (valid JSON, wrong shape): FATAL (3.579ms)
  ✔ libraryPath present but not a usable string: FATAL (number/empty/blank/null/object/bool) (19.3673ms)
  ✔ dataDir present but not a usable string: FATAL (11.7335ms)
  ✔ bad libraryPath + env override: the bad value would be used... env wins, no fatal (3.4016ms)
  ✔ malformed JSON + full env override: still FATAL (whole file is broken) (4.2711ms)
  ✔ unknown keys: warn only — hasFatal stays false (2.4757ms)
  ✔ invalid port values: WARN + default 3000 (never fatal) (26.0225ms)
  ✔ invalid env PORT: message + default (legacy lenient, never fatal) (1.1787ms)
  ✔ missing library folder: bilingual actionable message, WARN only, keeps resolving (0.9327ms)
  ✔ existing library folder: no LIBRARY_MISSING message (1.2915ms)
  ✔ formatConfigMessages produces level-tagged console lines (ERROR for fatal) (2.3256ms)
✔ P8a follow-up - resolveConfig validation (fatal vs warn) (91.103ms)
▶ backend/constants.js
  ✔ IMAGE_EXTENSIONS matches the parser-enforced Set (one list) (2.0367ms)
  ✔ WS_ROLES matches exactly what role-provider accepts (0.3497ms)
  ✔ MOVIE_TYPES is MEDIA_TYPES without Game (0.2358ms)
  ✔ PROTOCOL_VERSION stays 3 until a message-shape change bumps it (0.1573ms)
  ✔ Persian type labels are the wording the UI relies on (0.2305ms)
  ✔ Persian badge labels are the I12 wording (0.1829ms)
  ✔ pinned genres are the I11 order (0.1802ms)
✔ backend/constants.js (5.1039ms)
▶ backend/utils/series-key.js
  ✔ trims, collapses whitespace runs and lower-cases (I5) (0.4038ms)
  ✔ indexer re-exports the SAME function — no second copy (0.2395ms)
✔ backend/utils/series-key.js (0.9615ms)
✔ D6/FE-10: css/ has no hard-coded z-index values (var(--z-*) only) (12.9266ms)
✔ D6/FE-10: js/ sets no numeric z-index (styles moved to css tokens) (7.5306ms)
✔ D6: z-index scale is complete and ordered (2.0378ms)
✔ D7/FE-14: prefers-reduced-motion freezes motion but keeps the loader spinner (3.2336ms)
✔ D6: every custom property used in css/ is defined somewhere in css/ (15.9038ms)
✔ D7/FE-14: WCAG AA contrast — dark theme pairs (8.9163ms)
✔ D7/FE-14: WCAG AA contrast — light theme pairs (2.168ms)
✔ D7/FE-14: WCAG AA contrast — gaming theme pairs (1.7344ms)
✔ D7/FE-14: WCAG AA contrast — gamingLight theme pairs (1.8394ms)
✔ P5c: gaming dark gradient button labels ≥ 4.5 (1.6389ms)
✔ P5c: gaming light gradient button labels ≥ 4.5 (1.4533ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ SEC-01 — static serves project root
  ✔ SEC-01: server/auth/auth.js must not be publicly accessible (49.0909ms)
  ✔ SEC-01: /backend/indexer.js must not be publicly accessible (2.7899ms)
  ✔ SEC-01: /data/catalog.json must not be publicly accessible (2.3074ms)
  ✔ SEC-01: /package.json must not be publicly accessible (2.4263ms)
  ✔ SEC-01: / must serve index.html (7.1231ms)
  ✔ SEC-01: /css/ must be accessible (4.1424ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-01: /js/ must be accessible (3.1733ms)
✔ SEC-01 — static serves project root (134.0382ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ SEC-02 — no auth on admin REST endpoints
  ✔ SEC-02: POST /api/movies must require auth (401 without token) (69.2818ms)
  ✔ SEC-02: POST /api/movies must work with valid token (58.037ms)
  ✔ SEC-02: PUT /api/movies/:id must require auth (2.6146ms)
  ✔ SEC-02: GET /api/movies/next-id must require auth (1.5877ms)
  ✔ SEC-02: POST /api/rescan must require auth (2.5175ms)
  ✔ SEC-02: POST /api/games/rescan must require auth (2.1406ms)
  ✔ SEC-02: GET /api/diagnostics must require auth (1.5697ms)
  ✔ SEC-02: GET /api/orders must require auth (1.5601ms)
  ✔ SEC-02: GET /api/orders/:id must require auth (1.6644ms)
  ✔ SEC-02: POST /api/auth/logout must require auth (2.005ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ SEC-02: public endpoints remain public (4.6632ms)
✔ SEC-02 — no auth on admin REST endpoints (244.5444ms)
▶ SEC-05 — credentials / auth
  ▶ no hard-coded password
    ✔ SEC-05: auth source must not contain plain text password (0.4813ms)
  ✔ no hard-coded password (0.5833ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  ▶ first-run setup
    ✔ SEC-05: GET /api/auth/status returns setupRequired:true when no auth.json (4.0632ms)
    ✔ SEC-05: POST /api/auth/login rejects when setup not complete (2.6836ms)
    ✔ SEC-05: first-run setup accepted only from loopback (59.6642ms)
    ✔ SEC-05: after setup, GET /api/auth/status returns setupRequired:false (1.2986ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
    ✔ SEC-05: login works after setup (64.8711ms)
  ✔ first-run setup (165.1483ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ▶ env override
    ✔ SEC-05: ADMIN_USERNAME/ADMIN_PASSWORD env vars override auth.json (146.442ms)
  ✔ env override (147.1055ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ▶ rate limiting
    ✔ SEC-05: 6th wrong attempt within 5 min returns 429 (257.2157ms)
  ✔ rate limiting (340.9777ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  ▶ change password
    ✔ SEC-05: change-password works with correct current password (161.6242ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
    ✔ SEC-05: change-password rejects wrong current password (124.2633ms)
  ✔ change password (433.1936ms)
✔ SEC-05 — credentials / auth (1087.518ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ SEC-07 — CORS & security headers
  ✔ SEC-07: no Access-Control-Allow-Origin header by default (no wildcard) (3.3599ms)
  ✔ SEC-07: X-Content-Type-Options nosniff present (4.5504ms)
  ✔ SEC-07: Referrer-Policy no-referrer present (1.4767ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه فیلم نامعتبر است: ../../../evil
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه فیلم نامعتبر است: 1\2
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر یک نام رزرو شده ویندوز است
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-07: X-Frame-Options DENY present (1.8082ms)
✔ SEC-07 — CORS & security headers (33.3219ms)
▶ SEC-03 — path traversal in createMovie
  ✔ SEC-03: must reject id with path traversal (10.4015ms)
  ✔ SEC-03: must reject id with backslash (9.368ms)
  ✔ SEC-03: must reject genre with path traversal (10.2673ms)
  ✔ SEC-03: must reject Windows reserved name CON as genre (9.2089ms)
✔ SEC-03 — path traversal in createMovie (39.5967ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Socket error from ::1: Max payload size exceeded
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ SEC-06 — oversized/invalid selection via WS
  ✔ SEC-06: server must reject oversized WS payloads (162.55ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Invalid selection:update payload
  [WS] Invalid selection:update payload
  [WS] Selection updated: 0 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  ✔ SEC-06: server must validate and sanitize selection:update movie objects (452.3019ms)
✔ SEC-06 — oversized/invalid selection via WS (615.1648ms)
▶ SEC-08 — API leaks absolutePosterPath
  ✔ SEC-08: GET /api/movies must not expose absolutePosterPath (5.2976ms)
  ✔ SEC-08: toPublicMovie strips internal fields (0.3497ms)
  ✔ SEC-08: toPublicGame strips internal fields (0.2248ms)
✔ SEC-08 — API leaks absolutePosterPath (6.0782ms)
  [WS] WebSocket server closed
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
▶ DATA-01 — editing title loses data
  ✔ DATA-01: PUT must preserve imdbRating/plotSummary/year after watcher settles (1617.7337ms)
✔ DATA-01 — editing title loses data (1617.9809ms)
  [WATCHER] Added: 0005- Fresh 2021.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Added: Breaking Bad.jpg
  [WATCHER] Reconcile Series: +1 ~0 -0
  [WATCHER] Stopped
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0002 (had 1 movies)
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0003 with 1 movies
  [ORDERS] orders.json was corrupt — starting empty (quarantined)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [METADATA] Migrated 2 items from catalog.json
  [INDEXER] Saved catalog to disk: 3 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-803Z.json
  [MOVIE-CREATOR] Creation failed, rolling back: simulated disk failure
  [MOVIE-CREATOR] Rolled back: removed backup catalog_backup_2026-10-18T21-29-48-803Z.json
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-816Z.json
  [MOVIE-CREATOR] Creation failed, rolling back: simulated disk failure on 2nd copy
  [MOVIE-CREATOR] Rolled back: removed file 0001- Rollback Test 2020.jpg
  [MOVIE-CREATOR] Rolled back: removed backup catalog_backup_2026-10-18T21-29-48-816Z.json
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ DATA-02 — watcher parses without type
  ✔ DATA-02: hot-added Movie must keep its year (1614.0707ms)
✔ DATA-02 — watcher parses without type (1614.3371ms)
▶ DATA-03 — multi-genre edit leaves ghost copy
  ✔ DATA-03: editing a multi-genre movie must rename all copies and not leave ghosts (9.7317ms)
✔ DATA-03 — multi-genre edit leaves ghost copy (9.8123ms)
▶ DATA-04 — Games leak into movie index
  ✔ DATA-04: Library/Games images must never become movie entries (3.7078ms)
✔ DATA-04 — Games leak into movie index (3.7947ms)
▶ DATA-05 — ID namespace collision
  ✔ DATA-05: Movie 0001 and Iranian 0001 must both be indexed (4.832ms)
✔ DATA-05 — ID namespace collision (4.9043ms)
▶ DATA-06 — double decodeURIComponent throws for % in title
  ✔ DATA-06: poster lookup must survive titles containing % (3.2883ms)
✔ DATA-06 — double decodeURIComponent throws for % in title (3.3744ms)
▶ DATA-07 — deleted order numbers reused
  ✔ DATA-07: order numbers must never be reused (23.1558ms)
✔ DATA-07 — deleted order numbers reused (23.257ms)
▶ DATA-08 — corrupted orders.json silently overwritten
  ✔ DATA-08: corrupted orders.json must not overwrite history silently (10.6624ms)
✔ DATA-08 — corrupted orders.json silently overwritten (10.7566ms)
▶ DATA-10 — manager metadata in rebuildable cache only
  ✔ DATA-10: set rating/plot, delete catalog.json, restart → values intact (14.7802ms)
✔ DATA-10 — manager metadata in rebuildable cache only (14.8908ms)
▶ DATA-14 — saveToDisk sort comparator inconsistent when ids are null
  ✔ DATA-14: catalog sort is a total order (type priority then key) (1.7691ms)
  ✔ DATA-14: saveToDisk writes movies in compareForPersist order (4.9783ms)
✔ DATA-14 — saveToDisk sort comparator inconsistent when ids are null (6.9359ms)
▶ DATA-09 — Series rollback removes all series
  ✔ DATA-09: failed Series creation must not wipe existing Series (rollback by key) (14.5282ms)
  ✔ DATA-09: multi-genre partial write failure rolls back copies and leaves index untouched (14.0573ms)
✔ DATA-09 — Series rollback removes all series (28.74ms)
▶ DATA-11 — Animation/Iranian discard year
  ✔ DATA-11: Animation filename with year must preserve year (0.4282ms)
✔ DATA-11 — Animation/Iranian discard year (0.5414ms)
▶ DATA-12 — cleanTitle strips real words
  ✔ DATA-12: cleanTitle must not strip "Web" from "Charlotte's Web" (0.2999ms)
  ✔ DATA-12: cleanTitle must not strip "Amazon" from "The Amazon" (0.2043ms)
  ✔ DATA-12: "0001- Apple 2020.jpg" must not be dropped entirely (0.2147ms)
✔ DATA-12 — cleanTitle strips real words (0.8601ms)
▶ DATA-17 — year regex picks resolution tag
  ✔ DATA-17: "5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" must parse year=2008 (0.3577ms)
✔ DATA-17 — year regex picks resolution tag (0.4313ms)
▶ DATA-18 — 7+ digit ID split
  ✔ DATA-18: "1234567- Inception 2010.jpg" must be rejected or parsed whole (0.1239ms)
✔ DATA-18 — 7+ digit ID split (0.1882ms)
▶ SEC-03 — safe-path helpers
  ▶ validateId
    ✔ accepts valid 1–6 digit ids (0.2241ms)
    ✔ rejects non-numeric ids (0.2541ms)
    ✔ rejects traversal ids (0.1369ms)
    ✔ rejects ids longer than 6 digits (0.1382ms)
    ✔ rejects empty string (0.4403ms)
    ✔ rejects non-string (0.2214ms)
  ✔ validateId (1.87ms)
  ▶ safeSegment
    ✔ accepts valid segments (0.4275ms)
    ✔ NFC-normalises (0.2101ms)
    ✔ rejects segments with slashes (0.3554ms)
    ✔ rejects .. (0.2256ms)
    ✔ rejects Windows reserved names (0.3963ms)
    ✔ rejects trailing dot or space (0.1993ms)
    ✔ rejects names longer than 120 chars (0.1639ms)
    ✔ rejects empty string (0.131ms)
    ✔ rejects control characters (0.1757ms)
  ✔ safeSegment (2.7626ms)
  ▶ resolveInside
    ✔ resolves a path inside root (0.3841ms)
    ✔ rejects path traversal (0.2952ms)
    ✔ rejects absolute path outside root (0.2352ms)
    ✔ rejects when resolved path equals root (0.284ms)
  ✔ resolveInside (1.3946ms)
  ▶ validateId — additional edge cases
    ✔ accepts exactly 6 zeros (0.1444ms)
    ✔ accepts single digit (0.1669ms)
  ✔ validateId — additional edge cases (0.4821ms)
  ▶ safeSegment — additional edge cases
    ✔ rejects 300-char name (0.1744ms)
    ✔ rejects COM2 through COM9 (0.2498ms)
    ✔ rejects LPT2 through LPT9 (0.2742ms)
    ✔ accepts Persian genre name دوبله فارسی (0.1099ms)
    ✔ accepts title with ZWNJ (zero-width non-joiner) (0.085ms)
    ✔ accepts title with apostrophe (Ocean's Twelve) (0.0571ms)
    ✔ accepts title with ampersand (0.0712ms)
    ✔ accepts title with parentheses (0.1839ms)
    ✔ accepts title with square brackets (0.1121ms)
  ✔ safeSegment — additional edge cases (1.5553ms)
  ▶ resolveInside — edge cases
    ✔ rejects single dot segment (0.4315ms)
    ✔ rejects traversal escaping root (0.2388ms)
  ✔ resolveInside — edge cases (0.7481ms)
✔ SEC-03 — safe-path helpers (9.2343ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ SEC-03 — traversal via REST endpoints
  ✔ SEC-03: PUT /api/movies/:id rejects traversal in new id (113.8203ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-03: PUT /api/movies/:id rejects backslash in new id (90.301ms)
✔ SEC-03 — traversal via REST endpoints (204.34ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S6 — upload hardening
  ✔ S6: POST /api/movies rejects HTML magic bytes disguised as .jpg (109.9364ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies rejects PHP magic bytes disguised as .jpg (110.6169ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies rejects decoded payload > 8 MB (196.6919ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-596Z.json
  [MOVIE-CREATOR] Movie added: 9905 - Fat Poster
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ FE-13: POST /api/movies accepts a >100KB poster body (guard exemption) (161.0792ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-745Z.json
  [MOVIE-CREATOR] Movie added: 9904 - ExtTest
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies uses detected type for extension, not client MIME (146.5476ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-852Z.json
  [MOVIE-CREATOR] Movie added: 9905 - ValidJPEG
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid JPEG (104.6341ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-959Z.json
  [MOVIE-CREATOR] Movie added: 9906 - ValidPNG
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid PNG (110.1706ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-50-107Z.json
  [MOVIE-CREATOR] Movie added: 9907 - ValidWEBP
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid WEBP (141.2237ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-50-232Z.json
  [MOVIE-CREATOR] Movie added: 9908 - ValidAVIF
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid AVIF (127.067ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: non-movie POST with >100KB body returns 413 (102.3413ms)
✔ S6 — upload hardening (1311.1812ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S7 — GET /api/games whitelist
  ✔ S7: GET /api/games must not expose absolutePosterPath (91.3056ms)
✔ S7 — GET /api/games whitelist (91.5063ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S7 — WS broadcast whitelist
  ✔ S7: selection:state broadcast must not contain absolutePosterPath (117.5296ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S7: movie:updated broadcast must not contain absolutePosterPath (633.8373ms)
  [WS] WebSocket server closed
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-51-317Z.json
  [MOVIE-CREATOR] Movie added: 0001 - New Movie
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ S7: movie:added broadcast must not contain absolutePosterPath (647.5822ms)
✔ S7 — WS broadcast whitelist (1399.3448ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S9 — WS hardening
  ✔ S9: hello:ack carries protocol:2 (76.435ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S9: old client hello without protocol still works (56.7454ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S9: >500 items in selection is capped (103.9963ms)
✔ S9 — WS hardening (237.6061ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [WS] Order order-0001 created by admin
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S9 — orders:save re-hydration
  ✔ S9: orders:save re-hydrates from uids — fake title is overwritten (1127.1482ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ S9: orders:save with unknown uid is dropped (1132.7042ms)
✔ S9 — orders:save re-hydration (2260.1491ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 2 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
▶ Games + orders re-hydration (real WS clients)
  ✔ customer selecting a movie AND a game reaches manager with canonical data (1130.6659ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 2 movies
  [WS] Order order-0001 created by admin
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-621Z.json
  [MOVIE-CREATOR] Movie added: 0001 - فیلم‌های آخر هفته
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-636Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Ocean's Twelve
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-648Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Tom & Jerry (2021)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ orders:save re-hydrates both movies and games (1142.7924ms)
✔ Games + orders re-hydration (real WS clients) (2273.7745ms)
▶ Persian and awkward name tests
  ✔ movie-creator creates movie in genre دوبله فارسی with Persian title (15.6088ms)
  ✔ movie-creator creates movie with apostrophe in title (12.9613ms)
  ✔ movie-creator creates movie with & and parentheses in title (11.3786ms)
✔ Persian and awkward name tests (40.1437ms)
▶ ARCH-01 — single version source
  ✔ ARCH-01: hardcoded version strings in source files must match package.json (9.0563ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ ARCH-01: /api/movies meta.version must match package.json version (19.6332ms)
✔ ARCH-01 — single version source (28.8867ms)
▶ SEC-04 guard — no unescaped template interpolation in innerHTML
  ✔ scans js/**/*.js for raw ${ inside innerHTML assignments (4.8859ms)
✔ SEC-04 guard — no unescaped template interpolation in innerHTML (4.9647ms)
▶ Diagnostics (characterization)
  ✔ runFullReport returns correct shape (19.6804ms)
  ✔ AC2/A7: storage warnings from a corrupt orders.json appear in diagnostics.storage.warnings (15.2067ms)
  ✔ counts type distribution correctly (9.6682ms)
  ✔ B9: invalidFilenames from last scan, orphanMetadata from metadata store, games in summary (12.531ms)
  ✔ B9: report is cached for 30s and invalidate() forces rebuild (5.5258ms)
  ✔ B9: missing posters come from file index membership (no disk stat required) (5.0824ms)
✔ Diagnostics (characterization) (69.8212ms)
▶ ARCH-01 — js/ is an ES module package
  ✔ declares type "module" so Node parses js/ files as ESM (0.965ms)
  ✔ stays public, minimal and dependency-free (0.2724ms)
✔ ARCH-01 — js/ is an ES module package (2.734ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-43-695Z.json
  [MOVIE-CREATOR] Movie added: 0003 - Third Movie
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: etag game
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: etag game 2
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Added: 0009- Watcher Movie 2009.jpg
  [WATCHER] Reconcile Movies: +1 ~0 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 4 movies
  [WS] WebSocket server closed
▶ P8c G6 — payload ETag coverage over the admin surface
  ✔ plain GETs keep the ETag; every catalog mutation and watcher event moves it (1018.3358ms)
✔ P8c G6 — payload ETag coverage over the admin surface (1019.7595ms)
▶ P8a follow-up - fatal handlers (real child processes)
  ✔ unhandledRejection: exit 1, FATAL logged, bilingual console line, no secret (95.521ms)
  ✔ uncaughtException: exit 1, FATAL logged, bilingual console line, no secret (95.8851ms)
  ✔ server.js auto-start installs exactly these handlers (source wiring) (0.906ms)
✔ P8a follow-up - fatal handlers (real child processes) (194.0385ms)
▶ P6c E2 shared filename builder (ARCH-03, I4)
  ✔ I4 conventions for every movie type (2.7977ms)
  ✔ Series ignores id and year entirely (I5: identity is the title) (0.2949ms)
  ✔ sanitizes forbidden filename characters (same rule as the old creator) (0.2887ms)
  ✔ rejects path-escaping titles through safeSegment (I10) (3.8957ms)
  ✔ buildGameFilename: title + extension only, no id or year (I4, I8) (0.3171ms)
✔ P6c E2 shared filename builder (ARCH-03, I4) (10.1631ms)
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
▶ GameCreator (P6c E4)
  ✔ create: writes a copy per platform and indexes the game (AC4) (20.2587ms)
  ✔ validation: structured codes for title/platforms/poster/extension/traversal; statusOf → 400 (AC6) (9.6929ms)
  ✔ duplicate title → 409 GAME_EXISTS (10.4494ms)
  ✔ unindexed file already at a target → 409 FILE_EXISTS, nothing written, not indexed (10.4783ms)
  ✔ rollback: injected write failure on the 2nd platform removes the 1st; not indexed (10.2515ms)
  ✔ statusOf: unknown errors fall back to 500 (8.1403ms)
✔ GameCreator (P6c E4) (71.3016ms)
▶ GameEditor (P6c E4)
  ✔ rename moves every platform copy; uid follows the title (27.9907ms)
  ✔ rename onto an existing game → 409 GAME_EXISTS, nothing touched (8.7031ms)
  ✔ platform removal deletes the copy; re-adding copies it back; empty set → 400 (13.8066ms)
  ✔ poster replace rewrites every platform copy (11.4832ms)
  ✔ field validation: blank title → 400 TITLE_REQUIRED; traversal title → 400 TITLE_INVALID (7.9026ms)
  ✔ unknown game uid → 404 NOT_FOUND; statusOf maps it (7.7323ms)
  ✔ watcher.expect receives every old and new path on rename (11.1729ms)
✔ GameEditor (P6c E4) (89.4288ms)
▶ MovieEditor guard (P6c E4): game uids never reach the movie pipeline
  ✔ updateMovie(game:…) → 400 GAME_UNSUPPORTED before any file is touched (9.8513ms)
✔ MovieEditor guard (P6c E4): game uids never reach the movie pipeline (9.993ms)
▶ js/utils/helpers.js — idOrTitle / hasId (FE-06)
  ✔ loads ES module via dynamic import (4.5209ms)
  ✔ Movie / Animation / Iranian → id (0.3338ms)
  ✔ leading zeros are preserved verbatim (I2: id is a string) (0.3407ms)
  ✔ Series (id:null) → title (0.2229ms)
  ✔ Games (no id field at all) → title, never "undefined" (0.2044ms)
  ✔ empty-string id falls back to title (0.2046ms)
  ✔ null/undefined item → empty string, never throws (0.2264ms)
  ✔ hasId mirrors the same decision (1.1112ms)
✔ js/utils/helpers.js — idOrTitle / hasId (FE-06) (10.0036ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 6 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 4 movies, 4 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 6 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 4 movies
▶ HTTP API (characterization)
  ▶ GET /api/movies
    ✔ returns correct shape (42.9264ms)
    ✔ returns all indexed movies (3.4085ms)
  ✔ GET /api/movies (47.4675ms)
  ▶ GET /api/stats
    ✔ returns stats with genres, types, decades (6.4126ms)
  ✔ GET /api/stats (6.7759ms)
  ▶ GET /api/config
    ✔ serves the shared front-end config with version from package.json (4.5779ms)
  ✔ GET /api/config (4.9407ms)
  ▶ GET /api/poster/:id
    ✔ returns 200 for existing poster (10.9137ms)
    ✔ returns 404 for non-existing poster (3.2002ms)
  ✔ GET /api/poster/:id (14.671ms)
  ▶ POST /api/auth/login
    ✔ returns token for valid credentials (126.0746ms)
    ✔ returns 401 for invalid credentials (61.0065ms)
  ✔ POST /api/auth/login (187.7223ms)
  ▶ GET /api/movies/next-id
    ✔ returns next ID for Movie type (with token) (71.2386ms)
    ✔ returns 400 for invalid type (53.9261ms)
    ✔ returns null nextId for Series type (67.1225ms)
  ✔ GET /api/movies/next-id (192.8003ms)
  ▶ GET /api/games
    ✔ returns games array (2.0882ms)
  ✔ GET /api/games (2.3398ms)
  ▶ PUT /api/movies/by-uid/:uid (B7)
    ✔ requires admin auth (3.4694ms)
    ✔ updates a Movie by bare uid and renames the file (68.442ms)
    ✔ updates a Series by URL-encoded uid (74.6878ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 4 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
    ✔ legacy PUT /api/movies/:id still works as a delegating alias (59.2447ms)
  ✔ PUT /api/movies/by-uid/:uid (B7) (206.3239ms)
✔ HTTP API (characterization) (811.4422ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ A5 non-blocking catalog persistence
  ✔ PUT /api/movies/:id does not call saveToDisk synchronously (debounced via scheduleSave) (858.5353ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan does not call saveToDisk synchronously (824.6434ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ stop() flushes a pending scheduleSave before exit (A6) (126.9798ms)
✔ A5 non-blocking catalog persistence (1810.5899ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ B10 rescan
  ✔ POST /api/rescan rescans movies and games, returns counts + invalid (124.5783ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan picks up an invalid filename into invalid count (124.3397ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan does not stall the event loop > 200ms per tick (AC8 lag probe) (231.3684ms)
✔ B10 rescan (480.6899ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ BUG-2 diagnostics freshness after edit
  ✔ GET /api/diagnostics immediately after title edit reflects post-edit state (no 30s TTL) (82.468ms)
✔ BUG-2 diagnostics freshness after edit (183.7668ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P6a E1 PUT by-uid poster + genres
  ✔ requires admin auth for poster PUT (401) (3.6962ms)
  ✔ rejects a disguised non-image poster with IMG_UNSUPPORTED; file untouched (48.9616ms)
  ✔ replaces poster bytes on disk for a valid payload (single PUT, Q1) (49.2027ms)
  ✔ allows a >100KB poster PUT body (guard exemption for by-uid) (52.1294ms)
  ✔ applies genres patch: adds folder copy, removes de-selected copy (76.3158ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 7 directories
  [WS] WebSocket server initialized
  ✔ rejects empty genres with 400 GENRE_REQUIRED (structured code in body) (64.5084ms)
✔ P6a E1 PUT by-uid poster + genres (406.2426ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 3 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [WATCHER] Releasing hold: 7 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
▶ P6b E3 delete + restore API
  ✔ all three endpoints require admin auth (401) (14.3226ms)
  ✔ DELETE: every copy moves into .trash/<id>/, manifest entry written, movie gone from catalog (87.2612ms)
  ✔ GET /api/trash: newest-first with the full entry shape (53.5991ms)
  ✔ restore: movie returns with imdbRating/plotSummary intact, files back, entry leaves the trash (acceptance 3) (58.0589ms)
  ✔ restore into an occupied destination → 409 RESTORE_CONFLICT, nothing moved, no partial restore (79.4552ms)
  [INDEXER] Removed game from index: fifa 24
  ✔ error codes: unknown uid 404, game uid deletes like a movie (E4), bad restore id 400, unknown restore 404 (73.7506ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ Series round-trip: delete by series uid then restore (68.7277ms)
✔ P6b E3 delete + restore API (558.7528ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
▶ P6b E3 trash list: newest-first, capped at 20, log permanent
  ✔ GET /api/trash returns the 20 newest entries newest-first; older log entries stay on disk (52.2473ms)
✔ P6b E3 trash list: newest-first, capped at 20, log permanent (115.0892ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 3 movies, 3 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 5 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 3 movies
▶ P6c E2 add flow API
  ✔ POST /api/movies/preview requires admin (401 without token) (4.7076ms)
  ✔ POST /api/movies requires admin (401 without token) (2.1799ms)
  ✔ preview returns the exact I4 filename for every type (shared builder, ARCH-03) (48.0843ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-47-859Z.json
  [MOVIE-CREATOR] Movie added: 0077 - Preview Parity
  ✔ preview filename === server-written filename for the same inputs (no third copy) (44.9023ms)
  ✔ preview rejects an unsafe title with 400 TITLE_INVALID (traversal, I10) (39.0187ms)
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  ✔ create: missing title → 400 TITLE_REQUIRED with a Persian message (50.9791ms)
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0001 قبلاً استفاده شده است
  ✔ create: taken id → 409 ID_TAKEN (conflict must NOT surface as a generic 400) (35.5044ms)
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  ✔ create: unsafe genre → 400 GENRE_INVALID, nothing written outside its folder (37.4681ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-069Z.json
  [MOVIE-CREATOR] Movie added: 0091 - Genre Probe
  ✔ create: a new genre name becomes a real folder and the movie lands in it (50.6378ms)
  ✔ create: decoded poster beyond 8 MB → 413 IMG_TOO_LARGE (119.6278ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 5 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ create: JSON body beyond the express limit → 413 JSON IMG_TOO_LARGE (not an HTML error page) (95.6091ms)
✔ P6c E2 add flow API (609.934ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P6c E4 games management
  ✔ POST /api/games requires admin (401, AC6) (4.1476ms)
  ✔ validation: title/platforms/poster and traversal produce structured 400s (AC6) (61.5474ms)
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ create: writes Games/PS4 and Games/PS5 copies and merges into the catalog (AC4) (44.5609ms)
  ✔ create: duplicate title → 409 GAME_EXISTS (36.7126ms)
  [INDEXER] Removed game from index: new game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: rename moves both platform copies; uid follows the title (49.4142ms)
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: platform removal deletes the copy, adding re-creates it, empty set → 400 (44.415ms)
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: poster replace rewrites every platform copy (55.0756ms)
  ✔ PUT by-uid unknown game → 404 NOT_FOUND (41.184ms)
  [INDEXER] Removed game from index: renamed game x
  ✔ DELETE game: both copies to trash, entry type Game, catalog drops it (AC4) (48.9398ms)
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: renamed game x
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ restore game: files back and the game re-enters the catalog; occupied destination → 409 (76.92ms)
✔ P6c E4 games management (537.1121ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ P8b static assets — font serving, CSP font-src
  ✔ GET /assets/fonts/Vazirmatn-Variable.woff2 → 200 font/woff2 (8.1505ms)
  ✔ GET /assets/fonts/OFL.txt → 200 (SIL licence shipped with the font) (3.5649ms)
  ✔ GET /assets/… traversal and unknown assets → 404 (2.7078ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  ✔ CSP includes font-src 'self' (G5) (2.5819ms)
✔ P8b static assets — font serving, CSP font-src (33.8224ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 2 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Loaded 1 movies from cache
▶ CatalogIndexer
  ✔ indexes a single movie (9.2697ms)
  ✔ merges genres across copies of the same movie in different folders (9.0236ms)
  ✔ keys Series by normalised title (trimmed, collapsed, lowercased) (4.9317ms)
  ✔ preserves custom fields (imdbRating, plotSummary) across replaceFromScan (5.5034ms)
  ✔ adds a movie via addFile and retrieves it (1.6706ms)
  ✔ removes a movie via removeFile (1.4648ms)
  ✔ returns null for getMovieById with unknown id (1.1197ms)
  ✔ get count returns 0 for empty index (1.0813ms)
  ✔ saves and loads from disk (9.16ms)
✔ CatalogIndexer (44.9195ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ P8a G3 - log rotation (injected clock)
  ✔ keeps exactly 7 files across 10 days, newest retained (15.9461ms)
  ✔ init prunes stale files down to 7 immediately (10.0525ms)
  ✔ disabled logger writes nothing (0.8955ms)
✔ P8a G3 - log rotation (injected clock) (28.9602ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
▶ P8a G3 - secrets never reach the log (full login flow)
  ✔ full flow leaves no password, token or Authorization material in any log file (339.977ms)
✔ P8a G3 - secrets never reach the log (full login flow) (462.0704ms)
  [METADATA] Migrated 2 items from catalog.json
  [METADATA] Migrated 1 items from catalog.json
▶ MetadataStore
  ✔ starts empty when no file and no catalog exist (2.9892ms)
  ✔ set/get/remove round-trip and persists to disk (15.2677ms)
  ✔ rename moves metadata to the new key (1.3852ms)
  ✔ set patches only provided fields and refreshes updatedAt (1.1028ms)
  ✔ migrates imdbRating/plotSummary from an old catalog.json on first start (DATA-10) (8.4391ms)
  ✔ deleting catalog.json loses nothing once metadata is migrated (DATA-10) (8.8881ms)
  ✔ does not migrate when metadata.json already exists (4.6331ms)
  ✔ orphans lists keys not in the existing key set (2.3995ms)
  ✔ attach merges metadata onto a movie object (1.3739ms)
  ✔ flush() writes pending changes synchronously (5.9856ms)
✔ MetadataStore (54.3277ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-725Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Test Movie
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: حداقل یک ژانر برای فیلم الزامی است
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-758Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Backup Test
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-772Z.json
  [MOVIE-CREATOR] Movie added: 00001 - Finding Nemo
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-786Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Gav
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-802Z.json
  [MOVIE-CREATOR] Movie added: null - Breaking Bad
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-818Z.json
  [MOVIE-CREATOR] Movie added: 0001 - First
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0001 قبلاً استفاده شده است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: فایل 0001- Dup 2020.jpg قبلاً در C:\Users\Ali\AppData\Local\Temp\mc-rollback-1792358982838\Library\Movies\Action وجود دارد
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-859Z.json
  [MOVIE-CREATOR] Movie added: 0001 - First
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-863Z.json
  [MOVIE-CREATOR] Movie added: 0002 - Second
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-940Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Tmp Check
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-953Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Async Save
▶ MovieCreator (characterization)
  ✔ creates a movie with 2 genres: files, index, catalog.json (26.6547ms)
  ✔ validates required fields (9.2748ms)
  ✔ creates backup before modifying catalog (13.5577ms)
  ✔ creates an Animation movie in Animation/ folder (12.8703ms)
  ✔ creates an Iranian movie in Iranian/ folder (14.8275ms)
  ✔ creates a Series in Serries/ folder (no id) (16.1122ms)
  ✔ rejects duplicate ID (17.7434ms)
  ✔ rejects invalid year for Movie type (10.3693ms)
  ✔ cleans up temp files on failure (rollback) (14.9438ms)
  ✔ generates unique IDs for consecutive movies (16.3292ms)
  ✔ DATA-13: temp upload never lands inside Library/ (77.0884ms)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 2 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: حداقل یک ژانر برای فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  [MOVIE-CREATOR] Creation failed, rolling back: نوع فیلم نامعتبر است
  [MOVIE-CREATOR] Creation failed, rolling back: تصویر پوستر الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: فرمت تصویر نامعتبر است (jpg, jpeg, png, webp, avif)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-43-682Z.json
  [MOVIE-CREATOR] Movie added: 0042 - First
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0042 قبلاً استفاده شده است
  [MOVIE-CREATOR] Creation failed, rolling back: فایل 0042- Dup 2002.jpg قبلاً در C:\Users\Ali\AppData\Local\Temp\mc-p6c-1792358983689-3\Library\Movies\Action وجود دارد
  ✔ A5: createMovie does not call saveToDisk synchronously (debounced via scheduleSave) (715.8245ms)
✔ MovieCreator (characterization) (947.72ms)
▶ P6c E2 structured create errors (FE-13)
  ✔ validation failures carry structured codes; statusOf maps them to 400 (12.0129ms)
  ✔ conflicts carry ID_TAKEN; statusOf maps it to 409 (14.4903ms)
  ✔ a colliding target file carries FILE_EXISTS; statusOf maps it to 409 (16.8766ms)
  ✔ statusOf: unknown errors fall back to 500 (0.2673ms)
✔ P6c E2 structured create errors (FE-13) (44.0042ms)
▶ MovieEditor
  ✔ renames every genre copy (all _fileIndex entries for the key) (16.0814ms)
  ✔ metadata-only patch touches no files (7.3817ms)
  ✔ cross-type id conflict → 409 before any file is touched (9.6783ms)
  ✔ target filename collision → 409 before any file is touched (8.9106ms)
  ✔ rollback: failure partway through multi-file rename restores files; index untouched (9.45ms)
  ✔ Series: update by uid renames title-only filename and re-keys (12.9504ms)
  ✔ id change re-keys map key type:id and file index (9.8859ms)
  ✔ watcher.expect is called with old and new paths when renaming (12.3544ms)
  ✔ empty title → 400 validation (8.0595ms)
  ✔ E1 genre add: copies poster into the new genre folder; disk and index updated (15.7066ms)
  ✔ E1 genre remove: deletes only the de-selected copy; rest kept on disk and in index (9.466ms)
  ✔ E1 genre remove: absolutePosterPath repointed when its own folder is de-selected (7.1437ms)
  ✔ E1 genre edit: combined add + remove in one patch touches both folders (9.039ms)
  ✔ E1 genre rollback: failure partway through move+copy restores folders; index untouched (65.1041ms)
  ✔ E1 genre add: pre-existing unindexed file at target → 409 FILE_EXISTS, nothing touched (6.3951ms)
  ✔ E1: genres patch on a Series → 400 NON_MOVIE_GENRE_EDIT (8.26ms)
  ✔ E1: empty genres on a Movie → 400 GENRE_REQUIRED (6.2062ms)
  ✔ E1: non-array genres → 400 GENRE_INVALID (6.2055ms)
  ✔ E1: unsafe genre name (traversal) → 400 GENRE_INVALID; nothing touched (8.3527ms)
  ✔ E1 codes (Q6): TITLE_REQUIRED / ID_REQUIRED / YEAR_INVALID on field validation (5.2444ms)
  ✔ E1 poster replace: extension change — every copy becomes .png, no .jpg orphan, bytes match (8.8346ms)
  ✔ E1 poster replace: same-extension overwrite — bytes replaced in place, file count unchanged (9.4261ms)
  ✔ E1 poster replace: unsupported extension → 400 IMG_UNSUPPORTED, disk untouched (7.9805ms)
  ✔ E1 poster replace rollback: THROWN failure during write-new (ext change) — old files untouched, no new-ext file remains (10.1392ms)
  ✔ E1 poster replace rollback: same-extension write-new failure — original bytes restored everywhere (9.7784ms)
  ✔ E1 poster replace: watcher.expect receives every old and new path (9.1571ms)
  ✔ E1 combined patch: rename + genre change + poster replace in one updateMovie call (11.2254ms)
✔ MovieEditor (311.3038ms)
  [INDEXER] Removed game from index: fifa 24
  [INDEXER] Removed game from index: fifa 24
  [INDEXER] Games: +1 new, ~0 updated, 1 total
▶ MovieTrash (P6b E3 — soft delete / restore, D6)
  ✔ delete: single-genre file moves to .trash/<id>/ with relative path preserved; manifest entry written; movie gone from index (26.3247ms)
  ✔ delete: multi-genre movie — every copy moves, all originalPaths recorded, movie dropped (21.3129ms)
  ✔ delete: watcher.expect receives every source and target path (18.7643ms)
  ✔ delete rollback: injected failure on the 2nd move restores the 1st; index and manifest untouched (15.2656ms)
  ✔ delete: game uid soft-deletes every platform copy into .trash (P6c E4) (17.7275ms)
  ✔ restore: game entry moves the files back and re-enters the games index (P6c E4) (23.6586ms)
  ✔ delete: unknown uid and empty uid → 404 NOT_FOUND (8.8339ms)
  ✔ delete: corrupt manifest → 500 TRASH_MANIFEST_ERROR, nothing moved (15.5321ms)
  ✔ delete broadcasts catalog:changed {removed} and invalidates diagnostics (30.4998ms)
  ✔ restore: files return to original paths; movie reappears with rating/plot intact; entry removed; trash folder cleaned (35.6775ms)
  ✔ restore: multi-genre movie — every copy returns; genres unioned (34.1905ms)
  ✔ restore: occupied destination → 409 RESTORE_CONFLICT; nothing moved; entry intact (29.2697ms)
  ✔ restore: unknown id → 404 TRASH_NOT_FOUND; non-numeric id → 400 VALIDATION; purged id → 404 TRASH_PURGED; empty folder → 404 (17.3983ms)
  ✔ restore broadcasts catalog:changed {added} and invalidates diagnostics (31.8ms)
  ✔ Series round-trip: delete by series uid keeps uid, restore re-keys (25.7096ms)
  ✔ list(): newest-first, capped at 20, purged entries excluded (15.8365ms)
  ✔ purge: the 21st deletion purges the OLDEST deletion's files from disk; its log entry stays with purgedAt; window entries untouched (66.2896ms)
✔ MovieTrash (P6b E3 — soft delete / restore, D6) (436.5716ms)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Order not found: order-9999
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0006 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0004 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Failed to save orders: EEXIST: file already exists, mkdir 'C:\Users\Ali\AppData\Local\Temp\ord-test-RKQPfZ\orders-as-dir\nested'
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Restored from backup: orders.20261018-212943.json
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0006 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 status -> preparing
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Restored order-0001 (number 1)
  [ORDERS] Loaded 2 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Restored order-0001 (number 1)
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
▶ OrderManager
  ✔ creates an order (14.7568ms)
  ✔ lists orders (18.7725ms)
  ✔ gets order by ID (9.9641ms)
  ✔ returns null for unknown order ID (2.0397ms)
  ✔ deletes an order (13.0939ms)
  ✔ returns false when deleting unknown order (1.4984ms)
  ✔ persists orders to disk (7.5607ms)
  ✔ incrementing order numbers (11.8189ms)
  ✔ throws on empty movie list (2.007ms)
  ✔ count returns 0 for empty (1.6756ms)
  ✔ persists {version, nextNumber, orders} format (A4) (6.5798ms)
  ✔ upgrades a legacy array-format file on first save (A4 migration) (11.6021ms)
  ✔ upgrades a legacy {orders, nextNumber} file (10.7125ms)
  ✔ whitelists movie snapshot fields and caps length (A4 validation) (7.5061ms)
  ✔ rejects orders with more than 500 items (A4 validation) (1.7159ms)
  ✔ returns a clear error object when save fails instead of throwing (A4) (10.4962ms)
  ✔ forces a backup before deleting an order (A4 / destructive op) (20.3376ms)
  ✔ quarantines a corrupt orders.json and restores from backup (DATA-08) (23.1039ms)
  ✔ P6d E5: new orders get workflow defaults (status new, empty name/note, updatedAt = createdAt) (6.0486ms)
  ✔ P6d E5: legacy orders load with defaults (status done, empty fields, updatedAt = createdAt) and persist on next save (11.9599ms)
  ✔ P6d E5: an invalid status in a stored file loads as done (4.008ms)
  ✔ P6d E5: updateOrderStatus persists the new status and bumps updatedAt (15.7595ms)
  ✔ P6d E5: updateOrderStatus rejects unknown statuses with a Persian error and changes nothing (7.6149ms)
  ✔ P6d E5: updateOrderStatus on an unknown id returns false (1.6549ms)
  ✔ P6d E5: updateOrderInfo clamps name/note to 200 chars, bumps updatedAt, persists (14.0866ms)
  ✔ P6d E5: updateOrderInfo keeps omitted fields, rejects unknown ids with a Persian error (17.1023ms)
  ✔ P6d E5: soft delete removes the order everywhere but undo restores the same id and number (31.4069ms)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0002 (had 1 movies)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Restored order-0002 (number 2)
  [ORDERS] No existing orders file found, starting fresh
  ✔ P6d E5: undo after the window returns null; dispose() cancels the purge timer (220.9884ms)
  ✔ P6d E5: undo of an order that was never deleted returns null (1.6575ms)
✔ OrderManager (511.2562ms)
▶ parseFilename — table-driven (≥40 filenames)
  ✔ parses "5273-Shelter 2026.jpg" as Movie (5.9611ms)
  ✔ parses "5273-Shelter (2026).jpg" as Movie (0.5927ms)
  ✔ parses "5273-Shelter-2026.jpg" as Movie (0.3402ms)
  ✔ parses "5273-Shelter.2026.jpg" as Movie (0.2881ms)
  ✔ parses "5273 Shelter 2026.jpg" as Movie (0.2763ms)
  ✔ parses "5273 - Shelter (2026).jpg" as Movie (0.3446ms)
  ✔ parses "5273_Shelter_2026.jpg" as Movie (0.3079ms)
  ✔ parses "5273 The Dark Knight 2008 WEB-DL x265.jpg" as Movie (0.4268ms)
  ✔ parses "5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" as Movie (0.4996ms)
  ✔ parses "0001- Heat 1995.jpg" as Movie (0.4322ms)
  ✔ parses "0099- Inception 2010.jpg" as Movie (0.2793ms)
  ✔ parses "123- The Godfather 1972.jpg" as Movie (0.323ms)
  ✔ parses "0001- The Matrix 1999.jpg" as Movie (0.2593ms)
  ✔ parses "1234-Iron Man 3.2013.jpg" as Movie (0.208ms)
  ✔ parses "0001- 1917 2019.jpg" as Movie (0.2113ms)
  ✔ parses "0001- Blade Runner 2049 2017.jpg" as Movie (0.2363ms)
  ✔ parses "0001- 2012 2009.jpg" as Movie (0.2083ms)
  ✔ parses "0001- Charlotte's Web 2006.jpg" as Movie (0.205ms)
  ✔ parses "0001- The Amazon 2019.jpg" as Movie (0.1928ms)
  ✔ parses "0001- Dark Web 2021.jpg" as Movie (0.1985ms)
  ✔ parses "0001- Extended Family 2018.jpg" as Movie (0.2028ms)
  ✔ parses "0001- Apple 2020.jpg" as Movie (0.2054ms)
  ✔ parses "0001- Netflix Special 2021.jpg" as Movie (0.1872ms)
  ✔ parses "0001- HBO Story 2015.jpg" as Movie (0.2036ms)
  ✔ parses "0001- Limited Edition 2017.jpg" as Movie (0.1998ms)
  ✔ parses "0001- Multi Player 2016.jpg" as Movie (0.1826ms)
  ✔ parses "0001- Final Cut 2014.jpg" as Movie (0.1871ms)
  ✔ parses "0001- Uncut Gem 2019.jpg" as Movie (0.1903ms)
  ✔ parses "0001- Disney Dream 2013.jpg" as Movie (0.1835ms)
  ✔ parses "0001- Hulu House 2020.jpg" as Movie (0.1844ms)
  ✔ parses "0001- Grey's Anatomy 2005.jpg" as Movie (0.1873ms)
  ✔ parses "0001- 100% Wolf 2020.jpg" as Movie (0.1871ms)
  ✔ parses "0001- Tom & Jerry 2021.jpg" as Movie (0.3117ms)
  ✔ parses "0001- C# Lover 2018.jpg" as Movie (0.2198ms)
  ✔ parses "1234- سلام 2020.jpg" as Movie (1.7442ms)
  ✔ parses "0001- فیلم ایرانی 2015.jpg" as Movie (0.2829ms)
  ✔ parses "00012-Cars 2006.jpg" as Animation (0.4444ms)
  ✔ parses "00012-Cars.jpg" as Animation (0.2446ms)
  ✔ parses "00001-Up.jpg" as Animation (0.1712ms)
  ✔ parses "00001-Up 2009.jpg" as Animation (0.4498ms)
  ✔ parses "0001-Gav 1969.jpg" as Iranian (1.6554ms)
  ✔ parses "0001-Gav.jpg" as Iranian (0.2966ms)
  ✔ parses "Breaking Bad.jpg" as Series (1.9607ms)
  ✔ parses "Game of Thrones.jpg" as Series (0.2323ms)
  ✔ parses "100% Wolf.jpg" as Series (0.1574ms)
  ✔ parses "Charlotte's Web.jpg" as Series (0.1474ms)
  ✔ parses "0001- Heat 1995 [BluRay].jpg" as Movie (0.2334ms)
  ✔ parses "0001- Heat 1995 (1080p).jpg" as Movie (0.256ms)
  ✔ parses "0001- Heat 1995 x265 HDRip.jpg" as Movie (0.1623ms)
✔ parseFilename — table-driven (≥40 filenames) (26.5857ms)
▶ parseFilename — rejects invalid filenames
  ✔ returns null for "0001- Heat 1995.mp4" (unsupported-ext) (0.3023ms)
  ✔ returns null for "Heat 1995.jpg" (no-id) (0.065ms)
  ✔ returns null for "0001- Heat.jpg" (no-year) (0.2507ms)
  ✔ returns null for "0001- Heat 1800.jpg" (no-year) (0.2068ms)
  ✔ returns null for ".jpg" (unsupported-ext) (0.0453ms)
  ✔ returns null for "1234567- Inception 2010.jpg" (id-too-long) (0.0453ms)
  ✔ returns null for "12345678- Foo 2020.jpg" (id-too-long) (0.0972ms)
  ✔ returns null for "0001- .jpg" (empty-title) (0.0601ms)
  ✔ returns null for "0001- 2019.jpg" (no-year) (0.0695ms)
  ✔ returns null for "" (unsupported-ext) (0.0533ms)
  ✔ returns null for "noext" (unsupported-ext) (0.1424ms)
✔ parseFilename — rejects invalid filenames (1.7074ms)
▶ parseFilenameEx — success shape
  ✔ returns {ok:true, entry} for a valid Movie (1.2855ms)
  ✔ returns {ok:true, entry} for a valid Series (0.253ms)
  ✔ lowercases extension (0.2116ms)
✔ parseFilenameEx — success shape (1.912ms)
▶ parseFilename — characterization edge cases
  ✔ parses "0001- Heat 1800.jpg" as null (year out of 19xx/20xx range) (0.2113ms)
  ✔ does not treat 7-digit run as split ID (DATA-18) (0.0822ms)
  ✔ Animation keeps year when present (DATA-11) (0.1895ms)
✔ parseFilename — characterization edge cases (0.6329ms)
▶ cleanTitle (DATA-12)
  ✔ keeps Charlotte's Web (0.2927ms)
  ✔ keeps The Amazon (0.1889ms)
  ✔ keeps Dark Web (0.1714ms)
  ✔ keeps Extended Family (0.1737ms)
  ✔ keeps Apple (0.1753ms)
  ✔ strips technical bracket groups (0.2102ms)
  ✔ strips technical paren groups but keeps real parens (0.4416ms)
  ✔ keeps non-technical bracket content (0.2144ms)
  ✔ NFC-normalises and trims (0.1732ms)
  ✔ keeps ZWNJ (0.5614ms)
✔ cleanTitle (DATA-12) (3.0234ms)
▶ classifyFromPath
  ✔ classifies Movies/Action as Movie with genre (0.4249ms)
  ✔ classifies Animation/ as Animation (0.1404ms)
  ✔ classifies Series/ as Series (0.1149ms)
  ✔ classifies Iranian/ as Iranian (0.0973ms)
  ✔ classifies Serries/ as Series (alias) (0.0846ms)
  ✔ classifies SERIES/ as Series (case-insensitive) (0.0698ms)
  ✔ classifies Games/PS4/ as Game (0.1219ms)
  ✔ classifies Movies/Drama/ correctly (0.1069ms)
  ✔ classifies Movies/ with no subfolder — genre is filename (current behavior) (0.0997ms)
✔ classifyFromPath (1.5656ms)
▶ TYPE_MAP
  ✔ maps movies to Movie (0.1635ms)
  ✔ maps animation to Animation (0.0715ms)
  ✔ maps series to Series (0.0616ms)
  ✔ maps serries to Series (alias) (0.0797ms)
  ✔ maps iranian to Iranian (0.079ms)
  ✔ maps games to Game (0.0775ms)
✔ TYPE_MAP (0.7358ms)
▶ IMAGE_EXTENSIONS
  ✔ contains jpg (0.1443ms)
  ✔ contains jpeg (0.1174ms)
  ✔ contains png (0.1179ms)
  ✔ contains webp (0.0793ms)
  ✔ contains avif (0.0708ms)
  ✔ does not contain mp4 (0.1303ms)
✔ IMAGE_EXTENSIONS (1.0154ms)
▶ PayloadCache (unit)
  ✔ builds once, keeps a stable quoted-sha1 ETag across getEntry calls (3.8002ms)
  ✔ invalidate debounces bursts into one rebuild; ETag changes with content (20.8815ms)
  ✔ getEntry rebuilds synchronously when dirty (lazy request path) (1.7413ms)
  ✔ produces a gunzippable copy equal to the raw body (30.2141ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ dispose cancels the pending rebuild (61.9207ms)
✔ PayloadCache (unit) (120.559ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ GET /api/movies + /api/games payload caching (P8c G6)
  ✔ ETag + Vary + 304 + gzip; ETag stays stable across repeated requests (134.9961ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ a successful mutation changes the ETag and the served data (189.6367ms)
✔ GET /api/movies + /api/games payload caching (P8c G6) (325.2004ms)
▶ P8c — persist sort fast path (DATA-14 equivalence)
  ✔ compareKeysPersist agrees with localeCompare(en, numeric) on catalog key forms (84.9005ms)
  ✔ isFastKey accepts exactly the ICU-equivalent forms (0.3843ms)
  ✔ compareNumericAware is a total order (antisymmetric + reflexive) (0.4506ms)
  ✔ sortForPersist produces the same order as sort(compareForPersist) (27.8349ms)
  ✔ stringifyCatalogAsync is byte-identical to JSON.stringify (compact) (14.3501ms)
✔ P8c — persist sort fast path (DATA-14 equivalence) (131.397ms)
▶ P8c — async save path
  ✔ saveToDiskAsync writes the same catalog as saveToDisk (order + fields) (32.3894ms)
  ✔ flushAsync clears a pending debounced save and returns true (10.0831ms)
✔ P8c — async save path (42.9819ms)
▶ P8c — async replaceFromScan parity
  ✔ replaceFromScanAsync yields identical state to replaceFromScan (49.469ms)
  ✔ replaceFromScanAsync preserves edited titles and metadata across the swap (2.7322ms)
✔ P8c — async replaceFromScan parity (52.4895ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
▶ P8b follow-up — poster replaced in place (same filename)
  ✔ movies: same-name overwrite with NEWER mtime → new ?v, new bytes, catalog:changed (585.0643ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
  ✔ movies: same-name overwrite with OLDER mtime (utimes) also refreshes ?v (537.0303ms)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [WATCHER] Added game: Hades
  [WATCHER] Reconcile Games: +1 ~0 -0
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Updated game: Hades
  [WATCHER] Reconcile Games: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ games: same-name overwrite → new ?v in GET /api/games + catalog:changed (1019.9289ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ PUT by-uid poster replace (edit path) → fresh ?v matches disk mtime (269.3424ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ thumbnail cache: overwrite produces a NEW hash file with new webp bytes (656.5743ms)
✔ P8b follow-up — poster replaced in place (same filename) (3198.4296ms)
▶ P8a G1 - collectLanUrls
  ✔ collects non-internal IPv4 addresses with their interface names (2.1939ms)
  ✔ skips loopback/internal addresses (0.2556ms)
  ✔ includes virtual adapters (VMware/VirtualBox are non-internal IPv4s) (1.2987ms)
  ✔ handles legacy numeric family values (older Node) (0.2444ms)
  ✔ no network at all: empty list (main falls back to localhost only) (0.209ms)
  ✔ wiring: uses os.networkInterfaces() and the resolved config port (0.9079ms)
✔ P8a G1 - collectLanUrls (6.9627ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ P8c follow-up — failing reconcile keeps the cached catalog
  ✔ a reconcile that throws keeps the cache, settles scanning and lifts the 503 (242.317ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [WATCHER] Cannot watch C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953: ENOTDIR: not a directory, scandir 'C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953'
  [SCANNER] Cannot read directory: C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953 — ENOTDIR: not a directory, scandir 'C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953'
  ✔ an unreadable library root before the swap does not wipe the cache (43.6285ms)
✔ P8c follow-up — failing reconcile keeps the cached catalog (288.1872ms)
▶ Role Provider (characterization)
  ▶ getClientRole
    ✔ returns "customer" for customer role (1.4983ms)
    ✔ returns "manager" for manager role (0.1797ms)
    ✔ returns null for invalid role (0.2379ms)
    ✔ returns null for null/undefined (0.1626ms)
  ✔ getClientRole (5.8142ms)
  ▶ isValidRole
    ✔ returns true for valid roles (0.2163ms)
    ✔ returns false for invalid roles (0.1723ms)
  ✔ isValidRole (0.5991ms)
  ▶ VALID_ROLES
    ✔ contains exactly customer and manager (0.269ms)
  ✔ VALID_ROLES (0.5117ms)
✔ Role Provider (characterization) (7.7907ms)
▶ Scanner (characterization)
  ▶ scanLibrary
    ✔ returns {results, stats} with correct shape (17.8213ms)
    ✔ parses Movie type from Movies/{Genre}/ path (5.9559ms)
    ✔ parses Animation type from Animation/ path (7.0423ms)
    ✔ parses Iranian type from Iranian/ path (3.6907ms)
    ✔ parses Series type from Series/ path (3.5828ms)
    ✔ handles non-existent library path gracefully (0.4017ms)
    ✔ skips non-image files (5.7761ms)
  ✔ scanLibrary (46.2293ms)
  ✔ parses Serries/ as Series (alias) (3.237ms)
  ✔ returns all files (including same ID in multiple genre folders) (7.001ms)
  ✔ ignores Movies/ with no genre subfolder (edge case) (3.4321ms)
  ✔ does not walk Games/ during scanLibrary (DATA-04) (9.3187ms)
  ✔ skips dot-folders (.trash, .tmp) at the Library root (6.6352ms)
  ✔ returns invalid[] with reasons for unparseable posters (6.2234ms)
  ✔ scanFile returns {ok:true, entry} for a valid file (6.8137ms)
  ✔ scanFile returns {ok:false, reason, file} for an invalid file (3.1284ms)
  ▶ scanGames
    ✔ returns {results, stats} with correct shape (8.7633ms)
    ✔ merges same title across PS4 and PS5 (7.073ms)
    ✔ returns empty for non-existent Games dir (4.2706ms)
  ✔ scanGames (20.4085ms)
  ▶ resolveTypeFolder (D7)
    ✔ new library uses Series/ (4.6548ms)
    ✔ existing Serries/ is kept (2.6598ms)
    ✔ existing SERIES/ is found case-insensitively (2.597ms)
    ✔ Animation/Iranian use conventional names (3.2488ms)
  ✔ resolveTypeFolder (D7) (13.4768ms)
✔ Scanner (characterization) (128.4363ms)
  [P5a] 20k search: build=120.3ms avg=3.03ms worst=6.81ms
  [P5a] 5k-subset search: worst=2.19ms
▶ js/utils/search.js
  ✔ loads ES module via dynamic import (7.1389ms)
  ✔ applies a config fixture so type labels resolve (ARCH-03 via /api/config) (0.8232ms)
  ▶ buildSearchEntry / buildSearchIndex
    ✔ precomputes a normalised haystack containing title, id, year, genres, type labels (1.5921ms)
    ✔ never stringifies null/undefined (Series hay must not contain "null"/"undefined") (0.5475ms)
    ✔ builds entries for games with platform labels (0.2588ms)
  ✔ buildSearchEntry / buildSearchIndex (2.8709ms)
  ▶ searchItems — normalisation both directions (FE-07)
    ✔ query with Arabic letters finds titles stored with Persian letters (and vice versa) (1.8474ms)
    ✔ Persian-digit query ۲۰۲۰ finds ASCII year 2020 (1.6144ms)
    ✔ ASCII query 2020 finds the same items (0.3487ms)
    ✔ ZWNJ query finds no-ZWNJ title and vice versa (0.398ms)
    ✔ Persian type label سریال finds Series (0.3584ms)
    ✔ English type label Series finds the same items (0.5212ms)
    ✔ typing "null" finds nothing (FE-07) (0.4016ms)
    ✔ typing "undefined" finds nothing (0.2132ms)
  ✔ searchItems — normalisation both directions (FE-07) (6.4545ms)
  ▶ searchItems — tokenise on spaces, AND the tokens
    ✔ multi-token AND matches across the haystack (0.3553ms)
    ✔ a token matching nothing yields no results (0.258ms)
    ✔ tokens may match different fields (genre + year) (0.8117ms)
  ✔ searchItems — tokenise on spaces, AND the tokens (1.8484ms)
  ▶ searchItems — ranking: exact ID > title prefix > contains
    ✔ exact-ID match ranks first, then title-prefix, then contains (0.3492ms)
    ✔ prefix beats contains for Latin titles (0.207ms)
    ✔ equal ranks keep the input (type-rule) order — stable (0.2002ms)
  ✔ searchItems — ranking: exact ID > title prefix > contains (1.0327ms)
  ▶ searchItems — edge cases
    ✔ empty query returns the input list unchanged (0.3572ms)
    ✔ restricts to the provided subset (category filter) (0.2238ms)
    ✔ games: platform query finds games (0.2197ms)
    ✔ tieBreak comparator orders equal ranks (I11 as tie-break) (0.2854ms)
  ✔ searchItems — edge cases (1.3446ms)
  ▶ 20k fixture — main-thread search measurement (worker decision)
    ✔ build + 12 queries: worst query ≤ 30 ms on 20,000 items (172.2329ms)
    ✔ subset (category-filtered) worst query ≤ 30 ms (129.4451ms)
  ✔ 20k fixture — main-thread search measurement (worker decision) (301.8406ms)
✔ js/utils/search.js (325.0664ms)
▶ js/utils/sort.js
  ✔ loads ES module via dynamic import (13.9827ms)
  ▶ compareMovie — Year DESC then ID DESC
    ✔ sorts by year descending (0.2678ms)
    ✔ sorts by ID descending when years are equal (0.1397ms)
    ✔ treats missing year as 0 (0.1435ms)
  ✔ compareMovie — Year DESC then ID DESC (0.7916ms)
  ▶ compareIranian — ID DESC (year ignored)
    ✔ sorts by ID descending (0.1967ms)
    ✔ ignores year differences (0.2714ms)
  ✔ compareIranian — ID DESC (year ignored) (0.7218ms)
  ▶ compareSeries — alphabetical, ignoring articles
    ✔ sorts alphabetically by title (0.5242ms)
    ✔ ignores "The" at the start (0.2164ms)
  ✔ compareSeries — alphabetical, ignoring articles (1.0493ms)
  ▶ compareMovies — dispatches by type
    ✔ uses compareMovie for Movie type (0.3056ms)
    ✔ uses compareSeries for Series type (0.2412ms)
  ✔ compareMovies — dispatches by type (0.714ms)
  ▶ compareAllMovies — groups by type priority: Movie → Iranian → Animation → Series
    ✔ Movie sorts before Iranian (0.224ms)
    ✔ Iranian sorts before Animation (0.1273ms)
    ✔ Animation sorts before Series (0.0951ms)
  ✔ compareAllMovies — groups by type priority: Movie → Iranian → Animation → Series (0.6065ms)
  ▶ sortMovies
    ✔ sorts an array in-place (0.1829ms)
  ✔ sortMovies (0.26ms)
  ▶ numericId
    ✔ parses "00452" to 452 (0.1581ms)
    ✔ parses "9821" to 9821 (0.0849ms)
    ✔ returns -1 for null (0.1104ms)
    ✔ returns -1 for undefined (0.0953ms)
    ✔ returns -1 for non-numeric (0.0864ms)
  ✔ numericId (0.7196ms)
  ▶ normalizedSeriesTitle
    ✔ lowercases (0.1618ms)
    ✔ strips "The" (0.082ms)
    ✔ strips "A" (0.0901ms)
    ✔ strips "An" (0.0775ms)
    ✔ returns empty string for null (0.0873ms)
  ✔ normalizedSeriesTitle (0.7291ms)
  ▶ D3 — shared fa collator
    ✔ faCollator is Intl.Collator("fa", {numeric:true, sensitivity:"base"}) (0.205ms)
    ✔ numeric option: "Movie 2" < "Movie 10" (0.119ms)
    ✔ case-insensitive (base sensitivity): breaking ≡ Breaking (0.0854ms)
    ✔ Persian titles compare in Persian alphabetical order (الفبا) (1.1426ms)
    ✔ mixed Persian/Latin: Persian titles order before Latin under fa (0.2395ms)
    ✔ ZWNJ title equals its no-ZWNJ variant (compare === 0) (0.453ms)
  ✔ D3 — shared fa collator (2.4949ms)
  ▶ D3 — compareSeries uses the fa collator (I11 rule unchanged)
    ✔ Persian Series titles sort alphabetically (0.3088ms)
    ✔ mixed Persian/Latin Series: Persian before Latin (0.116ms)
    ✔ ZWNJ variants of the same Series title compare equal (0.1038ms)
    ✔ article stripping still applies (I11 unchanged) (0.0967ms)
    ✔ Latin ordering unchanged vs the old en comparator (0.1033ms)
  ✔ D3 — compareSeries uses the fa collator (I11 rule unchanged) (0.943ms)
  ▶ D3 — fallback comparator uses the fa collator
    ✔ unknown type: equal years fall back to fa title order (0.1788ms)
  ✔ D3 — fallback comparator uses the fa collator (0.3034ms)
✔ js/utils/sort.js (25.93ms)
▶ P8c — StartupProbe phase attribution
  ✔ attributes a blocking chunk to the phase it ran in, not the next one (165.844ms)
  ✔ records the worst chunk per phase and stop() flushes the final gap (130.7145ms)
  ✔ setPhase is a no-op while stopped and for the same label (0.3607ms)
✔ P8c — StartupProbe phase attribution (298.1503ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ P8c G6 — background reconcile
  ✔ cold start answers from an empty cache with meta.scanning=true, then swaps in the scan (88.2864ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ warm start serves the cached catalog while still scanning (103.5896ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ rejects catalog mutations with 503 SCAN_IN_PROGRESS until reconcile finishes (130.7524ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [WATCHER] Added: 0003- Third Movie 2003.jpg
  [WATCHER] Reconcile .: +1 ~0 -0
  [INDEXER] Saved catalog to disk: 3 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 3 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ replays watcher events held during the scan (new poster lands in the index) (297.0239ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  ✔ broadcasts catalog:changed when reconcile finishes (even with zero diffs) (57.83ms)
✔ P8c G6 — background reconcile (679.5543ms)
  [WS] WebSocket server closed
▶ P8a follow-up - stale stop.request
  ✔ removes a stale file at arm time and does not stop (156.0323ms)
  ✔ a file written after arming stops exactly once, then is removed (356.5953ms)
  ✔ missing directory: arming does not throw (1.1106ms)
  ✔ server.js wires armStopWatch (no inline watch left) (0.8009ms)
✔ P8a follow-up - stale stop.request (516.3849ms)
▶ backend/storage/atomic-json
  ✔ writeJsonAtomic creates the file with parsed JSON (11.5897ms)
  ✔ writeJsonAtomic pretty option indents output (7.3515ms)
  ✔ writeJsonAtomic creates missing parent directories (7.5011ms)
  ✔ writeJsonAtomic leaves no .tmp siblings behind after success (9.5168ms)
  ✔ writeJsonAtomic replaces existing file atomically (last write wins) (9.5064ms)
  ✔ readJsonSafe returns ok + data for valid JSON (3.7043ms)
  ✔ readJsonSafe returns missing when the file does not exist (0.9048ms)
  ✔ readJsonSafe quarantines corrupt file and never overwrites the original bytes (5.1068ms)
  ✔ readJsonSafe restores from newest valid backup when present (5.9781ms)
  ✔ readJsonSafe skips invalid backups and picks the newest valid one (6.3137ms)
  ✔ readJsonSafe with no backup returns corrupt + quarantine path (3.7932ms)
  ✔ AC1: crash between temp-write and rename leaves target at previous version (12.2288ms)
✔ backend/storage/atomic-json (85.6783ms)
▶ backend/storage/backup policy
  ✔ creates a timestamped backup file (7.7105ms)
  ✔ throttles to at most one backup per 10 minutes while changing (306.2501ms)
  ✔ force backup bypasses the throttle (destructive ops) (5.1642ms)
  ✔ 1,000 rapid saves produce ≤ 40 backup files (acceptance 5) (1955.2499ms)
  ✔ retention keeps newest 30 + one per day for 14 days (fake clock) (211.2963ms)
  ✔ never deletes the last valid backup even with zero retention room (5.1665ms)
  ✔ startupBackup creates one only when the file changed since the last backup (6.743ms)
  ✔ does not touch catalog.json (rebuildable cache is out of scope) (4.2455ms)
✔ backend/storage/backup policy (2502.3394ms)
▶ P8a G1 - supervisor crash policy
  ✔ exposes the launcher contract constants (1.9234ms)
  ✔ clean exit (code 0) is done — never restarted, never counted (0.3608ms)
  ✔ first four crashes within the window restart after 3 s (0.314ms)
  ✔ 5 crashes within 2 minutes → stop (0.2775ms)
  ✔ crashes older than 2 minutes fall out of the window (0.2682ms)
  ✔ a longer-lived run (>= 2 min) resets the count (0.2822ms)
  ✔ signal exit (code null) counts as a crash (0.1999ms)
  ✔ config-error exit (code 2): stop without counting a crash (0.2874ms)
  ✔ real supervisor run: a config-error child (exit 2) is not restarted (131.7782ms)
  ✔ real supervisor run: exit 0 child is done, not restarted (120.5967ms)
  ✔ require() does not auto-run the supervisor (require.main guard) (1.0318ms)
✔ P8a G1 - supervisor crash policy (258.9473ms)
▶ js/utils/text.js — normalizeFa
  ✔ loads ES module via dynamic import (2.678ms)
  ▶ D1 — Yeh variants → Persian Yeh (U+06CC)
    ✔ Arabic Yeh ي (U+064A) → Persian Yeh (0.6619ms)
    ✔ Persian Yeh ی stays Persian Yeh (0.23ms)
    ✔ Alef Maksura ى (U+0649) → Persian Yeh (0.1254ms)
    ✔ Alef Maksura at word end (على) → علی (0.1179ms)
    ✔ both directions: Arabic-typed query equals Persian-stored title (0.2204ms)
  ✔ D1 — Yeh variants → Persian Yeh (U+06CC) (1.8233ms)
  ▶ D1 — Kaf variants → Persian Keheh (U+06A9)
    ✔ Arabic Kaf ك (U+0643) → Persian Keheh (0.2516ms)
    ✔ Persian Keheh ک stays (1.1042ms)
    ✔ both directions: Arabic-typed کمدی equals Persian-stored کمدی (0.2884ms)
    ✔ mixed variant query still equals stored title (0.2355ms)
  ✔ D1 — Kaf variants → Persian Keheh (U+06A9) (2.2633ms)
  ▶ D1 — digits → ASCII
    ✔ Persian digits ۰-۹ (U+06F0–06F9) → ASCII (0.2329ms)
    ✔ Arabic-Indic digits ٠-٩ (U+0660–0669) → ASCII (0.1398ms)
    ✔ ASCII digits unchanged (0.1744ms)
    ✔ ۲۰۲۰ equals 2020 (Persian-digit query finds ASCII year) (0.0763ms)
    ✔ mixed digits inside a word (0.0689ms)
  ✔ D1 — digits → ASCII (0.8617ms)
  ▶ D1 — tatweel and diacritics removed
    ✔ tatweel U+0640 removed (0.1071ms)
    ✔ fatha/shadda/kasra removed (U+064B–U+065F) (0.0628ms)
    ✔ superscript alef U+0670 removed (0.0509ms)
    ✔ diacritics do not block matching (0.0541ms)
  ✔ D1 — tatweel and diacritics removed (0.4229ms)
  ▶ D1 — ZWNJ removed for matching (display untouched elsewhere)
    ✔ ZWNJ U+200C removed (0.1722ms)
    ✔ ZWNJ variant equals no-ZWNJ form (0.0644ms)
    ✔ ZWNJ in possessive خانه‌ی equals خانهی (0.0563ms)
  ✔ D1 — ZWNJ removed for matching (display untouched elsewhere) (0.3991ms)
  ▶ D1 — Latin lowercasing
    ✔ upper → lower (0.0757ms)
    ✔ mixed Persian/Latin (0.0619ms)
  ✔ D1 — Latin lowercasing (0.1965ms)
  ▶ D1 — whitespace collapse
    ✔ collapses runs and trims (0.0806ms)
    ✔ tabs and newlines count as whitespace (0.0516ms)
    ✔ empty string returns empty (0.0487ms)
  ✔ D1 — whitespace collapse (0.2657ms)
  ▶ D1 — null/undefined safety
    ✔ null → empty string (never "null") (0.0683ms)
    ✔ undefined → empty string (never "undefined") (0.0825ms)
    ✔ never produces the literal text "null" (0.0831ms)
  ✔ D1 — null/undefined safety (0.3537ms)
  ▶ D1 — NFKC compatibility normalisation
    ✔ ligature ﬁ → fi (0.6889ms)
    ✔ fullwidth Latin Ａ → a (0.2919ms)
    ✔ circled digit ① → 1 (0.2608ms)
  ✔ D1 — NFKC compatibility normalisation (1.3615ms)
  ▶ D1 — composition & idempotence
    ✔ all rules combined (0.1713ms)
    ✔ is idempotent: f(f(x)) === f(x) (0.1403ms)
    ✔ handles numeric input without throwing (0.0633ms)
  ✔ D1 — composition & idempotence (0.4886ms)
  ▶ AC1 — end-to-end acceptance phrases
    ✔ query typed with Arabic letters finds title stored with Persian letters (and vice versa) (0.2623ms)
    ✔ Persian digits match ASCII years (0.1116ms)
    ✔ ZWNJ query matches no-ZWNJ title (0.0635ms)
  ✔ AC1 — end-to-end acceptance phrases (0.5912ms)
✔ js/utils/text.js — normalizeFa (13.0245ms)
▶ P8b thumbs service
  ✔ isThumbWidth accepts 300/600 only; WIDTHS exported (3.0242ms)
  ✔ hashFor is stable and changes with path, mtime and width (2.3815ms)
  ✔ get generates once, then serves from cache; atomic (no .tmp left) (14.7346ms)
  ✔ mtime invalidation: a changed file produces a NEW thumb name (8.6519ms)
  ✔ generation pool never exceeds concurrency 2 (116.774ms)
  ✔ sharp missing: get returns null and logs the fallback once (2.2873ms)
  ✔ sharp load THROWS (simulated install failure): null + visible fallback, app keeps serving (2.13ms)
  ✔ generation reads the source into a Buffer (no sharp path/fd input) (6.2605ms)
  ✔ sharp failure mid-generation: null, tmp cleaned, failure logged once (4.6754ms)
  ✔ get rejects unknown widths and non-finite mtime without touching disk (2.2858ms)
  ✔ cleanOrphans keeps expected names and removes the rest (4.7028ms)
  ✔ cleanOrphans on a missing cache dir is a no-op (1.4988ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ warmUp pre-generates both widths for the first entries only (11.6826ms)
✔ P8b thumbs service (183.7045ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b poster route — ?w validation, headers, fallback
  ✔ w=500 (unknown width) → 400 (40.8178ms)
  ✔ no ?v → cacheable but NOT immutable; ETag present (7.4795ms)
  ✔ ?v matching the file mtime → immutable; If-None-Match → 304 (8.8809ms)
  ✔ ?v=0 (stale) is NOT immutable (3.5172ms)
  ✔ GET /api/movies posters carry ?v and never leak mtime (SEC-08) (2.1439ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ thumb request with undecodable source falls back to the original bytes (12.6462ms)
✔ P8b poster route — ?w validation, headers, fallback (125.0318ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b poster route — real sharp end-to-end (skips without sharp)
  ✔ w=300 returns a real webp thumbnail smaller than the original (51.2633ms)
  ✔ repeat request is served from the thumbs cache (one file per width) (61.0871ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 1 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ game posters also accept ?w and versioned URLs exist (67.1892ms)
✔ P8b poster route — real sharp end-to-end (skips without sharp) (223.4656ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 8 movies, 8 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 8 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 8 movies
  [WS] WebSocket server closed
▶ P8b follow-up — rename-during-generation with warm-up ENABLED
  ✔ editor rename via PUT by-uid succeeds while warm-up converts (no EBUSY) (490.7241ms)
  ℹ 8 editor renames during warm-up completed in 155 ms (0 collisions)
  ✔ direct fs rename + in-place replace succeed while svc.get converts (no EBUSY) (215.9413ms)
  ℹ 10 direct renames + 1 replace during warm-up: 21 ms, 0 collisions
✔ P8b follow-up — rename-during-generation with warm-up ENABLED (709.032ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
▶ Watcher (characterization)
  ✔ hot-added Movie file appears in the index (1610.5306ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (removed)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ deleted Movie file is removed from the index (1610.0343ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies: +1 ~0 -0
  [WATCHER] Stopped
  ✔ onChange callback fires on file add with {added,updated,removed} shape (1606.2194ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ delete one copy of a multi-genre movie keeps the movie (different copy remains) (1608.8712ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (removed)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ delete the only copy of a movie removes it from the index (1613.9492ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Added: 0002- Inception 2010.jpg
  [WATCHER] Reconcile Movies\Drama: +1 ~0 -0
  [WATCHER] Stopped
  ✔ watcher watches all pre-existing sub-directories (2117.3673ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
  ✔ watcher stops cleanly without lingering timers (608.9917ms)
✔ Watcher (characterization) (10779.0363ms)
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
▶ B6 — order-independent reconcile (AC2)
  ✔ AC2: {remove-old, add-new} and {add-new, remove-old} → identical final state, metadata intact (3241.2979ms)
  [WATCHER] Added: 0007- Arrival 2016.jpg
  [WATCHER] Reconcile .: +1 ~0 -0
  [WATCHER] Stopped
  ✔ B6: new directory is watched and its files are indexed (1607.1857ms)
  [WATCHER] Reconcile (deleted Action): +0 ~0 -1
  [WATCHER] Stopped
  ✔ B6: deleting a whole directory removes its files; movie removed only when no copy remains (1614.838ms)
  [WATCHER] Added: 0002- Inception 2010.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
  ✔ B6: expect(paths) suppresses server-initiated events until TTL (3229.0769ms)
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [INDEXER] Games: +1 new, ~0 updated, 2 total
  [WATCHER] Added game: Spider-Man
  [WATCHER] Reconcile Games: +1 ~0 -0
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [WATCHER] Stopped
  ✔ B6: Games changes go to the games pipeline, never the movie index (1608.6661ms)
✔ B6 — order-independent reconcile (AC2) (11301.97ms)
  [WATCHER] Stopped
▶ P6b D6 — root dot-folders (.trash) are invisible to the watcher
  ✔ a root-level reconcile never (re-)indexes files under .trash; .trash is never watched (1620.179ms)
✔ P6b D6 — root dot-folders (.trash) are invisible to the watcher (1620.5234ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
▶ WebSocket (characterization)
  ▶ hello handshake
    ✔ customer connects and receives hello:ack (49.1103ms)
  [WS] Customer disconnected (remaining: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
    ✔ manager connects with valid token (82.9314ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Invalid/expired token from ::1 — closing
    ✔ manager with invalid token gets hello:error (6.4752ms)
  ✔ hello handshake (143.2192ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  ▶ selection broadcast
    ✔ customer selection is broadcast to manager (66.0155ms)
  ✔ selection broadcast (66.3314ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [WS] Order order-0001 created by admin
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ▶ orders round trip
    ✔ manager can save and list orders via WS (85.9473ms)
  ✔ orders round trip (86.3309ms)
  [WS] Manager disconnected: admin (total: 0)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Added: 0005- Fresh 2021.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  ▶ catalog:changed (B6)
    ✔ hot-added poster broadcasts catalog:changed {added,updated,removed} (618.5202ms)
  ✔ catalog:changed (B6) (619.023ms)
  [WS] WebSocket server closed
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [WS] Order order-0002 created by admin
  [ORDERS] Saved 2 orders to disk
  [ORDERS] order-0002 status -> preparing
  [WS] Order order-0002 status -> preparing
  [WS] Manager disconnected: admin (total: 1)
  ▶ P6d E5 - orders workflow via WS
    ✔ status change reaches a second manager client (AC5) (61.8278ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 3 orders to disk
  [ORDERS] Created order-0003 with 1 movies
  [WS] Order order-0003 created by admin
  [WS] Manager disconnected: admin (total: 1)
    ✔ invalid status is refused with a Persian orders:error and broadcasts nothing (366.0432ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 4 orders to disk
  [ORDERS] Created order-0004 with 1 movies
  [WS] Order order-0004 created by admin
  [ORDERS] Saved 4 orders to disk
  [ORDERS] order-0004 info updated
  [WS] Order order-0004 info edited
  [WS] Manager disconnected: admin (total: 1)
    ✔ orders:edit persists customerName/note and broadcasts (E5 fields) (61.5229ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 5 orders to disk
  [ORDERS] Created order-0005 with 1 movies
  [WS] Order order-0005 created by admin
  [ORDERS] Saved 4 orders to disk
  [ORDERS] Deleted order-0005 (had 1 movies)
  [WS] Order order-0005 deleted by admin
  [ORDERS] Saved 5 orders to disk
  [ORDERS] Restored order-0005 (number 5)
  [WS] Order order-0005 restored
  [WS] Manager disconnected: admin (total: 1)
    ✔ orders:undo restores the deleted order with the same number (AC5) (67.8648ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [WS] Manager disconnected: admin (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
    ✔ orders:undo for an expired or unknown id answers with orders:error (53.0283ms)
  ✔ P6d E5 - orders workflow via WS (610.9423ms)
✔ WebSocket (characterization) (1634.3845ms)
  [WS] WebSocket server closed
ℹ tests 746
ℹ suites 169
ℹ pass 746
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27695.1223

```
```

> movie-catalog@5.4.0 test:ui
> node scripts/run-tests.js ui

Running 12 test file(s) from test/ui:

  test\ui\add-flow-real.test.js
  test\ui\add-modal.test.js
  test\ui\copy-shortcuts.test.js
  test\ui\dialog-a11y.test.js
  test\ui\edit-modal.test.js
  test\ui\game-manage.test.js
  test\ui\login-modal.test.js
  test\ui\orders-workflow.test.js
  test\ui\p8b-assets.test.js
  test\ui\poster-refresh-real.test.js
  test\ui\trash-panel.test.js
  test\ui\ui.test.js

  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Customer disconnected (remaining: 0)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-30-29-516Z.json
  [MOVIE-CREATOR] Movie added: 0002 - Genre Form Probe
  [INDEXER] Saved catalog to disk: 2 movies
▶ P6c E2 - real add flow writes a new genre folder
  ✔ inline genre + create → real folder, I4 filename, live catalog entry (2453.3123ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
✔ P6c E2 - real add flow writes a new genre folder (15453.2215ms)
▶ P6c E2 - add modal downscale/errors/genre/dup/preview
  ✔ downscales a >4 MB poster before upload: payload cut ≥4×, longest side <= 1400px, size shown (5331.3508ms)
  ✔ filename preview displays the SERVER builder result (ARCH-03, no local copy) (1687.636ms)
  ✔ inline genre creation: new genre becomes a checked checkbox and rides the create request (541.9362ms)
  ✔ probable duplicate (same normalised title + year): warns, does not block (1492.3318ms)
  ✔ duplicate warning can be cancelled: modal stays open, nothing submitted (2094.4483ms)
  ✔ rejects a >30 MB file with a Persian message before any upload (5975.4547ms)
  ✔ rejects a non-image renamed .jpg with a Persian message (394.895ms)
  ✔ every failure cause gets its own distinct Persian toast (400/409/413/network/401) (3052.1753ms)
✔ P6c E2 - add modal downscale/errors/genre/dup/preview (24915.1591ms)
▶ D4 / FE-06 — copy, print and order snapshot use the id-vs-title helper
  ✔ FE-06: Ctrl+Shift+C copies id for Movies, title for Series and Games — no "undefined" (148.4462ms)
  ✔ FE-06: print view is RTL and lists every ref exactly once, never "undefined" (290.7486ms)
  ✔ FE-06: the order snapshot (order detail) shows ids for Movies and titles for Series/Games (100.8583ms)
✔ D4 / FE-06 — copy, print and order snapshot use the id-vs-title helper (16358.3105ms)
▶ D5 / FE-15 — Ctrl+B and shortcuts modal parity
  ✔ FE-15: Ctrl+B toggles the selection panel (open → collapsed → open) (67.8729ms)
  ✔ FE-15: every shortcut advertised in the shortcuts modal actually works (469.2589ms)
✔ D5 / FE-15 — Ctrl+B and shortcuts modal parity (2059.5781ms)
▶ D7 / FE-14 — modal accessibility
  ✔ FE-14a: login dialog — role/aria, focus-in, Tab trap, Escape, focus restore (4170.4723ms)
  ✔ FE-14b: save is gated by confirm modal (not window.confirm); Escape cancels top only (4104.0633ms)
  ✔ FE-14c: movie-detail, shortcuts and diagnostics dialogs expose aria and close on Escape (1418.6986ms)
  ✔ FE-14d: icon-only header buttons carry Persian aria-labels (52.1147ms)
✔ D7 / FE-14 — modal accessibility (17817.5601ms)
▶ P6a E1 - edit modal genres/poster/inline errors
  ✔ renders genre checkboxes + poster input for a Movie; no genre section for Series (1496.5366ms)
  ✔ removing a genre: one confirm naming it, no PUT before confirm, exact patch after (1952.9638ms)
  ✔ adding a genre: checked value included in the PUT patch (1857.5428ms)
  ✔ server 409 ID_TAKEN maps to the inline ID field error; modal stays open (2135.7888ms)
  ✔ unmapped server error code shows the form-level inline alert with the Persian text (1168.8126ms)
  ✔ empty title: inline field error before any confirm or PUT (649.5929ms)
  ✔ P6b E3: server delete failure shows the Persian error toast and keeps the modal open (1254.472ms)
  ✔ P6b E3: delete fires no DELETE before the confirm; second click sends exactly one; card disappears (1076.1175ms)
  ✔ P6b E3: Series also offers delete (uid route supports series) (486.2217ms)
✔ P6a E1 - edit modal genres/poster/inline errors (18904.9762ms)
▶ P6c E4 - games add/edit/delete/restore UI
  ✔ admin panel add button follows the media mode: «افزودن بازی» in games mode (265.0903ms)
  ✔ add modal: game chip shows platforms and hides movie fields; no platform → Persian toast, no POST (1933.8967ms)
  ✔ add modal: a valid game posts to /api/games and appears in the grid (2414.084ms)
  ✔ probable duplicate game: warns with the title, cancel keeps the modal, continue posts (4165.2147ms)
  ✔ edit modal for a game: platform checkboxes, no movie fields, «حذف بازی», PUT carries the game uid (551.95ms)
  ✔ removing a platform: one confirm naming it, no PUT before confirm, exact patch after (1486.2049ms)
  ✔ deleting a game confirms, issues the DELETE, and the card disappears (1007.688ms)
  ✔ restore: game entries toast the game wording and the game returns to the grid (149.7764ms)
✔ P6c E4 - games add/edit/delete/restore UI (17692.5535ms)
▶ P7C-LOGIN-FLAKE - login modal autofocus keeps caller focus
  ✔ keeps focus on #password through the 100ms autofocus timer; typed text lands there (1175.0321ms)
✔ P7C-LOGIN-FLAKE - login modal autofocus keeps caller focus (11203.6316ms)
▶ P6d E5 - orders workflow UI
  ✔ manager header badge shows the live customer selection count (179.6702ms)
  ✔ order cards show a Persian status chip; the status filter narrows the list (140.2504ms)
  ✔ the date filter narrows to one local day (58.8099ms)
  ✔ detail: clicking a status chip sends orders:update-status for that order (126.1622ms)
  ✔ detail: name/note inputs are clamped to 200 chars and sent via orders:edit (164.6111ms)
  ✔ CSV builder: UTF-8 BOM + exact header + Persian data (AC5) (31.3549ms)
  ✔ detail: the CSV button downloads order-N.csv starting with the BOM (966.0597ms)
  ✔ print: the popup is RTL, headed with order number/date, and lists big IDs (AC5) (242.0393ms)
  ✔ delete skips the confirm dialog, shows the 10 s undo toast, and undo calls orders:undo (541.7366ms)
✔ P6d E5 - orders workflow UI (6810.3725ms)
▶ P8b assets — grid thumbnails + bundled font
  ✔ movie-card img carries data-src w=300 and data-srcset "300 1x, 600 2x" (rides ?v) (8.0217ms)
  ✔ lazy-loader promotes srcset before src (loaded cards get real src + srcset) (419.6567ms)
  ✔ Vazirmatn webfont is bundled and active (document.fonts.check) (16.592ms)
  ✔ computed body font-family lists Vazirmatn first (3.7563ms)
  ✔ no request left the stub origin (offline / no-CDN invariant) (1.4987ms)
✔ P8b assets — grid thumbnails + bundled font (3003.0511ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b follow-up - UI shows a poster replaced in place
  ✔ watcher overwrite → card swaps to the new ?v URL and serves the new bytes (1262.7742ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer disconnected (remaining: 0)
  [WS] Manager authenticated: admin (total: 1)
  ✔ edit-modal poster replace → card shows the new poster through the real save path (2121.6261ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
✔ P8b follow-up - UI shows a poster replaced in place (4759.4205ms)
▶ P6b E3 - admin trash panel
  ✔ lists trash entries newest-first with title, date and file count (10.4521ms)
  ✔ restore posts to /api/trash/:id/restore, removes the row, and the movie returns to the grid (48.277ms)
  ✔ empty trash shows the empty state after the last entry is restored (31.6987ms)
✔ P6b E3 - admin trash panel (1690.815ms)
▶ FE-01 + FE-02 — grid rebuild + socket/worker leak
  ✔ FE-01: selecting one card must not rebuild the grid or lose scroll position (3700.5857ms)
  ✔ FE-02: rescan x3 must keep exactly one WebSocket and not spawn extra Workers (854.7323ms)
✔ FE-01 + FE-02 — grid rebuild + socket/worker leak (5411.3381ms)
▶ SEC-04 + FE-04 — XSS + onerror placeholder
  ✔ SEC-04: markup in title / plotSummary must be rendered as text, never executed (721.4084ms)
  ✔ FE-04: a Series with apostrophe in title must get the placeholder when poster 404s (3.4185ms)
✔ SEC-04 + FE-04 — XSS + onerror placeholder (1605.8686ms)
▶ SEC-04b — double-escaping: special chars rendered as text, not HTML entities
  ✔ SEC-04b: title with quotes, ampersand, angle brackets must display as literal text (743.5474ms)
✔ SEC-04b — double-escaping: special chars rendered as text, not HTML entities (1455.8275ms)
P3F typeReport: {
  "Movie": {
    "found": true,
    "text": "\n      \n        \n        دوبله فارسی\n        \n        \n          🎬\n          Tom\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Tom & Jerry's \"Greatest\" 2001\n        #0001\n        \n          دوبله فارسی\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Animation": {
    "found": true,
    "text": "\n      \n        \n        انیمیشن دوبله\n        \n        \n          🎬\n          Toy\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Toy <Story> & \"More\" 1995\n        #00002\n        \n          Animation\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Iranian": {
    "found": true,
    "text": "\n      \n        \n        \n        \n        \n          🎬\n          ایرانی\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        ایرانی & Test \"Quote\" 2020\n        #0003\n        \n          عاشقانه\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Series": {
    "found": true,
    "text": "\n      \n        \n        سریال\n        \n        \n          🎬\n          Series\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Series \"Test\" & <Tag>\n        \n        \n          \n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  }
}
▶ P3F-ESC — no literal tags / double-escaped entities in rendered UI
  ✔ P3F-ESC-1: grid cards show no literal <div>/<span> badge markup (report per type) (12.9623ms)
  ✔ P3F-ESC-2: movie-detail meta/actions show no literal nested html (1036.1621ms)
  ✔ P3F-ESC-3: selection sidebar items show no literal nested html (827.1923ms)
  ✔ P3F-ESC-4: diagnostics panel shows no literal <div style> / double-escaped quotes (1525.1445ms)
✔ P3F-ESC — no literal tags / double-escaped entities in rendered UI (4159.9547ms)
▶ P3G — order view posters are fixed-size thumbnails
  ✔ P3G: order-detail poster renders ≤ thumbnail size and view stays on screen (1111.4636ms)
✔ P3G — order view posters are fixed-size thumbnails (2579.4887ms)
▶ CSP-SAN — zero CSP violations during full app walkthrough
  ✔ CSP-SAN: customer + admin walkthrough — zero CSP violations / pageerrors / console errors (4806.7623ms)
✔ CSP-SAN — zero CSP violations during full app walkthrough (5741.8671ms)
▶ FE-08 — 401 drops admin to customer with toast and login modal
  ✔ FE-08: admin session + 401 → customer mode, Persian toast, login modal visible (1646.3956ms)
✔ FE-08 — 401 drops admin to customer with toast and login modal (1835.0281ms)
▶ P3H — confirm modal keeps baseline animation and message white-space
  ✔ P3H: confirm-dialog animates with modalIn and preserves message newlines (570.5212ms)
✔ P3H — confirm modal keeps baseline animation and message white-space (944.9156ms)
▶ P3I - Series edit modal (FE-05)
  ✔ P3I: Series edit hides ID field, saves via PUT by-uid, movie identified by new title (1284.1145ms)
  ✔ P3I: Movie edit still shows required ID field (regression guard) (410.4858ms)
✔ P3I - Series edit modal (FE-05) (3163.1173ms)
▶ P4 — listener & subscription hygiene
  ✔ P4-C8: mount/unmount grid 100× returns subscriber count and document listeners to baseline (902.5374ms)
✔ P4 — listener & subscription hygiene (1588.9452ms)
▶ P4 — role change flips every visible card select→edit
  ✔ P4-C4: every visible card switches select→edit on admin login; edit opens the right movie (1550.1178ms)
✔ P4 — role change flips every visible card select→edit (1932.3281ms)
▶ P5a - Persian search normalisation (FE-07)
  ✔ P5a: Arabic-typed and Persian-typed کمدی queries each find both stored forms (1533.0279ms)
  ✔ P5a: ۲۰۲۰ finds year 2020; سریال finds Series; null finds nothing (2519.1447ms)
  ✔ P5a: movie:updated / movie:added keep the search index fresh (hot patch) (2711.5493ms)
✔ P5a - Persian search normalisation (FE-07) (7131.4374ms)
▶ P4 — AC5 catalog:changed refreshes grid without losing scroll
  ✔ P4-AC5: catalog:changed reloads within 1s and keeps scrollTop when list unchanged (2143.1261ms)
✔ P4 — AC5 catalog:changed refreshes grid without losing scroll (2544.8135ms)
▶ P4 — AC4 customer selection survives server restart
  ✔ P4-AC4: after restart (new bootId) with empty server selection, client re-sends local selection (455.7686ms)
✔ P4 — AC4 customer selection survives server restart (1404.6148ms)
ℹ tests 77
ℹ suites 26
ℹ pass 77
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61378.171
Separate invocation: perf budgets in their own process (P4-C5 isolation):

Running 1 test file(s) from test/ui:

  test\ui\perf.test.js

P4-C5 metrics: {"firstPaintFullMs":315,"loadCatalogToPaintMs":118,"selectMs":11,"longTasks":[],"searchMs":260,"cards":40}
P5a search processing: {"filterMs":4.1,"toFrameMs":13.8,"matched":369}
▶ P4-C5 — 20k performance budgets
  ✔ P4-C5: first grid paint ≤ 300ms; select ≤ 50ms; scroll no long task >100ms; search ≤ 50ms (1675.2511ms)
✔ P4-C5 — 20k performance budgets (1892.8991ms)
ℹ tests 1
ℹ suites 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2265.275

```
```
found 0 vulnerabilities

```

---

## FINDINGS (audit, numbered)

Each = one finding with a suggested fix; severity high→low. IDs **F1–F27**.
Tally: **3 MEDIUM** (F1–F3) + **16 LOW** (F4–F11, F15–F17, F19–F22, F24) +
**5 TRIVIAL** (F18, F23, F25–F27) + **3 INFO** (F12–F14) = 27. The 22 ❌
rows of the S3 ledger map 1:1 onto these IDs.

**F1 — MEDIUM: ARCH-06 protocol-level liveness (heartbeat) has zero automated test coverage.**
`server/realtime/ws-server.js:866-884` (pong → isAlive), `:873-877` (failed socket terminate),
`:973-980` (clearInterval on close) are code-only. No test anywhere references
`heartbeat | isAlive | terminate` (grep across `test/` = 0). If someone
removes the heartbeat or the cleanup (i.e. re-breaks ARCH-06), the suite
stays green. *Suggested fix:* one characterisation test (fake no-pong socket +
timers; assert terminate + clearInterval) — no protocol change.

**F2 — MEDIUM: `createServer()` returned object carries `null` for `wsServer`, `diagnostics`, `movieCreator`, `movieEditor`, `movieTrash`, `watcher` (later-assigned services).**
Timeline: services are constructed inside `initialize()` (`server.js:448-483`) which runs from `start()` (`server.js:1352`); the object is built at `createServer()` return (`server.js:1409`) — i.e. before any of those assignments. Nothing in the repo reads the returned object today (tests wire the instances directly / use `whenReconciled/start/stop`), so it's latent, but the next consumer (e.g. a CLI subcommand reading `server.wsServer`) gets `null` and an NPE. *Suggested fix:* getters for the service fields (or assign after `initialize()` returns). Verified also by P8c addendum Discovered (same claim).

**F3 — MEDIUM: game-write invalidation omits the source-level path (movie-editor got c4's `notifyChanged()`, game-editor didn't).**
`backend/services/game-editor.js` mutates maps and only relies on the HTTP
`catalogMutation` belt to drop cached payloads/ETags (0 refs to
`notifyChanged` in the file). A second non-HTTP caller (test, script,
future socket handler) writes games without payload/ETag invalidation —
mirror of the very defect fixed for movie-editor in c4. *Suggested fix:* same c4 pattern in `game-editor.js` (`notifyChanged()` after direct map mutations) — 5-minute change, no protocol change.

**F4 — LOW: `.trash/<id>/` orphan-folder repository sweep absent (P6b Q2, still unanswered by the owner).**
After a hard kill mid-move, files exist under `Library/.trash/<id>/` with no manifest entry and are never swept/recycled automatically. Currently only disk inspection reveals them. *Suggested fix:* on boot, `data/.trash/manifest.json` reconcile — or as P6b asked, an automatic startup sweep of orphan `.trash/` folders (still pending owner decision; logged here to force closure).

**F5 — LOW: no automated test for FE-11 (آیمی→آیتمی one-word typo fix).**
The fix is verified here at byte level in the file, but nothing in
`css-a11y.test.js`/`ui.test.js` asserts the rendered admin empty state
contains the corrected string. Low practical risk; noted because the
register closes FE-11 without a live-checkable artifact.

**F6 — LOW: unused public export `escapeHtml` left in `js/utils/helpers.js:29` (0 refs).**
Deliberately left per P5c STOP-GATE default 3, then never removed in P7.
Dead public API whose presence invites future non-escaped use (ironically
the very bug the codebase fixed everywhere else). *Suggested fix:* delete
the export in a later phase (zero call sites today) or wire it as the
single escape helper for future string attributes.

**F7 — LOW: `scripts/make-fixture-library.js` unique-title collapse (P8c) unchanged.**
Only ~20 unique series and ~10 unique game titles ever appear in the 20k
fixture despite `--series/--games` knobs (filename collisions overwrite;
the "20k" fixture is really 18 920 movies + 30 non-movies). Only affects
future perf benches, not unit/UI tests. *Suggested fix:* suffix counter in
series/game filename generation.

**F8 — LOW: the UI suite still errors (not skips) when no Playwright browser is installed.**
P0e risk claim still true at HEAD: `test/ui/ui.test.js:38-40` calls
`chromium.launch()` in a `before` hook with no availability guard, so a
fresh machine without `npx playwright install chromium` gets one big
crash inside `npm run test:ui`. *Suggested fix:* launch-check guard that
turns the whole run into a polite skip-warn (same shape as the `sharp`
skips).

**F9 — LOW: WS protocol does not broadcast game mutations (P6c Q4, still open).**
A second open admin panel learns of game add/edit/delete only on its next
REST refetch; movies have `movie:updated`/`movie:added` parity. This is a
protocol-family gap that can only be fixed with a version bump (protocol
3 → 4) + client + docs in the same commit. Owner decision pending. *Risk:* an
owner-side inconsistency seen only in multi-screen workflows.

**F10 — LOW: thumbnail cache has no size cap (P8b Q(b), still open).**
Worst case ≈1.4 GB for a 20k library; only a stale-entry startup sweep
exists, no eviction. Owner question was never answered (P8b report ends
with the (a)/(b) confirmations pending).

**F11 — LOW: 20k cold reconcile 2.5–3.1 s flag-flip vs the 10 s AC (P8c Q1 open).**
Nothing user-facing blocks (first answer 0.29–0.58 s; serving from cache);
the remaining top-of-the-list to decide whether a scanner-level ≤10s
follow-up is warranted (bench numbers are in the P8c addendum; the audit
did not re-run the bench).

**F12 — INFO: 503 wording exact-text is pinned (`«کتابخانه در حال بروزرسانی است — لطفاً چند لحظه بعد دوباره تلاش کنید»`).**
No action needed; noted because P8c Q2 was closed with the follow-up c5
(owner answered), recorded in `startup-reconcile.test.js` exact-match.

**F13 — INFO: architecture traceability — only 41/53 test files carry an in-test register tag (Dn/Bn/SEC-… names).**
Register traceability lives in the phase reports instead of test names.
Recalling the defect→test linkage during this audit required re-grepping.
*Related (ledger row 53):* the bundled Vazirmatn is the **full** variable
woff2 — no subset and no explicit `font-display`; acceptable offline, but a
future pass could subset to the used glyphs / add `font-display: swap`.
*Suggested (future, zero-risk) fix:* optional comment tag convention on new
tests (register ID), no behavior change.

**F14 — INFO: `p9a` audit-record / register update only (as the phase promise allows).**
Only statuses; no code changes were made and no configs were altered in
this audit, in line with the auditor role. Nothing to roll back; findings
above are prioritized by their severity rather than the register's phase.

**F15 — LOW: fresh-clone empty-`Library/` boot prints a misleading warn.**
On the very first boot of a pristine clone (S1.7), stderr shows
`[WARN] Background reconcile failed: library root unreadable before swap
(ENOENT) — keeping cached catalog` even though no `data/catalog.json`
cache exists at all — the phrase "keeping cached catalog" is wrong for
this case, and the P8c c3 guard (added for a vanished library) fires on
the never-existed case too. Not a functional problem (the server boots
and serves an empty catalog), but it is the one piece of console noise
that the P9 "no new console noise" clause could be read against, and the
wording will confuse first-run users. *Suggested fix:* in the c3
pre-swap guard, special-case `ENOENT` on a boot where
`data/catalog.json` is absent → friendlier plain-words line (e.g. the
existing LIBRARY_MISSING banner is already printed) or demote to a
debug-level line; keep the warn for the cached-library case.

**F16 — LOW: `@keyframes modalIn` still duplicated in two stylesheets (S3 row 5).**
`admin-panel` injects its own `modalIn` and `components.css` also defines
it; both ship. Harmless today (identical keyframes) but a future tweak to
one copy silently diverges the two modals. *Suggested fix:* keep a single
`@keyframes modalIn` in `css/components.css` and drop the JS-injected copy.

**F17 — LOW: `conflictingMetadata` stays stale after a rename until a rescan (S3 row 7).**
`indexer` records conflicting-metadata findings at full-scan time; a
manager rename via the editor doesn't refresh the set, so the admin can see
a conflict that no longer exists (or miss a new one) until the next rescan.
*Same limitation is carried in the P8c addendum.* *Suggested fix:* recompute
the conflicting-metadata slice on rename/PUT, or expose a "recheck" action
on the diagnostics panel.

**F18 — TRIVIAL: no `npm run start:watch` alias for the supervisor (S3 row 18).**
`Start.bat` invokes `scripts/supervisor.js` directly; there is no npm script
alias, so a contributor reaching for the documented `npm run start:watch`
doesn't find it. *Suggested fix:* add a `"start:watch"` script that shells to
the supervisor (zero behavior change).

**F19 — LOW: warm-up vs rename can still surface a transient 500 (EBUSY) with no retry (S3 row 21).**
On Windows a poster file being read during warm-up can be locked when a
rename lands; the request fails once with 500 and nothing retries it. The
P8b risk was kept rather than fixed. *Suggested fix:* one short retry (e.g.
2 × 150 ms) on `EBUSY`/`EPERM` in the poster-serving path, or surface a
friendly retry prompt instead of a bare 500.

**F20 — LOW: add-movie backup writes `catalog_backup_*` outside `BackupManager` (S3 row 37).**
`movie-creator.js:330` writes its own timestamped catalog backup with raw
`fs` logic, while orders/metadata/auth go through `BackupManager`
(`server.js:400–402`). Two backup code paths mean rotation/retention can be
fixed in one and miss the other. *Suggested fix:* route the creator's backup
through `BackupManager` so retention is uniform.

**F21 — LOW: `LIBRARY_POLL_SEC` env knob is untested (S3 row 38).**
The poll-interval override (`watcher.js:69`, used at `:75`) changes
reconcile cadence but no test exercises it, so a regression in the fallback
poll path wouldn't be caught by the suite. *Suggested fix:* one unit test
that sets `LIBRARY_POLL_SEC` and asserts the poll fires at the configured
interval.

**F22 — LOW: `_lastInvalid` is only refreshed on a full scan (S3 row 41).**
`indexer.js:221,257` — the "last invalid filenames" snapshot is recomputed
during a full scan only; incremental adds/edits don't refresh it, so the
admin can be shown a stale invalid-file list between rescans. *Suggested
fix:* merge newly-invalid paths on incremental updates, or mark the panel
"as of last full scan".

**F23 — TRIVIAL: title sort uses `localeCompare(…, 'fa')` directly (S3 row 44).**
`store.js:210` sorts with a locale collation whose output can vary by
ICU/Node build, so Persian ordering may differ across machines. *Suggested
fix:* normalise (strip ZWNJ/diacritics, map digits) before comparing, or pin
an explicit sort key so order is deterministic.

**F24 — LOW: AGENTS.md §3 repo map is stale (S3 row 48).**
`AGENTS.md:35` still lists only `services/movie-creator.js` under backend
services; `game-creator.js` and `game-editor.js` are missing, so the
onboarding map under-describes the games pipeline. *Suggested fix:* add the
two game service files to the §3 tree.

**F25 — TRIVIAL: ui-stub test harness has no `/api/game-poster` route (S3 row 49).**
`test/helpers/ui-stub.js` stubs the movie-poster route but not the
game-poster one, so any future UI test that exercises a game card's poster
would fall through to the stub 404 and can't run against the harness.
*Suggested fix:* add the matching `/api/game-poster/:title` stub.

**F26 — TRIVIAL: game-key normaliser duplicated (S3 row 51).**
The same title→game-key normalisation lives in `game-editor.js:55` and
`movie-trash.js:392`; two copies can drift. *Suggested fix:* export one
`normalizeGameKey()` (e.g. from `backend/parser.js` or a small util) and
import it in both.

**F27 — TRIVIAL: ui-stub hard-codes `protocol: 3` literal (S3 row 52).**
`test/helpers/ui-stub.js:476` writes the WS protocol version as a literal
instead of importing the shared constant, so a protocol bump would leave the
stub silently stale. *Suggested fix:* import `PROTOCOL_VERSION` from the
shared source of truth.

---

## CHECK LIMITS (what could NOT be verified on this machine)

1. **No git remote / no CI** (`git remote -v` = empty; the repo was never pushed) — the CI matrix points at GitHub Actions and has never run; no platform/runner Linux/macOS/Node-18/20/22 cross-check is possible here (P7c risk remains unproven).
2. **npm registry reachability — resolved this round.** The earlier "registry
   did not answer" caveat is superseded: `npm ping` returned `PONG 2003ms`
   against `https://registry.npmjs.org/`, and `npm audit --omit=dev --json`
   returned `auditReportVersion: 2` with **0 vulnerabilities** across
   info/low/moderate/high/critical (70 prod deps, 92 dev, 193 total;
   exit 0). Raw JSON kept at
   `%TEMP%\opencode\p9a-audit-logs\npm-audit-live.json`. The vulnerability
   feed is live and clean on this machine; nothing further to triage.
3. **Playwright UI suite hit Windows flake** (`P4-C5` firstPaintFullMs 343 in one clean-room run); the suite is green on the committed budget assertion `loadCatalogToPaintMs` (127) — budget is machine-load sensitive per P6a; noted, not a finding.
4. **20k bench workloads** (`scripts/bench.js`), `sharp` path on Linux, and real `Library/`-size effects were NOT re-executed in the audit (the P8c addendum covers the 20k bench results; regenerating a 20k fixture here risks behavior divergence not auditable within one session — left out of scope deliberately).
5. **Real `Library/` scanning** was never touched (audit step policy); diagnostic effects at scale rely on the phase reports (P3e / P8c bench).

---

## Appendix — raw command outputs (clean clone, `audit/p9a`)

Every console line was captured verbatim to
`%TEMP%\opencode\p9a-audit-logs\*.txt` and is reproduced below.

### A.1 `npm ci`

```
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 166 packages in 3s

```

### A.2 `npm run lint`

```

> movie-catalog@5.4.0 lint
> eslint .


```

### A.3 `npm test`

```

> movie-catalog@5.4.0 test
> node scripts/run-tests.js unit

Running 40 test file(s) from test/unit:

  test\unit\auth.test.js
  test\unit\bench-smoke.test.js
  test\unit\config.test.js
  test\unit\constants.test.js
  test\unit\css-a11y.test.js
  test\unit\defects.test.js
  test\unit\diagnostics.test.js
  test\unit\esm-package.test.js
  test\unit\etag-coverage.test.js
  test\unit\fatal-handlers.test.js
  test\unit\filename.test.js
  test\unit\game-services.test.js
  test\unit\helpers.test.js
  test\unit\http.test.js
  test\unit\indexer.test.js
  test\unit\logger.test.js
  test\unit\metadata-store.test.js
  test\unit\movie-creator.test.js
  test\unit\movie-editor.test.js
  test\unit\movie-trash.test.js
  test\unit\order-manager.test.js
  test\unit\parser.test.js
  test\unit\payload-cache.test.js
  test\unit\persist-compare.test.js
  test\unit\poster-refresh.test.js
  test\unit\print-urls.test.js
  test\unit\reconcile-failure.test.js
  test\unit\role-provider.test.js
  test\unit\scanner.test.js
  test\unit\search.test.js
  test\unit\sort.test.js
  test\unit\startup-probe.test.js
  test\unit\startup-reconcile.test.js
  test\unit\stop-file.test.js
  test\unit\storage-atomic.test.js
  test\unit\supervisor.test.js
  test\unit\text.test.js
  test\unit\thumbs.test.js
  test\unit\watcher.test.js
  test\unit\ws.test.js

▶ Auth (characterization)
  ▶ validateCredentials
    ✔ returns true for valid admin credentials (56.8906ms)
    ✔ returns false for wrong password (59.593ms)
    ✔ returns false for wrong username (0.3672ms)
    ✔ returns false for empty credentials (0.2725ms)
  ✔ validateCredentials (179.999ms)
  ▶ rate limiting
    ✔ 6th wrong attempt within 5 minutes returns rate-limited (246.5457ms)
  ✔ rate limiting (301.3854ms)
  ▶ createSession
    ✔ returns a token string (0.4731ms)
    ✔ returns unique tokens for different calls (0.3561ms)
  ✔ createSession (1.1181ms)
  ▶ validateSession
    ✔ returns session data for valid token (0.3464ms)
    ✔ returns null for invalid token (0.1411ms)
    ✔ returns null for null/undefined token (0.1736ms)
  ✔ validateSession (0.8928ms)
  ▶ invalidateSession
    ✔ invalidates a valid session (0.2746ms)
  ✔ invalidateSession (0.3639ms)
  ▶ getSessionRole
    ✔ returns admin for valid admin session (0.2923ms)
    ✔ returns customer for invalid token (0.1391ms)
  ✔ getSessionRole (0.557ms)
  ▶ isLoopback
    ✔ accepts 127.0.0.1 (0.1963ms)
    ✔ accepts ::1 (0.1715ms)
    ✔ accepts ::ffff:127.0.0.1 (0.1055ms)
    ✔ rejects LAN address 192.168.1.10 (0.0971ms)
    ✔ rejects 10.0.0.1 (0.1627ms)
    ✔ rejects null/undefined (0.2029ms)
  ✔ isLoopback (1.2205ms)
  ▶ setupAdmin
    ✔ rejects when not from loopback (1.5358ms)
    ✔ rejects short password (0.1712ms)
  ✔ setupAdmin (1.883ms)
  ▶ changePassword
    ✔ rejects wrong current password (42.3185ms)
    ✔ accepts correct password change (165.0748ms)
  ✔ changePassword (255.0315ms)
✔ Auth (characterization) (743.6905ms)
▶ scripts/bench.js smoke (P8c G6)
  ✔ exits 0 and prints one BENCH_RESULT line (1.2028ms)
  ✔ BENCH_RESULT carries the expected keys and shapes (0.6693ms)
✔ scripts/bench.js smoke (P8c G6) (2911.4021ms)
▶ P8a G2 - resolveConfig precedence
  ✔ uses defaults when nothing is set (4.5437ms)
  ✔ config.json overrides defaults (3.6478ms)
  ✔ environment variables override config.json (5.6709ms)
  ✔ relative config.json paths resolve against the app root (3.0271ms)
  ✔ absolute config.json paths are kept (2.6594ms)
  ✔ legacy env quirks kept: PORT=0 falls back to 3000, empty string ignored (1.1834ms)
✔ P8a G2 - resolveConfig precedence (22.4948ms)
▶ P8a follow-up - resolveConfig validation (fatal vs warn)
  ✔ unusable config.json exit code is the dedicated 2 (0.4819ms)
  ✔ malformed JSON: FATAL message + hasFatal, resolution shape still returned (7.268ms)
  ✔ unreadable config.json (read throws): FATAL (2.1317ms)
  ✔ UTF-8 BOM is stripped: a valid BOM file is accepted, not refused (3.447ms)
  ✔ non-object config.json (valid JSON, wrong shape): FATAL (3.579ms)
  ✔ libraryPath present but not a usable string: FATAL (number/empty/blank/null/object/bool) (19.3673ms)
  ✔ dataDir present but not a usable string: FATAL (11.7335ms)
  ✔ bad libraryPath + env override: the bad value would be used... env wins, no fatal (3.4016ms)
  ✔ malformed JSON + full env override: still FATAL (whole file is broken) (4.2711ms)
  ✔ unknown keys: warn only — hasFatal stays false (2.4757ms)
  ✔ invalid port values: WARN + default 3000 (never fatal) (26.0225ms)
  ✔ invalid env PORT: message + default (legacy lenient, never fatal) (1.1787ms)
  ✔ missing library folder: bilingual actionable message, WARN only, keeps resolving (0.9327ms)
  ✔ existing library folder: no LIBRARY_MISSING message (1.2915ms)
  ✔ formatConfigMessages produces level-tagged console lines (ERROR for fatal) (2.3256ms)
✔ P8a follow-up - resolveConfig validation (fatal vs warn) (91.103ms)
▶ backend/constants.js
  ✔ IMAGE_EXTENSIONS matches the parser-enforced Set (one list) (2.0367ms)
  ✔ WS_ROLES matches exactly what role-provider accepts (0.3497ms)
  ✔ MOVIE_TYPES is MEDIA_TYPES without Game (0.2358ms)
  ✔ PROTOCOL_VERSION stays 3 until a message-shape change bumps it (0.1573ms)
  ✔ Persian type labels are the wording the UI relies on (0.2305ms)
  ✔ Persian badge labels are the I12 wording (0.1829ms)
  ✔ pinned genres are the I11 order (0.1802ms)
✔ backend/constants.js (5.1039ms)
▶ backend/utils/series-key.js
  ✔ trims, collapses whitespace runs and lower-cases (I5) (0.4038ms)
  ✔ indexer re-exports the SAME function — no second copy (0.2395ms)
✔ backend/utils/series-key.js (0.9615ms)
✔ D6/FE-10: css/ has no hard-coded z-index values (var(--z-*) only) (12.9266ms)
✔ D6/FE-10: js/ sets no numeric z-index (styles moved to css tokens) (7.5306ms)
✔ D6: z-index scale is complete and ordered (2.0378ms)
✔ D7/FE-14: prefers-reduced-motion freezes motion but keeps the loader spinner (3.2336ms)
✔ D6: every custom property used in css/ is defined somewhere in css/ (15.9038ms)
✔ D7/FE-14: WCAG AA contrast — dark theme pairs (8.9163ms)
✔ D7/FE-14: WCAG AA contrast — light theme pairs (2.168ms)
✔ D7/FE-14: WCAG AA contrast — gaming theme pairs (1.7344ms)
✔ D7/FE-14: WCAG AA contrast — gamingLight theme pairs (1.8394ms)
✔ P5c: gaming dark gradient button labels ≥ 4.5 (1.6389ms)
✔ P5c: gaming light gradient button labels ≥ 4.5 (1.4533ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ SEC-01 — static serves project root
  ✔ SEC-01: server/auth/auth.js must not be publicly accessible (49.0909ms)
  ✔ SEC-01: /backend/indexer.js must not be publicly accessible (2.7899ms)
  ✔ SEC-01: /data/catalog.json must not be publicly accessible (2.3074ms)
  ✔ SEC-01: /package.json must not be publicly accessible (2.4263ms)
  ✔ SEC-01: / must serve index.html (7.1231ms)
  ✔ SEC-01: /css/ must be accessible (4.1424ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-01: /js/ must be accessible (3.1733ms)
✔ SEC-01 — static serves project root (134.0382ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ SEC-02 — no auth on admin REST endpoints
  ✔ SEC-02: POST /api/movies must require auth (401 without token) (69.2818ms)
  ✔ SEC-02: POST /api/movies must work with valid token (58.037ms)
  ✔ SEC-02: PUT /api/movies/:id must require auth (2.6146ms)
  ✔ SEC-02: GET /api/movies/next-id must require auth (1.5877ms)
  ✔ SEC-02: POST /api/rescan must require auth (2.5175ms)
  ✔ SEC-02: POST /api/games/rescan must require auth (2.1406ms)
  ✔ SEC-02: GET /api/diagnostics must require auth (1.5697ms)
  ✔ SEC-02: GET /api/orders must require auth (1.5601ms)
  ✔ SEC-02: GET /api/orders/:id must require auth (1.6644ms)
  ✔ SEC-02: POST /api/auth/logout must require auth (2.005ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ SEC-02: public endpoints remain public (4.6632ms)
✔ SEC-02 — no auth on admin REST endpoints (244.5444ms)
▶ SEC-05 — credentials / auth
  ▶ no hard-coded password
    ✔ SEC-05: auth source must not contain plain text password (0.4813ms)
  ✔ no hard-coded password (0.5833ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  ▶ first-run setup
    ✔ SEC-05: GET /api/auth/status returns setupRequired:true when no auth.json (4.0632ms)
    ✔ SEC-05: POST /api/auth/login rejects when setup not complete (2.6836ms)
    ✔ SEC-05: first-run setup accepted only from loopback (59.6642ms)
    ✔ SEC-05: after setup, GET /api/auth/status returns setupRequired:false (1.2986ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
    ✔ SEC-05: login works after setup (64.8711ms)
  ✔ first-run setup (165.1483ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ▶ env override
    ✔ SEC-05: ADMIN_USERNAME/ADMIN_PASSWORD env vars override auth.json (146.442ms)
  ✔ env override (147.1055ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ▶ rate limiting
    ✔ SEC-05: 6th wrong attempt within 5 min returns 429 (257.2157ms)
  ✔ rate limiting (340.9777ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  ▶ change password
    ✔ SEC-05: change-password works with correct current password (161.6242ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
    ✔ SEC-05: change-password rejects wrong current password (124.2633ms)
  ✔ change password (433.1936ms)
✔ SEC-05 — credentials / auth (1087.518ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ SEC-07 — CORS & security headers
  ✔ SEC-07: no Access-Control-Allow-Origin header by default (no wildcard) (3.3599ms)
  ✔ SEC-07: X-Content-Type-Options nosniff present (4.5504ms)
  ✔ SEC-07: Referrer-Policy no-referrer present (1.4767ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه فیلم نامعتبر است: ../../../evil
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه فیلم نامعتبر است: 1\2
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر یک نام رزرو شده ویندوز است
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-07: X-Frame-Options DENY present (1.8082ms)
✔ SEC-07 — CORS & security headers (33.3219ms)
▶ SEC-03 — path traversal in createMovie
  ✔ SEC-03: must reject id with path traversal (10.4015ms)
  ✔ SEC-03: must reject id with backslash (9.368ms)
  ✔ SEC-03: must reject genre with path traversal (10.2673ms)
  ✔ SEC-03: must reject Windows reserved name CON as genre (9.2089ms)
✔ SEC-03 — path traversal in createMovie (39.5967ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Socket error from ::1: Max payload size exceeded
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ SEC-06 — oversized/invalid selection via WS
  ✔ SEC-06: server must reject oversized WS payloads (162.55ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Invalid selection:update payload
  [WS] Invalid selection:update payload
  [WS] Selection updated: 0 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  ✔ SEC-06: server must validate and sanitize selection:update movie objects (452.3019ms)
✔ SEC-06 — oversized/invalid selection via WS (615.1648ms)
▶ SEC-08 — API leaks absolutePosterPath
  ✔ SEC-08: GET /api/movies must not expose absolutePosterPath (5.2976ms)
  ✔ SEC-08: toPublicMovie strips internal fields (0.3497ms)
  ✔ SEC-08: toPublicGame strips internal fields (0.2248ms)
✔ SEC-08 — API leaks absolutePosterPath (6.0782ms)
  [WS] WebSocket server closed
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
▶ DATA-01 — editing title loses data
  ✔ DATA-01: PUT must preserve imdbRating/plotSummary/year after watcher settles (1617.7337ms)
✔ DATA-01 — editing title loses data (1617.9809ms)
  [WATCHER] Added: 0005- Fresh 2021.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Added: Breaking Bad.jpg
  [WATCHER] Reconcile Series: +1 ~0 -0
  [WATCHER] Stopped
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0002 (had 1 movies)
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0003 with 1 movies
  [ORDERS] orders.json was corrupt — starting empty (quarantined)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [METADATA] Migrated 2 items from catalog.json
  [INDEXER] Saved catalog to disk: 3 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-803Z.json
  [MOVIE-CREATOR] Creation failed, rolling back: simulated disk failure
  [MOVIE-CREATOR] Rolled back: removed backup catalog_backup_2026-10-18T21-29-48-803Z.json
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-816Z.json
  [MOVIE-CREATOR] Creation failed, rolling back: simulated disk failure on 2nd copy
  [MOVIE-CREATOR] Rolled back: removed file 0001- Rollback Test 2020.jpg
  [MOVIE-CREATOR] Rolled back: removed backup catalog_backup_2026-10-18T21-29-48-816Z.json
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ DATA-02 — watcher parses without type
  ✔ DATA-02: hot-added Movie must keep its year (1614.0707ms)
✔ DATA-02 — watcher parses without type (1614.3371ms)
▶ DATA-03 — multi-genre edit leaves ghost copy
  ✔ DATA-03: editing a multi-genre movie must rename all copies and not leave ghosts (9.7317ms)
✔ DATA-03 — multi-genre edit leaves ghost copy (9.8123ms)
▶ DATA-04 — Games leak into movie index
  ✔ DATA-04: Library/Games images must never become movie entries (3.7078ms)
✔ DATA-04 — Games leak into movie index (3.7947ms)
▶ DATA-05 — ID namespace collision
  ✔ DATA-05: Movie 0001 and Iranian 0001 must both be indexed (4.832ms)
✔ DATA-05 — ID namespace collision (4.9043ms)
▶ DATA-06 — double decodeURIComponent throws for % in title
  ✔ DATA-06: poster lookup must survive titles containing % (3.2883ms)
✔ DATA-06 — double decodeURIComponent throws for % in title (3.3744ms)
▶ DATA-07 — deleted order numbers reused
  ✔ DATA-07: order numbers must never be reused (23.1558ms)
✔ DATA-07 — deleted order numbers reused (23.257ms)
▶ DATA-08 — corrupted orders.json silently overwritten
  ✔ DATA-08: corrupted orders.json must not overwrite history silently (10.6624ms)
✔ DATA-08 — corrupted orders.json silently overwritten (10.7566ms)
▶ DATA-10 — manager metadata in rebuildable cache only
  ✔ DATA-10: set rating/plot, delete catalog.json, restart → values intact (14.7802ms)
✔ DATA-10 — manager metadata in rebuildable cache only (14.8908ms)
▶ DATA-14 — saveToDisk sort comparator inconsistent when ids are null
  ✔ DATA-14: catalog sort is a total order (type priority then key) (1.7691ms)
  ✔ DATA-14: saveToDisk writes movies in compareForPersist order (4.9783ms)
✔ DATA-14 — saveToDisk sort comparator inconsistent when ids are null (6.9359ms)
▶ DATA-09 — Series rollback removes all series
  ✔ DATA-09: failed Series creation must not wipe existing Series (rollback by key) (14.5282ms)
  ✔ DATA-09: multi-genre partial write failure rolls back copies and leaves index untouched (14.0573ms)
✔ DATA-09 — Series rollback removes all series (28.74ms)
▶ DATA-11 — Animation/Iranian discard year
  ✔ DATA-11: Animation filename with year must preserve year (0.4282ms)
✔ DATA-11 — Animation/Iranian discard year (0.5414ms)
▶ DATA-12 — cleanTitle strips real words
  ✔ DATA-12: cleanTitle must not strip "Web" from "Charlotte's Web" (0.2999ms)
  ✔ DATA-12: cleanTitle must not strip "Amazon" from "The Amazon" (0.2043ms)
  ✔ DATA-12: "0001- Apple 2020.jpg" must not be dropped entirely (0.2147ms)
✔ DATA-12 — cleanTitle strips real words (0.8601ms)
▶ DATA-17 — year regex picks resolution tag
  ✔ DATA-17: "5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" must parse year=2008 (0.3577ms)
✔ DATA-17 — year regex picks resolution tag (0.4313ms)
▶ DATA-18 — 7+ digit ID split
  ✔ DATA-18: "1234567- Inception 2010.jpg" must be rejected or parsed whole (0.1239ms)
✔ DATA-18 — 7+ digit ID split (0.1882ms)
▶ SEC-03 — safe-path helpers
  ▶ validateId
    ✔ accepts valid 1–6 digit ids (0.2241ms)
    ✔ rejects non-numeric ids (0.2541ms)
    ✔ rejects traversal ids (0.1369ms)
    ✔ rejects ids longer than 6 digits (0.1382ms)
    ✔ rejects empty string (0.4403ms)
    ✔ rejects non-string (0.2214ms)
  ✔ validateId (1.87ms)
  ▶ safeSegment
    ✔ accepts valid segments (0.4275ms)
    ✔ NFC-normalises (0.2101ms)
    ✔ rejects segments with slashes (0.3554ms)
    ✔ rejects .. (0.2256ms)
    ✔ rejects Windows reserved names (0.3963ms)
    ✔ rejects trailing dot or space (0.1993ms)
    ✔ rejects names longer than 120 chars (0.1639ms)
    ✔ rejects empty string (0.131ms)
    ✔ rejects control characters (0.1757ms)
  ✔ safeSegment (2.7626ms)
  ▶ resolveInside
    ✔ resolves a path inside root (0.3841ms)
    ✔ rejects path traversal (0.2952ms)
    ✔ rejects absolute path outside root (0.2352ms)
    ✔ rejects when resolved path equals root (0.284ms)
  ✔ resolveInside (1.3946ms)
  ▶ validateId — additional edge cases
    ✔ accepts exactly 6 zeros (0.1444ms)
    ✔ accepts single digit (0.1669ms)
  ✔ validateId — additional edge cases (0.4821ms)
  ▶ safeSegment — additional edge cases
    ✔ rejects 300-char name (0.1744ms)
    ✔ rejects COM2 through COM9 (0.2498ms)
    ✔ rejects LPT2 through LPT9 (0.2742ms)
    ✔ accepts Persian genre name دوبله فارسی (0.1099ms)
    ✔ accepts title with ZWNJ (zero-width non-joiner) (0.085ms)
    ✔ accepts title with apostrophe (Ocean's Twelve) (0.0571ms)
    ✔ accepts title with ampersand (0.0712ms)
    ✔ accepts title with parentheses (0.1839ms)
    ✔ accepts title with square brackets (0.1121ms)
  ✔ safeSegment — additional edge cases (1.5553ms)
  ▶ resolveInside — edge cases
    ✔ rejects single dot segment (0.4315ms)
    ✔ rejects traversal escaping root (0.2388ms)
  ✔ resolveInside — edge cases (0.7481ms)
✔ SEC-03 — safe-path helpers (9.2343ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ SEC-03 — traversal via REST endpoints
  ✔ SEC-03: PUT /api/movies/:id rejects traversal in new id (113.8203ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ SEC-03: PUT /api/movies/:id rejects backslash in new id (90.301ms)
✔ SEC-03 — traversal via REST endpoints (204.34ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S6 — upload hardening
  ✔ S6: POST /api/movies rejects HTML magic bytes disguised as .jpg (109.9364ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies rejects PHP magic bytes disguised as .jpg (110.6169ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies rejects decoded payload > 8 MB (196.6919ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-596Z.json
  [MOVIE-CREATOR] Movie added: 9905 - Fat Poster
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ FE-13: POST /api/movies accepts a >100KB poster body (guard exemption) (161.0792ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-745Z.json
  [MOVIE-CREATOR] Movie added: 9904 - ExtTest
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies uses detected type for extension, not client MIME (146.5476ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-852Z.json
  [MOVIE-CREATOR] Movie added: 9905 - ValidJPEG
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid JPEG (104.6341ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-49-959Z.json
  [MOVIE-CREATOR] Movie added: 9906 - ValidPNG
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid PNG (110.1706ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-50-107Z.json
  [MOVIE-CREATOR] Movie added: 9907 - ValidWEBP
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid WEBP (141.2237ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-50-232Z.json
  [MOVIE-CREATOR] Movie added: 9908 - ValidAVIF
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ S6: POST /api/movies accepts valid AVIF (127.067ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S6: non-movie POST with >100KB body returns 413 (102.3413ms)
✔ S6 — upload hardening (1311.1812ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S7 — GET /api/games whitelist
  ✔ S7: GET /api/games must not expose absolutePosterPath (91.3056ms)
✔ S7 — GET /api/games whitelist (91.5063ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S7 — WS broadcast whitelist
  ✔ S7: selection:state broadcast must not contain absolutePosterPath (117.5296ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S7: movie:updated broadcast must not contain absolutePosterPath (633.8373ms)
  [WS] WebSocket server closed
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-51-317Z.json
  [MOVIE-CREATOR] Movie added: 0001 - New Movie
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ S7: movie:added broadcast must not contain absolutePosterPath (647.5822ms)
✔ S7 — WS broadcast whitelist (1399.3448ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S9 — WS hardening
  ✔ S9: hello:ack carries protocol:2 (76.435ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S9: old client hello without protocol still works (56.7454ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ S9: >500 items in selection is capped (103.9963ms)
✔ S9 — WS hardening (237.6061ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [WS] Order order-0001 created by admin
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ S9 — orders:save re-hydration
  ✔ S9: orders:save re-hydrates from uids — fake title is overwritten (1127.1482ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ S9: orders:save with unknown uid is dropped (1132.7042ms)
✔ S9 — orders:save re-hydration (2260.1491ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 2 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
▶ Games + orders re-hydration (real WS clients)
  ✔ customer selecting a movie AND a game reaches manager with canonical data (1130.6659ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 2 movies
  [WS] Order order-0001 created by admin
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-621Z.json
  [MOVIE-CREATOR] Movie added: 0001 - فیلم‌های آخر هفته
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-636Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Ocean's Twelve
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-56-648Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Tom & Jerry (2021)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ orders:save re-hydrates both movies and games (1142.7924ms)
✔ Games + orders re-hydration (real WS clients) (2273.7745ms)
▶ Persian and awkward name tests
  ✔ movie-creator creates movie in genre دوبله فارسی with Persian title (15.6088ms)
  ✔ movie-creator creates movie with apostrophe in title (12.9613ms)
  ✔ movie-creator creates movie with & and parentheses in title (11.3786ms)
✔ Persian and awkward name tests (40.1437ms)
▶ ARCH-01 — single version source
  ✔ ARCH-01: hardcoded version strings in source files must match package.json (9.0563ms)
  [WS] WebSocket server closed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ ARCH-01: /api/movies meta.version must match package.json version (19.6332ms)
✔ ARCH-01 — single version source (28.8867ms)
▶ SEC-04 guard — no unescaped template interpolation in innerHTML
  ✔ scans js/**/*.js for raw ${ inside innerHTML assignments (4.8859ms)
✔ SEC-04 guard — no unescaped template interpolation in innerHTML (4.9647ms)
▶ Diagnostics (characterization)
  ✔ runFullReport returns correct shape (19.6804ms)
  ✔ AC2/A7: storage warnings from a corrupt orders.json appear in diagnostics.storage.warnings (15.2067ms)
  ✔ counts type distribution correctly (9.6682ms)
  ✔ B9: invalidFilenames from last scan, orphanMetadata from metadata store, games in summary (12.531ms)
  ✔ B9: report is cached for 30s and invalidate() forces rebuild (5.5258ms)
  ✔ B9: missing posters come from file index membership (no disk stat required) (5.0824ms)
✔ Diagnostics (characterization) (69.8212ms)
▶ ARCH-01 — js/ is an ES module package
  ✔ declares type "module" so Node parses js/ files as ESM (0.965ms)
  ✔ stays public, minimal and dependency-free (0.2724ms)
✔ ARCH-01 — js/ is an ES module package (2.734ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-43-695Z.json
  [MOVIE-CREATOR] Movie added: 0003 - Third Movie
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: etag game
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: etag game 2
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Added: 0009- Watcher Movie 2009.jpg
  [WATCHER] Reconcile Movies: +1 ~0 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 4 movies
  [WS] WebSocket server closed
▶ P8c G6 — payload ETag coverage over the admin surface
  ✔ plain GETs keep the ETag; every catalog mutation and watcher event moves it (1018.3358ms)
✔ P8c G6 — payload ETag coverage over the admin surface (1019.7595ms)
▶ P8a follow-up - fatal handlers (real child processes)
  ✔ unhandledRejection: exit 1, FATAL logged, bilingual console line, no secret (95.521ms)
  ✔ uncaughtException: exit 1, FATAL logged, bilingual console line, no secret (95.8851ms)
  ✔ server.js auto-start installs exactly these handlers (source wiring) (0.906ms)
✔ P8a follow-up - fatal handlers (real child processes) (194.0385ms)
▶ P6c E2 shared filename builder (ARCH-03, I4)
  ✔ I4 conventions for every movie type (2.7977ms)
  ✔ Series ignores id and year entirely (I5: identity is the title) (0.2949ms)
  ✔ sanitizes forbidden filename characters (same rule as the old creator) (0.2887ms)
  ✔ rejects path-escaping titles through safeSegment (I10) (3.8957ms)
  ✔ buildGameFilename: title + extension only, no id or year (I4, I8) (0.3171ms)
✔ P6c E2 shared filename builder (ARCH-03, I4) (10.1631ms)
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: hades
  [INDEXER] Games: +1 new, ~1 updated, 2 total
▶ GameCreator (P6c E4)
  ✔ create: writes a copy per platform and indexes the game (AC4) (20.2587ms)
  ✔ validation: structured codes for title/platforms/poster/extension/traversal; statusOf → 400 (AC6) (9.6929ms)
  ✔ duplicate title → 409 GAME_EXISTS (10.4494ms)
  ✔ unindexed file already at a target → 409 FILE_EXISTS, nothing written, not indexed (10.4783ms)
  ✔ rollback: injected write failure on the 2nd platform removes the 1st; not indexed (10.2515ms)
  ✔ statusOf: unknown errors fall back to 500 (8.1403ms)
✔ GameCreator (P6c E4) (71.3016ms)
▶ GameEditor (P6c E4)
  ✔ rename moves every platform copy; uid follows the title (27.9907ms)
  ✔ rename onto an existing game → 409 GAME_EXISTS, nothing touched (8.7031ms)
  ✔ platform removal deletes the copy; re-adding copies it back; empty set → 400 (13.8066ms)
  ✔ poster replace rewrites every platform copy (11.4832ms)
  ✔ field validation: blank title → 400 TITLE_REQUIRED; traversal title → 400 TITLE_INVALID (7.9026ms)
  ✔ unknown game uid → 404 NOT_FOUND; statusOf maps it (7.7323ms)
  ✔ watcher.expect receives every old and new path on rename (11.1729ms)
✔ GameEditor (P6c E4) (89.4288ms)
▶ MovieEditor guard (P6c E4): game uids never reach the movie pipeline
  ✔ updateMovie(game:…) → 400 GAME_UNSUPPORTED before any file is touched (9.8513ms)
✔ MovieEditor guard (P6c E4): game uids never reach the movie pipeline (9.993ms)
▶ js/utils/helpers.js — idOrTitle / hasId (FE-06)
  ✔ loads ES module via dynamic import (4.5209ms)
  ✔ Movie / Animation / Iranian → id (0.3338ms)
  ✔ leading zeros are preserved verbatim (I2: id is a string) (0.3407ms)
  ✔ Series (id:null) → title (0.2229ms)
  ✔ Games (no id field at all) → title, never "undefined" (0.2044ms)
  ✔ empty-string id falls back to title (0.2046ms)
  ✔ null/undefined item → empty string, never throws (0.2264ms)
  ✔ hasId mirrors the same decision (1.1112ms)
✔ js/utils/helpers.js — idOrTitle / hasId (FE-06) (10.0036ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 6 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 4 movies, 4 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 6 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 4 movies
▶ HTTP API (characterization)
  ▶ GET /api/movies
    ✔ returns correct shape (42.9264ms)
    ✔ returns all indexed movies (3.4085ms)
  ✔ GET /api/movies (47.4675ms)
  ▶ GET /api/stats
    ✔ returns stats with genres, types, decades (6.4126ms)
  ✔ GET /api/stats (6.7759ms)
  ▶ GET /api/config
    ✔ serves the shared front-end config with version from package.json (4.5779ms)
  ✔ GET /api/config (4.9407ms)
  ▶ GET /api/poster/:id
    ✔ returns 200 for existing poster (10.9137ms)
    ✔ returns 404 for non-existing poster (3.2002ms)
  ✔ GET /api/poster/:id (14.671ms)
  ▶ POST /api/auth/login
    ✔ returns token for valid credentials (126.0746ms)
    ✔ returns 401 for invalid credentials (61.0065ms)
  ✔ POST /api/auth/login (187.7223ms)
  ▶ GET /api/movies/next-id
    ✔ returns next ID for Movie type (with token) (71.2386ms)
    ✔ returns 400 for invalid type (53.9261ms)
    ✔ returns null nextId for Series type (67.1225ms)
  ✔ GET /api/movies/next-id (192.8003ms)
  ▶ GET /api/games
    ✔ returns games array (2.0882ms)
  ✔ GET /api/games (2.3398ms)
  ▶ PUT /api/movies/by-uid/:uid (B7)
    ✔ requires admin auth (3.4694ms)
    ✔ updates a Movie by bare uid and renames the file (68.442ms)
    ✔ updates a Series by URL-encoded uid (74.6878ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 4 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
    ✔ legacy PUT /api/movies/:id still works as a delegating alias (59.2447ms)
  ✔ PUT /api/movies/by-uid/:uid (B7) (206.3239ms)
✔ HTTP API (characterization) (811.4422ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ A5 non-blocking catalog persistence
  ✔ PUT /api/movies/:id does not call saveToDisk synchronously (debounced via scheduleSave) (858.5353ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan does not call saveToDisk synchronously (824.6434ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ stop() flushes a pending scheduleSave before exit (A6) (126.9798ms)
✔ A5 non-blocking catalog persistence (1810.5899ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ B10 rescan
  ✔ POST /api/rescan rescans movies and games, returns counts + invalid (124.5783ms)
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [SCANNER] ⚠ 1 file(s) could not be indexed (set DEBUG_SCAN=1 for details)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan picks up an invalid filename into invalid count (124.3397ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ POST /api/rescan does not stall the event loop > 200ms per tick (AC8 lag probe) (231.3684ms)
✔ B10 rescan (480.6899ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ BUG-2 diagnostics freshness after edit
  ✔ GET /api/diagnostics immediately after title edit reflects post-edit state (no 30s TTL) (82.468ms)
✔ BUG-2 diagnostics freshness after edit (183.7668ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P6a E1 PUT by-uid poster + genres
  ✔ requires admin auth for poster PUT (401) (3.6962ms)
  ✔ rejects a disguised non-image poster with IMG_UNSUPPORTED; file untouched (48.9616ms)
  ✔ replaces poster bytes on disk for a valid payload (single PUT, Q1) (49.2027ms)
  ✔ allows a >100KB poster PUT body (guard exemption for by-uid) (52.1294ms)
  ✔ applies genres patch: adds folder copy, removes de-selected copy (76.3158ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 7 directories
  [WS] WebSocket server initialized
  ✔ rejects empty genres with 400 GENRE_REQUIRED (structured code in body) (64.5084ms)
✔ P6a E1 PUT by-uid poster + genres (406.2426ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 3 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [WATCHER] Releasing hold: 7 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
▶ P6b E3 delete + restore API
  ✔ all three endpoints require admin auth (401) (14.3226ms)
  ✔ DELETE: every copy moves into .trash/<id>/, manifest entry written, movie gone from catalog (87.2612ms)
  ✔ GET /api/trash: newest-first with the full entry shape (53.5991ms)
  ✔ restore: movie returns with imdbRating/plotSummary intact, files back, entry leaves the trash (acceptance 3) (58.0589ms)
  ✔ restore into an occupied destination → 409 RESTORE_CONFLICT, nothing moved, no partial restore (79.4552ms)
  [INDEXER] Removed game from index: fifa 24
  ✔ error codes: unknown uid 404, game uid deletes like a movie (E4), bad restore id 400, unknown restore 404 (73.7506ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ Series round-trip: delete by series uid then restore (68.7277ms)
✔ P6b E3 delete + restore API (558.7528ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
▶ P6b E3 trash list: newest-first, capped at 20, log permanent
  ✔ GET /api/trash returns the 20 newest entries newest-first; older log entries stay on disk (52.2473ms)
✔ P6b E3 trash list: newest-first, capped at 20, log permanent (115.0892ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 3 movies, 3 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 5 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 3 movies
▶ P6c E2 add flow API
  ✔ POST /api/movies/preview requires admin (401 without token) (4.7076ms)
  ✔ POST /api/movies requires admin (401 without token) (2.1799ms)
  ✔ preview returns the exact I4 filename for every type (shared builder, ARCH-03) (48.0843ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-47-859Z.json
  [MOVIE-CREATOR] Movie added: 0077 - Preview Parity
  ✔ preview filename === server-written filename for the same inputs (no third copy) (44.9023ms)
  ✔ preview rejects an unsafe title with 400 TITLE_INVALID (traversal, I10) (39.0187ms)
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  ✔ create: missing title → 400 TITLE_REQUIRED with a Persian message (50.9791ms)
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0001 قبلاً استفاده شده است
  ✔ create: taken id → 409 ID_TAKEN (conflict must NOT surface as a generic 400) (35.5044ms)
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  ✔ create: unsafe genre → 400 GENRE_INVALID, nothing written outside its folder (37.4681ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-48-069Z.json
  [MOVIE-CREATOR] Movie added: 0091 - Genre Probe
  ✔ create: a new genre name becomes a real folder and the movie lands in it (50.6378ms)
  ✔ create: decoded poster beyond 8 MB → 413 IMG_TOO_LARGE (119.6278ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 5 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  ✔ create: JSON body beyond the express limit → 413 JSON IMG_TOO_LARGE (not an HTML error page) (95.6091ms)
✔ P6c E2 add flow API (609.934ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 4 held dir(s) → 2 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P6c E4 games management
  ✔ POST /api/games requires admin (401, AC6) (4.1476ms)
  ✔ validation: title/platforms/poster and traversal produce structured 400s (AC6) (61.5474ms)
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ create: writes Games/PS4 and Games/PS5 copies and merges into the catalog (AC4) (44.5609ms)
  ✔ create: duplicate title → 409 GAME_EXISTS (36.7126ms)
  [INDEXER] Removed game from index: new game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: rename moves both platform copies; uid follows the title (49.4142ms)
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: platform removal deletes the copy, adding re-creates it, empty set → 400 (44.415ms)
  [INDEXER] Removed game from index: renamed game x
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  ✔ PUT by-uid: poster replace rewrites every platform copy (55.0756ms)
  ✔ PUT by-uid unknown game → 404 NOT_FOUND (41.184ms)
  [INDEXER] Removed game from index: renamed game x
  ✔ DELETE game: both copies to trash, entry type Game, catalog drops it (AC4) (48.9398ms)
  [INDEXER] Games: +1 new, ~1 updated, 2 total
  [INDEXER] Removed game from index: renamed game x
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  ✔ restore game: files back and the game re-enters the catalog; occupied destination → 409 (76.92ms)
✔ P6c E4 games management (537.1121ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 0 movies, 0 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 0 movies
▶ P8b static assets — font serving, CSP font-src
  ✔ GET /assets/fonts/Vazirmatn-Variable.woff2 → 200 font/woff2 (8.1505ms)
  ✔ GET /assets/fonts/OFL.txt → 200 (SIL licence shipped with the font) (3.5649ms)
  ✔ GET /assets/… traversal and unknown assets → 404 (2.7078ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 0 movies
  [WS] WebSocket server closed
  ✔ CSP includes font-src 'self' (G5) (2.5819ms)
✔ P8b static assets — font serving, CSP font-src (33.8224ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 2 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Loaded 1 movies from cache
▶ CatalogIndexer
  ✔ indexes a single movie (9.2697ms)
  ✔ merges genres across copies of the same movie in different folders (9.0236ms)
  ✔ keys Series by normalised title (trimmed, collapsed, lowercased) (4.9317ms)
  ✔ preserves custom fields (imdbRating, plotSummary) across replaceFromScan (5.5034ms)
  ✔ adds a movie via addFile and retrieves it (1.6706ms)
  ✔ removes a movie via removeFile (1.4648ms)
  ✔ returns null for getMovieById with unknown id (1.1197ms)
  ✔ get count returns 0 for empty index (1.0813ms)
  ✔ saves and loads from disk (9.16ms)
✔ CatalogIndexer (44.9195ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ P8a G3 - log rotation (injected clock)
  ✔ keeps exactly 7 files across 10 days, newest retained (15.9461ms)
  ✔ init prunes stale files down to 7 immediately (10.0525ms)
  ✔ disabled logger writes nothing (0.8955ms)
✔ P8a G3 - log rotation (injected clock) (28.9602ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
▶ P8a G3 - secrets never reach the log (full login flow)
  ✔ full flow leaves no password, token or Authorization material in any log file (339.977ms)
✔ P8a G3 - secrets never reach the log (full login flow) (462.0704ms)
  [METADATA] Migrated 2 items from catalog.json
  [METADATA] Migrated 1 items from catalog.json
▶ MetadataStore
  ✔ starts empty when no file and no catalog exist (2.9892ms)
  ✔ set/get/remove round-trip and persists to disk (15.2677ms)
  ✔ rename moves metadata to the new key (1.3852ms)
  ✔ set patches only provided fields and refreshes updatedAt (1.1028ms)
  ✔ migrates imdbRating/plotSummary from an old catalog.json on first start (DATA-10) (8.4391ms)
  ✔ deleting catalog.json loses nothing once metadata is migrated (DATA-10) (8.8881ms)
  ✔ does not migrate when metadata.json already exists (4.6331ms)
  ✔ orphans lists keys not in the existing key set (2.3995ms)
  ✔ attach merges metadata onto a movie object (1.3739ms)
  ✔ flush() writes pending changes synchronously (5.9856ms)
✔ MetadataStore (54.3277ms)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-725Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Test Movie
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: حداقل یک ژانر برای فیلم الزامی است
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-758Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Backup Test
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-772Z.json
  [MOVIE-CREATOR] Movie added: 00001 - Finding Nemo
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-786Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Gav
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-802Z.json
  [MOVIE-CREATOR] Movie added: null - Breaking Bad
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-818Z.json
  [MOVIE-CREATOR] Movie added: 0001 - First
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0001 قبلاً استفاده شده است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: فایل 0001- Dup 2020.jpg قبلاً در C:\Users\Ali\AppData\Local\Temp\mc-rollback-1792358982838\Library\Movies\Action وجود دارد
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-859Z.json
  [MOVIE-CREATOR] Movie added: 0001 - First
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-863Z.json
  [MOVIE-CREATOR] Movie added: 0002 - Second
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-940Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Tmp Check
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-42-953Z.json
  [MOVIE-CREATOR] Movie added: 0001 - Async Save
▶ MovieCreator (characterization)
  ✔ creates a movie with 2 genres: files, index, catalog.json (26.6547ms)
  ✔ validates required fields (9.2748ms)
  ✔ creates backup before modifying catalog (13.5577ms)
  ✔ creates an Animation movie in Animation/ folder (12.8703ms)
  ✔ creates an Iranian movie in Iranian/ folder (14.8275ms)
  ✔ creates a Series in Serries/ folder (no id) (16.1122ms)
  ✔ rejects duplicate ID (17.7434ms)
  ✔ rejects invalid year for Movie type (10.3693ms)
  ✔ cleans up temp files on failure (rollback) (14.9438ms)
  ✔ generates unique IDs for consecutive movies (16.3292ms)
  ✔ DATA-13: temp upload never lands inside Library/ (77.0884ms)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 2 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [MOVIE-CREATOR] Creation failed, rolling back: عنوان فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: سال انتشار برای فیلم الزامی است (1900-2099)
  [MOVIE-CREATOR] Creation failed, rolling back: حداقل یک ژانر برای فیلم الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: ژانر نمی‌تواند شامل / یا \ باشد
  [MOVIE-CREATOR] Creation failed, rolling back: نوع فیلم نامعتبر است
  [MOVIE-CREATOR] Creation failed, rolling back: تصویر پوستر الزامی است
  [MOVIE-CREATOR] Creation failed, rolling back: فرمت تصویر نامعتبر است (jpg, jpeg, png, webp, avif)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-29-43-682Z.json
  [MOVIE-CREATOR] Movie added: 0042 - First
  [MOVIE-CREATOR] Creation failed, rolling back: شناسه 0042 قبلاً استفاده شده است
  [MOVIE-CREATOR] Creation failed, rolling back: فایل 0042- Dup 2002.jpg قبلاً در C:\Users\Ali\AppData\Local\Temp\mc-p6c-1792358983689-3\Library\Movies\Action وجود دارد
  ✔ A5: createMovie does not call saveToDisk synchronously (debounced via scheduleSave) (715.8245ms)
✔ MovieCreator (characterization) (947.72ms)
▶ P6c E2 structured create errors (FE-13)
  ✔ validation failures carry structured codes; statusOf maps them to 400 (12.0129ms)
  ✔ conflicts carry ID_TAKEN; statusOf maps it to 409 (14.4903ms)
  ✔ a colliding target file carries FILE_EXISTS; statusOf maps it to 409 (16.8766ms)
  ✔ statusOf: unknown errors fall back to 500 (0.2673ms)
✔ P6c E2 structured create errors (FE-13) (44.0042ms)
▶ MovieEditor
  ✔ renames every genre copy (all _fileIndex entries for the key) (16.0814ms)
  ✔ metadata-only patch touches no files (7.3817ms)
  ✔ cross-type id conflict → 409 before any file is touched (9.6783ms)
  ✔ target filename collision → 409 before any file is touched (8.9106ms)
  ✔ rollback: failure partway through multi-file rename restores files; index untouched (9.45ms)
  ✔ Series: update by uid renames title-only filename and re-keys (12.9504ms)
  ✔ id change re-keys map key type:id and file index (9.8859ms)
  ✔ watcher.expect is called with old and new paths when renaming (12.3544ms)
  ✔ empty title → 400 validation (8.0595ms)
  ✔ E1 genre add: copies poster into the new genre folder; disk and index updated (15.7066ms)
  ✔ E1 genre remove: deletes only the de-selected copy; rest kept on disk and in index (9.466ms)
  ✔ E1 genre remove: absolutePosterPath repointed when its own folder is de-selected (7.1437ms)
  ✔ E1 genre edit: combined add + remove in one patch touches both folders (9.039ms)
  ✔ E1 genre rollback: failure partway through move+copy restores folders; index untouched (65.1041ms)
  ✔ E1 genre add: pre-existing unindexed file at target → 409 FILE_EXISTS, nothing touched (6.3951ms)
  ✔ E1: genres patch on a Series → 400 NON_MOVIE_GENRE_EDIT (8.26ms)
  ✔ E1: empty genres on a Movie → 400 GENRE_REQUIRED (6.2062ms)
  ✔ E1: non-array genres → 400 GENRE_INVALID (6.2055ms)
  ✔ E1: unsafe genre name (traversal) → 400 GENRE_INVALID; nothing touched (8.3527ms)
  ✔ E1 codes (Q6): TITLE_REQUIRED / ID_REQUIRED / YEAR_INVALID on field validation (5.2444ms)
  ✔ E1 poster replace: extension change — every copy becomes .png, no .jpg orphan, bytes match (8.8346ms)
  ✔ E1 poster replace: same-extension overwrite — bytes replaced in place, file count unchanged (9.4261ms)
  ✔ E1 poster replace: unsupported extension → 400 IMG_UNSUPPORTED, disk untouched (7.9805ms)
  ✔ E1 poster replace rollback: THROWN failure during write-new (ext change) — old files untouched, no new-ext file remains (10.1392ms)
  ✔ E1 poster replace rollback: same-extension write-new failure — original bytes restored everywhere (9.7784ms)
  ✔ E1 poster replace: watcher.expect receives every old and new path (9.1571ms)
  ✔ E1 combined patch: rename + genre change + poster replace in one updateMovie call (11.2254ms)
✔ MovieEditor (311.3038ms)
  [INDEXER] Removed game from index: fifa 24
  [INDEXER] Removed game from index: fifa 24
  [INDEXER] Games: +1 new, ~0 updated, 1 total
▶ MovieTrash (P6b E3 — soft delete / restore, D6)
  ✔ delete: single-genre file moves to .trash/<id>/ with relative path preserved; manifest entry written; movie gone from index (26.3247ms)
  ✔ delete: multi-genre movie — every copy moves, all originalPaths recorded, movie dropped (21.3129ms)
  ✔ delete: watcher.expect receives every source and target path (18.7643ms)
  ✔ delete rollback: injected failure on the 2nd move restores the 1st; index and manifest untouched (15.2656ms)
  ✔ delete: game uid soft-deletes every platform copy into .trash (P6c E4) (17.7275ms)
  ✔ restore: game entry moves the files back and re-enters the games index (P6c E4) (23.6586ms)
  ✔ delete: unknown uid and empty uid → 404 NOT_FOUND (8.8339ms)
  ✔ delete: corrupt manifest → 500 TRASH_MANIFEST_ERROR, nothing moved (15.5321ms)
  ✔ delete broadcasts catalog:changed {removed} and invalidates diagnostics (30.4998ms)
  ✔ restore: files return to original paths; movie reappears with rating/plot intact; entry removed; trash folder cleaned (35.6775ms)
  ✔ restore: multi-genre movie — every copy returns; genres unioned (34.1905ms)
  ✔ restore: occupied destination → 409 RESTORE_CONFLICT; nothing moved; entry intact (29.2697ms)
  ✔ restore: unknown id → 404 TRASH_NOT_FOUND; non-numeric id → 400 VALIDATION; purged id → 404 TRASH_PURGED; empty folder → 404 (17.3983ms)
  ✔ restore broadcasts catalog:changed {added} and invalidates diagnostics (31.8ms)
  ✔ Series round-trip: delete by series uid keeps uid, restore re-keys (25.7096ms)
  ✔ list(): newest-first, capped at 20, purged entries excluded (15.8365ms)
  ✔ purge: the 21st deletion purges the OLDEST deletion's files from disk; its log entry stays with purgedAt; window entries untouched (66.2896ms)
✔ MovieTrash (P6b E3 — soft delete / restore, D6) (436.5716ms)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Order not found: order-9999
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0006 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0004 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Failed to save orders: EEXIST: file already exists, mkdir 'C:\Users\Ali\AppData\Local\Temp\ord-test-RKQPfZ\orders-as-dir\nested'
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Restored from backup: orders.20261018-212943.json
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0006 with 1 movies
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 status -> preparing
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] Loaded 1 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] Saved 1 orders to disk
  [ORDERS] order-0001 info updated
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Restored order-0001 (number 1)
  [ORDERS] Loaded 2 orders from disk
  [ORDERS] No existing orders file found, starting fresh
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Restored order-0001 (number 1)
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0001 (had 1 movies)
▶ OrderManager
  ✔ creates an order (14.7568ms)
  ✔ lists orders (18.7725ms)
  ✔ gets order by ID (9.9641ms)
  ✔ returns null for unknown order ID (2.0397ms)
  ✔ deletes an order (13.0939ms)
  ✔ returns false when deleting unknown order (1.4984ms)
  ✔ persists orders to disk (7.5607ms)
  ✔ incrementing order numbers (11.8189ms)
  ✔ throws on empty movie list (2.007ms)
  ✔ count returns 0 for empty (1.6756ms)
  ✔ persists {version, nextNumber, orders} format (A4) (6.5798ms)
  ✔ upgrades a legacy array-format file on first save (A4 migration) (11.6021ms)
  ✔ upgrades a legacy {orders, nextNumber} file (10.7125ms)
  ✔ whitelists movie snapshot fields and caps length (A4 validation) (7.5061ms)
  ✔ rejects orders with more than 500 items (A4 validation) (1.7159ms)
  ✔ returns a clear error object when save fails instead of throwing (A4) (10.4962ms)
  ✔ forces a backup before deleting an order (A4 / destructive op) (20.3376ms)
  ✔ quarantines a corrupt orders.json and restores from backup (DATA-08) (23.1039ms)
  ✔ P6d E5: new orders get workflow defaults (status new, empty name/note, updatedAt = createdAt) (6.0486ms)
  ✔ P6d E5: legacy orders load with defaults (status done, empty fields, updatedAt = createdAt) and persist on next save (11.9599ms)
  ✔ P6d E5: an invalid status in a stored file loads as done (4.008ms)
  ✔ P6d E5: updateOrderStatus persists the new status and bumps updatedAt (15.7595ms)
  ✔ P6d E5: updateOrderStatus rejects unknown statuses with a Persian error and changes nothing (7.6149ms)
  ✔ P6d E5: updateOrderStatus on an unknown id returns false (1.6549ms)
  ✔ P6d E5: updateOrderInfo clamps name/note to 200 chars, bumps updatedAt, persists (14.0866ms)
  ✔ P6d E5: updateOrderInfo keeps omitted fields, rejects unknown ids with a Persian error (17.1023ms)
  ✔ P6d E5: soft delete removes the order everywhere but undo restores the same id and number (31.4069ms)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [ORDERS] Saved 0 orders to disk
  [ORDERS] Deleted order-0002 (had 1 movies)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Restored order-0002 (number 2)
  [ORDERS] No existing orders file found, starting fresh
  ✔ P6d E5: undo after the window returns null; dispose() cancels the purge timer (220.9884ms)
  ✔ P6d E5: undo of an order that was never deleted returns null (1.6575ms)
✔ OrderManager (511.2562ms)
▶ parseFilename — table-driven (≥40 filenames)
  ✔ parses "5273-Shelter 2026.jpg" as Movie (5.9611ms)
  ✔ parses "5273-Shelter (2026).jpg" as Movie (0.5927ms)
  ✔ parses "5273-Shelter-2026.jpg" as Movie (0.3402ms)
  ✔ parses "5273-Shelter.2026.jpg" as Movie (0.2881ms)
  ✔ parses "5273 Shelter 2026.jpg" as Movie (0.2763ms)
  ✔ parses "5273 - Shelter (2026).jpg" as Movie (0.3446ms)
  ✔ parses "5273_Shelter_2026.jpg" as Movie (0.3079ms)
  ✔ parses "5273 The Dark Knight 2008 WEB-DL x265.jpg" as Movie (0.4268ms)
  ✔ parses "5273 - The Dark Knight (2008) [1080p] [BluRay].jpg" as Movie (0.4996ms)
  ✔ parses "0001- Heat 1995.jpg" as Movie (0.4322ms)
  ✔ parses "0099- Inception 2010.jpg" as Movie (0.2793ms)
  ✔ parses "123- The Godfather 1972.jpg" as Movie (0.323ms)
  ✔ parses "0001- The Matrix 1999.jpg" as Movie (0.2593ms)
  ✔ parses "1234-Iron Man 3.2013.jpg" as Movie (0.208ms)
  ✔ parses "0001- 1917 2019.jpg" as Movie (0.2113ms)
  ✔ parses "0001- Blade Runner 2049 2017.jpg" as Movie (0.2363ms)
  ✔ parses "0001- 2012 2009.jpg" as Movie (0.2083ms)
  ✔ parses "0001- Charlotte's Web 2006.jpg" as Movie (0.205ms)
  ✔ parses "0001- The Amazon 2019.jpg" as Movie (0.1928ms)
  ✔ parses "0001- Dark Web 2021.jpg" as Movie (0.1985ms)
  ✔ parses "0001- Extended Family 2018.jpg" as Movie (0.2028ms)
  ✔ parses "0001- Apple 2020.jpg" as Movie (0.2054ms)
  ✔ parses "0001- Netflix Special 2021.jpg" as Movie (0.1872ms)
  ✔ parses "0001- HBO Story 2015.jpg" as Movie (0.2036ms)
  ✔ parses "0001- Limited Edition 2017.jpg" as Movie (0.1998ms)
  ✔ parses "0001- Multi Player 2016.jpg" as Movie (0.1826ms)
  ✔ parses "0001- Final Cut 2014.jpg" as Movie (0.1871ms)
  ✔ parses "0001- Uncut Gem 2019.jpg" as Movie (0.1903ms)
  ✔ parses "0001- Disney Dream 2013.jpg" as Movie (0.1835ms)
  ✔ parses "0001- Hulu House 2020.jpg" as Movie (0.1844ms)
  ✔ parses "0001- Grey's Anatomy 2005.jpg" as Movie (0.1873ms)
  ✔ parses "0001- 100% Wolf 2020.jpg" as Movie (0.1871ms)
  ✔ parses "0001- Tom & Jerry 2021.jpg" as Movie (0.3117ms)
  ✔ parses "0001- C# Lover 2018.jpg" as Movie (0.2198ms)
  ✔ parses "1234- سلام 2020.jpg" as Movie (1.7442ms)
  ✔ parses "0001- فیلم ایرانی 2015.jpg" as Movie (0.2829ms)
  ✔ parses "00012-Cars 2006.jpg" as Animation (0.4444ms)
  ✔ parses "00012-Cars.jpg" as Animation (0.2446ms)
  ✔ parses "00001-Up.jpg" as Animation (0.1712ms)
  ✔ parses "00001-Up 2009.jpg" as Animation (0.4498ms)
  ✔ parses "0001-Gav 1969.jpg" as Iranian (1.6554ms)
  ✔ parses "0001-Gav.jpg" as Iranian (0.2966ms)
  ✔ parses "Breaking Bad.jpg" as Series (1.9607ms)
  ✔ parses "Game of Thrones.jpg" as Series (0.2323ms)
  ✔ parses "100% Wolf.jpg" as Series (0.1574ms)
  ✔ parses "Charlotte's Web.jpg" as Series (0.1474ms)
  ✔ parses "0001- Heat 1995 [BluRay].jpg" as Movie (0.2334ms)
  ✔ parses "0001- Heat 1995 (1080p).jpg" as Movie (0.256ms)
  ✔ parses "0001- Heat 1995 x265 HDRip.jpg" as Movie (0.1623ms)
✔ parseFilename — table-driven (≥40 filenames) (26.5857ms)
▶ parseFilename — rejects invalid filenames
  ✔ returns null for "0001- Heat 1995.mp4" (unsupported-ext) (0.3023ms)
  ✔ returns null for "Heat 1995.jpg" (no-id) (0.065ms)
  ✔ returns null for "0001- Heat.jpg" (no-year) (0.2507ms)
  ✔ returns null for "0001- Heat 1800.jpg" (no-year) (0.2068ms)
  ✔ returns null for ".jpg" (unsupported-ext) (0.0453ms)
  ✔ returns null for "1234567- Inception 2010.jpg" (id-too-long) (0.0453ms)
  ✔ returns null for "12345678- Foo 2020.jpg" (id-too-long) (0.0972ms)
  ✔ returns null for "0001- .jpg" (empty-title) (0.0601ms)
  ✔ returns null for "0001- 2019.jpg" (no-year) (0.0695ms)
  ✔ returns null for "" (unsupported-ext) (0.0533ms)
  ✔ returns null for "noext" (unsupported-ext) (0.1424ms)
✔ parseFilename — rejects invalid filenames (1.7074ms)
▶ parseFilenameEx — success shape
  ✔ returns {ok:true, entry} for a valid Movie (1.2855ms)
  ✔ returns {ok:true, entry} for a valid Series (0.253ms)
  ✔ lowercases extension (0.2116ms)
✔ parseFilenameEx — success shape (1.912ms)
▶ parseFilename — characterization edge cases
  ✔ parses "0001- Heat 1800.jpg" as null (year out of 19xx/20xx range) (0.2113ms)
  ✔ does not treat 7-digit run as split ID (DATA-18) (0.0822ms)
  ✔ Animation keeps year when present (DATA-11) (0.1895ms)
✔ parseFilename — characterization edge cases (0.6329ms)
▶ cleanTitle (DATA-12)
  ✔ keeps Charlotte's Web (0.2927ms)
  ✔ keeps The Amazon (0.1889ms)
  ✔ keeps Dark Web (0.1714ms)
  ✔ keeps Extended Family (0.1737ms)
  ✔ keeps Apple (0.1753ms)
  ✔ strips technical bracket groups (0.2102ms)
  ✔ strips technical paren groups but keeps real parens (0.4416ms)
  ✔ keeps non-technical bracket content (0.2144ms)
  ✔ NFC-normalises and trims (0.1732ms)
  ✔ keeps ZWNJ (0.5614ms)
✔ cleanTitle (DATA-12) (3.0234ms)
▶ classifyFromPath
  ✔ classifies Movies/Action as Movie with genre (0.4249ms)
  ✔ classifies Animation/ as Animation (0.1404ms)
  ✔ classifies Series/ as Series (0.1149ms)
  ✔ classifies Iranian/ as Iranian (0.0973ms)
  ✔ classifies Serries/ as Series (alias) (0.0846ms)
  ✔ classifies SERIES/ as Series (case-insensitive) (0.0698ms)
  ✔ classifies Games/PS4/ as Game (0.1219ms)
  ✔ classifies Movies/Drama/ correctly (0.1069ms)
  ✔ classifies Movies/ with no subfolder — genre is filename (current behavior) (0.0997ms)
✔ classifyFromPath (1.5656ms)
▶ TYPE_MAP
  ✔ maps movies to Movie (0.1635ms)
  ✔ maps animation to Animation (0.0715ms)
  ✔ maps series to Series (0.0616ms)
  ✔ maps serries to Series (alias) (0.0797ms)
  ✔ maps iranian to Iranian (0.079ms)
  ✔ maps games to Game (0.0775ms)
✔ TYPE_MAP (0.7358ms)
▶ IMAGE_EXTENSIONS
  ✔ contains jpg (0.1443ms)
  ✔ contains jpeg (0.1174ms)
  ✔ contains png (0.1179ms)
  ✔ contains webp (0.0793ms)
  ✔ contains avif (0.0708ms)
  ✔ does not contain mp4 (0.1303ms)
✔ IMAGE_EXTENSIONS (1.0154ms)
▶ PayloadCache (unit)
  ✔ builds once, keeps a stable quoted-sha1 ETag across getEntry calls (3.8002ms)
  ✔ invalidate debounces bursts into one rebuild; ETag changes with content (20.8815ms)
  ✔ getEntry rebuilds synchronously when dirty (lazy request path) (1.7413ms)
  ✔ produces a gunzippable copy equal to the raw body (30.2141ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ dispose cancels the pending rebuild (61.9207ms)
✔ PayloadCache (unit) (120.559ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
▶ GET /api/movies + /api/games payload caching (P8c G6)
  ✔ ETag + Vary + 304 + gzip; ETag stays stable across repeated requests (134.9961ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ a successful mutation changes the ETag and the served data (189.6367ms)
✔ GET /api/movies + /api/games payload caching (P8c G6) (325.2004ms)
▶ P8c — persist sort fast path (DATA-14 equivalence)
  ✔ compareKeysPersist agrees with localeCompare(en, numeric) on catalog key forms (84.9005ms)
  ✔ isFastKey accepts exactly the ICU-equivalent forms (0.3843ms)
  ✔ compareNumericAware is a total order (antisymmetric + reflexive) (0.4506ms)
  ✔ sortForPersist produces the same order as sort(compareForPersist) (27.8349ms)
  ✔ stringifyCatalogAsync is byte-identical to JSON.stringify (compact) (14.3501ms)
✔ P8c — persist sort fast path (DATA-14 equivalence) (131.397ms)
▶ P8c — async save path
  ✔ saveToDiskAsync writes the same catalog as saveToDisk (order + fields) (32.3894ms)
  ✔ flushAsync clears a pending debounced save and returns true (10.0831ms)
✔ P8c — async save path (42.9819ms)
▶ P8c — async replaceFromScan parity
  ✔ replaceFromScanAsync yields identical state to replaceFromScan (49.469ms)
  ✔ replaceFromScanAsync preserves edited titles and metadata across the swap (2.7322ms)
✔ P8c — async replaceFromScan parity (52.4895ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
▶ P8b follow-up — poster replaced in place (same filename)
  ✔ movies: same-name overwrite with NEWER mtime → new ?v, new bytes, catalog:changed (585.0643ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
  ✔ movies: same-name overwrite with OLDER mtime (utimes) also refreshes ?v (537.0303ms)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [WATCHER] Added game: Hades
  [WATCHER] Reconcile Games: +1 ~0 -0
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Updated game: Hades
  [WATCHER] Reconcile Games: +0 ~1 -0
  [WS] Customer disconnected (remaining: 0)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ games: same-name overwrite → new ?v in GET /api/games + catalog:changed (1019.9289ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ PUT by-uid poster replace (edit path) → fresh ?v matches disk mtime (269.3424ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Saved catalog to disk: 1 movies
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ thumbnail cache: overwrite produces a NEW hash file with new webp bytes (656.5743ms)
✔ P8b follow-up — poster replaced in place (same filename) (3198.4296ms)
▶ P8a G1 - collectLanUrls
  ✔ collects non-internal IPv4 addresses with their interface names (2.1939ms)
  ✔ skips loopback/internal addresses (0.2556ms)
  ✔ includes virtual adapters (VMware/VirtualBox are non-internal IPv4s) (1.2987ms)
  ✔ handles legacy numeric family values (older Node) (0.2444ms)
  ✔ no network at all: empty list (main falls back to localhost only) (0.209ms)
  ✔ wiring: uses os.networkInterfaces() and the resolved config port (0.9079ms)
✔ P8a G1 - collectLanUrls (6.9627ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 1 directories
  [WS] WebSocket server initialized
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ P8c follow-up — failing reconcile keeps the cached catalog
  ✔ a reconcile that throws keeps the cache, settles scanning and lifts the 503 (242.317ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [WATCHER] Cannot watch C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953: ENOTDIR: not a directory, scandir 'C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953'
  [SCANNER] Cannot read directory: C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953 — ENOTDIR: not a directory, scandir 'C:\Users\Ali\AppData\Local\Temp\not-a-dir-23804-1792358984953'
  ✔ an unreadable library root before the swap does not wipe the cache (43.6285ms)
✔ P8c follow-up — failing reconcile keeps the cached catalog (288.1872ms)
▶ Role Provider (characterization)
  ▶ getClientRole
    ✔ returns "customer" for customer role (1.4983ms)
    ✔ returns "manager" for manager role (0.1797ms)
    ✔ returns null for invalid role (0.2379ms)
    ✔ returns null for null/undefined (0.1626ms)
  ✔ getClientRole (5.8142ms)
  ▶ isValidRole
    ✔ returns true for valid roles (0.2163ms)
    ✔ returns false for invalid roles (0.1723ms)
  ✔ isValidRole (0.5991ms)
  ▶ VALID_ROLES
    ✔ contains exactly customer and manager (0.269ms)
  ✔ VALID_ROLES (0.5117ms)
✔ Role Provider (characterization) (7.7907ms)
▶ Scanner (characterization)
  ▶ scanLibrary
    ✔ returns {results, stats} with correct shape (17.8213ms)
    ✔ parses Movie type from Movies/{Genre}/ path (5.9559ms)
    ✔ parses Animation type from Animation/ path (7.0423ms)
    ✔ parses Iranian type from Iranian/ path (3.6907ms)
    ✔ parses Series type from Series/ path (3.5828ms)
    ✔ handles non-existent library path gracefully (0.4017ms)
    ✔ skips non-image files (5.7761ms)
  ✔ scanLibrary (46.2293ms)
  ✔ parses Serries/ as Series (alias) (3.237ms)
  ✔ returns all files (including same ID in multiple genre folders) (7.001ms)
  ✔ ignores Movies/ with no genre subfolder (edge case) (3.4321ms)
  ✔ does not walk Games/ during scanLibrary (DATA-04) (9.3187ms)
  ✔ skips dot-folders (.trash, .tmp) at the Library root (6.6352ms)
  ✔ returns invalid[] with reasons for unparseable posters (6.2234ms)
  ✔ scanFile returns {ok:true, entry} for a valid file (6.8137ms)
  ✔ scanFile returns {ok:false, reason, file} for an invalid file (3.1284ms)
  ▶ scanGames
    ✔ returns {results, stats} with correct shape (8.7633ms)
    ✔ merges same title across PS4 and PS5 (7.073ms)
    ✔ returns empty for non-existent Games dir (4.2706ms)
  ✔ scanGames (20.4085ms)
  ▶ resolveTypeFolder (D7)
    ✔ new library uses Series/ (4.6548ms)
    ✔ existing Serries/ is kept (2.6598ms)
    ✔ existing SERIES/ is found case-insensitively (2.597ms)
    ✔ Animation/Iranian use conventional names (3.2488ms)
  ✔ resolveTypeFolder (D7) (13.4768ms)
✔ Scanner (characterization) (128.4363ms)
  [P5a] 20k search: build=120.3ms avg=3.03ms worst=6.81ms
  [P5a] 5k-subset search: worst=2.19ms
▶ js/utils/search.js
  ✔ loads ES module via dynamic import (7.1389ms)
  ✔ applies a config fixture so type labels resolve (ARCH-03 via /api/config) (0.8232ms)
  ▶ buildSearchEntry / buildSearchIndex
    ✔ precomputes a normalised haystack containing title, id, year, genres, type labels (1.5921ms)
    ✔ never stringifies null/undefined (Series hay must not contain "null"/"undefined") (0.5475ms)
    ✔ builds entries for games with platform labels (0.2588ms)
  ✔ buildSearchEntry / buildSearchIndex (2.8709ms)
  ▶ searchItems — normalisation both directions (FE-07)
    ✔ query with Arabic letters finds titles stored with Persian letters (and vice versa) (1.8474ms)
    ✔ Persian-digit query ۲۰۲۰ finds ASCII year 2020 (1.6144ms)
    ✔ ASCII query 2020 finds the same items (0.3487ms)
    ✔ ZWNJ query finds no-ZWNJ title and vice versa (0.398ms)
    ✔ Persian type label سریال finds Series (0.3584ms)
    ✔ English type label Series finds the same items (0.5212ms)
    ✔ typing "null" finds nothing (FE-07) (0.4016ms)
    ✔ typing "undefined" finds nothing (0.2132ms)
  ✔ searchItems — normalisation both directions (FE-07) (6.4545ms)
  ▶ searchItems — tokenise on spaces, AND the tokens
    ✔ multi-token AND matches across the haystack (0.3553ms)
    ✔ a token matching nothing yields no results (0.258ms)
    ✔ tokens may match different fields (genre + year) (0.8117ms)
  ✔ searchItems — tokenise on spaces, AND the tokens (1.8484ms)
  ▶ searchItems — ranking: exact ID > title prefix > contains
    ✔ exact-ID match ranks first, then title-prefix, then contains (0.3492ms)
    ✔ prefix beats contains for Latin titles (0.207ms)
    ✔ equal ranks keep the input (type-rule) order — stable (0.2002ms)
  ✔ searchItems — ranking: exact ID > title prefix > contains (1.0327ms)
  ▶ searchItems — edge cases
    ✔ empty query returns the input list unchanged (0.3572ms)
    ✔ restricts to the provided subset (category filter) (0.2238ms)
    ✔ games: platform query finds games (0.2197ms)
    ✔ tieBreak comparator orders equal ranks (I11 as tie-break) (0.2854ms)
  ✔ searchItems — edge cases (1.3446ms)
  ▶ 20k fixture — main-thread search measurement (worker decision)
    ✔ build + 12 queries: worst query ≤ 30 ms on 20,000 items (172.2329ms)
    ✔ subset (category-filtered) worst query ≤ 30 ms (129.4451ms)
  ✔ 20k fixture — main-thread search measurement (worker decision) (301.8406ms)
✔ js/utils/search.js (325.0664ms)
▶ js/utils/sort.js
  ✔ loads ES module via dynamic import (13.9827ms)
  ▶ compareMovie — Year DESC then ID DESC
    ✔ sorts by year descending (0.2678ms)
    ✔ sorts by ID descending when years are equal (0.1397ms)
    ✔ treats missing year as 0 (0.1435ms)
  ✔ compareMovie — Year DESC then ID DESC (0.7916ms)
  ▶ compareIranian — ID DESC (year ignored)
    ✔ sorts by ID descending (0.1967ms)
    ✔ ignores year differences (0.2714ms)
  ✔ compareIranian — ID DESC (year ignored) (0.7218ms)
  ▶ compareSeries — alphabetical, ignoring articles
    ✔ sorts alphabetically by title (0.5242ms)
    ✔ ignores "The" at the start (0.2164ms)
  ✔ compareSeries — alphabetical, ignoring articles (1.0493ms)
  ▶ compareMovies — dispatches by type
    ✔ uses compareMovie for Movie type (0.3056ms)
    ✔ uses compareSeries for Series type (0.2412ms)
  ✔ compareMovies — dispatches by type (0.714ms)
  ▶ compareAllMovies — groups by type priority: Movie → Iranian → Animation → Series
    ✔ Movie sorts before Iranian (0.224ms)
    ✔ Iranian sorts before Animation (0.1273ms)
    ✔ Animation sorts before Series (0.0951ms)
  ✔ compareAllMovies — groups by type priority: Movie → Iranian → Animation → Series (0.6065ms)
  ▶ sortMovies
    ✔ sorts an array in-place (0.1829ms)
  ✔ sortMovies (0.26ms)
  ▶ numericId
    ✔ parses "00452" to 452 (0.1581ms)
    ✔ parses "9821" to 9821 (0.0849ms)
    ✔ returns -1 for null (0.1104ms)
    ✔ returns -1 for undefined (0.0953ms)
    ✔ returns -1 for non-numeric (0.0864ms)
  ✔ numericId (0.7196ms)
  ▶ normalizedSeriesTitle
    ✔ lowercases (0.1618ms)
    ✔ strips "The" (0.082ms)
    ✔ strips "A" (0.0901ms)
    ✔ strips "An" (0.0775ms)
    ✔ returns empty string for null (0.0873ms)
  ✔ normalizedSeriesTitle (0.7291ms)
  ▶ D3 — shared fa collator
    ✔ faCollator is Intl.Collator("fa", {numeric:true, sensitivity:"base"}) (0.205ms)
    ✔ numeric option: "Movie 2" < "Movie 10" (0.119ms)
    ✔ case-insensitive (base sensitivity): breaking ≡ Breaking (0.0854ms)
    ✔ Persian titles compare in Persian alphabetical order (الفبا) (1.1426ms)
    ✔ mixed Persian/Latin: Persian titles order before Latin under fa (0.2395ms)
    ✔ ZWNJ title equals its no-ZWNJ variant (compare === 0) (0.453ms)
  ✔ D3 — shared fa collator (2.4949ms)
  ▶ D3 — compareSeries uses the fa collator (I11 rule unchanged)
    ✔ Persian Series titles sort alphabetically (0.3088ms)
    ✔ mixed Persian/Latin Series: Persian before Latin (0.116ms)
    ✔ ZWNJ variants of the same Series title compare equal (0.1038ms)
    ✔ article stripping still applies (I11 unchanged) (0.0967ms)
    ✔ Latin ordering unchanged vs the old en comparator (0.1033ms)
  ✔ D3 — compareSeries uses the fa collator (I11 rule unchanged) (0.943ms)
  ▶ D3 — fallback comparator uses the fa collator
    ✔ unknown type: equal years fall back to fa title order (0.1788ms)
  ✔ D3 — fallback comparator uses the fa collator (0.3034ms)
✔ js/utils/sort.js (25.93ms)
▶ P8c — StartupProbe phase attribution
  ✔ attributes a blocking chunk to the phase it ran in, not the next one (165.844ms)
  ✔ records the worst chunk per phase and stop() flushes the final gap (130.7145ms)
  ✔ setPhase is a no-op while stopped and for the same label (0.3607ms)
✔ P8c — StartupProbe phase attribution (298.1503ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
▶ P8c G6 — background reconcile
  ✔ cold start answers from an empty cache with meta.scanning=true, then swaps in the scan (88.2864ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ warm start serves the cached catalog while still scanning (103.5896ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ rejects catalog mutations with 503 SCAN_IN_PROGRESS until reconcile finishes (130.7524ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [WATCHER] Added: 0003- Third Movie 2003.jpg
  [WATCHER] Reconcile .: +1 ~0 -0
  [INDEXER] Saved catalog to disk: 3 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 3 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  ✔ replays watcher events held during the scan (new poster lands in the index) (297.0239ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 4 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 2 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 4 directories
  [WS] WebSocket server initialized
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 2 movies, 2 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  ✔ broadcasts catalog:changed when reconcile finishes (even with zero diffs) (57.83ms)
✔ P8c G6 — background reconcile (679.5543ms)
  [WS] WebSocket server closed
▶ P8a follow-up - stale stop.request
  ✔ removes a stale file at arm time and does not stop (156.0323ms)
  ✔ a file written after arming stops exactly once, then is removed (356.5953ms)
  ✔ missing directory: arming does not throw (1.1106ms)
  ✔ server.js wires armStopWatch (no inline watch left) (0.8009ms)
✔ P8a follow-up - stale stop.request (516.3849ms)
▶ backend/storage/atomic-json
  ✔ writeJsonAtomic creates the file with parsed JSON (11.5897ms)
  ✔ writeJsonAtomic pretty option indents output (7.3515ms)
  ✔ writeJsonAtomic creates missing parent directories (7.5011ms)
  ✔ writeJsonAtomic leaves no .tmp siblings behind after success (9.5168ms)
  ✔ writeJsonAtomic replaces existing file atomically (last write wins) (9.5064ms)
  ✔ readJsonSafe returns ok + data for valid JSON (3.7043ms)
  ✔ readJsonSafe returns missing when the file does not exist (0.9048ms)
  ✔ readJsonSafe quarantines corrupt file and never overwrites the original bytes (5.1068ms)
  ✔ readJsonSafe restores from newest valid backup when present (5.9781ms)
  ✔ readJsonSafe skips invalid backups and picks the newest valid one (6.3137ms)
  ✔ readJsonSafe with no backup returns corrupt + quarantine path (3.7932ms)
  ✔ AC1: crash between temp-write and rename leaves target at previous version (12.2288ms)
✔ backend/storage/atomic-json (85.6783ms)
▶ backend/storage/backup policy
  ✔ creates a timestamped backup file (7.7105ms)
  ✔ throttles to at most one backup per 10 minutes while changing (306.2501ms)
  ✔ force backup bypasses the throttle (destructive ops) (5.1642ms)
  ✔ 1,000 rapid saves produce ≤ 40 backup files (acceptance 5) (1955.2499ms)
  ✔ retention keeps newest 30 + one per day for 14 days (fake clock) (211.2963ms)
  ✔ never deletes the last valid backup even with zero retention room (5.1665ms)
  ✔ startupBackup creates one only when the file changed since the last backup (6.743ms)
  ✔ does not touch catalog.json (rebuildable cache is out of scope) (4.2455ms)
✔ backend/storage/backup policy (2502.3394ms)
▶ P8a G1 - supervisor crash policy
  ✔ exposes the launcher contract constants (1.9234ms)
  ✔ clean exit (code 0) is done — never restarted, never counted (0.3608ms)
  ✔ first four crashes within the window restart after 3 s (0.314ms)
  ✔ 5 crashes within 2 minutes → stop (0.2775ms)
  ✔ crashes older than 2 minutes fall out of the window (0.2682ms)
  ✔ a longer-lived run (>= 2 min) resets the count (0.2822ms)
  ✔ signal exit (code null) counts as a crash (0.1999ms)
  ✔ config-error exit (code 2): stop without counting a crash (0.2874ms)
  ✔ real supervisor run: a config-error child (exit 2) is not restarted (131.7782ms)
  ✔ real supervisor run: exit 0 child is done, not restarted (120.5967ms)
  ✔ require() does not auto-run the supervisor (require.main guard) (1.0318ms)
✔ P8a G1 - supervisor crash policy (258.9473ms)
▶ js/utils/text.js — normalizeFa
  ✔ loads ES module via dynamic import (2.678ms)
  ▶ D1 — Yeh variants → Persian Yeh (U+06CC)
    ✔ Arabic Yeh ي (U+064A) → Persian Yeh (0.6619ms)
    ✔ Persian Yeh ی stays Persian Yeh (0.23ms)
    ✔ Alef Maksura ى (U+0649) → Persian Yeh (0.1254ms)
    ✔ Alef Maksura at word end (على) → علی (0.1179ms)
    ✔ both directions: Arabic-typed query equals Persian-stored title (0.2204ms)
  ✔ D1 — Yeh variants → Persian Yeh (U+06CC) (1.8233ms)
  ▶ D1 — Kaf variants → Persian Keheh (U+06A9)
    ✔ Arabic Kaf ك (U+0643) → Persian Keheh (0.2516ms)
    ✔ Persian Keheh ک stays (1.1042ms)
    ✔ both directions: Arabic-typed کمدی equals Persian-stored کمدی (0.2884ms)
    ✔ mixed variant query still equals stored title (0.2355ms)
  ✔ D1 — Kaf variants → Persian Keheh (U+06A9) (2.2633ms)
  ▶ D1 — digits → ASCII
    ✔ Persian digits ۰-۹ (U+06F0–06F9) → ASCII (0.2329ms)
    ✔ Arabic-Indic digits ٠-٩ (U+0660–0669) → ASCII (0.1398ms)
    ✔ ASCII digits unchanged (0.1744ms)
    ✔ ۲۰۲۰ equals 2020 (Persian-digit query finds ASCII year) (0.0763ms)
    ✔ mixed digits inside a word (0.0689ms)
  ✔ D1 — digits → ASCII (0.8617ms)
  ▶ D1 — tatweel and diacritics removed
    ✔ tatweel U+0640 removed (0.1071ms)
    ✔ fatha/shadda/kasra removed (U+064B–U+065F) (0.0628ms)
    ✔ superscript alef U+0670 removed (0.0509ms)
    ✔ diacritics do not block matching (0.0541ms)
  ✔ D1 — tatweel and diacritics removed (0.4229ms)
  ▶ D1 — ZWNJ removed for matching (display untouched elsewhere)
    ✔ ZWNJ U+200C removed (0.1722ms)
    ✔ ZWNJ variant equals no-ZWNJ form (0.0644ms)
    ✔ ZWNJ in possessive خانه‌ی equals خانهی (0.0563ms)
  ✔ D1 — ZWNJ removed for matching (display untouched elsewhere) (0.3991ms)
  ▶ D1 — Latin lowercasing
    ✔ upper → lower (0.0757ms)
    ✔ mixed Persian/Latin (0.0619ms)
  ✔ D1 — Latin lowercasing (0.1965ms)
  ▶ D1 — whitespace collapse
    ✔ collapses runs and trims (0.0806ms)
    ✔ tabs and newlines count as whitespace (0.0516ms)
    ✔ empty string returns empty (0.0487ms)
  ✔ D1 — whitespace collapse (0.2657ms)
  ▶ D1 — null/undefined safety
    ✔ null → empty string (never "null") (0.0683ms)
    ✔ undefined → empty string (never "undefined") (0.0825ms)
    ✔ never produces the literal text "null" (0.0831ms)
  ✔ D1 — null/undefined safety (0.3537ms)
  ▶ D1 — NFKC compatibility normalisation
    ✔ ligature ﬁ → fi (0.6889ms)
    ✔ fullwidth Latin Ａ → a (0.2919ms)
    ✔ circled digit ① → 1 (0.2608ms)
  ✔ D1 — NFKC compatibility normalisation (1.3615ms)
  ▶ D1 — composition & idempotence
    ✔ all rules combined (0.1713ms)
    ✔ is idempotent: f(f(x)) === f(x) (0.1403ms)
    ✔ handles numeric input without throwing (0.0633ms)
  ✔ D1 — composition & idempotence (0.4886ms)
  ▶ AC1 — end-to-end acceptance phrases
    ✔ query typed with Arabic letters finds title stored with Persian letters (and vice versa) (0.2623ms)
    ✔ Persian digits match ASCII years (0.1116ms)
    ✔ ZWNJ query matches no-ZWNJ title (0.0635ms)
  ✔ AC1 — end-to-end acceptance phrases (0.5912ms)
✔ js/utils/text.js — normalizeFa (13.0245ms)
▶ P8b thumbs service
  ✔ isThumbWidth accepts 300/600 only; WIDTHS exported (3.0242ms)
  ✔ hashFor is stable and changes with path, mtime and width (2.3815ms)
  ✔ get generates once, then serves from cache; atomic (no .tmp left) (14.7346ms)
  ✔ mtime invalidation: a changed file produces a NEW thumb name (8.6519ms)
  ✔ generation pool never exceeds concurrency 2 (116.774ms)
  ✔ sharp missing: get returns null and logs the fallback once (2.2873ms)
  ✔ sharp load THROWS (simulated install failure): null + visible fallback, app keeps serving (2.13ms)
  ✔ generation reads the source into a Buffer (no sharp path/fd input) (6.2605ms)
  ✔ sharp failure mid-generation: null, tmp cleaned, failure logged once (4.6754ms)
  ✔ get rejects unknown widths and non-finite mtime without touching disk (2.2858ms)
  ✔ cleanOrphans keeps expected names and removes the rest (4.7028ms)
  ✔ cleanOrphans on a missing cache dir is a no-op (1.4988ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ✔ warmUp pre-generates both widths for the first entries only (11.6826ms)
✔ P8b thumbs service (183.7045ms)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b poster route — ?w validation, headers, fallback
  ✔ w=500 (unknown width) → 400 (40.8178ms)
  ✔ no ?v → cacheable but NOT immutable; ETag present (7.4795ms)
  ✔ ?v matching the file mtime → immutable; If-None-Match → 304 (8.8809ms)
  ✔ ?v=0 (stale) is NOT immutable (3.5172ms)
  ✔ GET /api/movies posters carry ?v and never leak mtime (SEC-08) (2.1439ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ thumb request with undecodable source falls back to the original bytes (12.6462ms)
✔ P8b poster route — ?w validation, headers, fallback (125.0318ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b poster route — real sharp end-to-end (skips without sharp)
  ✔ w=300 returns a real webp thumbnail smaller than the original (51.2633ms)
  ✔ repeat request is served from the thumbs cache (one file per width) (61.0871ms)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  [ORDERS] No existing orders file found, starting fresh
  [INDEXER] Loaded 1 movies from cache
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 5 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +1 new, ~0 updated, 1 total
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
  ✔ game posters also accept ?w and versioned URLs exist (67.1892ms)
✔ P8b poster route — real sharp end-to-end (skips without sharp) (223.4656ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 8 movies, 8 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 8 movies
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 8 movies
  [WS] WebSocket server closed
▶ P8b follow-up — rename-during-generation with warm-up ENABLED
  ✔ editor rename via PUT by-uid succeeds while warm-up converts (no EBUSY) (490.7241ms)
  ℹ 8 editor renames during warm-up completed in 155 ms (0 collisions)
  ✔ direct fs rename + in-place replace succeed while svc.get converts (no EBUSY) (215.9413ms)
  ℹ 10 direct renames + 1 replace during warm-up: 21 ms, 0 collisions
✔ P8b follow-up — rename-during-generation with warm-up ENABLED (709.032ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
▶ Watcher (characterization)
  ✔ hot-added Movie file appears in the index (1610.5306ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (removed)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ deleted Movie file is removed from the index (1610.0343ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies: +1 ~0 -0
  [WATCHER] Stopped
  ✔ onChange callback fires on file add with {added,updated,removed} shape (1606.2194ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ delete one copy of a multi-genre movie keeps the movie (different copy remains) (1608.8712ms)
  [WATCHER] Removed: 0001- Heat 1995.jpg (removed)
  [WATCHER] Reconcile Movies\Action: +0 ~0 -1
  [WATCHER] Stopped
  ✔ delete the only copy of a movie removes it from the index (1613.9492ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Added: 0002- Inception 2010.jpg
  [WATCHER] Reconcile Movies\Drama: +1 ~0 -0
  [WATCHER] Stopped
  ✔ watcher watches all pre-existing sub-directories (2117.3673ms)
  [WATCHER] Added: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
  ✔ watcher stops cleanly without lingering timers (608.9917ms)
✔ Watcher (characterization) (10779.0363ms)
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
  [WATCHER] Added: 0001- Heat Renamed 1995.jpg
  [WATCHER] Removed: 0001- Heat 1995.jpg (kept)
  [WATCHER] Reconcile Movies\Action: +1 ~0 -1
  [WATCHER] Stopped
▶ B6 — order-independent reconcile (AC2)
  ✔ AC2: {remove-old, add-new} and {add-new, remove-old} → identical final state, metadata intact (3241.2979ms)
  [WATCHER] Added: 0007- Arrival 2016.jpg
  [WATCHER] Reconcile .: +1 ~0 -0
  [WATCHER] Stopped
  ✔ B6: new directory is watched and its files are indexed (1607.1857ms)
  [WATCHER] Reconcile (deleted Action): +0 ~0 -1
  [WATCHER] Stopped
  ✔ B6: deleting a whole directory removes its files; movie removed only when no copy remains (1614.838ms)
  [WATCHER] Added: 0002- Inception 2010.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WATCHER] Stopped
  ✔ B6: expect(paths) suppresses server-initiated events until TTL (3229.0769ms)
  [INDEXER] Games: +0 new, ~1 updated, 1 total
  [INDEXER] Games: +1 new, ~0 updated, 2 total
  [WATCHER] Added game: Spider-Man
  [WATCHER] Reconcile Games: +1 ~0 -0
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [INDEXER] Games: +0 new, ~1 updated, 2 total
  [WATCHER] Stopped
  ✔ B6: Games changes go to the games pipeline, never the movie index (1608.6661ms)
✔ B6 — order-independent reconcile (AC2) (11301.97ms)
  [WATCHER] Stopped
▶ P6b D6 — root dot-folders (.trash) are invisible to the watcher
  ✔ a root-level reconcile never (re-)indexes files under .trash; .trash is never watched (1620.179ms)
✔ P6b D6 — root dot-folders (.trash) are invisible to the watcher (1620.5234ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
▶ WebSocket (characterization)
  ▶ hello handshake
    ✔ customer connects and receives hello:ack (49.1103ms)
  [WS] Customer disconnected (remaining: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
    ✔ manager connects with valid token (82.9314ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Invalid/expired token from ::1 — closing
    ✔ manager with invalid token gets hello:error (6.4752ms)
  ✔ hello handshake (143.2192ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Selection updated: 1 movies — broadcast to all clients
  [WS] Customer disconnected (remaining: 0)
  ▶ selection broadcast
    ✔ customer selection is broadcast to manager (66.0155ms)
  ✔ selection broadcast (66.3314ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [ORDERS] Saved 1 orders to disk
  [ORDERS] Created order-0001 with 1 movies
  [WS] Order order-0001 created by admin
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  ▶ orders round trip
    ✔ manager can save and list orders via WS (85.9473ms)
  ✔ orders round trip (86.3309ms)
  [WS] Manager disconnected: admin (total: 0)
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Added: 0005- Fresh 2021.jpg
  [WATCHER] Reconcile Movies\Action: +1 ~0 -0
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  ▶ catalog:changed (B6)
    ✔ hot-added poster broadcasts catalog:changed {added,updated,removed} (618.5202ms)
  ✔ catalog:changed (B6) (619.023ms)
  [WS] WebSocket server closed
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 2 orders to disk
  [ORDERS] Created order-0002 with 1 movies
  [WS] Order order-0002 created by admin
  [ORDERS] Saved 2 orders to disk
  [ORDERS] order-0002 status -> preparing
  [WS] Order order-0002 status -> preparing
  [WS] Manager disconnected: admin (total: 1)
  ▶ P6d E5 - orders workflow via WS
    ✔ status change reaches a second manager client (AC5) (61.8278ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 3 orders to disk
  [ORDERS] Created order-0003 with 1 movies
  [WS] Order order-0003 created by admin
  [WS] Manager disconnected: admin (total: 1)
    ✔ invalid status is refused with a Persian orders:error and broadcasts nothing (366.0432ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 4 orders to disk
  [ORDERS] Created order-0004 with 1 movies
  [WS] Order order-0004 created by admin
  [ORDERS] Saved 4 orders to disk
  [ORDERS] order-0004 info updated
  [WS] Order order-0004 info edited
  [WS] Manager disconnected: admin (total: 1)
    ✔ orders:edit persists customerName/note and broadcasts (E5 fields) (61.5229ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [ORDERS] Saved 5 orders to disk
  [ORDERS] Created order-0005 with 1 movies
  [WS] Order order-0005 created by admin
  [ORDERS] Saved 4 orders to disk
  [ORDERS] Deleted order-0005 (had 1 movies)
  [WS] Order order-0005 deleted by admin
  [ORDERS] Saved 5 orders to disk
  [ORDERS] Restored order-0005 (number 5)
  [WS] Order order-0005 restored
  [WS] Manager disconnected: admin (total: 1)
    ✔ orders:undo restores the deleted order with the same number (AC5) (67.8648ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 2)
  [WS] Manager disconnected: admin (total: 1)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
    ✔ orders:undo for an expired or unknown id answers with orders:error (53.0283ms)
  ✔ P6d E5 - orders workflow via WS (610.9423ms)
✔ WebSocket (characterization) (1634.3845ms)
  [WS] WebSocket server closed
ℹ tests 746
ℹ suites 169
ℹ pass 746
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27695.1223

```

### A.4 `npm run test:ui`

```

> movie-catalog@5.4.0 test:ui
> node scripts/run-tests.js ui

Running 12 test file(s) from test/ui:

  test\ui\add-flow-real.test.js
  test\ui\add-modal.test.js
  test\ui\copy-shortcuts.test.js
  test\ui\dialog-a11y.test.js
  test\ui\edit-modal.test.js
  test\ui\game-manage.test.js
  test\ui\login-modal.test.js
  test\ui\orders-workflow.test.js
  test\ui\p8b-assets.test.js
  test\ui\poster-refresh-real.test.js
  test\ui\trash-panel.test.js
  test\ui\ui.test.js

  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Manager authenticated: admin (total: 1)
  [WS] Customer disconnected (remaining: 0)
  [MOVIE-CREATOR] Backup created: catalog_backup_2026-10-18T21-30-29-516Z.json
  [MOVIE-CREATOR] Movie added: 0002 - Genre Form Probe
  [INDEXER] Saved catalog to disk: 2 movies
▶ P6c E2 - real add flow writes a new genre folder
  ✔ inline genre + create → real folder, I4 filename, live catalog entry (2453.3123ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 2 movies
  [WS] WebSocket server closed
✔ P6c E2 - real add flow writes a new genre folder (15453.2215ms)
▶ P6c E2 - add modal downscale/errors/genre/dup/preview
  ✔ downscales a >4 MB poster before upload: payload cut ≥4×, longest side <= 1400px, size shown (5331.3508ms)
  ✔ filename preview displays the SERVER builder result (ARCH-03, no local copy) (1687.636ms)
  ✔ inline genre creation: new genre becomes a checked checkbox and rides the create request (541.9362ms)
  ✔ probable duplicate (same normalised title + year): warns, does not block (1492.3318ms)
  ✔ duplicate warning can be cancelled: modal stays open, nothing submitted (2094.4483ms)
  ✔ rejects a >30 MB file with a Persian message before any upload (5975.4547ms)
  ✔ rejects a non-image renamed .jpg with a Persian message (394.895ms)
  ✔ every failure cause gets its own distinct Persian toast (400/409/413/network/401) (3052.1753ms)
✔ P6c E2 - add modal downscale/errors/genre/dup/preview (24915.1591ms)
▶ D4 / FE-06 — copy, print and order snapshot use the id-vs-title helper
  ✔ FE-06: Ctrl+Shift+C copies id for Movies, title for Series and Games — no "undefined" (148.4462ms)
  ✔ FE-06: print view is RTL and lists every ref exactly once, never "undefined" (290.7486ms)
  ✔ FE-06: the order snapshot (order detail) shows ids for Movies and titles for Series/Games (100.8583ms)
✔ D4 / FE-06 — copy, print and order snapshot use the id-vs-title helper (16358.3105ms)
▶ D5 / FE-15 — Ctrl+B and shortcuts modal parity
  ✔ FE-15: Ctrl+B toggles the selection panel (open → collapsed → open) (67.8729ms)
  ✔ FE-15: every shortcut advertised in the shortcuts modal actually works (469.2589ms)
✔ D5 / FE-15 — Ctrl+B and shortcuts modal parity (2059.5781ms)
▶ D7 / FE-14 — modal accessibility
  ✔ FE-14a: login dialog — role/aria, focus-in, Tab trap, Escape, focus restore (4170.4723ms)
  ✔ FE-14b: save is gated by confirm modal (not window.confirm); Escape cancels top only (4104.0633ms)
  ✔ FE-14c: movie-detail, shortcuts and diagnostics dialogs expose aria and close on Escape (1418.6986ms)
  ✔ FE-14d: icon-only header buttons carry Persian aria-labels (52.1147ms)
✔ D7 / FE-14 — modal accessibility (17817.5601ms)
▶ P6a E1 - edit modal genres/poster/inline errors
  ✔ renders genre checkboxes + poster input for a Movie; no genre section for Series (1496.5366ms)
  ✔ removing a genre: one confirm naming it, no PUT before confirm, exact patch after (1952.9638ms)
  ✔ adding a genre: checked value included in the PUT patch (1857.5428ms)
  ✔ server 409 ID_TAKEN maps to the inline ID field error; modal stays open (2135.7888ms)
  ✔ unmapped server error code shows the form-level inline alert with the Persian text (1168.8126ms)
  ✔ empty title: inline field error before any confirm or PUT (649.5929ms)
  ✔ P6b E3: server delete failure shows the Persian error toast and keeps the modal open (1254.472ms)
  ✔ P6b E3: delete fires no DELETE before the confirm; second click sends exactly one; card disappears (1076.1175ms)
  ✔ P6b E3: Series also offers delete (uid route supports series) (486.2217ms)
✔ P6a E1 - edit modal genres/poster/inline errors (18904.9762ms)
▶ P6c E4 - games add/edit/delete/restore UI
  ✔ admin panel add button follows the media mode: «افزودن بازی» in games mode (265.0903ms)
  ✔ add modal: game chip shows platforms and hides movie fields; no platform → Persian toast, no POST (1933.8967ms)
  ✔ add modal: a valid game posts to /api/games and appears in the grid (2414.084ms)
  ✔ probable duplicate game: warns with the title, cancel keeps the modal, continue posts (4165.2147ms)
  ✔ edit modal for a game: platform checkboxes, no movie fields, «حذف بازی», PUT carries the game uid (551.95ms)
  ✔ removing a platform: one confirm naming it, no PUT before confirm, exact patch after (1486.2049ms)
  ✔ deleting a game confirms, issues the DELETE, and the card disappears (1007.688ms)
  ✔ restore: game entries toast the game wording and the game returns to the grid (149.7764ms)
✔ P6c E4 - games add/edit/delete/restore UI (17692.5535ms)
▶ P7C-LOGIN-FLAKE - login modal autofocus keeps caller focus
  ✔ keeps focus on #password through the 100ms autofocus timer; typed text lands there (1175.0321ms)
✔ P7C-LOGIN-FLAKE - login modal autofocus keeps caller focus (11203.6316ms)
▶ P6d E5 - orders workflow UI
  ✔ manager header badge shows the live customer selection count (179.6702ms)
  ✔ order cards show a Persian status chip; the status filter narrows the list (140.2504ms)
  ✔ the date filter narrows to one local day (58.8099ms)
  ✔ detail: clicking a status chip sends orders:update-status for that order (126.1622ms)
  ✔ detail: name/note inputs are clamped to 200 chars and sent via orders:edit (164.6111ms)
  ✔ CSV builder: UTF-8 BOM + exact header + Persian data (AC5) (31.3549ms)
  ✔ detail: the CSV button downloads order-N.csv starting with the BOM (966.0597ms)
  ✔ print: the popup is RTL, headed with order number/date, and lists big IDs (AC5) (242.0393ms)
  ✔ delete skips the confirm dialog, shows the 10 s undo toast, and undo calls orders:undo (541.7366ms)
✔ P6d E5 - orders workflow UI (6810.3725ms)
▶ P8b assets — grid thumbnails + bundled font
  ✔ movie-card img carries data-src w=300 and data-srcset "300 1x, 600 2x" (rides ?v) (8.0217ms)
  ✔ lazy-loader promotes srcset before src (loaded cards get real src + srcset) (419.6567ms)
  ✔ Vazirmatn webfont is bundled and active (document.fonts.check) (16.592ms)
  ✔ computed body font-family lists Vazirmatn first (3.7563ms)
  ✔ no request left the stub origin (offline / no-CDN invariant) (1.4987ms)
✔ P8b assets — grid thumbnails + bundled font (3003.0511ms)
  [ORDERS] No existing orders file found, starting fresh
  [WATCHER] Starting filesystem watcher...
  [WATCHER] Watching 3 directories
  [WS] WebSocket server initialized
  [INDEXER] Index cleared
  [INDEXER] Replaced catalog: 1 movies, 1 files indexed
  [INDEXER] Games: +0 new, ~0 updated, 0 total
  [WATCHER] Releasing hold: 2 held dir(s) → 1 root(s)
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer authenticated and connected (total: 1)
  [WATCHER] Updated: 0001- Heat 1995.jpg
  [WATCHER] Reconcile Movies\Action: +0 ~1 -0
  [INDEXER] Saved catalog to disk: 1 movies
▶ P8b follow-up - UI shows a poster replaced in place
  ✔ watcher overwrite → card swaps to the new ?v URL and serves the new bytes (1262.7742ms)
  [WS] New connection from ::1 — state: UNAUTHENTICATED
  [WS] Customer disconnected (remaining: 0)
  [WS] Manager authenticated: admin (total: 1)
  ✔ edit-modal poster replace → card shows the new poster through the real save path (2121.6261ms)
  [WS] Manager disconnected: admin (total: 0)
  [WS] Shutting down WebSocket server...
  [WATCHER] Stopped
  [INDEXER] Saved catalog to disk: 1 movies
  [WS] WebSocket server closed
✔ P8b follow-up - UI shows a poster replaced in place (4759.4205ms)
▶ P6b E3 - admin trash panel
  ✔ lists trash entries newest-first with title, date and file count (10.4521ms)
  ✔ restore posts to /api/trash/:id/restore, removes the row, and the movie returns to the grid (48.277ms)
  ✔ empty trash shows the empty state after the last entry is restored (31.6987ms)
✔ P6b E3 - admin trash panel (1690.815ms)
▶ FE-01 + FE-02 — grid rebuild + socket/worker leak
  ✔ FE-01: selecting one card must not rebuild the grid or lose scroll position (3700.5857ms)
  ✔ FE-02: rescan x3 must keep exactly one WebSocket and not spawn extra Workers (854.7323ms)
✔ FE-01 + FE-02 — grid rebuild + socket/worker leak (5411.3381ms)
▶ SEC-04 + FE-04 — XSS + onerror placeholder
  ✔ SEC-04: markup in title / plotSummary must be rendered as text, never executed (721.4084ms)
  ✔ FE-04: a Series with apostrophe in title must get the placeholder when poster 404s (3.4185ms)
✔ SEC-04 + FE-04 — XSS + onerror placeholder (1605.8686ms)
▶ SEC-04b — double-escaping: special chars rendered as text, not HTML entities
  ✔ SEC-04b: title with quotes, ampersand, angle brackets must display as literal text (743.5474ms)
✔ SEC-04b — double-escaping: special chars rendered as text, not HTML entities (1455.8275ms)
P3F typeReport: {
  "Movie": {
    "found": true,
    "text": "\n      \n        \n        دوبله فارسی\n        \n        \n          🎬\n          Tom\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Tom & Jerry's \"Greatest\" 2001\n        #0001\n        \n          دوبله فارسی\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Animation": {
    "found": true,
    "text": "\n      \n        \n        انیمیشن دوبله\n        \n        \n          🎬\n          Toy\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Toy <Story> & \"More\" 1995\n        #00002\n        \n          Animation\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Iranian": {
    "found": true,
    "text": "\n      \n        \n        \n        \n        \n          🎬\n          ایرانی\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        ایرانی & Test \"Quote\" 2020\n        #0003\n        \n          عاشقانه\n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  },
  "Series": {
    "found": true,
    "text": "\n      \n        \n        سریال\n        \n        \n          🎬\n          Series\n        \n        \n          \n      \n        انتخاب\n      \n    \n        \n      \n      \n      \n        Series \"Test\" & <Tag>\n        \n        \n          \n        \n      \n    \n    ",
    "literalIdBadge": false,
    "literalDiv": false,
    "doubleEscQuote": false,
    "doubleEscLt": false
  }
}
▶ P3F-ESC — no literal tags / double-escaped entities in rendered UI
  ✔ P3F-ESC-1: grid cards show no literal <div>/<span> badge markup (report per type) (12.9623ms)
  ✔ P3F-ESC-2: movie-detail meta/actions show no literal nested html (1036.1621ms)
  ✔ P3F-ESC-3: selection sidebar items show no literal nested html (827.1923ms)
  ✔ P3F-ESC-4: diagnostics panel shows no literal <div style> / double-escaped quotes (1525.1445ms)
✔ P3F-ESC — no literal tags / double-escaped entities in rendered UI (4159.9547ms)
▶ P3G — order view posters are fixed-size thumbnails
  ✔ P3G: order-detail poster renders ≤ thumbnail size and view stays on screen (1111.4636ms)
✔ P3G — order view posters are fixed-size thumbnails (2579.4887ms)
▶ CSP-SAN — zero CSP violations during full app walkthrough
  ✔ CSP-SAN: customer + admin walkthrough — zero CSP violations / pageerrors / console errors (4806.7623ms)
✔ CSP-SAN — zero CSP violations during full app walkthrough (5741.8671ms)
▶ FE-08 — 401 drops admin to customer with toast and login modal
  ✔ FE-08: admin session + 401 → customer mode, Persian toast, login modal visible (1646.3956ms)
✔ FE-08 — 401 drops admin to customer with toast and login modal (1835.0281ms)
▶ P3H — confirm modal keeps baseline animation and message white-space
  ✔ P3H: confirm-dialog animates with modalIn and preserves message newlines (570.5212ms)
✔ P3H — confirm modal keeps baseline animation and message white-space (944.9156ms)
▶ P3I - Series edit modal (FE-05)
  ✔ P3I: Series edit hides ID field, saves via PUT by-uid, movie identified by new title (1284.1145ms)
  ✔ P3I: Movie edit still shows required ID field (regression guard) (410.4858ms)
✔ P3I - Series edit modal (FE-05) (3163.1173ms)
▶ P4 — listener & subscription hygiene
  ✔ P4-C8: mount/unmount grid 100× returns subscriber count and document listeners to baseline (902.5374ms)
✔ P4 — listener & subscription hygiene (1588.9452ms)
▶ P4 — role change flips every visible card select→edit
  ✔ P4-C4: every visible card switches select→edit on admin login; edit opens the right movie (1550.1178ms)
✔ P4 — role change flips every visible card select→edit (1932.3281ms)
▶ P5a - Persian search normalisation (FE-07)
  ✔ P5a: Arabic-typed and Persian-typed کمدی queries each find both stored forms (1533.0279ms)
  ✔ P5a: ۲۰۲۰ finds year 2020; سریال finds Series; null finds nothing (2519.1447ms)
  ✔ P5a: movie:updated / movie:added keep the search index fresh (hot patch) (2711.5493ms)
✔ P5a - Persian search normalisation (FE-07) (7131.4374ms)
▶ P4 — AC5 catalog:changed refreshes grid without losing scroll
  ✔ P4-AC5: catalog:changed reloads within 1s and keeps scrollTop when list unchanged (2143.1261ms)
✔ P4 — AC5 catalog:changed refreshes grid without losing scroll (2544.8135ms)
▶ P4 — AC4 customer selection survives server restart
  ✔ P4-AC4: after restart (new bootId) with empty server selection, client re-sends local selection (455.7686ms)
✔ P4 — AC4 customer selection survives server restart (1404.6148ms)
ℹ tests 77
ℹ suites 26
ℹ pass 77
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61378.171
Separate invocation: perf budgets in their own process (P4-C5 isolation):

Running 1 test file(s) from test/ui:

  test\ui\perf.test.js

P4-C5 metrics: {"firstPaintFullMs":315,"loadCatalogToPaintMs":118,"selectMs":11,"longTasks":[],"searchMs":260,"cards":40}
P5a search processing: {"filterMs":4.1,"toFrameMs":13.8,"matched":369}
▶ P4-C5 — 20k performance budgets
  ✔ P4-C5: first grid paint ≤ 300ms; select ≤ 50ms; scroll no long task >100ms; search ≤ 50ms (1675.2511ms)
✔ P4-C5 — 20k performance budgets (1892.8991ms)
ℹ tests 1
ℹ suites 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2265.275

```

### A.5 `npm audit --omit=dev`

```
found 0 vulnerabilities

```

### A.6 `npm start` (empty-Library clone) — stdout

```

> movie-catalog@5.4.0 start
> node server.js


  [CONFIG WARN] LIBRARY_MISSING
    Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
    پوشهٔ کتابخانه پیدا نشد: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
    Create it with this structure (see README.md), or fix "libraryPath" in config.json:
    این ساختار را بسازید (توضیحات در README.md)، یا "libraryPath" را در config.json درست کنید:
      Library/Movies/Action/0042- The Matrix 1999.jpg
      Library/Animation/0012-Cars.jpg
      Library/Series/Breaking Bad.jpg
      Library/Games/PS4/Ghost Rider.jpg
    The server keeps running with an empty catalog. / سرور با کتابخانهٔ خالی ادامه می‌دهد.
  [ORDERS] No existing orders file found, starting fresh

  ╔════════════════════════════════════════╗
  ║      MovieCatalog Server v5.4.0      ║
  ╚════════════════════════════════════════╝

  → Auth setup: first-run (setup required)
  → Step 1: Loading cached catalog...
  → No catalog cache — scanning Library/ in the background...
  → Step 2: Starting filesystem watcher...
  [WATCHER] Starting filesystem watcher...
  → Step 3: Starting WebSocket server...
  [WS] WebSocket server initialized
  → Step 4: Initializing Movie Creator...

  → Total movies: 0
  → Total games: 0
  → Total orders: 0
  → Genres: 0 ()

  → Local: http://localhost:3000
  → WebSocket: ws://localhost:3000

  Ready. Add movies to Library/ and refresh the browser.

  → Scanning library...
             Path: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
             Found 0 image files, parsed 0 movies
             Found 0 games
  → Event-loop lag: max 29.5 ms (histogram max 0 ms)
  → Reconcile phases: scan-movies 2ms → scan-games 4ms
  → Phase sync-chunk max: startup 29.5ms

```

### A.7 `npm start` (empty-Library clone) — stderr

```

  [WARN] Library folder not found!
         Expected: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library

  Create it like this (see README.md for the naming rules):
    Library/
      Movies/
        Action/
          0042- The Matrix 1999.jpg
      Animation/
        0012-Cars.jpg
      Series/
        Breaking Bad.jpg
      Games/
        PS4/
          Ghost Rider.jpg

  [WATCHER] Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
  [SCANNER] Library folder not found: C:\Users\Ali\AppData\Local\Temp\opencode\p9a-cleanroom\Library
  [WARN] Background reconcile failed: library root unreadable before swap (ENOENT) — keeping cached catalog

```

### A.8 P9a-2 correction-round raw outputs

**npm live audit** — `npm ping` → `PONG 2003ms` (registry
`https://registry.npmjs.org/`); `npm audit --omit=dev --json`
(exit 0, saved `npm-audit-live.json`):

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 },
    "dependencies": { "prod": 70, "dev": 92, "optional": 32, "peer": 0, "peerOptional": 0, "total": 193 }
  }
}
```

**Clean-clone `npm ci`** — `added 166 packages in 3s` + 1 deprecation warn
(eslint@9.39.5, devDep). **Baseline worktree `npm ci`** (@ `39e2a4b`) —
`added 71 packages in 6s`.

**Baseline todo-test AssertionErrors** — the 31 `# todo` tests at `39e2a4b`
print their real failure diagnostics inside `npm test` (exit 0, 194/163
pass/31 todo). Per-ID quoted table is in §S2.5(a). Full log:
`%TEMP%\opencode\p9a-audit-logs\baseline-npm-test.txt` (64 686 B); the
31 failing-tests blocks were also lifted to
`baseline-todo-failures.txt` (58 397 B).

**Live baseline server probes** (worktree @ `39e2a4b`, port 3999/3998, temp
`LIBRARY_PATH`/`DATA_DIR`; scripts `baseline-probes.ps1` /
`baseline-probe-data10.ps1`):

```
SEC-01  GET /server/auth/auth.js   -> 200, ACAO *, serves the auth source
SEC-05  POST /api/auth/login admin/123456 -> 200, {"success":true,"token":"5c8f…"}
SEC-07  GET /api/movies (Origin: http://evil.example) -> ACAO: *
SEC-08  same body -> "absolutePosterPath":"C:\\…\\0001- Heat 1995.jpg"
FE-12   GET /api/movies -> no Cache-Control header (static routes only)
FE-13   POST /api/movies/preview, 200 KB JSON body -> 413 (express.json 100 KB default, HTML err)
ARCH-01 /api/movies -> "meta":{"version":"3.0",…}
DATA-10 login -> PUT /api/movies/0001 (imdbRating 8.3) -> stop -> rm data/catalog.json
        -> cold restart -> GET /api/movies -> imdbRating='' plotSummary=''
        => DATA-10 CONFIRMED: metadata lost after cache delete + cold restart
```

(An earlier DATA-10 attempt hit `Cannot PUT /api/movies/by-uid/0001` because
the baseline predates the by-uid route; the `/api/movies/:id` probe above is
the one that reproduces the defect.)

**S3 extraction/classification** — `extract-s3.ps1` + `classify-s3.ps1`
against the 37 `mimo/PHASE-REPORT-*.md` files: 360 extracted lines =
38 artifacts + 322 content (A38 / Q93 / R52 / C106 / D71). Raw TSVs:
`s3-bullets.tsv` (62 450 B), `s3-classified.tsv` (54 042 B),
`s3-inventory.txt` (60 382 B) in the audit-logs temp dir.

---

## P9-R — CANARY CALIBRATION REPRODUCTION vs `audit/final` HEAD (2026-10-21)

The P9-C canary findings (CAN-01..CAN-05 in `C:\Temp\canary-audit.md`, found in a
single-commit snapshot repo) were re-checked against the REAL tree at
`a6641fb` (branch `audit/final`). Method, per canary:

- **Fresh clean clone** of `audit/final` HEAD into `%TEMP%\opencode\p9r\CAN-0N\repo`
  (verified: HEAD `a6641fb`, `git status` empty, no `data/`, `Library/`, `logs/`,
  `node_modules/`, `config.json`), then `npm ci` (166 packages each).
- The **same probe** adapted by changing only the repo path it points at
  (probe1 → CAN-01/02/03, probe2 → CAN-04); probe data lives in `mkdtemp` dirs.
  CAN-05's canary had no script (code inspection), so an equivalent behavioural
  probe (`probe5.js`) imports the clone's `js/utils/sort.js` directly.
- The real repo's `data/`, `Library/`, `logs/` were **never touched**; no source
  file was modified; `C:\Temp\canary-key.txt` was not read.
- Raw outputs: `%TEMP%\opencode\p9r\CAN-0N\probe1-out.txt` / console transcripts,
  `probe1-results.json` (CAN-01..03), probe2/probe5 console (CAN-04/05).

**Verdicts: CAN-01 REPRODUCES · CAN-02 REPRODUCES · CAN-03 REPRODUCES ·
CAN-04 REPRODUCES (one canary overstatement corrected) · CAN-05 DOES NOT
REPRODUCE.** Line-number drift between the canary citations and the real tree
is ≤ 2 lines everywhere except `sort.js` (see CAN-05 — the real tree has extra
code the canary lacked).

### CAN-01 — REPRODUCES → F28 (HIGH). 100 KB guard blocks `POST /api/games` normal posters

Real-tree source (guard; canary cited `server.js:704-712`, real tree is 705-713):

```js
// server.js:701-713
// Enforce 100 KB body limit on non-upload routes (SEC-06 / FE-13).
// Exempt: POST /api/movies (create) and PUT /api/movies/* (edit routes —
// P6a E1 may carry an optional base64 poster in the same request, Q1).
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/movies') return next();
  if (req.method === 'PUT' && req.path.startsWith('/api/movies/')) return next();
  const cl = parseInt(req.headers['content-length'], 10);
  if (!isNaN(cl) && cl > 102400) {
    return res.status(413).json({ success: false, error: 'Request body too large' });
  }
  next();
});
```

Games route, same payload shape, 8 MB decoded, **no exemption**
(`server.js:1239-1258`: comment "same payload shape as POST /api/movies";
`decodePosterPayload` at 1253). Client pipeline confirms normal posters exceed
100 KB: `js/components/add-modal.js:32-33` (`DOWNSCALE_MAX_SIDE = 1400`,
`DOWNSCALE_QUALITY = 0.85`), `:348` (`canvas.toDataURL(mime, …)`), `:632`
(game branch posts to `/api/games`).

Raw output (CAN-01 clone, probe1):

```
### P1a POST /api/games poster=300KB
{ "status": 413, "json": { "success": false, "error": "Request body too large" } }
### P1b POST /api/games poster=20KB (control)  → status 200
### P2  POST /api/movies poster=300KB (exempt control) → status 200
```

**F28 — HIGH: `POST /api/games` 413s every normal-size game poster (guard exempts only the movie routes).**
- Where: `server.js:705-713` (guard) vs `server.js:1241-1268` (games route); client `js/components/add-modal.js:32-33,348,632`.
- Repro: fresh clone of `a6641fb`, probe1 — `POST /api/games {poster: 300 KB JPEG data-URL}` + admin token → `413 {"success":false,"error":"Request body too large"}` (English, no `code` — breaks the FE-13 structured-code contract on this path); 20 KB poster → 200; 300 KB `POST /api/movies` → 200.
- Severity re-grade (real project POV): **HIGH** — answers the calibration question directly: **no, the owner usually cannot add a game with a normal poster.** The shipped UI downscales to 1400 px / q0.85, which for typical cover art is 150-400 KB JPEG (~200-530 KB base64) — well over the 100 KB guard. The advertised P6c games feature fails through its own UI with an unmapped English 413; only posters that compress to < ~75 KB raw get through. Mitigations: admin-only route, LAN-only, no data corruption.
- Fix: add `if (req.method === 'POST' && req.path === '/api/games') return next();` next to the exemptions at `server.js:706-707`, plus a test with a >100 KB game poster; optionally give the raw 413 a `code` + Persian message.

### CAN-02 — REPRODUCES → F29 (MEDIUM). String `genres` on create → single-char folders in `Library/`

Real-tree source — validation only runs for arrays (canary cited `server.js:786-797`):

```js
// server.js:787-798  (validateMovieInput)
// genres: array of strings, each ≤ 60 chars
if (Array.isArray(b.genres)) { ... }   // non-array falls through unvalidated
```

Creator then iterates it character-by-character (canary cited `movie-creator.js:243-247, 290-301`; real tree 290-302):

```js
// backend/services/movie-creator.js:243-247 — a string passes ("Action".length === 6)
if (movieData.type === 'Movie') {
  if (!movieData.genres || movieData.genres.length === 0) {
    throw fail('GENRE_REQUIRED', 400, 'حداقل یک ژانر برای فیلم الزامی است');
  }
}
// backend/services/movie-creator.js:295-301 — for…of over a string = chars
for (const genre of genres) {
  safeSegment(genre, 'ژانر');                       // single chars pass
  folders.push(resolveInside(this._libraryPath, 'Movies', genre));
}
```

Editor contrast (`backend/services/movie-editor.js:171-173`): `if (!Array.isArray(patch.genres)) throw fail('GENRE_INVALID', 400, …)`.

Raw output (CAN-02 clone, probe1):

```
### P3a POST /api/movies genres="Action" (string)
{ "status": 200, "movie": { "id": "0003", "genres": ["A","c","i","n","o","t"] } }
  "libraryTree": [ "A/", "0003- Genres String 2001.jpg", "Action/", "0001- Heat 1995.jpg",
                   "c/", "…", "i/", "…", "n/", "…", "o/", "…", "t/", "…" ]   (poster copied into each)
  "genresInCatalog": ["Action","A","c","i","n","o","t"]
### P3b genres=["Action"] (control) → 200
### P3c PUT /api/movies/0001 genres="Action" (control) → 400 {"code":"GENRE_INVALID"}
```

**F29 — MEDIUM: `POST /api/movies` accepts a string `genres` and writes single-character genre folders + duplicate posters into `Library/`.**
- Where: `server.js:787-798` (validation skipped for non-arrays) + `backend/services/movie-creator.js:243-247, 295-301`; contrast `backend/services/movie-editor.js:171-173`.
- Repro: fresh clone, probe1 — `POST /api/movies {type:'Movie', year:2001, genres:'Action', poster:<4 KB>}` → `200`, catalog genres become `A,c,i,n,o,t` (+`Action` from the seed), and `Library/Movies/` gains `A/ c/ i/ n/ o/ t/`, each holding a full copy of the poster. `PUT` with the same string → `400 GENRE_INVALID`.
- Severity re-grade: **MEDIUM** (unchanged). The shipped UI always sends arrays (`add-modal` builds a checkbox list), so this needs a raw API call — but the API is LAN-reachable without special tooling, and the damage is **permanent junk in the real `Library/`** (folders + duplicated poster files) plus junk genre chips in the customer filter UI. With duplicate characters (e.g. `"Anna"`) the second `wx` write fails EEXIST mid-creation → rollback deletes the files but leaves the empty folders.
- Fix: in `validateMovieInput`, reject `b.genres !== undefined && !Array.isArray(b.genres)` with `400 GENRE_INVALID` + Persian message; belt-and-braces in `MovieCreator._validateInputs` (`if (!Array.isArray(movieData.genres)) throw fail('GENRE_INVALID', …)`).

### CAN-03 — REPRODUCES → F30 (LOW). Logout without a body token returns 200 and keeps the session

Real-tree source (canary cited `server.js:882-889`; real tree 883-890):

```js
// server.js:883-890
app.post('/api/auth/logout', requireAdmin, (req, res) => {
  const token = req.body && req.body.token;   // ← header token never used
  if (token) {
    invalidateSession(token);
    log('  [AUTH] Admin logged out');
  }
  res.json({ success: true });
});
```

`requireAdmin` authenticated the request from `Authorization: Bearer`; invalidation reads only the body. Client always sends the body token (`js/store.js:544`), so UI logout works.

Raw output (CAN-03 clone, probe1 P5):

```
"login": 200,
"logoutNoBody": { "status": 200, "json": { "success": true } },
"diagAfterLogoutWithoutBodyToken": 200,     ← session still valid after logout
"logoutWithBody": { "status": 200 },
"diagAfterLogoutWithBodyToken": 401         ← only the body-token path invalidates
```

**F30 — LOW: `POST /api/auth/logout` with header-only auth returns 200 without invalidating the session.**
- Where: `server.js:883-890`.
- Repro: fresh clone, probe1 — login → `POST /api/auth/logout` with only the `Authorization` header → `200 {success:true}` → `GET /api/diagnostics` with the same token → `200`; logout again with `{token}` body → next request `401`.
- Severity re-grade: **LOW** (unchanged). The shipped client always sends the body token (`js/store.js:544`), sessions are 24 h, LAN-only; only raw API consumers are affected — but the route *reports success while doing nothing*, which is its own contract bug, and the still-open WS manager role rides on the session.
- Fix: `const token = (req.body && req.body.token) || (String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i) || [])[1];`

### CAN-04 — REPRODUCES → F31 (MEDIUM). Games catalog merge-only: rescans keep ghosts and dead served paths

Real-tree source (canary cited `indexer.js:900-942`; identical here):

```js
// backend/indexer.js:900-942 — processGameResults: merge-only
if (this._gamesMap.has(key)) {
  const game = this._gamesMap.get(key);
  for (const p of result.platforms) {
    if (!game.platforms.includes(p)) game.platforms.push(p);   // platforms only grow
  }
  game.platforms.sort();
  // Refresh mtime only for the copy that is actually served
  if (result.posterPath === game.absolutePosterPath && Number.isFinite(result.lastModified)) {
    game.mtime = result.lastModified;                          // served path never repoints
    game.poster = gamePosterUrl(key, game.mtime);
  }
  updated++;
}   // ← no branch ever deletes an entry or drops a dead platform/path
```

Rescan asymmetry: `server.js:1327-1333` (`POST /api/games/rescan` → `indexer.processGameResults(results)` directly) vs `server.js:1020-1021` (movie rescan → `indexer.replaceFromScan(results)` full replace).

Raw output (CAN-04 clone, probe2):

```
after first scan: [ 'game:ghost game' ]
rescan stats: { added: 0, updated: 0, total: 1 }
games after rescan of EMPTY disk: [ 'game:ghost game' ]
dual absolutePosterPath: C:/lib/Games/PS5/Dual Game.jpg mtime: 1   ← PS5 path kept after PS5 deleted
VERDICT: ghost-after-empty-rescan = true
```

**Canary correction (found in the real tree):** the watcher **can** remove ghost games — `backend/watcher.js:658-665` (`_reconcileGames`) iterates `_gamesMap` and calls `removeGame` for keys not seen on disk. The canary's "the watcher can't help" overstates the removal case. The staleness that *no* path heals (except restart) is the served-copy one: platforms only grow (`indexer.js:910-914`) and `absolutePosterPath` never repoints (`:916-920`), so a deleted PS5 copy keeps being advertised and served after every rescan *and* every watcher reconcile. Games are not cached (`backend/services/game-creator.js:21`, `game-editor.js:23`; `_gamesMap` starts empty at `indexer.js:215`), so restart is the only self-heal for that case.

**F31 — MEDIUM: games catalog never reconciles on rescan — ghost games after empty rescan, dead served poster path + phantom platform until restart.**
- Where: `backend/indexer.js:900-942` (merge-only) + `server.js:1327-1333` (`games/rescan`); contrast `server.js:1020-1021` (`replaceFromScan`). Watcher mitigation `backend/watcher.js:658-665`.
- Repro: fresh clone, probe2 — index `Ghost Game`, rescan against an empty disk → game still listed (`total: 1`, `ghost-after-empty-rescan = true`); for a dual-platform game served from `Games/PS5/`, deleting the PS5 copy and rescanning leaves `absolutePosterPath` on the deleted PS5 file and `platforms: ['PS4','PS5']` — `GET /api/game-poster/:title` then 404s while a good PS4 copy exists on disk.
- Severity re-grade: **MEDIUM** (kept, but the impact window is narrower than the canary claimed — see correction). Customer-visible: a game whose poster is broken (404) and which advertises a platform that no longer exists, until the server restarts; the admin's explicit "rescan games" — the API whose whole job is "make the catalog match disk" — can never fix it (I1 violated for games; the watcher heals removals but not stale paths/platforms).
- Fix: give `CatalogIndexer` a games `replaceFromScan` twin (rebuild `_gamesMap` from the fresh `scanGames()` result, same P8c generator pattern as movies) and use it in `POST /api/games/rescan` and the full `/api/rescan`; keep I8 platform **merging** inside creator/editor commit paths only. Minimum viable: on rescan, drop games with no surviving file and repoint `absolutePosterPath`/drop dead platforms to a surviving copy.

### CAN-05 — DOES NOT REPRODUCE (real tree already strips Persian articles)

The canary claimed `js/utils/sort.js:33-40` promises "English and Persian variants" while `:45-51` strips only `^(the|a|an)\s+`. In the real tree the Persian strip **is present**:

```js
// js/utils/sort.js:36
// - Strips leading articles: The, A, An (English and Persian variants)
// js/utils/sort.js:45-53
function normalizedSeriesTitle(title) {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  // Strip leading articles (English)
  t = t.replace(/^(the|a|an)\s+/i, '');
  // Strip leading articles (Persian)
  t = t.replace(/^(یک|آن)\s+/i, '');     // ← absent from the canary snapshot
  return t.trim();
}
```

Raw output (CAN-05 clone, probe5 — dynamic `import()` of the clone's `sort.js`):

```
STRIPPED       in="The Boys" got="boys" (English article (doc example))
STRIPPED       in="A Quiet Place" got="quiet place"
STRIPPED       in="An Education" got="education"
STRIPPED       in="Breaking Bad" got="breaking bad"
STRIPPED       in="یک پرواز" got="پرواز" (Persian article یک)
STRIPPED       in="آن روزها" got="روزها" (Persian article آن)
STRIPPED       in="یک  دوبل فاصله" got="دوبل فاصله"
```

No finding: comment and code agree at `a6641fb`; the canary snapshot's `sort.js` evidently predated (or was altered from) this code. Residual note (not filed): `test/unit/sort.test.js:124-129` asserts English articles only — the Persian strip has no test pinning it.

### P9-R answer — why P9a missed the reproducible ones

P9a's lens was the **defect register**: 47 known IDs walked against their phase reports, closures verified with the existing suite plus lifecycle probes. CAN-01..CAN-04 are **sibling-asymmetry** defects: two code paths that were written at different times for different features and never compared. Each half is individually correct, individually tested, and matches its own spec — the bug only exists in the *difference* (movies exempt from the 100 KB guard, games not; editor rejects string genres, creator doesn't; logout reads the body, auth reads the header; movie rescan replaces, games rescan merges). The suite mirrors the shipped UI's payload shapes — tiny posters, array genres, body-token logout, no file deletion between game rescans — so the suite is structurally blind to exactly these gaps (each canary's own "why suite stayed green" says the same). P9a also reviewed `server.js` route-by-route rather than pair-by-pair, and its REVIEWED list ends at the same single-path lens; the cross-route comparison (POST /api/games vs POST /api/movies middleware exposure) is the step that was missing. CAN-05 shows the flip side: the canary snapshot itself drifted from the real tree, which is why every finding here was re-verified against the real source before filing.

### P9-R answer — sibling-asymmetry risk in the NOT-REVIEWED areas, and where to look first

- **WS layer first** (`server/realtime/ws-server.js`, `server/auth/role-provider.js`) — largest unreviewed surface, and its structure is the same breeding ground: per-message-type handlers written at different phases (selection:update vs selection:save/clear vs orders:*). Look at: (a) **validation parity** — does `selection:update` validate the payload shape as strictly as `orders:save` (uid validity `^\d{1,6}$`/`series:`, array-ness, size caps), or do some handlers trust the payload the REST route already validated? (b) **credential provenance** — CAN-03's pattern: role from `hello`, actions from the socket; check every manager command re-checks the live session instead of a cached role, and that `orders:*` and `selection:*` gates were not added in different phases; (c) **broadcast parity** — every mutation broadcasts a symmetric event (`movie:updated` for movies; is there a game equivalent, or do game mutations ride `catalog:changed` only?); (d) error-path symmetry (`selection:error` vs `error` mapping, and whether all handlers wrap failures the same way); (e) rate/size limits applied to some message types but not siblings.
- **watcher.js second** — it already hosts one live asymmetry (movies = index-diff reconcile, games = full diff, `:658-665`). Look at: manual-recursion coverage per top-level folder (Movies vs Animation vs Series vs Games — a folder type added later without a watch registration would silently no-op), the debounce/hold path for games (CAN-04 showed `processGameResults` events there), and mtime-only-when-served refresh (`indexer.js:917`) — the same "served copy" trap.
- **scanner/parser** — check `scanGames` and `scanLibrary` enforce the **same** extension allow-list, case-insensitivity and traversal guards (I3/I4 lists four naming conventions; each was implemented separately — a convention updated in one classifier but not its sibling, e.g. `Serries/` handling, would look exactly like CAN-01/02).
- **config/logger** — bilingual message pairing (every user-visible warn needs both languages; the S1.7 startup block shows the intended pairs — any warn added later with only one language is the sibling bug), and logger-disabled vs DEBUG paths behaving differently on failure.
- **client components** — the movie/game branches inside shared modals (`add-modal.js` posts to two endpoints with one pipeline; CAN-01's client half lives there — check the game branch's preview/validation parity: `/api/movies/preview` has no games twin), and duplicated state logic between `admin-panel` and `order-*` components.

*P9-R constraints honoured: five fresh clones of `audit/final` @ `a6641fb` in `%TEMP%\opencode\p9r\`, temp-only data dirs, real `Library/`/`data/`/`logs/` untouched, no source/test/config modified, `C:\Temp\canary-key.txt` not read; this commit changes only docs/audit/AUDIT.md.*

*End of audit doc.*

