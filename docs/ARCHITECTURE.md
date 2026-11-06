# Architecture — Offline Movie Catalog

Authoritative system architecture, data flow, API contracts, and domain invariants.

## Module map

```
server.js              entry: Express app, REST routes, middleware (security
                       headers, CORS, JSON body), startup sequence, shutdown
backend/
  scanner.js           recursive walk of Library/ (skips Games/, dot-folders)
  parser.js            filename → {id,title,year}; classifyFromPath(); TYPE_MAP
  indexer.js           CatalogIndexer: in-memory Map + data/catalog.json cache,
                       uid/poster URLs, toPublicMovie/toPublicGame
  watcher.js           fs.watch per directory (manual recursion), optional
                       LIBRARY_POLL_SEC reconcile, 500 ms debounce
  diagnostics.js       health report (summary/issues/stats/storage), 30 s cache
  constants.js         ONE source: media types, labels, extensions, pinned
                       genres, roles, protocol, publicConfig()
  services/
    movie-creator.js   add movie (poster copies into genre folders, temp in os.tmpdir())
    movie-editor.js    edit movie (renames ALL copies, watcher.expect)
    game-creator.js    add game poster under Games/PS4|PS5
    game-editor.js     edit game (rename/retarget)
    movie-trash.js     soft delete → Library/.trash/<id>/ + manifest, restore
    id-generator.js    global next-id (per type, cross-type uniqueness)
  storage/
    metadata-store.js  data/metadata.json — manager-entered imdbRating/plotSummary
    atomic-json.js     atomic write (temp + rename) + quarantine
    backup.js          data/backups/ rotation (newest 30 + daily × 14 days)
    warnings.js        storage warning log (quarantined/restored/migrated)
  utils/
    filename.js        buildMovieFilename / buildGameFilename (I4)
    safe-path.js       validateId, safeSegment, resolveInside (I10)
    series-key.js      seriesKey() — the series-title normaliser (I5)
server/
  config.js               resolveConfig(): env > config.json > defaults
                          (port, libraryPath, dataDir); bilingual messages;
                          unusable config.json (unparseable/unreadable,
                          non-object, bad libraryPath/dataDir) → hasFatal →
                          auto-start exits CONFIG_ERROR_EXIT_CODE (2) and
                          the supervisor does not restart on it; unknown
                          keys / bad port / missing Library → warn + fall
                          back. UTF-8 BOM stripped before JSON.parse.
  logger.js               logs/app-YYYYMMDD.log (7-day rotation, prune),
                          one line per HTTP request (no bodies/secrets),
                          FATAL stack capture for uncaught exceptions /
                          unhandled rejections (installFatalHandlers);
                          no-op unless init() is called (auto-start only)
  stop-file.js            Stop.bat stop-file watch: stale file removed at
                          arm time (its meaning is "stop THIS run"), then
                          1 s unref'd poll → one-shot graceful stop
  auth/auth.js            scrypt credentials, data/auth.json, sessions (24 h),
                          rate limit (5 / 5 min), loopback first-run setup
  auth/role-provider.js WS role validation (WS_ROLES from constants)
  orders/order-manager.js data/orders.json, monotonic numbers, statuses,
                         10 s undo window, backups
  realtime/ws-server.js  WebSocket server: handshake, roles, shared selection,
                         order commands, broadcasts (protocol 3)
js/
  boot.js              first paint / entry wiring
  app.js               <app-root> shell, header, role/theme/media handling
  store.js             central reactive store (state, filters, selection,
                       admin session, /api/config fetch, sync wiring)
  config.js            holds GET /api/config payload (applyConfig)
  realtime/connection.js raw WS + reconnect/backoff
  realtime/sync-client.js message ↔ callbacks (singleton)
  components/*.js      Web Components (light DOM): grid, card, detail, sidebars,
                       admin-panel, order-*, modals (dialog.js focus trap)
  utils/*.js           helpers, sort, search (Persian normalisation), text,
                       html (escaping tagged template), lazy-loader, api, csv
css/*.css              design tokens in themes.css; main/components/modals/
                       admin/print/mobile
test/unit/*.test.js    node:test unit + characterization
test/ui/*.test.js      Playwright UI tests (see docs/TESTING.md)
scripts/run-tests.js   test runner (collects *.test.js, spawns node --test)
scripts/print-urls.js  every non-internal IPv4 LAN URL (Start.bat; --port-only)
scripts/supervisor.js  restart loop: crash → restart in 3 s; 5 crashes in
                       2 min → stop bilingually; exit 0 = done (Stop.bat)
```

## Data flow

```
Library/ poster files
   │ scanLibraryAsync() / scanGamesAsync()     (background reconcile, POST /api/rescan)
   │ classifyFromPath() → type + genres        (I3)
   │ parseFilenameEx() → id/title/year         (parser.js)
   ▼
CatalogIndexer (in-memory Map keyed by uid) ── scheduleSave ──▶ data/catalog.json
   │                                              (rebuildable cache, I1)
   │ manager metadata (rating/plot) ◀──▶ data/metadata.json
   │
   ├─▶ GET /api/movies, /api/games, /api/stats, /api/poster/:id  (public)
   ├─▶ GET /api/diagnostics                                        (admin)
   │
   │ watcher (fs.watch) ── reconcile add/update/remove ──▶ indexer
   │                                   └── broadcast: catalog:changed,
   │                                       movie:updated / movie:added
   ▼
store.js  (boot() → fetch /api/config + /api/movies; selection state)
   ▼
components  (movie-grid, sidebars, admin-panel, modals …)
   │
   └── selection clicks ──▶ sync-client ──WS──▶ ws-server ──▶ broadcast
                                                    │
data/orders.json ◀── orders:* commands (manager) ───┘
```

Write paths (server writes only inside `Library/` and `data/`, I10):
`POST /api/movies` → movie-creator (copies into `Movies/<Genre>/`),
`PUT` → movie-editor (renames every copy + `watcher.expect`),
`DELETE` → movie-trash (`.trash/<id>/` + manifest), orders → order-manager
(`orders.json` + backup), setup/login → auth (`auth.json`).

### Startup sequence (P8c G6)

`start()` → `initialize()` (auth, backups, metadata, `catalog.json` load,
diagnostics, watcher — constructed with `holdReconcile()` —, WS server,
creator/editor services) → `listen()` → fire-and-forget `reconcileLibrary()`:

1. The port answers **immediately** from the `catalog.json` cache (or an
   empty list on a cold start) with `meta.scanning: true`.
2. The library is scanned with the async walkers; `reconcileGate` (test
   seam) can pause between scan and swap.
3. The scan results swap in atomically, `meta.scanning` flips to `false`,
   the watcher releases its hold (events held during the scan are replayed
   idempotently against the fresh index), the cache is flushed and the
   thumbnail sweep runs.
4. A `catalog:changed` broadcast goes out (even with a zero diff — clients
   use it to clear their "در حال بروزرسانی…" indicator).

While `scanning` is true the 8 catalog-mutating admin routes
(`POST /api/movies`, `POST /api/games`, both `PUT`s, `DELETE` by-uid,
`POST /api/trash/:id/restore`, `POST /api/rescan`, `POST /api/games/rescan`)
answer `503 {code:'SCAN_IN_PROGRESS'}`; every other route is live.

`GET /api/movies` and `GET /api/games` are served from
`backend/payload-cache.js`: the JSON body is built once per catalog
revision with a quoted-sha1 **ETag** (stable — `lastUpdated` is stamped at
build time, not per request), `Vary: Accept-Encoding`,
`Cache-Control: no-cache` and a **gzip** copy (built-in `zlib`, off the
request path). `If-None-Match` → `304` with no body. Rebuilds are
trailing-debounced (100 ms) off `indexer.onChange` plus a post-success
hook on every mutating route.

## REST endpoints

Auth column: *public* = no token; *admin* = `Authorization: Bearer <token>`
(`requireAdmin`; token from `POST /api/auth/login` or `/api/auth/setup`).

| Method | Path | Auth | Purpose / notes |
|---|---|---|---|
| GET | `/` | public | App shell (`index.html`) |
| GET | `/api/auth/status` | public | `{setupRequired: boolean}` |
| POST | `/api/auth/setup` | loopback | First-run `{username,password}` → `{token}`; only from the server machine; 403 afterwards |
| POST | `/api/auth/login` | public | `{username,password}` → `{token}`; 5 failures / 5 min → 429 |
| POST | `/api/auth/logout` | admin | Invalidates the session token |
| POST | `/api/auth/change-password` | admin | `{currentPassword,newPassword}` |
| GET | `/api/config` | public | `{version, mediaTypes, typeLabels, badgeLabels, pinnedGenres, imageExtensions, protocol}` |
| GET | `/api/movies` | public | `{meta:{version,lastUpdated,totalMovies,source,scanning}, movies:[Movie]}` — served from the payload cache: stable quoted-sha1 ETag (`If-None-Match` → 304), gzip when accepted (`Vary`, `Cache-Control: no-cache`); `scanning:true` during the P8c background reconcile |
| GET | `/api/poster/:id` | public | Poster image file by key. `?w=300\|600` → WebP thumbnail from `data/thumbs/` (requires optional `sharp`; falls back to the original). `?v=<mtimeMs>` matching the file → `Cache-Control: public, max-age=31536000, immutable`; otherwise `max-age=3600`. ETag/304 via sendFile |
| GET | `/api/stats` | public | `{totalMovies, genres, types, decades, yearRange}` |
| GET | `/api/games` | public | `{meta:{…,totalGames}, games:[Game]}` — same ETag/gzip/304 contract as `/api/movies` (no `scanning` field) |
| GET | `/api/game-poster/:title` | public | Game poster image file. Same `?w` / `?v` contract as `/api/poster` |
| GET | `/api/movies/next-id?type=` | admin | Suggested next ID for a type |
| POST | `/api/movies/preview` | admin | Filename preview for the add form |
| POST | `/api/movies` | admin | Add movie (poster base64, `express.json` 12 MB limit) |
| POST | `/api/games` | admin | Add game poster |
| PUT | `/api/movies/:id` | admin | Edit by numeric id (movies/animation/iranian) |
| PUT | `/api/movies/by-uid/:uid` | admin | Edit by uid (Series / games use this) |
| DELETE | `/api/movies/by-uid/:uid` | admin | Soft delete to `Library/.trash/` |
| GET | `/api/trash` | admin | Trash manifest (20 newest restorable) |
| POST | `/api/trash/:id/restore` | admin | Restore one trash entry |
| POST | `/api/rescan` | admin | Async rescan (movies **and** games) → `{count,gamesCount,invalid,invalidFiles}` |
| POST | `/api/games/rescan` | admin | Async games-only rescan |
| GET | `/api/diagnostics` | admin | Full diagnostics report |
| GET | `/api/orders` | admin | All orders |
| GET | `/api/orders/:id` | admin | One order |

Security headers on every response: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CSP
(`default-src 'self'`, `frame-ancestors 'none'`); CORS same-origin unless
`CORS_ORIGINS` opts in.

## WebSocket protocol (version 3)

Frames are JSON `{type, payload}`; `payload` may be omitted. The client
must send `hello` within 10 s. WS roles are `customer` and `manager`
(REST calls the same authenticated role `admin` — a naming quirk kept
until a later phase). Typedefs for most messages live in `docs/types.js`.

### Client → Server

| Type | Role | Payload | Notes |
|---|---|---|---|
| `hello` | any | `{role:'customer'\|'manager', token?}` | First frame; manager validates the token |
| `selection:update` | customer | `{movies:(Movie\|Game)[]}` | Replaces the shared selection (max 500 items) |
| `selection:save` | manager | — | Broadcasts `selection:saved`, then clears the selection |
| `selection:clear` | manager | — | Broadcasts `selection:cleared`, then clears the selection |
| `orders:save` | manager | `{movies:(Movie\|Game)[]}` | Server re-hydrates each item from its uid (client fields ignored) → creates the order, clears the selection |
| `orders:delete` | manager | `{orderId}` | Soft delete; 10 s undo window |
| `orders:list` | manager | — | Requests the full order list |
| `orders:update-status` | manager | `{orderId, status:'new'\|'preparing'\|'done'}` | |
| `orders:edit` | manager | `{orderId, customerName?, note?}` | |
| `orders:undo` | manager | `{orderId}` | Restore a just-deleted order (same number) |
| `ping` | any | — | Heartbeat → `pong` |

### Server → Client

| Type | Audience | Payload | Trigger |
|---|---|---|---|
| `hello:ack` | sender | `{role, username, protocol, bootId}` | Handshake accepted |
| `hello:error` | sender | `{message}` | Handshake rejected (bad role/token/timeout) |
| `error` | sender | `{message}` | Non-`hello` frame before handshake |
| `selection:state` | all | `{movies, updatedAt}` | Selection changed; also sent to every newly connected client |
| `selection:saved` | all | `{timestamp, count}` | Manager ran `selection:save` |
| `selection:cleared` | all | `{timestamp}` | Selection cleared (also follows `orders:save`) |
| `selection:error` | sender | `{message}` | e.g. `selection:save` on an empty selection |
| `orders:list` | one manager | `{orders}` | Initial state after handshake / `orders:list` request |
| `orders:update` | managers | `{orders}` | After any order mutation (save/delete/status/edit/undo) |
| `orders:saved` | sender | `{order}` | Order created |
| `orders:deleted` | sender | `{orderId}` | Order deleted |
| `orders:restored` | sender | `{order}` | Undo succeeded |
| `orders:error` | sender | `{message}` | Any order-command failure |
| `movie:updated` | all | `{movie}` | Movie edited (`PUT`) |
| `movie:added` | all | `{movie}` | Movie added (`POST`) |
| `catalog:changed` | all | `{added, updated, removed}` | Watcher/rescan reconciliation summary |
| `pong` | sender | `{}` | Heartbeat reply |

## Invariants

Core domain and architectural invariants of the system:

- **I1** The filesystem is the source of truth for *which* titles exist.
  `data/catalog.json` is a rebuildable cache; manager-entered
  `imdbRating` / `plotSummary` live in `data/metadata.json`
  (metadata-store).
- **I2** IDs are **strings**; leading zeros are meaningful (`0012` ≠ `12`).
  Never `parseInt` for identity. Valid ID: `^\d{1,6}$`.
- **I3** Type comes from the top-level folder (case-insensitive):
  `Movies/{Genre}/` → `Movie` (genre = the immediate sub-folder),
  `Animation/` → `Animation`, `Iranian/` → `Iranian`,
  `Series/` or `Serries/` → `Series`, `Games/{PS4|PS5}/` → `Game`
  (separate pipeline).
- **I4** Filename convention: Movie `{ID}- {Title} {Year}.ext` ·
  Animation/Iranian `{ID}-{Title}.ext` · Series and Game `{Title}.ext`.
  Extensions: jpg jpeg png webp avif.
- **I5** Series have **no ID**; identity is the normalised title (trim,
  collapse spaces, lower-case) — `seriesKey()` in `backend/utils/series-key.js`.
- **I6** `uid`: Movie/Animation/Iranian → the id string; Series →
  `series:<normalised title>`; Game → `game:<normalised title>`. `uid` is
  what selections, orders and `localStorage` store.
- **I7** A Movie in several genres = the **same poster file copied into
  several genre folders**; copies merge by ID and their genres are unioned.
- **I8** Games: title only; platforms merged across `PS4/` and `PS5/`
  copies of the same title.
- **I9** Selection is a **single shared server-side state** (D1). The
  server is the source of truth; managers are observers plus commands.
- **I10** The server writes only inside `Library/` (posters) and `data/`.
  Every path built from user input must be validated and resolved inside
  its root (`safe-path.js`).
- **I11** Type-specific sort rules are intentional (`js/utils/sort.js`):
  Movie & Animation → year DESC then ID DESC; Iranian → ID DESC (year
  ignored); Series → alphabetical ignoring leading articles; "All" view
  groups Movie → Iranian → Animation → Series. Genre order pins
  `دوبله فارسی`, `اکشن`, `عاشقانه` first.
- **I12** Badges (`helpers.getBadge`): Animation → «انیمیشن دوبله»,
  Series → «سریال», Iranian → none, Movie with genre `دوبله فارسی` →
  «دوبله فارسی», other Movie → «زیرنویس فارسی».

## Error codes

Server failures use a structured `code` field with an HTTP status and a
Persian user message. Codes referenced across phases (full route table in
the REST section above):

| Code | Status | Routes | Meaning |
|---|---|---|---|
| `PERSIST_FAILED` | 500 | `POST /api/movies`, `PUT /api/movies/*` | The durable manager-metadata write (`imdbRating` / `plotSummary`) failed; every visible change rolls back and the request fails — success means durable, never partial (F33). |
| `TITLE_INVALID` | 400 | `POST /api/movies`, `POST /api/games`, `PUT …/by-uid/:uid`, `POST /api/movies/preview` | The cleaned title is empty, a reserved Windows name, or too long/unsafe for a filename (`cleanTitle`/`safeSegment`); no poster byte is touched (F37). |
| `TITLE_REQUIRED` | 400 | movie/game create & edit | Title missing or blank. |
| `GAME_EXISTS` / `FILE_EXISTS` | 409 | `POST /api/games`, `PUT …/by-uid/:uid` (game) | A game title or target poster file already exists — checked before any write (F37). |
| `PLATFORM_INVALID` | 400 | `POST /api/games`, `PUT …/by-uid/:uid` (game) | Platforms must be a non-empty subset of {PS4, PS5}. |
| `IMG_REQUIRED` / `IMG_UNSUPPORTED` | 400 | `POST /api/movies`, `POST /api/games` | Poster missing or an unsupported image extension. |
| `SCAN_IN_PROGRESS` | 503 | the 8 catalog-mutating admin routes | The P8c background reconcile is still running; writes are blocked until it settles. |
| `NOT_FOUND` | 404 | edit/delete/trash/restore | The uid or trash entry does not exist. |
| `RESTORE_CONFLICT` | 409 | `POST /api/trash/:id/restore` | A restore destination is already occupied — nothing moved. |
| `TRASH_PURGED` | 404 | `POST /api/trash/:id/restore` | The entry's files were already purged from the trash window. |
| `ID_INVALID` | 400 | `POST /api/movies`, `PUT …/by-uid/:uid`, `POST /api/movies/preview` | ID not a 1–6 digit string (I2 — leading zeros meaningful). |
| `TYPE_INVALID` | 400 | create/edit/preview routes | `type` not in MEDIA_TYPES (Movie, Animation, Iranian, Series, Game). |
| `YEAR_INVALID` | 400 | `POST /api/movies`, `PUT …/by-uid/:uid` | Year missing or outside 1900–2099 for Movie type. |
| `GENRE_INVALID` / `GENRE_REQUIRED` | 400 | `POST /api/movies`, `PUT …/by-uid/:uid` | Genres not an array of non-empty strings, or missing for Movie. |
| `IMG_INVALID` | 400 | create/edit/preview routes | Poster not a string data URL / malformed base64. |
| `VALIDATION` | 400 | all write routes | Request body not an object. |
| `UNAUTHORIZED` | 401 | `POST /api/auth/logout`, admin routes | Missing or invalid session token (F30: header or body token accepted). |

## Storage ownership

| Path | Written by | Backed up | Notes |
|---|---|---|---|
| `Library/**` poster files | scanner reads; movie-creator/editor/trash write | no (your originals; trash keeps 20 deleted folders) | Source of truth (I1/I10) |
| `Library/.trash/manifest.json` | movie-trash | no | Soft-delete log + restorable entries |
| `data/catalog.json` | indexer (`scheduleSave`, 500 ms debounce) | **no** (rebuildable cache) | Safe to delete; app rebuilds on scan |
| `data/metadata.json` | metadata-store | yes | Ratings/plots keyed by uid (bare `id` string / `series:<title>`; the ONE key source is `backend/utils/metadata-key.js` — `metadataKeyFor` — used by the indexer attach paths and every store write since R1/F41; games are never stored here) |
| `data/orders.json` | order-manager | yes | Monotonic order numbers; corrupt file is quarantined + restored |
| `data/auth.json` | auth module | yes | scrypt hash + salt only. Writes use `writeJsonAtomic` (F39); an unusable file
  (unparseable, or valid JSON with malformed hash/salt) is quarantined to
  `auth.corrupt-<timestamp>.json` with a warning logged and the app returning to
  first-run setup (loopback only — LAN cannot set up). Write failure returns
  `PERSIST_FAILED` without changing in-memory credentials. |
| `data/backups/<name>.<stamp>.json` | backup module | — | Newest 30 + one per day × 14 days; never the newest file |

Storage warnings (`backend/storage/warnings.js`): in-process warnings recorded
by `recordWarning` during metadata-store loads/migration and atomic-json
quarantine/recovery — e.g. a `PERSIST_FAILED` metadata write (F33) or a
quarantined corrupt file — are collected in memory and surfaced on
`GET /api/diagnostics`. They reset on restart and are never written to disk.

## Reference Notes

- `docs/types.js` provides JSDoc typedefs; the REST and WebSocket tables above are authoritative.
