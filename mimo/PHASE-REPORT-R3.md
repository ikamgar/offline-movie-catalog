# PHASE REPORT — R3 validation and auth hardening (F29, F30, F32, F35, F36, F38, F39, F40)

Branch / commits: `fix/R3-validation-auth` (branched from `fix/R2-integrity` at `3af54f0`).
Commits (in order):
- `b639467` chore: lockfile-only audit fix (body-parser 1.20.8→1.20.9, qs 6.16.0→6.16.2)
- `b9e59ea` fix: F31 watcher removes dropped game platforms and deleted games
- `74eb9f8` fix: F29/F36 shared input validator for create/edit/preview routes
- `502470f` fix: F35/F39/F40 auth hardening + global API JSON error middleware
- `23d02c6` fix: F30 logout accepts Authorization header OR body token
- `1b075a4` fix: F38 thumbs fail-open when ensureDir throws
- `1855095` docs: R3 error codes, auth storage, lockout recovery, F32 upload validation

Working tree: clean. No new runtime dependencies, no WebSocket protocol change, local commits only.

## PART A — Leftovers (done first)

### a) Task 0 items from the R2 prompt — all completed during R2

| Item | Result |
|------|--------|
| F27 grep in AUDIT.md | F27 in `AUDIT.md:3651` = "TRIVIAL: ui-stub hard-codes `protocol: 3` literal". "cipher re-wrap / stream start" appears NOWHERE in repo/audits — only a mismatched line in `mimo/PHASE-REPORT-R1.md:95` ("F27 (cipher re-wrap, MEDIUM) stays OUT of R1") which mis-describes F27. |
| Perf comparison table | HEAD 10 runs (longTasks: `[]`×9, `[60]`×1); P7c@93ca986 / P8a@9e2d00f / P8b@3bcefbd / P8c@0bae885 5 runs each all `longTasks:[]`. No phase exceeds the 100 ms budget; long tasks do NOT first appear after any specific phase. |
| R1 raw outputs copied | `mimo/audit-evidence/r1/` contains committed p9b/p9c outputs (committed `e8b8431`, 22+21 files). |
| Guard-exemption walks registered routes | `guard-exemption.test.js` enumerates registered routes (regex over `server._router.stack`) plus `POSTER_BODY_ROUTES` source text — no change needed. |
| bec23bf readiness vs retry | Replaced bounded retry (3×4 s) with deterministic wait for `#mediaModeToggle button[data-mode="games"]` then single click — committed `4952425`. |

### b) npm audit

Before: 2 vulnerabilities — body-parser `<1.20.9` (high, GHSA-27r3-jxmh-p828, DoS via trailing bytes after compressed body) and qs `6.7.0–6.16.0` (moderate, GHSA-6pq8-jhm2-2vcw, DoS via non-callable own toString on comma arrayFormat).

Action: `npm audit fix` (lockfile-only, within semver) — body-parser 1.20.8→1.20.9, qs 6.16.0→6.16.2. Patch upgrades of the Express tree; not new runtime dependencies (D9 permits patch bumps).

After: `npm audit --omit=dev` → **0 vulnerabilities**.

Remaining: 5 moderate findings in dev dependencies (eslint chain, minimatch) require `--force`/major version — stopped per D9 (no new deps; major upgrades need owner decision). Reachability note: body-parser/qs are runtime deps of Express itself (request-body parsing, query parsing) — reachable on every HTTP request, so the patch upgrades are security-relevant; the dev-dep eslint findings are tooling-only, not reachable in the served app.

### c) F31 watcher path

Confirmed the defect: `watcher._reconcileGames()` used `indexer.processGameResults()` which only **adds** platforms/games — never removes. Deleting one platform's poster left it in the index until a manual rescan.

Fix: `_reconcileGames()` now uses `indexer.replaceGames()` (build aside, swap in one synchronous step). Dropped platforms and deleted games are naturally absent from the new map; `replaceGames()` calls `_notifyChange()` so the cached `/api/games` payload is refreshed at the indexer source.

Tests added in `test/unit/watcher.test.js`: "F31: watcher removes a dropped game platform" (red before fix → PS5 stayed in index; green after → platforms: ['PS4']) and "F31: watcher removes a game when all its files are deleted" (red before → game stayed indexed; green after → 0 games).

### d) F3 — false-positive evidence

Demonstrated that F3 tests pass **with and without** the explicit `notifyChanged()` calls in game-creator, game-editor, movie-trash (delete+restore). Reason: indexer internals (`processGameResults` indexer.js:947, `removeGame` indexer.js:1031) already call `_notifyChange()` — added in P8c commit `d0b8514` (ancestor of the P9 audit). The explicit `notifyChanged()` calls are kept as defense-in-depth at the callers (matching movie-editor's P8c c4 pattern). The F3 unit test asserts each game service notifies `idx.onChange` without HTTP — passes both ways, proving the runtime gap was already closed.

### e) UI suite — 3 consecutive runs after the last commit

All runs: functional suite **78 pass / 0 fail**, isolated perf process **1 pass / 0 fail**.

- Run 1: tests 78 / pass 78 / fail 0; perf tests 1 / pass 1 / fail 0 (P4-C5: firstPaintFullMs 328, selectMs 13, longTasks [], searchMs 259)
- Run 2: tests 78 / pass 78 / fail 0; perf tests 1 / pass 1 / fail 0
- Run 3: tests 78 / pass 78 / fail 0; perf tests 1 / pass 1 / fail 0

## PART B — Fixes

### 1. F29/F36 + preview — shared input validator

Created `backend/utils/validate-input.js` — one type guard used by POST /api/movies, POST /api/games, PUT /api/movies/by-uid/:uid, PUT /api/movies/:id and POST /api/movies/preview. Validates id (string, `^\d{1,6}$`), type (MEDIA_TYPES), title (string, length cap 200/120 game), year (number, 1900–2099 Movie), genres (array of non-empty strings, max count/len), poster (string data URL or bare base64). Wrong-typed/malformed input → structured 400 with code + Persian message, never 500 with raw JS text. Preview runs the same validation as create.

Tests: matrix of bad inputs per route (genres as string → GENRE_INVALID 400, numeric id → ID_INVALID 400, null/array title → TITLE_INVALID 400, object poster → IMG_INVALID 400, 300-char strings → TITLE_INVALID 400, path characters → TITLE_INVALID 400) → all 400, no file created, index unchanged.

### 2. F35 — orders:error never forwards raw OS/JS text

`_saveToDisk()` in `server/orders/order-manager.js` now logs the raw OS detail (`EPERM: …`) server-side and sends only the Persian message `ذخیره سفارش‌ها در دیسک انجام نشد`. `sendEditError`/`sendCreateError` in `server.js` send a generic Persian 500 (`خطای پیش آمده است`) for non-structured errors; only structured `fail()` errors (code + Persian message) expose their text.

Global error middleware for all `/api` routes returns JSON only — no HTML, no stack, no raw English message; raw text logged server-side.

Test: F35 order-manager save-failure test — raw OS text (EEXIST/ENOENT/EPERM/tmp/absolute paths) not forwarded; Persian message present.

### 3. F39/F40 — auth.json hardening

- Writes use `writeJsonAtomic` (atomic tmp+rename) instead of non-atomic `writeFileSync`.
- Unusable auth.json (unparseable, or valid JSON with malformed hash/salt fields) is quarantined to `auth.corrupt-<timestamp>.json`, a plain-words warning logged, app returns to first-run setup (loopback only; LAN setup still 403).
- When auth.json cannot be written, setup and change-password return `PERSIST_FAILED` (Persian) and in-memory credentials are NOT changed.
- Global `/api` error middleware: JSON only, no HTML/stack/raw English.

Tests: auth.test.js characterization (F39/F40), quarantined file kept, LAN client cannot run setup.

### 4. F30 — logout accepts Authorization header OR body token

`/api/auth/logout` no longer routes through `requireAdmin` (which requires the header). It accepts either the Bearer token from the Authorization header or `token` from the body, validates the session is admin, then invalidates it (closing its WebSocket sockets via `_onLogoutCallback`). Header-only logout → next request with that token is 401.

Tests: header-only logout → 200 + subsequent request 401; body-token logout → 200 + subsequent request 401.

### 5. F38 — thumbs fail-open when ensureDir throws

`thumbs.js` `ensureDir()` catches mkdir failures (thumbs dir = file → EEXIST/EISDIR; locked → EACCES), sets `dirBlocked`, logs one line, stops retrying. `get()` returns null → poster route serves the original with 200 instead of 500 `{"error":"Poster error"}`.

Test: `data/thumbs` created as a file → `GET /api/poster/0001?w=300` → 200, original bytes served.

### 6. F32 — documented upload validation in README security notes

Uploads validated by image magic bytes (not declared MIME); stored/served with `image/*` content types + nosniff; accepted polyglot risk documented for trusted LAN.

### 7. Docs — lockout recovery

README.md: admin lockout recovery (stop via Stop.bat, delete data\auth.json, restart, set new password from server PC loopback-only; orders/ratings/catalog unaffected). `docs/راهنمای-مدیر.md`: Persian lockout-recovery section. CHANGELOG.md: new R3 block. docs/ARCHITECTURE.md: R3 error codes (ID_INVALID, TYPE_INVALID, YEAR_INVALID, GENRE_INVALID/GENRE_REQUIRED, IMG_INVALID, VALIDATION, UNAUTHORIZED); auth.json storage row updated (atomic writer, quarantine, PERSIST_FAILED).

## Verification (final)

| Command | Result |
|---------|--------|
| `npm test` | **tests 779 / pass 779 / fail 0** (baseline 757 → +22 new R3 tests; all green) |
| `node mimo/repro/repro-backend.js` | 13 fixed / 0 error (unchanged from R2 — R3 adds no regressions) |
| `npx eslint .` | Clean — 0 errors, 0 warnings |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| UI suite ×3 after last commit | Run 1: functional 78/0, perf 1/0. Run 2: 78/0, 1/0. Run 3: 78/0, 1/0. All budgets met (paint ≤300ms, select ≤50ms, no long task >100ms, search ≤50ms). |

## Files changed (grouped)

backend/utils/validate-input.js — new shared input validator (F29/F36)
backend/services/watcher.js — F31 `_reconcileGames()` uses replaceGames()
backend/services/game-creator.js — F3 notifyChanged (retained, defense-in-depth)
backend/services/game-editor.js — F3 notifyChanged (retained)
backend/services/movie-trash.js — F3 notifyChanged in game delete/restore (retained)
backend/thumbs.js — F38 fail-open on ensureDir throw
server/auth/auth.js — F39/F40 atomic writes, quarantine, PERSIST_FAILED
server.js — validator wiring (create/games/by-uid/:id/preview), sendEditError/sendCreateError F35, global API error middleware, F30 logout header+body
server/orders/order-manager.js — F35 raw OS text not forwarded
test/unit/watcher.test.js — F31 platform-drop + full-game-delete tests
test/unit/order-manager.test.js — F35 raw-OS-text suppression
test/unit/http.test.js — F30 header/body logout → 401; validator matrix
test/unit/thumbs.test.js — F38 thumbs-as-file → 200
test/unit/auth.test.js — F39/F40 characterization
CHANGELOG.md — R3 block
README.md — F32 upload validation + lockout recovery
docs/ARCHITECTURE.md — R3 error codes + auth storage row
docs/راهنمای-مدیر.md — Persian lockout recovery

## Tests: before → after

- Unit suite before R3: 773 pass / 0 fail (after R2).
- After all R3 commits: **779 pass / 0 fail** (+6 new R3 tests).
- UI suite: 3× consecutive green after final commit (78 functional + 1 perf each).

## Decisions taken

- Kept explicit F3 `notifyChanged()` calls as defense-in-depth despite runtime redundancy (indexer internals already notify) — honest reporting of the false positive rather than claiming mutation-proof.
- `npm audit fix` applied patch upgrades only (body-parser, qs); dev-dep eslint findings require --force/major — stopped per D9, flagged for owner.
- Global `/api` error middleware added (F35/F40d) returning JSON only — compatible with existing per-route handlers.

## User-visible behavior changes

- Create/edit/preview routes return structured 400s (code + Persian) for malformed input instead of 500s with raw JS text.
- Logout accepts header or body token; header-only logout now invalidates the session.
- Orders errors show only Persian message; raw OS detail logged server-side.
- Thumbnails fail open (original poster, 200) when `data/thumbs` is blocked.
- Auth setup/change-password return PERSIST_FAILED on write failure without mutating in-memory credentials; corrupt auth.json quarantined and app returns to first-run setup.

## Risks / could not verify

- F3 mutation-proof could not produce red (false positive; reported honestly).
- Could not test corrupt-auth.json LAN setup 403 beyond unit level — covered by auth.test.js + existing LAN-setup tests.

## Discovered (out of scope)

- `http.test.js:136` next-id truthiness-only assertion (S2 gap behind F14/F15) — owner follow-up.
- Orders MAX_ORDER_ITEMS=500 has no boundary test (F16).

## Questions for the owner

- Confirm F3 disposition: keep defense-in-depth `notifyChanged()` calls given the runtime gap was already closed.
- The 5 dev-dep eslint audit findings require `--force`/major version — approve a later D9 review or leave as-is.
- R3 complete; do not start R4 (per standing instruction).
