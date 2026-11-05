# P7 — Quality gates, single source of truth, documentation, CI

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P7-quality-docs-ci.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P6 · **Closes:** ARCH-01, ARCH-02, ARCH-03 (rest), FE-09 (rest) · **Branch:** `phase/P7-quality-docs`

## Goal
The project explains itself, refuses to regress, and has exactly one place for every constant: version, media types, labels, extensions, colours, roles.

## Tasks

**F1 — Lint.** Add ESLint (dev dependency, flat config): `eslint:recommended`, `no-unused-vars`, `eqeqeq`, `no-implicit-globals`; separate environments for `js/**` (browser, ES modules) and `backend/**`, `server/**`, `server.js`, `scripts/**`, `test/**` (Node, CommonJS). `npm run lint` must be clean by **fixing** findings, not by mass-disabling. No formatter churn: run Prettier only if the owner asks (STOP-GATE).

**F2 — Version and constants: one source each (ARCH-01, ARCH-03).**
- Version comes from `package.json` only. Delete every hard-coded `5.4.0` (`server.js` ×3, `js/app.js`, indexer meta, `.bat` files, `/api/movies` meta that still says `3.0`). Add `GET /api/config` → `{version, mediaTypes, typeLabels, badgeLabels, pinnedGenres, imageExtensions, protocol}`; the front-end reads it once in `boot()` and stops declaring its own copies. `.bat` files print the version via `node -p "require('./package.json').version"`.
- One module per side for: media-type list, image extensions, genre colour map, series-key normaliser, filename builder (server) — grep must show a single definition each.
- Role naming: keep the wire names (`admin` client/REST, `manager` WS) but define the mapping in **one** documented place.

**F3 — Types by JSDoc.** Add `@typedef`s (Movie, Game, Order, OrderMovie, WsMessage variants, ApiError) in `docs/types.js` (comments only) and annotate public functions. Optional stricter check with `tsc --noEmit --allowJs --checkJs` is a **STOP-GATE** (adds a dev dependency) — propose it in the report, do not add it unasked.

**F4 — Documentation.**
- `README.md` rewritten and **accurate**: what the app is; screenshots optional; quick start (Windows `install.bat`/`Start.bat`, Linux/macOS `npm ci && npm start`); Library layout with real examples (posters, not videos; numeric IDs ≤ 6 digits; Series/Games rules; `Series` vs `Serries`); filename cheat-sheet per type; first-run admin setup; environment variables (`PORT`, `LIBRARY_PATH`, `DATA_DIR`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, `DEBUG_SCAN`, `LIBRARY_POLL_SEC`); how selection really works (D1); backups and restore; troubleshooting via the diagnostics panel; security notes (LAN only, plain HTTP).
- `docs/ARCHITECTURE.md`: module map, data flow (scan → index → API → store → components), REST table, WS protocol table with payloads, invariants I1–I12, storage files and their owners.
- `docs/راهنمای-مدیر.md`: one-page **Persian** owner guide (folders, naming, adding movies, orders, backups, what to do when a poster does not appear).
- `docs/CONTRIBUTING.md`: branch/commit rules, how to run lint/tests/UI tests/repro scripts, how to add a defect test.
- `CHANGELOG.md` (Keep a Changelog): one entry per phase P0–P7 with the defect IDs closed.
- `LICENSE`: **ask the owner** (STOP-GATE) — do not invent one.

**F5 — CI.** `.github/workflows/ci.yml`: matrix `ubuntu-latest` + `windows-latest` × Node 18 / 20 / 22 running `npm ci`, `npm run lint`, `npm test`; a separate Ubuntu/Node 22 job installs Playwright Chromium and runs `npm run test:ui`, uploading screenshots/traces on failure. `.github/dependabot.yml` (npm, weekly, grouped). `npm audit --omit=dev` must be clean or each finding documented.

**F6 — Repo hygiene.** `.editorconfig` (utf-8, LF, 2 spaces; `.bat` CRLF), `.gitattributes` (`* text=auto eol=lf`, `*.bat text eol=crlf`), tidy `package.json` (`name`, `description`, `private:true`, `license`, `engines`, `scripts`), remove stale `.gitignore` lines.

## Constraints
- No behaviour changes except removing duplicated definitions; all tests must stay green after every commit.
- Persian text only in the Persian guide and UI; everything else English.
- Do not add runtime dependencies; dev dependencies limited to ESLint (+ plugin-free config).

## Acceptance criteria
1. `npm run lint` exits 0; CI green on the full matrix (link the run, or paste the local matrix results if CI cannot run).
2. `grep -R "5\.4\.0" --include=*.js --include=*.bat --include=*.html .` (excluding `CHANGELOG.md`, `package-lock.json`, `node_modules`) returns nothing; changing `package.json` version changes the UI badge and `/api/config`.
3. Each constant in F2 has exactly one definition (paste the grep evidence).
4. README quick-start verified on a **clean clone** by following it literally (record the commands and outcome).
5. `docs/` contains the four documents; the Persian guide is checked for RTL rendering in a Markdown viewer.
6. Defect register updated: every closed ID marked with commit/test evidence.

## Report
PHASE REPORT + the exact clean-clone transcript for acceptance criterion 4.
