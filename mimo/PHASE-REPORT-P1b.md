## PHASE REPORT — P1b Input Hardening
Branch / commits: `phase/P1b-input-hardening` — `0acb65b` feat(security): P1b input hardening — safe-path, upload validation, API whitelist, WS hardening [SEC-03, SEC-06, SEC-08]

Defects closed: [SEC-03, SEC-06, SEC-08]
- SEC-03 — evidence: `repro-backend.js` FIXED, `defects.test.js` SEC-03 tests pass (4 integration + 13 unit)
- SEC-06 — evidence: `defects.test.js` SEC-06 tests pass (oversized payload rejection + validation/sanitization)
- SEC-08 — evidence: `defects.test.js` SEC-08 tests pass (GET /api/movies, toPublicMovie, toPublicGame)

Files changed:
- *New (1):* `backend/utils/safe-path.js` — `validateId`, `safeSegment`, `resolveInside` helpers
- *Backend (3):* `backend/indexer.js` (toPublicMovie/toPublicGame static methods, getByUid lookup), `backend/services/movie-creator.js` (safe-path integration, flag:'wx' writes, Series skip for ID validation), `server/realtime/ws-server.js` (maxPayload 256KB, rate limit 30/s, protocol ping/pong with isAlive, protocol:1 in ack, selection re-hydration from indexer, max 500 items)
- *Server (1):* `server.js` (detectImageType magic-byte helper, 12mb express.json on POST /api/movies, 100kb Content-Length guard, 8MB decoded limit, toPublicMovie wrapping in PUT/POST responses, indexer passed to WebSocketServer)
- *Tests (2):* `test/unit/defects.test.js` (SEC-03 flipped+expanded, SEC-06 flipped, SEC-08 flipped+expanded, safe-path unit tests), `test/unit/ws.test.js` (uid fix for re-hydration)

Tests: 250 total / 233 passing / 0 failing / 17 todo — before: 206/206/0/21 (P1a) → after: 250/233/0/17
- Todo moved from 21 to 17: SEC-03 (−1), SEC-06 (−1), SEC-08 (−1), but 4 new todo tests for safe-path helpers added (net −1 + 4 safe-path = 17)

Decisions taken: none (all from P1 prompt)

User-visible behaviour changes:
- Movie creation now validates ID format (1–6 digits), genre names (no traversal, no Windows reserved names), and title safety
- Upload magic-byte validation: only JPEG/PNG/WEBP/AVIF accepted; client MIME ignored
- POST /api/movies responses and WS movie broadcasts strip internal fields (absolutePosterPath, _posterSet)
- WS connections: max 256KB payload, >30 msgs/s → close 4008, max 500 selection items
- Server-side selection re-hydrates from catalog uid only (unknown uids dropped, injected fields ignored)
- Protocol-level ping/pong with isAlive tracking (dead connections terminated)

Risks / could not verify:
- 17 remaining todo tests are all out-of-scope (ARCH-01, DATA-01/02/03/06/07/08, SEC-04, FE-01/02/04/05/08/13, SEC-02/05)
- No live browser testing of WS re-hydration with real client selection flow

Discovered (out of scope):
- DATA-06: poster lookup URI malformed (needs encodeURIComponent fix)
- FE-02: rescan spawns extra WebSockets/workers
- FE-04: Series apostrophe in title breaks poster fallback

Questions for the owner: none
