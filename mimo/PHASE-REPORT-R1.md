# PHASE REPORT — R1 audit follow-up (F28 + F41, plus F14/F15 pins)

**Branch / commits:** `fix/R1-high-findings` (from `audit/final` @ `0ac32d3`),
9 commits, none pushed:

```
b0952b4 test(defects): red tests for F28 guard exemption and F41 metadata journey
33beffb fix(server): shared poster-route exemption for the 100KB body guard [F28]
6b23756 fix(indexer): manager metadata keys flow through one shared helper [F41] [DATA-10]
c662920 test(defects): journey covers metadata in the P8c scanning window
b3db1c4 test(api): exact zero-padded next-id values [F14] [F15]
dcfd4fd test(ui): real-browser journey for a >100KB game poster [F28]
45dcfb8 test(defects): drop unused helper import (lint)
bec23bf test(ui): wait for app shell before header games-mode switch [F28 leg]
776b363 docs: R1 changelog entry, metadata-key note, DATA-10 closure re-grade [F28] [F41] [DATA-10]
```

## Defects closed

### F28 (HIGH) — 100 KB guard 413s game poster requests — CLOSED
Evidence: test/unit/guard-exemption.test.js (6 tests)

- Failing on pre-fix HEAD (red captured in commit b0952b4):
  - ` guard must not 413 game create: {"success":false,"error":"Request body too large"}` (300 KB → 413)
  - `POSTER_BODY_ROUTES must be exported`
  - (`Request body too large` ≠ `code: 'IMG_TOO_LARGE'` — parity asserted as well)
- Post-fix green (6/6, run `node --test test/unit/guard-exemption.test.js`):
```
✔ exempts POST /api/games: a >100KB poster creates the game and the poster is served
✔ keeps POST /api/movies exempt at the same payload size (control)
✔ same structured 413 for a >8MB poster on BOTH create routes (parity)
✔ keeps POST /api/movies/preview under the guard (no poster field)
✔ keeps POST /api/rescan under the guard (no poster field)
✔ exemption list comes from ONE source of truth in server.js (enumeration)
```
- Real-browser journey: test/ui/game-poster-real.test.js — POST /api/games
  with a ~300 KB decodable PNG created the game (200), the games grid card
  rendered and DECODED (naturalWidth > 0), the poster URL answered 200 with
  bytes identical to the upload.
- Mutation M3: remove `{method:'POST', path:'/api/games'}` from
  POSTER_BODY_ROUTES → 3 guard tests red; restore → 6/6.

### F41 (HIGH, = DATA-10 reopen) — metadata lost on restart/rescan — CLOSED
Root cause re-verified: bisect says regression from 724b8178; the
scan-rebuild attach (`indexer.js:770` at audit) passed the MAP key
(`getKey()` = `Movie:0001` / bare seriesKey) where the store keys bare uids
(`0001` / `series:breaking bad`). The store itself is/was correct; the
lookup misses.

Evidence: test/unit/metadata-journey.test.js (4 tests, booted with
createServer directly — the test-server helper deletes its temp dirs)

- Failing on pre-fix HEAD (red captured in commit b0952b4):
```
✖ Movie:  ... AssertionError [ERR_ASSERTION]: F41: rating survives restart   null !== 8.4
✖ Series: ... AssertionError [ERR_ASSERTION]: F41: series rating survives restart   null !== 9.4
✔ Game: uid format pinned; the store never gains a "game:" key   (expected green)
```
- Post-fix green (4/4):
```
✔ Movie: edit → restart → rescan → watcher re-add, key stays "0001"
✔ Movie: metadata is already in the boot cache serve (P8c scanning window)
✔ Series: edit → restart → rescan → watcher re-add, key stays "series:breaking bad"
✔ Game: uid format pinned; the store never gains a "game:" key
```
Every leg asserts the row values AND `metadata.json` holding exactly one key
in the I6 uid format (`0001` / `series:breaking bad`; never a `game:` key).

- Mutations (red each time, then restored):
  - M1 — `_attachMetadata(movie)` → `getKey(movie)` in the scan-rebuild
    attach (exact audit-T01 reversal): `Movie null !== 8.4`, `Series null
    !== 9.4` (7 pass / 2 fail).
  - M2 (audit-T02) — wrong key at the catalog-load attach
    (`_attachMetadata(movie, 'mutated-key')`): initial run survived (3/0)
    because the P8c boot reconcile rewrites the map before any settled
    assertion could observe it — so the journey gained leg 4 (held
    `reconcileGate`, assert inside the scanning window: "F41: cached
    catalog rows carry the store metadata before the swap"), and the
    re-applied mutation went red: `pass 3 / fail 1`, `AssertionError:
    F41: cached-catalog rows carry the store metadata before the swap`.
    Restored → 4/0.

### F14/F15 (medium) — nextId padding/monotonicity — pinned
Evidence: test/unit/http.test.js "next IDs are exact and zero-padded per
type (survivors F14/F15)" — assertions `0003` (Movie/Iranian, 4-wide),
`00003` (Animation, 5-wide), global `maxId + 1` over the id tree (0001,
0002, Animation 00001).

- Mutation M4 — drop `padStart`: `fail 1` (`Movie: undefined` message
  artifact — assertion on value mismatch), red.
- Mutation M5 — `maxId + 1` → `maxId + 2`: `fail 1`, red.
- Restored → 63/0 in http.test.js.

## Defects partially closed or deferred
- none. F27 (cipher re-wrap, MEDIUM) stays OUT of R1 by scope agreement.
- F26-style normalisation duplication in the game pipeline untouched
  (out of scope; the F41 helper deliberately does not add a third copy —
  uid-less game objects yield `null`, games never enter the store and this
  contract is pinned by the Game journey leg).

## Files changed (grouped)
- `server.js` — POSTER_BODY_ROUTES + routeCarriesPosterBody (module level,
  exported), guard middleware uses the one definition.
- `backend/utils/metadata-key.js` — NEW: single `metadataKeyFor()` (uid →
  derivations; Game ⇒ null with contract note).
- `backend/indexer.js` — `metadataKeyFor` import; `_attachMetadata` keys via
  the helper; all 3 call sites (catalog load / watcher reconcile / scan
  rebuild) drop their manual keys.
- `backend/storage/metadata-store.js` — migration + `attach` default use the
  helper (uid preference preserved exactly); `seriesKey` import swapped.
- `backend/services/movie-editor.js` — `oldMetaKey` + set/rename go through
  the helper (value-identical: `movie.uid === nextUid` where used).
- `backend/services/movie-creator.js` — metadata set/remove/rollback key
  routed through the helper.
- `test/unit/guard-exemption.test.js` — NEW (6).
- `test/unit/metadata-journey.test.js` — NEW (4; incl. P8c-window leg).
- `test/unit/http.test.js` — +1 exact-value next-id test.
- `test/ui/game-poster-real.test.js` — NEW (1; real server + Playwright).
- `CHANGELOG.md`, `docs/ARCHITECTURE.md` (storage-table uid note),
  `mimo/DEFECT-REGISTER.md` (DATA-10 Closure re-grade P2→R1 CLOSED).

## Verification battery (all at final HEAD, raw)
```
npm run lint              → exit 0 (clean), also npx eslint . — clean before battery
npm test                  → exit 0: tests 757 / suites 171 / pass 757 / fail 0 / skipped 0 (30.3 s)
npm run test:ui run #1    → exit 0: 78/0 (+isolated perf 1/0)
npm run test:ui run #2    → exit 1: 78/0 functional — P4-C5 PERF-ONLY red
                            (longTasks [111,51], worst 111ms > 100ms budget, scroll screens)
npm run test:ui run #3    → exit 1: perf 1/0 green — MY game-leg red
                            (waitForSelector '.movie-card.game-card' 10s — header switch raced
                             app wiring); hardening commit bec23bf
npm run test:ui run #4    → exit 0: 78/0 + perf 1/0 (longTasks [85])
npm run test:ui run #5    → exit 0: 78/0 + perf 1/0 (longTasks [98,54])
npm audit --omit=dev      → found 0 vulnerabilities
```
(UI suite run 2 / run 3 detail: run 2's functional 78/0 INCLUDED the F28
real-browser leg green at 835 ms; run 3's functional 77/1 was only the
game-leg race — fixed by the bounded-retry click; runs 4–5 consecutive
green including perf.)

## Decisions taken (with D#/assumptions)
- One shared exemption table lives in `server.js` next to the poster decoder
  it feeds (single chokepoint for "routes that may carry a poster").
- Metadata key = ONE helper `metadataKeyFor()`: uid when present, else
  derived per I6; the derivations equal what every call site already
  produced, so **no on-disk format change** and `_migrateFromCatalog`
  keeps importing the same keys verbatim (STOP-GATE-safe per §6.9).
- Game keys: `metadataKeyFor` returns `null` for uid-less games and the
  journey documents the contract (games carry no editor metadata —
  AUDIT-P9c §3); the I6 `game:<title>` format stays defined by the games
  pipeline uid, asserted in the Game leg, and the store is pinned to never
  contain a `game:` key.
- 9 MB parity interpreted as: game create must ride the SAME decoder cap —
  both create routes answer the structured `413 IMG_TOO_LARGE`
  (deep-equal bodies) for a decoded payload >8 MB as long as it fits the
  12 MB parser limit (test payload 9,000,000 bytes → base64 ≈11.4 MB).
  Non-poster routes keep the raw `413 {"error":"Request body too large"}`.
- Journey tests boot `createServer` directly (test-server `close()` deletes
  its temp dirs — a restart journey needs durable dirs); each `it` is
  self-healing: one `server` variable stop in `finally` (an earlier draft
  leaked the second instance and hung node --test — hardening committed).

## User-visible behaviour changes
- A manager can now upload a game poster larger than 100 KB (any size the
  client already allows) — previously a hard 413 toast.
- imdb rating / plot summary entered for a Movie/Series/Animation/Iranian
  title NO LONGER disappear after restarting the server (`Start.bat`) or
  after any full rescan / watcher reconcile — including during the brief
  `گفتگ.`(`meta.scanning`) boot window.
- No new dependencies; no WS protocol change; no route-payload shape change
  beyond game create now succeeding where it 413'd.

## Risks / could not verify
- P4-C5 perf budget is machine-noise-sensitive at the 100 ms long-task
  bar (run 2: 111 ms). Five consecutive standalone runs ranged 70–98 ms
  when green. Unrelated to this session's diff (client-side scroll).
- Windows line-ending churn: PowerShell `Set-Content` used for one mutation
  re-wrote `id-generator.js` with CRLF; content-identical, index restored
  (working tree clean at `776b363`).
- Test `metadata-journey.test.js` adds ~11 s (watcher legs) and
  `game-poster-real` ~4–14 s (sharp PNG + Chromium) to the suites.

## Discovered (out of scope — not touched)
- Test-server helper's `close()` deletes library/data dirs — document in
  the helper header before anyone reuses it for restart journeys.
- `game-editor`/`game-creator` normalisation duplication (F26-class) now
  has its third consumer potential via the games uid — worth an extraction
  in a later session.
- `express.json` '12mb' cap and the guard's CL-based check US-ASCII
  behaviours stay as-is; POST /api/movies still writes magic-byte-scaned
  bytes without a real decode (S6 existing semantics).

## Questions for the owner
- None blocking. Judgement calls made: (a) 9 MB parity interpretation
  above; (b) hardening red-first commits left one intermediate red commit
  (b0952b4) before the fix commits, per the requested red/green evidence
  sequence.
