## PHASE REPORT — P1a Access Control (first third of P1 security hardening)

**Branch / commits:**
`phase/P1a-access-control` — 2 commits on top of `phase/P0-safety-net`:
1. `79abb89` feat(security): S1 static allowlist, S2 requireAdmin, S3 credentials, S8 headers, S10 WS close
2. `696aa0c` feat(frontend): api wrapper, first-run setup, session expiry handling

**Defects closed:**
- SEC-01 (static asset leakage): 2 tests flipped from todo → pass. `GET /server/auth/auth.js`, `/package.json`, `/backend/indexer.js`, `/%2e%2e/server.js` → 404.
- SEC-02 (unauthenticated admin endpoints): 4 tests flipped. Every admin endpoint returns 401 without token and works with one.
- SEC-05 (hard-coded password): 11 tests flipped. No hard-coded password; first-run setup from loopback; env override; rate limiting (6th attempt → 429); change-password works.
- SEC-07 (CORS/headers): 4 tests flipped. No `Access-Control-Allow-Origin` header by default; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; `X-Frame-Options: DENY`.
- FE-08 (zombie admin): `onAuthError` in store.js now calls `logout({reason:'expired'})` → role drops to customer, toast + login modal opens; admin UI impossible after server restart.

**Defects partially closed or deferred:** None — P1a scope was strictly SEC-01/02/05/07/FE-08.

**Files changed (13 total):**
- *Backend (3):* `server.js` (static allowlist, requireAdmin middleware, security headers, auth/status+setup+change-password endpoints, CORS env opt-in), `server/auth/auth.js` (scrypt credentials, rate limiting, isLoopback, setupAdmin, changePassword, onLogout callback), `server/realtime/ws-server.js` (closeManagersByToken for logout WS cleanup)
- *Frontend (5):* `js/utils/api.js` (new — authenticated fetch wrapper with 401→logout+toast+modal), `js/store.js` (logout({reason}), onAuthError → expired, api wrapper for rescan+diagnostics), `js/components/login-modal.js` (first-run setup mode: checks /api/auth/status, shows "create admin" form with confirm password, min 8 chars), `js/components/add-modal.js` (api wrapper for next-id + POST /api/movies), `js/components/edit-modal.js` (apiPut wrapper for PUT /api/movies/:id)
- *Tests (5):* `test/helpers/test-server.js` (admin option pre-creates auth.json, loginAsAdmin helper), `test/unit/auth.test.js` (credential tests updated for scrypt, isLoopback tests, rate limiting, changePassword), `test/unit/defects.test.js` (SEC-01/02 flipped from todo, SEC-05/07 new tests added), `test/unit/http.test.js` (admin option, loginAsAdmin helper), `test/unit/ws.test.js` (admin option, loginAsAdmin helper)

**Tests:** total / passing / todo — before → after
- Before: 194 / 163 / 31
- After: 227 / 206 / 21
- 33 new tests added (auth.test.js: 23, http.test.js: +3 next-id tests, defects.test.js: SEC-05×11 + SEC-07×4 + flipped SEC-01×2 + SEC-02×4 = 21 total, net new in defects: ~7)
- 10 todo tests flipped to pass (SEC-01: 2, SEC-02: 4, SEC-05: 11, SEC-07: 4 — but note some SEC-05 tests were new, not flipped from P0 todo)

**Decisions taken:**
- D5 used: first-run credentials via `/api/auth/setup` (loopback only, min 8 chars, scrypt hash)
- D9 respected: no new runtime dependencies — only Node built-in `crypto` used

**Assumptions made:**
- `isLoopback()` uses socket remote address only (never X-Forwarded-For) — verified with unit tests for `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
- Salt encoding: `crypto.randomBytes(16)` stored as Buffer internally, hex string in auth.json — scrypt produces different output for string vs Buffer salt, so all auth.json creation sites must use Buffer
- WS `closeManagersByToken` closes all manager sockets matching a token on logout/expiry
- `api.js` wrapper triggers `store.logout({reason:'expired'})` + toast + modal on any 401 from admin endpoints

**User-visible behaviour changes:**
- **First run:** opening the app in a browser with no `auth.json` shows a "ایجاد حساب مدیر" (create admin) form instead of the login form; the form is only served from loopback (`127.0.0.1`)
- **After server restart:** admin sees toast «نشست شما منقضی شده است، دوباره وارد شوید» and the login modal opens automatically; role drops to customer
- **Login rate limiting:** 6th wrong password attempt within 5 minutes → 429 with Persian error
- **Admin endpoints:** all now require `Authorization: Bearer <token>` header — returns 401 without it
- **Security headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` on every response
- **Static assets:** `/server/`, `/backend/`, `/data/`, `/package.json`, `/Library/`, dotfiles, `..` tricks → 404
- **Env override:** `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars create an in-memory credential (no auth.json written)

**Risks / could not verify:**
- Manual first-run flow on a fresh clone (requires running `Start.bat` on the server PC) — automated test covers the API contract but not the browser rendering of the setup form
- `change-password` endpoint is wired in server.js but no admin-panel UI dialog was added (P1a scope was S1/S2/S3/S8/S10 only; the dialog is a small addition for a future phase)

**Discovered (out of scope):**
- SEC-03 (path traversal in createMovie) — `POST /api/movies` can still write outside `Library/` via crafted id/genre; needs S4 safe-path module
- SEC-04 (XSS) — inline `onerror=` handlers still execute; needs S5 html.js + CSP
- SEC-06 (WS hardening) — oversized payloads and unvalidated selection objects accepted; needs S9
- SEC-08 (API output whitelist) — `absolutePosterPath` still leaked in `/api/movies`; needs S7 toPublicMovie()
- DATA-01 through DATA-18 — all unchanged (not in P1a scope)
- ARCH-01 — `/api/movies` meta.version still `"3.0"` vs `"5.4.0"` in package.json

**Questions for the owner:**
1. Should the `change-password` UI dialog be added in P1a or deferred to a later phase? (Currently the endpoint exists but there's no button/dialog in the admin panel to call it)
2. Is the env-override flow (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) acceptable as-is, or should it also support reading from a file for non-Docker headless installs?
