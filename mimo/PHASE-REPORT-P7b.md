# PHASE REPORT — P7b documentation (F4)

Branch / commits: `phase/P7b-docs` (from `221f0c4`), 5 commits, 5 doc
files changed (+772 / −81) plus this report:

- `88c55a1` docs(readme): full rewrite for accuracy - posters not videos, Node 18, Serries, env vars, backups [ARCH-02, ARCH-07]
- `5c11324` docs(architecture): module map, data flow, REST/WS tables, invariants, storage owners [ARCH-02]
- `00789c8` docs(persian): one-page owner guide; use real UI labels [ARCH-02]
- `e4f8d8d` docs: contributing guide and changelog P0-P7a [ARCH-02]
- *(this)* `mimo/PHASE-REPORT-P7b.md`

## Defects closed

- **ARCH-02** — README rewritten end to end and every claim verified
  against source. The three named defects: (1) Node **18+** now matches
  `engines` (was "14+"); (2) `Series/` vs `Serries/` explained (D7,
  verified in `scanner.js resolveTypeFolder`); (3) filename example fixed —
  `0042- The Matrix 1999.jpg` (poster image, numeric 1–6 digit ID) instead
  of `tt1234567- … .mp4`; Games/PS4/PS5 documented; selection section kept
  verbatim from P6e6; all 8 env vars documented.
- **ARCH-07 (README half)** — engines half was closed in P0; README half
  closed here. Register file untouched (same decision as P7a).

## Defects partially closed or deferred

- None. `LICENSE`: skipped entirely per owner override.

## Files changed

- `README.md` — full rewrite (267 lines): what it is, quick start
  Windows/Linux, first-run setup, env-var table, Library layout with real
  examples, filename cheat-sheet, D1 selection section (unchanged),
  orders, backups/restore, troubleshooting, security notes.
- `docs/ARCHITECTURE.md` — module map, data flow, REST table (26 routes
  read from `server.js`), WS table (all 28 message types read from
  `ws-server.js` + payloads verified at each send site), invariants I1–I12,
  storage ownership table, discovered-drift section.
- `docs/راهنمای-مدیر.md` — one-page Persian guide; UI labels copied
  exactly from the components (`جدید`/`در حال آماده‌سازی`/`انجام شده`,
  `بروزرسانی کتابخانه`, `ورود مدیر`, `وضعیت سیستم`).
- `docs/CONTRIBUTING.md` — branch/commit rules, commands, defect-test
  workflow, docs accuracy rule, stop-gates.
- `CHANGELOG.md` — Keep a Changelog; entries P0 → P7a (+P7b under
  `[Unreleased]`), defect IDs mined from `mimo/PHASE-REPORT-*.md`.

## Tests: total / passing / todo — before → after

- unit: **635 / 635 / 0 → 635 / 635 / 0** (unchanged — docs only)
- UI: **69 + 1 perf / 69 + 1 / 0 → 69 + 1 / 69 + 1 / 0**
- lint: **0 → 0**

Two machine-load flakes occurred mid-verification (both unrelated to the
diff, which touches only `.md` files): run 1 `game-manage.test.js:298`
timed out at 30 s (passes alone in 1.1 s), run 2 perf first-paint measured
356 ms > 300 ms budget (passes alone; CPU was at 52 % with the owner's
Chrome running). Final full run below is green.

## Raw verification output (final state)

```
> npx eslint .
(no output)
LINT_EXIT=0
```

```
npm test
ℹ tests 635
ℹ suites 145
ℹ pass 635
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26062.1856
TEST_EXIT=0
```

```
npm run test:ui
UI_EXIT=0
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ todo 0
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ todo 0
```

```
node mimo/repro/repro-backend.js
… (13 FIXED: DATA-01 … DATA-03)
0 present, 13 fixed, 0 error
BACKEND_EXIT=0

node mimo/repro/repro-ui.js
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error
UI_EXIT=0
```

## Acceptance criterion 4 — clean-clone transcript

Clone of `phase/P7b-docs` to `%TEMP%\p7b-clone` (fresh, **no** `Library/`,
**no** `data/`):

```
> git clone --local <repo> --branch phase/P7b-docs %TEMP%\p7b-clone
done.

> npm ci            (in clone)
NPM_CI_EXIT=0

> $env:PORT='3456'; npm start

=== GET /api/auth/status:
{"setupRequired":true}
=== GET /api/config:
{"version":"5.4.0","mediaTypes":["Movie","Animation","Iranian","Series","Game"],…,"imageExtensions":["jpg","jpeg","png","webp","avif"],"protocol":3}
=== GET / (app shell):
status=200 bytes=2085
=== GET /api/movies:
{"meta":{"version":"5.4.0","lastUpdated":"2026-10-06T08:36:16.994Z","totalMovies":0,"source":"api"},"movies":[]}

server log: "[WARN] Library folder not found!" → … → "Ready. Add movies to Library/ and refresh the browser."
```

Persian labels appear as `????` only because the console output is not
UTF-8; the JSON structure and ASCII fields are exact.

Followed literally from the README: requirements (Node ≥ 18), quick start
commands (`npm ci` + `npm start`), empty/missing `Library/` boots with an
empty catalog, first-run `setupRequired` is true, port from `PORT`. The
Windows path (`install.bat` → `Start.bat`) was verified by reading the
scripts (`install.bat` = Node check + `npm install`; `Start.bat` =
version banner + `npm start`); both end in `pause`, so they are
double-click oriented and were not run verbatim in this shell.

## Decisions taken

- Owner override: **no LICENSE file/section** — skipped entirely.
- P6e6 selection wording kept verbatim (re-verified against
  `ws-server.js`: `selection:update` customer-only, broadcast to all,
  last write wins).
- AGENTS.md **not edited** (out of F4 scope); its drift is documented in
  `docs/ARCHITECTURE.md` and under *Discovered* below.
- `mimo/DEFECT-REGISTER.md` untouched (consistent with P7a decision; the
  P7-wide "update the register" AC is left for the closing phase).
- CHANGELOG granularity: one entry per top-level phase P0…P7a with
  sub-phases listed; current work under `[Unreleased]`.

## User-visible behaviour changes

- None (documentation only).

## Risks / could not verify

- RTL rendering of `docs/راهنمای-مدیر.md` was checked by content
  inspection (correct Persian, no mixed-direction artefacts) but not in a
  graphical Markdown viewer.
- UI perf budgets are sensitive to machine load (evidence above); the
  green run above is the state of record.
- `npm run test:all` not run as a single command (its two halves were run
  separately and are green).

## Discovered (out of scope)

1. **`AGENTS.md` is stale**: I1 still says P2 *will* move manager metadata
   out of `catalog.json` (done — `data/metadata.json`); §5 still lists
   admin REST routes as "unauthenticated, SEC-02" (fixed in P1a, all now
   `requireAdmin`) and omits `/api/auth/status|setup|change-password`,
   `/api/config`, trash routes, and WS messages `catalog:changed`,
   `orders:undo`, `selection:saved`, `selection:cleared`,
   `orders:restored`. Suggest a docs-sync pass.
2. **`docs/types.js` (P7a) lacks 9 WS typedefs** present in code:
   `selection:save`, `selection:clear`, `selection:saved`,
   `selection:cleared`, `orders:saved`, `orders:deleted`,
   `orders:restored`, `ping`, `pong`. ARCHITECTURE.md's table (from code)
   is authoritative until they are added.
3. **`.gitignore` omits `data/metadata.json`** (runtime file created by
   P2; currently untracked) — one-line hygiene fix for F6.
4. **`server.js:219-229` startup hint is wrong**: it suggests
   `Library/TV Series/Comedy/1001-Friends S01E01 1994.jpg` — there is no
   `TV Series` type (TYPE_MAP has `series`), series have no genre
   subfolders, and episode-style names are not parsed. Misleads first-run
   users. (Header comment at `server.js:6` repeats "TV Series".)

## Questions for the owner

- Proceed to **P7c (F5 CI + F6 repo hygiene)** next?
- Want the four Discovered items folded into P7c, or a separate docs-sync
  commit?
