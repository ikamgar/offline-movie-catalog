'use strict';

/**
 * Edit service for manager metadata edits (P3 B7) + P6a E1 genre & poster edits.
 *
 * updateMovie(uid, patch, options) — patch = { title?, year?, id?, imdbRating?, plotSummary?, genres? }
 *   options = { posterBuffer?, posterExt? } replaces the image on every copy (I7).
 *
 *   1. Validate with safe-path helpers. Structured error codes (Q6) drive the
 *      client's field mapping; the Persian message is what gets DISPLAYED:
 *      TITLE_REQUIRED, ID_REQUIRED, YEAR_INVALID, GENRE_REQUIRED, GENRE_INVALID,
 *      NON_MOVIE_GENRE_EDIT, IMG_UNSUPPORTED, IMG_TOO_LARGE, IMG_INVALID, plus the
 *      pre-existing ID_TAKEN / FILE_EXISTS / NOT_FOUND / VALIDATION / RENAME_FAILED.
 *   2. Plan first, mutate second: rename plans (every genre copy), genre folder ops
 *      (removals move-aside to a temp dir, additions copy), poster replacement
 *      (backup → write-new → delete-old). Every collision check runs while planning,
 *      before a single file is touched.
 *   3. Execute against one undo stack. A caught exception anywhere rolls back every
 *      completed op in reverse and leaves disk + index untouched. A hard kill
 *      (not a caught exception) between write-new and delete-old can leave two
 *      same-ID files — that surfaces as a DATA-05 duplicate-ID diagnostic on the
 *      next scan, never as silent corruption or a silent merge.
 *   4. watcher.expect covers every path that will change: renames, temp moves,
 *      additions, poster old/new paths.
 *   5. Metadata-only patches (rating/plot) touch no files.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateId, safeSegment, resolveInside } = require('../utils/safe-path');
const { buildMovieFilename } = require('../utils/filename');
const { metadataKeyFor } = require('../utils/metadata-key');
const { IMAGE_EXTENSIONS: IMAGE_EXTENSIONS_LIST } = require('../constants');
const CatalogIndexer = require('../indexer');

const IMAGE_EXTENSIONS = new Set(IMAGE_EXTENSIONS_LIST);
const MAX_POSTER_BYTES = 8 * 1024 * 1024;

function fail(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function statusOf(err) {
  if (err && typeof err.status === 'number') return err.status;
  if (err && (err.code === 'ID_TAKEN' || err.code === 'FILE_EXISTS')) return 409;
  if (err && err.code === 'NOT_FOUND') return 404;
  if (err && (err.code === 'VALIDATION' || err.code === 'TITLE_REQUIRED' ||
    err.code === 'ID_REQUIRED' || err.code === 'YEAR_INVALID' ||
    err.code === 'GENRE_REQUIRED' || err.code === 'GENRE_INVALID' ||
    err.code === 'NON_MOVIE_GENRE_EDIT' || err.code === 'IMG_INVALID' ||
    err.code === 'IMG_UNSUPPORTED' || err.code === 'GAME_UNSUPPORTED')) return 400;
  if (err && err.code === 'IMG_TOO_LARGE') return 413;
  return 500;
}

class MovieEditor {
  /**
   * @param {object} deps
   * @param {string} deps.libraryPath
   * @param {object} deps.indexer
   * @param {object|null} [deps.watcher]
   * @param {object|null} [deps.metadataStore]
   * @param {object|null} [deps.wsServer]
   * @param {object|null} [deps.diagnostics] - Diagnostics instance to invalidate after mutation (BUG-2)
   * @param {Function} [deps.log]
   * @param {Function} [deps.renameSync] - injectable for rollback tests
   * @param {Function} [deps.copyFileSync] - injectable for genre-copy rollback tests (E1)
   * @param {Function} [deps.writeFileSync] - injectable for poster write rollback tests (E1)
   */
  constructor({
    libraryPath, indexer, watcher = null, metadataStore = null,
    wsServer = null, diagnostics = null, log = null,
    renameSync = null, copyFileSync = null, writeFileSync = null
  } = {}) {
    if (!libraryPath) throw new Error('libraryPath is required');
    if (!indexer) throw new Error('indexer is required');
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._watcher = watcher;
    this._metadataStore = metadataStore;
    this._wsServer = wsServer;
    this._diagnostics = diagnostics;
    this._log = log || (() => {});
    this._rename = renameSync || fs.renameSync;
    this._copy = copyFileSync || fs.copyFileSync;
    this._write = writeFileSync || fs.writeFileSync;
  }

  /**
   * Apply a partial patch to a movie/series by uid.
   * @param {string} uid - bare id, `series:<title>`, … (Express-decoded)
   * @param {object} patch
   * @param {object} [options] - { posterBuffer: Buffer, posterExt: string } to replace the image
   * @returns {object} public movie
   * @throws Error with .status / .code for the route layer
   */
  updateMovie(uid, patch, options = {}) {
    if (uid == null || uid === '') {
      throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    }
    if (!patch || typeof patch !== 'object') {
      throw fail('VALIDATION', 400, 'بدنه درخواست نامعتبر است');
    }

    const movie = this._indexer.getByUid(String(uid));
    if (movie && movie.type === 'Game') {
      // P6c E4: game edits go through GameEditor — the movie pipeline must
      // never rewrite Games/ paths (I10 + defence behind the route dispatch).
      throw fail('GAME_UNSUPPORTED', 400, 'ویرایش بازی از این مسیر ممکن نیست');
    }
    if (!movie) {
      throw fail('NOT_FOUND', 404, 'فایل یافت نشد');
    }

    const oldKey = CatalogIndexer.getKey(movie);
    // Metadata key = the uid (F41) — the store keys bare uids, never map keys
    const oldMetaKey = metadataKeyFor(movie);

    const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);

    let nextTitle = movie.title;
    let nextYear = movie.year;
    let nextId = movie.id;
    const isSeries = movie.type === 'Series';

    if (has('title')) {
      if (patch.title == null || String(patch.title).trim() === '') {
        throw fail('TITLE_REQUIRED', 400, 'عنوان فیلم الزامی است');
      }
      nextTitle = String(patch.title).normalize('NFC').trim().replace(/\s+/g, ' ');
      safeSegment(nextTitle, 'عنوان فیلم');
    }

    if (has('year')) {
      if (patch.year == null || patch.year === '') {
        nextYear = null;
      } else {
        const y = Number(patch.year);
        if (!Number.isInteger(y) || y < 1870 || y > 2100) {
          throw fail('YEAR_INVALID', 400, `سال انتشار نامعتبر است: ${patch.year}`);
        }
        nextYear = y;
      }
    }

    if (has('id') && !isSeries) {
      if (patch.id == null || patch.id === '') {
        throw fail('ID_REQUIRED', 400, 'شناسه فیلم الزامی است');
      }
      try {
        validateId(String(patch.id));
      } catch (e) {
        throw fail('VALIDATION', 400, e.message);
      }
      nextId = String(patch.id);
    }

    // Cross-type ID uniqueness (B4 / D2 default) — before any file is touched
    if (!isSeries && nextId != null && String(nextId) !== String(movie.id)) {
      const conflict = this._indexer.getMovieById(String(nextId));
      if (conflict && conflict !== movie) {
        throw fail('ID_TAKEN', 409, `شناسه ${nextId} قبلاً استفاده شده است`);
      }
    }

    // ── P6a E1: genres validation (Q6 codes, Movie only) ──────────────────
    let nextGenres = null;
    if (has('genres')) {
      if (!Array.isArray(patch.genres)) {
        throw fail('GENRE_INVALID', 400, 'ژانرها باید رشته باشند');
      }
      if (movie.type !== 'Movie') {
        throw fail('NON_MOVIE_GENRE_EDIT', 400, 'ویرایش ژانر فقط برای فیلم‌ها امکان‌پذیر است');
      }
      const seen = new Set();
      for (const g of patch.genres) {
        if (typeof g !== 'string') {
          throw fail('GENRE_INVALID', 400, 'ژانرها باید رشته باشند');
        }
        const norm = g.normalize('NFC').trim();
        try {
          safeSegment(norm, 'ژانر');
        } catch (e) {
          throw fail('GENRE_INVALID', 400, e.message);
        }
        seen.add(norm);
      }
      nextGenres = [...seen].sort();
      if (nextGenres.length === 0) {
        throw fail('GENRE_REQUIRED', 400, 'حداقل یک ژانر برای فیلم الزامی است');
      }
    }

    // ── P6a E1: poster validation (Q6 codes; magic bytes checked in the route) ──
    const posterBuffer = options.posterBuffer != null ? options.posterBuffer : null;
    let posterExt = null;
    if (posterBuffer !== null) {
      if (!Buffer.isBuffer(posterBuffer) || posterBuffer.length === 0) {
        throw fail('IMG_INVALID', 400, 'تصویر پوستر نامعتبر است');
      }
      if (posterBuffer.length > MAX_POSTER_BYTES) {
        throw fail('IMG_TOO_LARGE', 413, 'تصویر پوستر خیلی بزرگ است (حداکثر ۸ مگابایت)');
      }
      posterExt = String(options.posterExt || '').toLowerCase().replace(/^\./, '');
      if (!IMAGE_EXTENSIONS.has(posterExt)) {
        throw fail('IMG_UNSUPPORTED', 400, 'فرمت تصویر پشتیبانی نمی‌شود (فقط JPEG, PNG, WEBP, AVIF)');
      }
    }

    const nextKey = isSeries
      ? CatalogIndexer.getKey({ type: 'Series', id: null, title: nextTitle })
      : CatalogIndexer.getKey({ type: movie.type, id: nextId, title: nextTitle });
    const nextUid = isSeries ? 'series:' + nextKey : String(nextId);

    // Durable manager metadata (DATA-10) — computed before the execute phase
    // so the metadata-store write can join the plan-then-execute rollback
    // stack (F33: success must mean durable).
    const metaRating = has('imdbRating')
      ? (patch.imdbRating != null && patch.imdbRating !== '' ? parseFloat(patch.imdbRating) : null)
      : undefined;
    const metaPlot = has('plotSummary')
      ? (patch.plotSummary != null && String(patch.plotSummary) !== '' ? String(patch.plotSummary) : null)
      : undefined;
    const nextMetaKey = String(nextUid);

    const titleChanged = nextTitle !== movie.title;
    const yearChanged = nextYear !== movie.year;
    const idChanged = !isSeries && nextId != null && String(nextId) !== String(movie.id);

    // Filenames per I4: Movie includes year; Animation/Iranian/Series do not.
    // Year-only edits for non-Movie types do not change the filename.
    const needsFileRename = titleChanged || idChanged || (movie.type === 'Movie' && yearChanged);

    // ── Plan phase — every collision check runs here, before any mutation ──
    const sources = this._collectSources(movie, oldKey);

    let plans = [];
    if (needsFileRename) {
      plans = this._planRenames(sources, nextId, nextTitle, nextYear, movie.type);
      this._assertNoTargetCollision(plans);
    }
    const renameMap = new Map(plans.map(p => [path.resolve(p.from), p.to]));
    const postRename = (p) => renameMap.get(path.resolve(p)) || p;

    const genrePlan = nextGenres !== null
      ? this._planGenreOps(sources, postRename, nextGenres, nextId, nextTitle, nextYear, movie)
      : { additions: [], removals: [], tempBase: null };

    const existingSources = [...sources].filter(p => this._fileExists(p));
    const removalFroms = new Set(genrePlan.removals.map(r => r.from));
    let finalPaths = existingSources.map(postRename).filter(p => !removalFroms.has(p));
    finalPaths.push(...genrePlan.additions.map(a => a.dest));

    const posterPlans = posterBuffer !== null
      ? finalPaths.map(curPath => {
          const stem = path.basename(curPath, path.extname(curPath));
          return { curPath, newPath: path.join(path.dirname(curPath), stem + '.' + posterExt) };
        })
      : [];

    const posterMap = new Map(
      posterPlans.filter(p => p.curPath !== p.newPath).map(p => [p.curPath, p.newPath])
    );
    const finalSet = new Set(finalPaths.map(p => posterMap.get(p) || p));

    // ── watcher.expect: every path this edit will touch (BUG-2/P3d contract) ──
    const expectPaths = new Set();
    for (const p of plans) {
      expectPaths.add(p.from);
      expectPaths.add(p.to);
    }
    for (const r of genrePlan.removals) {
      expectPaths.add(r.from);
      if (r.temp) expectPaths.add(r.temp);
    }
    for (const a of genrePlan.additions) expectPaths.add(a.dest);
    for (const pp of posterPlans) {
      expectPaths.add(pp.curPath);
      expectPaths.add(pp.newPath);
    }
    if (expectPaths.size && this._watcher && typeof this._watcher.expect === 'function') {
      this._watcher.expect([...expectPaths]);
    }

    // ── Execute: one undo stack, reverse order on any caught exception ────
    const undo = [];
    let phase = 'rename';
    try {
      for (const p of plans) {
        this._rename(p.from, p.to);
        undo.push(() => this._rename(p.to, p.from));
      }

      phase = 'genre';
      if (genrePlan.removals.length && genrePlan.tempBase) {
        fs.mkdirSync(genrePlan.tempBase, { recursive: true });
      }
      // Additions first: their source copy may itself be a file a removal is
      // about to move aside (e.g. de-select Action while adding Comedy).
      for (const a of genrePlan.additions) {
        fs.mkdirSync(path.dirname(a.dest), { recursive: true });
        this._copy(a.src, a.dest);
        undo.push(() => fs.unlinkSync(a.dest));
      }
      for (const r of genrePlan.removals) {
        this._rename(r.from, r.temp);
        undo.push(() => this._rename(r.temp, r.from));
      }

      phase = 'poster';
      if (posterBuffer !== null && posterPlans.length) {
        const backups = posterPlans.map(pp => ({
          ...pp,
          backup: fs.readFileSync(pp.curPath)
        }));
        // write-new first (every copy), then delete-old — a caught failure at
        // any point below restores the backups above via the undo stack.
        for (const b of backups) {
          if (b.curPath === b.newPath) {
            this._write(b.curPath, posterBuffer);
            undo.push(() => this._write(b.curPath, b.backup));
          } else {
            this._write(b.newPath, posterBuffer);
            undo.push(() => fs.unlinkSync(b.newPath));
          }
        }
        for (const b of backups) {
          if (b.curPath !== b.newPath) {
            fs.unlinkSync(b.curPath);
            undo.push(() => this._write(b.curPath, b.backup));
          }
        }
      }

      phase = 'metadata';
      if (this._metadataStore) {
        if (oldMetaKey !== nextMetaKey) {
          this._metadataStore.rename(oldMetaKey, nextMetaKey);
          undo.push(() => this._metadataStore.rename(nextMetaKey, oldMetaKey));
        }
        const metaPatch = {};
        if (metaRating !== undefined) metaPatch.imdbRating = metaRating;
        if (metaPlot !== undefined) metaPatch.plotSummary = metaPlot;
        if (Object.keys(metaPatch).length) {
          const prevEntry = this._metadataStore.get(nextMetaKey);
          this._metadataStore.set(nextMetaKey, metaPatch);
          undo.push(() => {
            if (prevEntry) {
              this._metadataStore.set(nextMetaKey, {
                imdbRating: prevEntry.imdbRating,
                plotSummary: prevEntry.plotSummary
              });
            } else {
              this._metadataStore.remove(nextMetaKey);
            }
          });
        }
        // flush() returns false when the metadata store cannot write (ENOSPC,
        // metadata.json is a directory, blocked rename …). That is a durability
        // failure: roll back everything and report PERSIST_FAILED (F33).
        const flushed = this._metadataStore.flush();
        if (!flushed) {
          throw fail('PERSIST_FAILED', 500, 'ذخیره متادیتا ناموفق بود');
        }
      }
    } catch (err) {
      for (const fn of undo.reverse()) {
        try { fn(); } catch (e) {
          this._log(`  [MOVIE-EDITOR] rollback failed: ${e.message}`);
        }
      }
      if (genrePlan.tempBase) {
        try { fs.rmSync(genrePlan.tempBase, { recursive: true, force: true }); } catch {}
      }
      if (phase === 'rename') {
        const e = fail('RENAME_FAILED', 500, `تغییر نام فایل ناموفق بود: ${err.message}`);
        e.cause = err;
        throw e;
      }
      if (phase === 'genre') {
        const e = fail('GENRE_OP_FAILED', 500, `تغییر ژانر ناموفق بود: ${err.message}`);
        e.cause = err;
        throw e;
      }
      if (phase === 'metadata') {
        const e = fail('PERSIST_FAILED', 500, `ذخیره متادیتا ناموفق بود: ${err.message}`);
        e.cause = err;
        throw e;
      }
      const e = fail('POSTER_WRITE_FAILED', 500, `تعویض پوستر ناموفق بود: ${err.message}`);
      e.cause = err;
      throw e;
    }

    if (genrePlan.tempBase) {
      try { fs.rmSync(genrePlan.tempBase, { recursive: true, force: true }); } catch {}
    }

    // P8b: watcher.expect suppressed the fs event for these writes, so refresh
    // each copy's lastModified from the bytes just written — otherwise
    // movie.mtime (and its ?v=, FE-12) stays stale and browsers keep showing
    // the old immutable-cached poster after an edit-modal replace.
    for (const pp of posterPlans) {
      let mtimeMs = NaN;
      try { mtimeMs = fs.statSync(pp.newPath).mtimeMs; } catch { continue; }
      const entry = this._indexer._fileIndex.get(pp.newPath)
        || this._indexer._fileIndex.get(pp.curPath);
      if (entry && Number.isFinite(mtimeMs)) entry.lastModified = mtimeMs;
    }

    // ── Commit: re-key index, move file-index entries, metadata, broadcast ──
    this._applyToIndex(movie, {
      oldKey, nextKey, oldMetaKey, nextUid, nextTitle, nextYear, nextId,
      metaRating, metaPlot,
      plans, genrePlan, posterPlans, nextGenres, patch, has,
      finalSet, existingSources
    });

    if (this._wsServer && typeof this._wsServer.broadcastMovieUpdate === 'function') {
      this._wsServer.broadcastMovieUpdate(CatalogIndexer.toPublicMovie(movie));
    }

    // BUG-2: watcher.expect suppresses handleFileChange, so drop the 30s
    // diagnostics cache explicitly — the next report must reflect this edit.
    if (this._diagnostics && typeof this._diagnostics.invalidate === 'function') {
      this._diagnostics.invalidate();
    }

    this._log(`  [MOVIE-EDITOR] Updated uid=${nextUid} title=${movie.title}`);
    return CatalogIndexer.toPublicMovie(movie);
  }

  /**
   * Every path that belongs to this movie: all _fileIndex entries for the key
   * (all genre copies) plus absolutePosterPath as a safety net.
   */
  _collectSources(movie, oldKey) {
    const sources = new Set();
    for (const [filePath, entry] of this._indexer._fileIndex) {
      if (entry && entry.key === oldKey) sources.add(filePath);
    }
    if (movie.absolutePosterPath) sources.add(movie.absolutePosterPath);
    return sources;
  }

  /**
   * Build rename plans for every collected source (all genre copies).
   */
  _planRenames(sources, nextId, nextTitle, nextYear, type) {
    const plans = [];
    for (const from of sources) {
      if (!this._fileExists(from)) continue;
      const dir = path.dirname(from);
      const ext = path.extname(from).replace(/^\./, '') || 'jpg';
      const filename = this._buildFilename(nextId, nextTitle, nextYear, type, ext);
      const to = path.join(dir, filename);
      if (path.resolve(from) === path.resolve(to)) continue;
      plans.push({ from, to });
    }
    return plans;
  }

  /**
   * P6a E1: plan genre folder operations for a Movie patch.
   * Removals move the de-selected copy aside to a temp dir (undo = move back);
   * additions copy the poster into the new genre folder (undo = unlink).
   * Target collisions throw 409 during planning — before anything is touched.
   */
  _planGenreOps(sources, postRename, nextGenres, nextId, nextTitle, nextYear, movie) {
    const current = Array.isArray(movie.genres) ? movie.genres : [];
    const added = nextGenres.filter(g => !current.includes(g));
    const removed = current.filter(g => !nextGenres.includes(g));
    const plan = { additions: [], removals: [], tempBase: null };
    if (!added.length && !removed.length) return plan;

    const existingSources = [...sources].filter(p => this._fileExists(p));

    for (const g of removed) {
      const hit = existingSources.find(p => path.basename(path.dirname(p)) === g);
      if (!hit) continue; // copy already gone — index-only update
      plan.removals.push({ from: postRename(hit), genre: g });
    }

    if (added.length) {
      const srcAny = existingSources[0];
      const ext = srcAny ? (path.extname(srcAny).replace(/^\./, '') || 'jpg') : 'jpg';
      const filename = this._buildFilename(nextId, nextTitle, nextYear, movie.type, ext);
      for (const g of added) {
        const dir = resolveInside(this._libraryPath, 'Movies', g);
        const dest = path.join(dir, filename);
        if (this._fileExists(dest)) {
          const destRes = path.resolve(dest);
          const ours = existingSources.some(p => path.resolve(postRename(p)) === destRes);
          if (!ours) {
            throw fail('FILE_EXISTS', 409, `فایل ${filename} از قبل وجود دارد`);
          }
          continue; // our own copy already sits in that folder
        }
        plan.additions.push({ src: postRename(srcAny), dest });
      }
    }

    if (plan.removals.length) {
      const tempBase = path.join(
        os.tmpdir(),
        `p6a-genre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      plan.tempBase = tempBase;
      plan.removals.forEach((r, i) => {
        r.temp = path.join(tempBase, `${i}-${path.basename(r.from)}`);
      });
    }
    return plan;
  }

  _buildFilename(id, title, year, type, extension) {
    // Shared builder (ARCH-03 / P6c E2) — byte-identical to the inline logic
    // this replaced, including the plain safeSegment throw for unsafe titles.
    return buildMovieFilename({ id, title, year, type, extension });
  }

  /**
   * Pre-check: target must not exist unless it is one of our own sources
   * (same multi-copy set). Case-insensitive on Windows via existsSync.
   */
  _assertNoTargetCollision(plans) {
    const ownFroms = new Set(plans.map(p => path.resolve(p.from)));
    for (const p of plans) {
      if (this._fileExists(p.to)) {
        const resolvedTo = path.resolve(p.to);
        if (!ownFroms.has(resolvedTo)) {
          const filename = path.basename(p.to);
          throw fail('FILE_EXISTS', 409, `فایل ${filename} از قبل وجود دارد`);
        }
      }
    }
  }

  /**
   * Mutate the in-memory movie, re-key _movieMap + _fileIndex, metadata, save.
   * Caller has already completed all file operations successfully.
   */
  _applyToIndex(movie, ctx) {
    const {
      oldKey, nextKey, nextUid, nextTitle, nextYear, nextId,
      metaRating, metaPlot,
      plans, genrePlan, posterPlans, nextGenres,
      finalSet
    } = ctx;

    const oldToNew = new Map();
    for (const p of plans) {
      oldToNew.set(path.resolve(p.from), p.to);
    }
    for (const pp of posterPlans) {
      if (pp.curPath !== pp.newPath) oldToNew.set(path.resolve(pp.curPath), pp.newPath);
    }

    // 1. Rename moves: re-key entries under nextKey
    for (const p of plans) {
      const entry = this._indexer._fileIndex.get(p.from);
      if (entry) {
        this._indexer._fileIndex.delete(p.from);
        this._indexer._fileIndex.set(p.to, {
          ...entry,
          key: nextKey,
          id: movie.type === 'Series' ? null : String(nextId)
        });
      }
    }

    // 2. Genre removals: drop the de-selected copy's entry (post-rename path)
    for (const r of genrePlan.removals) {
      this._indexer._fileIndex.delete(r.from);
    }

    // 3. Genre additions: index the new copy (same shape as the scanner, I1)
    for (const a of genrePlan.additions) {
      this._indexer._fileIndex.set(a.dest, {
        id: movie.type === 'Series' ? null : String(nextId),
        key: nextKey,
        lastModified: Date.now()
      });
    }

    // 4. Poster extension change: move entries to the new path
    for (const pp of posterPlans) {
      if (pp.curPath === pp.newPath) continue;
      const entry = this._indexer._fileIndex.get(pp.curPath);
      if (entry) {
        this._indexer._fileIndex.delete(pp.curPath);
        this._indexer._fileIndex.set(pp.newPath, entry);
      }
    }

    // 5. Re-key movie map + fields
    if (oldKey !== nextKey) {
      this._indexer._movieMap.delete(oldKey);
    }
    movie.title = nextTitle;
    movie.year = nextYear;
    if (movie.type !== 'Series') {
      movie.id = String(nextId);
    }
    movie.uid = nextUid;
    if (nextGenres) movie.genres = nextGenres;

    // 6. absolutePosterPath: follow renames/extension swaps; repoint when the
    //    folder it lived in was de-selected or the file no longer exists.
    if (movie.absolutePosterPath) {
      const mapped = oldToNew.get(path.resolve(movie.absolutePosterPath)) || movie.absolutePosterPath;
      movie.absolutePosterPath = finalSet.has(mapped)
        ? mapped
        : (finalSet.size ? [...finalSet][0] : movie.absolutePosterPath);
    }

    // Keep ?v= aligned with the file actually served (FE-12)
    if (movie.absolutePosterPath) {
      const entry = this._indexer._fileIndex.get(movie.absolutePosterPath);
      if (entry && Number.isFinite(entry.lastModified)) {
        movie.mtime = entry.lastModified;
      }
    }

    movie.poster = CatalogIndexer.posterUrl(movie);
    this._indexer._movieMap.set(nextKey, movie);

    if (metaRating !== undefined) movie.imdbRating = metaRating;
    if (metaPlot !== undefined) movie.plotSummary = metaPlot;

    // P8c follow-up: direct map mutations (re-key, field edits) must notify
    // too — metadata-only patches touch no file, so no watcher event fires.
    this._indexer.notifyChanged();
    this._indexer.scheduleSave();
  }

  _fileExists(p) {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }
}

module.exports = MovieEditor;
module.exports.statusOf = statusOf;
