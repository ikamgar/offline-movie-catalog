## PHASE REPORT — P0b Safety-net corrections

Branch / commits: `phase/P0-safety-net` — 3 commits total
```
7bbf743 chore: import v5.4.0 baseline
941b4a8 feat(P0): testable server wrapper, characterization tests, defect safety net
aa3a9c2 test(P0b): rewrite defect tests with right-reason preconditions, add characterization coverage [SEC-01,SEC-02,SEC-03,SEC-06,SEC-08,DATA-01..09,DATA-11,DATA-12,DATA-17,DATA-18,ARCH-01]
```

Defects closed: None — this is a corrections phase, not a fixes phase.

Defects now correctly marked as failing (todo): SEC-01, SEC-02 (×9 endpoints), SEC-03, SEC-06 (×2), SEC-08, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-11, DATA-12 (×3), DATA-17, DATA-18, ARCH-01 — 30 todo tests, all fail with `✖` when todo is removed.

Previous errors fixed in defect tests:
- DATA-04: was passing because it asserted `results.length > 0` (post-fix). Now asserts `results.length === 0` (precondition: scanLibrary must not walk Games/).
- DATA-08: was passing because the "corrupted" JSON was actually valid. Now uses truly truncated JSON (missing closing brace).
- DATA-09: was passing because it called `_rollbackCatalogUpdate(null)` before `saveToDisk()`. Now calls `saveToDisk()` first, then rollback.

Files changed:
- **Modified:** `test/unit/defects.test.js` — rewritten all 30 defect tests with right-reason preconditions, port-3000 safety, static ARCH-01
- **New:** `test/unit/auth.test.js` — 9 characterization tests for auth module (validateCredentials, createSession, validateSession, invalidateSession, getSessionRole)
- **New:** `test/unit/role-provider.test.js` — 3 characterization tests for role provider (getClientRole, isValidRole, VALID_ROLES)
- **New:** `test/unit/scanner.test.js` — 9 characterization tests for scanLibrary/scanGames (shape, type classification, non-existent path, game title merging)
- **New:** `test/unit/watcher.test.js` — 6 characterization tests for LibraryWatcher (hot-add, delete, onChange, stop)
- **New:** `test/unit/diagnostics.test.js` — 5 characterization tests for Diagnostics (runFullReport, getQuickSummary, type distribution)
- **New:** `test/unit/movie-creator.test.js` — 8 characterization tests for MovieCreator (happy path, validation, backup, unique ID)

Tests: total / passing / todo — before P0b → after P0b
- Unit tests: 138 → 180 (net +42: 30 new characterization tests + 2 newly-correct todo markers)
- Passing: 110 → 150
- Failing: 0 → 0
- Todo: 28 → 30 (DATA-04 and DATA-09 now correctly fail as todo; SEC-02 gained 7 new endpoint tests)
- UI tests: 4 → 4 (all todo, all fail)
- **Combined: 184 total / 150 pass / 0 fail / 34 todo**

Decisions taken: None — no owner decisions required for this phase.

Assumptions made:
- The Playwright browser was already partially installed; Chromium download completed during this session.
- The `docs/TESTING.md` file from P0 was not modified in P0b.

User-visible behaviour changes: None — zero product changes, zero application behaviour changes.

Risks / could not verify:
- DATA-12 (cleanTitle edge cases): characterization tests cover the known good cases; the defect remains todo.
- DATA-17 (resolution-tag year parsing): covered only by defect todo test, no characterization test added.
- The watcher characterization tests rely on timing (100 ms wait for file system propagation); on very slow disks they could be flaky.

Discovered (out of scope):
- `server/realtime/selection-state.js` exists but is never imported — dead code (noted in baseline).
- `backend/indexer.js` uses `require('./parser')` — no issues found during this phase.

Questions for the owner: None.

### Safety proof

**Port 3000 safety:** A dummy HTTP listener was started on port 3000. All 180 unit tests ran. The listener received **zero requests**. No test uses port 3000.

**Fresh git clone:** Cloned `phase/P0-safety-net` to a clean temp directory, ran `npm ci && node --test test/unit/*.test.js`. Result: **180 tests, 150 pass, 0 fail, 30 todo**. Clean boot from `npm start`.

**Repro scripts:** `repro-backend.js` reports **13 PRESENT, 0 FIXED**. `repro-ui.js` reports **4 PRESENT, 0 FIXED**. No regressions introduced.
