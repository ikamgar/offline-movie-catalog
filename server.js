/**
 * MovieCatalog Server — version: package.json "version" field
 *
 * Professional Digital Movie Library Manager with:
 * - Recursive directory scanning
 * - Smart media type detection (Movie, Series, Animation, Iranian, Game)
 * - Robust filename parser (supports 10+ naming conventions)
 * - In-memory index with JSON disk cache
 * - Real-time filesystem watcher (auto-updates on file changes)
 * - Diagnostics endpoint for admin troubleshooting
 * - Image cache (single poster per movie ID)
 * - WebSocket-based real-time selection sync (customer → managers)
 * - Order management with persistent storage
 *
 * Architecture:
 *   Scanner → Parser → Indexer → Watcher → API
 *                        ↕
 *                   catalog.json (disk cache)
 *
 *   Customer UI → Selection Store → WebSocket → Server → Managers
 *
 * Usage:
 *   npm start
 *   PORT=8080 LIBRARY_PATH=C:/Movies node server.js
 */

const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

// B10 async scans only: startup scan runs in the background (G6) and the
// rescan routes use the async walkers — the sync scanLibrary/scanGames are
// scanner-module internals now.
const { scanLibraryAsync, scanGamesAsync } = require('./backend/scanner');
const CatalogIndexer = require('./backend/indexer');
const LibraryWatcher = require('./backend/watcher');
const PayloadCache = require('./backend/payload-cache');
const StartupProbe = require('./backend/startup-probe');
const Diagnostics = require('./backend/diagnostics');
const { createThumbService, isThumbWidth, WIDTHS: THUMB_WIDTHS } = require('./backend/thumbs');
const WebSocketServer = require('./server/realtime/ws-server');
const OrderManager = require('./server/orders/order-manager');
const logger = require('./server/logger');
const MovieCreator = require('./backend/services/movie-creator');
const MovieEditor = require('./backend/services/movie-editor');
const MovieTrash = require('./backend/services/movie-trash');
const GameCreator = require('./backend/services/game-creator');
const GameEditor = require('./backend/services/game-editor');
const { buildMovieFilename, buildGameFilename } = require('./backend/utils/filename');
const idGenerator = require('./backend/services/id-generator');
const MetadataStore = require('./backend/storage/metadata-store');
const { createBackupManager } = require('./backend/storage/backup');
const { version: APP_VERSION } = require('./package.json');
const { MOVIE_TYPES, publicConfig } = require('./backend/constants');
const { validateInput } = require('./backend/utils/validate-input');
const {
  loadCredentials, isSetupComplete, isLoopback, setupAdmin,
  validateCredentials, isRateLimited, getRetryAfter, changePassword,
  createSession, validateSession, invalidateSession, onLogout, stopAuthCleanup
} = require('./server/auth/auth');

/**
 * Detect image type from magic bytes.
 * Returns file extension ('jpg', 'png', 'webp', 'avif') or null if unknown.
 * Accepts: JPEG (FF D8 FF), PNG (89 50 4E 47), WEBP (RIFF....WEBP), AVIF (ftypavif/ftypavis).
 */
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  // WEBP (RIFF....WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  // AVIF (ftyp boxes)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const sig = buf.slice(8, 12).toString('ascii');
    if (sig === 'avif' || sig === 'avis') return 'avif';
  }
  return null;
}

/**
 * Decode a client poster payload (data URL or bare base64) — shared by
 * POST /api/movies and both PUT edit routes (P6a E1 / Q1).
 * Returns { ok: true, buffer, ext } or { ok: false, status, code, error }.
 * The `code` is the structured error code the client maps to a UI field (Q6);
 * the Persian text is only ever displayed, never parsed.
 */
function decodePosterPayload(poster) {
  try {
    const base64Data = poster.includes(',') ? poster.split(',')[1] : poster;
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      return {
        ok: false, status: 413, code: 'IMG_TOO_LARGE',
        error: 'تصویر پوستر خیلی بزرگ است (حداکثر ۸ مگابایت)'
      };
    }
    const ext = detectImageType(buffer);
    if (!ext) {
      return {
        ok: false, status: 400, code: 'IMG_UNSUPPORTED',
        error: 'فرمت تصویر پشتیبانی نمی‌شود (فقط JPEG, PNG, WEBP, AVIF)'
      };
    }
    return { ok: true, buffer, ext };
  } catch {
    return { ok: false, status: 400, code: 'IMG_INVALID', error: 'فرمت تصویر نامعتبر است' };
  }
}

/**
 * Wrap an optional `poster` field from a PUT body into MovieEditor options.
 * Returns { ok: true, options } or { ok: false, status, code, error }.
 */
function decodePosterOption(poster) {
  if (poster === undefined || poster === null) return { ok: true, options: undefined };
  if (typeof poster !== 'string' || poster === '') {
    return { ok: false, status: 400, code: 'IMG_INVALID', error: 'تصویر پوستر نامعتبر است' };
  }
  const decoded = decodePosterPayload(poster);
  if (!decoded.ok) return decoded;
  return { ok: true, options: { posterBuffer: decoded.buffer, posterExt: decoded.ext } };
}

/**
 * F28 — the ONE source of truth for "routes whose body may carry a poster".
 * The 100 KB body guard (SEC-06 / FE-13) exempts exactly these; everything
 * else (preview, rescan, restore …) stays under the guard. The guards for
 * movie create/edit were the historical exemptions; game create (POST
 * /api/games) uses the same shared poster decoder and was missed, so any
 * >100KB game poster was rejected with "Request body too large". Both PUT
 * /api/movies routes (by-uid and the legacy :id alias) carry an optional
 * poster (P6a E1 / Q1).
 * A future poster-carrying route must be added here, next to its decoder.
 */
const POSTER_BODY_ROUTES = [
  { method: 'POST', path: '/api/movies' },
  { method: 'PUT', pathPrefix: '/api/movies/' },
  { method: 'POST', path: '/api/games' }
];

function routeCarriesPosterBody(method, path) {
  return POSTER_BODY_ROUTES.some((r) =>
    r.method === method && (r.path != null ? path === r.path : path.startsWith(r.pathPrefix)));
}

/**
 * Create and configure a server instance.
 *
 * @param {object} [options]
 * @param {number} [options.port] - Port (default: env PORT or 3000; 0 = random)
 * @param {string} [options.libraryPath] - Library root (default: env LIBRARY_PATH or ./Library)
 * @param {string} [options.dataDir] - Data directory (default: env DATA_DIR or ./data)
 * @param {boolean} [options.quiet] - Suppress banner/logs
 * @param {boolean} [options.thumbWarmUp] - Force thumbnail warm-up even in
 *   quiet mode (default: `!quiet`; tests use it to exercise the warm-up +
 *   concurrent-rename path). The Buffer-based conversion holds no source fd,
 *   so warm-up no longer causes EBUSY on Windows renames.
 * @param {function|Promise} [options.reconcileGate] - P8c G6 test seam:
 *   awaited between the background scan and the atomic index swap so tests
 *   can observe the "scanning" window deterministically.
 * @returns {{ app, httpServer, indexer, orderManager, wsServer, diagnostics, movieCreator, watcher, start(), stop(), whenReconciled() }}
 */
function createServer(options) {
  const opts = options || {};
  const port = opts.port !== undefined ? opts.port : (parseInt(process.env.PORT, 10) || 3000);
  const LIBRARY_PATH = path.resolve(opts.libraryPath || process.env.LIBRARY_PATH || path.join(__dirname, 'Library'));
  const dataDir = path.resolve(opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data'));
  const CATALOG_PATH = path.join(dataDir, 'catalog.json');
  const ORDERS_PATH = path.join(dataDir, 'orders.json');
  const METADATA_PATH = path.join(dataDir, 'metadata.json');
  const BACKUP_DIR = path.join(dataDir, 'backups');
  const quiet = !!opts.quiet;
  // Warm-up default follows quiet; tests can force it on to exercise the
  // concurrent-rename path (safe now — generate() reads to Buffer, no fd held).
  const thumbWarmUp = opts.thumbWarmUp !== undefined ? !!opts.thumbWarmUp : !quiet;

  const app = express();
  const httpServer = http.createServer(app);

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (err) {
      console.error(`  [FATAL] Cannot create data directory ${dataDir}: ${err.message}`);
      console.error('  [FATAL] مسیر data در دسترس نیست — لطفاً دسترسی پوشه را بررسی کنید.');
      throw err;
    }
  }

  const backupManager = createBackupManager(BACKUP_DIR);
  const metadataStore = new MetadataStore(METADATA_PATH, {
    backupDir: BACKUP_DIR,
    catalogPath: CATALOG_PATH,
    backupManager
  });
  const indexer = new CatalogIndexer(CATALOG_PATH, { metadata: metadataStore });
  const orderManager = new OrderManager(ORDERS_PATH, { backupManager, backupDir: BACKUP_DIR });
  // FE-12 / G4 — WebP thumbnail cache under data/thumbs (sharp optional, D4)
  const thumbService = createThumbService({
    thumbsDir: path.join(dataDir, 'thumbs'),
    log: (m) => { if (!quiet) console.log(m); }
  });
  let watcher = null;
  let movieEditor = null;
  let movieTrash = null;
  let gameCreator = null;
  let gameEditor = null;
  let diagnostics = null;
  let wsServer = null;
  let movieCreator = null;
  let stopping = false;

  // ─── P8c G6 — serve from cache, reconcile in the background ──────────────
  // The port starts answering right after initialize(); the library scan
  // runs async and swaps its results in atomically. `scanning` feeds
  // meta.scanning and the 503 guard on mutating routes until the swap.
  let scanning = true;
  let resolveReconciled = null;
  const reconcileSettled = new Promise((resolve) => { resolveReconciled = resolve; });

  // P8c follow-up — in-server lag probe: timer drift + histogram, phase
  // attributed. Started here (covers loadFromDisk/initialize), stopped when
  // the reconcile settles; read via getStartupProbe().
  const probe = new StartupProbe();
  probe.start();
  let reconcilePhases = null; // [{ name, ms }] wall time per reconcile step

  /** Phase wall-time recorder; each mark() also labels the lag probe. */
  function makePhaseRecorder() {
    const phases = [];
    let current = null;
    let currentIsSync = false;
    let last = 0n;
    const now = () => process.hrtime.bigint();
    return {
      mark(name, sync) {
        const t = now();
        if (current) phases.push({ name: current, ms: Number(t - last) / 1e6, sync: currentIsSync });
        current = name;
        currentIsSync = !!sync;
        last = t;
        probe.setPhase(name);
      },
      done() {
        const t = now();
        if (current) {
          phases.push({ name: current, ms: Number(t - last) / 1e6, sync: currentIsSync });
          current = null;
        }
        return phases;
      }
    };
  }

  /**
   * Stop the probe and log the startup/reconcile summary:
   * phase wall times, worst in-server lag, and every SYNCHRONOUS phase
   * whose drift (longest uninterrupted chunk) exceeded 100 ms.
   * Runs at most once (guarded by probe.running at every call site).
   */
  let probeFinished = false;
  function finishProbe(phases) {
    if (probeFinished) return;
    probeFinished = true;
    const result = probe.stop();
    reconcilePhases = phases || reconcilePhases;
    if (result) {
      log(`  → Event-loop lag: max ${result.maxMs} ms (histogram max ${result.histogramMaxMs} ms)`);
    }
    if (reconcilePhases && reconcilePhases.length) {
      const parts = reconcilePhases.map((p) => `${p.name} ${p.ms.toFixed(0)}ms`);
      log(`  → Reconcile phases: ${parts.join(' → ')}`);
      if (result && result.phaseMax && Object.keys(result.phaseMax).length) {
        const detail = Object.entries(result.phaseMax)
          .map(([name, ms]) => `${name} ${ms}ms`).join(', ');
        log(`  → Phase sync-chunk max: ${detail}`);
      }
      if (result) {
        const over = reconcilePhases.filter(
          (p) => p.sync && (result.phaseMax[p.name] || 0) > 100
        );
        if (over.length) {
          const detail = over
            .map((p) => `${p.name} ${result.phaseMax[p.name]}ms`)
            .join(', ');
          log(`  → Sync chunks over 100 ms: ${detail}`);
        }
      }
    }
  }

  // Cached serialised payloads for /api/movies and /api/games: stable
  // content ETag (304), gzip via built-in zlib, rebuilt on a 100 ms debounce
  // whenever the indexer mutates (onChange) or a mutating route succeeds.
  const moviesPayload = new PayloadCache(() => ({
    meta: {
      version: APP_VERSION,
      lastUpdated: new Date().toISOString(),
      totalMovies: indexer.count,
      source: 'api',
      scanning
    },
    movies: indexer.getMovies()
  }));
  const gamesPayload = new PayloadCache(() => ({
    meta: {
      version: APP_VERSION,
      lastUpdated: new Date().toISOString(),
      totalGames: indexer.getGames().length,
      source: 'api'
    },
    games: indexer.getGames().map(CatalogIndexer.toPublicGame)
  }));
  indexer.onChange = () => {
    moviesPayload.invalidate();
    gamesPayload.invalidate();
  };

  function invalidatePayloads() {
    moviesPayload.invalidate();
    gamesPayload.invalidate();
  }

  /** uid → mtime snapshot of movies + games (input to the reconcile diff). */
  function snapshotCatalog() {
    const snap = new Map();
    for (const m of indexer._movieMap.values()) snap.set(m.uid, m.mtime);
    for (const g of indexer.getGames()) snap.set(g.uid, g.mtime);
    return snap;
  }

  function diffSnapshot(before) {
    const after = snapshotCatalog();
    const diff = { added: 0, updated: 0, removed: 0 };
    for (const [uid, mtime] of after) {
      if (!before.has(uid)) diff.added++;
      else if (before.get(uid) !== mtime) diff.updated++;
    }
    for (const uid of before.keys()) {
      if (!after.has(uid)) diff.removed++;
    }
    return diff;
  }

  /** Send a cached payload: ETag + 304 on If-None-Match, gzip when accepted. */
  function sendPayload(req, res, cache) {
    const entry = cache.getEntry();
    const inm = req.headers['if-none-match'];
    if (inm) {
      const tags = String(inm).split(',').map((t) => t.trim());
      if (tags.includes('*') || tags.some((t) => t === entry.etag || t === 'W/' + entry.etag)) {
        res.set('ETag', entry.etag);
        res.set('Vary', 'Accept-Encoding');
        return res.status(304).end();
      }
    }
    const gzipOk = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    res.set('ETag', entry.etag);
    res.set('Vary', 'Accept-Encoding');
    // no-cache = revalidate every time; the ETag makes that a cheap 304
    res.set('Cache-Control', 'no-cache');
    if (gzipOk && entry.gzip) {
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Content-Length', String(entry.gzip.length));
      return res.end(entry.gzip);
    }
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Length', String(entry.body.length));
    res.end(entry.body);
  }

  /**
   * Route middleware for the catalog-mutating admin endpoints (G6):
   *   - 503 SCAN_IN_PROGRESS while the startup reconcile is still running
   *     (the index is mid-swap — writes would race it, I1),
   *   - drop the cached payloads once a mutation succeeds so the next GET
   *     reflects it without waiting for the watcher debounce.
   */
  function catalogMutation(req, res, next) {
    if (scanning) {
      return res.status(503).json({
        success: false,
        code: 'SCAN_IN_PROGRESS',
        // Wording (owner, P8c follow-up): «بروزرسانی» not «اسکن» — the gate
        // covers any reconcile (scan, cache rebuild, held replay), and it
        // matches the client's own header indicator vocabulary.
        error: 'کتابخانه در حال بروزرسانی است — لطفاً چند لحظه بعد دوباره تلاش کنید'
      });
    }
    res.on('finish', () => {
      if (res.statusCode < 400) invalidatePayloads();
    });
    next();
  }

  function log(...args) {
    if (!quiet) console.log(...args);
  }
  function warn(...args) {
    if (!quiet) console.warn(...args);
  }

  function initialize() {
    log('');
    log('  ╔════════════════════════════════════════╗');
    log(`  ║      MovieCatalog Server v${APP_VERSION}      ║`);
    log('  ╚════════════════════════════════════════╝');
    log('');

    // Load auth credentials (SEC-05 / D5)
    loadCredentials(dataDir);
    log(`  → Auth setup: ${isSetupComplete() ? 'complete' : 'first-run (setup required)'}`);

    // Startup backups for durable files (A2): only if changed since last backup
    try {
      backupManager.startupBackup(ORDERS_PATH, 'orders');
      backupManager.startupBackup(METADATA_PATH, 'metadata');
      backupManager.startupBackup(path.join(dataDir, 'auth.json'), 'auth');
    } catch (err) {
      warn(`  [WARN] Startup backup failed: ${err.message}`);
    }

    // Manager metadata store (DATA-10) — migrates from old catalog.json on first start
    const metaLoad = metadataStore.load();
    if (metaLoad.migrated) {
      log('  → Metadata: migrated imdbRating/plotSummary from catalog.json');
    }
    indexer.setMetadataStore(metadataStore);

    log('  → Step 1: Loading cached catalog...');
    probe.setPhase('cache-load');
    const cached = indexer.loadFromDisk();
    probe.setPhase('startup');
    const cachedCount = indexer.count;

    // G6 — the port answers from the cache; the scan swaps in behind it
    // (meta.scanning stays true until reconcileLibrary() finishes).
    if (cached && cachedCount > 0) {
      log(`  → Serving ${cachedCount} movies from cache; reconciling...`);
    } else {
      log('  → No catalog cache — scanning Library/ in the background...');
    }

    if (!fs.existsSync(LIBRARY_PATH)) {
      warn('');
      warn('  [WARN] Library folder not found!');
      warn(`         Expected: ${LIBRARY_PATH}`);
      warn('');
      warn('  Create it like this (see README.md for the naming rules):');
      warn('    Library/');
      warn('      Movies/');
      warn('        Action/');
      warn('          0042- The Matrix 1999.jpg');
      warn('      Animation/');
      warn('        0012-Cars.jpg');
      warn('      Series/');
      warn('        Breaking Bad.jpg');
      warn('      Games/');
      warn('        PS4/');
      warn('          Ghost Rider.jpg');
      warn('');
    }

    diagnostics = new Diagnostics(indexer, LIBRARY_PATH, metadataStore);

    log('  → Step 2: Starting filesystem watcher...');
    watcher = new LibraryWatcher(LIBRARY_PATH, indexer, handleFileChange);
    // G6 — hold events while the background scan runs; releaseHold() replays
    // the recorded directories against the freshly swapped index (B6-idempotent).
    watcher.holdReconcile();
    watcher.start();

    log('  → Step 3: Starting WebSocket server...');
    wsServer = new WebSocketServer(httpServer, orderManager, indexer, opts.wsOptions);

    // Wire logout callback: close manager sockets when session is invalidated (S10)
    onLogout((token) => {
      if (wsServer) wsServer.closeManagersByToken(token);
    });

    log('  → Step 4: Initializing Movie Creator...');
    movieCreator = new MovieCreator(LIBRARY_PATH, CATALOG_PATH, indexer, wsServer, metadataStore, watcher, { diagnostics });

    movieEditor = new MovieEditor({
      libraryPath: LIBRARY_PATH,
      indexer,
      watcher,
      metadataStore,
      wsServer,
      diagnostics,
      log
    });

    // Soft delete / restore (P6b E3, D6) — shares watcher + diagnostics with the editor
    movieTrash = new MovieTrash({
      libraryPath: LIBRARY_PATH,
      indexer,
      watcher,
      wsServer,
      diagnostics,
      log
    });

    // Games create / edit (P6c E4) — same watcher + diagnostics as movie paths
    gameCreator = new GameCreator({ libraryPath: LIBRARY_PATH, indexer, watcher, log });
    gameEditor = new GameEditor({ libraryPath: LIBRARY_PATH, indexer, watcher, log });

    log('');
    log(`  → Total movies: ${indexer.count}`);
    log(`  → Total games: ${indexer.getGames().length}`);
    log(`  → Total orders: ${orderManager.count}`);

    const typeCounts = {};
    for (const movie of indexer.getMovies()) {
      typeCounts[movie.type] = (typeCounts[movie.type] || 0) + 1;
    }
    const typeStr = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    if (typeStr) log(`  → By type: ${typeStr}`);

    const allGenres = new Set();
    for (const movie of indexer.getMovies()) {
      for (const g of movie.genres) allGenres.add(g);
    }
    log(`  → Genres: ${allGenres.size} (${Array.from(allGenres).sort().join(', ')})`);

    log('');
  }

  function handleFileChange(diff) {
    // Debounced async save (A5) — coalesces watcher bursts
    indexer.scheduleSave();
    // B9: drop diagnostics 30 s cache so the next report reflects disk state
    if (diagnostics) diagnostics.invalidate();
    // B6 / DATA-02: notify clients that the catalog changed (additive; P4 consumes)
    if (wsServer && diff && (diff.added || diff.updated || diff.removed)) {
      wsServer.broadcastCatalogChanged(diff);
    }
  }

  /**
   * FE-12 / G4 — sweep stale thumbnails against the final index, then warm
   * the grid's first screen in the background (no-op without sharp).
   * Moved out of initialize(): runs at the end of the background reconcile
   * so `expected` reflects the swapped-in index (P8c G6).
   */
  async function sweepThumbs() {
    try {
      const expected = new Set();
      const addExpected = (p, mtime) => {
        if (!p || !Number.isFinite(mtime)) return;
        for (const w of THUMB_WIDTHS) expected.add(thumbService.hashFor(p, mtime, w));
      };
      for (const [filePath, entry] of indexer._fileIndex) {
        addExpected(filePath, entry.lastModified);
      }
      for (const game of indexer.getGames()) {
        addExpected(game.absolutePosterPath, game.mtime);
      }
      const sweep = await thumbService.cleanOrphans(expected);
      if (sweep.removed > 0) {
        log(`  → Removed ${sweep.removed} stale thumbnail(s)`);
      }
      // Warm-up gated by thumbWarmUp (default !quiet). generate() reads the
      // source to a Buffer before sharp, so no source fd is held and a
      // concurrent rename no longer hits EBUSY on Windows.
      if (thumbWarmUp) {
        const warmEntries = [];
        for (const movie of indexer.getMovies()) {
          const raw = indexer.getByUid(movie.uid);
          if (raw && raw.absolutePosterPath && Number.isFinite(raw.mtime)) {
            warmEntries.push({ absPath: raw.absolutePosterPath, mtimeMs: raw.mtime });
          }
        }
        setImmediate(() => { thumbService.warmUp(warmEntries, 40).catch(() => {}); });
      }
    } catch (err) {
      if (!quiet) console.error(`  [THUMBS] startup sweep failed: ${err.message}`);
    }
  }

  /**
   * P8c G6 — background reconcile, started right after listen():
   * async scan → pause at the optional test gate → atomic index swap →
   * release the watcher hold (replays events held during the scan) →
   * flush the cache + sweep thumbs → broadcast the final catalog:changed.
   * GET /api/movies serves the pre-swap cache with meta.scanning=true
   * until the swap lands.
   */
  async function reconcileLibrary() {
    const t0 = Date.now();
    const before = snapshotCatalog();
    const rec = makePhaseRecorder();
    try {
      log('  → Scanning library...');
      log(`             Path: ${LIBRARY_PATH}`);

      rec.mark('scan-movies', false);
      const { results, stats: scanStats, invalid } = await scanLibraryAsync(LIBRARY_PATH);
      log(`             Found ${scanStats.imageFilesFound} image files, parsed ${scanStats.moviesParsed} movies`);

      rec.mark('scan-games', false);
      const { results: gameResults, stats: gameStats } = await scanGamesAsync(LIBRARY_PATH);
      log(`             Found ${gameStats.gamesParsed} games`);

      // Test seam: pause between scan and swap so tests can observe (and
      // mutate) the "scanning" window while GET serves the pre-swap cache.
      if (opts.reconcileGate) {
        rec.mark('gate', false);
        const gate = typeof opts.reconcileGate === 'function' ? opts.reconcileGate() : opts.reconcileGate;
        if (gate && typeof gate.then === 'function') await gate;
      }
      if (stopping) return;

      // Re-validate the root right before the swap. An unreadable root makes
      // the scanner log-and-return-EMPTY (walkDir never throws), and swapping
      // that would wipe a perfectly good cached catalog. Throwing lands in
      // the catch below: the old index keeps serving, scanning ends, and the
      // 503 gate lifts as usual.
      try {
        await fs.promises.readdir(LIBRARY_PATH);
      } catch (err) {
        const hasCache = fs.existsSync(CATALOG_PATH) || indexer.count > 0;
        const keepingMsg = hasCache ? ' — keeping cached catalog' : '';
        throw new Error(`library root unreadable before swap (${err.code || err.message})${keepingMsg}`);
      }

      rec.mark('swap', true);
      // Build-aside swap: the index stays intact until the single-step
      // publish, and the generator yields between chunks (P8c lag budget).
      await indexer.replaceFromScanAsync(results);
      indexer.setLastInvalid(invalid || []);
      indexer.replaceGames(gameResults);

      scanning = false;
      invalidatePayloads(); // meta.scanning flipped true → false

      // Rebuild the cached payloads BEFORE releasing the flag so a request
      // arriving the instant scanning flips never pays the rebuild — and so
      // the cost is attributed to the reconcile window, not to a user.
      rec.mark('payload-rebuild', true);
      moviesPayload.rebuildNow();
      gamesPayload.rebuildNow();

      rec.mark('release-hold', true);
      await watcher.releaseHold();

      rec.mark('flush', true);
      await indexer.flushAsync();

      rec.mark('thumbs', false);
      await sweepThumbs();

      rec.mark('diff', true);
      const diff = diffSnapshot(before);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      log(`  → Reconcile finished in ${secs} s (+${diff.added} ~${diff.updated} -${diff.removed})`);
      // Always broadcast, even an all-zero diff: clients that loaded the
      // cache while meta.scanning was true clear their "updating" indicator.
      if (wsServer) wsServer.broadcastCatalogChanged(diff);
      if (diagnostics) diagnostics.invalidate();
    } catch (err) {
      warn(`  [WARN] Background reconcile failed: ${err.message}`);
    } finally {
      scanning = false;
      invalidatePayloads();
      // Failure path: rebuild from the (untouched) cached index so the body
      // carries scanning=false and keeps serving the cached catalog.
      try {
        moviesPayload.rebuildNow();
        gamesPayload.rebuildNow();
      } catch (err) {
        warn(`  [WARN] Payload rebuild after reconcile failed: ${err.message}`);
      }
      if (watcher) await watcher.releaseHold();
      if (probe.running) finishProbe(rec.done());
      if (resolveReconciled) {
        resolveReconciled();
        resolveReconciled = null;
      }
    }
  }

  // ─── Security headers (SEC-07) ───────────────────────────────────────────

  app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'no-referrer');
    res.header('X-Frame-Options', 'DENY');
    res.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'");
    // CORS: same-origin only by default; opt-in via CORS_ORIGINS env (comma list)
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
      : [];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // ─── Body parser ──────────────────────────────────────────────────────────

  // P8a G3 — one structured line per completed request (file only; never
  // bodies/headers). No-op unless the logger was init'd (auto-start/tests).
  app.use(logger.requestMiddleware());

  // POST /api/movies needs 12 MB for poster base64 data. All other routes
  // receive small JSON; a route-level guard (below) rejects oversized
  // payloads on non-upload endpoints.
  app.use(express.json({ limit: '12mb' }));

  // Enforce 100 KB body limit on non-upload routes (SEC-06 / FE-13).
  // Checked via Content-Length before the JSON body is consumed.
  // Exempt: the routes that may carry a base64 poster — ONE shared list
  // (POSTER_BODY_ROUTES above, F28): POST /api/movies (create), PUT /api/movies/*
  // (edit routes — P6a E1 optional poster, Q1) and POST /api/games (game
  // create uses the same shared decoder; missing here, game create 413'd).
  app.use((req, res, next) => {
    if (routeCarriesPosterBody(req.method, req.path)) return next();
    const cl = parseInt(req.headers['content-length'], 10);
    if (!isNaN(cl) && cl > 102400) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }
    next();
  });

  // P6c E2: body-parser failures must be structured JSON, never an HTML error
  // page — the client maps `code` to a Persian toast (FE-13). Registered right
  // after express.json() so entity.* errors raised there land here first.
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        error: 'حجم درخواست بیش از حد مجاز است (حداکثر ۱۲ مگابایت)',
        code: 'IMG_TOO_LARGE'
      });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'بدنه درخواست نامعتبر است', code: 'VALIDATION' });
    }
    return next(err);
  });

  // ─── Input validation (S5 defence-in-depth) ──────────────────────────────
  // Strip control chars (U+0000–U+001F, U+007F) via char codes — the
  // sanitizer must not itself carry control-character regex literals
  // (lint: no-control-regex). Equivalent to the old [\x00-\x1f\x7f] strip.
  function stripControlChars(str) {
    let out = '';
    for (const ch of str) {
      const c = ch.charCodeAt(0);
      if (c > 0x1f && c !== 0x7f) out += ch;
    }
    return out;
  }

  // Strip control chars from text fields; enforce length/range limits on
  // write endpoints (POST /api/movies, PUT /api/movies/:id).
  function validateMovieInput(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();
    if (req.path !== '/api/movies' && !req.path.startsWith('/api/movies/')) return next();
    const b = req.body;
    if (!b || typeof b !== 'object') return next();

    // Strip control chars from title (1–200 chars)
    if (typeof b.title === 'string') {
      b.title = stripControlChars(b.title).trim();
      if (b.title.length === 0 || b.title.length > 200) {
        return res.status(400).json({ success: false, error: 'عنوان باید ۱ تا ۲۰۰ کاراکتر باشد' });
      }
    }

    // plotSummary ≤ 2000 chars, strip control chars
    if (typeof b.plotSummary === 'string') {
      b.plotSummary = stripControlChars(b.plotSummary).trim();
      if (b.plotSummary.length > 2000) {
        return res.status(400).json({ success: false, error: 'خلاصه داستان حداکثر ۲۰۰۰ کاراکتر است' });
      }
    }

    // year: int 1900–2099 or null
    if (b.year != null) {
      const y = Number(b.year);
      if (!Number.isInteger(y) || y < 1900 || y > 2099) {
        return res.status(400).json({ success: false, error: 'سال انتشار باید بین ۱۹۰۰ تا ۲۰۹۹ باشد' });
      }
      b.year = y;
    }

    // imdbRating: number 0–10 or null
    if (b.imdbRating != null) {
      const r = Number(b.imdbRating);
      if (typeof r !== 'number' || isNaN(r) || r < 0 || r > 10) {
        return res.status(400).json({ success: false, error: 'امتیاز IMDB باید بین ۰ تا ۱۰ باشد' });
      }
      b.imdbRating = r;
    }

    // genres: array of strings, each ≤ 60 chars
    if (Array.isArray(b.genres)) {
      for (let i = 0; i < b.genres.length; i++) {
        if (typeof b.genres[i] !== 'string') {
          return res.status(400).json({ success: false, error: 'ژانرها باید رشته باشند' });
        }
        b.genres[i] = stripControlChars(b.genres[i]).trim();
        if (b.genres[i].length === 0 || b.genres[i].length > 60) {
          return res.status(400).json({ success: false, error: 'نام ژانر باید ۱ تا ۶۰ کاراکتر باشد' });
        }
      }
    }

    next();
  }
  app.use(validateMovieInput);

  // ─── Static files — explicit allow-list (SEC-01) ─────────────────────────
  // Serve index.html at root, css/, js/ directories. Nothing else from the
  // project root is reachable: /server/*, /backend/*, /data/*, /package*.json,
  // /Library/*, dotfiles, .. tricks all return 404.

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.use('/css', express.static(path.join(__dirname, 'css')));
  app.use('/js', express.static(path.join(__dirname, 'js')));
  // Bundled assets (FE-12 / G5): Vazirmatn webfont + OFL licence
  app.use('/assets', express.static(path.join(__dirname, 'assets')));

  // ─── API Routes ──────────────────────────────────────────────────────────

  // ─── requireAdmin middleware (SEC-02) ────────────────────────────────────
  function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : null;
    const session = validateSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    req.adminUser = session.username;
    next();
  }

  // ─── Auth status (public) ────────────────────────────────────────────────
  app.get('/api/auth/status', (req, res) => {
    res.json({ setupRequired: !isSetupComplete() });
  });

  // ─── First-run setup (loopback only, SEC-05 / D5) ───────────────────────
  app.post('/api/auth/setup', (req, res) => {
    const { username, password } = req.body || {};
    const result = setupAdmin(username, password, req);
    if (!result.success) {
      const status = isSetupComplete() ? 403 : (!isLoopback(req) ? 403 : 400);
      return res.status(status).json(result);
    }
    // Auto-login after setup
    const token = createSession(username);
    log(`  [AUTH] Admin account created: ${username}`);
    res.json({ success: true, token });
  });

  // ─── Login (public) ──────────────────────────────────────────────────────
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const ip = req.socket && req.socket.remoteAddress || 'unknown';

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    if (!isSetupComplete()) {
      return res.status(400).json({ success: false, error: 'مدیر هنوز تنظیم نشده است — از صفحه اصلی رمز عبور را تنظیم کنید' });
    }

    // Rate limit check
    if (isRateLimited(username, ip)) {
      const retryAfter = getRetryAfter(username, ip);
      res.header('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است — بعداً دوباره تلاش کنید' });
    }

    if (validateCredentials(username, password, ip)) {
      const token = createSession(username);
      log(`  [AUTH] Admin logged in: ${username}`);
      res.json({ success: true, token });
    } else {
      log(`  [AUTH] Failed login attempt: ${username} from ${ip}`);
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  });

  // ─── Logout (admin) ──────────────────────────────────────────────────────
  app.post('/api/auth/logout', (req, res) => {
    // F30: accept the Authorization header token OR the body token.
    const bodyToken = req.body && req.body.token;
    const authHeader = req.headers.authorization || '';
    const headerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const headerToken = headerMatch ? headerMatch[1] : null;
    const token = bodyToken || headerToken;
    if (!token) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    const session = validateSession(token);
    if (!session || session.role !== 'admin') {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    invalidateSession(token);
    log('  [AUTH] Admin logged out');
    res.json({ success: true });
  });

  // ─── Change password (admin) ─────────────────────────────────────────────
  app.post('/api/auth/change-password', requireAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const result = changePassword(currentPassword, newPassword, req.adminUser);
    if (!result.success) {
      return res.status(400).json(result);
    }
    log('  [AUTH] Password changed');
    res.json({ success: true });
  });

  // ─── Public API ──────────────────────────────────────────────────────────

  // ARCH-03 (P7a F2) — one runtime config for the front end (offline, no
  // build step). Values live in backend/constants.js, version in package.json.
  app.get('/api/config', (req, res) => {
    res.json(publicConfig(APP_VERSION));
  });

  // G6 — cached payload: stable ETag (304 on If-None-Match), gzip, and
  // meta.scanning=true while the startup reconcile is still running.
  app.get('/api/movies', (req, res) => {
    sendPayload(req, res, moviesPayload);
  });

  // FE-12 / G4 — shared poster/thumbnail responder.
  //   ?w=300|600 → WebP thumb from data/thumbs (sharp; falls back to the
  //   original when sharp is missing or the conversion fails).
  //   ?v=<mtimeMs> matching the file → long-term immutable caching; ETag/304
  //   come from sendFile's freshness check.
  async function servePosterImage(req, res, absPath, notFoundMessage) {
    if (!absPath) return res.status(404).json({ error: notFoundMessage });
    let stat;
    try {
      stat = await fs.promises.stat(absPath);
      if (!stat.isFile()) throw new Error('not a file');
    } catch {
      return res.status(404).json({ error: notFoundMessage });
    }

    let sendPath = absPath;
    let immutable = false;

    const wRaw = req.query.w;
    if (wRaw !== undefined && wRaw !== '') {
      const w = Number(wRaw);
      if (!isThumbWidth(w)) {
        return res.status(400).json({ error: 'Invalid thumbnail width' });
      }
      const thumb = await thumbService.get(absPath, stat.mtimeMs, w);
      if (thumb) {
        sendPath = thumb.file;
        immutable = true; // hash-named content is immutable by construction
      }
    }

    if (!immutable) {
      const v = Number(req.query.v);
      immutable = Number.isFinite(v) && v > 0 && Math.trunc(stat.mtimeMs) === v;
    }
    res.set('Cache-Control', immutable
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600');
    res.sendFile(sendPath, { dotfiles: 'deny' });
  }

  app.get('/api/poster/:id', (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Invalid movie ID' });
    servePosterImage(req, res, indexer.getPosterPath(id), 'Poster not found')
      .catch((err) => {
        console.error(`  [API] GET /api/poster error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Poster error' });
      });
  });

  app.get('/api/stats', (req, res) => {
    const movies = indexer.getMovies();
    const genres = {};
    const types = {};
    const decades = {};

    for (const movie of movies) {
      for (const g of movie.genres) {
        genres[g] = (genres[g] || 0) + 1;
      }
      types[movie.type] = (types[movie.type] || 0) + 1;
      if (movie.year) {
        const decade = `${Math.floor(movie.year / 10) * 10}s`;
        decades[decade] = (decades[decade] || 0) + 1;
      }
    }

    res.json({
      totalMovies: movies.length,
      genres,
      types,
      decades,
      yearRange: {
        min: movies.reduce((min, m) => m.year < min ? m.year : min, Infinity),
        max: movies.reduce((max, m) => m.year > max ? m.year : max, -Infinity)
      }
    });
  });

  // G6 — same caching contract as /api/movies (games carry no meta.scanning;
  // they are never cached on disk and stay empty until the reconcile lands).
  app.get('/api/games', (req, res) => {
    sendPayload(req, res, gamesPayload);
  });

  app.get('/api/game-poster/:title', (req, res) => {
    const title = req.params.title;
    if (!title) return res.status(400).json({ error: 'Invalid game title' });
    servePosterImage(req, res, indexer.getGamePosterPath(title), 'Game poster not found')
      .catch((err) => {
        console.error(`  [API] GET /api/game-poster error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Game poster error' });
      });
  });

  // ─── Admin API (requireAdmin) ────────────────────────────────────────────

  // B10: async walk (movies + games) — yields to the event loop between dirs
  app.post('/api/rescan', requireAdmin, catalogMutation, async (req, res) => {
    log('  [API] Full rescan requested');

    try {
      const { results, stats: scanStats, invalid } = await scanLibraryAsync(LIBRARY_PATH);
      indexer.replaceFromScan(results);
      indexer.setLastInvalid(invalid || []);

      const { results: gameResults, stats: gameStats } = await scanGamesAsync(LIBRARY_PATH);
      indexer.replaceGames(gameResults);

      // A5 — do not block the response on the full catalog rewrite; stop() still flushes
      indexer.scheduleSave();
      if (diagnostics) diagnostics.invalidate();

      res.json({
        success: true,
        count: indexer.count,
        gamesCount: indexer.getGames().length,
        invalid: (invalid || []).length,
        invalidFiles: invalid || [],
        scanStats,
        gameStats,
        lastUpdated: new Date().toISOString()
      });
    } catch (err) {
      console.error(`  [API] POST /api/rescan error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/diagnostics', requireAdmin, (req, res) => {
    if (!diagnostics) {
      return res.status(503).json({ error: 'Diagnostics not initialized' });
    }

    const report = diagnostics.runFullReport();
    res.json(report);
  });

  app.get('/api/orders', requireAdmin, (req, res) => {
    const orders = orderManager.getOrders();
    res.json({
      success: true,
      orders
    });
  });

  app.get('/api/orders/:id', requireAdmin, (req, res) => {
    const order = orderManager.getOrder(req.params.id);
    if (order) {
      res.json({ success: true, order });
    } else {
      res.status(404).json({ success: false, error: 'Order not found' });
    }
  });

  function sendEditError(res, err, where, statusOfFn) {
    const status = (statusOfFn || MovieEditor.statusOf)(err);
    if (status >= 500) {
      console.error(`  [API] ${where} error: ${err.message}`);
    }
    // F35: never forward raw OS/JS error text to the client. Only structured
    // errors (from fail(), which carry a code + Persian message) expose their
    // message; everything else gets a generic Persian 500.
    const body = { success: false, error: err.code ? err.message : 'خطای پیش آمده است' };
    if (err.code) body.code = err.code;
    res.status(status).json(body);
  }

  // P6c E2 — same shape for POST /api/movies, driven by the creator's codes
  function sendCreateError(res, err, where, statusOfFn) {
    const status = (statusOfFn || MovieCreator.statusOf)(err);
    if (status >= 500) {
      console.error(`  [API] ${where} error: ${err.message}`);
    }
    const body = { success: false, error: err.code ? err.message : 'خطای پیش آمده است' };
    if (err.code) body.code = err.code;
    res.status(status).json(body);
  }

  // Canonical edit route — works for Series (uid URL-encoded) and all types (B7 / FE-05)
  app.put('/api/movies/by-uid/:uid', requireAdmin, catalogMutation, (req, res) => {
    const uid = String(req.params.uid || '');
    // P6c E4 — owner-approved dispatch: `game:` uids take the game pipeline
    // (the movie editor refuses them as defence behind this branch).
    if (uid.startsWith('game:')) {
      if (!gameEditor) {
        return res.status(503).json({ success: false, error: 'Game Editor not ready' });
      }
      try {
        const validation = validateInput(req.body || {}, {
          isGame: true, requirePoster: false, allowId: false, requireType: false
        });
        if (!validation.ok) {
          return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
        }
        const { poster, ...rest } = req.body || {};
        const decoded = decodePosterOption(poster);
        if (!decoded.ok) {
          return res.status(decoded.status).json({ success: false, error: decoded.error, code: decoded.code });
        }
        const game = gameEditor.updateGame(uid, rest, decoded.options);
        res.json({ success: true, game: CatalogIndexer.toPublicGame(game) });
      } catch (err) {
        sendEditError(res, err, 'PUT /api/movies/by-uid/:uid (game)', GameEditor.statusOf);
      }
      return;
    }
    if (!movieEditor) {
      return res.status(503).json({ success: false, error: 'Editor not ready' });
    }
    try {
      const validation = validateInput(req.body || {}, {
        isGame: false, requirePoster: false, allowId: true, requireType: false
      });
      if (!validation.ok) {
        return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
      }
      const { poster, ...rest } = req.body || {};
      const decoded = decodePosterOption(poster);
      if (!decoded.ok) {
        return res.status(decoded.status).json({ success: false, error: decoded.error, code: decoded.code });
      }
      const movie = movieEditor.updateMovie(req.params.uid, rest, decoded.options);
      res.json({ success: true, movie });
    } catch (err) {
      sendEditError(res, err, 'PUT /api/movies/by-uid/:uid');
    }
  });

  // Legacy alias for non-Series clients (lookup by id, then delegate to by-uid)
  app.put('/api/movies/:id', requireAdmin, catalogMutation, (req, res) => {
    if (!movieEditor) {
      return res.status(503).json({ success: false, error: 'Editor not ready' });
    }
    try {
      const existing = indexer.getMovieById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Movie not found' });
      }
      if (existing.type === 'Series') {
        return res.status(400).json({
          success: false,
          error: 'برای ویرایش سریال از مسیر by-uid استفاده کنید'
        });
      }
      const validation = validateInput(req.body || {}, {
        isGame: false, requirePoster: false, allowId: true, requireType: false
      });
      if (!validation.ok) {
        return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
      }
      const uid = existing.uid != null && existing.uid !== '' ? String(existing.uid) : String(existing.id);
      const { poster, ...rest } = req.body || {};
      const decoded = decodePosterOption(poster);
      if (!decoded.ok) {
        return res.status(decoded.status).json({ success: false, error: decoded.error, code: decoded.code });
      }
      const movie = movieEditor.updateMovie(uid, rest, decoded.options);
      res.json({ success: true, movie });
    } catch (err) {
      sendEditError(res, err, 'PUT /api/movies/:id');
    }
  });

  // ── P6b E3: soft delete + trash (D6) ──────────────────────────────────────

  // Soft-delete every copy of a movie/series into Library/.trash/<id>/ (Q5/Q6
  // patterns from P6a: structured codes, Persian messages, admin-only).
  app.delete('/api/movies/by-uid/:uid', requireAdmin, catalogMutation, (req, res) => {
    if (!movieTrash) {
      return res.status(503).json({ success: false, error: 'Trash not ready' });
    }
    try {
      const result = movieTrash.deleteMovie(req.params.uid, req.adminUser);
      res.json({ success: true, ...result });
    } catch (err) {
      sendEditError(res, err, 'DELETE /api/movies/by-uid/:uid');
    }
  });

  // The 20 newest restorable trash entries, newest-first (log stays on disk)
  app.get('/api/trash', requireAdmin, (req, res) => {
    if (!movieTrash) {
      return res.status(503).json({ success: false, error: 'Trash not ready' });
    }
    try {
      res.json({ success: true, entries: movieTrash.list() });
    } catch (err) {
      sendEditError(res, err, 'GET /api/trash');
    }
  });

  // All-or-nothing restore; 409 RESTORE_CONFLICT when any destination is taken
  app.post('/api/trash/:id/restore', requireAdmin, catalogMutation, (req, res) => {
    if (!movieTrash) {
      return res.status(503).json({ success: false, error: 'Trash not ready' });
    }
    try {
      const result = movieTrash.restore(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      sendEditError(res, err, 'POST /api/trash/:id/restore');
    }
  });

  app.post('/api/movies', requireAdmin, catalogMutation, async (req, res) => {
    try {
      if (!movieCreator) {
        return res.status(503).json({ success: false, error: 'Movie Creator not initialized' });
      }

      const validation = validateInput(req.body, { requirePoster: true, allowId: true });
      if (!validation.ok) {
        return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
      }
      const { id, type, title, year, genres, poster } = validation.data;

      // Shared decode (S6 / SEC-06): base64 → 8 MB cap → magic bytes (P6a E1)
      const decoded = decodePosterPayload(poster);
      if (!decoded.ok) {
        return res.status(decoded.status).json({ success: false, error: decoded.error, code: decoded.code });
      }
      const posterBuffer = decoded.buffer;
      const posterExtension = decoded.ext;

      const newMovie = await movieCreator.createMovie(
        { title, type, year, genres, id, imdbRating: req.body.imdbRating, plotSummary: req.body.plotSummary },
        posterBuffer,
        posterExtension
      );

      log(`  [API] Movie created: ${newMovie.id} - ${newMovie.title}`);

      res.json({
        success: true,
        movie: CatalogIndexer.toPublicMovie(newMovie)
      });
    } catch (err) {
      sendCreateError(res, err, 'POST /api/movies');
    }
  });

  // P6c E4 — games create (AC4/AC6): same payload shape as POST /api/movies;
  // DELETE/restore stay on the movie routes and dispatch inside MovieTrash.
  app.post('/api/games', requireAdmin, catalogMutation, async (req, res) => {
    try {
      if (!gameCreator) {
        return res.status(503).json({ success: false, error: 'Game Creator not initialized' });
      }

      const validation = validateInput(req.body, { isGame: true, requirePoster: true, allowId: false });
      if (!validation.ok) {
        return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
      }
      const { title, poster } = validation.data;
      const platforms = req.body.platforms;

      // Shared decode (S6 / SEC-06): base64 → 8 MB cap → magic bytes (P6a E1)
      const decoded = decodePosterPayload(poster);
      if (!decoded.ok) {
        return res.status(decoded.status).json({ success: false, error: decoded.error, code: decoded.code });
      }

      const game = await gameCreator.createGame({ title, platforms }, decoded.buffer, decoded.ext);

      log(`  [API] Game created: ${game.uid}`);

      res.json({
        success: true,
        game: CatalogIndexer.toPublicGame(game)
      });
    } catch (err) {
      sendCreateError(res, err, 'POST /api/games', GameCreator.statusOf);
    }
  });

  // P6c E2 / ARCH-03: exactly the filename the server would write — served by
  // the SAME builder as creator/editor so the add-modal keeps no local copy.
  app.post('/api/movies/preview', requireAdmin, (req, res) => {
    try {
      const validation = validateInput(req.body || {}, {
        isGame: false, requirePoster: false, allowId: true, requireType: true
      });
      if (!validation.ok) {
        return res.status(validation.status).json({ success: false, error: validation.error, code: validation.code });
      }
      const { type, title, year, id, poster } = validation.data;

      let posterExt = null;
      if (poster) {
        try {
          const base64Data = poster.includes(',') ? poster.split(',')[1] : poster;
          const buf = Buffer.from(base64Data, 'base64');
          posterExt = detectImageType(buf);
          if (!posterExt) {
            return res.status(400).json({
              success: false,
              error: 'فرمت تصویر پشتیبانی نمی‌شود (فقط JPEG, PNG, WEBP, AVIF)',
              code: 'IMG_UNSUPPORTED'
            });
          }
        } catch {
          return res.status(400).json({ success: false, error: 'فرمت تصویر نامعتبر است', code: 'IMG_INVALID' });
        }
      }

      const needsId = type === 'Movie' || type === 'Animation' || type === 'Iranian';
      const idStr = id != null ? id : '';
      if (needsId && idStr && !/^\d{1,6}$/.test(idStr)) {
        return res.status(400).json({ success: false, error: `شناسه فیلم نامعتبر است: ${idStr}`, code: 'ID_INVALID' });
      }
      const ext = typeof req.body.extension === 'string' && req.body.extension !== '' ? req.body.extension : (posterExt || 'jpg');
      let filename;
      try {
        filename = type === 'Game'
          ? buildGameFilename(title, ext)
          : buildMovieFilename({
              id: needsId ? (idStr || '0000') : idStr,
              title: title, year, type, extension: ext
            });
      } catch (err) {
        // safeSegment failure — the sanitised title escapes its segment (I10)
        return res.status(400).json({ success: false, error: err.message, code: 'TITLE_INVALID' });
      }
      res.json({ success: true, filename });
    } catch (err) {
      sendCreateError(res, err, 'POST /api/movies/preview');
    }
  });

  app.get('/api/movies/next-id', requireAdmin, (req, res) => {
    try {
      const type = req.query.type;
      if (!type || !MOVIE_TYPES.includes(type)) {
        return res.status(400).json({ success: false, error: 'Invalid type' });
      }

      if (type === 'Series') {
        return res.json({ success: true, nextId: null });
      }

      // Global next-id across all non-Series types (D2 default / B4)
      const nextId = idGenerator.nextId(indexer, type);
      res.json({ success: true, nextId });
    } catch (err) {
      console.error(`  [API] GET /api/movies/next-id error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/games/rescan', requireAdmin, catalogMutation, async (req, res) => {
    log('  [API] Games rescan requested');

    try {
      const { results, stats: gameStats } = await scanGamesAsync(LIBRARY_PATH);
      indexer.replaceGames(results);
      indexer.scheduleSave();
      if (diagnostics) diagnostics.invalidate();

      res.json({
        success: true,
        count: indexer.getGames().length,
        gameStats,
        lastUpdated: new Date().toISOString()
      });
    } catch (err) {
      console.error(`  [API] POST /api/games/rescan error: ${err.message}`);
      // F35/F40: never forward raw OS/JS error text to the client.
      res.status(500).json({ success: false, error: 'خطای پیش آمده است' });
    }
  });

  // ─── Global API error middleware (F35/F40) ────────────────────────────────
  // Catches any unhandled error on /api routes: returns JSON only — no HTML,
  // no stack trace, no raw English message. Raw text is logged server-side.
  app.use((err, req, res, next) => {
    if (!req.path.startsWith('/api/')) return next(err);
    console.error(`  [API] Unhandled error on ${req.method} ${req.path}: ${err.message}`);
    res.status(500).json({ success: false, error: 'خطای پیش آمده است' });
  });

  // ─── Methods ───────────────────────────────────────────────────────────────

  function start() {
    return new Promise((resolve) => {
      initialize();
      httpServer.listen(port, () => {
        const addr = httpServer.address();
        log(`  → Local: http://localhost:${addr.port}`);
        log(`  → WebSocket: ws://localhost:${addr.port}`);
        log('');
        log('  Ready. Add movies to Library/ and refresh the browser.');
        log('');
        // G6 — the port answers from the cache; the scan swaps in behind it
        reconcileLibrary();
        resolve({ port: addr.port });
      });
    });
  }

  function stop() {
    if (stopping) return Promise.resolve();
    stopping = true;
    // Unchecked probe (e.g. stop() before/without a reconcile) — freeze it
    if (probe.running) finishProbe(null);
    // Unblock any await on whenReconciled() even if the scan never finishes
    if (resolveReconciled) {
      resolveReconciled();
      resolveReconciled = null;
    }
    return new Promise((resolve) => {
      if (wsServer) wsServer.close();
      if (watcher) watcher.stop();
      stopAuthCleanup();
      // A6 — flush all durable stores before closing
      try { indexer.flush(); } catch (err) { console.error(`  [SHUTDOWN] indexer flush: ${err.message}`); }
      try { metadataStore.flush(); } catch (err) { console.error(`  [SHUTDOWN] metadata flush: ${err.message}`); }
      try { moviesPayload.dispose(); } catch (err) { console.error(`  [SHUTDOWN] movies payload: ${err.message}`); }
      try { gamesPayload.dispose(); } catch (err) { console.error(`  [SHUTDOWN] games payload: ${err.message}`); }
      // P6d E5 — cancel pending order-undo purge timers
      try { orderManager.dispose(); } catch (err) { console.error(`  [SHUTDOWN] orders dispose: ${err.message}`); }
      httpServer.close(() => {
        resolve();
      });
      // Force-resolve if close hangs on keep-alive connections
      setTimeout(resolve, 2000).unref();
    });
  }

  /** Resolves when the startup reconcile has settled (success, failure or stop). */
  function whenReconciled() {
    return reconcileSettled;
  }

  /**
   * P8c follow-up: frozen in-server lag probe result + reconcile phase wall
   * times (nulls until the reconcile settles). Tests and the bench read this.
   */
  function getStartupProbe() {
    return { lag: probe.result, phases: reconcilePhases };
  }

  return {
    app,
    httpServer,
    indexer,
    orderManager,
    metadataStore,
    get wsServer() { return wsServer; },
    get diagnostics() { return diagnostics; },
    get movieCreator() { return movieCreator; },
    get movieEditor() { return movieEditor; },
    get movieTrash() { return movieTrash; },
    get watcher() { return watcher; },
    start,
    stop,
    whenReconciled,
    getStartupProbe
  };
}

module.exports = { createServer, POSTER_BODY_ROUTES, routeCarriesPosterBody };

// ─── Auto-start when run directly ──────────────────────────────────────────

if (require.main === module) {
  // P8a G2/G3 — config precedence (env > config.json > defaults), file
  // logging under logs/, fatal handlers and the Stop.bat stop-file watch.
  const { resolveConfig, formatConfigMessages, CONFIG_ERROR_EXIT_CODE } = require('./server/config');
  const { armStopWatch } = require('./server/stop-file');

  const cfg = resolveConfig();
  logger.init({ dir: path.join(__dirname, 'logs') });
  for (const line of formatConfigMessages(cfg.messages)) console.log(line);

  if (cfg.hasFatal) {
    logger.error(`fatal config errors — server not started (exit ${CONFIG_ERROR_EXIT_CODE})`);
    console.log('');
    console.log('  The server will NOT start: config.json has errors (see above).');
    console.log('  سرور اجرا نمی‌شود: فایل config.json اشکال دارد (توضیحات بالا را ببینید).');
    console.log('  Fix or delete config.json, then start again.');
    console.log('  config.json را درست کنید یا حذف کنید، بعد دوباره Start.bat را اجرا کنید.');
    console.log('');
    process.exit(CONFIG_ERROR_EXIT_CODE);
  }

  const server = createServer({
    port: cfg.port,
    libraryPath: cfg.libraryPath,
    dataDir: cfg.dataDir
  });

  // Fatal handlers (server/logger.js): stack into the file log, short
  // bilingual line on the console, exit 1 (supervisor may restart).
  logger.installFatalHandlers({ onExit: (code) => process.exit(code) });

  // Stop.bat writes logs/stop.request; a stale file from a previous run
  // is removed at arm time so the fresh server is not instantly stopped
  // (see server/stop-file.js for why that is safe).
  armStopWatch({
    stopFile: path.join(__dirname, 'logs', 'stop.request'),
    onStopped: () => {
      console.log('\n  [SERVER] Stop request (Stop.bat) — shutting down... / درخواست توقف — سرور بسته می‌شود...');
      logger.info('stop request received (stop.request)');
      server.stop().then(() => process.exit(0)).catch(() => process.exit(1));
    }
  });

  logger.info(`starting v${APP_VERSION} port=${cfg.port} library=${cfg.libraryPath} data=${cfg.dataDir}`);
  server.start().then(({ port }) => {
    logger.info(`listening on port ${port}`);
  });

  let shutdownCount = 0;
  function onSignal(signal) {
    shutdownCount += 1;
    if (shutdownCount > 1) {
      console.log(`\n  [SERVER] Second ${signal} — forcing exit`);
      logger.warn(`second ${signal} — forcing exit`);
      process.exit(1);
    }
    console.log('\n  [SERVER] Shutting down...');
    logger.info(`graceful shutdown (${signal})`);
    server.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  }

  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
}
