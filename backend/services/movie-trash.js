'use strict';

/**
 * Soft-delete + restore service (P6b E3 — D6 owner decision).
 *
 * deleteMovie(uid, deletedBy):
 *   1. `game:` uids soft-delete GAMES (P6c E4, owner-approved generalization):
 *      every platform copy under Games/{PS4,PS5} matching the title is
 *      collected, the entry records type 'Game', the index drops the game via
 *      removeGame. Unknown or empty uid → 404 NOT_FOUND. Structured codes
 *      (Q6) drive the client; the Persian message is what gets displayed.
 *   2. Collects every _fileIndex path for the movie's key (all genre copies, I7);
 *      only files that still exist on disk are moved; none exist → 404.
 *   3. Trash id = unique numeric string (Date.now() + sequence) — folder name
 *      and restore route param. Numeric-only keeps the restore route's
 *      traversal validation to `^\d+$` + resolveInside (I10).
 *   4. Manifest `Library/.trash/manifest.json` = {version, entries[]},
 *      newest-first (unshift). Corrupt/unreadable JSON → 500
 *      TRASH_MANIFEST_ERROR and the delete is REFUSED before any mutation —
 *      the log is the restore contract, never appended blindly.
 *   5. Plan → execute: every copy renames into `.trash/<id>/<relative path>`
 *      (relative paths stored with '/' separators). watcher.expect covers
 *      every source and target up front. One undo stack: any caught exception
 *      rolls every completed move back in reverse and removes the empty trash
 *      folder → 500 DELETE_FAILED with disk, index and manifest untouched.
 *      A hard kill (not a caught exception) between a move and the manifest
 *      write can leave an orphaned trash folder that is not restorable through
 *      the API — that is visible in the log on inspection and never silent
 *      catalog corruption: I1 (filesystem as truth) self-heals on the next scan
 *      because the scanner ignores root dot-folders.
 *   6. Commit: index entries removed (a movie drops only when its last copy
 *      is gone; a game drops via removeGame), manifest written atomically,
 *      scheduleSave + diagnostics invalidate, `catalog:changed {removed}`
 *      broadcast. The metadata store is NEVER touched — rating/plot survive
 *      the round-trip.
 *   7. Purge window (owner decision): log entries live forever, but deletion
 *      folders beyond the 20 newest entries are purged from disk (entry keeps
 *      `purgedAt`). Runs best-effort AFTER the commit — a failed purge leaves
 *      the entry active and is retried on the next delete (rmSync is
 *      idempotent with force), so disk usage stays bounded without ever
 *      losing history.
 *
 * restore(id):
 *   1. id must match `^\d+$` and resolve strictly inside .trash (400 VALIDATION).
 *   2. Entry missing → 404 TRASH_NOT_FOUND; purgedAt set → 404 TRASH_PURGED;
 *      source files gone (orphaned entry) → 404 TRASH_NOT_FOUND.
 *   3. PRE-CHECK every original path: any destination occupied → 409
 *      RESTORE_CONFLICT before a single file moves — all-or-nothing, nothing
 *      is ever silently overwritten.
 *   4. Moves run with the same undo-stack discipline → 500 RESTORE_FAILED.
 *   5. Commit: for movies each restored file re-enters the index through the
 *      shared scanFile pipeline (genre copies re-union; manager metadata
 *      re-attached from the metadata store); for games (type 'Game', P6c E4)
 *      the game re-enters via removeGame + processGameResults(scanGames()).
 *      Manifest entry dropped atomically, empty trash folder removed,
 *      `catalog:changed {added}` broadcast.
 *
 * list(): the 20 newest restorable entries, newest-first. Purged entries are
 * excluded — the permanent log lives only in manifest.json on disk.
 */

const fs = require('fs');
const path = require('path');
const { scanFile, scanGames } = require('../scanner');
const { parseGameFilename } = require('../parser');
const CatalogIndexer = require('../indexer');
const { resolveInside } = require('../utils/safe-path');
const { writeJsonAtomic } = require('../storage/atomic-json');
const { gameKey } = require('../utils/game-key');

const TRASH_DIR = '.trash';
const MANIFEST_NAME = 'manifest.json';
const MANIFEST_VERSION = 1;
const TRASH_WINDOW = 20;
const TRASH_ID_RE = /^\d+$/;

function fail(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function statusOf(err) {
  if (err && typeof err.status === 'number') return err.status;
  if (err && (err.code === 'TRASH_NOT_FOUND' || err.code === 'TRASH_PURGED')) return 404;
  if (err && err.code === 'RESTORE_CONFLICT') return 409;
  return 500;
}

class MovieTrash {
  /**
   * @param {object} deps
   * @param {string} deps.libraryPath
   * @param {object} deps.indexer
   * @param {object|null} [deps.watcher]
   * @param {object|null} [deps.diagnostics] - invalidate after mutation (BUG-2 parity)
   * @param {object|null} [deps.wsServer]
   * @param {Function} [deps.log]
   * @param {Function} [deps.renameSync] - injectable for rollback tests
   */
  constructor({
    libraryPath, indexer, watcher = null, diagnostics = null,
    wsServer = null, log = null, renameSync = null
  } = {}) {
    if (!libraryPath) throw new Error('libraryPath is required');
    if (!indexer) throw new Error('indexer is required');
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._watcher = watcher;
    this._diagnostics = diagnostics;
    this._wsServer = wsServer;
    this._log = log || (() => {});
    this._rename = renameSync || fs.renameSync;
    this._trashRoot = path.join(libraryPath, TRASH_DIR);
    this._idSeq = 0;
  }

  // ─── delete ───────────────────────────────────────────────────────────────

  /**
   * Soft-delete every copy of a movie/series/game into .trash/<id>/ (D6, E4).
   * @param {string} uid - bare id, `series:<title>` or `game:<title>` (Express-decoded)
   * @param {string} [deletedBy] - logged-in session user
   * @returns {{id:string, uid:string, title:string, moved:number}}
   * @throws Error with .status / .code for the route layer
   */
  deleteMovie(uid, deletedBy) {
    const key = uid == null ? '' : String(uid);
    if (key === '') throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    const item = this._indexer.getByUid(key);
    if (!item) throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    // P6c E4: `game:` uids (and any Game-typed entry) take the game path —
    // Games/ has no _fileIndex, so sources come from a directory listing.
    const isGame = key.startsWith('game:') || item.type === 'Game';
    const sources = isGame
      ? this._collectGameSources(item)
      : this._collectSources(item, CatalogIndexer.getKey(item));
    if (sources.length === 0) throw fail('NOT_FOUND', 404, 'فایل یافت نشد');

    // The manifest is the restore contract — refuse to touch disk without it.
    const manifestFile = path.join(this._trashRoot, MANIFEST_NAME);
    const manifestExisted = fs.existsSync(manifestFile);
    const prevManifest = this._readManifest();
    const id = this._nextTrashId(prevManifest);

    const moves = sources.map((from) => {
      const rel = this._relativeToLibrary(from);
      return { from, rel, to: path.join(this._trashRoot, id, ...rel.split('/')) };
    });

    // watcher.expect covers every path this delete will change (BUG-2/P3d parity)
    if (this._watcher && typeof this._watcher.expect === 'function') {
      this._watcher.expect([...sources, ...moves.map(m => m.to)]);
    }

    const entry = {
      id,
      uid: key,
      title: item.title,
      type: item.type,
      originalPaths: moves.map(m => m.rel),
      deletedBy: deletedBy == null || deletedBy === '' ? 'admin' : String(deletedBy),
      deletedAt: new Date().toISOString()
    };
    const nextManifest = { version: prevManifest.version, entries: [entry, ...prevManifest.entries] };

    // ── Execute: one undo stack, reverse order on any caught exception ────
    const undo = [];
    // Intent recorded before the write; a rolled-back first delete must not
    // leave a brand-new manifest file behind.
    undo.push(() => {
      if (manifestExisted) this._writeManifest(prevManifest);
      else {
        try { fs.rmSync(manifestFile, { force: true }); } catch { /* nothing there */ }
      }
    });
    let phase = 'move';
    try {
      for (const m of moves) {
        fs.mkdirSync(path.dirname(m.to), { recursive: true });
        const madeDirs = path.dirname(m.to);
        undo.push(() => this._removeEmptyDirs(madeDirs));
        this._rename(m.from, m.to);
        undo.push(() => this._rename(m.to, m.from));
      }
      phase = 'manifest';
      this._writeManifest(nextManifest);
    } catch (err) {
      for (const fn of undo.reverse()) {
        try { fn(); } catch (e) {
          this._log(`  [TRASH] rollback failed: ${e.message}`);
        }
      }
      this._removeEmptyDirs(path.join(this._trashRoot, id));
      if (err && err.code && err.status) throw err; // already a fail() error (manifest read)
      if (phase === 'manifest') throw fail('TRASH_MANIFEST_ERROR', 500, 'خطا در نوشتن سطل زباله');
      const e = fail('DELETE_FAILED', 500, `حذف فیلم ناموفق بود: ${err.message}`);
      e.cause = err;
      throw e;
    }

    // ── Commit: index lockstep ─────────────────────────────────────────────
    if (isGame) {
      // Games never live in catalog.json — only the in-memory map changes (I1).
      this._indexer.removeGame(item.title);
      // Source-level invalidation (F3): tell the indexer directly so the cached
      // /api/games payload is refreshed even when called without HTTP.
      this._indexer.notifyChanged();
    } else {
      // A movie drops only when its last copy is gone.
      for (const m of moves) this._indexer.removeFile(m.from);
      this._indexer.scheduleSave();
    }

    if (this._diagnostics && typeof this._diagnostics.invalidate === 'function') {
      this._diagnostics.invalidate();
    }
    // Diff counts ENTRIES (the catalog list), not files: one delete drops one
    // movie/game — all its copies went with it.
    this._broadcast({ removed: 1 });

    this._log(`  [TRASH] Deleted uid=${key} id=${id} files=${moves.length}`);

    // ── Purge window (D6): bound disk usage, keep the log forever ──────────
    this._purgeOverflow(nextManifest);

    return { id, uid: key, title: item.title, moved: moves.length };
  }

  // ─── restore ──────────────────────────────────────────────────────────────

  /**
   * Restore a trashed deletion back to its original paths (all-or-nothing).
   * @param {string|number} id - trash id (folder name)
   * @returns {{id:string, uid:string, restored:number}}
   * @throws Error with .status / .code for the route layer
   */
  restore(id) {
    const sid = id == null ? '' : String(id);
    if (!TRASH_ID_RE.test(sid)) {
      throw fail('VALIDATION', 400, 'شناسه ورودی نامعتبر است');
    }
    const trashDir = this._trashDirFor(sid);

    const manifest = this._readManifest();
    const idx = manifest.entries.findIndex(e => e && String(e.id) === sid);
    if (idx === -1) throw fail('TRASH_NOT_FOUND', 404, 'این مورد در سطل زباله یافت نشد');
    const entry = manifest.entries[idx];
    if (entry.purgedAt) {
      throw fail('TRASH_PURGED', 404, 'فایل‌های این مورد قبلاً از سطل زباله پاک شده‌اند');
    }
    if (!Array.isArray(entry.originalPaths) || entry.originalPaths.length === 0) {
      throw fail('TRASH_NOT_FOUND', 404, 'این مورد در سطل زباله یافت نشد');
    }

    const moves = entry.originalPaths.map((rel) => {
      if (typeof rel !== 'string' || rel === '' || rel.startsWith('/') ||
          rel.split('/').some(seg => seg === '..' || seg === '')) {
        throw fail('VALIDATION', 400, 'مسیر فایل در سطل زباله نامعتبر است');
      }
      return {
        rel,
        from: this._resolveInside(trashDir, rel),
        to: this._resolveInside(this._libraryPath, rel)
      };
    });

    // ── PRE-CHECK: nothing moves until every source is there (404 beats 409)
    //    and every destination is free — all-or-nothing, no silent overwrite.
    for (const m of moves) {
      if (!fs.existsSync(m.from)) {
        throw fail('TRASH_NOT_FOUND', 404, 'فایل‌های این مورد در سطل زباله موجود نیستند');
      }
    }
    for (const m of moves) {
      if (fs.existsSync(m.to)) {
        throw fail('RESTORE_CONFLICT', 409,
          'برخی مقاصد بازگردانی اشغال هستند — هیچ فایلی منتقل نشد');
      }
    }

    if (this._watcher && typeof this._watcher.expect === 'function') {
      this._watcher.expect([...moves.map(m => m.from), ...moves.map(m => m.to)]);
    }

    const nextManifest = {
      version: manifest.version,
      entries: manifest.entries.filter((e, i) => i !== idx)
    };

    const undo = [];
    undo.push(() => this._writeManifest(manifest));
    let phase = 'move';
    try {
      for (const m of moves) {
        // Only a folder THIS restore created may be pruned on rollback —
        // a pre-existing (possibly empty) genre folder must survive (I1).
        const destDir = path.dirname(m.to);
        const destDirExisted = fs.existsSync(destDir);
        fs.mkdirSync(destDir, { recursive: true });
        if (!destDirExisted) undo.push(() => this._removeEmptyDirs(destDir));
        this._rename(m.from, m.to);
        undo.push(() => this._rename(m.to, m.from));
      }
      phase = 'manifest';
      this._writeManifest(nextManifest);
    } catch (err) {
      for (const fn of undo.reverse()) {
        try { fn(); } catch (e) {
          this._log(`  [TRASH] rollback failed: ${e.message}`);
        }
      }
      if (err && err.code && err.status) throw err;
      if (phase === 'manifest') throw fail('TRASH_MANIFEST_ERROR', 500, 'خطا در نوشتن سطل زباله');
      const e = fail('RESTORE_FAILED', 500, `بازگردانی فیلم ناموفق بود: ${err.message}`);
      e.cause = err;
      throw e;
    }

    // ── Commit: re-enter the index through the right pipeline ──────────────
    let restored = 0;
    if (entry.type === 'Game') {
      // Games have no _fileIndex — rescan Games/ from disk (I1/I8). The
      // title may have changed on disk meanwhile; the rescan is the truth.
      this._indexer.removeGame(entry.title);
      this._indexer.processGameResults(scanGames(this._libraryPath).results);
      // Source-level invalidation (F3): notify the indexer directly so the
      // cached /api/games payload is refreshed even when called without HTTP.
      this._indexer.notifyChanged();
      restored = moves.length;
    } else {
      for (const m of moves) {
        const scan = scanFile(m.to, this._libraryPath);
        if (scan.ok) {
          this._indexer.addFile(scan.entry); // genres re-union + metadata re-attach
          restored += 1;
        } else {
          this._log(`  [TRASH] restored file failed scan: ${m.rel} (${scan.reason})`);
        }
      }
      this._indexer.scheduleSave();
    }

    if (this._diagnostics && typeof this._diagnostics.invalidate === 'function') {
      this._diagnostics.invalidate();
    }
    this._broadcast({ added: restored });

    // Empty trash folder is history-free space — drop it (empty dirs only).
    this._removeEmptyDirs(trashDir);

    this._log(`  [TRASH] Restored id=${sid} uid=${entry.uid} files=${restored}`);
    return { id: sid, uid: entry.uid, restored };
  }

  // ─── list ─────────────────────────────────────────────────────────────────

  /**
   * The 20 newest restorable entries, newest-first.
   * The permanent log (including purgedAt entries) lives in manifest.json.
   * @returns {Array<object>}
   */
  list() {
    const manifest = this._readManifest();
    return manifest.entries
      .filter(e => e && !e.purgedAt)
      .slice()
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, TRASH_WINDOW);
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /**
   * Every path that belongs to this movie: all _fileIndex entries for the key
   * (all genre copies) plus absolutePosterPath as a safety net; only files
   * that still exist on disk (broken links are skipped, I1 disk-is-truth).
   */
  _collectSources(movie, movieKey) {
    const found = new Set();
    for (const [filePath, entry] of this._indexer._fileIndex) {
      if (entry && entry.key === movieKey) found.add(filePath);
    }
    if (movie.absolutePosterPath) found.add(movie.absolutePosterPath);

    const existing = [];
    for (const p of found) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) existing.push(p);
      } catch { /* unreadable — treat as missing */ }
    }
    return existing.sort();
  }

  /**
   * Every platform copy of a game (P6c E4): list Games/{PS4,PS5} and keep
   * files whose parsed title normalises to this game's key (shared
   * gameKey parity, F26). Games have no _fileIndex — disk is the truth (I1/I8).
   */
  _collectGameSources(game) {
    const want = gameKey(game && game.title != null ? game.title : '');
    const found = [];
    for (const plat of ['PS4', 'PS5']) {
      const dir = path.join(this._libraryPath, 'Games', plat);
      let names;
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const name of names) {
        const parsed = parseGameFilename(name);
        if (!parsed) continue;
        if (gameKey(parsed.title) !== want) continue;
        const abs = path.join(dir, name);
        try {
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) found.push(abs);
        } catch { /* unreadable — skip */ }
      }
    }
    return found.sort();
  }

  /** Absolute path → relative path with '/' separators; escapes → 400. */
  _relativeToLibrary(absPath) {
    const rel = path.relative(this._libraryPath, absPath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw fail('VALIDATION', 400, 'مسیر فایل خارج از کتابخانه است');
    }
    return rel.split(path.sep).join('/');
  }

  /** resolveInside wrapped as a structured 400 (I10 belt). */
  _resolveInside(root, rel) {
    try {
      return resolveInside(root, ...rel.split('/'));
    } catch {
      throw fail('VALIDATION', 400, 'مسیر فایل خارج از پوشه مجاز است');
    }
  }

  /** Validated .trash/<id> folder path (I10). */
  _trashDirFor(id) {
    if (!TRASH_ID_RE.test(String(id))) {
      throw fail('VALIDATION', 400, 'شناسه ورودی نامعتبر است');
    }
    return this._resolveInside(this._trashRoot, String(id));
  }

  /**
   * Unique numeric trash id: never collides with an existing log entry or
   * an existing folder on disk.
   */
  _nextTrashId(manifest) {
    const used = new Set(manifest.entries.map(e => String(e.id)));
    let id = Date.now() + this._idSeq;
    while (used.has(String(id)) || fs.existsSync(path.join(this._trashRoot, String(id)))) {
      this._idSeq += 1;
      id = Date.now() + this._idSeq;
    }
    this._idSeq += 1;
    return String(id);
  }

  /** Read manifest.json — plain parse (readJsonSafe would quarantine the log = data loss). */
  _readManifest() {
    const file = path.join(this._trashRoot, MANIFEST_NAME);
    if (!fs.existsSync(file)) return { version: MANIFEST_VERSION, entries: [] };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw fail('TRASH_MANIFEST_ERROR', 500, 'خطا در خواندن سطل زباله');
    }
    if (!data || !Array.isArray(data.entries)) {
      throw fail('TRASH_MANIFEST_ERROR', 500, 'خطا در خواندن سطل زباله');
    }
    return { version: Number.isInteger(data.version) ? data.version : MANIFEST_VERSION, entries: data.entries };
  }

  _writeManifest(manifest) {
    writeJsonAtomic(path.join(this._trashRoot, MANIFEST_NAME), manifest, { pretty: true });
  }

  /**
   * D6 purge window: log entries at position ≥ 20 without purgedAt lose their
   * FILES from disk; the entry stays forever, marked purgedAt. Best-effort,
   * retried on the next delete if it fails (rm force is idempotent).
   */
  _purgeOverflow(manifest) {
    const stale = manifest.entries.filter((e, i) => i >= TRASH_WINDOW && e && !e.purgedAt);
    if (stale.length === 0) return;

    let changed = false;
    for (const e of stale) {
      const sid = e && e.id != null ? String(e.id) : '';
      if (!TRASH_ID_RE.test(sid)) continue;
      const dir = path.join(this._trashRoot, sid);
      try {
        const resolved = resolveInside(this._trashRoot, sid);
        if (resolved !== dir) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        e.purgedAt = new Date().toISOString();
        changed = true;
        this._log(`  [TRASH] Purged files of aged deletion id=${sid}`);
      } catch (err) {
        this._log(`  [TRASH] purge id=${sid} failed: ${err.message}`);
      }
    }
    if (changed) {
      try { this._writeManifest(manifest); } catch (err) {
        this._log(`  [TRASH] purge manifest write failed: ${err.message}`);
      }
    }
  }

  /**
   * Remove `dir`, its empty children, and its empty parents while they stay
   * inside `.trash` (never the root itself — the manifest lives there).
   * rmdir refuses non-empty directories and files are never touched, so a
   * rollback that could not move a file back just stops — nothing is ever
   * force-deleted here.
   */
  _removeEmptyDirs(dir) {
    if (!dir) return;
    const root = path.resolve(this._trashRoot);
    const start = path.resolve(dir);
    this._pruneEmptyTree(start);
    let p = start;
    while (p !== root && p.startsWith(root + path.sep)) {
      if (fs.existsSync(p)) {
        try { fs.rmdirSync(p); } catch { break; }
      }
      p = path.dirname(p);
    }
  }

  /** Depth-first rmdir of empty directories only — never touches files. */
  _pruneEmptyTree(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) this._pruneEmptyTree(path.join(d, e.name));
    }
    try { fs.rmdirSync(d); } catch { /* not empty (or already gone) — keep */ }
  }

  _broadcast(diff) {
    if (this._wsServer && typeof this._wsServer.broadcastCatalogChanged === 'function') {
      this._wsServer.broadcastCatalogChanged(diff);
    }
  }
}

module.exports = MovieTrash;
module.exports.statusOf = statusOf;
