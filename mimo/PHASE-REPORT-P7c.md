# PHASE REPORT — P7c CI + repo hygiene (F5 + F6)

Branch / commits: `phase/P7c-ci-hygiene` (from `28aea27`), 6 commits + this
report, 10 files changed (+195 / −32):

- `072ddfe` fix(server): startup hint and header show real folder/filename conventions [P7C-CARRY1]
- `d849da9` docs(agents): sync I1 and section 5 with current routes/WS reality [P7C-CARRY2]
- `53d84b8` docs(types): add 10 missing WS message typedefs incl. orders:undo [P7C-CARRY3]
- `ab89583` chore(repo): editorconfig, gitattributes, gitignore metadata.json + stale lines, package.json private/license [F6]
- `f35646f` fix(deps): npm audit fix - clear proxy-addr critical and qs advisories [F5]
- `5745fc7` ci: GitHub Actions matrix (ubuntu/windows x node 18/20/22) + Playwright UI job, dependabot weekly grouped [F5]
- *(this)* `mimo/PHASE-REPORT-P7c.md`

## P7 overall (a + b + c, one paragraph)

P7 turned the repository's quality and knowledge bases into single sources of
truth: **P7a** made lint clean (365 problems → 0), introduced
`backend/constants.js` for shared constants, moved version/config behind
`GET /api/config` (client reads it from `package.json` instead of hard-coded
`5.4.0`), and started `docs/types.js`; **P7b** rewrote README, wrote
`docs/ARCHITECTURE.md` (module map, 26-route REST table, 28-message WS table,
invariants, storage owners), the Persian owner guide, CONTRIBUTING and
CHANGELOG, verified on a clean clone; **P7c** added the GitHub Actions CI
matrix (ubuntu/windows × Node 18/20/22 + Playwright UI job), dependabot,
fixed the npm audit findings (4 → 0), added `.editorconfig` / `.gitattributes`
and package.json hygiene, and folded in the four carry-over fixes P7b
discovered (server startup hint, AGENTS.md I1/§5, missing WS typedefs,
`.gitignore data/metadata.json`). Defects closed across P7: **ARCH-01**
(lint + version + CI), **ARCH-02** (README), **ARCH-03** (types/docs),
**ARCH-07** (README half; engines half was P0), **FE-09** (P5c; `.gitignore`
rest completed here). From now on, correctness (lint + 635 unit + 70 UI
tests + audit) is enforced mechanically on every push instead of by hand.

## Defects closed

- **ARCH-01** — lint is clean (`npx eslint .` → 0), version comes from
  `package.json` via `GET /api/config` (P7a), and **CI now exists**
  (`5745fc7`): matrix `ubuntu-latest/windows-latest × Node 18/20/22` runs
  `npm ci` → `npm run lint` → `npm test`; separate Ubuntu/Node-22 job runs
  `npm run test:ui` after installing Playwright Chromium and uploads
  `mimo/shots/` artifacts on failure. The workflow file is syntax-validated
  locally and its three commands are the exact commands executed green on
  this machine; the actual 6-cell run happens on first push (see *Local vs
  push-time* below).
- **ARCH-02 / ARCH-03 / ARCH-07 / FE-09** — closed in P7b / P7a / P7b / P5c
  respectively (evidence in those reports). F6's `.gitignore` tidy here
  completes the last hygiene residue of FE-09. `mimo/DEFECT-REGISTER.md`
  remains untouched (same decision as P7a/P7b).

## Carry-over items from P7b Discovered (1–4) — all four closed

- **CARRY1 `072ddfe`** — `server.js:6` header now says
  "Movie, Series, Animation, Iranian, Game"; the first-run hint
  (`server.js:219-231`) now shows real, parseable examples
  (`Movies/Action/0042- The Matrix 1999.jpg`,
  `Animation/0012-Cars.jpg`, `Series/Breaking Bad.jpg`,
  `Games/PS4/Ghost Rider.jpg`) plus a pointer to README.
  Evidence: `git grep -n "TV Series|S01E01" -- server.js` → **exit 1 (zero
  matches)**; positive matches at `server.js:223,227,230`.
- **CARRY2 `d849da9`** — AGENTS.md I1 now points at `data/metadata.json`
  (DATA-10 closed in P2); §5 rewritten: public vs admin routes (`requireAdmin`
  + `Bearer` since P1a — SEC-02 closed), all 15 admin routes incl.
  `/api/auth/change-password`, WS `catalog:changed {added,updated,removed}`
  and payload shapes (`orders:saved {order}` …), ping/pong wording
  (application-level echo; liveness = protocol-level ping, S9).
  Evidence: `git grep -n "unauthenticated|P2 moves" -- AGENTS.md` → **exit 1**;
  positives at `AGENTS.md:51` and `:67`.
- **CARRY3 `53d84b8`** — `docs/types.js` gained **10** typedefs (25 → 35):
  `selection:save`, `selection:clear`, `selection:saved`,
  `selection:cleared`, `orders:undo`, `orders:saved`, `orders:deleted`,
  `orders:restored`, `ping`, `pong`. Every payload cross-checked against
  send sites (`sync-client.js:348/362/441`, `ws-server.js` 444/463/528/580/716
  and 365) and the ARCHITECTURE.md WS table. Note: P7b said *9* — it was
  actually **10** (`orders:undo` was missing too); see *Discovered*.
- **CARRY4 `ab89583`** — `.gitignore:8` now lists `data/metadata.json`.

## Requirement → test evidence table

| # | Owner requirement | Evidence (commit / file / command result) |
|---|---|---|
| 1 | Startup hint + header show real folder/filename conventions | `072ddfe`; grep exit 1 for `TV Series`/`S01E01` in server.js; new examples verified at server.js:223/227/230; fresh-clone boot log renders the hint |
| 2 | AGENTS.md I1 + §5 synced with reality | `d849da9`; grep exit 1 for `unauthenticated`/`P2 moves`; positives AGENTS.md:51 (metadata-store), :67 (requireAdmin, catalog:changed, payload shapes) |
| 3 | Missing WS typedefs added to docs/types.js | `53d84b8`; `git grep -c "@typedef" -- docs/types.js` → **35** (was 25); `npx eslint .` → 0 |
| 4 | `data/metadata.json` ignored | `ab89583`; `.gitignore:8`; file no longer shows in `git status` |
| 5 | F6 — `.editorconfig` (utf-8, LF, 2 spaces, `*.bat` CRLF) | `ab89583`; file content per spec |
| 6 | F6 — `.gitattributes` (`* text=auto eol=lf`, `*.bat text eol=crlf`) | `ab89583`; `git ls-files --eol -- "*.bat"` → `i/lf w/crlf attr/text eol=crlf`; byte check: `0d 0a` present on disk |
| 7 | F6 — package.json tidy (`private`, `license`) | `ab89583`; printed values: `private=true license=UNLICENSED engines=>=18` |
| 8 | F6 — stale `.gitignore` lines removed | `ab89583`; grep exit 1 for `logs/` and `.env.local` (`.env` + `.env.*` kept) |
| 9 | F5 — npm audit findings fixed, non-breaking | `f35646f`; `npm audit fix` → "changed 4 packages", `package.json` diff empty, lockfile-only (+20/−15); `npm audit --omit=dev` → **found 0 vulnerabilities, exit 0** |
| 10 | F5 — CI matrix ubuntu/windows × 18/20/22, `npm ci` + lint + test | `5745fc7`; `.github/workflows/ci.yml` js-yaml parse **exit 0**; all three commands executed green locally (raw output below); actual matrix run = push-time |
| 11 | F5 — Playwright UI job + failure artifacts | `5745fc7` ci.yml:80-94 (`playwright install --with-deps chromium`, `npm run test:ui`, `upload-artifact@v4` on `failure()`); js-yaml exit 0; job run itself = push-time |
| 12 | F5 — dependabot weekly, npm, grouped | `5745fc7`'s companion `.github/dependabot.yml`; js-yaml parse **exit 0**; behavior observed only after push |
| 13 | Four raw commands green after every commit | Final run below: unit **635/635/0/0**, UI **69/69 + 1/1**, repro-backend **0 present/13 fixed**, repro-ui **0 present/4 fixed**, lint **0** |
| 14 | `npm start` boots on a fresh clone with empty Library | Fresh-clone transcript below: `npm ci` exit 0, `GET /api/auth/status` → `{"setupRequired":true}`, `GET /` → 200, `Ready.` |
| 15 | PHASE REPORT with raw outputs, local-vs-push split, P7 summary | This file |

## Files changed (10)

- `server.js` — header type list + first-run hint (CARRY1).
- `AGENTS.md` — I1 metadata path; §5 route/WS tables (CARRY2).
- `docs/types.js` — +10 WS message typedefs (CARRY3).
- `.gitignore` — `+data/metadata.json`; `−logs/`, `−*.log`, `−.env.local` (F6/CARRY4).
- `.editorconfig` — new: utf-8, LF, 2-space, `*.bat` CRLF, md no-trim (F6).
- `.gitattributes` — new: `* text=auto eol=lf`, `*.bat text eol=crlf` (F6).
- `package.json` — `+private: true`, `+license: "UNLICENSED"` (owner override).
- `package-lock.json` — 4 patch bumps via `npm audit fix`, lockfile-only (F5).
- `.github/workflows/ci.yml` — new: test matrix + ui job + artifact upload (F5).
- `.github/dependabot.yml` — new: npm, weekly, one group `all-dependencies` (F5).

## Tests: total / passing / todo — before → after

- unit: **635 / 635 / 0 → 635 / 635 / 0**
- UI: **69 + 1 perf / 69 + 1 / 0 → 69 + 1 / 69 + 1 / 0**
- lint: **0 → 0**
- repro: backend **13 fixed / 0 present** → same; UI **4 fixed / 0 present** → same
- audit (prod+dev): **4 vulnerabilities (1 critical, 3 moderate) → 0**

No flakes this session — final runs were green first try (the two
machine-load flakes described in the P7b report did not recur).

## Raw verification output (final state, this machine)

```
> node --version
v24.18.0

> npm ci
39 packages are looking for funding
found 0 vulnerabilities
NPM_CI_EXIT=0

> npx eslint .
(no output)
LINT_EXIT=0

> npm test
ℹ tests 635
ℹ suites 145
ℹ pass 635
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 25407.9269
TEST_EXIT=0

> npm run test:ui
UI_EXIT=0
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ todo 0
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ todo 0

> node mimo/repro/repro-backend.js
… (13 FIXED: DATA-01 … DATA-03, incl. DATA-03 multi-genre rename)
0 present, 13 fixed, 0 error
BACKEND_EXIT=0

> node mimo/repro/repro-ui.js
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error
UI_EXIT=0

> npm audit --omit=dev
found 0 vulnerabilities
AUDIT_EXIT=0

> npx --yes js-yaml .github/workflows/ci.yml
CI_YAML_EXIT=0
> npx --yes js-yaml .github/dependabot.yml
DEPENDABOT_YAML_EXIT=0
```

## Fresh-clone boot transcript (acceptance criterion)

Clone of `phase/P7c-ci-hygiene` to `%TEMP%\p7c-clone` (fresh, no `Library/`,
no `data/`; later removed):

```
> git clone --local . --branch phase/P7c-ci-hygiene %TEMP%\p7c-clone
CLONE_EXIT=0
> npm ci
NPM_CI_EXIT=0
> node server.js        (default port 3000)
AUTH_STATUS=200 {"setupRequired":true}
ROOT=200 bytes=2024
server log: "Local: http://localhost:3000" / "WebSocket: ws://localhost:3000" / "Ready. Add movies to Library/ and refresh the browser."
CLONE_REMOVED
```

## npm audit findings — what they were and why they are NOT left open

The `npm audit` at P7c start reported **4 vulnerabilities (1 critical,
3 moderate)**, all inside the express 4 transitive tree (newer than P7a's
"3 moderate" — the advisory database has grown):

| Advisory | Severity | Affected | Reachability in this app |
|---|---|---|---|
| `proxy-addr` IP-spoofing via IPv4-mapped IPv6 trust subnet | critical | `< 2.0.8` | Only matters when peer identity is derived from spoofable headers (`X-Forwarded-For`). This server uses the raw socket address (loopback first-run check, login rate limiting) and never sets a proxy-trust config — so effectively not reachable, but fixed anyway. |
| `qs` array-length / prototype pollution class advisories (2 findings) | moderate | `< 6.16.0` | `qs` runs only in express's `urlencoded` body parser; all app clients send JSON (`express.json`). Not exercised by our own traffic, but reachable by any LAN client POSTing form data. |
| `qs` chain carried through `body-parser`/`express` | moderate | `body-parser < 1.20.8`, `express < 4.22.3` | Same parser path as above. |

Fix path chosen: **`npm audit fix` (no `--force`)** — changed exactly 4
packages, all *inside* the declared semver ranges (`express ^4.21.0` etc.),
`package.json` untouched, **lockfile-only diff** (+20/−15), D9 preserved
(still just `express` + `ws` at runtime). Post-fix: `npm audit --omit=dev` →
**0 vulnerabilities**, and the full unit suite re-ran green on the new
dependency versions before the commit (`f35646f`). Nothing was left
"accepted"; nothing required a major upgrade.

## Local vs push-time verification (explicit split)

**Verified locally on this machine (raw output above):**

- `npm ci`, `npm run lint`, `npm test`, `npm run test:ui`, both repro
  scripts, `npm audit --omit=dev` — all green, on **Node v24.18.0**.
- Both workflow YAML files parse (js-yaml, ephemeral `npx` — no dependency
  added to the project).
- Fresh clone → `npm ci` → boot → HTTP checks.
- `.gitattributes` behaviour: `w/crlf` + `0d 0a` bytes on `*.bat`; index
  EOL audit (`git ls-files --eol`): all text files LF in index, 144 binary
  files untouched; `git add --renormalize .` produced **zero** churn.
- All carry-over greps (exit codes quoted in the table).

**Can only be verified after push (GitHub-hosted):**

- The 6 matrix cells actually running on **Node 18/20/22** (this machine has
  only Node 24 — see Risks) and on `ubuntu-latest`.
- The UI job's `npx playwright install --with-deps chromium` on the Ubuntu
  runner (locally Chromium is already cached), plus artifact upload — and
  that only on a failing run (`if: failure()`).
- Workflow triggers, matrix expansion, `actions/*` tag availability, and
  dependabot's first weekly PR — js-yaml validates *syntax*, not GitHub
  workflow semantics.

## Decisions taken

- Owner override implemented verbatim: `"private": true` +
  `"license": "UNLICENSED"`, no LICENSE file (proprietary convention).
- D9 preserved: no new dependencies; devDependencies unchanged; audit fix
  was lockfile-only patch bumps.
- Dependabot grouping: single group `all-dependencies` with
  `patterns: ["*"]` (matches the "weekly, grouped" spec; simplest review
  story — one PR per week).
- 10 typedefs added, not the 9 P7b listed (`orders:undo` was also missing) —
  every shape cross-checked against code, not against P7b's prose.
- `*.bat` line endings: git's *index* keeps canonical LF (`eol=crlf`
  affects the working tree), worktree flipped to CRLF via a fresh checkout
  — verified byte-level. Renormalize showed no other file needed it.
- `mimo/DEFECT-REGISTER.md` untouched (consistent with P7a/P7b).
- CHANGELOG not edited this phase — see Questions.

## User-visible behaviour changes

- Console-only: the startup hint/header text (English logs, per logging
  convention) now shows real folder/filename examples instead of a
  nonexistent `TV Series/…S01E01…` path.
- Fresh checkouts now materialise text files with LF endings
  (`.gitattributes`); `*.bat` become CRLF as Windows needs. Invisible in UI;
  HTML/JS/CSS are EOL-agnostic (the clone transcript's `bytes=2024` vs
  P7b's `2085` is exactly this EOL delta on `index.html`, same markup).
- No REST/WS/UI behavior changed; no Persian strings touched.

## Risks / could not verify

- **No CI matrix cell has ever executed.** Local runs are Node 24.18.0;
  Node 18/20/22 and `ubuntu-latest` exist only on the runner. Dependency
  support (eslint 9 needs ≥18.18, playwright 1.44 supports 18) was reasoned
  from package metadata, not executed — the first push is the real proof.
- js-yaml proves well-formed YAML, not workflow correctness (typos in
  action inputs, permission defaults, etc. would surface only on GitHub).
- Artifact upload path untested (fires only on failure).
- UI perf budget remains machine-load sensitive (P7b evidence); this
  session's runs were first-try green.
- `npm run test:all` not run as a single command (its two halves were run
  separately, both green).

## Discovered (out of scope)

1. P7b's typedef gap was **10, not 9** — `orders:undo` had no typedef either
   (its absence was masked by a comment on the delete typedef).
2. The audit database grew between P7a and P7c (3 moderate → 1 critical +
   3 moderate), i.e. vulnerability scanning must be periodic — dependabot
   (added here) plus `npm audit` in CI would close the loop; wiring audit
   into the workflow was **not** in the F5 spec, so it was not added.
3. `*.bat` files were LF *on disk* on this Windows machine before
   `.gitattributes`; `cmd.exe` is edge-case fragile with LF scripts. Fixed
   for every future checkout.
4. The repo index was already uniformly LF (`--renormalize` = no-op) —
   good hygiene baseline confirmed empirically.
5. CHANGELOG has no P7c entry yet (see Questions).

## Questions for the owner

1. Add a `[Unreleased]` **P7c** entry to `CHANGELOG.md` (CI, dependabot,
   audit fix, hygiene, carry-over fixes) — consistent with P7b's
   one-entry-per-phase granularity rule?
2. The branch is local only. Push it (and open a PR) so the CI matrix
   produces real evidence — do you want me to push, or will you?
3. Optional, out of current spec: add `package-ecosystem: github-actions`
   to dependabot so the `actions/*` tags stay current too?

---

# Addendum — three closing additions (owner's go-ahead)

Questions 1 and 3 above are now done (question 2 — pushing — remains the
owner's decision; **nothing was pushed**). Same branch, 4 commits on top of
`b033a82`:

- `3f4537b` ci: run npm audit --omit=dev on every push in the test matrix [F5]
- `a0d900d` ci: add github-actions ecosystem to dependabot, weekly grouped [F5]
- `8330b13` docs(changelog): P7c entry under [Unreleased]; single marker on newest phase [ARCH-01]
- *(this)* addendum

## 1. CHANGELOG — `[Unreleased]` P7c entry

New top entry `## [Unreleased] — P7c CI + repo hygiene` in the existing
one-entry-per-phase style: **Added** (CI matrix + Playwright job, dependabot
npm + github-actions, editorconfig/gitattributes/package hygiene),
**Security** (the audit fix: 4 findings — 1 critical `proxy-addr`, 3
moderate `qs`/`body-parser` chain — lockfile-only), **Fixed** (ARCH-01 CI
half + the four P7b carry-overs). The `[Unreleased]` marker moved off
`## P7b — Documentation` so exactly one marker sits on the newest phase
(`8330b13`, +30/−1).

## 2. dependabot — github-actions ecosystem

`.github/dependabot.yml` now has two entries with identical
`weekly` + `groups: all-dependencies: patterns: ["*"]` settings: the
existing `npm` and the new `package-ecosystem: github-actions`
(`a0d900d`, +7). Both YAML files re-validated: js-yaml exit 0 / exit 0.

## 3. CI — `npm audit --omit=dev` on every push

Added as the last step of the `test` matrix job (after `npm ci`, lint,
unit tests) in `.github/workflows/ci.yml`; job renamed
`audit + lint + unit (…)` (`3f4537b`, +3/−1). Runs in all 6 matrix cells
on push/PR/manual. A newly published advisory exits non-zero → CI fails,
which is the point of the gate (fix path: `npm audit fix`).

## Raw verification output (final state, this machine)

```
> npx --yes js-yaml .github/workflows/ci.yml
CI_YAML_EXIT=0
> npx --yes js-yaml .github/dependabot.yml
DEPENDABOT_YAML_EXIT=0

> npx eslint .
(no output)
LINT_EXIT=0

> npm test
ℹ tests 635
ℹ suites 145
ℹ pass 635
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 25305.2035
TEST_EXIT=0

> npm run test:ui
UI_EXIT=0
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ todo 0
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ todo 0
ℹ duration_ms 50756.6317
ℹ duration_ms 2336.1074

> node mimo/repro/repro-backend.js
FIXED    DATA-03  editing a multi-genre movie must rename all copies (movie-editor), no ghost after rescan
         ["0099:Action,Drama"]

0 present, 13 fixed, 0 error
BACKEND_EXIT=0

> node mimo/repro/repro-ui.js
         open WebSockets: 1, Workers: 0 -> 0
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
         grid executed: false, detail executed: false
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
         poster src: data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F% | script errors: none

0 present, 4 fixed, 0 error
UI_REPRO_EXIT=0
```

## Flake disclosure for this batch

Of the three full UI runs made after these edits: runs 1 and 2 each failed
on **exactly one** test — `test/ui/game-manage.test.js:298` "removing a
platform …" with `page.waitForFunction: Timeout 30000ms exceeded` at line
312 — the **same test, same line** already documented as a machine-load
flake in the P7b report. It passed standalone
(`node --test test/ui/game-manage.test.js` → 8/8 in 7.4 s) between runs 2
and 3; CPU was at 11 %, no stray `node` processes existed; and run 3 was
**green (69/69 + 1/1) — the final raw output above is that run, the state
of record**. (The C7 batch's full run before these edits was also green.)
The three edits of this addendum are `CHANGELOG.md` + two workflow YAMLs,
none of which the UI suite reads.

Discovered while looking at it (out of scope, test-harness only): the
`waitForFunction(fn, { timeout: 8000 })` calls in this file pass the
options object as Playwright's `arg` parameter (`waitForFunction(fn, arg,
options)`), so the real timeout is the 30 s default, not 8 s. No product
impact; a harness-only cleanup candidate for a future phase.

---

# Addendum 2 — confirm-then-delete stall: root-caused and fixed

## What the instrumentation showed (temporary, now removed)

Per-step timings, page heartbeat lag, a `window.fetch` log and
P4-C8-style listener/subscription snapshots were added to the target test;
13 instrumented full-suite runs caught exactly one stall (run 13), plus
standalone comparison runs. During the stall the page was healthy —
heartbeat lag **17 ms**, evaluate roundtrip **3 ms**, PUT reached the stub
in **0 ms** — and the PUT's fetch returned **404 in 15 ms**. There was
never a hang: the app correctly took its error branch
(`_showServerError`), which simply never satisfies "modal hides".

## Root cause — a test-order race (not a leak, not a Playwright artifact)

1. The rename test (`Hades` → `Hades II`) finishes as soon as the edit
   modal hides, but `_performSave` calls `hide()` **before** `await
   loadCatalog()` / `fetchGames()` (edit-modal.js:410-413).
2. A title change re-keys the game uid — `ui-stub.js:225` (faithful to I6;
   the real server derives `game:<normalised title>` the same way).
3. If the next test opens the edit modal before the store refresh lands, it
   snapshots the stale entry (`uid=game:hades`, title `Hades`), PUTs the
   dead uid → stub 404s → modal never hides → 8 s timeout.

Two-worlds evidence — the target PUT in every dump: **12 passing runs** =
`uid=game:hades ii found=True title='Hades II'` (refresh won the race);
**the stall run** = `uid=game:hades found=False title='Hades'` (refresh
lost). CPU spikes to 100 % in suite runs widen the window; standalone never
lost it (13/13 standalone passes across sessions).

## Leak check (P4-C8 class) — clean, with evidence

Before the target test: **`store.subscriberCount = 9`, `docNet = 0`** in
**all 13 dumps** (standalone and suite), identical modal open/hidden states
and an identical modal-open spy tail — after this file's ~10 prior
edit/add/confirm modal opens. Nothing accumulates: confirm-modal and
edit-modal lifecycle listeners return to baseline every time. Ruled out as
the cause with bit-identical counts across passing and stalling contexts —
not merely an absence of finding.

## Fix

`test/ui/game-manage.test.js`: the rename test now waits until the grid
renders `Hades II` (store refresh visibly applied) before finishing,
closing the race at its source; its modal-hidden wait also got the same
`null, { timeout }` options fix previously ordered for line 312.
Instrumentation fully removed (grep `__hb|__docSpy|__fetchLog` → clean).
No product code changed.

## Real-app equivalence — yes, in a narrow form

A manager who renames a game and reopens + saves the same title before the
background catalog refetch lands hits the identical 404: Persian server
error, modal stays open, retry after the refresh works. Narrow and
recoverable (window = catalog + games refetch duration), **not** a hang and
not a leak. The "stall" itself is harness-only: only the test's success
condition turns that legitimate error branch into an 8 s timeout; the
underlying stale-uid window is real.

## Verification — 5 back-to-back full suites after the fix

```
run1  target: ✔ 1219.6ms   suite: green (69/69 + perf 1/1, exit 0)
run2  target: ✔ 1196.3ms   suite: green (exit 0)
run3  target: ✔ 1192.6ms   suite: RED (exit 1) — trash-panel.test.js before-hook
                           #adminPanel login waitForSelector timed out 5000ms;
                           3 child tests "did not finish before its parent and
                           was cancelled" (unrelated, load-class, first
                           occurrence all session)
run4  target: ✔ 1234.1ms   suite: green (exit 0)
run5  target: ✔ 1101.9ms   suite: green (exit 0)
```

**Honest pass rate: target test 5/5 (1101-1234 ms); suite 4/5.**
`npx eslint .` → 0; `node --check` → 0.

## Discovered (out of scope, not investigated)

- Other load-class flakes seen this session under CPU spikes to 100 %:
  `ui.test.js:949` (before-hook `waitForSelector` 5 s timeout) and
  `dialog-a11y.test.js:66/:111/:172` (timeout + null `click`) — affected 3
  instrumented runs. Same sensitivity class, different tests; a dedicated
  pass would be needed if suite reds matter.
- The options-as-arg wait pattern still exists in ~7 other places
  (`orders-workflow.test.js` ×5, `perf.test.js` ×1, `ui.test.js:857`) —
  left untouched (owner scoped that fix to game-manage).

---

# Addendum 3 — timeout-bug count corrected: 54 instances in 9 files, all fixed

The "~7" above was an eyeball undercount: a full `waitForFunction` argument scan (92 calls) found **54** options-as-arg instances across **9 test files** (add-flow-real 1, add-modal 11, dialog-a11y 6, edit-modal 9, game-manage 12, orders-workflow 6, perf 1, trash-panel 3, ui.test 5 — including 12 still in `game-manage.test.js` itself), all fixed with the same `fn, null, { timeout }` insertion (7e2b4db/cd04437 pattern), scanner re-verified 0 remaining; the `#adminPanel` login before-hook flake recurred once during verification as `add-flow-real.test.js:36` (standalone 5/5 green, setup-race and diff-causality ruled out → load noise), verification: four raw commands green (`npm test` 635/635, `test:ui` 69+1, repro-backend 13 fixed, repro-ui 4 fixed) + full UI suite 2 consecutive green runs, `npx eslint .` 0.

---

# Addendum 4 — `#adminPanel` login-wait flake: root-caused and fixed

## 1. Pre-fix tally — 10 back-to-back `npm run test:ui` runs

| run | exit | result |
|-----|------|--------|
| 1 | 0 | green 69/69 + 1/1 |
| 2 | 0 | green 69/69 + 1/1 |
| 3 | 1 | `ui.test.js:949` suite P4-C4 — `#adminPanel:not(.hidden)` wait 5000 ms exceeded |
| 4 | 0 | green 69/69 + 1/1 |
| 5 | 1 | `ui.test.js:949` — same `#adminPanel` 5000 ms wait |
| 6 | 0 | green 69/69 + 1/1 |
| 7 | 0 | green 69/69 + 1/1 |
| 8 | 0 | green 69/69 + 1/1 |
| 9 | 1 | `ui.test.js:749` (P3I before-hook) **and** `:949`, both `#adminPanel` 5000 ms wait; 66/69 + 2 cancelled |
| 10 | 1 | `dialog-a11y.test.js:66` `#adminPanel` 5000 ms wait + cascades `:111` null click, `:172` modal timeout; 66/69 |

**Pre-fix pass rate: 6/10.** Every primary failure is the same 5 s
`waitForSelector('#adminPanel:not(.hidden)')` — no spread across other
assertions. Logs: `%TEMP%\p7c-tally-1..10.log`.

## 2. Instrumentation — one shared probe at the login path (temp, now removed)

A `startProbe(page, label, getServerLog)` helper recorded per-step marks
(goto/cards/loginBtn/modal/submit), `/api/auth/*` request+response lines,
console/page errors, a guarded page dump (modal state, `store.role`,
component registrations, toasts) and the server's request log — emitting a
baseline record on every passing login and a full dump on timeout
(JSONL in the OS temp dir). Wired into the 5 historically failing sites
(ui P3I, ui P4-C4, dialog-a11y, trash-panel, add-flow-real), plus a
temporary request log in `ui-stub.js` and `test-server.js`.

2 instrumented runs caught one timeout (`add-flow-real`, real server). Key
dump fields, verbatim:

```json
"marks": { "goto": 589, "cards": 660, "loginBtn-click": 942,
           "modal-open": 973, "submit": 1512, "panel-TIMEOUT": 6540 },
"net": [ { "at": 939, "ev": "req", "method": "GET",
           "url": "http://localhost:14280/api/auth/status" },
         { "at": 939, "ev": "res", "status": 200, ... } ],
"page": { "readyState": "complete",
          "lm": { "open": true, "setupMode": false,
                  "user": "admintestadmin123456", "passLen": 0,
                  "submitDisabled": false },
          "panelHidden": true, "role": "customer", "hasToken": false,
          "consoleErrors": [], "pageErrors": [], "toasts": [] }
```

Decisive: **`user` holds both credentials concatenated, `passLen` is 0** —
the password text was typed into the *username* field — and **`net` has no
`POST /api/auth/login` at all** (only the 100 ms-window
`_checkSetupRequired` status probe). The client-side empty-password guard
returned before any request, so no role change → panel never appears.
Baselines from passing runs: login-click → panel visible = 435 ms … 1.6 s
(real server, scrypt), always far below 5 s; `role=admin`, login POST
present, `user='admin'`, `passLen=11/15`.

## 3. Hypotheses tested

- **(a) readiness race — ruled out.** Dump: `readyState=complete`, cards
  rendered, `loginModal/adminPanel/movieCard` all defined, store live
  (`subscriberCount=9`), server served every module (serverLog all 200s).
  The failure happens long after load.
- **(b) stale/wrong server / port allocation — ruled out.** Dump origin =
  `localhost:14280`, matching serverLog; fresh ephemeral-port server per
  file; relative fetches are same-origin by construction.
- **(c) real-server login stall (rate limit / scrypt / setup-mode) — ruled
  out as cause.** `setupMode=false`; no login POST ever left the browser,
  so the rate limiter and scrypt never engaged; the failure reproduces on
  the in-process stub too (same client-side guard).
- **(d) overlay / mid-animation click — ruled out.** All three clicks
  registered (`loginBtn-click`, `modal-open`, `submit` marks present); the
  modal was open and submit enabled — the click never failed.

## 4. Root cause — a100 ms focus steal in `login-modal.show()`

`js/components/login-modal.js` scheduled
`setTimeout(() => username.focus(), 100)` unconditionally on open. When
`page.fill('#password')` focuses the field *before* that timer fires but
its insert lands *after* it, focus has been yanked back to `#username`, so
the password text is appended to the username value. `_handleLogin` then
guards on the empty password, shows its toast and **returns before
POSTing** → role stays `customer` → the 5 s panel wait times out. Under
CPU load the fills stretch, straddling the t+100 ms edge — explaining the
~40 % flake rate and its load correlation.

Deterministic micro-repro (temp script, output verbatim — before fix):

```
activeElement right after focus('#password'): password
activeElement 250ms later:                   username
FOCUS STEAL CONFIRMED: show() refocused #username although #password had focus
text typed after the steal lands in: username='SECRET123' password=''
=> submit would hit the empty-password guard; no POST; adminPanel never appears
```

## 5. Fix — app-side, one file

```diff
-    setTimeout(() => this.querySelector('#username').focus(), 100);
+    setTimeout(() => {
+      const active = document.activeElement;
+      const typing = active && this.contains(active)
+        && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
+      if (!typing) this.querySelector('#username').focus();
+    }, 100);
```

The autofocus still runs whenever nobody has started typing (the focus
trap leaves `activeElement` on the dialog *container*, a div — the guard
is keyed on form-field tags specifically, because `trapFocus` itself
focuses `tabindex=-1` containers at setup). Focus is never stolen from a
field the user/automation already focused. Same repro after the fix:

```
activeElement right after focus('#password'): password
activeElement 250ms later:                   password
NO STEAL: focus stayed where the caller put it
```

**Real-app equivalence:** the unconditional steal is real app code, but
the failing window (first 100 ms of an opening, animating modal) is
humanly unreachable — for people this was harness-only. The app fix was
chosen over a harness wait because it removes the trap for any fast
interactor (e.g. password managers) at zero behavioral cost; no test was
given a timeout raise or retry.

## 6. Verification after the fix — 10 full suites + raw commands

Instrumentation fully removed first (`login-probe.js` deleted, probe
wiring reverted in 4 test files, request logs reverted in `ui-stub.js` /
`test-server.js`, `mimo/shots/` restored; working tree contained only the
login-modal fix).

```
> npm run test:ui   (×10; run 10 re-run once after the harness killed the
                     shell mid-run — first attempt's log was truncated
                     after a passing P4-C4, not a test failure)
RUN1  exit=0  69/69 + 1/1
RUN2  exit=0  69/69 + 1/1
RUN3  exit=0  69/69 + 1/1
RUN4  exit=0  69/69 + 1/1
RUN5  exit=0  69/69 + 1/1
RUN6  exit=0  69/69 + 1/1
RUN7  exit=0  69/69 + 1/1
RUN8  exit=0  69/69 + 1/1
RUN9  exit=0  69/69 + 1/1
RUN10 exit=0  69/69 + 1/1   (72412 ms)

> npm test
{"exit":0,"sections":[{"tests":635,"pass":635,"fail":0,"cancelled":0}]}
NPM_TEST_EXIT=0

> npx eslint .
(no output)
LINT_EXIT=0

> node mimo/repro/repro-backend.js
0 present, 13 fixed, 0 error
BACKEND_EXIT=0

> node mimo/repro/repro-ui.js
0 present, 4 fixed, 0 error
UI_REPRO_EXIT=0
```

**Honest pass rates — UI suite: pre-fix 6/10 → post-fix 10/10.**
Logs: `%TEMP%\p7c-verify-1..10.log`, `%TEMP%\p7c-verify-npmtest.log`.

---

# Addendum 5 — permanent regression test, bug-class sweep, flake re-check

## 1. Permanent regression test (`87813ce`)

`test/ui/login-modal.test.js` (auto-discovered by the runner): opens the
login modal, focuses `#password` inside the 100 ms window, waits 250 ms,
asserts `document.activeElement` is still `#password`, types `hunter2`
and asserts `#username` is untouched while `#password` holds the value.

Guard temporarily reverted (`setTimeout(() => username.focus(), 100)`),
test standalone — red with the measured values:

```
✖ keeps focus on #password through the 100ms autofocus timer; typed text lands there (520.5582ms)
  AssertionError [ERR_ASSERTION]: autofocus must not steal focus (activeElement.id=username after 250ms)
  + actual - expected
  + 'username'
  - 'password'
RED_EXIT=1
```

Guard restored — green: `pass 1 / fail 0`, `GREEN_EXIT=0`.
(The type-then-assert steps were not reached in the red run: the
activeElement assertion at 250 ms fails first, with the same value the
historical probe dump showed.)

## 2. Bug-class sweep — `setTimeout`/`rAF` + unconditional `.focus()` on open

All `.focus()` call sites in `js/` (9 total, plus 1 `textarea.select()`),
with the decision:

| site | decision |
|------|----------|
| `js/components/login-modal.js:199-204` | the bug — fixed by `0eb0944`, guarded (`typing` = form field already focused inside the dialog); covered by the new test |
| `js/utils/dialog.js:50` | focusin redirect: fires only when focus lands **outside** the topmost dialog (pulls it back in). Cannot steal from a field inside the dialog the user is already in — not the class |
| `js/utils/dialog.js:64,74,78` | Tab-wrapping inside the dialog (keyboard nav, synchronous, intentional) |
| `js/utils/dialog.js:85` | `container.focus()` at trap setup — focuses the dialog *container* (`tabindex=-1`), synchronously at open, before any user interaction; a new topmost dialog taking focus is intentional (nested confirm-over-edit). Not a timer, not a field-level steal |
| `js/utils/dialog.js:94` | release restores the opener element (intentional) |
| `js/components/search-bar.js:88` | after the clear button click — user gesture, focusing search is the point |
| `js/components/search-bar.js:94` | `/` shortcut, explicitly guarded `!this._isInputFocused()` — cannot steal from a field |
| `js/store.js:971` (`ta.select()`) | select-after-copy helper, not focus-on-open |

Every other component (add-modal, edit-modal, confirm-modal,
change-password, diagnostics, sidebars, grid, cards) contains **zero**
`.focus()` calls. No `requestAnimationFrame` site touches focus. No other
instance of the class exists; no further fix taken (scope discipline).

## 3. Flake re-check — standalone ×10 each

| file | runs | result |
|------|------|--------|
| `test/ui/dialog-a11y.test.js` | 10 | **10/10 green** (4/4 each, 3.9-5.0 s per run) |
| `test/ui/ui.test.js` | 10 | **10/10 green** (22/22 each, 48.0-50.3 s per run) |

Logs: `%TEMP%\p7c-da-1..10.log`, `%TEMP%\p7c-ui-1..10.log`.

Does the autofocus bug plausibly explain the earlier failures? Yes, for
every recorded occurrence: `ui.test.js:949` (P4-C4 before-hook) and
`ui.test.js:749` (P3I before-hook) are the same `fill('#username')` →
`fill('#password')` → submit sequence racing the t+100 ms timer — the
exact mechanism the probe dump proved on `add-flow-real`; and
`dialog-a11y.test.js:66` is that file's login before-hook (its `:111`
null click and `:172` modal timeout were downstream cascades from the
failed hook). All reds sat on `#adminPanel` after a fill-based login;
no recorded red ever failed a non-login assertion first. Standalone
runs are quieter (no suite CPU spikes stretching the fills across the
timer edge), which matches the earlier observation that these files
passed standalone while flaking in-suite — now also green 10/10 each
post-fix under the same standalone protocol used pre-fix.

## 4. Verification — four raw commands + full UI suite ×5

```
> npm test
{"exit":0,"sections":[{"tests":635,"pass":635,"fail":0,"cancelled":0}],"failures":[]}
UNIT_EXIT=0

> node mimo/repro/repro-backend.js
0 present, 13 fixed, 0 error
REPRO_BE_EXIT=0

> node mimo/repro/repro-ui.js
0 present, 4 fixed, 0 error
REPRO_UI_EXIT=0

> npx eslint .
(no output)
LINT_EXIT=0

> npm run test:ui   (×5, back to back, no re-runs)
SUITE1 exit=0  70/70 + perf 1/1   (67523 ms)
SUITE2 exit=0  70/70 + perf 1/1   (66460 ms)
SUITE3 exit=0  70/70 + perf 1/1   (64757 ms)
SUITE4 exit=0  70/70 + perf 1/1   (64621 ms)
SUITE5 exit=0  70/70 + perf 1/1   (65023 ms)
```

**Honest pass rate — full UI suite: 5/5** (now 70 tests: 69 + the new
regression test). Standalone: dialog-a11y 10/10, ui.test 10/10.
Unit: 635/635. Lint: 0. Repros: 0 present / 17 fixed / 0 error.
Logs: `%TEMP%\p7c-f2-unit.log`, `%TEMP%\p7c-f2-suite-1..5.log`.
No re-runs hidden: the only re-run anywhere in this addendum is the
single documented red→green demonstration of §1, where the re-run is the
point.

