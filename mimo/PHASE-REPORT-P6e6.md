# PHASE REPORT — P6e6 (E6): README selection documentation + two P6c-review fixes

Branch / commits: `phase/P6e6-readme` — `aabda6c` (red), `8dcad07` (green), `76c3118` (runner isolation), `e9192ff` (README)

## Defects closed
- **ARCH-05** — evidence: `README.md` now has a **Customer Selection** section stating plainly that every customer screen (kiosk, phone, any LAN browser) shares ONE selection, no per-device/per-station carts, last device to change it is what the manager sees, by design (D1); the two bullets that advertised "multi-user selection" were reworded. *Not reproducible by a runtime test — documentation defect; evidence is the README diff itself.*

## Review fixes (P6c review items 1–2; item 3 = "no action" per owner)
- **(1) Perf test isolation** — `scripts/run-tests.js`: in `ui`/`all` modes `test/ui/perf.test.js` now runs as its own `node --test` invocation after the suite files (it stays inside `npm run test:ui`, so standard verification still covers it). P4-C5 ran green in its quiet process: `{"firstPaintFullMs":358,"loadCatalogToPaintMs":137,"selectMs":13,"longTasks":[],"searchMs":257,"cards":40}`, `✔ P4-C5 — 20k performance budgets (2004ms)`.
- **(2) Game platform-removal confirm** — `js/components/edit-modal.js`: a game save that removes a platform now opens the app's confirm modal naming the platforms and warning that the poster copy in that folder is deleted (mirrors the Q3 genre-removal wording); rename-only game saves still save directly (P6c E4 intent preserved). Red test `removing a platform: one confirm naming it, no PUT before confirm, exact patch after` in `test/ui/game-manage.test.js`.

## Files changed (4)
- `test/ui/game-manage.test.js` — red test for platform-removal confirm
- `js/components/edit-modal.js` — platform-removal confirm (game branch of `_handleSubmit`)
- `scripts/run-tests.js` — perf invocation split
- `README.md` — E6 section + bullet rewording

## Tests: before → after
- unit: 622 / 620 pass / 0 fail / 2 todo (ARCH-01 pair) → **unchanged**
- UI: 69 (incl. perf) → **69 suite + 1 perf separate** (suite 68→69 from the new test), all pass
- raw verification: `npm test` 622/620/0/2 EXIT=0 · `npm run test:ui` 69/69 + 1/1 EXIT=0 · repro-backend `0 present, 13 fixed, 0 error` EXIT=0 · repro-ui `0 present, 4 fixed, 0 error` EXIT=0 · boot smoke isolated (`Ready.` reached, stderr empty, repo `data/` untouched)

## Decisions / assumptions
- D1 unchanged — documentation task only (default behaviour stays "one shared selection, last write wins").
- Assumption: "own test-runner invocation" = second `node --test` process inside `npm run test:ui`, so the standard four-command verification still exercises perf.

## User-visible behaviour changes
- Game edit that drops a platform asks for confirmation (Persian, in-app modal, never `window.confirm`).
- README describes the shared selection honestly.

## Risks / could not verify
- None; P4-C5 (the former 390 ms flake) is green when isolated. Full UI suite + repros re-run green after all edits.

## Discovered (out of scope, untouched)
- README still says Node v14 (ARCH-07), shows `Serries/` folder and a `tt1234567-…` filename example (ARCH-02) — assigned to P7.

## Questions for the owner
- None.
