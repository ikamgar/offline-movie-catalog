# PHASE REPORT - P6b delete & restore (E3)

Branch: `phase/P6b-delete-restore` (from `370c77e` = P6a head) — Commits: 3 build commits + this report (+ shots)

Scope per `mimo/prompts/P6-manager-features.md`: **task E3 only** (soft delete, trash list, restore). Owner instruction: implement after plan + STOP-GATE answers; **stop after this report — do not start E2/E4/E5/E6 or any later phase.**

## Commits

| # | Commit | Content |
|---|---|---|
| 1 | `0b9d16b` | `test(p6b): red — soft delete, restore, purge-on-21st, trash API + UI [D6]` — TDD red first (6 files, +875: new `movie-trash.test.js` (16 tests), +8 http, +1 watcher, +3 edit-modal UI, new `trash-panel.test.js` (3), ui-stub gained DELETE/trash/restore endpoints + `trash` export) |
| 2 | `fd08193` | `feat(p6b): soft delete, restore, trash list, purge-on-21st, watcher dot-folder skip [D6]` |
| 3 | `7812c31` | `feat(p6b): delete confirm in edit modal, admin trash panel with restore [D6]` |
| 4 | (this) | `docs(p6b): phase report + dialog screenshots [D6]` |

## Requirement → test evidence (E3 checklist)

| Prompt requirement | Change | Evidence |
|---|---|---|
| `DELETE /api/movies/by-uid/:uid` (admin) moves **every** poster copy to `Library/.trash/<timestamp>/` preserving relative paths | `backend/services/movie-trash.js` — sources = all `_fileIndex` paths for the movie's key (+`absolutePosterPath` belt), only files that exist; `trash id = Date.now()+seq` (unique vs log + disk); moves planned then executed with a reverse undo stack | unit `delete: single-genre file moves to .trash/<id>/ with relative path preserved…`, `delete: multi-genre movie - every copy moves…`; http `DELETE: every copy moves into .trash/<id>/…` (`moved: 2`) |
| writes `manifest.json` (uid, title, original paths, deletedBy, time) | entry written atomically inside the undoable phase; manifest read **before** any mutation (plain `JSON.parse` — corrupt → refuse) | http entry-shape assertions (`uid/title/originalPaths/deletedBy/deletedAt`); unit `delete: corrupt manifest → 500 TRASH_MANIFEST_ERROR, nothing moved` |
| `GET /api/trash` (last 20) | newest-first by id, purged excluded, log stays complete on disk | unit `list(): newest-first, capped at 20, purged entries excluded`; http `GET /api/trash: newest-first with the full entry shape` + `returns the 20 newest … log entries never dropped` (manifest keeps 22) |
| `POST /api/trash/:id/restore` aborts **409** if any original path is taken, nothing moved | two-pass pre-check (all sources must exist → 404 before any destination check → 409), then same undo-stack moves; manifest entry dropped only on success | unit `restore: occupied destination → 409 … nothing moved; entry intact`; http `restore into an occupied destination → 409 RESTORE_CONFLICT, nothing moved, no partial restore` |
| UI: delete button in the edit modal (second click) | `#editDeleteBtn` «حذف فیلم» (not rendered for `type === 'Game'`), confirm names the title + promises سطل زباله recovery; **no DELETE before the confirm** | UI `delete fires no DELETE before the confirm; second click sends exactly one; card disappears`, `server delete failure shows the Persian error toast and keeps the modal open`, `Series also offers delete` |
| UI: trash list in the admin panel | «سطل زباله» section before orders: title, `fa-IR` date, `N فایل`, «بازگردانی» button, empty state «سطل زباله خالی است»; loads on admin role transition + on `trash-changed` | UI trash-panel suite 3/3: list order/shape, restore POST id + row removal + card back, empty state |
| `watcher.expect(...)` for all paths | sources+targets registered on delete and restore, deduped | unit `delete: watcher.expect receives every source and target path` |
| metadata stays in the store so a restore brings the rating/summary back | metadata store never touched by delete; restore re-enters the index via shared `scanFile` → `_attachMetadata` | unit `restore: … movie reappears with rating/plot intact…` (`imdbRating` 8.3 + plot back); http acceptance 3 (8.7 / “A takedown plot” round-trip) |
| 401 for non-admin, 400 for traversal (AC6) | all three routes behind `requireAdmin`; restore id `^\d+$` + `resolveInside` belt | http `all three endpoints require admin auth (401)`, `bad restore id 400 VALIDATION`; unit `non-numeric id → 400 VALIDATION` |
| Acceptance 3 (automated) | delete → files under `.trash` + manifest → restore → item back with rating/summary; occupied → 409 | http tests cited above, same server run |
| watcher must not resurrect `.trash` files | red test **proved** the leak: `walkDir(base, null)` in `_reconcileTree` gets no root dot-folder skip, `classifyFromPath('.trash')` → `Movie` + garbage genre; fixed with `_isIgnoredPath` at 4 points (`_watchRecursive`, `_reconcile`, `_handleEvent`, `_reconcileTree` diskFiles) | watcher `P6b D6 - root dot-folders (.trash) are invisible to the watcher` (red before commit 2 → green) |
| D6 purge window (owner: files purged past most-recent-20, log entry permanent with `purgedAt`) | post-commit best-effort `_purgeOverflow`; entry position ≥ 20 without `purgedAt` → `rmSync(dir)` + `purgedAt` + manifest rewrite; failure logged, retried next delete (idempotent) | unit `purge: the 21st deletion purges the OLDEST deletion's files … its log entry stays with purgedAt; window entries untouched` |

`mimo/prompts/P6-manager-features.md` E3's “If the owner chose *no delete feature*, skip E3” does **not** apply — owner confirmed **D6 soft delete** at the STOP-GATE.

## Owner decisions applied (STOP-GATE answers)

| Q | Decision applied |
|---|---|
| Q1 delete confirmation | **Second-click confirm** (typed title not required). Message names the title, the trash destination and that it is recoverable; «حذف فیلم» / «خیر» buttons (D7 in-app dialog, no `window.confirm`). |
| Q2 trash capacity (changed from my proposal of dropping entries) | **Log entries live forever**; when a deletion ages past the most recent 20 (the 21st new delete), its **files** are purged from `Library/.trash/` while the entry stays with a `purgedAt` marker. **Test required and written** (see purge row above). |
| Q3 games | `game:` uid or `type === 'Game'` → **400 `GAME_UNSUPPORTED`**, poster untouched; deferred to E4. |

## Decisions taken + assumptions

- **Trash id** = `Date.now()+seq`, unique against the log and disk; validated `^\d+$` + `resolveInside` (I2's `^\d{1,6}$` is for *movie* ids, not trash ids).
- **Manifest is the restore contract**: read with plain `JSON.parse` (never `readJsonSafe` — quarantining it would silently destroy restore history); corrupt/structure-bad → `500 TRASH_MANIFEST_ERROR` and the delete is refused before any mutation.
- **Rollback discipline**: one reverse undo stack per operation; manifest write is *inside* the undoable phase (delete rollback removes a not-yet-existing manifest instead of leaving an empty one); empty-dir cleanup is rmdir-only and never force-deletes files; restore prunes only folders **it** created (a pre-existing genre folder survives a rollback, I1). Phase-aware codes: `DELETE_FAILED` / `RESTORE_FAILED` / `TRASH_MANIFEST_ERROR`.
- **Restore pre-check order**: missing source → `404 TRASH_NOT_FOUND` is checked before occupied destination → `409` (an orphaned log entry must not report a bogus conflict).
- **Broadcasts count movies, not files**: `catalog:changed {removed: 1}` per delete, `{added: n}` on restore (unit-pinned `deepEqual`).
- **UI sorts the trash list by `deletedAt` desc** (id desc only as tiebreak) — log ids are `Date.now()` for real deletions but arbitrary for pre-seeded entries; the real server's id-desc order agrees for live data.
- `deletedBy` = `req.adminUser` (session username), falling back to `'admin'`.
- AGENTS.md §5 REST list also gained `PUT /api/movies/by-uid/:uid` — a **P6a doc gap** found while adding the three new endpoints.
- Screenshots: dark theme at **both required viewports** (1400×900, 390×844) — 6 shots, see Verification.

## Tests: before → after

| Suite | Before (`370c77e`) | After | New tests |
|---|---|---|---|
| Unit (`npm test`) | 536 / 534 pass / 0 fail / 2 todo | **561 / 559 / 0 / 2** | +25 = 16 movie-trash + 8 http + 1 watcher |
| UI (`npm run test:ui`) | 38 / 38 | **44 / 44** | +6 = 3 edit-modal + 3 trash-panel (new file) |

**Red evidence (test-first):**
- Unit red: `tests 546 / pass 534 / fail 10 / todo 2`, EXIT=1 — 8 http + 1 watcher (`.trash` resurrection demonstrated on a real temp Library) + 1 suite-load failure (`Cannot find module '../../backend/services/movie-trash'`).
- UI red: `tests 44 / pass 36 / fail 4 / cancelled 4`, EXIT=1 — 3 edit-modal P6b (no `#editDeleteBtn`) + the documented P4-C5 perf flake (639 ms); cancelled = the trash-panel suite (module awaits load) + the documented login-timing flake.

## User-visible behaviour changes

- **Edit modal (manager):** new red **«حذف فیلم»** button (kept apart from save/cancel; never rendered for Games) → confirm dialog «حذف فیلم» whose text names the movie, says it moves to «سطل زباله» and that it can be restored from the admin panel. Success: toast ««X» به سطل زباله منتقل شد», modal closes, grid refreshes (card gone), admin trash list refreshes. Failure: the server's Persian error verbatim in a toast, modal stays open, movie stays.
- **Admin panel:** new **«سطل زباله»** section between the selection list and orders — each row: title, Persian locale date, file count (`N فایل`), **«بازگردانی»**; loads on admin login and after any delete; restore → toast + row removed + catalog refresh; empty state «سطل زباله خالی است».
- **Server:** three new admin endpoints (`DELETE /api/movies/by-uid/:uid`, `GET /api/trash`, `POST /api/trash/:id/restore`) with structured codes (`NOT_FOUND`, `GAME_UNSUPPORTED`, `VALIDATION`, `TRASH_NOT_FOUND`, `TRASH_PURGED`, `RESTORE_CONFLICT`, `TRASH_MANIFEST_ERROR`, `DELETE_FAILED`, `RESTORE_FAILED`) and Persian messages (Q6 pattern).
- **Watcher (invisible but real):** root-level dot-folders (`.trash`, …) are now never watched, never indexed, never reconciled — they were leakable before (red test proved it).
- All new user-visible strings are Persian; no existing Persian wording was reworded.

## Verification (raw)

**1/4 `npm test`** → `EXIT=0`
```
ℹ tests 561
ℹ pass 559
ℹ fail 0
ℹ todo 2
```
**2/4 `npm run test:ui`** → `EXIT=0` (cooled machine; run 60 s after the previous one)
```
ℹ tests 44
ℹ pass 44
ℹ fail 0
ℹ cancelled 0
ℹ todo 0
```
**3/4 `node mimo/repro/repro-backend.js`** → `EXIT=0`
```
… 13 FIXED lines (DATA-01…18, SEC-03 …)
0 present, 13 fixed, 0 error
```
**4/4 `node mimo/repro/repro-ui.js`** → `EXIT=0`
```
FIXED FE-01 / FE-02 / SEC-04 / FE-04
0 present, 4 fixed, 0 error
```
**Boot smoke** `node server.js` with empty temp `LIBRARY_PATH`/`DATA_DIR`, `PORT=3199`: startup sequence clean, “Ready.” after 5 s, stderr empty, `GET /api/movies` → 200, `GET /api/trash` without auth → **401**. Real `Library/` and `data/` never touched (temp dirs only, §6.6).

**Screenshots** (`node mimo/repro/p6b-shots.js`, deterministic ui-stub, frozen CSS):
```
mimo/shots/p6b/admin-dark-desktop-edit-delete.png     edit modal + «حذف فیلم»
mimo/shots/p6b/admin-dark-desktop-confirm-delete.png  second-click confirm (title + سطل زباله)
mimo/shots/p6b/admin-dark-desktop-trash.png           «سطل زباله» list (newest first, file counts)
mimo/shots/p6b/admin-dark-mobile-edit-delete.png      same states at 390×844
mimo/shots/p6b/admin-dark-mobile-confirm-delete.png
mimo/shots/p6b/admin-dark-mobile-trash.png
```

## Risks / could not verify

- **Hard-kill window (documented, accepted like P6a's Q5):** a kill *between* the moves and the manifest write leaves files under `.trash/<id>/` with **no log entry** — not restorable through the API, invisible in the list; the index keeps stale entries until the next scan (then broken-link diagnostics). Caught exceptions are fully rolled back (tested: injected 2nd-move failure → 1st copy back, no manifest, index untouched). Such an orphan folder is only visible on disk inspection and is never auto-purged.
- **Purge failure path:** if the manifest rewrite after a purge fails, `purgedAt` may be lost and the folder re-purged on the next delete — idempotent (`rmSync force`), only a log line.
- **P4-C5 perf flake** (documented in P6a): warm runs hit `loadCatalogToPaintMs` 323–554 ms (> 300 ms budget) while P6b tests stayed green; final cooled run 44/44 EXIT=0. Warm-machine login/focus-timing flakes (P4-C4 family, files untouched by this diff) also fired in intermediate runs — not hardened (out of scope).
- **Manual 20k-fixture walkthrough** from the prompt's Verify section not run (no fixture in the repo); the Playwright trash-panel suite covers the same flows against the real app served by the stub.
- Screenshot matrix: dark theme only (both viewports, as the prompt asks for viewport sizes).

## Discovered (out of scope — not in the diff)

- AGENTS.md §5 had no `PUT /api/movies/by-uid/:uid` line (P6a gap) — fixed in commit 2 while adding the new endpoints.
- `walkDir(base, null)` skips **no** dot-folders (root skip needs `libraryRoot`) — any future watcher feature relying on it must filter per-path as `_reconcileTree` now does.
- Orphan trash folders from the hard-kill window are never reclaimed by the purge logic (purge only walks manifest entries) — candidate for a startup sweep in a later ops phase.
- Games still have no usable delete path beyond `400 GAME_UNSUPPORTED` (E4 pending); E2/E5/E6 untouched; P6-B not applicable (D1 unchanged).

## Files changed (11 + this report)

```
backend/services/movie-trash.js    E3 core: delete/restore/list, undo stack, purge-on-21st, manifest I/O
backend/watcher.js                 _isIgnoredPath at 4 points (.trash invisible to watch/reconcile/index)
server.js                          MovieTrash wiring + 3 requireAdmin routes via sendEditError + export
AGENTS.md                          §5 REST: + DELETE by-uid, GET /api/trash, POST /api/trash/:id/restore (+ P6a's missing PUT by-uid)
js/components/edit-modal.js        #editDeleteBtn, confirm (title + سطل زباله), _performDelete (toast/hide/trash-changed/loadCatalog)
js/components/admin-panel.js       «سطل زباله» section, _loadTrash/_renderTrash, restore delegation, 'role' key + trash-changed
css/admin.css                      .admin-trash* styles
css/components.css                 .edit-delete-btn (separated in the RTL actions row)
test/unit/movie-trash.test.js      new file, 16 tests
test/unit/http.test.js             +8 P6b tests (auth, delete/list/restore flows, codes, cap-20)
test/unit/watcher.test.js          +1 dot-folder test (red proved the leak)
test/ui/edit-modal.test.js         +3 delete tests
test/ui/trash-panel.test.js        new file, 3 tests
test/helpers/ui-stub.js            DELETE /api/trash /restore endpoints + trash seed export (test-only)
mimo/repro/p6b-shots.js            screenshot harness for the 3 new dialog states × 2 viewports
mimo/shots/p6b/*                   6 PNGs + manifest.txt
```

## Questions for the owner

1. **Next scope** — which of E2 (add-modal downscale/validation), E4 (games management, incl. game soft delete), E5 (orders workflow), E6 (D1 docs) is P6c?
2. **Hard-kill orphan folders** — accept as documented residual (manual disk inspection), or schedule an automatic startup sweep of `.trash/` folders that have no manifest entry (P8/ops)?
3. **Screenshots** — dark theme only was captured; is a light-theme round wanted too?

**Stopped here as instructed — E2/E4/E5/E6 not started.**
