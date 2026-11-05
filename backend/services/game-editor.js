'use strict';

/**
 * Game edit service (P6c E4).
 *
 * updateGame(uid, patch, options):
 *   1. uid must be `game:<normalised title>` and exist → else 404 NOT_FOUND.
 *   2. patch.title — TITLE_REQUIRED / TITLE_INVALID (safeSegment through
 *      buildGameFilename); a title owned by ANOTHER game → 409 GAME_EXISTS,
 *      checked before any file is touched.
 *   3. patch.platforms — non-empty, ⊆ {PS4, PS5} → PLATFORM_INVALID.
 *      Removals delete that platform's copy, additions write a copy of an
 *      existing one (bytes are captured while planning, so op order cannot
 *      race a rename).
 *   4. options.posterBuffer/posterExt — rewrite EVERY target copy; an
 *      extension change rides the rename (old ext file → new ext target).
 *      IMG_* codes shared with the creator.
 *   5. Plan → execute with one undo stack (renames → additions → poster
 *      writes → deletions). Collision pre-check: a target occupied by a
 *      foreign file → 409 FILE_EXISTS before anything moves. Deletions run
 *      last — a caught failure rolls the completed ops back and rethrows.
 *   6. Commit: removeGame(old title) + processGameResults(scanGames()) rebuild
 *      the games index from disk (I1 — games are never cached in
 *      catalog.json). watcher.expect covers every old and new path.
 */

const fs = require('fs');
const path = require('path');
const { buildGameFilename } = require('../utils/filename');
const { parseGameFilename } = require('../parser');
const { scanGames } = require('../scanner');
const { IMAGE_EXTENSIONS: IMAGE_EXTENSIONS_LIST } = require('../constants');
const { gameKey } = require('../utils/game-key');

const IMAGE_EXTENSIONS = new Set(IMAGE_EXTENSIONS_LIST);
const PLATFORMS = ['PS4', 'PS5'];

function fail(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function statusOf(err) {
  if (err && typeof err.status === 'number') return err.status;
  if (err && (err.code === 'GAME_EXISTS' || err.code === 'FILE_EXISTS')) return 409;
  if (err && err.code === 'NOT_FOUND') return 404;
  if (err && (err.code === 'TITLE_REQUIRED' || err.code === 'TITLE_INVALID' ||
    err.code === 'PLATFORM_INVALID' || err.code === 'IMG_REQUIRED' ||
    err.code === 'IMG_UNSUPPORTED' || err.code === 'VALIDATION')) return 400;
  return 500;
}

class GameEditor {
  /**
   * @param {object} deps
   * @param {string} deps.libraryPath
   * @param {object} deps.indexer
   * @param {object|null} [deps.watcher]
   * @param {Function} [deps.log]
   * @param {Function} [deps.renameSync] - injectable for rollback tests
   * @param {Function} [deps.writeFileSync] - injectable for rollback tests
   */
  constructor({
    libraryPath, indexer, watcher = null, log = null,
    renameSync = null, writeFileSync = null
  } = {}) {
    if (!libraryPath) throw new Error('libraryPath is required');
    if (!indexer) throw new Error('indexer is required');
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._watcher = watcher;
    this._log = log || (() => {});
    this._rename = renameSync || fs.renameSync;
    this._write = writeFileSync || fs.writeFileSync;
  }

  /**
   * Apply a partial patch to a game by uid.
   * @param {string} uid - `game:<normalised title>` (Express-decoded)
   * @param {object} patch - { title?, platforms? }
   * @param {object} [options] - { posterBuffer: Buffer, posterExt: string }
   * @returns {object} the freshly indexed game
   * @throws Error with .status / .code for the route layer
   */
  updateGame(uid, patch, options = {}) {
    const key = uid == null ? '' : String(uid);
    if (key === '') throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    const game = this._indexer.getByUid(key);
    if (!game || game.type !== 'Game') {
      throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    }
    if (!patch || typeof patch !== 'object') {
      throw fail('VALIDATION', 400, 'بدنه درخواست نامعتبر است');
    }

    const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);

    // ── title ──────────────────────────────────────────────────────────────
    let nextTitle = game.title;
    if (has('title')) {
      if (patch.title == null || String(patch.title).trim() === '') {
        throw fail('TITLE_REQUIRED', 400, 'عنوان بازی الزامی است');
      }
      nextTitle = String(patch.title).normalize('NFC').trim().replace(/\s+/g, ' ');
      try {
        buildGameFilename(nextTitle, 'jpg');
      } catch {
        throw fail('TITLE_INVALID', 400, 'عنوان بازی نامعتبر است');
      }
      const dup = this._indexer.getGameByTitle(nextTitle);
      if (dup && String(dup.uid) !== key) {
        throw fail('GAME_EXISTS', 409, 'این عنوان بازی قبلاً وجود دارد');
      }
    }

    // ── platforms ──────────────────────────────────────────────────────────
    let nextPlatforms = PLATFORMS.filter(p => (game.platforms || []).includes(p));
    if (has('platforms')) {
      const list = Array.isArray(patch.platforms)
        ? [...new Set(patch.platforms.map(p => String(p)))]
        : [];
      if (list.length === 0 || list.some(p => !PLATFORMS.includes(p))) {
        throw fail('PLATFORM_INVALID', 400, 'حداقل یک پلتفرم (PS4 یا PS5) انتخاب کنید');
      }
      nextPlatforms = PLATFORMS.filter(p => list.includes(p));
    }

    // ── poster ─────────────────────────────────────────────────────────────
    const opts = options || {};
    const hasPoster = !!(opts.posterBuffer);
    if (hasPoster && (!opts.posterExt || !IMAGE_EXTENSIONS.has(String(opts.posterExt).toLowerCase()))) {
      throw fail('IMG_UNSUPPORTED', 400, 'فرمت تصویر پشتیبانی نمی‌شود (jpg, jpeg, png, webp, avif)');
    }

    // ── Plan ───────────────────────────────────────────────────────────────
    const oldFiles = this._findGameFiles(game.title);
    const oldFileSet = new Set(oldFiles.map(f => f.file));
    const ext = opts.posterExt || (oldFiles[0] && path.extname(oldFiles[0].file).slice(1)) || 'jpg';
    let filename;
    try {
      filename = buildGameFilename(nextTitle, ext);
    } catch {
      throw fail('TITLE_INVALID', 400, 'عنوان بازی نامعتبر است');
    }

    const targets = nextPlatforms.map(plat => ({
      plat,
      file: path.join(this._libraryPath, 'Games', plat, filename)
    }));

    // Collision pre-check: a target occupied by a FOREIGN file → 409.
    for (const t of targets) {
      if (fs.existsSync(t.file) && !oldFileSet.has(t.file)) {
        throw fail('FILE_EXISTS', 409, 'فایل پوستر این بازی قبلاً وجود دارد');
      }
    }

    const oldByPlat = new Map();
    for (const f of oldFiles) {
      if (!oldByPlat.has(f.plat)) oldByPlat.set(f.plat, f.file);
    }

    const renames = [];   // { from, to }
    const additions = []; // { to, data } — bytes captured now, written later
    const deletions = []; // files to unlink (dropped platforms / stale extras)
    const consumed = new Set();

    let donorData = null;
    const readDonor = () => {
      if (donorData) return donorData;
      const donor = oldFiles[0];
      if (!donor) return null;
      try {
        donorData = fs.readFileSync(donor.file);
        return donorData;
      } catch {
        throw fail('EDIT_FAILED', 500, 'ویرایش بازی ناموفق بود: خواندن پوستر ممکن نشد');
      }
    };

    for (const t of targets) {
      const src = oldByPlat.get(t.plat);
      if (src && !consumed.has(src)) {
        consumed.add(src);
        if (src === t.file) {
          // kept in place
        } else {
          renames.push({ from: src, to: t.file });
        }
      } else {
        // Platform addition: copy an existing copy's bytes (captured at plan).
        const data = readDonor();
        if (!data && !hasPoster) {
          throw fail('NOT_FOUND', 404, 'فایل پوستر بازی یافت نشد');
        }
        if (data) additions.push({ to: t.file, data });
        // with hasPoster and no old files, the poster write below creates it
      }
    }

    // Old files nobody claimed: dropped platforms and stale extra copies.
    for (const f of oldFiles) {
      if (!consumed.has(f.file)) deletions.push(f.file);
    }

    if (this._watcher && typeof this._watcher.expect === 'function') {
      this._watcher.expect([...oldFiles.map(f => f.file), ...targets.map(t => t.file)]);
    }

    // ── Execute: one undo stack; deletions run last (they cannot roll back) ─
    const undo = [];
    try {
      for (const r of renames) {
        this._mkdirFor(r.to);
        this._rename(r.from, r.to);
        undo.push(() => this._rename(r.to, r.from));
      }
      for (const a of additions) {
        this._mkdirFor(a.to);
        this._write(a.to, a.data);
        undo.push(() => { try { fs.unlinkSync(a.to); } catch { /* gone */ } });
      }
      if (hasPoster) {
        for (const t of targets) {
          this._mkdirFor(t.file);
          const prev = fs.existsSync(t.file) ? fs.readFileSync(t.file) : null;
          this._write(t.file, opts.posterBuffer);
          undo.push(() => {
            if (prev != null) fs.writeFileSync(t.file, prev);
            else { try { fs.unlinkSync(t.file); } catch { /* gone */ } }
          });
        }
      }
      for (const d of deletions) {
        fs.unlinkSync(d);
      }
    } catch (err) {
      for (const fn of undo.reverse()) {
        try { fn(); } catch { /* best-effort rollback */ }
      }
      if (err && err.code && err.status) throw err;
      const e = fail('EDIT_FAILED', 500, `ویرایش بازی ناموفق بود: ${err.message}`);
      e.cause = err;
      throw e;
    }

    // ── Commit: rebuild the games index from disk (I1) ────────────────────
    this._indexer.removeGame(game.title);
    this._indexer.processGameResults(scanGames(this._libraryPath).results);
    const updated = this._indexer.getGameByTitle(nextTitle);
    if (!updated) {
      throw fail('EDIT_FAILED', 500, 'ویرایش بازی ناموفق بود: بازی در فهرست یافت نشد');
    }

    this._log(`  [GAME] Updated uid=${updated.uid} platforms=${updated.platforms.join(',')}`);
    // Source-level invalidation (F3): notify the indexer directly so the cached
    // /api/games payload is refreshed even when called without HTTP.
    this._indexer.notifyChanged();
    return updated;
  }

  /** Every Games/<platform>/ file whose parsed title normalises to `title`. */
  _findGameFiles(title) {
    const want = gameKey(title);
    const out = [];
    for (const plat of PLATFORMS) {
      const dir = path.join(this._libraryPath, 'Games', plat);
      let names;
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const name of names) {
        const parsed = parseGameFilename(name);
        if (parsed && gameKey(parsed.title) === want) {
          out.push({ plat, file: path.join(dir, name) });
        }
      }
    }
    return out.sort((a, b) => a.file.localeCompare(b.file));
  }

  _mkdirFor(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = GameEditor;
module.exports.statusOf = statusOf;
