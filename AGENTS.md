# AGENTS.md — Offline Movie Catalog (baseline v5.4.0)

Standing brief for every session. **Read it completely before touching code.** Companion files: `mimo/DEFECT-REGISTER.md` (what is broken), `mimo/DECISIONS.md` (owner decisions D1–D9), `mimo/prompts/P*.md` (one phase per session), `mimo/repro/*` (executable bug reproductions).

---

## 1. What this product is
A **LAN-only, offline** web app for a Persian-speaking video / game store. The shop keeps *poster image files* in a `Library/` folder; the app scans them, builds a searchable catalog, and serves it to browsers on the local network.

Two roles use the same page:
- **Customer** (kiosk or phone): browses posters, filters by genre/type, ticks titles → a live "selected" list.
- **Manager** (logged in, another screen): sees the customer's selection **in real time**, copies/prints the IDs (inferred from the code: staff use IDs to locate the real media), saves the selection as an **order**, edits movie metadata, adds movies (with poster upload), views diagnostics.

The app manages **posters + metadata only** — it never plays or streams video.
Also supports a **Games** catalog (PS4 / PS5 posters) toggled by the header switch.
UI language: **Persian, RTL**. Dark/light themes; a "gaming" accent theme when in Games mode.

## 2. Hard constraints
- Must work **offline** and on the **LAN**: no CDN, no external fonts/scripts, no runtime network calls, no telemetry.
- **Windows-first** (owner runs `Start.bat`); must also run on Linux/macOS. Use `path`, never hard-coded separators. Filesystem is case-insensitive on Windows; filenames may be Persian (Unicode), may contain spaces.
- **Zero-build front-end**: vanilla ES modules + Web Components (light DOM, no Shadow DOM), plain CSS with design tokens in `css/themes.css`. Do not introduce a bundler, framework or TypeScript compile step.
- Back-end: Node (`>=18`, D8), CommonJS, Express 4, `ws` 8. Runtime dependencies are limited to `express` and `ws` (D9); `sharp` is an **optionalDependency** (poster thumbnails, D4 — app runs identically without it).
- All user-visible strings are **Persian**. Do not translate or reword existing strings. New strings: Persian. Code, comments, logs, commit messages: English.

## 3. Repository map
```
server.js                    entry: builds Express + HTTP server, REST routes, startup sequence, shutdown
backend/
  constants.js               MOVIE_TYPES, PROTOCOL_VERSION, limits, image magic signatures
  parser.js                  filename → {id,title,year}; classifyFromPath(); TYPE_MAP; cleanTitle(); RELEASE_TAGS
  scanner.js                 scanLibrary() (movies) / scanGames(); recursive walk of Library/
  indexer.js                 CatalogIndexer: in-memory Map + data/catalog.json cache, backups, uid/poster URL
  watcher.js                 LibraryWatcher: fs.watch per directory (manual recursion), 500 ms debounce
  thumbs.js                  WebP poster thumbnails (optional sharp; data/thumbs cache, ?w=300|600)
  payload-cache.js           ETag/gzip payload caching with 304 support for /api/movies and /api/games
  diagnostics.js             admin health report
  services/movie-creator.js  atomic-ish "add movie" (writes poster copies into genre folders)
  services/movie-editor.js   atomic movie/series rename & poster update with rollback
  services/movie-trash.js    soft delete to Library/.trash, restore, and manifest logging
  services/game-creator.js   create game poster under Games/{PS4,PS5}/
  services/game-editor.js    update game title, platforms, and poster with rollback
  storage/atomic-json.js     atomic JSON file writes with tempfile swap & fsync
  storage/metadata-store.js  manager metadata (rating, plot) persistence in data/metadata.json
  utils/
    game-key.js              canonical Game-title normalisation helper
    series-key.js            canonical Series-title normalisation helper
    metadata-key.js          canonical metadata store key helper
    validate-input.js        shared request field validation
    safe-path.js             path traversal prevention & resolveInside
    filename.js              movie/game filename builders and parsers
server/
  config.js                  resolveConfig: env > config.json > defaults (port, libraryPath, dataDir); bilingual messages; unusable config.json → exit 2, supervisor does not restart
  logger.js                  logs/app-YYYYMMDD.log (7-day rotation), request lines, FATAL hooks (installFatalHandlers); disabled by default
  stop-file.js               Stop.bat stop-file watch: stale file removed at arm, 1 s unref'd poll → graceful exit 0
  backup/backup-manager.js   data/backups rotation for catalog, orders, metadata, auth
  auth/auth.js               credentials, in-memory sessions (24 h), PBKDF2, quarantine corrupt auth.json
  auth/role-provider.js      WS role validation
  orders/order-manager.js    data/orders.json persistence, soft delete, status transitions
  realtime/ws-server.js      WebSocket server, roles, heartbeat ping/pong, rate limits, shared selection, broadcasts
js/
  app.js                     <app-root> shell, header, role/theme/media-mode handling, shortcuts
  store.js                   central reactive store (state, filters, selection, admin session, sync wiring)
  realtime/connection.js     raw WS + reconnect/backoff      realtime/sync-client.js  message ↔ callbacks (singleton)
  components/*.js            Web Components (grid, card, detail, sidebars, admin-panel, order-*, modals…)
  utils/{helpers,sort,lazy-loader,text,search,dialog}.js   (dialog.js = shared modal focus trap/restore, D7)
css/{themes,main,components,modals,admin,print,mobile}.css     index.html
assets/fonts/              bundled Vazirmatn variable woff2 + OFL.txt (G5, served at /assets/)
scripts/{run-tests.js,print-urls.js,supervisor.js,make-fixture-library.js}  test runner · LAN URL printer · restart loop · fixture library
Start.bat  Stop.bat  install.bat                                Windows launchers (CRLF; Stop.bat → logs/stop.request → graceful exit 0)
data/                        RUNTIME (git-ignored): catalog.json, orders.json, metadata.json, backups/
logs/                        RUNTIME (git-ignored): app-YYYYMMDD.log, stop.request (G3)
Library/                     RUNTIME (git-ignored): the poster files — NEVER touch the real one
```

## 4. Domain model & invariants (do not break)
- **I1** The filesystem is the source of truth for *which* titles exist. `data/catalog.json` is a rebuildable cache; manager-entered `imdbRating`/`plotSummary` live in `data/metadata.json` (metadata-store — DATA-10 closed in P2).
- **I2** IDs are **strings**; leading zeros are meaningful (`0012` ≠ `12`). Never `parseInt` for identity. Valid ID: `^\d{1,6}$`.
- **I3** Type comes from the top-level folder (case-insensitive): `Movies/{Genre}/` → `Movie` (genre = the immediate sub-folder), `Animation/` → `Animation`, `Iranian/` → `Iranian`, `Series/` or `Serries/` → `Series`, `Games/{PS4|PS5}/` → `Game` (separate pipeline).
- **I4** Filename convention: Movie `{ID}- {Title} {Year}.ext` · Animation/Iranian `{ID}-{Title}.ext` · Series and Game `{Title}.ext`. Extensions: jpg jpeg png webp avif.
- **I5** Series have **no ID**; identity is the normalised title (trim, collapse spaces, lower-case).
- **I6** `uid`: Movie/Animation/Iranian → the id string; Series → `series:<normalised title>`; Game → `game:<normalised title>`. `uid` is what selections, orders and `localStorage` store.
- **I7** A Movie in several genres = the **same poster file copied into several genre folders**; copies merge by ID and their genres are unioned.
- **I8** Games: title only; platforms merged across `PS4/` and `PS5/` copies of the same title.
- **I9** Selection is a **single shared server-side state** (D1). The server is the source of truth; managers are observers plus commands.
- **I10** The server writes only inside `Library/` (posters) and `data/`. Every path built from user input must be validated and resolved inside its root.
- **I11** Type-specific sort rules are intentional (`js/utils/sort.js`): Movie & Animation → year DESC then ID DESC; Iranian → ID DESC (year ignored); Series → alphabetical ignoring leading articles («یک » and «آن » in Persian, "The ", "A ", "An " in English); "All" view groups Movie → Iranian → Animation → Series. Genre order pins `دوبله فارسی`, `اکشن`, `عاشقانه` first.
- **I12** Badges (`helpers.getBadge`): Animation → «انیمیشن دوبله», Series → «سریال», Iranian → none, Movie with genre `دوبله فارسی` → «دوبله فارسی», other Movie → «زیرنویس فارسی».
- **I13** Safe atomic file operations: filesystem updates in services use transactional rename undo stacks, atomic tempfile swap writes (`writeJsonAtomic`), and rollback on failure.
- **I14** Upload format verification: poster file uploads on all routes (create, preview, edit) are strictly sniffed for valid magic signatures (JPEG, PNG, WebP, AVIF); ISO-BMFF video/audio containers, HTML and scripts are rejected.

## 5. Interfaces (current)
**REST** — public: `GET /`, `GET /api/auth/status`, `POST /api/auth/setup` (loopback first-run only), `POST /api/auth/login`, `GET /api/movies`, `/api/games`, `/api/stats`, `/api/config`, `/api/poster/:key`, `/api/game-poster/:title`. Admin (all behind `requireAdmin` + `Authorization: Bearer <token>` since P1a — SEC-02 closed): `POST /api/auth/logout`, `POST /api/auth/change-password`, `POST /api/movies`, `POST /api/movies/preview`, `POST /api/games`, `PUT /api/movies/:id`, `PUT /api/movies/by-uid/:uid`, `PUT /api/games/by-uid/:uid` (or `PUT /api/games/:key`), `DELETE /api/movies/by-uid/:uid`, `GET /api/trash`, `POST /api/trash/:id/restore`, `GET /api/movies/next-id?type=`, `POST /api/rescan`, `POST /api/games/rescan`, `GET /api/diagnostics`, `GET /api/orders[/:id]`. Full table with payload notes: `docs/ARCHITECTURE.md`. Since P8c (G6): startup serves `GET /api/movies` from the catalog cache with `meta.scanning` while the library is reconciled in the background (the 8 mutating routes answer `503 SCAN_IN_PROGRESS` until it settles); `/api/movies` + `/api/games` carry a stable quoted-sha1 ETag with gzip and 304 support (`backend/payload-cache.js`).
Standard error codes: `VALIDATION` (400), `BAD_JSON` (400), `IMG_TOO_LARGE` (400), `IMG_REQUIRED` (400), `IMG_UNSUPPORTED` (400), `IMG_EMPTY` (400), `TITLE_REQUIRED` (400), `TITLE_INVALID` (400), `ID_INVALID` (400), `YEAR_INVALID` (400), `GENRE_REQUIRED` (400), `GENRE_INVALID` (400), `PLATFORM_INVALID` (400), `NOT_FOUND` (404), `TRASH_NOT_FOUND` (404), `TRASH_PURGED` (404), `ID_TAKEN` (409), `GAME_EXISTS` (409), `FILE_EXISTS` (409), `RESTORE_CONFLICT` (409), `RATE_LIMIT` (429), `PERSIST_FAILED` (500), `SCAN_IN_PROGRESS` (503).

**WebSocket** (same origin, JSON `{type,payload}`, `protocol: 3`): client sends `hello {role:'customer'|'manager', token?}` within 10 s → `hello:ack`/`hello:error`. Customer: `selection:update {movies}`. Manager: `selection:save`, `selection:clear`, `orders:save {movies}`, `orders:delete {orderId}`, `orders:list`, `orders:update-status {orderId,status}`, `orders:edit {orderId,customerName?,note?}`, `orders:undo {orderId}` (P6d soft delete + undo window). Server → all: `selection:state`, `selection:saved {timestamp,count}`, `selection:cleared {timestamp}`, `movie:updated`, `movie:added`, `catalog:changed {added,updated,removed}`; → managers: `orders:update`, `orders:list`, `orders:saved {order}`, `orders:deleted {orderId}`, `orders:restored {order}`, `orders:error {message}`; errors: `selection:error`, `error`. `ping`/`pong` app-level echo; liveness uses WebSocket protocol-level ping (S9).
Naming quirk (kept for compatibility): the REST/client role is `admin`, the WS role is `manager`.

## 6. Working agreement
1. **Plan first.** Start each session in read-only/plan mode: read the files named in the phase prompt, restate the plan, list risks and STOP-GATE questions; then implement.
2. **Git.** Branch `phase/P<n>-<slug>` from the previous phase; small commits `type(scope): summary [DEFECT-IDs]`; never commit `Library/`, `data/`, `node_modules/`; never force-push.
3. **Tests first** for every defect marked `RUN`/`CODE` in the register: write the failing test, then the fix. Tests use temp directories only (`os.tmpdir()`), never the real `Library/` or `data/`. Use `node:test` + `node:assert/strict` (no new dependency).
4. **Scope discipline.** Do only what the phase lists. Anything else you notice goes into the report under *Discovered*, not into the diff. No drive-by reformatting, renaming or "cleanup".
5. **Compatibility.** Keep REST/WS message names and shapes stable unless the phase says otherwise; when they change, update server, client, tests and docs in the *same* commit and bump the WS protocol version.
6. **Safety.** Never modify or delete anything in a real `Library/` or `data/`. Never run destructive shell commands outside the repo. Do not add network calls, analytics or auto-updaters.
7. **Performance budget** (20,000 posters): cold start scan ≤ 10 s on SSD; first grid render ≤ 300 ms after data arrives; a selection click ≤ 50 ms and must not move scroll position; search keystroke → results ≤ 50 ms.
8. **Logging.** Quiet by default (summary + warnings). Per-file logs only with `DEBUG_SCAN=1`. Never log secrets.
9. **STOP-GATES** — stop and ask the owner when: an owner decision (D1–D9) is needed and not settled; a fix needs a new dependency; an on-disk format changes without an automatic migration; or one commit would touch > 15 files.
10. **Do not "fix" intentional behaviour** listed in §4 (I9, I11, I12) or the Persian wording of existing strings.

## 7. Definition of done (every phase)
- All tasks in the phase prompt implemented; every acceptance criterion demonstrably met.
- `npm test` green; `node mimo/repro/*.js` shows **FIXED** for the IDs the phase claims (or the equivalent regression test passes).
- `npm start` still boots on a fresh clone with an empty `Library/`; no new console noise.
- README / comments updated where behaviour changed; no dead code left behind by the change.
- **PHASE REPORT** delivered in exactly this format (the owner pastes it back for review):

```
## PHASE REPORT — P<n> <name>
Branch / commits: …
Defects closed: [IDs] — evidence: test names / repro output
Defects partially closed or deferred: [IDs] — why
Files changed: (grouped, one line each)
Tests: total / passing / todo — before → after
Decisions taken: (mention D# if relevant) + assumptions made
User-visible behaviour changes: …
Risks / could not verify: …
Discovered (out of scope): …
Questions for the owner: …
```

## 8. Persian glossary
دوبله فارسی = Persian-dubbed · زیرنویس فارسی = Persian subtitles · فیلم = movie · سریال = series · انیمیشن = animation · ایرانی = Iranian · بازی = game · پلی‌استیشن = PlayStation · ژانر = genre · شناسه/کد = ID/code · پوستر = poster · مشتری = customer · مدیر = manager/admin · سفارش = order · انتخاب‌شده‌ها = selected items · وضعیت سیستم = system status (diagnostics).
