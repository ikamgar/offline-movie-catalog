# PHASE REPORT — P8c Startup & payload performance (G6)

Branch / commits: `phase/P8c-startup-payload` — `9ff54e6` bench harness ·
`d0b8514` server reflow + payload cache · `d03fe48` client indicator ·
`4035bbe` docs + bench smoke. (All local; not pushed.)
**Follow-up (c1–c6):** lag investigation + fixes, failing-reconcile
robustness, HTTP ETag coverage, 503 wording, raw outputs —
see `PHASE-REPORT-P8c-addendum.md`.

## Defects closed

- **ARCH-04** (startup/request-path blocking I/O, the G6 slice) — the
  startup sync scan no longer blocks `listen()`; `/api/movies` +
  `/api/games` no longer rebuild a 3.5 MB JSON body (with a fresh
  `lastUpdated`) per request. *Evidence:* `test/unit/startup-reconcile.test.js`
  (5 tests) + `test/unit/payload-cache.test.js` (7 tests) +
  `test/unit/bench-smoke.test.js` (2 tests), all green; 20k bench
   BEFORE/AFTER below. (The per-file scanner-logging slice of ARCH-04 was
   already closed in P3 — `DEBUG_SCAN` gates it; the diagnostics per-movie
   `existsSync` slice was removed back in P3e together with DATA-15 — see
   the corrected note under “partially closed” below.)

## Acceptance criteria (P8 prompt AC2) vs measured

| AC2 item | BEFORE | AFTER | verdict |
|---|---|---|---|
| cold start → first `GET /api/movies` ≤ 2 s **from cache** | 10 683 ms (blocking; nothing answered) | **331 ms** cold / **511 ms** warm | met |
| full reconcile ≤ 10 s | 10 722 ms (was the same as "listen") | warm **3 598 ms**; cold **13 616 ms** | warm met; cold 13.6 s — scan-bound (see Risks) |
| RSS reported | 235.4 MB cold / 366.3 MB warm | 381.7 MB cold / 382.7 MB warm | reported |
| gzip payload reported | none (3 569 994 B raw) | **377 569 B gzip** (9.5×) | met |
| repeat `If-None-Match` → 304 | statuses `[200]` (ETag never matched) | statuses **`[304]`**, p50 0.55–0.78 ms | met |

Raw 20k transcripts: BEFORE in the session log / report table below; AFTER
committed as `mimo/bench-after-raw.txt` (`BENCH_RESULT` line included).

| Metric (20 000 fixtures) | BEFORE cold | AFTER cold | BEFORE warm | AFTER warm |
|---|---|---|---|---|
| first `/api/movies` 200 | 10 683 ms | **331 ms** | 7 224 ms | **511 ms** |
| reconcile done | 10 722 ms (blocking) | 13 616 ms (background) | 7 271 ms (blocking) | **3 598 ms** (background) |
| detection | — | `meta.scanning` | — | `meta.scanning` |
| worst event-loop lag | 1 265.63 ms | 11 198.79 ms¹ | 0 ms² | 845.15 ms |
| RSS / heap | 235.4 / 43.9 MB | 381.7 / 121.6 MB | 366.3 / 155.2 MB | 382.7 / 154.1 MB |
| payload raw | 3 569 994 B | 3 570 011 B | 3 569 994 B | 3 570 011 B |
| payload gzip | — (no support) | **377 569 B** | — | **377 569 B** |
| ETag | `W/"36794a-…"` (per-request) | `"e7e2612e…"` (stable sha1) | `W/"36794a-…"` | `"3fa2bb29…"` |
| latency plain p50/p95 | 44.83 / 60.21 ms | **6.06 / 13.67 ms** | 77.99 / 103.68 ms | **7.02 / 14.43 ms** |
| latency gzip p50/p95 | 48 / 67.07 ms | **1.06 / 1.65 ms** | 80.06 / 99.29 ms | **1.28 / 2.23 ms** |
| If-None-Match | 200 always, 51.95 / 62.66 ms | **304**, 0.55 / 0.94 ms | 200, 78.96 / 93.33 ms | **304**, 0.78 / 1.43 ms |

¹ cold: the scan itself is the stall; pre-P8c the whole process was frozen
for the same duration and *additionally* served nothing. ² pre-P8c the
monitor only started measuring after the blocking listen, so "0" means
"not observed", not "no stall".

## Defects partially closed or deferred

- ~~ARCH-04 diagnostics-path `existsSync` per movie: out of P8c scope~~ —
  **corrected in the P8c follow-up (c6):** not deferred and not pending.
  The per-movie `existsSync` walk was removed in **P3e (DATA-15)** —
  diagnostics reads the indexer’s in-memory `_fileIndex`. Nothing of
  ARCH-04’s diagnostics slice remained outstanding when this report was
  written; the original wording here was wrong.

## Files changed

- `server.js` — initialize/reconcile split, `sendPayload`, `catalogMutation`
  (503 + invalidate), `reconcileLibrary`/`sweepThumbs`/diff snapshot,
  `whenReconciled`, payload caches wired to `indexer.onChange`
- `backend/payload-cache.js` — **new** (body + quoted-sha1 ETag + async
  gzip; 100 ms trailing-debounce invalidation; lazy sync rebuild)
- `backend/indexer.js` — `onChange` hook + `_notifyChange` on every
  in-memory mutator (not on `scheduleSave`/`flush`)
- `backend/watcher.js` — `holdReconcile`/`releaseHold` (record-while-held,
  immediate idempotent replay on release); game removals now go through
  `removeGame` so the hook fires
- `test/helpers/test-server.js` — passes `reconcileGate`, awaits
  `whenReconciled()`, exports `writeAdminAuth`
- `test/unit/startup-reconcile.test.js`, `test/unit/payload-cache.test.js`,
  `test/unit/bench-smoke.test.js` — **new** (14 tests)
- `js/store.js` — `scanning` state from `meta.scanning`, 2 s scan-poll
  (also on fetch failure while scanning)
- `js/app.js` — `#syncIndicator` «در حال بروزرسانی…» (every role),
  `_updateSyncIndicator`
- `css/main.css` — `.header-sync` pulse + `prefers-reduced-motion`
- `scripts/bench.js` — gzip-readiness poll, movies-count parse fix
- `docs/ARCHITECTURE.md` (startup-sequence section + REST rows),
  `README.md` (feature bullet), `AGENTS.md` (§5 REST notes),
  `CHANGELOG.md` (P8c entry), `mimo/bench-after-raw.txt` (evidence)

## Tests

- unit: **717 → 731** total; 731 passing / 0 failing / 0 todo (before:
  717/717; after: 731/731 — includes the 12 G6 tests + 2 bench-smoke)
- UI (Playwright): 3 runs — 77 + 1 perf each, **0 failures** (3/3 green;
  totals explicitly captured on runs 2–3, run 1 ended green)
- repros: `repro-backend.js` → `0 present, 13 fixed, 0 error`;
  `repro-ui.js` → `0 present, 4 fixed, 0 error`
- `npx eslint .` → exit 0; `npm audit --omit=dev` → 0 vulnerabilities
- git clean after all runs

## Decisions taken

- **No new dependencies**: gzip via built-in `zlib` (prompt rule); ETag is
  a quoted sha1 of the serialised body rather than the prompt's suggested
  "revision counter" — same stability guarantee with zero extra state to
  keep in sync, and it is the HTTP-canonical content validator.
- **Games payload carries no `meta.scanning`** (games are never cached on
  disk; they are simply empty until the reconcile lands). The client
  indicator is driven by the movies flag only; the reconcile-end
  `catalog:changed` reloads both.
- **`catalog:changed` is broadcast unconditionally at reconcile end**
  (even all-zero diffs): clients that loaded the cache mid-scan use it to
  clear the indicator. Watcher-driven broadcasts stay nonzero-only (B6).
- **Route-level invalidation belt-and-braces** on the 8 mutating routes:
  movie-editor/game-editor mutate objects in place and only
  `scheduleSave`, so `indexer.onChange` alone would miss title edits.
- **`startTestServer` awaits `whenReconciled()`** (gate tests manage the
  gate themselves) — every existing test sees a settled index, matching
  the pre-P8c behaviour.
- Test seam: `createServer({ reconcileGate })` — awaited between scan and
  atomic swap; `stop()` also resolves `whenReconciled()` so shutdown never
  hangs a waiter.

## User-visible behaviour changes

- The app now opens in well under a second even with 20k posters; during
  the first seconds the header shows a subtle pulsing
  «در حال بروزرسانی…» (every role, disabled under
  `prefers-reduced-motion`) and the grid fills when the scan lands.
- Admin mutations attempted while that indicator is up answer
  `503 SCAN_IN_PROGRESS` with a Persian retry message (seconds on a warm
  start; ~14 s worst case on a cold 20k start).
- Catalog pages load ~9.5× smaller and repeat visits revalidate as a
  near-instant 304; no visual design changes.

## Risks / could not verify

- **Cold reconcile is 13.6 s on 20k vs the 10 s AC** — the sync scan
  alone was 10.7 s before; the async walker's yielding adds ~25 %. It no
  longer blocks anything user-facing (the port answers in 0.3 s), but if
  the owner wants ≤10 s wall-clock it needs scanner-level work (out of
  this phase's scope). Warm reconcile (the normal case — cache exists) is
  3.6 s.
- **One bench run** out of three full 20k runs died with a one-off
  loopback `read ECONNRESET` mid-measurement (server log shows it serving
  1 ms requests right up to that point, no fatal, no crash stack);
  immediate re-run completed clean. Suspect Windows ephemeral-socket
  flake under the harness's connection churn — not reproducible, not
  attributable to a code path found on inspection.
- RSS at 20k grew ~115–145 MB vs pre-P8c: the payload cache keeps the
  serialised body + gzip copy + the movies array resident by design.
- The client's 2 s scan-poll is intentionally defensive (a dropped WS
  cannot strand the indicator); on a LAN with a healthy WS the
  `catalog:changed` reload wins and the poll is a no-op.

## Discovered (out of scope)

- `scripts/make-fixture-library.js` produces only ~20 unique series
  titles and ~10 unique game titles regardless of `--series`/`--games`
  counts (filename collisions overwrite) — the 20k fixture is really
  18 920 movies + 20 series + 10 games. Harmless for benchmarking
  (payload sizes identical before/after) but the generator should be
  fixed if exact counts ever matter.
- The object `createServer()` returns captures `wsServer`, `diagnostics`,
  `movieCreator`, … **by value at creation time (always `null`)** —
  pre-existing quirk; nothing currently relies on those properties.

## Questions for the owner

1. Cold reconcile 13.6 s on 20k vs the 10 s AC — accept as scan-bound
   (nothing user-facing is blocked any more), or open a follow-up for
   scanner-level speedup?
2. ~~The 503 message wording — «کتابخانه در حال اسکن است …» — OK as-is?~~
   **Answered (owner, follow-up c5):** use
   «کتابخانه در حال بروزرسانی است — لطفاً چند لحظه بعد دوباره تلاش کنید»
   — committed in `d8ae5df`, exact text pinned by
   `test/unit/startup-reconcile.test.js`.
