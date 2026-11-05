'use strict';

/**
 * Movie Creator Service (P3 B8 rewrite).
 *
 * The indexer is the ONLY catalog writer — this module never read/modifies/writes
 * catalog.json itself. Flow:
 *   1. Validate with safe-path + id-generator (B4 / P1).
 *   2. Stage upload under os.tmpdir() (never inside Library/ — DATA-13).
 *   3. watcher.expect(target paths) so the server's own create is not double-processed.
 *   4. Write every genre copy with flag:'wx' (never silently overwrite).
 *   5. All-or-nothing: any write failure rolls back already-written files and
 *      leaves the index untouched.
 *   6. Index via addFile(scanFile.entry) per copy; metadataStore; scheduleSave.
 *   7. Roll back by map key (not bare id) — fixes DATA-09 Series wipe.
 *   8. Broadcast movie:added through toPublicMovie (SEC-08 whitelist).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateId, safeSegment, resolveInside } = require('../utils/safe-path');
const { buildMovieFilename } = require('../utils/filename');
const { metadataKeyFor } = require('../utils/metadata-key');
const { seriesKey } = require('../utils/series-key');
const { MOVIE_TYPES, IMAGE_EXTENSIONS: IMAGE_EXTENSIONS_LIST } = require('../constants');
const CatalogIndexer = require('../indexer');
const { resolveTypeFolder, scanFile } = require('../scanner');
const { nextId: generateNextId, assertIdFree } = require('./id-generator');

const IMAGE_EXTENSIONS = new Set(IMAGE_EXTENSIONS_LIST);

// Q6 structured errors (same pattern as movie-editor.js): the client maps
// `code` → UI behaviour, Persian text is only ever displayed, never parsed.
function fail(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function statusOf(err) {
  if (err && typeof err.status === 'number') return err.status;
  if (err && (err.code === 'ID_TAKEN' || err.code === 'FILE_EXISTS')) return 409;
  if (err && (err.code === 'TITLE_REQUIRED' || err.code === 'TITLE_INVALID' ||
    err.code === 'TYPE_INVALID' || err.code === 'YEAR_INVALID' ||
    err.code === 'GENRE_REQUIRED' || err.code === 'GENRE_INVALID' ||
    err.code === 'ID_INVALID' || err.code === 'IMDB_INVALID' ||
    err.code === 'IMG_REQUIRED' || err.code === 'IMG_INVALID' ||
    err.code === 'IMG_UNSUPPORTED' || err.code === 'VALIDATION')) return 400;
  if (err && err.code === 'IMG_TOO_LARGE') return 413;
  return 500;
}

class MovieCreator {
  /**
   * @param {string} libraryPath - Root Library path
   * @param {string} catalogPath - Path to catalog.json (backups only; not written here)
   * @param {object} indexer - CatalogIndexer instance (sole catalog writer)
   * @param {object|null} wsServer - WebSocket server for broadcasting
   * @param {object|null} metadataStore - MetadataStore for imdbRating/plotSummary (DATA-10)
   * @param {object|null} watcher - LibraryWatcher for expect() (B8)
   * @param {object} [options]
   * @param {Function} [options.writeFileSync] - injectable for rollback tests
   * @param {object|null} [options.diagnostics] - Diagnostics instance to invalidate after create (BUG-2)
   * @param {Function} [options.log]
   */
  constructor(libraryPath, catalogPath, indexer, wsServer = null, metadataStore = null, watcher = null, options = {}) {
    this._libraryPath = libraryPath;
    this._catalogPath = catalogPath;
    this._backupsDir = path.join(path.dirname(catalogPath), 'backups');
    this._indexer = indexer;
    this._wsServer = wsServer;
    this._metadataStore = metadataStore;
    this._watcher = watcher;
    this._diagnostics = options.diagnostics || null;
    this._writeFile = options.writeFileSync || fs.writeFileSync;
    this._log = options.log || ((...args) => console.log(...args));

    if (!fs.existsSync(this._backupsDir)) {
      fs.mkdirSync(this._backupsDir, { recursive: true });
    }
  }

  /**
   * Create a new movie with atomic operations.
   *
   * @param {object} movieData - Movie data from frontend
   * @param {Buffer} posterBuffer - Poster image buffer
   * @param {string} posterExtension - Original file extension (jpg, png, etc.)
   * @returns {object} - Created movie object (public-safe fields present)
   * @throws {Error} - If any step fails (with rollback)
   */
  async createMovie(movieData, posterBuffer, posterExtension) {
    const rollbackActions = [];
    let tempDir = null;
    let movieKey = null;
    let indexTouched = false;

    try {
      this._validateInputs(movieData, posterBuffer, posterExtension);

      const nextId = this._generateNextId(movieData.type);
      const finalId = movieData.id && movieData.id.trim() !== '' ? movieData.id.trim() : nextId;
      this._validateId(finalId, movieData.type);

      const filename = this._buildFilename(finalId, movieData.title, movieData.year, movieData.type, posterExtension);
      const targetFolders = this._getTargetFolders(movieData.type, movieData.genres);
      this._checkDuplicateFilenames(filename, targetFolders);

      const targetPaths = targetFolders.map((folder) => path.join(folder, filename));

      const backupPath = this._createBackup();
      if (backupPath) {
        rollbackActions.push(() => this._rollbackBackup(backupPath));
      }

      // Stage under os.tmpdir() — never inside Library/ (DATA-13)
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-upload-'));
      const tempPosterPath = path.join(tempDir, filename);
      this._writeFile(tempPosterPath, posterBuffer, { flag: 'wx' });
      rollbackActions.push(() => this._removeTempDir(tempDir));

      // Suppress the watcher for our own creates (B8 / same pattern as movie-editor)
      if (this._watcher && typeof this._watcher.expect === 'function') {
        this._watcher.expect(targetPaths);
      }

      // Write every genre copy with flag:'wx' — never silently overwrite (S6 / B8)
      const written = [];
      for (const targetPath of targetPaths) {
        this._ensureDirectory(path.dirname(targetPath));
        this._writeFile(targetPath, posterBuffer, { flag: 'wx' });
        written.push(targetPath);
        rollbackActions.push(() => this._rollbackFile(targetPath));
      }

      // Drop staging file once all copies are on disk
      this._removeTempDir(tempDir);
      tempDir = null;

      // Index the movie via the indexer only (sole catalog writer)
      const newMovie = this._buildMovieObject(movieData, finalId, filename, targetFolders);
      movieKey = CatalogIndexer.getKey(newMovie);

      for (const targetPath of targetPaths) {
        const scan = scanFile(targetPath, this._libraryPath);
        if (scan && scan.ok) {
          this._indexer.addFile(scan.entry);
          indexTouched = true;
        }
      }
      if (!this._indexer.getByUid(newMovie.uid) && !this._indexer._movieMap.has(movieKey)) {
        this._indexer.addMovieToIndex(newMovie);
        indexTouched = true;
      }
      // Prefer the first written path as absolutePosterPath (stable)
      const fromIndex = this._indexer._movieMap.get(movieKey);
      if (fromIndex && written.length) {
        fromIndex.absolutePosterPath = written[0];
        fromIndex._posterSet = true;
        // mtime of the primary copy — keep ?v= in sync with the served file
        const primaryEntry = this._indexer._fileIndex.get(written[0]);
        if (primaryEntry && Number.isFinite(primaryEntry.lastModified)) {
          fromIndex.mtime = primaryEntry.lastModified;
        }
        fromIndex.poster = CatalogIndexer.posterUrl(fromIndex);
        if (movieData.imdbRating !== undefined && movieData.imdbRating !== null) {
          fromIndex.imdbRating = parseFloat(movieData.imdbRating);
        }
        if (movieData.plotSummary) fromIndex.plotSummary = movieData.plotSummary;
      }

      // Manager metadata lives in metadata.json, not the rebuildable cache (DATA-10);
      // key = the uid via metadataKeyFor (F41) — both objects carry uid
      if (this._metadataStore) {
        const uid = fromIndex ? metadataKeyFor(fromIndex) : metadataKeyFor(newMovie);
        this._metadataStore.set(uid, {
          imdbRating: newMovie.imdbRating,
          plotSummary: newMovie.plotSummary
        });
        const flushed = this._metadataStore.flush();
        if (!flushed) {
          // F33: success must mean durable — a metadata-store write that cannot
          // persist rolls back every file + index entry written so far and
          // reports PERSIST_FAILED instead of claiming success.
          for (const rollback of rollbackActions.reverse()) {
            try { rollback(); } catch { /* best-effort rollback */ }
          }
          if (indexTouched && movieKey) {
            this._indexer.removeMovieByKey(movieKey);
          }
          this._metadataStore.remove(uid);
          try { this._metadataStore.flush(); } catch { /* best-effort */ }
          throw fail('PERSIST_FAILED', 500, 'ذخیره متادیتا ناموفق بود');
        }
        if (fromIndex) {
          fromIndex.imdbRating = newMovie.imdbRating;
          fromIndex.plotSummary = newMovie.plotSummary;
        }
        rollbackActions.push(() => {
          if (this._metadataStore) {
            this._metadataStore.remove(uid);
            this._metadataStore.flush();
          }
        });
      }

      if (indexTouched && movieKey) {
        rollbackActions.push(() => {
          this._indexer.removeMovieByKey(movieKey);
        });
      }

      // Persist cache asynchronously (A5 / P2c pattern) — catalog.json is rebuildable (I1)
      this._indexer.scheduleSave();

      // Broadcast via WebSocket (public-safe object, SEC-08)
      if (this._wsServer) {
        this._wsServer.broadcastMovieAdded(CatalogIndexer.toPublicMovie(fromIndex || newMovie));
      }

      // BUG-2: watcher.expect suppresses handleFileChange — invalidate so the
      // next diagnostics report includes this movie (no 30s stale window).
      if (this._diagnostics && typeof this._diagnostics.invalidate === 'function') {
        this._diagnostics.invalidate();
      }

      this._log(`  [MOVIE-CREATOR] Movie added: ${finalId} - ${movieData.title}`);
      return fromIndex || newMovie;
    } catch (error) {
      this._log(`  [MOVIE-CREATOR] Creation failed, rolling back: ${error.message}`);
      for (const rollback of rollbackActions.reverse()) {
        try {
          rollback();
        } catch (rollbackError) {
          console.error(`  [MOVIE-CREATOR] Rollback failed: ${rollbackError.message}`);
        }
      }
      throw error;
    }
  }

  _validateInputs(movieData, posterBuffer, posterExtension) {
    if (!movieData.title || movieData.title.trim() === '') {
      throw fail('TITLE_REQUIRED', 400, 'عنوان فیلم الزامی است');
    }

    if (!movieData.type || !MOVIE_TYPES.includes(movieData.type)) {
      throw fail('TYPE_INVALID', 400, 'نوع فیلم نامعتبر است');
    }

    if (movieData.type === 'Movie') {
      if (!movieData.year || movieData.year < 1900 || movieData.year > 2099) {
        throw fail('YEAR_INVALID', 400, 'سال انتشار برای فیلم الزامی است (1900-2099)');
      }
    }

    if (movieData.type === 'Movie') {
      if (!movieData.genres || movieData.genres.length === 0) {
        throw fail('GENRE_REQUIRED', 400, 'حداقل یک ژانر برای فیلم الزامی است');
      }
    }

    if (!posterBuffer || posterBuffer.length === 0) {
      throw fail('IMG_REQUIRED', 400, 'تصویر پوستر الزامی است');
    }

    if (!posterExtension || !IMAGE_EXTENSIONS.has(posterExtension.toLowerCase())) {
      throw fail('IMG_UNSUPPORTED', 400, 'فرمت تصویر نامعتبر است (jpg, jpeg, png, webp, avif)');
    }

    if (movieData.imdbRating !== undefined && movieData.imdbRating !== null) {
      const rating = parseFloat(movieData.imdbRating);
      if (Number.isNaN(rating) || rating < 0 || rating > 10) {
        throw fail('IMDB_INVALID', 400, 'امتیاز IMDB باید بین 0 تا 10 باشد');
      }
    }
  }

  _validateId(id, type) {
    if (type === 'Series') return;
    try {
      validateId(id);
    } catch (err) {
      throw fail('ID_INVALID', 400, err.message);
    }
    // assertIdFree throws with code ID_TAKEN → statusOf maps it to 409
    assertIdFree(this._indexer, id);
  }

  _generateNextId(type) {
    return generateNextId(this._indexer, type);
  }

  _buildFilename(id, title, year, type, extension) {
    try {
      // Shared builder (ARCH-03) — byte-identical to the old inline logic
      return buildMovieFilename({ id, title, year, type, extension });
    } catch (err) {
      if (err && err.code) throw err;
      throw fail('TITLE_INVALID', 400, err.message);
    }
  }

  _getTargetFolders(type, genres) {
    const folders = [];

    switch (type) {
      case 'Movie':
        for (const genre of genres) {
          try {
            safeSegment(genre, 'ژانر');
          } catch (err) {
            throw fail('GENRE_INVALID', 400, err.message);
          }
          folders.push(resolveInside(this._libraryPath, 'Movies', genre));
        }
        break;
      case 'Animation':
        folders.push(resolveTypeFolder(this._libraryPath, 'Animation'));
        break;
      case 'Iranian':
        folders.push(resolveTypeFolder(this._libraryPath, 'Iranian'));
        break;
      case 'Series':
        folders.push(resolveTypeFolder(this._libraryPath, 'Series'));
        break;
    }

    return folders;
  }

  _checkDuplicateFilenames(filename, targetFolders) {
    for (const folder of targetFolders) {
      const targetPath = path.join(folder, filename);
      if (fs.existsSync(targetPath)) {
        throw fail('FILE_EXISTS', 409, `فایل ${filename} قبلاً در ${folder} وجود دارد`);
      }
    }
  }

  _createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this._backupsDir, `catalog_backup_${timestamp}.json`);

      if (fs.existsSync(this._catalogPath)) {
        fs.copyFileSync(this._catalogPath, backupPath);
        this._log(`  [MOVIE-CREATOR] Backup created: ${path.basename(backupPath)}`);
      }

      return backupPath;
    } catch (err) {
      // Backup is best-effort — never block creation on it
      console.error(`  [MOVIE-CREATOR] Backup failed: ${err.message}`);
      return null;
    }
  }

  _ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  _buildMovieObject(movieData, id, filename, targetFolders) {
    const uid = movieData.type === 'Series'
      ? `series:${seriesKey(movieData.title)}`
      : String(id);

    const absolutePosterPath = targetFolders.length > 0 ? path.join(targetFolders[0], filename) : null;

    const movie = {
      uid,
      id: movieData.type === 'Series' ? null : String(id),
      title: movieData.title.trim(),
      year: movieData.year || null,
      genres: movieData.genres || [],
      type: movieData.type,
      absolutePosterPath,
      poster: null,
      imdbRating: movieData.imdbRating ? parseFloat(movieData.imdbRating) : null,
      plotSummary: movieData.plotSummary || null,
      _posterSet: true
    };
    movie.poster = CatalogIndexer.posterUrl(movie);
    return movie;
  }

  _rollbackBackup(backupPath) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      this._log(`  [MOVIE-CREATOR] Rolled back: removed backup ${path.basename(backupPath)}`);
    }
  }

  _rollbackFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this._log(`  [MOVIE-CREATOR] Rolled back: removed file ${path.basename(filePath)}`);
    }
  }

  _removeTempDir(dir) {
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(`  [MOVIE-CREATOR] Temp cleanup failed: ${err.message}`);
      }
    }
  }
}

module.exports = MovieCreator;
module.exports.statusOf = statusOf;
