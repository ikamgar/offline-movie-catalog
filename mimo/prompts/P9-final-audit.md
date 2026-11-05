# P9 — Independent final audit

> **Kickoff (paste this in a FRESH session, read-only/plan mode first):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P9-final-audit.md`. You are the auditor, not the author. Do not fix anything unless a step below says so.

**Depends on:** P0–P8 merged · **Branch:** `audit/final` (only report files may be committed)

## Goal
Prove — with evidence, not confidence — that the catalog is correct, safe and fast, and produce a release decision for the owner.

## Steps

**1. Clean-room build.** Fresh clone into a new folder; follow README literally; `npm ci`; `npm run lint`; `npm test`; `npm run test:ui`. Record every command and result. Any deviation from the README is itself a finding.

**2. Defect register walk.** For **every** ID in `mimo/DEFECT-REGISTER.md` (SEC-01…ARCH-07) write one line: `ID · CLOSED|PARTIAL|OPEN · evidence` where evidence is a test name, a repro output line, or a manual observation with steps. `RUN` defects must show `FIXED` in `node mimo/repro/repro-backend.js` / `repro-ui.js`. A defect is CLOSED only if its test would fail on the baseline (`git stash`-free check: run the test against tag `baseline-5.4.0` in a temp worktree).

**3. Adversarial pass (be hostile).** Try to break it and record results:
- Security: fetch `/server/auth/auth.js`, `/data/orders.json`, `/%2e%2e/package.json`; call every admin endpoint without/with a stale token; upload a PHP/HTML file renamed `.jpg`; ids/genres with `..`, `\\`, `CON`, 300-char names; titles with `<img onerror>`, `'`, `"`, `%`, `` ` ``; 300 KB and 20 MB WebSocket frames; 50 messages/second; brute-force login; DNS-rebinding style `Host` header (report only).
- Data: kill -9 during a burst of saves and during a rename batch; corrupt `orders.json`/`metadata.json`/`catalog.json`; disk-full/read-only `data/`; rename/delete folders while running; duplicate IDs across types; 7-digit IDs; Persian + ZWNJ filenames; case-only renames on Windows.
- UI: keyboard-only journey; RTL at 320/390/768/1400 px; slow-3G throttle; offline mode; two customers + two managers concurrently (state D1 behaviour observed); server restart with open clients.
- Performance on the 20k fixture: numbers versus the AGENTS.md budget.

**4. Diff review.** Review `git diff baseline-5.4.0..HEAD --stat` and read the risky parts (auth, safe-path, watcher reconcile, editor, storage). Look for: leftover `TODO/FIXME/console.log`, swallowed errors, weakened checks, tests marked `skip`/`todo` that should be active, dependencies added beyond D9, Persian strings changed unintentionally, dead code introduced.

**5. Regression checklist for humans** (`docs/RELEASE-CHECKLIST.md`, ≤ 1 page, Persian + English headings): the 15 things the owner should click before every release.

## Deliverables (commit only these)
- `AUDIT.md` with: verdict (**SHIP / SHIP WITH CONDITIONS / DO NOT SHIP**), evidence tables (register walk, adversarial results, performance numbers vs budget), residual risks ranked, and a prioritised backlog for the next iteration.
- `docs/RELEASE-CHECKLIST.md`.
- Updated `mimo/DEFECT-REGISTER.md` status column (only status/evidence cells).

## Constraints
- Do not modify source code, tests or configs in this phase. If you find a bug, add it to `AUDIT.md` with a minimal reproduction and a suggested fix — the owner will hand it back to a build session.
- Be specific and falsifiable; "looks fine" is not evidence.

## Report
Paste `AUDIT.md`'s verdict and top five risks in the PHASE REPORT format's *Risks* and *Questions* fields.
