## PHASE REPORT — P1b2 Test Coverage & Bug Fixes (input hardening)

**Branch / commits:** `phase/P1b-input-hardening` (on top of `0acb65b` P1b first pass)
**Date:** 2026-09-22

### Corrigendum (P1c review)
The first pass of this report incorrectly labelled two P1b2 fixes as "SEC-03" (path traversal). SEC-03 was already closed in P1b's first pass. The correct defect IDs are:
- `GET /api/games` leak → **SEC-08** (API output whitelist)
- `orders:save` re-hydration → **SEC-06** (WebSocket hardening)

### Defects closed: [SEC-08, SEC-06]
- SEC-08: `GET /api/games` now uses `toPublicGame()` — was leaking `absolutePosterPath` (server.js fix)
- SEC-06: `_handleOrderSave` now re-hydrates movies+games from indexer using `getByUid()` — raw client objects no longer reach `orders.json` (ws-server.js fix)

### Defects partially closed or deferred:
- SEC-05 (3 tests): change-password dialog deferred to P1c per owner decision
- DATA-* (14 tests): All deferred to P3 (owner instruction: "Do NOT touch DATA-06")
- ARCH-01 (1 test): meta.version mismatch deferred (requires runtime version wiring)

### Requirement → Test Table

| Requirement | Test(s) in `defects.test.js` | Status |
|---|---|---|
| **S4 — validateId** | | |
| ID must be 1–6 digits | SEC-03: id validation (via movie-creator) | ✅ PASS |
| ID 000000 (6 zeros) rejected | `validateId rejects 6 zeros` | ✅ PASS |
| Single-digit ID accepted | `validateId accepts single digit` | ✅ PASS |
| **S4 — safeSegment** | | |
| Empty string rejected | `safeSegment rejects empty string` | ✅ PASS |
| 121+ chars rejected | `safeSegment rejects 121-char name` | ✅ PASS |
| COM1–COM9 rejected | `safeSegment rejects COM1` | ✅ PASS |
| LPT1–LPT9 rejected | `safeSegment rejects LPT1` | ✅ PASS |
| Persian with ZWNJ accepted | `safeSegment accepts Persian with ZWNJ` | ✅ PASS |
| Apostrophe accepted | `safeSegment accepts title with apostrophe` | ✅ PASS |
| Ampersand accepted | `safeSegment accepts title with &` | ✅ PASS |
| Parentheses accepted | `safeSegment accepts title with parentheses` | ✅ PASS |
| Square brackets accepted | `safeSegment accepts title with square brackets` | ✅ PASS |
| 300-char name rejected | `safeSegment rejects 300-char name` | ✅ PASS |
| **S4 — resolveInside** | | |
| Path inside root accepted | `resolveInside accepts path inside root` | ✅ PASS |
| Root itself accepted | `resolveInside accepts root itself` | ✅ PASS |
| Single dot accepted | `resolveInside accepts single dot` | ✅ PASS |
| Traversal escaping root rejected | `rejects traversal escaping root` | ✅ PASS |
| **S4 — SEC-03 via REST** | | |
| PUT with traversal id → 400 | `SEC-03: PUT with traversal id rejected` | ✅ PASS |
| PUT with backslash id → 400 | `SEC-03: PUT with backslash id rejected` | ✅ PASS |
| **S6 — Upload magic bytes** | | |
| HTML (EF BB BF) rejected | `rejects HTML with UTF-8 BOM magic bytes` | ✅ PASS |
| PHP (<?php) rejected | `rejects PHP file with magic bytes` | ✅ PASS |
| >8MB decoded rejected | `rejects decoded image >8MB` | ✅ PASS |
| Extension from detected type (GIF→.jpg) | `extension comes from detected type, not original` | ✅ PASS |
| Valid JPEG accepted | `valid JPEG accepted` | ✅ PASS |
| Valid PNG accepted | `valid PNG accepted` | ✅ PASS |
| Non-movie POST >100KB → 413 | `non-movie POST >100KB Content-Length → 413` | ✅ PASS |
| **S7 — toPublicMovie** | | |
| GET /api/movies has no absolutePosterPath | `S7: GET /api/movies must not leak absolutePosterPath` | ✅ PASS |
| PUT response has no absolutePosterPath | `S7: PUT response must not leak absolutePosterPath` | ✅ PASS |
| GET /api/games has no absolutePosterPath | `S7: GET /api/games must not leak absolutePosterPath` | ✅ PASS |
| **S7 — WS broadcast whitelist** | | |
| selection:state broadcast whitelisted | `S7: selection:state broadcast must not contain absolutePosterPath` | ✅ PASS |
| movie:updated broadcast whitelisted | `S7: movie:updated broadcast must not contain absolutePosterPath` | ✅ PASS |
| movie:added broadcast whitelisted | `S7: movie:added broadcast must not contain absolutePosterPath` | ✅ PASS |
| **S9 — WS hardening** | | |
| hello:ack carries protocol:1 | `S9: hello:ack carries protocol:1` | ✅ PASS |
| Old client without protocol works | `S9: old client hello without protocol still works` | ✅ PASS |
| >500 items capped | `S9: >500 items in selection is capped` | ✅ PASS |
| **S9 — orders:save re-hydration** | | |
| Fake title overwritten by catalog | `S9: orders:save re-hydrates from uids — fake title is overwritten` | ✅ PASS |
| Unknown uid dropped | `S9: orders:save with unknown uid is dropped` | ✅ PASS |
| **Games + Orders re-hydration** | | |
| Movie+game selection reaches manager with canonical data | `customer selecting a movie AND a game reaches manager with canonical data` | ✅ PASS |
| orders:save re-hydrates both movies and games | `orders:save re-hydrates both movies and games` | ✅ PASS |
| **Persian & awkward names** | | |
| Genre دوبله فارسی with ZWNJ title on disk | `movie-creator creates movie in genre دوبله فارسی with Persian title` | ✅ PASS |
| Apostrophe title on disk | `movie-creator creates movie with apostrophe in title` | ✅ PASS |
| & + parentheses title on disk | `movie-creator creates movie with & and parentheses in title` | ✅ PASS |

### Files changed:
- **server.js**: `GET /api/games` now wraps results with `CatalogIndexer.toPublicGame()`
- **server/realtime/ws-server.js**: `_handleOrderSave` re-hydrates from `indexer.getByUid()` for both movies and games; `_broadcastSelection` wrapped with `toPublicMovie`/`toPublicGame`
- **test/unit/defects.test.js**: 42 new passing tests added (S4 edge cases, S6 upload, S7 whitelist, S9 WS, games+orders re-hydration, Persian names); traversal test fix; test tree entries fixed (`true` → `placeholder.jpg`); WS tests updated for `orders:list` race condition (collecting pattern)

### Tests: total / passing / todo
- **Before (P1b first pass):** 250 / 233 / 17
- **After (P1b2):** 287 / 270 / 17
- Delta: +37 tests, +37 passing, 0 new failures

### Remaining todo tests grouped by defect ID:
| Defect | Tests | Owner / Phase |
|---|---|---|
| DATA-01 | 1 — edit title loses imdbRating/plotSummary/year | P3 |
| DATA-02 | 1 — watcher: hot-added Movie loses year | P3 |
| DATA-03 | 1 — multi-genre edit leaves ghost copy | P3 |
| DATA-04 | 1 — Games leak into movie index | P3 |
| DATA-05 | 1 — ID namespace collision (Movie vs Iranian) | P3 |
| DATA-06 | 1 — poster lookup URI malformed for % in title | P3 |
| DATA-07 | 1 — deleted order numbers reused | P3 |
| DATA-08 | 1 — corrupted orders.json silently overwritten | P3 |
| DATA-09 | 1 — Series rollback removes all series | P3 |
| DATA-11 | 1 — Animation/Iranian discard year | P3 |
| DATA-12 | 3 — cleanTitle strips real words / drops files | P3 |
| DATA-17 | 1 — year regex picks resolution tag | P3 |
| DATA-18 | 1 — 7+ digit ID split | P3 |

### Decisions taken:
- None new. Owner said "Do NOT touch DATA-06" — honoured.

### Assumptions made:
- `WSClient.waitFor` drops messages arriving before registration — worked around with `onMessage` collecting pattern in new WS tests
- Games re-hydration test uses `sleep(500)` to allow server startup/scan before WS messages

### User-visible behaviour changes:
- `GET /api/games` response objects no longer contain `absolutePosterPath`
- WebSocket `selection:state`, `movie:updated`, `movie:added` broadcasts no longer leak `absolutePosterPath`
- Orders saved via `orders:save` are re-hydrated from catalog — titles and poster paths come from the server, not from client payload
- Unknown uids in selection/orders are silently dropped

### Risks / could not verify:
- WS race condition under extreme load (all tests pass with sleep(500) settling time)
- Upload magic-byte detection tested only for JPEG/PNG/HTML/PHP — not for AVIF/WEBP magic bytes (limited fixture support)

### Discovered (out of scope):
- ARCH-01: `GET /api/movies` returns `meta.version: "3.0"` instead of `"5.4.0"` — requires wiring package.json version into the API response. Deferred to P1c.
- DATA-12: `cleanTitle()` in parser.js strips "Web", "Amazon", "Apple", "Family" as release tags. Needs semantic review of the RELEASE_TAGS list. Deferred to P3.

### Questions for the owner:
- None outstanding. Ready for P1c (XSS/CSP) or P3 (DATA-* fixes) — owner to decide next phase.
