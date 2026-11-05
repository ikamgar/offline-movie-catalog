# Contributing

The authoritative working agreement lives in [`AGENTS.md`](../AGENTS.md)
(read §6 before touching code). This page is the quick reference.

## Branches and commits

- Branch from the previous phase's HEAD: `phase/P<n>-<slug>`
  (e.g. `phase/P7b-docs`).
- Commit messages: `type(scope): summary [DEFECT-ID]` —
  e.g. `fix(parser): stop stripping real title words [DATA-12]`.
  Code, comments and commit messages are English; user-visible strings
  are Persian.
- Small commits: **≤ 15 files each**, tests green after every commit.
- Never commit `Library/`, `data/`, `node_modules/`.
- No force-push, no history rewriting; local commits only unless the
  owner explicitly asks to push.
- Scope discipline: do only what the phase prompt lists; anything else
  goes in the phase report under *Discovered*.

## Running checks

```bash
npm run lint          # ESLint (flat config, eslint.config.js)
npm test              # unit + characterization tests (node:test)
npm run test:ui       # Playwright UI tests (needs: npx playwright install chromium)
npm run test:all      # unit + UI in one go
npm run test:repro    # backend defect reproductions (alias)
node mimo/repro/repro-backend.js   # no npm install needed; exit 0 = no PRESENT
node mimo/repro/repro-ui.js        # needs Playwright Chromium
```

Details: [`docs/TESTING.md`](TESTING.md). The runner
(`scripts/run-tests.js`) is plain Node and works on Node 18/20/22/24,
Windows and Linux.

UI tests write screenshots to `mimo/shots/` — restore them before
reviewing the diff:

```bash
git checkout -- mimo/shots/
```

## Adding a defect test

1. Find the ID in [`mimo/DEFECT-REGISTER.md`](../mimo/DEFECT-REGISTER.md).
   A `RUN` defect has a script under `mimo/repro/`; a `CODE` defect must be
   reproduced by a test before fixing whenever feasible.
2. Write the **failing test first** in `test/unit/defects.test.js` (or the
   focused unit file), named with the ID — e.g.
   `DATA-07: deleted order numbers must never be reused`. New defects start
   as `{ todo: 'DATA-07' }` until the fix lands, then the todo flag is
   removed in the same commit as the fix.
3. Use `node:test` + `node:assert/strict` — **no new dependencies**.
4. Tests use **temp directories only** (`os.tmpdir()`); never touch the
   real `Library/` or `data/`.
5. If the repro script prints `PRESENT` for your ID, make it print
   `FIXED` after the change, and run:
   `node mimo/repro/repro-backend.js` (or `repro-ui.js` for front-end IDs).
6. Commit: `fix(scope): … [DATA-07]`.

Never close a defect by weakening its check.

## Documentation changes

Every factual claim in `README.md`, `docs/*.md` and `CHANGELOG.md` must be
verified against the current source (endpoints against `server.js`,
messages against `server/realtime/ws-server.js`, constants against
`backend/constants.js`, labels against the components) — not from memory
or from an older phase report. Persian UI strings must match the wording
in the components exactly.

## Stop-gates

Stop and ask the owner when: an owner decision (D1–D9 in
`mimo/DECISIONS.md`) is needed; a fix needs a new dependency; an on-disk
format changes without an automatic migration; or one commit would touch
more than 15 files.
