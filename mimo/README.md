# MiMo prompt pack — Offline Movie Catalog

Everything a coding agent needs to take **v5.4.0** from "works on a good day" to "safe, fast, maintainable", one verifiable phase at a time.

## What is in the pack
```
AGENTS.md                      ← standing brief; copy to the ROOT of the repo (agents that support AGENTS.md load it automatically)
mimo/
  README.md                    ← this file
  DEFECT-REGISTER.md           ← 47 findings (IDs, severity, evidence status, phase that closes each)
  DECISIONS.md                 ← 9 owner decisions with safe defaults
  prompts/P0…P9-*.md           ← one prompt per session
  repro/                       ← runnable bug reproductions (backend: no install; UI: Playwright)
```

## Setup (once)
1. Unzip so that `AGENTS.md` sits next to `server.js` and the `mimo/` folder sits beside it.
2. Open the project in your agent (assumed: a terminal coding agent with file access, git and shell — e.g. MiMo Code). Work on a **git branch**; keep a copy of the current zip as a backup.
3. Sanity check: `node mimo/repro/repro-backend.js` → expect `13 present`.

## Session protocol (every phase)
1. **New session per phase** (fresh context). Start in the agent's read-only/plan mode.
2. Paste the *Kickoff* line at the top of the phase file (it tells the agent which files to read). Optionally prepend `OWNER OVERRIDES: D1 = …` (see `DECISIONS.md`).
3. Let it produce the plan. Read it: does it stay inside the phase? Does it list STOP-GATE questions? Answer them, then let it build.
4. When it finishes it must print the **PHASE REPORT**. Verify two things yourself: `npm test` is green and the repro scripts show what the report claims.
5. **Paste the report back to me.** I review it, adjust the next prompt to what actually happened (renamed files, decisions taken, failed tests) and hand you the corrected kickoff. This loop is the main quality lever — do not skip it.
6. Merge the phase branch only after step 4 passes.

## Phases
| Phase | File | What it does | Risk | Closes |
|---|---|---|---|---|
| P0 | `P0-safety-net.md` | Baseline tag, testable `createServer()`, characterization + `todo` defect tests, 20k fixture generator | low | ARCH-01/07 |
| P1 | `P1-security.md` | Static allow-list, admin auth, credentials, traversal, XSS, upload/WS hardening | **high** (touches everything) | SEC-01…08, FE-04/08 |
| P2 | `P2-storage-and-orders.md` | Atomic writes, backups, metadata store, order numbering | medium (on-disk migration) | DATA-07/08/10/14 |
| P3 | `P3-catalog-pipeline.md` | Parser, scanner, watcher, edit/create services, ID policy, diagnostics | **high** | DATA-01…06, 09, 11…13, 15, 17, 18 |
| P4 | `P4-frontend-core.md` | Store lifecycle, granular updates, grid/card rewrite, 20k performance | **high** | FE-01/02/08 |
| P5 | `P5-persian-ux-a11y.md` | Persian search/sort, CSS consolidation, accessibility, dead code | medium | FE-03/06/07/09/10/11/14/15 |
| P6 | `P6-manager-features.md` | Series editing, genres, delete/restore, games, orders workflow (+ optional stations) | medium | FE-05/13, ARCH-05 |
| P7 | `P7-quality-docs-ci.md` | Lint, single sources of truth, README/docs, CI | low | ARCH-01/02/03 |
| P8 | `P8-ops-performance.md` | Launchers, logging, thumbnails, fonts, startup speed | medium | FE-12, ARCH-04/06 |
| P9 | `P9-final-audit.md` | Independent evidence-based audit and release verdict | none (read-only) | — |

P0 → P3 is the critical path for data safety; do not reorder P0–P4. P5–P8 can be swapped if priorities change. Expect P1, P3 and P4 to need a second pass — that is normal.

## Why the prompts look like this (so you can edit them safely)
- **Fixed skeleton:** goal → context (with evidence) → numbered tasks → constraints → measurable acceptance → verify commands → report. Agents drift when any of these is missing.
- **Evidence over assertion:** each defect has a reproduction; the agent must turn it into a failing test *before* fixing.
- **Stop-gates:** decisions that belong to the owner (identity model, deletion policy, new dependencies) are never guessed.
- **Small blast radius:** one phase = one theme, one branch, one report; out-of-scope findings go to *Discovered*.
- **Numbers, not adjectives:** performance and correctness targets are explicit (20k posters, ≤ 50 ms click).
If you edit a prompt: keep task IDs (S1, B6, …) stable, keep acceptance criteria testable, and never remove a STOP-GATE.

## Known limits of the audit
Express/`ws` could not be installed in the audit sandbox (no network), so the HTTP-level findings (SEC-01/02/06/07/08, FE-13) are `CODE`/`LIKELY`; P0 turns them into real tests first. Everything marked `RUN` was executed (backend modules directly; UI in headless Chromium against a stub API).
