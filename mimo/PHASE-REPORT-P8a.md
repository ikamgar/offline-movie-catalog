## PHASE REPORT — P8a Launchers, config, logging

Branch / commits: `phase/P8a-launchers-config-logs` (from `93ca986`) — 4 commits:
`75c4f48` config · `195b614` logger · `660960b` ops launchers · `3f2e59e` docs.
No pushes; working tree clean.

### What was done (G1/G2/G3/G7 only — G4/G5/G6 left for P8b as instructed)

| Requirement (P8 prompt) | Evidence |
|---|---|
| **G1** — `Start.bat`: `chcp 65001`; Node ≥ 18 check, readable Persian + English message otherwise; auto `npm ci --omit=dev` when `node_modules` missing (install.bat still works); print every LAN URL (non-internal IPv4) via `scripts/print-urls.js`; open default browser on server PC; crash-restart loop (3 s; stop after 5 crashes / 2 min, readable message); window title version from package.json | **Ran (full integration, closest simulation):** full `Start.bat` executed via `cmd /c` under env `PORT=3457`, `DATA_DIR`/`LIBRARY_PATH` temp — banner `Movie Catalog v5.4.0`, LAN lines printed (`http://172.18.0.1:3457/ (xray_tun)`, `http://10.137.63.72:3457/ (Wi-Fi)`), browser opened (HTTP GETs to `/` + css/js visible in the log), server up (`/api/auth/status` → 200), `logs/stop.request` → `[SERVER] Stop request (Stop.bat) — shutting down…` → flush → `Server stopped.`. Node-missing/node-old/npm-fail branches **ran by reading only** (this machine has Node 24; branches are goto-labels with plain `echo`+`exit /b 1`). **Crash loop ran:** supervisor + temp crashing child → 4× bilingual restart messages, 5th crash → bilingual stop block, exit 1, elapsed 12.4 s. Unit tests `test/unit/supervisor.test.js` 8/8 (injected clock: 5-in-2-min stop, window ageing, ≥2-min-run reset, exit-0=done, signal counts as crash, constants 3000/120000/5 pinned); `test/unit/print-urls.test.js` 6/6 (normal, IPv6-skipped, loopback-skipped, virtual adapters kept, legacy numeric family, empty/null interfaces, os wiring) |
| **G1** — CRLF endings | **Ran:** both files rewritten to CRLF, byte-verified — `Start.bat bytes=2846 CRLF=83 bare-LF=0`; `Stop.bat bytes=308 CRLF=13 bare-LF=0` (`.gitattributes` already pins `*.bat text eol=crlf`) |
| **G2** — optional `config.json` (port, libraryPath, dataDir) under env (env > config.json > defaults); actionable validation; missing library ≠ crash | **Ran:** `test/unit/config.test.js` 14/14 — precedence env>file>default, relative-path resolution, malformed JSON → warn+defaults, unknown-key typo hints, invalid port → 3000, missing Library → bilingual warning + continue, `formatConfigMessages` shape. `config.example.json` committed, `config.json` git-ignored. Live wiring ran in the integration transcript (env overrides exercised) |
| **G3** — `logs/app-YYYYMMDD.log`, 7-day rotation; compact console; unhandled rejections/exceptions logged then exit non-zero; graceful shutdown flushes storage + closes sockets; never log secrets; re-add `logs/` to .gitignore | **Ran:** `test/unit/logger.test.js` 4/4 — rotation with injected clock over 10 days → exactly 7 files; init prunes stale; disabled default writes nothing; **secrets test:** real server (`startTestServer`), login `S3cret-Log-Probe-99!`, Bearer-token `/api/diagnostics`, failed login `WrongPassword-NotLogged` → log contains `POST /api/auth/login` + `GET /api/diagnostics` (non-vacuous) but none of password/token/`Bearer`/`authorization`. Graceful path ran in the integration transcript (stop-file → flush `INDEXER Saved` → sockets closed → exit 0). Fatal-handler wiring (`onFatal` → log + bilingual console line + exit 1) **verified by reading**; the pure functions around it are unit-tested and the crash-loop (supervisor) part of the path ran for real |
| **G7** — README: firewall rule (`netsh advfirewall`, private profile, port), fixed IP/hostname advice, phones-checklist; Persian guide updated (owner-visible text changed) | **Ran by reading:** commands and checklist are the exact strings now in README §"LAN & firewall"; `docs/راهنمای-مدیر.md` gained «راه‌اندازی و توقف» (Start/Stop.bat, LAN address line, crash behaviour, config.json port change, firewall pointer). Not executed on this machine (would alter the host firewall — owner runs the rule when deploying) |

### Defects closed
None in the register — P8a is feature work (launcher/config/logging gaps), not defect closures.

### Defects partially closed or deferred
None. G4/G5/G6 (bench/performance tasks in the P8 prompt) deliberately untouched — P8b.

### Files changed (4 commits, 18 files)
- **G2 (3+1):** `server/config.js` · `config.example.json` · `.gitignore` (+`logs/`, `config.json`) · `test/unit/config.test.js`
- **G3 (3):** `server/logger.js` · `server.js` (logger require, `requestMiddleware()`, auto-start block: resolveConfig messages → `logger.init` → `onFatal` handlers → stop-file watch 1 s unref → logger start/shutdown lines) · `test/unit/logger.test.js`
- **G1 (6):** `scripts/print-urls.js` · `scripts/supervisor.js` · `Start.bat` (rewrite) · `Stop.bat` (new) · `test/unit/print-urls.test.js` · `test/unit/supervisor.test.js`
- **Docs (5):** `README.md` (quick start, Configuration, Logs, LAN & firewall, structure) · `docs/ARCHITECTURE.md` (module map) · `AGENTS.md` (repo map) · `docs/راهنمای-مدیر.md` · `CHANGELOG.md` (P8a entry; P7c heading retired to `## P7c`)

### Tests: total / passing / todo — before → after
- Unit: **635 → 667 (+32 = config 14 + logger 4 + supervisor 8 + print-urls 6)**, all pass, 0 fail, exit 0 (635 was the P7c closing count; the intermediate 653 figure quoted in the first draft was mid-phase)
- UI: **70 → 70** pass (+ perf suite 1/1) — unchanged by this phase, re-run green
- Repro: backend **0 present, 13 fixed, 0 error** (exit 0); UI **0 present, 4 fixed, 0 error** (exit 0)
- Lint (`npx eslint .`): exit 0, zero findings

### Four raw commands (owner-required)
| Command | Result |
|---|---|
| `npm test` | exit 0 — `tests 667 / pass 667 / fail 0` |
| `npm run test:ui` | exit 0 — `tests 70 / pass 70 / fail 0` + perf `tests 1 / pass 1 / fail 0` |
| `node mimo/repro/repro-backend.js` | exit 0 — `0 present, 13 fixed, 0 error` |
| `node mimo/repro/repro-ui.js` | exit 0 — `0 present, 4 fixed, 0 error` |
| `npx eslint .` | exit 0, 0 lines of output |

### Runnable transcripts (beyond the four commands)
1. **Crash loop:** `node scripts\supervisor.js <temp crash.js>` → 4 restart messages (EN + FA), 5th crash → bilingual stop block → exit 1, 12.4 s.
2. **Full Start.bat integration:** `cmd /c Start.bat` with env `PORT=3457` + temp `DATA_DIR`/`LIBRARY_PATH` → version banner, LAN URLs, browser open, server up, `logs/stop.request` → graceful flush (`INDEXER Saved`), `Server stopped.`, exit 0; `logs/app-20261013.log` shows structured startup + request lines + stop INFO. (Opened one browser tab at `localhost:3457` during the run — the real launcher behaviour.)
3. **CRLF byte check** of both `.bat` files (above).

### Decisions taken
No new owner decisions needed (no STOP-GATE hit). Assumptions stated pre-work and kept: `config.json` git-ignored + committed example; all config-file errors warn + fall back + continue (never fatal); env stays legacy-lenient (`parseInt(x)||3000`, `PORT=0`→3000); strict 1–65535 validation only for config.json; supervisor in Node (owner-approved lean); console keeps the existing compact banner, the file gets structured lines; missing Library = warn + continue (matches documented empty-catalog boot); `Stop.bat` optional-by-design (a file drop, not a service).

### User-visible behaviour changes
- Windows: double-clicking `Start.bat` now does everything (check → install → LAN URLs → browser → supervised run); crashes self-heal for 3 s; a crash storm stops with a readable message instead of looping forever. New `Stop.bat` for a clean stop. Startup messages about config problems appear (bilingual) instead of silent defaults.
- `config.json` can now set port/paths without env vars.
- Daily log files appear under `logs/` (git-ignored, 7 newest kept) — never containing credentials.
- README/Persian guide document firewall + phone-connection steps.

### Risks / could not verify
- **Browser pop, node-missing branch, npm-fail branch** on a truly clean PC (no Node, no node_modules) were not executed — verified by reading; the happy path and every pure function ran. First-run `npm ci` itself is the same command `install.bat` has always run.
- Supervisor restart-on-real-server-crash exercised with a crashing child, not with a deliberately broken server.js — policy is unit-tested and spawn wiring is shared.
- `netsh` firewall commands not run here (host change); copy-paste commands documented verbatim.
- Redirected `cmd` output through PowerShell mangles the Persian console text in logs (OEM decode artifact); on the owner's interactive console `chcp 65001` renders it correctly — same mechanism the old launcher relied on.

### Discovered (out of scope, not touched)
- `package.json` still has no `supervisor` script (Start.bat calls the file directly; Linux users use the documented path — a one-line `npm run start:watch` alias would be P8b material).
- The server banner/console output (English + arrows) is pre-existing and unchanged; only the launcher added bilingual text, per scope.
- `Start.bat`'s `pause` after a graceful stop relies on EOF/any key; harmless but a future `exit /b` instead of `pause` would close the window automatically if the owner prefers.

### Questions for the owner
None blocking. Optional preference: after `Stop.bat`, should the server window close by itself (no "Press any key")? — **resolved by follow-up below: yes, it now closes itself on a clean stop.**

---

## ADDENDUM — P8a follow-up (closing pass)

Commits: `4908721` extract stop-file + fatal handlers · `e879c8f` fatal config exit 2 + supervisor pass-through · `b4dd779` Start.bat window behaviour · `616f2c2` BOM strip · `f1908b4` docs · + this addendum commit. Local only, no push.

### 1. Number corrections in the body
- **Tests line fixed:** unit **635 → 667 (+32 = config 14 + logger 4 + supervisor 8 + print-urls 6)** — 635 was the P7c closing count (653 was mid-phase and wrong).
- Every other number re-checked against raw output and still true: crash-loop `elapsed_ms=12412` (12.4 s, 4 restarts + stop, exit 1); config 14/14, logger 4/4, supervisor 8/8 + print-urls 6/6 (tally `tests 14`); unit `667/667`; UI `70/70` + perf `1/1`; repros `0/13/0` and `0/4/0`; eslint exit 0 / 0 lines; commits 4 / files 18; LAN URLs + `logs/app-20261013.log` transcript lines verbatim.
- CRLF figures in the G1 row were raw for commit `660960b` and stay true for it; **after this follow-up Start.bat changed** → re-measured: `Start.bat bytes=3252 CRLF=93 bare-LF=0`, `Stop.bat bytes=308 CRLF=13 bare-LF=0`.
- Body statements now superseded by the addendum: "branches ran by reading only", "fatal handlers verified by reading", "all config errors warn + fall back (never fatal)", the window `pause` question in *Discovered*.

### 2. The three Start.bat branches — now RUN (temp copy of the project, `$TEMP\p8a-batcopy`, node_modules excluded)

**(a) node missing** — `cmd` run with PATH reduced to `C:\Windows\System32;C:\Windows`:
```
===============================================
       Movie Catalog vunknown
===============================================
 Node.js is NOT installed.
 Node.js نصب نیست.
 Please install Node.js 18 or newer from https://nodejs.org
 then run Start.bat again.
 لطفاً Node.js نسخه ۱۸ یا جدیدتر را از https://nodejs.org نصب کنید
 و دوباره Start.bat را اجرا کنید.
Press any key to continue . . .
```
**exit code 1**, window stays open (pause).

**(b) node too old** — stub `node.cmd` first on PATH printing `v16.0.0` for `--version`:
```
===============================================
       Movie Catalog vunknown
===============================================
 Your Node.js version is v16 - version 18 or newer is required.
 نسخهٔ Node.js شما v16 است؛ نسخه ۱۸ یا جدیدتر لازم است.
 Please install a newer Node.js from https://nodejs.org
 لطفاً نسخه جدیدتر را از https://nodejs.org نصب کنید.
Press any key to continue . . .
```
**exit code 1**, window stays open.

**(c) npm install failing** — stub `npm.cmd` exiting 1, `node_modules` absent (real Node 24):
```
===============================================
       Movie Catalog v5.4.0
===============================================
 Installing dependencies for the first time (please wait)...
 در حال نصب برنامه‌های مورد نیاز برای بار اول؛ لطفاً صبر کنید...
stub-npm: simulated offline failure
 Installing dependencies failed.
 نصب برنامه‌های مورد نیاز ناموفق بود.
 Check the internet connection, run install.bat, then Start.bat again.
 اتصال اینترنت را بررسی کنید، install.bat و سپس Start.bat را اجرا کنید.
Press any key to continue . . .
```
**exit code 1**, window stays open. (Not in CI: these branches need `cmd`.)

**Bonus launcher run — broken config.json through Start.bat** (junction to real node_modules, temp `PORT`/`DATA_DIR`/`LIBRARY_PATH`, `config.json = { port: broken, "libraryPath": 123`): banner v5.4.0 → LAN URLs → exactly **one** `[CONFIG ERROR] CONFIG_JSON` block + the bilingual "will NOT start" block → Start.bat error message → pause. **exit code 2**, **no restart** (one block, not two); copy's log shows `ERROR fatal config errors — server not started (exit 2)`.

### 3. Stale stop file — chosen action: REMOVE at startup
`server/stop-file.js` deletes `logs/stop.request` when arming the watch (this preserves the behaviour that was inline in server.js, now extracted and tested). **Why safe:** the file's entire meaning is "stop the run that is currently up"; a file found at boot belongs to an already-finished run (graceful stop already consumed a fresh one; a leftover means hard-kill or Stop.bat pressed while nothing ran) — honouring it would kill the brand-new server nobody asked to stop. A real Stop.bat request can only be written after the fresh run is up (arm happens milliseconds after process start), so no legitimate request is lost; the fire is one-shot and consumes the file. Tests: `test/unit/stop-file.test.js` 4/4 (stale removed + no stop over 150 ms; fresh file stops exactly once and is consumed; re-appearing file cannot re-fire; missing dir does not throw; server.js wiring asserted).

### 4. Broken config.json → stop with exit 2 (behaviour change)
- **Fatal (exit 2, bilingual block, log line):** unreadable JSON file, invalid JSON, non-object top level, `libraryPath`/`dataDir` present but not a usable non-empty string. Resolution returns `hasFatal`; auto-start prints messages then exits `CONFIG_ERROR_EXIT_CODE = 2` **before** `createServer` — no folders are created, no first-run auth, nothing touched.
- **Warn + fall back (unchanged):** unknown keys, invalid `port`, invalid env `PORT`, missing `Library` folder.
- **Supervisor:** exit 2 → passes the code through, **no restart, not counted as a crash** (policy action `config-error`; real spawn test proves one child run, < 2.5 s, no "Restarting" message; 4 earlier crashes still get their full budget).
- **BOM fix found while transcripting:** old Notepad's UTF-8 BOM made `JSON.parse` reject a *valid* file → BOM stripped before parse (test: BOM file loads, port applies).
- Tests: `config.test.js` **14 → 21**, `supervisor.test.js` **8 → 11**; both green.

### 5. Window behaviour (item 5) — implemented
After supervisor exit 0 Start.bat does `goto :clean-stop` → `exit /b 0`, **no pause** (window closes itself). Every non-zero path (node missing/old, npm fail, config exit 2, crash storm) keeps the bilingual problem message on screen with `pause`, then exits with that code. Verified by all four transcripts above.

### 6. Fatal handlers — run for real (item 6)
Two child processes each requiring `server/logger.js`, `init()` into a temp dir, `installFatalHandlers()` (the exact call server.js makes), env `ADMIN_PASSWORD=F4tal-Env-Probe-22!`:

```
================ PROBE: reject ================
exit code: 1
  [FATAL] unhandledRejection — the server must stop. / سرور به دلیل خطای غیرمنتظره متوقف شد.
  [FATAL] fatal probe rejection
  [FATAL] Details: / جزئیات در لاگ: ...\app-20260101.log
--- log: 2025-12-31T20:30:00.000Z ERROR FATAL unhandledRejection: Error: fatal probe rejection
    at Object.<anonymous> (...probe.js:7:18) ... (full stack)
secret leaked: false
================ PROBE: throw ================
exit code: 1
  [FATAL] uncaughtException — the server must stop. / سرور به دلیل خطای غیرمنتظره متوقف شد.
  [FATAL] fatal probe exception
  [FATAL] Details: / جزئیات در لاگ: ...\app-20260101.log
--- log: 2025-12-31T20:30:00.000Z ERROR FATAL uncaughtException: Error: fatal probe exception
    at Timeout._onTimeout (...probe.js:9:28) ... (full stack)
secret leaked: false
```
Asserted in `test/unit/fatal-handlers.test.js` 3/3: exit **1** both cases, `FATAL` line + stack in the file log, bilingual `[FATAL]` console lines, and neither `F4tal-Env-Probe-22!` nor the key name `ADMIN_PASSWORD` in log or output.

### Verification — four raw commands + lint (raw output)
| Command | Raw result |
|---|---|
| `npm test` | `NPM_TEST_EXIT=0` · `ℹ tests 684 / pass 684 / fail 0 / cancelled 0 / skipped 0 / todo 0` (duration 25947 ms) |
| `npm run test:ui` | `NPM_TEST_UI_EXIT=0` · `ℹ tests 70 / pass 70 / fail 0` + perf `ℹ tests 1 / pass 1 / fail 0` · `shots-clean=True` |
| `node mimo/repro/repro-backend.js` | `REPRO_BACKEND_EXIT=0` · `0 present, 13 fixed, 0 error` |
| `node mimo/repro/repro-ui.js` | `REPRO_UI_EXIT=0` · `0 present, 4 fixed, 0 error` · `shots-clean=True` |
| `npx eslint .` | `ESLINT_EXIT=0 output-lines=0` |

Tests: unit **635 → 667 (+32, body)** → **667 → 684 (+17 = config +7, supervisor +3, stop-file +4, fatal-handlers +3)** = **635 → 684** for the phase. UI 70 + perf 1 unchanged.
*(The “+46” figure quoted mid-session in the follow-up transcript is 32+14 — the phase delta counted **before** `test/unit/fatal-handlers.test.js` (+3) was added; the correct final delta is +49.)*

### Assumptions taken (addendum)
1. `CONFIG_SHAPE` (valid JSON, not an object) counts as "cannot be parsed **as configuration**" → fatal — same lost-data rationale as malformed JSON. *(Slight superset of the literal instruction; flag if you want warn+fallback instead.)*
2. A bad `libraryPath`/`dataDir` value fatals **when it would actually be used**; a `LIBRARY_PATH`/`DATA_DIR` env override replaces it entirely → no fatal. A *fully broken file* (unparseable) fatals even with env set — the file itself is broken.
3. BOM stripping added (found in transcript) — a valid file must not be refused for a BOM; still fatal for genuinely broken JSON.
4. Clean-stop window close applies to exit 0 only (Stop.bat / Ctrl+C path); supervisor crash-storm (1) and config (2) keep the window open.

### Files changed in the follow-up (6 commits incl. this one, 16 unique files)
`server/stop-file.js` (new) · `server/logger.js` · `server/config.js` · `server.js` · `scripts/supervisor.js` · `Start.bat` · `test/unit/stop-file.test.js` (new) · `test/unit/fatal-handlers.test.js` (new) · `test/unit/config.test.js` · `test/unit/supervisor.test.js` · `README.md` · `docs/ARCHITECTURE.md` · `AGENTS.md` · `CHANGELOG.md` · `docs/راهنمای-مدیر.md` · `mimo/PHASE-REPORT-P8a.md` (`server.js`/`config.js`/`config.test.js` each touched by two commits; no commit exceeds 5 files).

### Risks / could not verify (addendum)
- `cmd`-dependent branches are not in CI (Linux runners) — transcripts above are the evidence.
- Real first-run `npm ci` still never executed (stub only); same command `install.bat` has always used.
- The `netsh` firewall commands remain read-verified (host change, by design).
