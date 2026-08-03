/**
 * Movie Creator Service
 *
 * Handles atomic movie creation with rollback on failure.
 * Uses catalog.json as source of truth for ID generation.
 * Copies posters to all selected genre folders.
 *
 * Architecture:
 *   1. Validate all inputs
 *   2. Generate next available ID from database
 *   3. Create timestamped backup
 *   4. Copy poster to all genre folders
 *   5. Update catalog.json
 *   6. Broadcast via WebSocket
 *   7. If ANY step fails → rollback all previous steps
 */

const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

class MovieCreator {
  /**
   * @param {string} libraryPath - Root Library path
   * @param {string} catalogPath - Path to catalog.json
   * @param {object} indexer - CatalogIndexer instance
   * @param {object|null} wsServer - WebSocket server for broadcasting
   */
  constructor(libraryPath, catalogPath, indexer, wsServer = null) {
    this._libraryPath = libraryPath;
    this._catalogPath = catalogPath;
    this._backupsDir = path.join(path.dirname(catalogPath), 'backups');
    this._indexer = indexer;
    this._wsServer = wsServer;

    // Ensure backups directory exists
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
   * @returns {object} - Created movie object
   * @throws {Error} - If any step fails (with rollback)
   */
  async createMovie(movieData, posterBuffer, posterExtension) {
    const rollbackActions = [];

    try {
      // Step 1: Validate all inputs
      this._validateInputs(movieData, posterBuffer, posterExtension);

      // Step 2: Generate next available ID from database
      const nextId = this._generateNextId(movieData.type);
      const finalId = movieData.id && movieData.id.trim() !== '' ? movieData.id.trim() : nextId;

      // Step 3: Validate the final ID
      this._validateId(finalId, movieData.type);

      // Step 4: Build filename and determine target folders
      const filename = this._buildFilename(finalId, movieData.title, movieData.year, movieData.type, posterExtension);
      const targetFolders = this._getTargetFolders(movieData.type, movieData.genres);

      // Step 5: Check for duplicate filenames
      this._checkDuplicateFilenames(filename, targetFolders);

      // Step 6: Create timestamped backup
      const backupPath = this._createBackup();
      rollbackActions.push(() => this._rollbackBackup(backupPath));

      // Step 7: Write poster to temp file, then copy to all genre folders
      const tempDir = path.join(this._libraryPath, '.tmp');
      this._ensureDirectory(tempDir);
      const tempPosterPath = path.join(tempDir, `upload_${Date.now()}_${filename}`);
      fs.writeFileSync(tempPosterPath, posterBuffer);
      rollbackActions.push(() => this._rollbackFile(tempPosterPath));

      for (const folder of targetFolders) {
        const targetPath = path.join(folder, filename);
        this._ensureDirectory(folder);
        fs.copyFileSync(tempPosterPath, targetPath);
        rollbackActions.push(() => this._rollbackFile(targetPath));
      }

      // Clean up temp file after all copies succeed
      if (fs.existsSync(tempPosterPath)) {
        fs.unlinkSync(tempPosterPath);
      }

      // Step 8: Update catalog.json
      const newMovie = this._buildMovieObject(movieData, finalId, filename, targetFolders);
      this._updateCatalog(newMovie);
      rollbackActions.push(() => this._rollbackCatalogUpdate(newMovie.id));

      // Step 9: Broadcast via WebSocket
      if (this._wsServer) {
        this._wsServer.broadcastMovieAdded(newMovie);
      }

      return newMovie;

    } catch (error) {
      // Rollback all completed steps
      console.error(`  [MOVIE-CREATOR] Creation failed, rolling back: ${error.message}`);
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

  /**
   * Validate all inputs before any filesystem operation.
   */
  _validateInputs(movieData, posterBuffer, posterExtension) {
    // Validate required fields
    if (!movieData.title || movieData.title.trim() === '') {
      throw new Error('عنوان فیلم الزامی است');
    }

    if (!movieData.type || !['Movie', 'Animation', 'Iranian', 'Series'].includes(movieData.type)) {
      throw new Error('نوع فیلم نامعتبر است');
    }

    // Validate year for Movie type
    if (movieData.type === 'Movie') {
      if (!movieData.year || movieData.year < 1900 || movieData.year > 2099) {
        throw new Error('سال انتشار برای فیلم الزامی است (1900-2099)');
      }
    }

    // Validate genres for Movie type
    if (movieData.type === 'Movie') {
      if (!movieData.genres || movieData.genres.length === 0) {
        throw new Error('حداقل یک ژانر برای فیلم الزامی است');
      }
    }

    // Validate poster
    if (!posterBuffer || posterBuffer.length === 0) {
      throw new Error('تصویر پوستر الزامی است');
    }

    if (!posterExtension || !IMAGE_EXTENSIONS.has(posterExtension.toLowerCase())) {
      throw new Error('فرمت تصویر نامعتبر است (jpg, jpeg, png, webp, avif)');
    }

    // Validate IMDB rating if provided
    if (movieData.imdbRating !== undefined && movieData.imdbRating !== null) {
      const rating = parseFloat(movieData.imdbRating);
      if (isNaN(rating) || rating < 0 || rating > 10) {
        throw new Error('امتیاز IMDB باید بین 0 تا 10 باشد');
      }
    }
  }

  /**
   * Validate the final ID for conflicts.
   */
  _validateId(id, type) {
    // Check if ID already exists in catalog
    const existingMovie = this._indexer.getMovieById(id);
    if (existingMovie) {
      throw new Error(`شناسه ${id} قبلاً استفاده شده است`);
    }
  }

  /**
   * Generate next available ID from the database (not filesystem).
   *
   * @param {string} type - Movie type
   * @returns {string} - Next available ID
   */
  _generateNextId(type) {
    const movies = this._indexer.getMovies();
    let maxId = 0;

    // Filter movies by type and find highest ID
    for (const movie of movies) {
      if (movie.type === type && movie.id) {
        const numId = parseInt(movie.id, 10);
        if (!isNaN(numId) && numId > maxId) {
          maxId = numId;
        }
      }
    }

    // Generate next ID based on type
    const nextNum = maxId + 1;

    switch (type) {
      case 'Movie':
        return String(nextNum).padStart(4, '0');
      case 'Animation':
        return String(nextNum).padStart(5, '0');
      case 'Iranian':
        return String(nextNum).padStart(4, '0');
      case 'Series':
        return null; // Series don't use IDs
      default:
        return String(nextNum);
    }
  }

  /**
   * Build the final filename following existing conventions.
   */
  _buildFilename(id, title, year, type, extension) {
    const cleanTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim();

    switch (type) {
      case 'Movie':
        return `${id}- ${cleanTitle} ${year}.${extension}`;
      case 'Animation':
        return `${id}-${cleanTitle}.${extension}`;
      case 'Iranian':
        return `${id}-${cleanTitle}.${extension}`;
      case 'Series':
        return `${cleanTitle}.${extension}`;
      default:
        return `${id}-${cleanTitle}.${extension}`;
    }
  }

  /**
   * Get target folders based on type and genres.
   */
  _getTargetFolders(type, genres) {
    const folders = [];

    switch (type) {
      case 'Movie':
        // Copy to each selected genre folder
        for (const genre of genres) {
          folders.push(path.join(this._libraryPath, 'Movies', genre));
        }
        break;
      case 'Animation':
        folders.push(path.join(this._libraryPath, 'Animation'));
        break;
      case 'Iranian':
        folders.push(path.join(this._libraryPath, 'Iranian'));
        break;
      case 'Series':
        folders.push(path.join(this._libraryPath, 'Serries'));
        break;
    }

    return folders;
  }

  /**
   * Check for duplicate filenames in target folders.
   */
  _checkDuplicateFilenames(filename, targetFolders) {
    for (const folder of targetFolders) {
      const targetPath = path.join(folder, filename);
      if (fs.existsSync(targetPath)) {
        throw new Error(`فایل ${filename} قبلاً در ${folder} وجود دارد`);
      }
    }
  }

  /**
   * Create a timestamped backup of catalog.json.
   */
  _createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this._backupsDir, `catalog_backup_${timestamp}.json`);

    if (fs.existsSync(this._catalogPath)) {
      fs.copyFileSync(this._catalogPath, backupPath);
      console.log(`  [MOVIE-CREATOR] Backup created: ${path.basename(backupPath)}`);
    }

    return backupPath;
  }

  /**
   * Ensure a directory exists (create if needed).
   */
  _ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Build the movie object for the catalog.
   */
  _buildMovieObject(movieData, id, filename, targetFolders) {
    const uid = movieData.type === 'Series'
      ? `series:${movieData.title.trim().replace(/\s+/g, ' ').toLowerCase()}`
      : String(id);

    const posterPath = `/api/poster/${encodeURIComponent(uid)}`;
    const absolutePosterPath = targetFolders.length > 0 ? path.join(targetFolders[0], filename) : null;

    return {
      uid,
      id: movieData.type === 'Series' ? null : String(id),
      title: movieData.title.trim(),
      year: movieData.year || null,
      genres: movieData.genres || [],
      type: movieData.type,
      absolutePosterPath,
      poster: posterPath,
      imdbRating: movieData.imdbRating ? parseFloat(movieData.imdbRating) : null,
      plotSummary: movieData.plotSummary || null,
      _posterSet: true
    };
  }

  /**
   * Update catalog.json with the new movie.
   */
  _updateCatalog(newMovie) {
    try {
      const catalogData = JSON.parse(fs.readFileSync(this._catalogPath, 'utf-8'));
      if (!catalogData.movies) {
        catalogData.movies = [];
      }

      catalogData.movies.push(newMovie);
      catalogData.meta.lastUpdated = new Date().toISOString();
      catalogData.meta.totalMovies = catalogData.movies.length;

      fs.writeFileSync(this._catalogPath, JSON.stringify(catalogData, null, 2), 'utf-8');

      // Update in-memory index
      this._indexer.addMovieToIndex(newMovie);

      console.log(`  [MOVIE-CREATOR] Movie added to catalog: ${newMovie.id} - ${newMovie.title}`);
    } catch (error) {
      throw new Error(`Failed to update catalog: ${error.message}`);
    }
  }

  /**
   * Rollback: Remove a backup file.
   */
  _rollbackBackup(backupPath) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      console.log(`  [MOVIE-CREATOR] Rolled back: removed backup ${path.basename(backupPath)}`);
    }
  }

  /**
   * Rollback: Remove a copied poster file.
   */
  _rollbackFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  [MOVIE-CREATOR] Rolled back: removed file ${path.basename(filePath)}`);
    }
  }

  /**
   * Rollback: Remove movie from catalog.json.
   */
  _rollbackCatalogUpdate(movieId) {
    try {
      const catalogData = JSON.parse(fs.readFileSync(this._catalogPath, 'utf-8'));
      if (catalogData.movies) {
        catalogData.movies = catalogData.movies.filter(m => m.id !== movieId);
        catalogData.meta.totalMovies = catalogData.movies.length;
        fs.writeFileSync(this._catalogPath, JSON.stringify(catalogData, null, 2), 'utf-8');
      }

      // Remove from in-memory index
      this._indexer.removeMovieFromIndex(movieId);

      console.log(`  [MOVIE-CREATOR] Rolled back: removed movie ${movieId} from catalog`);
    } catch (error) {
      console.error(`  [MOVIE-CREATOR] Catalog rollback failed: ${error.message}`);
    }
  }
}

module.exports = MovieCreator;
