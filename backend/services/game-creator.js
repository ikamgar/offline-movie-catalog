'use strict';

/**
 * Game create service (P6c E4 — AC4/AC6).
 *
 * createGame(gameData, posterBuffer, posterExtension):
 *   1. Validate: title (TITLE_REQUIRED), platforms ⊆ {PS4, PS5}, non-empty,
 *      deduped (PLATFORM_INVALID), poster buffer present + supported magic
 *      extension (IMG_REQUIRED / IMG_UNSUPPORTED). The sanitised title runs
 *      through buildGameFilename → safeSegment: a path-escaping title throws
 *      plain and is mapped to TITLE_INVALID (400, I10 — no traversal).
 *   2. Conflicts: an indexed title → 409 GAME_EXISTS; any target file already
 *      on disk → 409 FILE_EXISTS — EVERY platform target is pre-checked before
 *      the first byte is written (plan first, mutate second).
 *   3. Execute: one copy per selected platform under Games/<platform>/
 *      (the same poster file copied across folders — I8). One undo stack: a
 *      caught failure removes every copy written so far and rethrows; nothing
 *      enters the index.
 *   4. Commit: indexer.processGameResults(scanGames()) re-reads Games/ so the
 *      title enters _gamesMap with its platforms taken from disk (I1 — the
 *      filesystem is the source of truth; games are never cached in
 *      catalog.json, so no scheduleSave is involved).
 */

const fs = require('fs');
const path = require('path');
const { buildGameFilename, cleanTitle } = require('../utils/filename');
const { scanGames } = require('../scanner');
const { IMAGE_EXTENSIONS: IMAGE_EXTENSIONS_LIST } = require('../constants');

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
  if (err && (err.code === 'TITLE_REQUIRED' || err.code === 'PLATFORM_INVALID' ||
    err.code === 'IMG_REQUIRED' || err.code === 'IMG_UNSUPPORTED' ||
    err.code === 'TITLE_INVALID' || err.code === 'VALIDATION')) return 400;
  if (err && (err.code === 'GAME_EXISTS' || err.code === 'FILE_EXISTS')) return 409;
  return 500;
}

class GameCreator {
  /**
   * @param {object} deps
   * @param {string} deps.libraryPath
   * @param {object} deps.indexer
   * @param {object|null} [deps.watcher]
   * @param {Function} [deps.log]
   * @param {Function} [deps.writeFileSync] - injectable for rollback tests
   * @param {Function} [deps.mkdirSync] - injectable for rollback tests
   */
  constructor({
    libraryPath, indexer, watcher = null, log = null,
    writeFileSync = null, mkdirSync = null
  } = {}) {
    if (!libraryPath) throw new Error('libraryPath is required');
    if (!indexer) throw new Error('indexer is required');
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._watcher = watcher;
    this._log = log || (() => {});
    this._write = writeFileSync || fs.writeFileSync;
    this._mkdir = mkdirSync || fs.mkdirSync;
  }

  /**
   * Create a game poster in every selected platform folder.
   * @param {object} gameData - { title, platforms: ['PS4'|'PS5', ...] }
   * @param {Buffer|null} posterBuffer
   * @param {string} posterExtension
   * @returns {Promise<object>} the freshly indexed game
   * @throws Error with .status / .code for the route layer
   */
  async createGame(gameData, posterBuffer, posterExtension) {
    // ── 1. Validate ────────────────────────────────────────────────────────
    if (!gameData || typeof gameData.title !== 'string' || gameData.title.trim() === '') {
      throw fail('TITLE_REQUIRED', 400, 'عنوان بازی الزامی است');
    }
    let title = String(gameData.title).normalize('NFC').trim().replace(/\s+/g, ' ');

    // F37: clean and validate the title BEFORE any file is written. Empty
    // after cleaning, reserved Windows names (CON, NUL …) and over-long names
    // are rejected with TITLE_INVALID; no poster byte is touched.
    const cleanedTitle = cleanTitle(title);
    if (cleanedTitle === '') {
      throw fail('TITLE_INVALID', 400, 'عنوان بازی نامعتبر است');
    }

    const rawPlatforms = Array.isArray(gameData.platforms) ? gameData.platforms : [];
    const platforms = [...new Set(rawPlatforms.map(p => String(p)))];
    if (platforms.length === 0 || platforms.some(p => !PLATFORMS.includes(p))) {
      throw fail('PLATFORM_INVALID', 400, 'حداقل یک پلتفرم (PS4 یا PS5) انتخاب کنید');
    }

    if (!posterBuffer) {
      throw fail('IMG_REQUIRED', 400, 'تصویر پوستر الزامی است');
    }
    if (!posterExtension || !IMAGE_EXTENSIONS.has(String(posterExtension).toLowerCase())) {
      throw fail('IMG_UNSUPPORTED', 400, 'فرمت تصویر پشتیبانی نمی‌شود (jpg, jpeg, png, webp, avif)');
    }

    // ── 2. Filename (sanitises + safeSegment; plain throw → TITLE_INVALID) ─
    // F37: build from the cleaned title so the on-disk name and the index key
    // agree (reserved/over-long/escaping titles throw here via safeSegment).
    title = cleanedTitle;
    let filename;
    try {
      filename = buildGameFilename(title, posterExtension);
    } catch {
      throw fail('TITLE_INVALID', 400, 'عنوان بازی نامعتبر است');
    }

    // ── 3. Conflicts (plan first — nothing is written yet) ────────────────
    if (this._indexer.getGameByTitle(title)) {
      throw fail('GAME_EXISTS', 409, 'این بازی قبلاً اضافه شده است');
    }
    const targets = platforms.map(plat => ({
      plat,
      file: path.join(this._libraryPath, 'Games', plat, filename)
    }));
    for (const t of targets) {
      if (fs.existsSync(t.file)) {
        throw fail('FILE_EXISTS', 409, 'فایل پوستر این بازی قبلاً وجود دارد');
      }
    }

    if (this._watcher && typeof this._watcher.expect === 'function') {
      this._watcher.expect(targets.map(t => t.file));
    }

    // ── 4. Execute: one copy per platform, one undo stack ──────────────────
    const written = [];
    try {
      for (const t of targets) {
        this._mkdir(path.dirname(t.file), { recursive: true });
        this._write(t.file, posterBuffer);
        written.push(t.file);
      }
    } catch (err) {
      for (const f of written.reverse()) {
        try { fs.unlinkSync(f); } catch { /* best-effort rollback */ }
      }
      if (err && err.code && err.status) throw err;
      const e = fail('CREATE_FAILED', 500, `افزودن بازی ناموفق بود: ${err.message}`);
      e.cause = err;
      throw e;
    }

    // ── 5. Commit: re-read Games/ from disk (I1). Any failure after the
    //     poster file is written must remove it, so no ghost survives a
    //     rescan (F37).
    try {
      this._indexer.processGameResults(scanGames(this._libraryPath).results);
      const game = this._indexer.getGameByTitle(title);
      if (!game) {
        throw fail('CREATE_FAILED', 500, 'افزودن بازی ناموفق بود: بازی در فهرست یافت نشد');
      }
      this._log(`  [GAME] Created uid=${game.uid} platforms=${game.platforms.join(',')}`);
      // Source-level invalidation (F3): do not rely only on the HTTP route
      // belt — tell the indexer (and thus the cached /api/games payload)
      // that the games map changed, even when called without HTTP.
      this._indexer.notifyChanged();
      return game;
    } catch (err) {
      for (const f of written.reverse()) {
        try { fs.unlinkSync(f); } catch { /* best-effort rollback */ }
      }
      throw err;
    }
  }
}

module.exports = GameCreator;
module.exports.statusOf = statusOf;
