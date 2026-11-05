# P0 — Safety net: baseline, testable server, regression tests

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P0-safety-net.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** nothing · **Closes:** ARCH-01 (tests part), ARCH-07 · **Branch:** `phase/P0-safety-net`
**Mode:** start read-only (plan), then build. **Do not fix any functional defect in this phase** — only make them measurable.

## Goal
Give the project a trustworthy safety net so every later phase can change code without fear: a reproducible baseline, a testable server, characterization tests that pin today's *correct* behaviour, and one failing-by-design (`todo`) test per known defect.

## Tasks
1. **Baseline.** If the folder is not a git repo: `git init`, commit everything as `chore: import v5.4.0 baseline`. Tag `baseline-5.4.0`. Create the phase branch. Confirm `.gitignore` excludes `node_modules/`, `data/`, `Library/`.
2. **package.json.** Add `"engines": {"node": ">=18"}` (D8). Scripts: `test` → `node --test` ; `test:ui` → `node --test test/ui` ; `test:repro` → `node mimo/repro/repro-backend.js`. Dev-dependency (allowed by D9): `playwright`. Run `npm install` once so `package-lock.json` is consistent.
3. **Make the server testable — zero behaviour change.** In `server.js` wrap everything currently executed at import time into `createServer(options)` returning `{ app, httpServer, indexer, orderManager, wsServer, start(), stop() }`. Options: `port` (default env `PORT` or 3000; `0` = random), `libraryPath` (env `LIBRARY_PATH`), `dataDir` (**new** env `DATA_DIR`, default `./data`), `quiet` (suppress banner/logs). Route handlers, paths and log lines stay identical. Signal handlers (`SIGINT`/`SIGTERM`) and the auto-start run **only** when `require.main === module`. `npm start` must behave exactly as before.
4. **Test helpers** in `test/helpers/`: `fixture-library.js` (`makeLibrary(tree)` builds a temp Library from `{ 'Movies/Action/0001- Heat 1995.jpg': true, … }` using a tiny valid JPEG buffer), `test-server.js` (`startTestServer({tree})` → `{ baseUrl, wsUrl, libraryPath, dataDir, close() }` using random port + temp dirs), `ws-client.js` (promise wrapper around `ws`: `connect(role, token)`, `waitFor(type)`).
5. **Characterization tests (must PASS today)** — pin current correct behaviour:
   - parser: every filename format that parses correctly today (≥ 25 cases incl. Persian titles, `(2008)`, `.` `_` `-` separators, `.JPG`), `classifyFromPath`, `TYPE_MAP` incl. `serries`.
   - indexer: genre union across copies, Series keyed by normalised title, custom fields survive `replaceFromScan`.
   - sort (`js/utils/sort.js` via dynamic `import()`): all comparators in AGENTS I11.
   - order-manager create/list/delete/persist.
   - HTTP: `/api/movies` shape, `/api/stats`, `/api/poster/:id` 200/404, `/api/auth/login` ok/401, `/api/movies/next-id`.
   - WebSocket: hello customer/manager, invalid token, handshake timeout, selection broadcast to managers, `orders:save` round trip.
6. **Defect tests (must be `{ todo: '<ID>' }`)** — each asserts the **desired** behaviour and currently fails: SEC-01, SEC-02 (one assertion per admin endpoint), SEC-03, SEC-06 (oversized/invalid selection), SEC-08, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09 (Series rollback), DATA-11, DATA-12, DATA-17, DATA-18, ARCH-01 (single version source). Base them on `mimo/repro/repro-backend.js` but drive the **real** code paths (HTTP/WS where possible, e.g. DATA-01/03 through `PUT /api/movies/:id`). Test name must start with the defect ID.
7. **UI tests** in `test/ui/` (Playwright, stub API like `mimo/repro/repro-ui.js`): FE-01, FE-02, SEC-04, FE-04 as `todo`. They auto-skip when Playwright browsers are missing.
8. **Fixture generator** `scripts/make-fixture-library.js --out <dir> --movies 15000 --animation 2000 --iranian 1500 --series 800 --games 300`: writes tiny valid JPEGs with realistic names, including Persian titles, ZWNJ, and awkward characters (`'`, `%`, `&`, `#`, `(`, `)`). Used later for the performance budget. Deterministic (seeded).
9. **docs/TESTING.md** (≤ 40 lines): how to run each suite, how `todo` tests work, how to add a defect test.

## Constraints
- No functional fixes, no refactors beyond task 3, no formatting churn.
- Tests never touch the real `Library/` or `data/`; always temp dirs; always clean up (sockets, watchers, timers) so `node --test` exits by itself.
- Do not add dependencies other than `playwright` (dev).

## Acceptance criteria
- `npm ci && npm test` is green on a fresh clone; output shows `todo` count = number of listed defect IDs.
- Removing `todo` from any single defect test makes exactly that test fail (spot-check three).
- `npm start` on an empty folder still prints the same banner and serves `/`.
- `node mimo/repro/repro-backend.js` output is unchanged from baseline (still 13 PRESENT).
- Coverage of characterization tests includes every module under `backend/` and `server/`.

## Verify
```
npm ci && npm test
npm run test:ui          # may skip if Playwright browsers are not installed
node mimo/repro/repro-backend.js
PORT=3055 npm start      # curl http://localhost:3055/api/movies
```

## Report
Use the PHASE REPORT format from AGENTS.md §7. Include the list of `todo` tests with their IDs.
