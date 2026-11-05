## PHASE REPORT — P0d Safety-net final fixes

Branch / commits: `phase/P0-safety-net` — 5 commits total
```
7bbf743 chore: import v5.4.0 baseline
941b4a8 feat(P0): testable server wrapper, characterization tests, defect safety net
aa3a9c2 test(P0b): rewrite defect tests with right-reason preconditions, add characterization coverage
2f5eddc test(P0b): strengthen ARCH-01, scanner, watcher, movie-creator tests [ARCH-01,DATA-04]
8c53829 test(P0d): real-app UI tests, SEC-06 preconditions, docs
```

Defects closed: None — safety-net phase, no product fixes.

Defects with todo tests: 23 unique IDs (35 individual test cases):
- SEC-01 (×1), SEC-02 (×9), SEC-03 (×1), SEC-06 (×2), SEC-08 (×1)
- DATA-01 (×1), DATA-02 (×1), DATA-03 (×1), DATA-04 (×1), DATA-05 (×1), DATA-06 (×1), DATA-07 (×1), DATA-08 (×1), DATA-09 (×1), DATA-11 (×1), DATA-12 (×3), DATA-17 (×1), DATA-18 (×1)
- ARCH-01 (×2)
- FE-01 (×1), FE-02 (×1), SEC-04 (×1), FE-04 (×1)

### Failure-reason table (all 35 defect tests)

Every test below is `{ todo: '<ID>' }` and fails with a **measured value** when todo is removed.

| ID | File:line | First line of failure |
|---|---|---|
| SEC-01 | defects.test.js:99 | `actual: 200, expected: 200` — server serves `/server/auth/auth.js` at 200 |
| SEC-02 | defects.test.js:116 | `400 !== 401` — POST /api/movies returns 400 (missing body validation) not 401 |
| SEC-02 | defects.test.js:123 | `404 !== 401` — PUT /api/movies/0001 returns 404 (not found) not 401 |
| SEC-02 | defects.test.js:130 | `200 !== 401` — GET /api/movies/next-id returns 200 without auth |
| SEC-02 | defects.test.js:137 | `200 !== 401` — POST /api/rescan returns 200 without auth |
| SEC-02 | defects.test.js:144 | `200 !== 401` — POST /api/games/rescan returns 200 without auth |
| SEC-02 | defects.test.js:151 | `200 !== 401` — GET /api/diagnostics returns 200 without auth |
| SEC-02 | defects.test.js:158 | `200 !== 401` — GET /api/orders returns 200 without auth |
| SEC-02 | defects.test.js:165 | `404 !== 401` — GET /api/orders/:id returns 404 (not found) not 401 |
| SEC-02 | defects.test.js:172 | `200 !== 401` — POST /api/auth/logout returns 200 without auth |
| SEC-03 | defects.test.js:183 | `should reject traversal id` — createMovie accepted `../../../evil` as id |
| SEC-06 | defects.test.js:211 | `server must close connection for oversized payload` — server did not close WS for 5000-item payload |
| SEC-06 | defects.test.js:253 | `'<img onerror="window.__x=1">'` — server passes through XSS payload unsanitized |
| SEC-08 | defects.test.js:319 | `'C:\\Users\\Ali\\AppData\\...'` — GET /api/movies leaks `absolutePosterPath` |
| DATA-01 | defects.test.js:340 | `undefined !== 8.3` — PUT + watcher loses `imdbRating` |
| DATA-02 | defects.test.js:376 | `null !== 2021` — hot-added Movie gets `year: null` (watcher calls parseFilename without type) |
| DATA-03 | defects.test.js:407 | `2 !== 1` — editing one copy of multi-genre movie creates ghost duplicate |
| DATA-04 | defects.test.js:432 | `2 !== 0` — scanLibrary returns 2 results from Games/ folder |
| DATA-05 | defects.test.js:451 | `expected >= 2 movies but got 1` — Movie 0001 and Iranian 0001 collide |
| DATA-06 | defects.test.js:472 | `doesNotThrow` — poster lookup throws URIError for title containing `%` |
| DATA-07 | defects.test.js:491 | `actual: 'order-0002', expected: 'order-0002'` — new order reuses deleted order number |
| DATA-08 | defects.test.js:513 | `assert.ok(preserved, ...)` — corrupted orders.json overwrites history silently |
| DATA-09 | defects.test.js:537 | `_rollbackCatalogUpdate(null) must not remove Series (had 2, now 1)` |
| DATA-11 | defects.test.js:566 | `null !== 2006` — Animation filename year is discarded |
| DATA-12 | defects.test.js:579 | `cleanTitle("Charlotte's Web") !== "Charlotte's Web"` — strips "Web" |
| DATA-12 | defects.test.js:585 | `cleanTitle("The Amazon") !== "The Amazon"` — strips "Amazon" |
| DATA-12 | defects.test.js:588 | `parseFilename("0001- Apple 2020.jpg", "Movie")` returns null — title is empty after strip |
| DATA-17 | defects.test.js:598 | `null !== 2008` — year regex picks `[1080p]` instead of `(2008)` |
| DATA-18 | defects.test.js:612 | `actual: '123456', expected: '123456'` — 7-digit ID split: `1234567` → `123456` |
| ARCH-01 | defects.test.js:626 | hardcoded version strings in source files must match package.json (multiple files) |
| ARCH-01 | defects.test.js:674 | `'3.0' !== '5.4.0'` — /api/movies meta.version is "3.0", package.json is "5.4.0" |
| FE-01 | ui.test.js:49 | `cards 400 -> 40, scrollTop 68784 -> 6675, MovieCard.render() calls: 480` |
| FE-02 | ui.test.js:78 | `open WebSockets: 4, Workers: 1 -> 4` — rescan spawns extra sockets/workers |
| SEC-04 | ui.test.js:110 | `grid executed: true, detail executed: true` — XSS payloads ran in both views |
| FE-04 | ui.test.js:118 | `poster src: data:image/svg+xml | script errors: Unexpected identifier 's'` — apostrophe in title breaks onerror |

### What changed in P0d

1. **Real-app UI tests:** `test/ui/ui.test.js` rewritten to use `test/helpers/ui-stub.js` which serves the real `index.html`, `js/`, and `css/` from the project root. Pattern taken from `mimo/repro/repro-ui.js`. All 4 UI tests run against the real app with measured values matching the repro script exactly.
2. **SEC-06 preconditions:** Both SEC-06 tests now first send a small valid selection and assert the manager receives it, proving the WS pipeline works before testing the attack payload. Also tests null/non-array payloads.
3. **Fake fixtures deleted:** `test/ui/fixtures/` removed — no longer needed since we serve the real app.
4. **docs/TESTING.md updated** with real-app test architecture, Playwright requirements, and security constraints.
5. **mimo/PHASE-REPORT-P0b.md** committed (was previously untracked).
6. **Server diff captured:** `C:\Users\Ali\Documents\GitHub\p0-server.diff` (715 lines).
7. **Route comparison:** baseline vs current server.js — identical methods, paths, and ORDER.
8. **npm start captured:** PORT=3077, banner "MovieCatalog Server v5.4.0", `curl -i /` → 200 OK, `curl -s /api/movies` → empty catalog.

### Files changed

- **Modified:** `test/unit/defects.test.js` — SEC-06×2 rewritten with preconditions + validation, SEC-03 precondition added
- **Modified:** `test/ui/ui.test.js` — complete rewrite: 4 Playwright tests against real app
- **Modified:** `test/helpers/ui-stub.js` — complete rewrite: serves real app files + fakes /api/* + raw WS handshake
- **Modified:** `docs/TESTING.md` — real-app test architecture, Playwright section, security constraints
- **Deleted:** `test/ui/fixtures/index.html` — no longer needed
- **Added (committed):** `mimo/PHASE-REPORT-P0b.md`

### Tests: total / passing / todo

| Suite | Before P0d | After P0d |
|---|---|---|
| Unit (test/unit/*.test.js) | 180 / 150 pass / 30 todo | 194 / 163 pass / 31 todo |
| UI (test/ui/ui.test.js) | 4 / 0 pass / 4 todo | 4 / 0 pass / 4 todo |
| **Combined** | **184 / 150 pass / 34 todo** | **198 / 163 pass / 35 todo** |

Change: +14 unit tests (SEC-02 gained 7 endpoint tests in P0b that counted in 180; the extra 14 comes from SEC-06 preconditions + DATA-12 subs + ARCH-01 static scan). UI: 0 change in count, complete rewrite in approach.

### Decisions taken

None — no owner decisions required.

### Assumptions made

- The `test/helpers/ui-stub.js` serves real `index.html`, `js/`, and `css/` from the project root. This is intentional and matches the repro script pattern.
- The WS handshake in `ui-stub.js` is a raw HTTP upgrade (not using the `ws` library) — functional for testing but not production-quality.
- Playwright Chromium was already installed during earlier sessions.

### User-visible behaviour changes

None — zero product changes, zero application behaviour changes.

### Risks / could not verify

- FE-01, FE-02, SEC-04, FE-04: all 4 UI tests are `{ todo }` and only **measured** the defect. Actual fixes are deferred to P4/P1/P5.
- SEC-05 (hard-coded credentials), SEC-07 (CORS *), DATA-10 (metadata in cache-only), DATA-13–15, FE-03, FE-05–FE-15, ARCH-02–07: no todo tests exist. These are 24 defect IDs covered only by the defect register.
- The watcher characterization tests rely on 1600 ms timing; on very slow disks they could be flaky.
- The `ui-stub.js` WS handshake is minimal (no ping/pong, no frame fragmentation). Tests that need more WS features would need the full `ws` library.

### Discovered (out of scope)

- `server/realtime/selection-state.js` exists but is never imported — dead code (noted in P0b baseline).
- The `ARCH-01` static scan found hardcoded version strings in `server.js` (3 places), `app.js` (1), `indexer.js` (1), `index.html` (1), and `Start.bat`/`install.bat` (1 each). These will need a centralized version source in a later phase.

### Repro scripts

- `repro-backend.js`: **13 PRESENT, 0 FIXED**.
- `repro-ui.js`: **4 PRESENT, 0 FIXED**. Measured values match UI test output exactly.

### Safety proof

**Port 3000 safety:** Proven in P0b — a dummy HTTP listener on port 3000 received **zero requests** during the full unit test run.

**Fresh git clone:** Cloned `phase/P0-safety-net` to a clean temp directory, ran `npm ci && node --test test/unit/*.test.js`. Result: **194 tests, 163 pass, 0 fail, 31 todo**. Clean boot from `npm start`.

**npm start:** PORT=3077 starts cleanly. `curl -i /` → 200 OK. `curl -s /api/movies` → empty catalog `{"meta":{"version":"3.0",...},"movies":[]}`. No console errors.
