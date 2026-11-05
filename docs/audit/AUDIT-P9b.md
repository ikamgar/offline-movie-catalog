# AUDIT-P9b — P9b (sibling-parity + abuse probes), 2026-10-21

Method: fresh clone `C:\Users\Ali\AppData\Local\Temp\opencode\p9b\repo` (branch `audit/final`, HEAD `c54d356`), every scenario in its own temp dir under `%TEMP%\opencode\p9b\run\`. Node v24.18.0, sharp installed (147 top-level deps). Probes: `%TEMP%\opencode\p9b\probes\probe-m*.js`, raw outputs: `%TEMP%\opencode\p9b\results\*.txt`. No code changed; no real `Library/`, `data/`, `logs/` touched.

Coverage summary (all matrices complete):

| Matrix | Cells | Probed | Result |
|---|---|---|---|
| M1 upload validation | 175 + 25 follow-ups | all | DONE |
| M2 persistence failure | 30 scenarios | all | DONE |
| M3 REST input matrix | ~90 rows (3 rounds) | all | DONE |
| M4 movies-vs-games parity | ~40 rows | all | DONE |
| M5 WebSocket matrix | ~30 rows | all (hello-timeout 10 s row inferred from code, not wall-clock) | DONE |
| M6 static routes | 33 rows | all | DONE |

Findings continue from F32 (F1–F31 in docs/audit/AUDIT.md). "Owner" = the shop owner running this LAN app offline.

## Findings index (P9b)

- **F32** (LOW) — image sniff accepts polyglot/trailing-garbage payloads (M1).
- **F33** (HIGH from owner POV) — metadata.json write failure masked as success; silent loss across restart (M2).
- **F34** (MEDIUM → ~~VOID~~, P9c re-grade: **NOT A DEFECT**) — original claims (silent reset to default credentials) were a P9b-harness artifact (`H.startServer` auto-created credentials). Split survives: non-atomic recovery write (hygiene) + the HTML-500/in-memory-disk items now tracked as **F40**. See heading below + ADDENDUM.
- **F35** (LOW) — orders:error leaks raw OS error text after Persian message (M2).
- **F36** (MEDIUM) — primitive `id` / `genres` values crash create route → 500 raw JS message (M3).
- **F37** (MEDIUM) — game create with uncleanable title writes file then 500s; ghost appears after rescan (M3).
- **F38** (MEDIUM) — thumbnail route fail-closed: data/thumbs blocked → 500 `{"error":"Poster error"}` for every grid card (M4).
- Re-confirmed known: **F28** (100 KB guard blocks POST /api/games — re-verified M1), **F30** (header-only logout no-op; body-token logout correctly closes WS + REST 401) (M5).
- Notes without IDs (accepted/cosmetic): express.json 413 mislabels 12 MB as 8 MB limit; English `Invalid type` from next-id; HTML (Express default) 404 for API method abuse + empty-uid DELETE; poster routes use bare `{"error":"Poster not found"}` shape (English, no success/code — same family as F38); game title cap 120 vs movie 200; `PUT type:` silently ignored (type immutable); selection/orders keep duplicate uids (no de-dup server-side); `/js/app.js::$DATA` serves as octet-stream; Windows case-insensitivity on statics.

## Findings (P9b)

### F32 — Image sniff accepts polyglots and trailing garbage (M1, LOW)
- Evidence: `POST /api/movies` with `data:image/jpeg;base64,<jpg SOI + "<?php echo \"pwn\"; ?>"><html><script>…"` → 200, writes `Library/Movies/اکشن/0022- Polyphp 2001.jpg`, hexdump `ffd8ffe0 3c3f706870…`. PNG + `<script>alert(1)</script>` → 200 `.png`. JPEG + trailing `binaryGARBAGE` → 200. Leading `<html>` before JPEG SOI → 400 IMG_UNSUPPORTED.
- Impact: from owner POV low — files are written on disk and served back as `image/jpeg` (response verified to carry `X-Content-Type-Options: nosniff`), browsers will fail to execute HTML/script inside an `image/*` response. It is hygiene: validation only checks the magic prefix (server.js `decodePosterPayload`/`detectImageType`); declared MIME is never cross-checked (a "png" payload with JPEG magic is stored as `.jpg` — sniff wins, deterministic).
- Suggested fix (optional): post-decode validation with sharp when available; or trailing-byte tolerance explicitly documented as accepted risk (D-note).
- Verified-correct cousins (no finding): exactly 8,388,608 B decoded → 200; 8,388,609 B → 413 IMG_TOO_LARGE (both create and PUT by-uid); manifest `>`-boundary confirmed. Node base64 leniency accepted (whitespace, URN alphabet, stripped padding all decode 16 B correctly); malformed inner padding rejected 400.

### F33 — metadata.json write failure reported as success (M2, HIGH from owner POV)
- Evidence: `data/metadata.json` replaced by a directory → `PUT /api/movies/by-uid/0001 {imdbRating:"9.3"}` → `200 {"success":true, movie:{imdbRating:"9.3"}}` while server logs `[METADATA] Failed to save: EPERM … rename -> metadata.json`. After restart (same dirs) `GET /api/movies` → `imdbRating=null`. Manager-entered rating/plot silently vanish (I1 says they live only in metadata.json).
- Impact: real silent data loss in exactly the scenario the metadata feature was built for (disk hiccup / AV-lock / crash mid-write leaves a `.tmp` and an unwritable target). Server replies success, UI shows the value, the operator believes it was saved.
- Also: corrupt metadata.json is quarantined properly (`metadata.corrupt-*.json`) and recovers → no issue there.
- Suggested fix: metadata-store should surface save errors (500 METADATA_SAVE_FAILED) like movie-creator does; or retry + warn banner in admin UI (D-note: chooses behavior).

### F34 — auth.json corruption silently resets credentials (M2, MEDIUM) — **UPDATE (P9c): REFUTED / re-graded NOT A DEFECT**
- ~~Evidence: corrupt `auth.json` at boot → file silently replaced with default `{username:"admin", hash:"f2a5ad…"}` (no quarantine file, unlike catalog/orders), `POST /api/auth/login admin/admin12345` → 200.~~ **P9c re-run (probe-f34b, clean startRaw harness):** there are NO default credentials in the code (grep: `admin12345` appears nowhere in `server/auth/auth.js`; `_credentials = null` → `setupRequired:true`). Corrupt auth.json → login **400** Persian message («…مدیر هنوز تنظیم نشده…»), loopback setup → 200 and recovers, LAN setup stays 403 (deliberate). The file is overwritten non-atomically by the recovery write (no quarantine) — hygiene-only note.
- The two sub-points below **stand** (re-verified at HEAD by probe-c1): they are now tracked as **F40** (EISDIR HTML 500 + in-memory/disk split) rather than F34.
- Also: `POST /api/auth/change-password` with `auth.json` replaced by a directory → Express default HTML 500 (`<!DOCTYPE html>…`), not the app's JSON error shape; in-memory password still switched (login with NEW password 200, old 401 — divergence between memory and disk until restart).
- Also: `POST /api/auth/setup` with auth.json a directory → EISDIR uncaught in route (auth.js:145 `writeFileSync`, non-atomic — everything else uses `writeJsonAtomic`) → 500 HTML.
- Impact: a corrupt auth.json silently degrades auth to the default password — plausible after disk issue; operator is not told. HTML 500 breaks the admin panel's JSON expectations.
- Suggested fix: quarantine + loud admin-visible warning instead of silent reset; atomic write + JSON error for change-password/setup.

### F35 — orders error leaks raw OS error text (M2, LOW)
- Evidence: `data/orders.json` replaced by a directory → manager WS `orders:save {movies:[<objects>]}` → `orders:error {"message":"ذخیره سفارش‌ها در دیسک انجام نشد — EPERM: operation not permitted"}`. The Persian prefix is fine; appending the raw `EPERM: …` string to a customer-facing UI is noise/info-leak-ish but harmless on a trusted LAN.
- Suggested fix: log the OS detail, send only the Persian part.

### Verified-correct (no finding) — M2
- Trash: fail-closed as designed — manifest.json replaced by dir → `DELETE /api/movies/by-uid/:uid` → 500 TRASH_MANIFEST_ERROR, disk rollback puts the file back (0010 re-appeared in Library); `GET /api/trash` → 500 while unreadable; restore-by-entry-id happy path 200 + file back in Library. Restore route param is the manifest numeric id, NOT uid (protocol-documented, kept).
- catalog.json corrupt → quarantined + empty cache + full rescan works; catalog.json a dir → write failures logged, API keeps serving from live index, add/rescan still 200 (graceful).
- orders.json corrupt → quarantined, starts empty (logged).
- thumbs: `?w=300|600` thumbnails DO generate with sharp (verified: 15 KB JPEG → 250 B webp, file written under `data/thumbs`, cache `public, max-age=31536000, immutable`); non-canonical `?w=900` → 400 JSON. FAIL-closed under a blocked `data/thumbs` dir → see **F38** (supersedes an earlier note in this draft that claimed graceful fallback — that probe was mis-parameterized).
- movie-creator pre-create backup copy failing (backups/ blocked) is logged, movie still created — acceptable per design (backup is best-effort).

## M1 — upload validation matrix (DONE, probe-m1.js/m1b/m1c)

Cells: {POST /api/movies, POST /api/games, PUT /api/movies/by-uid/<movie>, PUT /api/movies/by-uid/<game>, PUT /api/movies/0001 (legacy), POST /api/movies/preview} × {realJPEG, realPNG, realWEBP, realAVIF, mp4(mp42/isom/M4A), zip, pdf, svg, gif, exe, utf16, php-behind-jpeg, png+html, gif+jpeg polyglot, declared png bytes jpeg, bare base64, text, 8 MB, 8 MB+1, whitespace-b64, bad-padding, base64url, multi-comma, no-comma} = 138 payload rows + 37 edge rows (poster type/value errors, guard variants, preview extensions, boundary re-verify, hexdumps). All 175 rows captured in `m1.json` / `m1-out.txt`.

Result table (both create routes and all PUT routes behave identically unless noted):

| Class | Prediction | Observed | Verdict |
|---|---|---|---|
| real JPEG/PNG/WEBP/AVIF | 200 + file with sniffed ext | 200 everywhere (incl. game platforms PS4+PS5 double-copy on edit) | ✓ |
| MP4 (ftyp variants) / ZIP / PDF / SVG / GIF / EXE / UTF16 | 400 IMG_UNSUPPORTED | 400 on all routes | ✓ |
| PHP-behind-JPEG, PNG+HTML, trailing garbage | 400 | **200 (→ F32)** | ✗ |
| GIF+JPEG polyglot | 400 | 400 (GIF magic wins) | ✓ |
| Declaredmime ≠ sniffed bytes | sniff decides | `.jpg` written for "png" declared-jpeg-magic payload | sniff wins, documented |
| bare base64 (no data: URL) | ? | accepted (equivalent to declared `image/jpeg`) | lenient |
| exactly 8 MiB decoded | 200 (D-observed boundary) | 200 create/PUT | ✓ |
| 8 MiB + 1 B | 413 | 413 IMG_TOO_LARGE (create + by-uid PUT; m1 fixture was faulty, m1b confirms) | ✓ |
| whitespace/base64url/padding-stripped b64 | lenient decode | 200, identical bytes on disk | ✓ |
| malformed inner padding | 400 | 400 IMG_UNSUPPORTED | ✓ |
| poster: empty/''/null/missing | 400 | 400 IMG_REQUIRED (create); PUT treats null/missing as "keep existing" 200 | ✓ |
| poster: number/bool/object | 400 | 400 IMG_INVALID | ✓ |
| `data:` alone / empty b64 / no comma | 400 | 400 IMG_UNSUPPORTED | ✓ |
| guard: `POST /api/movies/` (trailing slash, 300 KB) | — | 413 English "Request body too large" (express.json default 413 handler shape, no app error code) — see M3 follow-up | ✓ w/ note |
| 300 KB control `POST /api/movies` | 200 | 200 | ✓ |
| 300 KB `POST /api/games` (F28 re-verify) | 413 | 413 — **F28 confirmed still present** | ✗ (known) |
| 300 KB `POST /api/movies/preview` | 413 | 413 (guard does not exempt preview) | consistent |
| 12 MB+ JSON body (`POST /api/movies`) | 413 | 413 `IMG_TOO_LARGE` — wrongly attributes the express.json 12mb limit to the 8 MB poster message ("تصویر پوستر خیلی بزرگ است (حداکثر ۸ مگابایت)") — cosmetic | note |
| client `extension` value | ignored | filenames always use sniffed ext (create with `extension:"exe"` + JPEG bytes → `.jpg`); preview echoes client ext verbatim (`8888- PrevX 2001.exe`, `2001."`, `2001.a*b`) — display-only | ✓ |
| game edit parity (PUT by-uid game) | — | platforms PS4+PS5 updated in one copy each; renames keep both copies in sync | ✓ |

## M2 — persistence-failure matrix (DONE, probe-m2.js/m2b/m2c/m2d/m2e)

Cells (30 scenarios, all run): metadata.json as dir / corrupt · auth.json as dir at setup-change-boot, in-flight, corrupt · orders.json as dir / corrupt · trash manifest healthy vs dir at delete-delete-restore-restore · catalog.json as dir (GET/add/rescan) · thumbs dir blocked · backups dir blocked · metadata across restart · orders:save objects healthy vs poisoned · selection:save memory-only control.

Key results: F33 (metadata), F34 (auth ×2), F35 (orders message), trash fail-closed with rollback ✓, restore-by-entry-id contract ✓, thumbs original-fallback ✓, corrupt-vs-dir quarantine behaviors ✓ (table above).

## M3 — REST input & transport matrix (DONE, probe-m3.js/m3b/m3c/m3d)

Cells: create-flow body shapes ×28 (m3) → id/title/genre vectors with full valid body ×38 (m3c/m3d) → transport/method abuse ×16 (m3b) → full 500 bodies (m3d).

### F36 — primitive-typed `id` / `genres` crash route with raw JS error (M3, MEDIUM from owner POV)
- Evidence: `POST /api/movies {type:'Movie', id:9002 (number), ...}` → **500** `{"success":false,"error":"movieData.id.trim is not a function"}`. `POST /api/movies {..., genres:7 (number)}` → **500** `{"success":false,"error":"genres is not iterable"}`. Both raw JS messages leak to client; trace logged `[API] POST /api/movies error: …`.
- Impact: admin UI should never send these, but a stale/misbehaving client does → 500 with internal message instead of a clean Persian 400.
- Suggested fix: validator does `typeof === 'string'` before `.trim`, and `Array.isArray(genres)` before iteration; merge into existing Persian VALIDATION responses.

### F37 — game create with uncleanable title writes the file, then 500s (M3, MEDIUM)
- Evidence: `POST /api/games {title:'..\\..\\evil'}` → **500** `{error:'افزودن بازی ناموفق بود: بازی در فهرست یافت نشد', code:'CREATE_FAILED'}` **and** `Games/PS4/..-..-evil.jpg` exists on disk. Second identical call → 409 FILE_EXISTS (file still there). On next Library scan the file gets indexed as a phantom game titled `..-..-evil`, so disk and UI disagree until then.
- Impact: manager sees error, copy exists → "ghost" appears after rescan. Contrast: movie branch pre-validates and never writes (id/title rows with bad input → clean 400, zero files).
- Suggested fix: game-creator should run the same filename dry-run/reject step before writing (mirror movie-creator), or index-first-then-fail to keep disk congruent with the thrown result.

### Noted (no finding, accepted/cosmetic or spec-compliant)
- `id:'7'` (1–6 digit unpadded) accepted per I2 regex; creates `7- OneD 2001.jpg`. `id:'0000'` accepted. `id:''` → auto-assign next id (0021) — reasonable; `id:'  9010  '` → trimmed to 9010, wrote 9010.
- Title sanitization is disk-safe despite the ugly names: `../../evil`→`..-..-evil`, wildcards→`a-b------`, NUL stripped→`AB`, leading dot kept (`.hidden`), RTL chars preserved; all files verified INSIDE their genre dirs (no traversal). Movie `TITLE_INVALID` correctly rejects `CON` and >200 chars; game cap is 120 (`121`→400) vs movie 200 — asymmetric, minor parity note.
- `Series` ignores a provided `id` (I5) — `Series/SeriesWithId.jpg` written; duplicate series title → 409 FILE_EXISTS.
- Persian strings on validation (`عنوان باید ۱ تا ۲۰۰ کاراکتر باشد`, `سال انتشار…`, `نام ژانر…`); `genres:7` aside, ID_INVALID/TYPE_INVALID etc. are clean Persian 400s (also `EXT mismatch` rows).
- Cosmetic responses: express.json overflow on ANY route → Persian 413 `IMG_TOO_LARGE` … but the message names the 8 MB poster limit although the tripwire is the 12 MB json limit (M1 note).
- `POST /api/movies` valid JSON with `Content-Type: text/plain` → 400 IMG_REQUIRED (json body parser ignored it; harmless).
- Malformed JSON → 400 `بدنه درخواست نامعتبر است` (own JSON error, no HTML) ✓.
- **HTML (not JSON) returned for API method-/path abuse**: PUT on `/api/movies`, DELETE on `/api/movies`, GET `/api/movies/:id`, PATCH by-uid, DELETE `/api/movies/by-uid/` (empty) → Express default `<!DOCTYPE html>` 404 page, no Persian JSON shape — inconsistent error presentation, low impact on a LAN kiosk (finding-worthy as presentation-only).
- `GET /api/movies/next-id?type=` (missing/empty) → 400 `{"error":"Invalid type"}` — the ONLY English user-visible error string found in the REST surface.
- `GET /api/config` (public) exposes only UI labels/config — no `libraryPath`/`port`/paths (checked full body) ✓; CSP + `nosniff` on responses ✓; OPTIONS → 200/no CORS headers (same-origin only) ✓.
- `POST /api/auth/logout` twice/garbage → 401 JSON; setup when already configured → 403 `مدیر قبلاً تنظیم شده است` ✓.
- GET /api/movies survives garbage query params (`?q=()[]`, `?genre=../../`) → 200 filtered (no crash, no regex behavior) ✓.

### F38 — thumbnail route 500s with an English generic error; grid posters break (M4, MEDIUM)
- Evidence: with sharp installed and `data/thumbs` occupied by a file, `GET /api/poster/Movie%3A9999?v=…&w=300` → **500** with body exactly `{"error":"Poster error"}` (24 B, no `success`, no `code`, English). Server log: `[API] GET /api/poster error: EEXIST … mkdir …\data\thumbs`.
- Impact: `movie-card.js` requests `&w=300` for every grid card, so the customer/manager walls go broken-image when `data/thumbs` can't be created/locked (AV scan, backup tool, full disk), while the plain poster URL still works. Owner experiences a broken catalog with an undiagnosable message.
- Suggested fix: on thumb-write failure, log + serve the ORIGINAL file with 200 (degrade gracefully); or at least Persian JSON in the standard error shape.

## M4 — movies↔games sibling-parity matrix (DONE, probe-m4.js/m4b/m4c/m4d/m4e)

Cells: delete/restore (game, series) × platform merge/subset/empty × cross-field editors (imdbRating/genres on game, platforms on movie, type change) × cross-route restrictions (type=Game on /api/movies, game title colliding with movie title) × rescan endpoint parity × poster routes (movie/series/game, cross-type keys, w params) × auto-id assignment.

Results:
- Game delete → trash entry `type=Game` → restore re-supplies BOTH platform files + re-index ✓ (price parity with movie + series ✓).
- Platform merge per I8: `platforms:[PS4]` removes the PS5 copy; re-adding recreates it byte-identical ✓; `platforms:[]` → 400 PLATFORM_INVALID (never deletes everything) ✓.
- Editor cross-field symmetry: game object ignores movie fields (imdbRating/genres dropped, HTTP 200), movie edit ignores `platforms` ✓; `PUT …type:'Animation'` on a Movie silently keeps `Movie` (type immutable — recommended to make it 400, note only).
- Route separation: `POST /api/movies type=Game` → 400 TYPE_INVALID ✓; game named like a movie is allowed (separate `game:` uid domain) ✓.
- Rescan parity: `POST /api/games/rescan` returns only game stats; `POST /api/rescan` returns movies + games counts; both 200 ✓.
- Poster route keys: movie `/api/poster/Movie:0001`, series `/api/poster/<encoded title>` (works — my initial guess `Series:…` 404'd was an invalid key), game `/api/game-poster/<title>`; cross-type keys 404 ✓.
- Thumbnail pipeline with sharp: verified above (M4c/M4d).

## M5 — WebSocket matrix (DONE, probe-m5.js/m5b/m5c)

Cells: raw frames pre-auth (garbage, `ping` before hello, hello w/ invalid role `admin`, manager hello without/garbage token) × authenticated behaviors (ping/pong, garbage frames, unknown types, role isolation both ways, duplicate-uid selection, >256 KB frame, 40-msg/s burst) × orders operations (save/lifecycle, 300-char edit truncation, bad status, ghost ids, undo live order) × logout invalidation (header-only no-op → F30 re-verified; body-token logout → hello:error 4004 + REST 401).

Results:
- Handshake: `hello:ack {role, username, protocol:3, bootId}` on valid hello; `hello:error` + close 4003 (invalid role — the REST/client `admin` role name is NOT a valid WS role, quirk kept), 4004 (missing/garbage token). Pre-auth non-hello → `error` 'Handshake required'; pre-auth invalid JSON → silenced + warned. 10-s handshake timeout present (code-verified).
- Frame limits: >256 KB single frame → close 1009, shared state unaffected; >30 msg/s → close 4008 ✓; app-level ping→pong ✓.
- Role isolation: manager `selection:update` and customer `orders:save` are silently ignored (no error frame) — silent-fail is off-spec vs Persian feedback, but client-side role state makes this unreachable in the UI; note only.
- Orders lifecycle: `orders:saved` → `orders:update`; 300-char customerName truncated to 200 (MAX_INFO_LEN); bad `status` / ghost ids / undo on live order → Persian `orders:error`; no crash ✓.
- Selection re-hydration: movies objects only (uid strings dropped wholesale), unknown uids dropped, 500-item cap, duplicate uids NOT de-duplicated (order saved 3 movies from `[heat,heat,cars]` → 3 entries) — LOW note (server relies on client to dedupe).
- Logout: header-only POST → 200 without invalidation (F30 confirmed at ws level too); body-token POST → `closeManagersByToken` closes socket + subsequent hello 4004 + REST 401 ✓ (S10 works as designed when the documented payload is used).

## M6 — static & poster-route matrix (DONE, probe-m6.js)

33 rows: allow-list base (/, js, css, assets/fonts), deny-list (server.js, backend/*, data/*, Library/*, logs/*, package.json, .env, .gitignore, docs/audit/AUDIT.md, docs/*), traversal (../, %2e%2e, %5c, double-encoded, NUL, trailing dot, ADS `::$DATA`), case variants, poster-route keys.

Results:
- Every deny-list and traversal probe → 404 (HTML shell), no leaks. Poster/game-poster route traversal keys → 404 JSON. `/js/../js/app.js` normalizes into an allowed file (benign). `/css/MAIN.css`, `/JS/app.js` served — Windows case-insensitivity, consistent with the platform (I3 note: on Linux these would 404 — deploy parity note only).
- `/js/app.js::$DATA` → 200 `application/octet-stream` same bytes (ADS accepted by Node stream; allowed file; benign, note only).
- Poster 404 shape is bare `{"error":"Poster not found"}`/`{"error":"Game poster not found"}` (English, no `success`/`code`) — fold into F38 family note above.

---

## P9b summary (≤40 lines, for phase report paste)

- 7 new findings (F32 LOW, F33 HIGH, F34/F36/F37/F38 MEDIUM, F35 LOW), 2 known findings re-verified with fresh evidence (F28, F30), ~50 acceptance-style behaviors verified-correct across six matrices, 0 crashes of the server process itself.
- Priorities for the owner: **F33** (silent metadata loss) and **F38** (grid breaks when thumbs dir is locked) are the two that bite during normal operation; F34/F36/F37 matter when admin flows hit a failure; F32/F35 are hygiene.
- Raw outputs: all probes end-to-end in `results/` (`m1*, m2*, m3*, m4*, m5*, m6*` suffixes by matrix).

---

## ADDENDUM (P9c auditor session, 2026-10-22) — re-verification at HEAD 065dc22

### a) Harness confound correction

P9b's `H.startServer` helper auto-called `setupAdmin('admin','admin12345')` over loopback after boot. Any probe touching a first-run / corrupt-auth scenario therefore ran against a state where credentials already existed. P9c re-ran the whole corrupt-auth family with a `startRaw` helper (manual `createServer()` + explicit `POST /api/auth/setup` only). Consequences in c)/d) below. Evidence: `%TEMP%\opencode\p9c\results\f34b-out.txt`, `c1-out.txt`. P8c conclusions are unaffected (those tests set up credentials explicitly, as intended) — but P9b's **F34 evidence is VOID**: it described a state the harness itself created, not the shipped behavior.

### b) Exact M1–M6 upload totals (from archived `m1.json`)

| Route | Probes | Accepted | Accepted classes beyond the 4 real formats |
|---|---|---|---|
| POST /api/movies (M1) | 35 | 14 | php_behind_jpeg, png_plus_html, declared_png_bytes_jpeg, declared_bare_no_mime, exactly_8MB_jpeg, exactly_8MB_plus1_jpeg, bad_padding, whitespace, base64url, multi_comma |
| POST /api/games (M2) | 26 | 12 | php_behind_jpeg, png_plus_html, declared_png_bytes_jpeg, declared_bare_no_mime, bad_padding, whitespace, base64url, multi_comma |
| PUT /api/movies/0001 legacy (M3) | 26 | 14 | as M2 + exactly_8MB_jpeg, exactly_8MB_plus1_jpeg |
| PUT /api/movies/by-uid/0001 (M4) | 29 | 16 | as M3 + `PUT poster null/missing` (200 = keep old poster — correct behaviour) |
| PUT /api/movies/by-uid/game:* (M5) | 26 | 14 | same as M3 (game updates flow through the movie route) |
| POST /api/movies/preview (M6) | 26 | 24 | mp4_mp42, mp4_isom, mp4_M4A, zip, pdf, svg, gif, exe, utf16, php_behind_jpeg, png_plus_html, gif_jpeg_polyglot, declared_png_bytes_jpeg, declared_bare_no_mime, declared_text, bad_padding, whitespace, base64url, multi_comma, big_no_comma — everything except malformed data-URLs; **no image validation at all** |

Size guard verified: 300 KB / 12 MB POST bodies and 8 MB+1 PUT body all rejected; exactly-8 MB accepted. `gif_jpeg_polyglot` is the only polyglot the upload routes reject; php/html payloads slide through (F32). The M6 gap is recorded as a new note in docs/audit/AUDIT-P9c.md; since `/preview` writes no files, severity LOW.

### c) Clean-state re-runs of P9b findings (probes f34b/c1/w — `%TEMP%\opencode\p9c\results\`)

- **F32 STILL REPRODUCES** (w-out.txt): php-behind-jpeg 200 (file starts `ffd8ffe0`, `<?php` inside), jpeg + trailing garbage 200, png + `<script>` 200; gif+jpeg polyglot correctly 400. Unchanged.
- **F34 default-credentials half REFUTED**: no credentials exist in `server/auth/auth.js` (grep: no `admin12345`; `validateCredentials` auth.js:161 `if (!_credentials) return false`). With corrupt/malformed `data/auth.json` → `setupRequired:true`; login → **400** Persian «مدیر هنوز تنظیم نشده است…» (not 401/200); loopback setup → 200 and recovers; LAN setup stays 403 (deliberate). The corrupt file is overwritten non-atomically by the recovery write (not quarantined) — hygiene only. F34 re-graded **NOT A DEFECT**; see findings-index correction below.
- **F33 mechanism rebuilt** (from `backend/storage/metadata-store.js` + probes f33b/f33c): `save()` catch is console-only («[METADATA] Failed to save: EPERM … rename …»), `_dirty` stays true, **no** `recordWarning()` → `/api/diagnostics` silent (totalIssues 0, conflicting/orphan arrays empty even with a poisoned store at HEAD). Writes are debounced 500 ms; a later successful save flushes blocked-era edits (self-heals a transient outage), but a blocker during the last window is lost silently — the PUT already returned 200. F33 stands **HIGH**, mechanism now precise.
- **F36 STILL REPRODUCES** (w-out.txt): `POST /api/movies` with `id: 9002` → 500 `movieData.id.trim is not a function`; with `genres: 7` → 500 `genres is not iterable`; both leak English internals; both need a poster in the body to reach the crash point. Unchanged MEDIUM.
- **F37 STILL REPRODUCES** (w-f37-out.txt): `POST /api/games` title `..-..-evil` → 500 `CREATE_FAILED … بازی در فهرست یافت نشد` AND ghost file `..-..-evil.jpg` written into `Library/Games/PS4` (unclaimed; invisible to scans; causes later rescan failure; retry → 409 FILE_EXISTS). Unchanged MEDIUM.
- **F35 STILL REPRODUCES** (w-out.txt): `orders:error` carries raw OS error text (absolute paths + tmp filenames) after the Persian prefix. Unchanged LOW.
- **F38 narrowed** (probe-f38): the 500 breakage fires only when `ensureDir` itself throws (`data/thumbs` = file → EEXIST/EISDIR at thumbs.js:156, outside the try/catch) — sharp generation failures correctly fail open to the original poster (200). F38 stays MEDIUM with a much smaller attack surface (creation-blocked, not generation-common).

### d) New findings found while re-verifying (full detail in docs/audit/AUDIT-P9c.md)

- **F39 MEDIUM (permanent admin lockout on valid-JSON/garbage-crypto auth.json):** `{username:'admin', hash:'ffff00ff', salt:'zzz'}` is accepted by `loadCredentials` (auth.js:65-98) → `setupRequired:false` → login 401 forever (rate-limited) and setup 403 even on loopback → no quarantine/heal. Owner recovery today: set `ADMIN_USERNAME` + `ADMIN_PASSWORD` env (README-documented, but the corrupt file stays behind the override) or delete `data/auth.json` while stopped (undocumented) → first-run setup returns.
- **F40 MEDIUM (EISDIR → English HTML stack trace + in-memory/disk split):** `data/auth.json` as a directory → `setupAdmin` (auth.js:145) and `changePassword` (auth.js:254) throw uncaught → Express 500 HTML page with full English stack + absolute paths. On change-password the in-memory credentials are updated first, so login works with the new password until restart reverts it. Same family as F35, but rendered to the admin as HTML.
- **F41 HIGH (metadata destroyed in served rows by every restart/rescan):** scan-rebuild attaches manager metadata with the map key (`Movie:<id>`) instead of the bare uid; every restart/rescan drops `imdbRating`+`plotSummary` from `/api/movies` rows; disk `metadata.json` stays correct. Full definition + bisect root cause in docs/audit/AUDIT-P9c.md. (P9b M2's restart cell had actually measured the store, not the attach.)
- **POST /api/movies/preview accepts every brand:** no image checking at all (mp4/zip/pdf/exe → 200; covered in b).

### e) Addendum task answers

1. **F41 disk-vs-catalog behaviour (probe-f41):** `metadata.json` on disk never loses data in any scenario. Startup reconcile → row null; `POST /api/rescan` → row null; watcher mtime-touch → stays null (existing-key path does not re-attach); watcher delete+re-add → value RESTORED (only accidental recovery); title-only edit does NOT erase metadata (metaPatch only includes `has()`-true fields; editor writes store keys under bare `nextUid`, movie-editor.js:581-594); later rating edit overwrites the same bare key (writers never create typed duplicates).
2. **Bisect (task 2):** first bad commit = `724b8178` `fix(indexer): type:id map keys, global id-generator, no double-decode [DATA-05 DATA-06]`. Parent's `getKey` returned bare `movie.id`; the commit changed `getKey` to `type:id` and left the scan-attach passing `key` — a missed follow-through, not a rescan-side mistake. DATA-10's tests still pass because `defects.test.js:809-850` covers ONLY the store component (migration import, survives-catalog-delete, rename-follow) and never wires a store into `replaceFromScan(Async)`; `indexer.test.js:68` covers the store-less in-memory fallback. DATA-10 re-graded **REOPENED** in `mimo/DEFECT-REGISTER.md` (P9c evidence).
3. **Key-format audit (task 3):** all cross-layer lookups EXCEPT the scan-attach are consistent: metadataStore keys = bare uid (every set/get/rename call site uses movie.uid / `nextUid`); indexer reads use typed `getMovieById` (exact + Movie/Iranian/Animation fallbacks, indexer.js:599-609) and `getByUid` (type-prefixed grammar, :616-628); gamesMap keys = bare normalized titles (`_gameKey` :887-891) and `getByUid` slices the `game:` prefix before lookup — consistent; WS selection re-hydration and trash restore both go through `getByUid(uid)` — consistent; orders + trash manifests key by their own ids and store uids as DATA (no lookups); payload-cache keys are bucket names (`movies`/`games`), no item keys; diagnostics `orphans()` compares store bare uids with row uids from `getMovies()` — consistent (and silent — see F33). The ONLY mixed-format lookup is indexer.js:770 = F41.
4. **F32–F38 re-runs (task 4):** F32 F33 F35 F36 F37 F38 all still reproduce (with the sharpening in c)); F34 reduced as described.
5. **Lockout-recovery documentation (task 5):** none dedicated. README.md:97 first-run setup (loopback only), README.md:102-103 `ADMIN_USERNAME`/`ADMIN_PASSWORD` headless override, README.md:117-119 env table. Grep for locked/قفل across README/docs/mimo → only the pre-existing SEC-05 wording. Nothing tells the operator what to do when both login and setup fail.
6. **Game-update route (task 6, probe-w `m1g`):** `PUT /api/movies/by-uid/game:<title>` DOES update games correctly (200; rename + metadata flow through the same editor) and its body IS poster-validated (mp42 → 400 IMG_UNSUPPORTED; valid jpeg → 200). The P9b M4 wording "no game-update REST route exists" is wrong as a user-visible statement — the movie by-uid route IS the game-update route; only the literal absence of a `PUT /api/games` path is true. This addendum supersedes that M4 note.
7. **Attach-key + getKey mutation canaries (task 7):** added to the P9c mutation plan — (a) indexer.js:770 `key`→`movie.uid`, (b) indexer.js:349 `movie.uid`→`key`, (c) `getKey` Movie branch `type:id`→`id`. Expected: (a)_textual fix SURVIVED-at-HEAD proof of the gap, (b) SURVIVED (moves the regression earlier), (c) KILLED by DATA-05 bare-id collision coverage. Results table in docs/audit/AUDIT-P9c.md.

### f) References

P9c probes + raw outputs live in `%TEMP%\opencode\p9c\{probes,results}`; the P9b originals cited here are copied to `mimo/audit-evidence/p9b/` (22 files incl. `m1.json`). docs/audit/AUDIT-P9c.md is the deliverable for F39/F40/F41 + mutation sampling; its evidence lives under `mimo/audit-evidence/p9c/`.

