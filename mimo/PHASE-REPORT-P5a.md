# PHASE REPORT — P5a Persian search & sorting

**Branch / commits:** `phase/P5a-persian-search` (from P4-followup `374119c`) — local only:

| # | Commit |
| --- | --- |
| 1 | `05e54cf` feat(text): normalizeFa — Persian/Arabic normalisation for matching [FE-07,D1] |
| 2 | `57c00f2` refactor(sort): shared Intl.Collator('fa') replaces en localeCompare [FE-07,D3] |
| 3 | `8394c95` feat(search): normalised haystack, AND tokens, ID>prefix>contains ranking [FE-07,D2] |
| 4 | `914903c` feat(search): store integration, 120ms debounce, delete unused search worker [FE-03,FE-07,D2] |
| 5 | `e203a56` fix(search): rebuild search index on movie:updated/added hot patches [FE-07,D2] |
| 6 | this report |

**Defects closed:**
- **FE-07** (all three facets: no Persian normalisation / `String(null)` matches / `'en'` sorting) — evidence below (unit + UI + greps).
- **FE-03** (search Worker never queried) — Worker deleted after measurement (D2 gate); grep proof below.

**Deferred / untouched:** D4–D8 tasks (FE-06, FE-09, FE-10, FE-11, FE-14, FE-15) belong to P5b/P5c per instruction.

---

## Requirement → test evidence

| # | Requirement (P5a D1–D3) | Evidence | Result |
| --- | --- | --- | --- |
| D1 | `normalizeFa`: NFKC | `text.test.js` «NFKC compatibility normalisation» (3 cases) | pass 39/39 |
| D1 | Arabic Yeh/Alef Maksura → Persian Yeh, both directions | `text.test.js` «Yeh variants» (5) + «both directions» | pass |
| D1 | Arabic Kaf → Persian Keheh, both directions | `text.test.js` «Kaf variants» (4) | pass |
| D1 | Persian + Arabic-Indic digits → ASCII; `۲۰۲۰` finds 2020 | `text.test.js` «digits → ASCII» (5) + `search.test.js` «۲۰۲۰ finds year» + UI test «۲۰۲۰ finds year-2020 item» | pass |
| D1 | remove tatweel, diacritics U+064B–065F + U+0670 | `text.test.js` «tatweel and diacritics» (4) | pass |
| D1 | ZWNJ removed for matching only | `text.test.js` «ZWNJ removed» (3) + `search.test.js` «ZWNJ query finds…» | pass |
| D1 | lower-case Latin, collapse whitespace, null-safe | `text.test.js` «Latin lowercasing» (3), «whitespace» (3), «null/undefined» (3) | pass |
| D1 | pure, idempotent | `text.test.js` «composition & idempotence» (3) | pass |
| D2 | one haystack per item on load (title+id+year+genres+type, Persian+English) | `search.test.js` «precomputes a normalised haystack…», «games with platform labels» | pass |
| D2 | never stringify null/undefined; `null` finds nothing | `search.test.js` «never stringifies…» + «typing "null"/"undefined" finds nothing» + UI test «null must not match the Series» | pass |
| D2 | tokenise on spaces, AND tokens | `search.test.js` «tokenise on spaces, AND the tokens» (3) | pass |
| D2 | rank exact-ID > title-prefix > contains | `search.test.js` «ranking» (3: ID/prefix/contains + stability + tieBreak) | pass |
| D2 | debounce 120 ms | `search-bar.js:12` `debounce(..., 120)` (was 150); UI flows wait ≥500 ms | pass |
| D2 | **Worker decision: measure 20k, ≤30 ms → delete** | unit measurement (raw below): `build=150.4ms avg=3.18ms worst=6.54ms`, subset worst 4.02 ms → **deleted**; grep proof: 0 matches for `search-worker\|_searchWorker\|new Worker(` in js/server/backend; `js/workers` gone | **worker path taken: DELETE** |
| D2/AC2 | 20k keystroke → results ≤50 ms (report number) | `perf.test.js` «P5a search processing»: **filter 6.2 ms → frame 6.7 ms** (matched 369/20 000), run-to-run 4.4–6.9 ms | pass |
| D2 | index stays fresh on hot patch (discovered) | `ui.test.js` «movie:updated / movie:added keep the search index fresh» — broadcasts via stub, searches new title | pass 3/3 |
| D3 | shared `Intl.Collator('fa',{numeric, sensitivity:'base'})`, `'en'` gone | `sort.test.js` «shared fa collator» (4) + grep proof (only a doc comment remains: `sort.js:17`) | pass |
| D3 | I11 type rules + pinned genre order unchanged | all 24 pre-existing sort tests pass untouched; `store.js` genre-pin block (line ~208) not modified; no-query sort path byte-for-byte the old one | pass |
| D3 | ZWNJ titles in sort | `sort.test.js` «ZWNJ title equals its no-ZWNJ variant» (`compare === 0`) + «mixed Persian/Latin» | pass |
| — | Arabic↔Persian query cross-matching end-to-end | `ui.test.js` «Arabic-typed and Persian-typed کمدی queries each find both stored forms» (types `كمدي` and `کمدی` against mixed stored forms) | pass |

---

## Worker decision (D2, explicit)

**Path taken: main thread — Worker deleted.**

Raw measurement (20 000-item fixture, `test/unit/search.test.js`, Node 24):
```
[P5a] 20k search: build=150.4ms avg=3.18ms worst=6.54ms
[P5a] 5k-subset search: worst=4.02ms
```
- Index build: one-time per catalog load (81–150 ms across runs; runs after data arrives, not on the critical path of first paint).
- Per query: **avg ~2–3 ms, worst ~5–7 ms ≤ 30 ms** → condition met → `js/workers/search-worker.js` deleted, all worker code removed (`_initSearchWorker`, `_indexMovies`, `_searchWorker`, boot call, `fetchGames` re-index).
- Browser-side confirmation (`perf.test.js`): `{"filterMs":6.2,"toFrameMs":6.7,"matched":369}` — filter + grid commit ≤ 50 ms budget.
- Proof: `grep search-worker|_searchWorker|new Worker(` over `js/ server/ backend/` → **0 matches**; `js/workers` → **does not exist**.

---

## Files changed (11, grouped)

| Group | Files |
| --- | --- |
| D1 | `js/utils/text.js` (new), `test/unit/text.test.js` (new) |
| D3 | `js/utils/sort.js`, `js/store.js` (games sort + import), `test/unit/sort.test.js` |
| D2 | `js/utils/search.js` (new), `js/store.js` (index + applyFilters + hot-patch rebuild), `js/components/search-bar.js`, `js/workers/search-worker.js` (deleted) |
| docs | `AGENTS.md` (repo-map line: removed `workers/search-worker.js`, added `text,search`) |
| tests | `test/unit/search.test.js` (new), `test/ui/ui.test.js` (+3 tests), `test/ui/perf.test.js` (debounce comments + post-debounce measurement) |

No new dependencies. No `data/`, no `Library/`, no shots committed.

---

## Tests: total / pass / fail / todo — before → after

| Suite | Before (P4-followup) | After (P5a) |
| --- | --- | --- |
| unit (`npm test`) | 418 / 416 / 0 / 2 | **493 / 491 / 0 / 2** (+75: text 39, search 24, sort +12; todo = ARCH-01 only) |
| ui (`npm run test:ui`) | 20 / 20 / 0 / 0 | **23 / 23 / 0 / 0** (+2 normalisation E2E, +1 hot-patch freshness) |
| repro-backend | 0 present, 13 fixed, exit 0 | **0 present, 13 fixed, exit 0** |
| repro-ui | 0 present, 4 fixed, exit 0 | **0 present, 4 fixed, exit 0** |

---

## Decisions taken / assumptions

1. **Rank vs I11:** ranking (exact-ID → title-prefix → contains) applies **only while a query is active**; with no query the sort path is exactly the old one. With a query, only the *matches* are sorted once with a composite comparator `(rank → type comparator)` — the 20k catalog is never re-sorted per keystroke (first draft did sort-first; caught by the perf test and rewritten).
2. **Index out-of-band:** haystacks live in parallel entry lists (`_movieSearchIndex` / `_gameSearchIndex`), never as fields on catalog items → no pollution of WS payloads, orders or PUT bodies.
3. **Hot-patch freshness:** `movie:updated` / `movie:added` replace item objects, so the index is rebuilt there too (discovered during implementation; regression-tested). Full `loadCatalog`/`fetchGames` rebuild as before.
4. **AND semantics widen multi-word queries** (each token matches anywhere) — intended by D2; old behaviour was a single substring phrase.
5. `perf.test.js`'s legacy `searchMs` metric is dominated by its fixed 250 ms sleep; kept unchanged (P4 budget intact) and a **true** post-debounce measurement added alongside it.
6. `AGENTS.md` repo-map line updated so the doc matches the deleted file (flagged in the plan as assumption #4).

## User-visible behaviour changes

- A customer typing on any keyboard finds the same titles: Arabic `ي/ك` ↔ Persian `ی/ک`, `۲۰۲۰` ↔ `2020`, ZWNJ/tatweel/diacritics ignored in search (display keeps ZWNJ).
- Typing `null` no longer matches every Series/no-year item.
- Multi-word queries match tokens across fields (e.g. `اکشن 2008`).
- Results are ranked: exact ID first, then title-prefix, then contains (ties keep the usual type order).
- Search debounce 150 → 120 ms.
- Series and Games titles now sort with the Persian collator (Persian alphabetical, numeric, case-insensitive); ZWNJ-variant titles compare equal. Type-specific rules (I11) and pinned genres are unchanged.

## Risks / could not verify

- Timing assertions (unit ≤30 ms, UI ≤50 ms) are machine-dependent — green on every run this session; could flake on a loaded machine.
- Collator ordering assumptions are pinned against Node 24's ICU; a runtime with an older ICU could order mixed-script ties differently (tests would flag it).
- No manual keyboard-only walkthrough was performed for search beyond the automated flows (P5c a11y pass covers the full keyboard pass).

## Discovered (out of scope)

- `store.js` genre fallback still calls `localeCompare(b, 'fa')` directly instead of the shared collator — deliberately untouched (pinned genre order, I11).
- `data/movies.json` fallback in `loadCatalog` still present (FE-09 → D8).
- FE-06 (games copy/print `undefined`), FE-10, FE-11, FE-14, FE-15 remain for P5b/P5c.

## Questions for the owner

None.

---

## Verification (raw)

```
=== npm test ===
EXIT=0
tests 493
suites 127
pass 491
fail 0
cancelled 0
skipped 0
todo 2
  [P5a] 20k search: build=150.4ms avg=3.18ms worst=6.54ms
  [P5a] 5k-subset search: worst=4.02ms

=== npm run test:ui ===
EXIT=0
P4-C5 metrics: {"firstPaintFullMs":374,"loadCatalogToPaintMs":182,"selectMs":12,"longTasks":[],"searchMs":251,"cards":40}
P5a search processing: {"filterMs":6.2,"toFrameMs":6.7,"matched":369}
tests 23
suites 15
pass 23
fail 0
cancelled 0
skipped 0
todo 0

=== node mimo/repro/repro-backend.js ===
RB_EXIT=0
0 present, 13 fixed, 0 error

=== node mimo/repro/repro-ui.js ===
RU_EXIT=0
FIXED    FE-01  selecting one card must not rebuild the grid or lose scroll position
FIXED    FE-02  rescan x3 must keep exactly one WebSocket and not spawn extra Workers
FIXED    SEC-04  markup in title / plotSummary must be rendered as text, never executed
FIXED    FE-04  a Series whose title contains an apostrophe must still get the placeholder when its poster 404s
0 present, 4 fixed, 0 error

=== grep proofs ===
'en' localeCompare in js/:   sort.js:17 (doc comment only)
worker code in js/ server/ backend/: 0 matches; js/workers exists: False
```
