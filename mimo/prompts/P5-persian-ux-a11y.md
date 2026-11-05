# P5 — Persian search & sorting, CSS consolidation, accessibility, cleanup

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P5-persian-ux-a11y.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P4 · **Closes:** FE-03, FE-06, FE-07, FE-09, FE-10, FE-11, FE-14, FE-15 · **Branch:** `phase/P5-persian-ux`

## Goal
A Persian-speaking customer finds what they type whatever keyboard they use, sorting feels natural in Persian, modals are keyboard/screen-reader friendly, and the code base carries no dead weight or CSS hidden inside JavaScript.

## Tasks (test-first where behaviour is testable)

**D1 — Persian text normalisation** `js/utils/text.js` → `normalizeFa(str)`: NFKC; Arabic Yeh `ي`(U+064A) and Alef Maksura `ى`(U+0649) → Persian Yeh `ی`(U+06CC); Arabic Kaf `ك`(U+0643) → Persian Keheh `ک`(U+06A9); Persian `۰-۹` (U+06F0–06F9) and Arabic-Indic `٠-٩` (U+0660–0669) → ASCII digits; remove tatweel (U+0640) and Arabic diacritics (U+064B–U+065F, U+0670); **remove ZWNJ** (U+200C) for matching only (display keeps it); lower-case Latin; collapse whitespace. Pure function, exhaustively unit-tested (both directions: query with Arabic letters finds Persian titles and vice-versa; `۲۰۲۰` finds year 2020; `می‌خواهم` matches `میخواهم`).

**D2 — Search (FE-07, FE-03).** Precompute one normalised haystack per item on `loadCatalog()` (title + id + year + genres + type labels in Persian and English: `فیلم/Movie`, `سریال/Series`, `انیمیشن/Animation`, `ایرانی/Iranian`, `بازی/Game`). Tokenise the query on spaces, **AND** the tokens, ranking: exact ID match → title prefix → contains. Never stringify `null`/`undefined` (typing `null` must not match Series — FE-07). Debounce 120 ms. Then **decide the Worker**: measure main-thread search on the 20k catalog; if ≤ 30 ms per query, delete `js/workers/search-worker.js` and all worker code (default); otherwise make the Worker the single search path (no duplicate main-thread implementation) and index it once per catalog load.

**D3 — Sorting.** Where titles/genres are compared with the `en` locale use a shared `Intl.Collator('fa', {numeric:true, sensitivity:'base'})`. Type-specific rules (I11) and the pinned genre order stay exactly as they are; add unit tests with mixed Persian/Latin titles and ZWNJ.

**D4 — Copy/print IDs (FE-06).** Movies/Animation/Iranian → `id`; Series and Games → title (games never print `undefined`). One helper builds the list used by copy, print and order snapshot. The print document is built with DOM APIs / escaped text (P1) and is RTL.

**D5 — Shortcuts (FE-15).** Implement `Ctrl+B` (toggle the selection panel) exactly as advertised; remove the no-op F5/Ctrl+R branch and unused variables; make the shortcuts modal match reality.

**D6 — CSS consolidation (FE-10).** Move every `<style>` injected from JS (`admin-panel`, `login-modal`, `confirm-modal`, others) into `css/components.css` (or new `css/modals.css` / `css/admin.css` linked from `index.html`). One modal system (`.modal-overlay` / `.modal` …), all z-indexes from tokens in `css/themes.css`, no hard-coded `1000`. Add a `@media (prefers-reduced-motion: reduce)` block that disables non-essential animations. **Visual parity:** Playwright screenshot comparison at 1400×900 and 390×844 (light + dark, customer + admin, each modal) before/after; differences must be explainable and listed in the report.

**D7 — Accessibility (FE-14).** All modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus moves in on open, **focus trap**, `Esc` closes, focus returns to the opener. Replace native `window.confirm` in the edit modal with the app's confirm modal. Icon-only buttons get Persian `aria-label`s; selectable cards expose `aria-pressed`; visible `:focus-visible` ring in both themes; `<html lang="fa" dir="rtl">` verified; body text/button contrast ≥ WCAG AA in both themes (fix tokens if needed and list the changes).

**D8 — Dead code & typos (FE-09, FE-11).** Fix `آیمی` → `آیتمی`. Delete, after proving each is unused with grep + green tests: `js/components/floating-selection.js`, `server/realtime/selection-state.js`, `CatalogIndexer.processScanResults`, `Diagnostics.getQuickSummary`, the `data/movies.json` fallback in the store, unused imports (`throttle`, …), stale `.gitignore` entries (`posters/`). One commit per deletion group.

## Constraints
- Do not change wording of existing Persian strings except the typo above; new strings Persian.
- Do not change type-specific sort rules, badges, or genre pinning (I11/I12).
- No new dependencies. Web Components stay light-DOM.
- Keep behaviour of every keyboard shortcut that already works.

## Acceptance criteria (automated unless noted)
1. `normalizeFa` unit tests (≥ 30 cases) pass; searching `کمدی` finds titles stored with `کمدی` and `كمدي`; `2020` and `۲۰۲۰` both find year 2020; `سریال` finds Series; `null` finds nothing by itself.
2. 20k catalog: search keystroke → results ≤ 50 ms (report number); no Worker code remains unless justified.
3. `grep -R "<style" js/` finds no runtime style injection; `grep -R "z-index" js/ css/` shows tokens only (list exceptions).
4. Tab/Shift-Tab cannot leave an open modal; `Esc` closes it and focus returns; axe-core-free manual checklist in the report (no new dependency).
5. Games copy/print output contains titles, never `undefined`.
6. `Ctrl+B` toggles the selection panel (Playwright).
7. Screenshot diff report attached (paths) with all differences explained.

## Verify
`npm test && npm run test:ui`; manual keyboard-only pass through: search → select → open detail → login → edit → close.

## Report
PHASE REPORT + the screenshot-diff summary + the list of deleted files with the grep proof for each.
