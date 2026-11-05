# Testing Guide

## Quick Start

```bash
npm test                 # Run unit/characterization tests
npm run test:ui          # Run UI tests (requires Playwright browsers)
npm run test:all         # Run unit + UI tests together
npm run test:repro       # Run defect reproductions
```

## How the test runner works

`npm test`, `npm run test:ui`, and `npm run test:all` use `scripts/run-tests.js`,
which collects `*.test.js` files from the appropriate directories and passes them
as explicit arguments to `node --test`. This avoids two Node 22+ issues:

- `node --test <directory>` no longer expands to test files (Node 22+).
- `node --test` (no args) also picks up helper files under `test/helpers/`.

The runner is pure Node (no dependencies) and works on Node 18, 20, 22, and 24,
on both Windows and Linux.

## Test Suites

| Suite | Path | Description |
|-------|------|-------------|
| Parser | `test/unit/parser.test.js` | Filename parsing, classification, TYPE_MAP |
| Indexer | `test/unit/indexer.test.js` | Catalog indexing, genre merge, persistence |
| Sort | `test/unit/sort.test.js` | Type-aware comparators (ES module) |
| Orders | `test/unit/order-manager.test.js` | CRUD, persistence, order numbering |
| HTTP | `test/unit/http.test.js` | REST API shape, auth, poster serving |
| WebSocket | `test/unit/ws.test.js` | Hello handshake, selection broadcast, orders |
| Defects | `test/unit/defects.test.js` | Todo tests for known defects |
| UI | `test/ui/ui.test.js` | Playwright browser tests (auto-skips if missing) |

## How `todo` Tests Work

Each known defect has a test marked `{ todo: '<ID>' }` in `test/unit/defects.test.js`.
These tests assert the **desired** behaviour and currently fail.
When a defect is fixed in a later phase, remove `todo` from its describe block — the test must then pass.

```
ℹ tests 194   ← total test count
ℹ pass 163    ← characterization tests (must always pass)
ℹ fail 0      ← must stay 0
ℹ todo 31     ← one per defect ID (must match defect register count)
```

## Adding a Defect Test

1. Add a `describe('ID — description', { todo: 'ID' }, ...)` block in `test/unit/defects.test.js`
2. The test name **must** start with the defect ID
3. The test body asserts the **desired** behaviour (will fail today)
4. Run `npm test` and verify `todo` count incremented by 1

## Fixture Library (Performance Testing)

```bash
node scripts/make-fixture-library.js --out ./fixture-library --movies 15000 --animation 2000
```

Generates tiny valid JPEGs with realistic Persian/English names.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port (`0` = random) |
| `LIBRARY_PATH` | `./Library` | Poster library root |
| `DATA_DIR` | `./data` | Data directory for catalog/orders |
