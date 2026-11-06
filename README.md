# Offline Movie Catalog

A **LAN-only, offline** web application for a Persian-speaking video / game
store. The shop keeps *poster image files* in a `Library/` folder; the app
scans them, builds a searchable catalog, and serves it to browsers on the
local network. The app manages **posters + metadata only** — it never plays
or streams video.

Two roles share the same page:

- **Customer** (kiosk or phone): browses posters, filters by genre and type,
  ticks titles into a live shared selection.
- **Manager** (logged in, on another screen): watches the customer selection
  in real time, copies/prints the IDs that locate the real media, saves the
  selection as an order, edits movie metadata, adds movies (with poster
  upload), manages a Games (PS4/PS5) catalog, and views diagnostics.

UI language is **Persian (RTL)**; dark/light themes and a gaming accent
theme are included.

## Features

- Auto-scanning of the `Library/` folder (movies, series, animation, Iranian
  films, games) with a live filesystem watcher
- Instant startup: the server answers from the `catalog.json` cache right
  away — the header shows «در حال بروزرسانی…» while the library is
  re-scanned in the background; catalog payloads are ETag/gzip cached, so
  repeat loads revalidate as a tiny 304
- Filename parsing: ID, title and year extracted from poster filenames
- Real-time customer selection over WebSocket — one shared list (see
  [Customer Selection](#customer-selection))
- Manager dashboard: orders with statuses, trash with restore, add/edit
  movies and games, system status (diagnostics)
- Genre filtering, search with Persian text normalisation, keyboard
  shortcuts, responsive design, dark/light themes
- Zero build step: vanilla ES modules, Express + `ws` on the backend

## Requirements

- [Node.js](https://nodejs.org) **18 or newer** (see `engines` in
  `package.json`; Node < 18 is EOL)
- npm (ships with Node.js)

`sharp` is installed as an **optional** dependency and is used only to
generate WebP grid thumbnails (`?w=300|600` on poster URLs). If it is
missing or fails, the server serves the original poster files instead —
everything else works identically. Note: `sharp` itself requires Node
**20.9 or newer**, so on Node 18–20.8 the install skips it and the app
runs with originals (this is the expected fallback, not an error).

## Quick start

### Windows

Double-click `Start.bat`. It does everything on first run:

1. checks Node.js ≥ 18 (bilingual message if missing or too old),
2. installs runtime dependencies (`npm ci --omit=dev`) when `node_modules`
   is missing (`install.bat` still works on its own),
3. prints every LAN address (`http://<ip>:<port>/`) so staff can type it
   on a phone,
4. opens the default browser on the server PC,
5. runs the server under a restart loop: a crash restarts after 3 s; five
   crashes within two minutes stop the loop with a readable message
   (details in `logs/app-YYYYMMDD.log`). An unusable `config.json` also
   stops the server with its bilingual explanation and is not restarted.

`Stop.bat` stops the server gracefully (flushes data first), then the
server window closes itself. Ctrl+C in the server window does the same.
Any error (Node missing, install failed, config error, crash storm) keeps
the window open so the message can be read. The window title shows the
current version from `package.json`.

### Linux / macOS

```bash
npm ci          # or: npm install
node scripts/supervisor.js    # restart loop; or: npm start (no loop)
```

Then open `http://localhost:3000` (or `http://<server-ip>:3000` from other
devices on the LAN). The default port is `3000` — change it in
`config.json` or with the `PORT` environment variable (see
[Configuration](#configuration-configjson)).

An empty or missing `Library/` folder is fine: the app boots with an
empty catalog, prints what to create, and picks up files as you add them.

## First-run admin setup

The first time the UI loads, it asks whether an admin account exists
(`GET /api/auth/status` → `setupRequired`). Create the manager account
**from the server PC itself** (loopback only, e.g. `http://localhost:3000`):

1. The login dialog shows the first-run setup form.
2. Choose a username and password — they are stored as a salted scrypt hash
   in `data/auth.json`, never in plain text.
3. You are logged in automatically afterwards.

Notes:

- For headless installs, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the
  environment; they override `data/auth.json`.
- The password can be changed later from the admin panel
  («تغییر رمز عبور»).
- Sessions last 24 hours; login is rate-limited (5 failures per 5 minutes).

## Environment variables

All optional; the app works with none of them set. Environment variables
**override** `config.json` (see the next section).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `LIBRARY_PATH` | `./Library` | Root folder that is scanned for posters |
| `DATA_DIR` | `./data` | Folder for runtime data (`catalog.json`, `orders.json`, `auth.json`, `metadata.json`, `backups/`) |
| `ADMIN_USERNAME` | — | Headless admin username (overrides `data/auth.json`) |
| `ADMIN_PASSWORD` | — | Headless admin password (must be set together with `ADMIN_USERNAME`) |
| `CORS_ORIGINS` | — (same-origin only) | Comma-separated list of extra origins allowed by CORS |
| `DEBUG_SCAN` | off | Set to `1` for per-file scan logging |
| `LIBRARY_POLL_SEC` | `0` (off) | Seconds between full reconcile passes; set > 0 as a safety net on network drives that miss `fs.watch` events |

## Configuration (config.json)

Instead of environment variables you can drop an optional `config.json`
next to `package.json` (copy `config.example.json` as a starting point;
it is git-ignored so your edits stay local):

```json
{
  "port": 3000,
  "libraryPath": "Library",
  "dataDir": "data"
}
```

Precedence: **environment variable > config.json > built-in default**.
Relative paths inside `config.json` resolve against the app folder.

The file is validated at startup with actionable messages (Persian +
English). An unusable file **stops the server** with exit code 2 (the
launcher shows the message on screen and does not restart) — silently
switching to default folders could look like lost data:

- malformed or unreadable JSON → the server does not start;
- a top level that is not a JSON object (e.g. a list) → same stop;
- `libraryPath` or `dataDir` present but not a non-empty text value →
  same stop;
- a UTF-8 BOM (saved by old Notepad) is stripped automatically — a valid
  file is never refused just for that.

Warning + safe fallback (the server keeps running):

- unknown keys (e.g. a typo like `prot`) → warning listing the allowed
  keys (`port`, `libraryPath`, `dataDir`);
- an invalid `port` (not an integer 1–65535) → warning, default 3000 is
  used;
- a missing `Library` folder → the exact structure to create is printed
  and the server keeps running with an empty catalog.

## Logs

The server writes `logs/app-YYYYMMDD.log` (one file per day, the seven
newest are kept). The console shows the compact startup banner; the file
holds the structured trail: startup lines, one line per HTTP request
(method, path, status, duration — never bodies, tokens or passwords) and
crash details (`FATAL` with the stack) that the launcher only summarizes
on screen. `logs/` is git-ignored.

## LAN & firewall

The shop PCs and phones must be on the **same local network**. Two
things usually stand in the way:

### 1. Windows Firewall

Windows blocks unknown incoming connections on "public" profiles. Allow
the app's port **on the private (shop) profile only** — run once in an
**admin** Command Prompt (replace `3000` if you changed the port):

```bat
netsh advfirewall firewall add rule name="Movie Catalog 3000" dir=in action=allow protocol=TCP localport=3000 profile=private
```

Remove it later with:

```bat
netsh advfirewall firewall delete rule name="Movie Catalog 3000"
```

### 2. A fixed address for the server

Routers hand out addresses that can change; a phone's bookmark then
stops working. Either (a) reserve the server's address in the router's
DHCP settings, or (b) give the PC a static IP and update it in
`config.json`/`PORT` docs only once. You can also use the PC's hostname:
`http://<pc-name>:3000/` often works on modern Windows networks.

### Phones cannot connect — checklist

1. Phone Wi-Fi is the **shop network**, not mobile data and not a guest
   network (guest networks are usually isolated).
2. The server PC is **on and awake** (not asleep/hibernating) and
   `Start.bat`'s window shows the "Ready" banner.
3. You typed a URL that is actually listed in the server window
   (`http://192.168.x.x:3000/` style) — the phone-only address is the
   one printed under "On phones / other PCs".
4. The firewall rule above exists for **this** port (step 1).
5. Ping test from the phone's browser: open `http://<server-ip>:3000/api/auth/status`
   — a JSON answer means the network is fine and the problem is the
   URL; a timeout means firewall/network.
6. Some routers enable "AP/client isolation" for Wi-Fi clients — turn it
   off in the router settings.

## Library folder

The scanner walks `Library/` recursively. The **top-level folder** decides
the type; for `Movies/`, the **immediate sub-folder** is the genre:

```
Library/
  Movies/
    Action/
      0042- The Matrix 1999.jpg
      0043- Heat 1995.png
    دوبله فارسی/
      0117- Titanic 1997.jpg
  Animation/
    0012-Cars.jpg
  Iranian/
    0117-Makhooz.jpg
  Series/
    Breaking Bad.jpg
    Grey's Anatomy.jpg
  Games/
    PS4/
      Ghost Rider.jpg
    PS5/
      Ghost Rider.jpg
```

Rules:

- A movie shown in several genres = **the same poster file copied** into
  each genre folder; copies merge by ID and their genres are unioned.
- **`Series/` and `Serries/` are both accepted** (case-insensitive). New
  libraries use `Series/`; an existing library keeps whichever folder it
  already has (both map to type `Series`).
- Games live in `Games/PS4/` and `Games/PS5/`; the same title in both
  folders is one entry with both platforms.
- Supported poster extensions: `jpg`, `jpeg`, `png`, `webp`, `avif`.
- Dot-folders at the top level (`.trash`, `.tmp`) and `Games/` are skipped
  by the movie scanner (games have their own pipeline).

## Filename cheat-sheet

IDs are **numeric strings, 1–6 digits** (`0042` and `42` are different
IDs — leading zeros are meaningful). There is no IMDb-style `tt…` ID.

| Type | Canonical filename | Example | ID | Year |
|---|---|---|---|---|
| Movie | `{ID}- {Title} {Year}.ext` | `0042- The Matrix 1999.jpg` | required | **required** |
| Animation | `{ID}-{Title}.ext` | `0012-Cars.jpg` | required | optional (kept when present) |
| Iranian | `{ID}-{Title}.ext` | `0117-Makhooz.jpg` | required | optional (kept when present) |
| Series | `{Title}.ext` | `Breaking Bad.jpg` | none | none |
| Game | `{Title}.ext` | `Ghost Rider.jpg` | none | none |

The parser is tolerant: separators after the ID may be `-`, `_`, `.` or
a space, and a year in parentheses or brackets is accepted, e.g.
`5273 - The Dark Knight (2008) [BluRay].jpg` or
`5273_Shelter_2026.jpg`. Release tags (`1080p`, `WEB-DL`, …) are stripped
from titles. Series and Game identity is the normalised title (trimmed,
spaces collapsed, lower-cased); forbidden filename characters are replaced
when the app itself writes a file.

## Customer Selection

Every customer screen — the kiosk, a phone, any browser on the LAN —
shares **one customer selection**. There are no per-device or per-station
lists: ticked titles all go into the same shared list, and the manager
panel shows that list live as it changes. The last device to change the
selection is the one the manager sees.

This is the designed behaviour of the app: staff collect picks from
several devices into a single list on purpose. Saved orders are taken from
that same shared selection.

## Orders

- The manager saves the shared selection as an order; each order gets a
  **monotonically increasing number** that is never reused, even after
  deletions or restarts.
- Order statuses: `new` → `preparing` → `done`. Customer name and a note
  can be edited per order.
- Deleting an order offers a **10-second undo**; after that the order is
  gone (a full soft-deleted copy is kept in `data/backups/` history via the
  orders backup).
- Deleting a movie from the catalog is a **soft delete**: every poster
  copy moves to `Library/.trash/<id>/` with a manifest. The admin panel can
  restore the **20 newest** deletions.

## Backups and restore

Runtime state lives in `data/` (all of it git-ignored):

| File | Owner | Backed up? |
|---|---|---|
| `data/catalog.json` | indexer | **No** — rebuildable cache; delete it any time to rescan |
| `data/thumbs/` | thumbnail service | **No** — disposable WebP cache; deleted/regenerated automatically as posters change |
| `data/metadata.json` | metadata store | Yes — manager-entered ratings/plots |
| `data/orders.json` | order manager | Yes |
| `data/auth.json` | auth module | Yes |
| `data/backups/<name>.<timestamp>.json` | backup module | — (the backups themselves) |

Backup policy: on every save a backup is written to `data/backups/`;
retention keeps the newest 30 files plus the newest backup for each of the
last 14 days.

To restore: stop the server, copy the wanted backup over the target file
(strip the `.timestamp` suffix back to e.g. `orders.json`), start the
server. If a JSON file is corrupt, the app **quarantines it and restores
the newest backup automatically** instead of overwriting history — check
the storage warnings in the diagnostics panel if something looks missing.

## Troubleshooting — System status panel

The header button **«وضعیت سیستم»** (admin only) opens the diagnostics
panel (`GET /api/diagnostics`). It reports:

- **Summary**: total movies/games/files, type counts, year range
- **Issues**: duplicate IDs, duplicate series titles, missing posters,
  invalid filenames (with reason), missing years, unknown types, broken
  links, empty genres, conflicting metadata, orphan metadata
- **Stats**: genre/year distribution, top decades, game platforms
- **Storage warnings**: quarantined catalog, restored-from-backup events,
  metadata migrations

Common symptoms:

| Symptom | Likely cause / fix |
|---|---|
| Poster doesn't show | Unsupported extension, or the filename doesn't parse (check *invalid filenames*) — see the cheat-sheet above |
| Movie missing entirely | A `Movie` filename without a year is rejected; check *invalid filenames* for the reason |
| Game missing | Not under `Games/PS4/` or `Games/PS5/`, or unsupported extension |
| Changes not picked up | Press «بروزرسانی کتابخانه» (rescan); on network drives set `LIBRARY_POLL_SEC` |
| IDs look wrong | IDs are 1–6 digits only; longer numbers are rejected |

## Security notes

- Designed for a **local network only**, served over **plain HTTP**. It is
  **not hardened for public internet exposure** — do not port-forward it.
- Admin routes require a `Bearer` session token; passwords are stored as
  salted scrypt hashes; login is rate-limited.
- Responses send `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY` and a `Content-Security-Policy`; CORS is
  same-origin by default (`CORS_ORIGINS` opts in extra origins).
- Poster uploads are validated by **image magic bytes** (JPEG/PNG/WEBP/AVIF
  sniffed from the decoded buffer), not by the declared MIME type. Files are
  stored and served with `image/*` content types and `nosniff` so browsers
  will not execute HTML or scripts embedded in a poster upload. Known
  limitation (F32): polyglot files whose magic bytes match a supported format
  are accepted — this is an accepted risk on a trusted LAN.
- **Admin lockout recovery.** If the admin password is forgotten or `data/auth.json`
  is damaged: stop the server (`Stop.bat`), delete `data\auth.json`, start the server
  again, and set a new password from the server PC itself (loopback-only first-run
  setup). Orders, ratings (metadata.json) and the catalog are not affected — they
  live in separate files. If `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars are set, they
  override `auth.json` for headless installs.
- Everything runs offline: no CDN, no external fonts/scripts, no telemetry.

## Project structure

```
server.js          entry: Express + HTTP server, REST routes, startup
backend/           scanner, parser, indexer, watcher, diagnostics, services
server/            config resolution, file logger, auth, orders, WebSocket
js/                front end (vanilla ES modules + Web Components)
css/               stylesheets (themes, components, print, mobile)
assets/fonts/      bundled Vazirmatn webfont + OFL licence (offline)
scripts/           test runner, LAN URL printer, crash-restart supervisor
data/              runtime data, incl. thumbs/ thumbnail cache (git-ignored)
logs/              daily app logs (git-ignored, 7 newest kept)
Library/           your poster files (git-ignored)
docs/              architecture, types, contributing, testing, Persian guide
test/              unit + Playwright UI tests
Start.bat          Windows launcher (checks, install, LAN URLs, restart loop)
Stop.bat           graceful stop (writes logs/stop.request)
```

## Known limitations

The following design trade-offs and edge cases are documented and accepted:
- **F4 (Orphan trash after hard kill)**: A hard kill (`SIGKILL` or power failure) between moving poster files and writing the trash manifest can leave an unindexed folder under `Library/.trash/`. The catalog scanner ignores dot-folders, so no corrupt data enters the index.
- **F9 (Game WebSocket broadcasts)**: Real-time WebSocket broadcasts emit `catalog:changed` for movies; game mutations update the in-memory index immediately and client panels refresh on subsequent REST fetches.
- **F10 (Thumbnail cache cap)**: Generated WebP poster thumbnails under `data/thumbs/` are pruned of missing posters on startup reconciliation, but the cache directory has no maximum size limit.
- **F11 (Cold reconcile criterion)**: Startup reconciliation checks whether `data/catalog.json` exists and is newer than the `Library/` root directory mtime, but does not recursively inspect subfolder timestamps.
- **F17 (conflictingMetadata stale until rescan)**: In-library metadata clashes across genre copies are detected during full library scans; incremental renames do not recompute this list until the next rescan.
- **F18 (Supervisor command)**: The crash supervisor is launched by `Start.bat` (`node scripts/supervisor.js`); running `npm start` directly boots the server in single-process mode.
- **F19 (Transient EBUSY on Windows rename)**: On Windows, opening a poster file during warm-up at the exact instant of an admin rename can surface a transient 500 error.
- **F20 (Catalog backup rotation)**: Movie additions create timestamped catalog backups directly under `data/backups/`, while auth, orders, and metadata backups are managed by `BackupManager`.
- **F21 (LIBRARY_POLL_SEC override)**: The environment variable `LIBRARY_POLL_SEC` allows configuring filesystem polling interval, but is not exercised by default automated unit tests.
- **F22 (Invalid filenames refresh)**: The list of invalid filename warnings shown in the diagnostics panel is updated during full library rescans.
- **F23 (Persian string collation)**: In-browser Persian title collation uses `localeCompare(..., 'fa')`, which depends on the host system's Unicode ICU collation tables.
- **F42 (CSV formula neutralisation)**: In orders CSV export, fields beginning with formula trigger characters (`=`, `+`, `-`, `@`, tab, CR) are prefixed with a single quote to prevent spreadsheet formula execution; a title beginning with `-` or `+` shows a leading apostrophe in Excel.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, data flow, REST
  and WebSocket protocol tables, invariants
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — branch/commit rules, how
  to run lint/tests/repros, how to add a defect test
- [`docs/راهنمای-مدیر.md`](docs/راهنمای-مدیر.md) — one-page Persian guide
  for the shop owner
- [`CHANGELOG.md`](CHANGELOG.md) — what each phase changed

Current version: see `package.json` (also shown in the header badge and
`GET /api/config`).
