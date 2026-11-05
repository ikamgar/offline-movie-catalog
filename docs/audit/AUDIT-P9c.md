# AUDIT-P9c — addendum execution + mutation sampling, 2026-10-22 (auditor session)

**Baseline:** audit/final @ 065dc22; temp-clone probe/mutation runs; NO production code touched.
**Deliverables:** P9b-ADDENDUM (7 tasks) closed in docs/audit/AUDIT-P9b.md; DATA-10 re-graded in DEFECT-REGISTER.md; this report; evidence under `mimo/audit-evidence/p9c/` (21 files).

```
== READ FIRST (≤40 lines) — one-paragraph per owner question ==
Q1 (P9b ADDENDUM): F34 high-severity claim REFUTED (default-credentials were a probe-harness artifact;
   clean-state run: corrupt auth.json → 400 Persian + recoverable loopback setup). Reproduced-in-clean-state:
   F32, F33, F35, F36, F37, F38 (narrowed to mkdir-only); F38 now smallest-scope MEDIUM. M1–M6 exact totals:
   preview accepts EVERYTHING (26 probes, 24 accept incl. mp4/zip/pdf/exe) — new LOW note.
Q2 (bisect, F41): first bad commit = 724b8178 "fix(indexer): type:id map keys…[DATA-05 DATA-06]" —
   parent 16f70cf0 GOOD / 724b8178 BAD verified by rerun (bisect-bad-at-724b8178.txt / bisect-good-at-parent.txt).
   Mechanism: getKey became `type:id` but the scan-rebuild attach kept `_attachMetadata(movie, key)`
   (missed follow-through). DATA-10's tests pass because they only cover the STORE component
   (migration / catalog-delete / rename-follow) and never wire a store into replaceFromScan.
   DATA-10 re-graded REOPENED in DEFECT-REGISTER.md.
Q3 (focus correctness): besides the F41 scan-attach (indexer.js:770), ALL metadata/repository key formats
   line up (bare uid store ↔ uid-based getters ↔ game:`-prefixed uid with bare-title games map +
   slice(5) lookup ↔ payload-cache bucket keys ↔ diagnostics orphans()). No other mixed-key lookup found.
Q4 (recovery doc for admin lockout): NOT documented anywhere. README:97/:102-103/:117-119 mention
   env ADMIN_USERNAME/ADMIN_PASSWORD (which override auth.json) and loopback-only first-run setup —
   that IS the recovery path, but nothing tells the operator what to do when login AND setup both fail (F39).
Q5 (route-existence note on M4): "no game-update route" was misleading: PUT /api/movies/by-uid/game:<title>
   DOES update games (poster-validated) — correction recorded; only the literal absence of PUT /api/games is true.
Q6 (mutation sampling): 24 sites, 17 killed / 7 survived / 0 skipped — canary-failure flag: the
   F33-semantic mutant CAN-SAVE-LIE SURVIVED (suite never asserts save-failure honesty). The F41-layer
   mutants T01/T02 SURVIVED as predicted (proving the attach-key gap); nextId padding mutants F14/F15
   SURVIVED (only `assert.ok(nextId)` truthiness in http.test.js:136 — I2's zero-padding unasserted);
   orders 500-cap mutant F16 SURVIVED (cap unasserted); auth internal gate F09 SURVIVED = redundant.
```

## 1. Mutation-sampling table

Baseline full suite in mutation clone: **746/746 pass (169 suites, 28370 ms)**. Each mutant = full `npm test` once, then revert. Harness/skip-safe applies exact single-occurrence find/replace (`mut/results.json` = same data machine-readable).

| Site | File:line | Mutation | Result | Killed by / classification |
|---|---|---|---|---|
| CAN-AVIF | backend/constants.js:34 | drop `'avif'` from IMAGE_EXTENSIONS | KILLED | creator/parser tests (canary OK) |
| CAN-SAVE-LIE | backend/storage/metadata-store.js:274-277 | save()-failure swallowed, returns true + clears `_dirty` | **SURVIVED** | NONE — F33 semantics unasserted (canary FAILURE) |
| CAN-ARTIST-EN | js/utils/sort.js:49 | delete English article strip | KILLED | sort tests (canary OK) |
| T01-SCAN-ATTACH-UID | backend/indexer.js:770 | `movie, key` → `movie, uid` (would-be F41 fix) | **SURVIVED** | S4: F41-zone unasserted (store-wired replaceFromScan never tested) |
| T02-LOADFROMDISK-TYPED | backend/indexer.js:349 | `movie.uid` → `'x'` | **SURVIVED** | S4: same coverage hole, loadFromDisk sibling site |
| T03-GETKEY-UNTYPE | backend/indexer.js:30-31 | drop `type:` prefix from Movie keys | KILLED | defects.test.js DATA-05 bare-id collision (canary-of-DATA-05 OK) |
| F04-ATTACH-RATING-NULL | backend/indexer.js:282 | `entry.imdbRating` → null | KILLED | attach asserted (store-less path) |
| F05-ATTACH-PLOT-NULL | backend/indexer.js:283 | `entry.plotSummary` → null | KILLED | attach asserted |
| F06-GAMEKEY-NO-LOWERCASE | backend/indexer.js:891 | drop `.toLowerCase()` | KILLED | game title-normalisation asserted |
| F07-GAMEBYUID-NOSLICE | backend/indexer.js (getByUid game branch) | `uid.slice(5)` → `uid` | KILLED | game getByUid asserted |
| F08-PARSER-EXT-PASSALL | backend/parser.js:149 | extension gate → `if (false)` | KILLED | parser unsupported-ext asserted |
| F09-AUTH-RATE-WIDEN | server/auth/auth.js:170 | internal gate `>= 5` → `>= 10` | SURVIVED | S1-redundant: 429 emitted by isRateLimited(:209) before this gate matters |
| F10-AUTH-RATE-OFF | server/auth/auth.js:209 | isRateLimited → `return false` | KILLED | auth.test.js:77 + defects.test.js:300 (429) |
| F11-AUTH-ENV-OVERRIDE-OFF | server/auth/auth.js:71 | env override → undefined | KILLED | headless pre-seed tests |
| F12-AUTH-LOOPBACK-OFF | server/auth/auth.js:126 | setup allowlist → `if (false)` | KILLED | LAN-setup 403 tests |
| F13-WATCHER-DOTSKIP-OFF | backend/watcher.js:314 | dot-folder ignore → `return false` | KILLED | watcher ignore tests |
| F14-IDGEN-NOPAD | backend/services/id-generator.js:31 | drop `padStart` | **SURVIVED** | S2 test gap: I2 zero-padding of auto-next-id unasserted (only `assert.ok` truthy, http.test.js:136) |
| F15-IDGEN-PLUS2 | backend/services/id-generator.js:29 | `maxId + 1` → `+ 2` | **SURVIVED** | S2 test gap: numeric content of nextId unasserted |
| F16-ORDERS-MAXITEMS | server/orders/order-manager.js:40 | 500 → 4 | **SURVIVED** | S2 test gap: order item cap unasserted (M5 captured 3 only) |
| F17-ORDERS-INFOTRUNC | server/orders/order-manager.js:43 | 200 → 299 | KILLED | orders-summary truncation asserted |
| F18-ORDERS-UNDO-0MS | server/orders/order-manager.js:44 | undo window 10000 → 1 ms | KILLED | undo-window tests |
| F19-CREATOR-ID-PREF-OFF | backend/services/movie-creator.js:103 | ignore caller-supplied id | KILLED | explicit-id creator tests |
| F20-CREATOR-ID-VALIDATE-OFF | backend/services/movie-creator.js:104 | delete `_validateId` call | KILLED | ID_INVALID tests |
| F21-SCAN-EXT-PASSALL | backend/scanner.js:128,185 (×2) | accept any extension | KILLED | ignoredFiles counts asserted |

**Reading of the survivors:** two are the promised canary-ish proofs (T01/T02 = F41 layer unasserted), one is a genuine canary FAILURE (CAN-SAVE-LIE = F33's dishonest-success semantics survive the whole suite — same family of "silent loss" that F41 demonstrates), three are real TEST gaps for owner-planned behavior (I2 padding §I2, order cap 500, auth internal gate redundancy), and F09 is a S1-equivalent given the route calls `isRateLimited()` before validating (the gate at :170 is externally unreachable when the route short-circuits).

**S-grades used:** S1 = behaviorally equivalent mutant (no info) · S2 = legit test gap for planned invariant · S4 = mutant would FIX or INDUCE a known defect when suite stays green (coverage hole for that defect).

## 2. P9b-ADDENDUM cross-refs (details live in docs/audit/AUDIT-P9b.md ADDENDUM — kept short here)

- **0a totals** — see docs/audit/AUDIT-P9b.md table: M1 35→14, M2 26→12, M3 26→14, M4 29→16, M5 26→14, M6 26→24 (preview accepts everything incl. mp4/zip/pdf/exe → recorded as LOW note: no file writes, but zero validation).
- **0b** — 22 P9b raw outputs committed under `mimo/audit-evidence/p9b/`.
- **Harness confound** — documented + F34 heading corrected in place (default-cred claim struck, evidence preserved).
- **F33 precision** — debounce 500 ms; save() logs console-only + `_dirty` stays true + NO recordWarning → `/api/diagnostics` stays silent; put-then-later-save self-heals a transient blocker; silent loss only for the last-write window (PUT already returned 200). **NEW evidence from mutation sampling: the suite never asserts the dishonest-save path (CAN-SAVE-LIE survived).**
- **F39** — valid-JSON/garbage-crypto auth.json → permanent lockout (login 401 ×N, setup 403 loopback too, no quarantine/heal). Owner recovery: ADMIN_USERNAME/ADMIN_PASSWORD env (documented), or delete data/auth.json while stopped (undocumented). **README quotes none for the lockout scenario** (Q4 above).
- **F40** — auth.json-as-directory → EISDIR uncaught in setupAdmin / changePassword → English HTML 500 + absolute paths (trust-leak on a loopback-restricted page), plus in-memory→disk split across restart.
- **F38 scope narrowed** — only `ensureDir` throw escapes fail-open (data/thumbs as FILE/locked); sharp-generation failures correctly serve the original with 200. Severity reduced attack surface: creation-blocked, not generation-common.
- **M1f note correction (task 6)** — "no game-update route" wording replaced (see Q5 above); mp42 → 400 IMG_UNSUPPORTED demonstrates the by-uid game route validates posters.
- **Key-format audit (task 3)** — clean except indexer.js:770 (the F41 site). Details in docs/audit/AUDIT-P9b.md ADDENDUM e.3.
- **Register re-grade** — DATA-10 row: CLOSED(P2) → **REOPENED (F41, HIGH)** with bisect evidence + coverage-gap explanation (mimo/DEFECT-REGISTER.md:47).

## 3. Product-behavior notes captured while auditing (no new defects)

- Game rows carry NO editor metadata at all (games in games-map are never `_attachMetadata`-touched; game-editor has no metadata wiring) — so no games-side F41 variant exists.
- The upload gates are extension-based only (movie-creator.js:253 checks the data-URL extension against IMAGE_EXTENSIONS; no magic-byte sniff) — consistent with M1's F32 polyglot acceptance.
- payload-cache ETag: quoted sha1 of the exact body + gzip copy; multiple probes showed identical ETags on 304s across restarts — stable unless the catalog revision changes (verified behavior against GET /api/movies).
- WMTP get-by-id: exact `Map:`-key match, then typed fallbacks (Movie/Iranian/Animation) — the asymmetry F41 exploits exists ONLY between the `bare uid` store and the scan-attach parameter, not in the getters.

## 4. Discovered (out of scope, not added to the diff)

- `test/unit/http.test.js:136` auto-id truthiness-only assertion (S2 gap behind F14/F15) — fix belongs to the owner's P9d/D2 follow-up, not this audit.
- The orders `MAX_ORDER_ITEMS=500` never has a suite boundary test (F16).
- auth.js's internal rate-limit branch (auth.js:170) is redundant with the route-level isRateLimited() short-circuit (F09 survivor signal).
- The `m1.json` archive end-coded one probe row with origin-immutable Persian text — file kept as-is (evidence fidelity).

## 5. Evidence manifest (mimo/audit-evidence/p9c/)

- `bisect-firstbad-stat.txt` / `bisect-bad-at-724b8178.txt` / `bisect-good-at-parent.txt` — first-bad verification.
- `f34b-out.txt`, `c1-out.txt` — clean-state F34/F39/F40 runs.
- `f33b-out.txt`, `f33c-out.txt`, `dbs-out.txt`, `dbs2-out.txt`, `iso3-out.txt`, `f41-out.txt` — F33/F41 mechanism evidence.
- `f38-out.txt` — F38 boundary evidence; `m1f-out.txt` — brand-matrix + preview-note evidence.
- `w-out.txt`, `w-f37-out.txt` — clean-state F32/F35/F36/F37 + m1g route test.
- `mut/results.json` — 24 mutation results (machine-readable, matches the table above).
