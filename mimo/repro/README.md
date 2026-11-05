# Repro scripts

Executable evidence for the defects in `mimo/DEFECT-REGISTER.md`. They print one line per defect: `PRESENT` (bug still there), `FIXED`, or `ERROR` (the script itself could not run — adapt the script to the refactored code, never weaken the assertion). Exit code 1 while anything is PRESENT.

| Script | Needs | Covers |
|---|---|---|
| `repro-backend.js` | Node ≥ 18 only (loads `backend/*` and `server/orders/*` directly) | DATA-01, 02, 03, 04, 05, 06, 07, 08, 11, 12, 17, 18, SEC-03 |
| `repro-ui.js` | `npm i -D playwright && npx playwright install chromium` | FE-01, FE-02, FE-04, SEC-04 |

```
node mimo/repro/repro-backend.js
node mimo/repro/repro-ui.js
PROJECT_ROOT=/path/to/repo node mimo/repro/repro-backend.js   # if the pack lives elsewhere
```

Baseline (v5.4.0): backend **13 PRESENT**, UI **4 PRESENT**.

Notes
- `DATA-01` and `DATA-03` *emulate* the current `PUT /api/movies/:id` handler (rename + in-memory update) because the handler is not importable at baseline. P0 must re-express them as tests that go through the real HTTP route; P3 then flips them.
- The UI script uses a stub HTTP + WebSocket server, so it needs neither Express nor `ws`.
- SEC-01/02/06/07/08 and FE-13 need the real server (Express + ws) — they are turned into HTTP/WS tests in P0.
