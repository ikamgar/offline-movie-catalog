# PHASE REPORT — P8c follow-up (event-loop lag, robustness, ETag, wording)

Companion to `PHASE-REPORT-P8c.md` (its lines 17/53 and Q2 are corrected
in place). Owner task list: (a) investigate & fix event-loop lag during
reconcile, (b) failing-reconcile robustness + test, (c) HTTP-level ETag
coverage test for all admin ops, (d) phase-report corrections + this
raw-outputs addendum, (e) bench keep-alive agent + 3× 20k runs,
(f) 503 message wording change.

Branch / commits: `phase/P8c-startup-payload` — all local, **not pushed**:

| # | commit | content |
|---|---|---|
| c1 | `6086c91` | in-server lag probe + histogram, phase timings, user-level bench probe, keep-alive agent |
| c2 | `8dfcdc2` | yield-chunked reconcile/release-hold, async atomic save, locale-aware sort fast path, probe attribution fix |
| c3 | `2324821` | pre-swap library-root recheck — unreadable root keeps the cached catalog |
| c4 | `04786ce` | source-level `indexer.notifyChanged()` + HTTP ETag coverage test |
| c5 | `d8ae5df` | 503 wording «بروزرسانی» (not «اسکن») + exact-text test |
| c6 | (this) | PHASE-REPORT-P8c corrections + this addendum |

## Defects closed

- **ARCH-04, event-loop-lag slice** (the owner’s targets: in-server lag
  ≤ 200 ms, user-level ≤ 250 ms *during* reconcile) — closed. Evidence:
  official 3× 20k runs below — worst in-server **112.3 ms**, worst
  user-level **50.69 ms**, both far inside budget; regression-pinned by
  `test/unit/startup-probe.test.js` (3) and `test/unit/persist-compare.test.js` (9).
- **Failing-reconcile robustness** (task b) — closed by c3 + 2 new tests
  (`test/unit/reconcile-failure.test.js`): a reconcile that throws, and an
  unreadable library root before the swap, both keep the cached catalog
  serving, settle `meta.scanning`, lift the 503 and resolve
  `whenReconciled()`; the ENOTDIR test pins the plain-words warn.
- **ETag coverage over the admin surface** (task c) — closed by c4 +
  `test/unit/etag-coverage.test.js` (1 test, 13 steps).
- **503 wording** (task f) — closed by c5, exact text pinned in
  `startup-reconcile.test.js`.

## (a–e) Event-loop lag investigation

**(a) Measured** with the c1 instrumentation (in-server
`monitorEventLoopDelay` + phase-drift sampler + 100 ms HTTP user probe
inside the reconcile window + keep-alive harness agent) on a full 20k
fixture, before the c2 fixes:

| 20k run (pre-c2) | cold | warm |
|---|---|---|
| in-server probe worst | **28 703.3 ms** (histogram 28 722.6) | **2 174.7 ms** |
| phase wall: release-hold | 26 553 ms | 0 ms |
| phase wall: flush | 1 676 ms | 1 644 ms |
| **user probe worst (real HTTP latency)** | **294.44 ms** (1 error) | **2 200.72 ms** |
| harness worst event-loop lag | 74.38 ms | 69.93 ms |

The user-probe numbers are ground truth (actual request latency): warm
reconcile held a request for **2.2 s**, cold for 294 ms — both over the
250 ms budget, and the in-server histogram agreed that long synchronous
blocks existed. (The harness’s 74 ms disagreed with the probe’s 28.7 s —
partly the probe’s own attribution bug, fixed in c2, see (c); the phase
walls and user latencies independently prove the real blocks.)

**(b) Root causes found — three, all synchronous, all inside reconcile:**

1. **Watcher release-hold replay** (`backend/watcher.js`): the chunk
   counter of the phase-1 scan incremented *only on changed entries* — a
   quiet replay over 18 920 unchanged files therefore ran as **one ~1.8 s
   block** (measured 1 796.7 ms as one sync-chunk); the post-walk
   `diskFiles` classification loop (≈19 k × `isGamesPath` +
   `isIgnoredPath` + `path.resolve`) was a second **~236 ms** block;
   the phase-2 index scan only yielded on removals. (First hypothesis —
   “many held dirs” — was disproved: the cold run logged at most one
   held dir; and the initial ~1 797 ms figure was *also* skewed by the
   attribution bug in (c).)
2. **Indexer publish + persistence** (`backend/indexer.js`):
   `replaceFromScan` built and swapped the entire index synchronously;
   `saveToDisk` serialised with a sync `JSON.stringify` (~76 ms/6.3 MB
   plus scan rows) behind a synchronous atomic rename (`Atomics.wait`);
   the persistence sort ran `localeCompare` inside the comparator
   (micro-bench: 924 ms for 18 920 mixed keys vs 74 ms for the fast
   path).
3. **Probe attribution** (`backend/startup-probe.js`): a drift sample
   still pending when `setPhase` ran was charged to the *new* phase, so
   e.g. the scan’s tail was reported as release-hold (and one cold run
   showed a fictitious 1 796.7 ms release-hold chunk that the user probe,
   the harness and a re-run could not reproduce). Fixed by flushing the
   pending gap into the old phase (`_flushPendingGap`) on `setPhase`,
   `stop` and every tick — after the fix, in-server and harness numbers
   agree run-for-run.

**(c) Fixes (commit c2):**

- `watcher.js`: `releaseHold` now dedupes roots and runs
  `_reconcileBatch` — one `walkDirAsync` per root with the diskFiles
  consumption loop chunked; **yields sit at the top of every loop**
  (phase 1 per 512 files examined — changed *or not* —, phase 2 per
  8 192 index rows); genre sort + single `_emit` only when something
  actually changed.
- `indexer.js`: build-aside async swap — `_buildIndexFromScan` generator
  yields every 4 096 rows, single-step `_publishScan`,
  `replaceFromScanAsync` (sync twin kept for existing callers, identical
  state, parity-tested); `stringifyCatalogAsync` (byte-identical to
  `JSON.stringify`, yields per 2 000 rows); `saveToDiskAsync` +
  `flushAsync` on `writeJsonStringAtomicAsync` (fs.promises open/write/
  fsync/close + async rename retry — no `Atomics.wait`); persistence
  sort precomputes keys once and uses `compareKeysPersist` — fast ASCII
  path only when **both** keys classify (id-typed `Movie:`/`Iranian:`
  `/`Animation:` + digits, or all-lowercase-series), otherwise the
  original `localeCompare(…, 'en', {numeric:true})` so ICU punctuation
  and Persian dictionary order are preserved (3 000-pair fuzz + explicit
  punctuation cases pin the equivalence).
- `server.js`: reconcile awaits the async steps; `cache-load` phase
  label; `startup-probe.js` attribution flush.

**(d) Verified** — official 3× 20k runs (keep-alive) after all commits:

| run | cold firstAnswer | cold reconcile | cold in-server worst | cold user worst | warm firstAnswer | warm reconcile | warm in-server worst | warm user worst |
|---|---|---|---|---|---|---|---|---|
| 1 | 389 ms | 3 123 ms | **109.3 ms** | 18.64 ms | 579 ms | 3 366 ms | **112.3 ms**¹ | 50.69 ms |
| 2 | 356 ms | 2 956 ms | **104.4 ms** | 36.95 ms | 559 ms | 3 321 ms | **112.0 ms**¹ | 34.00 ms |
| 3 | 287 ms | 2 457 ms | **73.2 ms** | 16.37 ms | 535 ms | 2 784 ms | **96.6 ms**¹ | 48.32 ms |

Harness worst event-loop lag (same process): cold 77.14 / 69.60 /
52.92 ms, warm 39.06 / 40.76 / 107.28 ms — all ≈ the in-server numbers
now that the attribution bug is fixed.

**(e) Result vs targets:** worst in-server **112.3 ms ≤ 200**; worst
user-level **50.69 ms ≤ 250** — **both targets met in all six
measurements**, with the previous worst-case (28 703 ms / 2 200 ms)
gone. Before/after headline for the owner: the warm user-visible stall
dropped from **2 200.72 ms → ≤ 50.69 ms**, cold from 294.44 ms →
≤ 36.95 ms.

¹ warm in-server worst is the pre-serve `cache-load` chunk (86–116 ms,
port not yet listening — nothing user-facing), consistent with the c1
phase data.

## Files changed (follow-up)

- `backend/startup-probe.js` — phase-drift sampler with gap flush to the
  old phase (`_flushPendingGap`, `setPhase`/`stop`), histogram read at settle
- `backend/watcher.js` — async batched `releaseHold` → `_reconcileBatch`
  (walk / diskFiles / phase 1 / phase 2 all yield at loop top)
- `backend/indexer.js` — `compareNumericAware`/`isFastKey`/
  `compareKeysPersist`/`sortForPersist`, `stringifyCatalogAsync`,
  `saveToDiskAsync`/`flushAsync`, `_buildIndexFromScan`/`_publishScan`/
  `replaceFromScanAsync`, public `notifyChanged()`
- `backend/storage/atomic-json.js` — `writeJsonStringAtomicAsync`,
  `renameWithRetryAsync`, `delay`
- `server.js` — awaited async reconcile steps, `cache-load` phase label,
  pre-swap `fs.promises.readdir` guard, 503 wording
- `backend/services/movie-editor.js` — `notifyChanged()` after direct
  `_movieMap`/`_fileIndex` mutations in `_applyToIndex`
- `test/helpers/test-server.js` — `quiet` passthrough (`quiet:false` for
  warn assertions)
- tests **new**: `persist-compare.test.js` (9), `startup-probe.test.js`
  (3), `reconcile-failure.test.js` (2), `etag-coverage.test.js` (1);
  **adjusted**: `bench-smoke.test.js` (accepts both `meta.scanning`
  strings — was flaky), `startup-reconcile.test.js` (exact 503 text)
- docs: `mimo/PHASE-REPORT-P8c.md` (corrections), this addendum.
  `CHANGELOG.md`/`docs/ARCHITECTURE.md`/`AGENTS.md` quote no message
  text and no wire shapes changed → no edits needed.

## Tests

- unit: **731 → 746**; final run **746 passing / 0 failing / 0 todo**
- UI (Playwright): 3 runs — **77 + 1 perf each, 0 failures (3/3 green)**
- repros: `repro-backend.js` → `0 present, 13 fixed, 0 error`;
  `repro-ui.js` → `0 present, 4 fixed, 0 error`
- `npx eslint .` → exit 0 (no findings); `npm audit --omit=dev` →
  `found 0 vulnerabilities`
- `npm start` still boots on a fresh clone with an empty `Library/`
  (startup-reconcile + bench smoke cover the path)

## Decisions taken

- **Comparator equivalence contract** (no owner decision needed — no
  behaviour change intended): fast path only when *both* keys classify;
  everything else falls back to the exact pre-c2 `localeCompare`, so
  punctuation order (`)` vs `-`), mixed case and Persian letters keep
  their ICU results (fuzz-pinned, antisymmetry-checked with `-0`
  normalised).
- **Belt-and-braces invalidation kept**: the HTTP `catalogMutation`
  post-finish invalidate (belt, covers every route incl. game-editor)
  stays; `notifyChanged()` is the source-level braces at the
  movie-editor’s direct map mutations — metadata-only edits touch no
  file, so no watcher event could ever refresh the payload on its own.
- **Pre-swap guard throws into the existing catch** rather than adding a
  parallel failure path — one code path handles scan failure, gate
  failure and root-vanished alike (index untouched, 503 lifts,
  `whenReconciled()` resolves).
- **503 wording**: exact owner text «کتابخانه در حال بروزرسانی است —
  لطفاً چند لحظه بعد دوباره تلاش کنید»; `code` stays `SCAN_IN_PROGRESS`
  (wire-stable). The client already displays `body.error` opaquely and
  its header indicator says «در حال بروزرسانی…» — vocabulary now
  consistent.
- Assumption: “cold” bench = `dataDir` without `catalog.json` (OS page
  cache warm — stated honestly, as before); “user-level” = the 100 ms
  HTTP probe that runs only while `meta.scanning` is true.

## User-visible behaviour changes

- The 503 mutation-gate message is now
  «کتابخانه در حال بروزرسانی است — لطفاً چند لحظه بعد دوباره تلاش کنید»
  (was …در حال اسکن است…). Nothing else visible — the rest is
  performance and robustness (a stalled/killed library folder now
  degrades to “keep serving the cached catalog + a plain-words warn”
  instead of an empty catalog).

## Risks / could not verify

- Cold 20k reconcile *flag-flip* is 2.5–3.1 s (scan-bound; the main
  report’s Q1 — accept vs scanner-level ≤10 s — is still open for the
  owner; nothing user-facing blocks: first answer 0.29–0.58 s).
- Bench “cold” keeps the OS page cache warm (same caveat as the main
  report); Windows-only verification (owner’s platform) — Linux/macOS
  not re-run this follow-up.
- The diagnostic before-run’s in-server 28 703 ms figure is partly
  attribution artifact (fixed in the same c2); the *user-probe* and
  *phase-wall* figures independently evidence the real blocks, so the
  before/after comparison stands on those.

## Discovered (out of scope)

- `game-editor` has the same profile movie-editor had (direct map
  mutations, no source-level notify) — currently covered by the HTTP
  belt; add `notifyChanged()` symmetry if a non-HTTP caller ever appears.
- `POST /api/games/rescan` invalidates **both** payloads (one shared
  call) — a movies-only ETag moves after a games-only op. Harmless
  (correctness unaffected), documented in the ETag test comments.
- Two unrelated files (`mimo/PHASE-REPORT-P8b.md`,
  `test/unit/config.test.js`) showed CRLF-only “modified” noise in the
  worktree — content-identical, restored from the index, not committed.
- `scripts/make-fixture-library.js` defaults its output to
  `./fixture-library` in the CWD (accidentally created while probing;
  deleted — bench runs always use `os.tmpdir()`).

## Questions for the owner

1. *(carried from the main report)* Cold reconcile 2.5–3.1 s flag-flip
   on 20k vs the 10 s AC — accept as scan-bound, or open a
   scanner-level follow-up?
2. None new — the wording question (Q2) is answered in c5.

## Raw outputs (captured at c6)

`npm test`:

```
ℹ tests 746
ℹ suites 169
ℹ pass 746
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27638.0048
```

`npx eslint .` → exit 0, no findings. `npm audit --omit=dev`:

```
found 0 vulnerabilities
```

Repros:

```
0 present, 13 fixed, 0 error   (mimo/repro/repro-backend.js)
0 present, 4 fixed, 0 error    (mimo/repro/repro-ui.js)
```

UI ×3 (`npm run test:ui`, each run = 77 unit-style UI tests + 1 perf
process):

```
run 1: ℹ pass 77 / ℹ fail 0  + perf: ℹ pass 1 / ℹ fail 0
run 2: ℹ pass 77 / ℹ fail 0  + perf: ℹ pass 1 / ℹ fail 0
run 3: ℹ pass 77 / ℹ fail 0  + perf: ℹ pass 1 / ℹ fail 0
run 3 perf metrics: {"firstPaintFullMs":333,"loadCatalogToPaintMs":183,
"selectMs":15,"longTasks":[],"searchMs":261,"cards":40}
```

3× 20k bench (`node scripts/bench.js`, keep-alive; probe lines):

```
run 1 cold: reconcile 3123 ms | in-server worst 109.3 ms (hist 119.4) | user worst 18.64 ms p95 13.89 | harness 77.14 ms
run 1 warm: reconcile 3366 ms | in-server worst 112.3 ms (hist 108.5) | user worst 50.69 ms p95 48.21 | harness 39.06 ms
run 2 cold: reconcile 2956 ms | in-server worst 104.4 ms (hist 114.4) | user worst 36.95 ms p95 11.76 | harness 69.60 ms
run 2 warm: reconcile 3321 ms | in-server worst 112.0 ms (hist 93.7)  | user worst 34.00 ms p95 32.37 | harness 40.76 ms
run 3 cold: reconcile 2457 ms | in-server worst  73.2 ms (hist 83.2)  | user worst 16.37 ms p95 13.72 | harness 52.92 ms
run 3 warm: reconcile 2784 ms | in-server worst  96.6 ms (hist 101.5) | user worst 48.32 ms p95 30.26 | harness 107.28 ms

BENCH_RESULT run 1 (excerpt): firstAnswer cold 389 / warm 579;
cacheBytes 9601686; movies 18920; raw 3570011; gzip ~387 kB;
cond304 statuses [304]
```

Before-run (c1 instrumentation only, same 20k fixture) for comparison —
see the (a) table: in-server worst 28 703.3 ms cold / 2 174.7 ms warm,
user worst 294.44 ms cold / 2 200.72 ms warm.
