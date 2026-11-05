# P8 — Windows operations, thumbnails, fonts, startup performance

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P8-ops-performance.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P7 · **Closes:** FE-12, ARCH-04, ARCH-06 (rest) · **Branch:** `phase/P8-ops-performance`
**Owner decisions used:** D4 (thumbnails via optional `sharp`).

## Goal
Double-click → running shop system, robust on Windows, quick on a 20,000-poster library over Wi-Fi, with good Persian typography that works with no internet.

## Tasks

**G1 — Launchers.** `Start.bat`: `chcp 65001`; verify Node ≥ 18 (friendly Persian+English message otherwise); run `npm ci --omit=dev` automatically when `node_modules` is missing (keep `install.bat` working); print every LAN URL (all non-internal IPv4 addresses, via `scripts/print-urls.js`) so staff can type it on phones; open the default browser on the server PC (`start "" http://localhost:%PORT%`); **restart loop** on crash (3 s delay; stop after 5 crashes in 2 minutes with a readable message); window title with the version. Optional `Stop.bat`. Files keep CRLF endings (`.gitattributes`).

**G2 — Configuration.** Optional `config.json` (`port`, `libraryPath`, `dataDir`) merged **under** environment variables; validated at startup with actionable messages (library folder missing → tell the owner what to create, do not crash-loop). Document precedence in README.

**G3 — Logging & lifecycle.** `logs/app-YYYYMMDD.log`, 7-day rotation, console shows a compact summary; unhandled rejections/exceptions are logged and the process exits non-zero (the launcher restarts it); graceful shutdown flushes storage (P2) and closes sockets; `logs/` git-ignored. Never log secrets or full request bodies.

**G4 — Thumbnails & caching (D4, FE-12).** `GET /api/poster/:key?w=300|600`: WebP thumbnails cached in `data/thumbs/` (name = hash of path + mtime + width) generated lazily with **`sharp` declared in `optionalDependencies`**; if `sharp` is missing or fails, serve the original with a one-time log line — the app must run identically without it. Generation queue concurrency 2; optional idle-time warm-up after a scan; orphan thumbs cleaned on startup. All poster URLs carry `?v=<mtimeMs>`; responses send `Cache-Control: public, max-age=31536000, immutable` and an ETag. Grid uses `w=300` (`srcset` 300/600 for HiDPI), detail view the original. Invalidate on file change (mtime in the key).

**G5 — Fonts (FE-12).** Bundle **Vazirmatn** (OFL) as woff2 in `assets/fonts/` with `@font-face` (`font-display: swap`, Arabic/Latin subsets if available), licence file alongside, a system fallback stack after it; allow-listed by the static rules from P1 and the CSP (`font-src 'self'`). If the font file cannot be obtained inside your environment → **STOP-GATE**: ask the owner to place `Vazirmatn[wght].woff2` at the documented path; never fetch fonts at runtime.

**G6 — Startup & payload performance (ARCH-04).**
- Serve immediately from the `catalog.json` cache, then reconcile against the disk in the background; `GET /api/movies` includes `meta.scanning` and the client shows a subtle "در حال بروزرسانی…" state; `catalog:changed` refreshes.
- `GET /api/movies`: cached serialised buffer, `ETag` from a catalog revision counter (304 support), **gzip** via built-in `zlib` (no `compression` package).
- `scripts/bench.js` prints scan time, index memory (RSS), payload bytes (raw/gzip), p95 API latency on the fixture.

**G7 — Network notes.** README section for Windows Firewall (`netsh advfirewall firewall add rule …` for the chosen port, private profile only), fixed IP/hostname advice, and what to do when phones cannot connect.

## Constraints
- Must still work with **no** internet and **no** build tools on the shop PC (`sharp` optional!).
- Keep all P1 security properties (allow-list static serving, CSP: add only `font-src 'self'`).
- No other new dependencies. Do not change visual design beyond the font.

## Acceptance criteria
1. Fresh Windows machine transcript (or the closest simulation available): unzip → double-click `Start.bat` → server up, LAN URLs printed, browser opened; killing the node process restarts it.
2. 20k fixture: cold start to first `GET /api/movies` answer ≤ 2 s from cache; full reconcile ≤ 10 s; RSS reported; `/api/movies` gzip payload reported; repeat request with `If-None-Match` → 304.
3. First screen of 40 posters transfers ≤ 1.5 MB with thumbnails (measure with Playwright network log), and uses the browser cache on second load (0 poster bytes).
4. With `sharp` uninstalled the app still serves posters (original files) and logs the fallback once.
5. Fonts load from `/assets/fonts/…` with the network disabled (Playwright offline mode); Persian text renders in Vazirmatn.
6. Log file rotation test (fake dates) keeps 7 files; no secrets in logs (grep test).

## Report
PHASE REPORT + the `bench.js` output before/after.
