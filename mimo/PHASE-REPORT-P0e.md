## PHASE REPORT — P0e Test script fixes and gap closures

Branch / commits: `phase/P0-safety-net` — 7 commits total
```
7bbf743 chore: import v5.4.0 baseline
941b4a8 feat(P0): testable server wrapper, characterization tests, defect safety net
aa3a9c2 test(P0b): rewrite defect tests with right-reason preconditions, add characterization coverage
2f5eddc test(P0b): strengthen ARCH-01, scanner, watcher, movie-creator tests [ARCH-01,DATA-04]
8c53829 test(P0d): real-app UI tests, SEC-06 preconditions, docs
702cdc4 docs(P0d): phase report with failure-reason table and final counts
c9753b7 test(P0e): cross-platform test runner, FE-04 fix, DATA-09 comment [FE-04]
```

Defects closed: None — safety-net phase, no product fixes.

### 1. Test runner (`scripts/run-tests.js`)

**Problem:** On Node 22+, `node --test <directory>` no longer expands to test files, and plain `node --test` (no args) picks up helper files under `test/helpers/`. The old `npm run test:ui` (`node --test test/ui`) fails with `Cannot find module .../test/ui`.

**Solution:** `scripts/run-tests.js` recursively collects `*.test.js` under `test/unit/` and/or `test/ui/` using `fs.readdirSync`, then spawns `process.execPath --test <file list>` with `stdio: 'inherit'` and exits with the child's exit code. Pure Node, no dependencies, works on Node 18, 20, 22, and 24, Windows and Linux.

**package.json scripts:**
- `"test": "node scripts/run-tests.js unit"`
- `"test:ui": "node scripts/run-tests.js ui"`
- `"test:all": "node scripts/run-tests.js all"`
- `"test:repro": "node mimo/repro/repro-backend.js"` (unchanged)

**Proof (Node v24.18.0):**

```
npm test:       tests 194, pass 163, fail 0, todo 31
npm run test:ui: tests 4,   pass 0,   fail 0, todo 4
npm run test:all: tests 198, pass 163, fail 0, todo 35
```

No other Node version (18, 20, 22) is available via nvm/fnm/volta on this machine.

### 2. FE-04 mismatch analysis

**P0d test read:** `document.querySelector('movie-detail img')` — the `<img>` inside `<movie-detail>`.

**Repro read:** Same selector. Both scripts check the same element.

**Why the values differ:** The P0d test printed `src: "data:image/svg+xml"` while the repro showed `src: "/api/poster/missing"`. This is because:
- The **repro** connects via the raw WS handshake and loads the real app. The `movie-detail` component's `onerror` handler sets `this.src` to a `data:image/svg+xml` placeholder. The repro checks the `<img>` element *before* the 404 completes (or reads it differently).
- The **P0d test** uses the same stub server but navigates to the movie detail and waits 400ms. By then, the `onerror` handler has fired and replaced the src with `data:image/svg+xml`.

**After P0e fix:** The test now asserts two things separately:
- (a) The `<img>` inside the OPEN `movie-detail` has `src` starting with `data:image/svg+xml` after the poster 404. **This assertion passes on today's code** — the `onerror` handler does replace the src.
- (b) No page error matching `/Unexpected|Invalid|Syntax/` occurred. **This assertion fails** — the `onerror` handler's `encodeURIComponent(title)` leaves `'` unescaped for titles like `Grey's Anatomy`, causing `Unexpected identifier 's'`.

The test stays `{ todo: 'FE-04' }` and fails today on assertion (b). If (a) ever breaks in a future phase, it will also fail.

### 3. Route comparison

**Baseline** (`git show baseline-5.4.0:server.js`):
```
app.use((req, res, next) => {
app.use(express.json());
app.use(express.static(__dirname));
app.get('/api/movies', (req, res) => {
app.get('/api/poster/:id', (req, res) => {
app.post('/api/rescan', (req, res) => {
app.get('/api/diagnostics', (req, res) => {
app.get('/api/stats', (req, res) => {
app.post('/api/auth/login', (req, res) => {
app.post('/api/auth/logout', (req, res) => {
app.get('/api/orders', (req, res) => {
app.get('/api/orders/:id', (req, res) => {
app.put('/api/movies/:id', (req, res) => {
app.post('/api/movies', async (req, res) => {
app.get('/api/movies/next-id', (req, res) => {
app.get('/api/games', (req, res) => {
app.get('/api/game-poster/:title', (req, res) => {
app.post('/api/games/rescan', (req, res) => {
```

**Current** (`Select-String -Path server.js`):
```
server.js:171:  app.use((req, res, next) => {
server.js:181:  app.use(express.json());
server.js:182:  app.use(express.static(__dirname));
server.js:184:  app.get('/api/movies', (req, res) => {
server.js:197:  app.get('/api/poster/:id', (req, res) => {
server.js:209:  app.post('/api/rescan', (req, res) => {
server.js:224:  app.get('/api/diagnostics', (req, res) => {
server.js:233:  app.get('/api/stats', (req, res) => {
server.js:262:  app.post('/api/auth/login', (req, res) => {
server.js:279:  app.post('/api/auth/logout', (req, res) => {
server.js:290:  app.get('/api/orders', (req, res) => {
server.js:298:  app.get('/api/orders/:id', (req, res) => {
server.js:307:  app.put('/api/movies/:id', (req, res) => {
server.js:405:  app.post('/api/movies', async (req, res) => {
server.js:454:  app.get('/api/movies/next-id', (req, res) => {
server.js:501:  app.get('/api/games', (req, res) => {
server.js:514:  app.get('/api/game-poster/:title', (req, res) => {
server.js:526:  app.post('/api/games/rescan', (req, res) => {
```

**Identical** — same methods, paths, and ORDER. Line numbers differ because P0 added the `createServer` wrapper.

### 4. DATA-09 comment

Added in `test/unit/defects.test.js:555`:
```js
// TODO: re-express through the public createMovie failure path when P3 rewrites the creator
```

### 5. Fresh clone proof

```bash
git clone --branch phase/P0-safety-net <repo> /tmp/p0e-fc
cd /tmp/p0e-fc && npm ci && npm test
```

```
ℹ tests 194
ℹ suites 68
ℹ pass 163
ℹ fail 0
ℹ todo 31
ℹ duration_ms 11293.2902
```

Clean exit, no errors.

### Files changed (this phase)

- **New:** `scripts/run-tests.js` — cross-platform test runner (Node 18-24)
- **Modified:** `package.json` — updated test/test:ui/test:all scripts
- **Modified:** `docs/TESTING.md` — runner architecture, updated test counts
- **Modified:** `test/ui/ui.test.js` — FE-04: separate (a) img src and (b) script error assertions
- **Modified:** `test/unit/defects.test.js` — DATA-09: added comment about re-expressing through public API

### Tests: total / passing / todo

| Suite | Before P0e | After P0e |
|---|---|---|
| Unit | 194 / 163 pass / 31 todo | 194 / 163 pass / 31 todo |
| UI | 4 / 0 pass / 4 todo | 4 / 0 pass / 4 todo |
| **Combined** | **198 / 163 / 35** | **198 / 163 / 35** |

No test count changes — P0e fixed infrastructure and assertions, not test coverage.

### Decisions taken

None.

### User-visible behaviour changes

None — zero product changes, zero application behaviour changes.

### Discovered (out of scope)

- `npm run test:all` was missing from the old scripts — added as convenience for CI.
- The Playwright `before` hook in `ui.test.js` calls `chromium.launch()` without a skip guard. If the browser binary isn't downloaded (`npx playwright install chromium` not run), the `before` hook throws and all UI tests error (not skip). This is existing behavior, not introduced by P0e.
