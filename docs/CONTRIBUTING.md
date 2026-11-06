# Contributing

Guidelines and standards for contributing to the Offline Movie Catalog.

## Branches and commits

- Create feature or fix branches from `main`: `feature/<slug>` or `fix/<slug>`.
- Commit messages follow conventional commits: `type(scope): summary` —
  e.g. `fix(parser): stop stripping real title words`.
  Code, comments and commit messages are English; user-visible strings
  are Persian.
- Small commits: **≤ 15 files each**, tests green after every commit.
- Never commit `Library/`, `data/`, `logs/`, or `node_modules/`.
- No force-push, no history rewriting without prior coordination.

## Running checks

```bash
npm run lint          # ESLint (flat config, eslint.config.js)
npm test              # unit + characterization tests (node:test)
npm run test:ui       # Playwright UI tests (needs: npx playwright install chromium)
npm run test:all      # unit + UI in one go
```

Details: [`docs/TESTING.md`](TESTING.md). The runner
(`scripts/run-tests.js`) is plain Node and works on Node 18/20/22/24,
Windows and Linux.

## Adding a test

1. Write the **failing test first** in `test/unit/defects.test.js` (or the
   focused unit test file under `test/unit/`).
2. Use `node:test` + `node:assert/strict` — **no new dependencies**.
3. Tests use **temp directories only** (`os.tmpdir()`); never touch the
   real `Library/` or `data/`.
4. Run `npm test` to verify the failure, then implement the fix.
5. Commit: `fix(scope): …`.

Never close an issue by weakening its check.

## Documentation changes

Every factual claim in `README.md`, `docs/*.md` and `CHANGELOG.md` must be
verified against the current source (endpoints against `server.js`,
messages against `server/realtime/ws-server.js`, constants against
`backend/constants.js`, labels against the components) — not from memory.
Persian UI strings must match the wording in the components exactly.

## Stop-gates

Stop and discuss with maintainers when:
- A change requires a new runtime dependency (runtime is strictly `express` and `ws`).
- An on-disk format changes without an automatic migration.
- A change touches core domain invariants (see `docs/ARCHITECTURE.md`).
