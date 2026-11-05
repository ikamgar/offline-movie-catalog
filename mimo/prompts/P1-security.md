# P1 — Security hardening

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P1-security.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P0 · **Closes:** SEC-01…SEC-08, FE-04, FE-08 (auth part), ARCH-06 (WS heartbeat) · **Branch:** `phase/P1-security`
**Owner decisions used:** D5 (credentials), D9 (no new deps).

## Goal
Make it safe to run on a shared shop network: no source/credential leakage, no unauthenticated admin actions, no path traversal, no script injection, no abusable WebSocket — without changing how the app looks or how staff work.

## Context
Threat model: any device on the shop Wi-Fi (customers' phones) can reach the server. Today they can download `server/auth/auth.js` (admin password), call every admin endpoint without logging in, write files outside `Library/`, and plant `<img onerror>` in a title that runs in the manager's browser.

## Tasks
Work test-first: flip the matching `todo` test from P0, watch it fail, fix, keep it green.

**S1 — Static allow-list (SEC-01).** Replace `express.static(__dirname)` with an explicit allow-list: `GET /` → `index.html`; static dirs `css/`, `js/` (and `assets/` if added later). Nothing else from the project root is reachable (`/server/*`, `/backend/*`, `/data/*`, `/package*.json`, `/Library/*`, dotfiles, `..` tricks must all be 404). Posters keep flowing through `/api/poster/*`.

**S2 — Central `requireAdmin` middleware (SEC-02).** Validate `Authorization: Bearer <token>` with `validateSession`. Protect: `POST /api/movies`, `PUT /api/movies/:id`, `GET /api/movies/next-id`, `POST /api/rescan`, `POST /api/games/rescan`, `GET /api/diagnostics`, `GET /api/orders`, `GET /api/orders/:id`, `POST /api/auth/logout`. Public stays: `GET /api/movies`, `/api/games`, `/api/stats`, posters, `POST /api/auth/login`, plus new `GET /api/auth/status`. Missing/invalid token → `401 {success:false, error:'UNAUTHORIZED'}`.
  Front-end: create `js/utils/api.js` — one `api(path, opts)` wrapper that adds the bearer token from the store, parses JSON safely, and on `401` calls `store.logout({reason:'expired'})`, shows a Persian toast and opens the login modal (closes FE-08 for REST). Replace every raw `fetch('/api/…')` for admin calls (`store.rescan`, `fetchDiagnostics`, add/edit modals, next-id) with it.

**S3 — Credentials (SEC-05, D5).** Remove the hard-coded password. Store `data/auth.json` = `{username, salt, hash, createdAt}` using `crypto.scrypt` (built-in) and `crypto.timingSafeEqual`. First run (no `auth.json`): `GET /api/auth/status` → `{setupRequired:true}`; `POST /api/auth/setup {username,password}` is accepted **only from loopback** (`127.0.0.1`/`::1`) and only while no `auth.json` exists; the login modal shows a Persian "create admin password" form in that state (min 8 chars). Env `ADMIN_USERNAME` + `ADMIN_PASSWORD` override (headless installs, hashed in memory, never written to disk). Add `POST /api/auth/change-password` (admin) + a small dialog in the admin panel. Login rate limit: 5 failures / 5 min per IP+username → `429` with `Retry-After`; constant-time comparison; never log the password. Sessions: keep 24 h; **logout and expiry must close that token's manager WebSockets**.

**S4 — Path traversal (SEC-03).** Add `backend/utils/safe-path.js`: `validateId(id)` (`^\d{1,6}$`), `safeSegment(name)` (no separators, no `..`, no control chars, no Windows reserved names `CON PRN AUX NUL COM1-9 LPT1-9`, no trailing dot/space, ≤ 120 chars, NFC-normalised), `resolveInside(root, ...parts)` (throws unless the resolved path is strictly inside `root`). Use them for `id`, every `genres[]` entry, title-derived filenames, and rename targets in movie-creator and the PUT handler. Genres must match an existing genre folder name (or, if D-later allows, a validated new segment). Reject with `400` and a Persian error message; nothing may be written.

**S5 — XSS (SEC-04, FE-04).** Create `js/utils/html.js`: `esc(v)` (escapes `& < > " '` and backtick), a tagged template `html\`…\`` that escapes every interpolation by default, and `raw(str)` for the few trusted fragments (SVG icons). Refactor **every** template that interpolates dynamic data: `movie-card`, `movie-detail`, `selection-sidebar`, `admin-panel`, `order-panel`, `order-card`, `diagnostics-modal`, `edit-modal` (attribute values and `<textarea>` content), `add-modal` (genre checkboxes), `genre-sidebar` (`data-category`), `store.showToast` (use `textContent`), `printSelectedIds` (build the print document with DOM APIs / escaped text), `generatePosterPlaceholder` (XML-escape SVG text; escape the whole data-URI properly). **Remove all inline `onerror=`/`onclick=`**; attach listeners with `addEventListener`. Add a permanent guard test that scans `js/**` for `${` inside `innerHTML` templates that do not go through `html`/`esc` (allow-listed exceptions must be commented).
  Add response headers on every response: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Move the inline `<script>` in `index.html` to `js/boot.js` so CSP `script-src 'self'` holds.
  Server-side input validation on write (defence in depth): title 1–200 chars (strip control chars), plotSummary ≤ 2000, year int 1900–2099, imdbRating 0–10, genres each ≤ 60 chars.

**S6 — Upload hardening.** `POST /api/movies` uses `express.json({limit:'12mb'})` at route level only; everywhere else keep a small limit (`100kb`). Decode the poster, verify **magic bytes** (JPEG `FFD8FF`, PNG `89504E47`, WEBP `RIFF…WEBP`, AVIF `ftypavif`/`ftypavis`), derive the extension from the detected type (ignore the client's data-URL MIME), reject > 8 MB decoded, and write the file with `flag:'wx'` (never overwrite).

**S7 — API output whitelist (SEC-08).** Add `toPublicMovie(m)` / `toPublicGame(g)` returning only `uid,id,title,year,genres,type,poster,imdbRating,plotSummary` (games: `uid,title,platforms,type,poster`). Use it in `GET /api/movies`, `/api/games`, PUT/POST responses and all WS broadcasts. `absolutePosterPath` and `_posterSet` never leave the server (keep them internal; do not persist `_posterSet`).

**S8 — CORS & headers (SEC-07).** Remove the wildcard CORS middleware. Same-origin only by default; opt-in `CORS_ORIGINS=http://a,http://b` (comma list) for dev. Poster route: `res.sendFile(path, {dotfiles:'deny'})`.

**S9 — WebSocket hardening (SEC-06, ARCH-06).** `new WebSocket.Server({ server, maxPayload: 256*1024 })`. Validate `selection:update`: `movies` is an array of ≤ 500 objects with a string `uid`; **ignore everything except `uid` and re-hydrate canonical objects from the indexer/games index** (unknown uids are dropped). Same for `orders:save` (hydrate from uids; keep a snapshot of title/year/id/type/poster). Per-socket message rate limit (30 msgs/s → close `4008`). Replace the app-level heartbeat with protocol ping/pong (`isAlive` flag, terminate dead sockets every 30 s); clear the interval in `close()`. Add `protocol: 1` to `hello`/`hello:ack`; the client tolerates a missing value. Keep all message *names* unchanged.

**S10 — Client session handling (FE-08).** On `hello:error` or REST 401 while in admin UI: leave admin mode (`role='customer'`, clear `mc_adminSession`), toast «نشست شما منقضی شده است، دوباره وارد شوید», open the login modal. The "zombie admin" state (admin UI + customer socket) must be impossible.

## Constraints
- No new runtime dependencies. No `helmet`, `bcrypt`, `express-rate-limit` — use built-ins.
- Do not change visual design, Persian wording of existing strings, or message names.
- First-run/setup flow must work on a clean folder **and** with `ADMIN_PASSWORD` set.
- Keep `Start.bat` usable: the owner opens `http://localhost:3000` on the server PC to complete setup.

## Acceptance criteria (each is an automated test)
1. `GET /server/auth/auth.js`, `/package.json`, `/data/orders.json`, `/data/catalog.json`, `/Library/x`, `/backend/indexer.js`, `/%2e%2e/server.js` → 404 (or 400), never file content.
2. Every admin endpoint returns 401 without a token and works with one; public endpoints stay public.
3. `id:'../../../evil'` and `genres:['../../..']` → 400, no file created anywhere; a genre or title with `\\`, `/`, `:`, `..`, `CON` is rejected/sanitised.
4. The Playwright XSS tests (title, plotSummary, genre, order snapshot, toast, print view) execute **no** injected script; Grey's Anatomy placeholder works.
5. Brute-force login: 6th wrong attempt within 5 min → 429. Password never appears in logs or `data/`.
6. A 300 KB WebSocket frame is rejected/closes the socket; a customer sending 10 000 fake movies or objects with foreign fields cannot inject data (manager receives only canonical objects).
7. After server restart with a stale token the UI returns to customer mode with the toast + login modal; no manager actions are silently dropped.
8. `GET /api/movies` payload contains no `absolutePosterPath`/`_posterSet`; CSP header present; inline handlers grep = 0.
9. `node mimo/repro/repro-ui.js` shows FIXED for SEC-04 and FE-04; `repro-backend.js` shows FIXED for SEC-03.

## Verify
`npm test`; `npm run test:ui`; both repro scripts; manual: fresh clone → open `/` on the server PC → create admin → log in → edit a movie → restart server → confirm graceful re-login.

## Report
PHASE REPORT (AGENTS.md §7). Add a short **Security notes for the owner** section: what changed for staff (first-run password, re-login after restart), and any residual risks (e.g. plain HTTP on LAN).
