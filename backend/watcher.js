/**
 * Filesystem Watcher Module
 *
 * Monitors the Library directory using native fs.watch (manual recursion).
 *
 * B6 — order-independent reconcile:
 *   any fs event → mark affected directory dirty → debounce 500 ms →
 *   reconcile(dir): list poster files under dir (recursive), diff against
 *   _fileIndex entries under that prefix, apply adds/updates/removals
 *   idempotently. A movie is removed only when no file with its key remains.
 *
 * Because a rename emits {remove, add} in either order and both land in the
 * same debounced reconcile of the *final* disk state, event order cannot
 * change the outcome (AC2).
 */

const fs = require('fs');
const path = require('path');
const { scanFile, scanGames, walkDir, walkDirAsync } = require('./scanner');

const DEBOUNCE_MS = 500;
const DEFAULT_EXPECT_TTL_MS = 3000;
const REPLAY_ADD_CHUNK = 512; // scan+apply ops per yield during hold replay
const REPLAY_INDEX_CHUNK = 8192; // fileIndex rows per yield during hold replay

function yieldToLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

class LibraryWatcher {
  /**
   * @param {string} libraryPath - Absolute path to the Library root
   * @param {object} indexer - CatalogIndexer instance
   * @param {function} onChange - Called as onChange({added, updated, removed})
   *   after a reconcile that changed the index (B6 / DATA-02).
   */
  constructor(libraryPath, indexer, onChange) {
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._onChange = onChange;
    this._watchers = new Map(); // dirPath → fs.FSWatcher
    this._debounceTimers = new Map(); // dirtyDir → timeout
    this._dirtyDirs = new Set(); // dirs waiting for reconcile
    this._expected = new Map(); // absolute path → expiresAt (ms)
    this._isRunning = false;
    this._pollTimer = null;
    this._held = false; // reconcile hold during the startup scan (G6)
    this._heldDirs = new Set(); // dirs dirtied while held — replayed on release
  }

  /**
   * Start watching the library directory recursively.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    console.log('  [WATCHER] Starting filesystem watcher...');

    if (!fs.existsSync(this._libraryPath)) {
      console.warn(`  [WATCHER] Library folder not found: ${this._libraryPath}`);
      return;
    }

    this._watchRecursive(this._libraryPath);
    console.log(`  [WATCHER] Watching ${this._watchers.size} directories`);

    // Optional safety net for network drives (default off — B6)
    const pollSec = parseInt(process.env.LIBRARY_POLL_SEC || '0', 10);
    if (pollSec > 0) {
      this._pollTimer = setInterval(() => {
        if (this._isRunning) this._reconcile(this._libraryPath);
      }, pollSec * 1000);
      if (this._pollTimer.unref) this._pollTimer.unref();
      console.log(`  [WATCHER] Poll safety net every ${pollSec}s (LIBRARY_POLL_SEC)`);
    }
  }

  /**
   * Stop all watchers and pending timers.
   */
  stop() {
    this._isRunning = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    for (const [, watcher] of this._watchers) {
      try { watcher.close(); } catch {}
    }
    this._watchers.clear();
    this._debounceTimers.forEach(timer => clearTimeout(timer));
    this._debounceTimers.clear();
    this._dirtyDirs.clear();
    this._expected.clear();
    this._heldDirs.clear();
    console.log('  [WATCHER] Stopped');
  }

  /**
   * Hold reconciles while the startup scan performs its atomic swap (G6).
   * fs events keep arriving; _markDirty/_reconcile record the directory
   * into _heldDirs instead of mutating an index that is about to be replaced.
   */
  holdReconcile() {
    this._held = true;
  }

  /**
   * Release the hold: replay every recorded directory against the fresh
   * index (one idempotent B6 reconcile per batch — no debounce, so
   * whenReconciled() means "index matches disk plus every held event").
   *
   * P8c follow-up: batched + chunked. The old per-dir loop re-walked the
   * whole file index once per held directory (O(dirs × index) ≈ 26 s on a
   * cold 20k library where every directory had been dirtied). Now: dedupe
   * the held dirs under their ancestors, ONE walk of the surviving roots,
   * ONE pass over the file index for removals, one genre sort, one emit —
   * with event-loop yields between chunks. Await the returned promise.
   *
   * @returns {Promise<{added:number, updated:number, removed:number}>}
   */
  async releaseHold() {
    if (!this._held) return { added: 0, updated: 0, removed: 0 };
    this._held = false;
    const held = [...this._heldDirs];
    this._heldDirs.clear();
    if (!this._isRunning || held.length === 0) {
      return { added: 0, updated: 0, removed: 0 };
    }

    // Clear pending dirty/debounce state for the held dirs (they replay now)
    // and drop dirs contained in another held dir (one walk covers children).
    const sorted = held.slice().sort();
    const roots = [];
    for (const dir of sorted) {
      this._dirtyDirs.delete(dir);
      const timer = this._debounceTimers.get(dir);
      if (timer) {
        clearTimeout(timer);
        this._debounceTimers.delete(dir);
      }
      const last = roots.length ? roots[roots.length - 1] : null;
      if (last && (dir === last || dir.startsWith(last + path.sep))) continue;
      roots.push(dir);
    }

    // Games changes → games pipeline (never the movie index, DATA-04)
    const movieRoots = [];
    let gamesRoots = 0;
    for (const root of roots) {
      if (this._isGamesPath(root)) {
        gamesRoots++;
        if (fs.existsSync(root)) this._watchRecursive(root);
      } else {
        movieRoots.push(root);
      }
    }
    if (gamesRoots > 0) this._reconcileGames();

    if (held.length > 1) {
      console.log(`  [WATCHER] Releasing hold: ${held.length} held dir(s) → ${roots.length} root(s)`);
    }
    if (movieRoots.length === 0) return { added: 0, updated: 0, removed: 0 };
    return this._reconcileBatch(movieRoots);
  }

  /**
   * Chunked batch reconcile of several roots (hold replay only): one walk
   * of every root, adds/updates applied in chunks, ONE pass over the whole
   * file index for removals under any root, one genre sort, one emit.
   * @param {string[]} roots - Absolute directory paths (movies pipeline)
   * @returns {Promise<{added:number, updated:number, removed:number}>}
   */
  async _reconcileBatch(roots) {
    const stats = { added: 0, updated: 0, removed: 0 };
    const diskFiles = new Set();
    const invalidOnDisk = new Set(); // present on disk but not a valid poster
    const activeRoots = [];
    const goneRoots = [];

    for (const root of roots) {
      if (this._isIgnoredPath(root)) continue;
      if (!fs.existsSync(root)) {
        goneRoots.push(root);
        continue;
      }
      activeRoots.push(root);
      // New/unknown directories: start watching (no-op for already-watched)
      this._watchRecursive(root);
      // libraryRoot is null — Games/dot-folder filtering happens per-path
      // below, exactly as in _reconcileTree.
      const walk = await walkDirAsync(root, null);
      const imgs = walk.imageFiles;
      for (let i = 0; i < imgs.length; i++) {
        // Chunk the consumption too: classifying 19k paths
        // (isGamesPath + isIgnoredPath + resolve) was one ~230 ms block.
        if (i > 0 && i % REPLAY_ADD_CHUNK === 0) await yieldToLoop();
        const img = imgs[i];
        if (this._isGamesPath(img.fullPath)) continue;
        if (this._isIgnoredPath(img.fullPath)) continue;
        diskFiles.add(path.resolve(img.fullPath));
      }
    }
    for (const root of goneRoots) {
      this._dropWatchersUnder(root);
    }

    // ---- Phase 1: adds + updates (disk → index, chunked) ----
    // The yield sits at the TOP of the loop: unchanged files (the whole
    // library on a quiet replay) must yield too — counting only applied
    // changes made the full scan one ~1.8 s synchronous chunk (P8c bench).
    let n = 0;
    for (const absPath of diskFiles) {
      if (++n % REPLAY_ADD_CHUNK === 0) await yieldToLoop();
      if (this._isExpected(absPath)) continue;

      const scan = scanFile(absPath, this._libraryPath);
      if (!scan.ok) {
        invalidOnDisk.add(absPath); // kept for the removal pass below
        continue; // not a valid poster filename — not in index (or removed if previously indexed)
      }

      const existing = this._indexer._fileIndex.get(absPath);
      if (existing && existing.lastModified === scan.entry.lastModified) {
        continue; // unchanged
      }

      this._indexer.updateFile(scan.entry);
      if (existing) {
        stats.updated++;
        console.log(`  [WATCHER] Updated: ${path.basename(absPath)}`);
      } else {
        stats.added++;
        console.log(`  [WATCHER] Added: ${path.basename(absPath)}`);
      }
    }

    // ---- Phase 2: removals — ONE pass over the whole file index ----
    const prefixes = activeRoots.concat(goneRoots).map((r) => path.resolve(r));
    const toRemove = [];
    n = 0;
    for (const filePath of this._indexer._fileIndex.keys()) {
      if (++n % REPLAY_INDEX_CHUNK === 0) await yieldToLoop();
      const resolved = path.resolve(filePath);
      let under = false;
      for (const p of prefixes) {
        if (resolved === p || resolved.startsWith(p + path.sep)) {
          under = true;
          break;
        }
      }
      if (!under) continue;
      if (this._isExpected(resolved)) continue;
      if (diskFiles.has(resolved)) {
        // Present but failed scanFile above → was valid before → drop it
        if (!invalidOnDisk.has(resolved)) continue;
        toRemove.push(filePath);
        continue;
      }
      toRemove.push(filePath); // gone from disk under these prefixes
    }

    for (const filePath of toRemove) {
      const result = this._indexer.removeFile(filePath);
      if (result) {
        stats.removed++;
        console.log(`  [WATCHER] Removed: ${path.basename(filePath)} (${result.action})`);
      }
    }

    if (stats.added || stats.updated || stats.removed) {
      // Re-sort genres after merges (once for the whole batch)
      for (const movie of this._indexer._movieMap.values()) {
        if (movie.genres) movie.genres.sort();
      }
      const label = activeRoots.length + goneRoots.length === 1
        ? (path.relative(this._libraryPath, prefixes[0]) || '.')
        : `${roots.length} roots`;
      console.log(`  [WATCHER] Reconcile ${label}: +${stats.added} ~${stats.updated} -${stats.removed}`);
      this._emit(stats);
    }
    return stats;
  }

  /**
   * Suppress watcher events for these absolute paths for ttlMs (B6).
   * Server-initiated renames/creates (B7/B8) call this so their own
   * fs events do not fight the in-memory update (belt and braces).
   *
   * @param {string[]} paths - Absolute file/directory paths
   * @param {number} [ttlMs=3000]
   */
  expect(paths, ttlMs = DEFAULT_EXPECT_TTL_MS) {
    if (!paths) return;
    const list = Array.isArray(paths) ? paths : [paths];
    const expires = Date.now() + ttlMs;
    for (const p of list) {
      if (!p) continue;
      this._expected.set(path.resolve(String(p)), expires);
    }
  }

  /**
   * True for paths under a root-level dot-folder (`.trash`, scanner parity —
   * walkDir only skips dot-folders at the Library root, and the watcher calls
   * it with libraryRoot=null, so the filter must live here too, I10).
   * The Library root itself (rel === '') is never ignored.
   */
  _isIgnoredPath(p) {
    const rel = path.relative(this._libraryPath, path.resolve(p));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const top = rel.split(path.sep)[0] || '';
    return top.startsWith('.');
  }

  /**
   * Recursively watch a directory and all its subdirectories.
   */
  _watchRecursive(dirPath) {
    if (this._watchers.has(dirPath)) return;
    if (this._isIgnoredPath(dirPath)) return;

    try {
      const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
        this._handleEvent(dirPath, eventType, filename);
      });

      watcher.on('error', (err) => {
        console.error(`  [WATCHER] Error watching ${dirPath}: ${err.message}`);
        const current = this._watchers.get(dirPath);
        if (current === watcher) this._watchers.delete(dirPath);
      });

      this._watchers.set(dirPath, watcher);

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this._watchRecursive(path.join(dirPath, entry.name));
        }
      }
    } catch (err) {
      console.error(`  [WATCHER] Cannot watch ${dirPath}: ${err.message}`);
    }
  }

  /** Drop watchers for dir and every watched path under it. */
  _dropWatchersUnder(prefix) {
    const base = path.resolve(prefix);
    for (const [dirPath, watcher] of [...this._watchers]) {
      const resolved = path.resolve(dirPath);
      if (resolved === base || resolved.startsWith(base + path.sep)) {
        try { watcher.close(); } catch {}
        this._watchers.delete(dirPath);
      }
    }
  }

  /** True if this absolute path is currently expected (server-initiated). */
  _isExpected(fullPath) {
    if (this._expected.size === 0) return false;
    const resolved = path.resolve(fullPath);
    const now = Date.now();
    let hit = false;
    for (const [p, expires] of this._expected) {
      if (expires <= now) {
        this._expected.delete(p);
        continue;
      }
      if (p === resolved || resolved.startsWith(p + path.sep)) {
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Handle a filesystem event: mark the affected directory dirty + debounce.
   *
   * A deleted *file* only dirties its parent (one reconcile does add+remove).
   * A deleted *directory* also dirties that path so watchers/index entries
   * under the prefix are cleaned up. Dirtying a bare file path as if it were
   * a directory would race the parent reconcile and break order-independence.
   */
  _handleEvent(dirPath, eventType, filename) {
    if (!this._isRunning) return;
    if (this._isIgnoredPath(dirPath)) return;
    if (filename == null || filename === '') {
      this._markDirty(dirPath);
      return;
    }

    const fullPath = path.join(dirPath, filename);
    if (this._isIgnoredPath(fullPath)) return;
    if (this._isExpected(fullPath)) return;

    let exists = false;
    let isDir = false;
    try {
      exists = fs.existsSync(fullPath);
      isDir = exists && fs.statSync(fullPath).isDirectory();
    } catch { /* treat as missing */ }

    if (isDir) {
      // New/renamed directory: watch + reconcile it; parent listing changed too
      this._markDirty(fullPath);
      this._markDirty(dirPath);
      return;
    }

    if (!exists) {
      // Deleted path — directory if we (still) watch it or anything under it
      const base = path.resolve(fullPath);
      let wasWatchedDir = this._watchers.has(base);
      if (!wasWatchedDir) {
        for (const watched of this._watchers.keys()) {
          if (path.resolve(watched).startsWith(base + path.sep)) {
            wasWatchedDir = true;
            break;
          }
        }
      }
      if (wasWatchedDir) {
        this._dropWatchersUnder(base);
        this._markDirty(base);
      }
      // File delete/rename: parent reconcile alone is sufficient (and ordered)
      this._markDirty(dirPath);
      return;
    }

    // File create/modify in an already-watched directory
    this._markDirty(dirPath);
    // Ensure the containing tree is watched (new nested dirs without their own event)
    if (!this._watchers.has(dirPath)) {
      this._watchRecursive(dirPath);
    }
  }

  /** Mark a directory dirty and (re)start its 500 ms debounce. */
  _markDirty(dirPath) {
    if (!dirPath) return;
    const key = path.resolve(dirPath);
    if (this._held) {
      // G6 — record only; releaseHold() replays against the swapped index
      this._heldDirs.add(key);
      return;
    }
    this._dirtyDirs.add(key);

    const existing = this._debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this._debounceTimers.set(key, setTimeout(() => {
      this._debounceTimers.delete(key);
      this._dirtyDirs.delete(key);
      this._reconcile(key);
    }, DEBOUNCE_MS));
  }

  /**
   * Reconcile one directory against the file index (idempotent, order-free).
   * @param {string} dir - Absolute directory path (may no longer exist)
   * @returns {{added:number, updated:number, removed:number}}
   */
  _reconcile(dir) {
    if (!this._isRunning) return { added: 0, updated: 0, removed: 0 };
    if (this._held) {
      // G6 — a debounce timer started before the hold may fire mid-scan:
      // record instead of reconciling against an index about to be replaced
      this._heldDirs.add(path.resolve(dir));
      return { added: 0, updated: 0, removed: 0 };
    }
    if (this._isIgnoredPath(dir)) return { added: 0, updated: 0, removed: 0 };

    try {
      // Games changes → games pipeline (never the movie index, DATA-04).
      // Still watch the dir tree: a Games folder created AFTER start never
      // got _watchRecursive from _reconcileTree, so later overwrites inside
      // it would fire no events (P8b follow-up: same-name game overwrite).
      if (this._isGamesPath(dir)) {
        if (fs.existsSync(dir)) {
          this._watchRecursive(dir);
        }
        return this._reconcileGames();
      }

      if (!fs.existsSync(dir)) {
        return this._reconcileDeletedDir(dir);
      }

      // New/unknown directories: start watching (includes nested new subdirs)
      this._watchRecursive(dir);

      return this._reconcileTree(dir);
    } catch (err) {
      console.error(`  [WATCHER] Error reconciling ${dir}: ${err.message}`);
      return { added: 0, updated: 0, removed: 0 };
    }
  }

  _isGamesPath(p) {
    const rel = path.relative(this._libraryPath, path.resolve(p));
    if (rel.startsWith('..')) return false;
    const top = rel.split(path.sep)[0] || '';
    return top.toLowerCase() === 'games';
  }

  /** Directory (or ancestor) vanished: drop watchers + all index entries by prefix. */
  _reconcileDeletedDir(dir) {
    const base = path.resolve(dir);
    this._dropWatchersUnder(base);

    const stats = { added: 0, updated: 0, removed: 0 };
    const toRemove = [];
    for (const filePath of this._indexer._fileIndex.keys()) {
      const resolved = path.resolve(filePath);
      if (resolved === base || resolved.startsWith(base + path.sep)) {
        toRemove.push(filePath);
      }
    }
    for (const filePath of toRemove) {
      const result = this._indexer.removeFile(filePath);
      if (result && result.action === 'removed') {
        console.log(`  [WATCHER] Removed: ${path.basename(filePath)} (${result.action})`);
        stats.removed++;
      } else if (result) {
        stats.removed++; // file entry gone; movie kept (other copies remain)
      }
    }

    if (stats.added || stats.updated || stats.removed) {
      console.log(`  [WATCHER] Reconcile (deleted ${path.basename(base)}): +${stats.added} ~${stats.updated} -${stats.removed}`);
      this._emit(stats);
    }
    return stats;
  }

  /**
   * Diff files on disk under `dir` against _fileIndex under the same prefix.
   * Adds/updates are applied before removals so a same-key rename in one
   * pass never drops the movie (metadata intact — AC2 / DATA-01 watcher side).
   */
  _reconcileTree(dir) {
    const base = path.resolve(dir);
    const stats = { added: 0, updated: 0, removed: 0 };

    // Recursively list poster images under the dirty directory.
    // libraryRoot is null so walkDir does not re-apply root-level Games/ skips
    // (those are filtered per-path below via _isGamesPath).
    const walk = walkDir(base, null);

    const diskFiles = new Set();
    for (const img of walk.imageFiles) {
      if (this._isGamesPath(img.fullPath)) continue;
      if (this._isIgnoredPath(img.fullPath)) continue; // .trash and friends
      diskFiles.add(path.resolve(img.fullPath));
    }

    // ---- Phase 1: adds + updates (disk → index) ----
    for (const absPath of [...diskFiles]) {
      if (this._isExpected(absPath)) continue;

      const scan = scanFile(absPath, this._libraryPath);
      if (!scan.ok) continue; // not a valid poster filename — not in index (or removed below if previously indexed)

      const existing = this._indexer._fileIndex.get(absPath);
      if (existing && existing.lastModified === scan.entry.lastModified) {
        continue; // unchanged
      }

      this._indexer.updateFile(scan.entry);
      if (existing) {
        stats.updated++;
        console.log(`  [WATCHER] Updated: ${path.basename(absPath)}`);
      } else {
        stats.added++;
        console.log(`  [WATCHER] Added: ${path.basename(absPath)}`);
      }
    }

    // ---- Phase 2: removals (index under prefix missing or no longer valid on disk) ----
    const toRemove = [];
    for (const filePath of this._indexer._fileIndex.keys()) {
      const resolved = path.resolve(filePath);
      const underPrefix = resolved === base || resolved.startsWith(base + path.sep);
      if (!underPrefix) continue;
      if (this._isExpected(resolved)) continue;
      if (diskFiles.has(resolved)) {
        // Present but failed scanFile above (!ok) → was valid before → drop it
        const scan = scanFile(resolved, this._libraryPath);
        if (scan.ok) continue;
        toRemove.push(filePath);
        continue;
      }
      toRemove.push(filePath); // gone from disk under this prefix
    }

    for (const filePath of toRemove) {
      const result = this._indexer.removeFile(filePath);
      if (result) {
        stats.removed++;
        console.log(`  [WATCHER] Removed: ${path.basename(filePath)} (${result.action})`);
      }
    }

    // Re-sort genres after merges
    for (const movie of this._indexer._movieMap.values()) {
      if (movie.genres) movie.genres.sort();
    }

    if (stats.added || stats.updated || stats.removed) {
      const rel = path.relative(this._libraryPath, base) || '.';
      console.log(`  [WATCHER] Reconcile ${rel}: +${stats.added} ~${stats.updated} -${stats.removed}`);
      this._emit(stats);
    }
    return stats;
  }

  /**
   * Games pipeline: full scanGames diff (games are few; PS4/PS5 merge by title).
   * Uses indexer.replaceGames() to build the map aside from disk and swap it in
   * with one synchronous step — so a dropped platform poster or a deleted game
   * is removed from the index, not just added (F31 / I1 for games).
   */
  _reconcileGames() {
    const { results } = scanGames(this._libraryPath);

    // Snapshot before for stats (added / updated / removed).
    const before = new Map();
    for (const [key, game] of this._indexer._gamesMap) {
      before.set(key, {
        platforms: [...game.platforms],
        path: game.absolutePosterPath,
        mtime: game.mtime,
        title: game.title
      });
    }

    // Replace wholesale from disk — dropped platforms and deleted games are
    // naturally absent from the new map. replaceGames() calls _notifyChange()
    // so the cached /api/games payload is refreshed at the indexer source.
    this._indexer.replaceGames(results);

    const after = new Map();
    for (const [key, game] of this._indexer._gamesMap) {
      after.set(key, {
        platforms: [...game.platforms],
        path: game.absolutePosterPath,
        mtime: game.mtime,
        title: game.title
      });
    }

    let added = 0, updated = 0, removed = 0;
    for (const [key, game] of after) {
      if (!before.has(key)) {
        added++;
      } else {
        const b = before.get(key);
        const changed = JSON.stringify({
          p: game.platforms, path: game.absolutePosterPath, mtime: game.mtime
        }) !== JSON.stringify({
          p: b.platforms, path: b.path, mtime: b.mtime
        });
        if (changed) updated++;
      }
    }
    for (const key of before.keys()) {
      if (!after.has(key)) removed++;
    }

    if (added || updated || removed) {
      console.log(`  [WATCHER] Reconcile Games: +${added} ~${updated} -${removed}`);
      this._emit({ added, updated, removed });
    }
    return { added, updated, removed, total: after.size };
  }

  _emit(stats) {
    if (typeof this._onChange !== 'function') return;
    try {
      this._onChange({
        added: stats.added | 0,
        updated: stats.updated | 0,
        removed: stats.removed | 0
      });
    } catch (err) {
      console.error(`  [WATCHER] onChange error: ${err.message}`);
    }
  }
}

module.exports = LibraryWatcher;
