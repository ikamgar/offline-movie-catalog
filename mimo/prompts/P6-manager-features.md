# P6 — Manager tools: complete editing, delete/restore, games, orders workflow

> **Kickoff (paste this):** Read `AGENTS.md`, `mimo/DEFECT-REGISTER.md`, `mimo/DECISIONS.md`, then execute `mimo/prompts/P6-manager-features.md`. Plan first, list STOP-GATE questions, then implement and finish with the PHASE REPORT.

**Depends on:** P5 · **Closes:** FE-05, FE-13, ARCH-05 (documentation + optional P6-B) · **Branch:** `phase/P6-manager-features`
**Owner decisions used:** D1, D6 (check `OWNER OVERRIDES` at the top of the pasted prompt).

## Goal
The manager can run the catalog entirely from the UI: edit any item (including Series), manage genres and posters, add/remove movies and games safely, and handle orders as a real workflow — without ever touching the file system by hand.

## Tasks

**E1 — Edit modal (FE-05).** Use `PUT /api/movies/by-uid/:uid` (P3) for every type. Fields: title, year, ID (not for Series/Games), rating, summary, **genres** (Movie only), **replace poster**. Genre edits add/remove poster *copies* in genre folders (removal asks for confirmation via the app's confirm modal). Show Persian validation errors inline; map `409` conflicts to a clear message; never use `window.confirm`. Uses `js/utils/api.js`.

**E2 — Add modal (FE-13).** Client-side downscale before upload: canvas, max 1400 px on the longest side, JPEG quality 0.85 (WebP when the source has transparency and the browser supports it); show the resulting size. Distinguish error causes in the toast: validation (400), too large (413), conflict (409), auth (401), network. Allow **creating a new genre** (validated name, becomes a folder). Warn on a probable duplicate (same normalised title + year). The filename preview must come from the **same builder as the server** (expose `POST /api/movies/preview` or share the module) — no third copy of the naming logic (ARCH-03).

**E3 — Delete & restore (D6 default = soft delete).** `DELETE /api/movies/by-uid/:uid` (admin) moves **every** poster copy to `Library/.trash/<timestamp>/` preserving relative paths and writes `manifest.json` (uid, title, original paths, deletedBy, time). Endpoints: `GET /api/trash` (last 20), `POST /api/trash/:id/restore` (aborts with 409 if any original path is taken). UI: delete button in the edit modal (double confirmation with the title typed or a second click) + a trash list in the admin panel. `watcher.expect(...)` for all paths; metadata stays in the store so a restore brings the rating/summary back. If the owner chose "no delete feature", skip E3 and say so.

**E4 — Games management.** Add / edit / delete games (title, platforms PS4/PS5, poster) with the same safety rules as movies (safe-path, magic bytes, all-or-nothing, soft delete). Files live in `Games/PS4|PS5/{Title}.ext`; both platform copies are managed together.

**E5 — Orders workflow.** Order fields (additive, old orders load with defaults): `customerName?`, `note?` (both ≤ 200 chars), `status` ∈ `new | preparing | done` (default `done` for legacy orders), `updatedAt`. WS: `orders:update-status {orderId,status}` → broadcast `orders:update`. UI: status chips + filter (status/date), edit name/note, **print view** (A5, RTL, big IDs, date, order number) and **CSV export** (UTF-8 **with BOM** so Excel shows Persian correctly; columns: order, date, status, name, id, title, year, type). Deleting an order is soft with a 10 s **undo** toast (purged afterwards; backup rule from P2 applies). The manager header shows a badge with the count of items in the live customer selection.

**E6 — D1 documentation.** Whatever D1 is, describe the real behaviour honestly in the README ("all customer screens share one selection" unless P6-B is done) and show it in the customer UI only if the owner asks.

### P6-B (ONLY if `D1 = per-station rooms` — otherwise skip entirely)
Each customer device gets a `station` (from `?station=2` or a generated id in `localStorage`, editable label). Server: one selection per station; `selection:state` is sent **only to that station's sockets and to managers** together with `station`; managers get a station switcher with live badges per station; orders record `station`. Migration: existing single selection becomes station `1`. Protocol version bump to 2 with graceful fallback for protocol 1 clients. Tests: two customers on different stations never see each other's items; manager sees both.

## Constraints
- Every write endpoint: admin-only, validated with `safe-path`, magic-byte checked (uploads), rate-limited by the existing WS/REST limits, all-or-nothing with rollback.
- No new runtime dependencies (canvas/`CompressionStream`-free, plain browser APIs).
- Persian UI text for every new string; RTL layouts verified at 390 px and 1400 px.
- Do not change the customer browsing experience.

## Acceptance criteria (automated)
1. A Series can be renamed through the UI end-to-end (Playwright) and its poster file follows.
2. A 4 MB PNG poster uploads successfully after client downscale (< 800 KB sent); a 30 MB file is rejected with a Persian message; a non-image renamed `.jpg` is rejected (413/400 paths tested).
3. Delete → files appear under `.trash` with manifest → restore → item is back with its rating/summary; restore into an occupied path → 409, nothing moved.
4. Adding a game creates `Games/PS4/Title.jpg` (+ `PS5` copy if both ticked); deleting moves both to trash.
5. Orders: status change reaches a second manager client; CSV opens with Persian intact (BOM present, checked bytes); undo restores the order and its number.
6. All new endpoints reject non-admin callers (401) and traversal attempts (400).

## Verify
`npm test && npm run test:ui`; manual manager walkthrough on the 20k fixture library: add, edit genres, delete, restore, order → print → CSV.

## Report
PHASE REPORT + screenshots (paths) of the new dialogs at both viewport sizes.
