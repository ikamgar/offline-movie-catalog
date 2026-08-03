/**
 * Catalog Indexer Module
 *
 * Builds and maintains the in-memory movie index.
 * Handles deduplication, merging, persistence, and change detection.
 *
 * Architecture:
 *   Raw scan results → Deduplicate by ID → Merge genres → Build index → Persist to disk
 *
 * On startup:
 *   1. Load catalog.json from disk (previous state)
 *   2. Scan library for new/changed files
 *   3. Merge scan results into existing catalog
 *   4. Save updated catalog to disk
 *   5. Build in-memory index for fast API lookups
 */

const fs = require('fs');
const path = require('path');

/**
 * Normalize a Series title into a unique map key.
 * trim → collapse spaces → lowercase
 */
function seriesKey(title) {
  return (title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Compute the Map key for any movie based on its type.
 * Series use normalized title; everything else uses id.
 */
function getKey(movie) {
  if (movie.type === 'Series') return seriesKey(movie.title);
  return movie.id;
}

/**
 * Compute the poster URL for a movie based on its key.
 */
function posterUrl(movie) {
  const key = getKey(movie);
  return `/api/poster/${encodeURIComponent(key)}`;
}

/**
 * Generate a unique frontend ID (uid) for a movie.
 * Movie/Animation/Iranian: uid = id (string)
 * Series: uid = "series:<normalized-title>"
 */
function makeUid(type, id, title) {
  if (type === 'Series') return 'series:' + seriesKey(title);
  return String(id);
}

class CatalogIndexer {
  constructor(catalogPath) {
    this._catalogPath = catalogPath;
    this._catalog = { meta: {}, movies: [], fileIndex: {} };
    this._movieMap = new Map(); // id → movie object (fast lookup)
    this._fileIndex = new Map(); // absolutePath → { id, lastModified }
  }

  /**
   * Load the catalog from disk.
   * Returns the loaded catalog or an empty structure if no cache exists.
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(this._catalogPath)) {
        const raw = fs.readFileSync(this._catalogPath, 'utf-8');
        const data = JSON.parse(raw);
        this._catalog = data;

        // Rebuild in-memory maps
        this._movieMap.clear();
        this._fileIndex.clear();

        for (const movie of (data.movies || [])) {
          if (!movie.uid) {
            movie.uid = makeUid(movie.type, movie.id, movie.title);
          }
          this._movieMap.set(getKey(movie), movie);
        }

        for (const [filePath, entry] of Object.entries(data.fileIndex || {})) {
          this._fileIndex.set(filePath, entry);
        }

        console.log(`  [INDEXER] Loaded ${this._movieMap.size} movies from cache`);
        return data;
      }
    } catch (err) {
      console.error(`  [INDEXER] Failed to load cache: ${err.message}`);
    }

    return null;
  }

  /**
   * Create a timestamped backup of the current catalog file.
   * Called automatically before every save to prevent data loss.
   */
  _createBackup() {
    try {
      if (!fs.existsSync(this._catalogPath)) return;

      const backupDir = path.join(path.dirname(this._catalogPath), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `catalog_backup_${timestamp}.json`);

      fs.copyFileSync(this._catalogPath, backupPath);

      // Keep only last 10 backups to avoid disk bloat
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('catalog_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (let i = 10; i < backupFiles.length; i++) {
        fs.unlinkSync(path.join(backupDir, backupFiles[i]));
      }

      console.log(`  [INDEXER] Backup created: ${path.basename(backupPath)}`);
    } catch (err) {
      console.error(`  [INDEXER] Backup failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * Save the catalog to disk.
   * Automatically creates a backup before writing.
   */
  saveToDisk() {
    try {
      // Create backup before writing
      this._createBackup();

      this._catalog.meta = {
        version: '5.3.0',
        lastUpdated: new Date().toISOString(),
        totalMovies: this._movieMap.size
      };

      this._catalog.movies = Array.from(this._movieMap.values())
        .sort((a, b) => {
          // String comparison — IDs are strings, leading zeros matter
          if (a.id === null) return 1;
          if (b.id === null) return -1;
          return a.id.localeCompare(b.id);
        });

      // Convert fileIndex Map to plain object for JSON serialization
      this._catalog.fileIndex = {};
      for (const [key, val] of this._fileIndex) {
        this._catalog.fileIndex[key] = val;
      }

      fs.writeFileSync(this._catalogPath, JSON.stringify(this._catalog, null, 2), 'utf-8');
      console.log(`  [INDEXER] Saved catalog to disk: ${this._movieMap.size} movies`);
    } catch (err) {
      console.error(`  [INDEXER] Failed to save cache: ${err.message}`);
    }
  }

  /**
   * Process raw scan results: deduplicate, merge, and update the index.
   *
   * @param {Array<object>} scanResults - Raw results from the scanner
   * @returns {object} - Stats about what changed
   */
  processScanResults(scanResults) {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const currentFiles = new Set();

    // Build a map of current genres per movie key from this scan
    const currentGenres = new Map();
    for (const result of scanResults) {
      const key = getKey(result);
      if (!currentGenres.has(key)) {
        currentGenres.set(key, new Set());
      }
      for (const g of result.genres) {
        currentGenres.get(key).add(g);
      }
    }

    for (const result of scanResults) {
      const filePath = result.posterPath;
      currentFiles.add(filePath);
      const key = getKey(result);

      const existingFile = this._fileIndex.get(filePath);

      if (this._movieMap.has(key)) {
        // Always rebuild genres from current scan for existing movies
        const movie = this._movieMap.get(key);
        movie.genres = [...currentGenres.get(key)].sort();
        movie.type = result.type;
        movie.absolutePosterPath = result.posterPath;

        if (!existingFile || existingFile.lastModified !== result.lastModified) {
          if (!movie._posterSet) {
            movie.poster = posterUrl(movie);
            movie._posterSet = true;
          }
          updated++;
        } else {
          unchanged++;
        }
      } else {
        // New movie
        const uid = makeUid(result.type, result.id, result.title);
        const movie = {
          uid,
          id: result.id,
          title: result.title,
          year: result.year,
          genres: [...result.genres].sort(),
          type: result.type,
          absolutePosterPath: result.posterPath,
          _posterSet: true
        };
        movie.poster = posterUrl(movie);
        this._movieMap.set(key, movie);
        added++;
      }

      // Update file index
      this._fileIndex.set(filePath, {
        id: result.id,
        key: key,
        lastModified: result.lastModified
      });
    }

    // Detect deleted files
    let removed = 0;
    for (const [filePath, entry] of this._fileIndex) {
      if (!currentFiles.has(filePath)) {
        // File was deleted — check if any other files still exist for this movie
        const movieKey = entry.key;
        let hasOtherFiles = false;
        for (const [otherPath, otherEntry] of this._fileIndex) {
          if (otherPath !== filePath && otherEntry.key === movieKey) {
            hasOtherFiles = true;
            break;
          }
        }

        if (!hasOtherFiles && this._movieMap.has(movieKey)) {
          // No more poster files for this movie — remove it
          this._movieMap.delete(movieKey);
          removed++;
        }

        this._fileIndex.delete(filePath);
      }
    }

    // Sort genres for each movie
    for (const movie of this._movieMap.values()) {
      movie.genres.sort();
    }

    const stats = { added, updated, removed, unchanged, total: this._movieMap.size };
    console.log(`  [INDEXER] Scan complete: +${added} new, ~${updated} updated, -${removed} removed, ${unchanged} unchanged, ${stats.total} total`);
    return stats;
  }

  /**
   * Add a single file to the index (called by the watcher on file creation).
   */
  addFile(scanResult) {
    const key = getKey(scanResult);
    if (this._movieMap.has(key)) {
      const movie = this._movieMap.get(key);
      for (const g of scanResult.genres) {
        if (!movie.genres.includes(g)) {
          movie.genres.push(g);
        }
      }
      movie.genres.sort();
      movie.type = scanResult.type;
      movie.absolutePosterPath = scanResult.posterPath;
    } else {
      const uid = makeUid(scanResult.type, scanResult.id, scanResult.title);
      const movie = {
        uid,
        id: scanResult.id,
        title: scanResult.title,
        year: scanResult.year,
        genres: [...scanResult.genres].sort(),
        type: scanResult.type,
        absolutePosterPath: scanResult.posterPath,
        _posterSet: true
      };
      movie.poster = posterUrl(movie);
      this._movieMap.set(key, movie);
    }

    this._fileIndex.set(scanResult.posterPath, {
      id: scanResult.id,
      key: key,
      lastModified: scanResult.lastModified
    });

    return this._movieMap.get(key);
  }

  /**
   * Remove a file from the index (called by the watcher on file deletion).
   */
  removeFile(filePath) {
    const entry = this._fileIndex.get(filePath);
    if (!entry) return null;

    this._fileIndex.delete(filePath);

    const movieKey = entry.key;
    // Check if any other files exist for this movie
    for (const [otherPath, otherEntry] of this._fileIndex) {
      if (otherEntry.key === movieKey) {
        // Other files still exist — keep the movie
        return { action: 'kept', id: entry.id };
      }
    }

    // No more files — remove the movie
    const movie = this._movieMap.get(movieKey);
    this._movieMap.delete(movieKey);
    return { action: 'removed', id: entry.id, movie };
  }

  /**
   * Update a file in the index (called by the watcher on file modification).
   */
  updateFile(scanResult) {
    return this.addFile(scanResult);
  }

  /**
   * Get all movies as an array (for API response).
   */
  getMovies() {
    return Array.from(this._movieMap.values());
  }

  /**
   * Get a movie by its map key (URL-encoded in API routes).
   * Works for all types: Movie/Animation/Iranian use id as key, Series use normalized title.
   */
  getMovieById(id) {
    const key = decodeURIComponent(id);
    return this._movieMap.get(key) || null;
  }

  /**
   * Get the poster file path for a movie.
   * Uses the absolutePosterPath stored directly in the movie object.
   * The id parameter is the URL-encoded map key.
   */
  getPosterPath(id) {
    const key = decodeURIComponent(id);
    const movie = this._movieMap.get(key);
    if (movie && movie.absolutePosterPath) return movie.absolutePosterPath;
    return null;
  }

  /**
   * Get the total number of movies in the catalog.
   */
  get count() {
    return this._movieMap.size;
  }

  /**
   * Clear the entire in-memory index.
   * Used before a full rescan to ensure no stale data remains.
   */
  clear() {
    this._movieMap.clear();
    this._fileIndex.clear();
    this._catalog = { meta: {}, movies: [], fileIndex: {} };
    console.log('  [INDEXER] Index cleared');
  }

  /**
   * Replace the entire catalog from a fresh set of scan results.
   * Merges with previous state — preserves custom fields (imdbRating, plotSummary, edited titles).
   * Merges genres across files with the same ID within the scan.
   *
   * @param {Array<object>} scanResults - Complete fresh results from scanner
   * @returns {object} - Stats
   */
  replaceFromScan(scanResults) {
    // Save existing movie data for merging custom fields
    const existingMovies = new Map(this._movieMap);

    this.clear();

    // Step 1: Accumulate genres and file paths per key across all files
    const genreMap = new Map(); // key → Set of genres
    const movieData = new Map(); // key → { id, title, year, type } (first occurrence)
    const filesPerMovie = new Map(); // key → [{ posterPath, lastModified }]

    for (const result of scanResults) {
      const key = getKey(result);

      // Accumulate genres
      if (!genreMap.has(key)) {
        genreMap.set(key, new Set());
      }
      for (const g of result.genres) {
        genreMap.get(key).add(g);
      }

      // Keep first occurrence of movie metadata
      if (!movieData.has(key)) {
        movieData.set(key, result);
      }

      // Track ALL file paths for this key
      if (!filesPerMovie.has(key)) {
        filesPerMovie.set(key, []);
      }
      filesPerMovie.get(key).push({
        posterPath: result.posterPath,
        lastModified: result.lastModified
      });
    }

    // Step 2: Build the final movie entries with merged genres + preserved custom fields
    for (const [key, result] of movieData) {
      const mergedGenres = [...(genreMap.get(key) || [])].sort();
      const uid = makeUid(result.type, result.id, result.title);
      const existing = existingMovies.get(key);

      const movie = {
        uid,
        id: result.id,
        // Preserve manually edited title if it exists in the database
        title: (existing && existing.title) ? existing.title : result.title,
        year: result.year,
        genres: mergedGenres,
        type: result.type,
        absolutePosterPath: result.posterPath,
        _posterSet: true,
        // Preserve custom fields from existing data
        imdbRating: existing ? existing.imdbRating : null,
        plotSummary: existing ? existing.plotSummary : null
      };
      movie.poster = posterUrl(movie);
      this._movieMap.set(key, movie);

      // Index ALL file paths for this movie (multiple posters possible)
      for (const file of (filesPerMovie.get(key) || [])) {
        this._fileIndex.set(file.posterPath, {
          id: result.id,
          key: key,
          lastModified: file.lastModified
        });
      }
    }

    const stats = { total: this._movieMap.size };
    console.log(`  [INDEXER] Replaced catalog: ${stats.total} movies, ${this._fileIndex.size} files indexed`);
    return stats;
  }

  /**
   * Add a single movie to the in-memory index.
   * Called by MovieCreator after successful creation.
   *
   * @param {object} movie - Movie object to add
   */
  addMovieToIndex(movie) {
    const key = getKey(movie);
    this._movieMap.set(key, movie);
    console.log(`  [INDEXER] Added movie to index: ${movie.id} - ${movie.title}`);
  }

  /**
   * Remove a movie from the in-memory index.
   * Called during rollback if creation fails after catalog update.
   *
   * @param {string} movieId - Movie ID to remove
   */
  removeMovieFromIndex(movieId) {
    for (const [key, movie] of this._movieMap) {
      if (movie.id === movieId || String(movie.id) === String(movieId)) {
        this._movieMap.delete(key);
        console.log(`  [INDEXER] Removed movie from index: ${movieId}`);
        return;
      }
    }
  }

  /**
   * Run diagnostics on the catalog.
   * Returns an object with arrays of issues found.
   */
  runDiagnostics() {
    const issues = {
      duplicateIds: [],
      duplicateSeriesTitles: [],
      missingPosters: [],
      invalidFilenames: [],
      missingYears: [],
      unknownTypes: [],
      brokenLinks: [],
      emptyGenres: []
    };

    // Separate duplicate detection for Movies vs Series
    const movieIdCounts = new Map();   // id → count (Movie/Animation/Iranian)
    const seriesTitleCounts = new Map(); // normalized title → count (Series)

    for (const movie of this._movieMap.values()) {
      if (movie.type === 'Series') {
        const key = seriesKey(movie.title);
        seriesTitleCounts.set(key, (seriesTitleCounts.get(key) || 0) + 1);
      } else {
        movieIdCounts.set(movie.id, (movieIdCounts.get(movie.id) || 0) + 1);
      }
    }

    for (const [id, count] of movieIdCounts) {
      if (count > 1) {
        issues.duplicateIds.push({ id, count });
      }
    }

    for (const [title, count] of seriesTitleCounts) {
      if (count > 1) {
        issues.duplicateSeriesTitles.push({ title, count });
      }
    }

    // Check each movie
    for (const movie of this._movieMap.values()) {
      // Missing poster — use stored absolute path directly
      if (!movie.absolutePosterPath || !fs.existsSync(movie.absolutePosterPath)) {
        issues.missingPosters.push({ id: movie.id, title: movie.title });
      }

      // Missing year — only an issue for Movie type (Animation/Iranian/Series have null year by design)
      if (movie.type === 'Movie' && (!movie.year || movie.year < 1900 || movie.year > 2099)) {
        issues.missingYears.push({ id: movie.id, title: movie.title, year: movie.year });
      }

      // Unknown media type
      if (!movie.type || movie.type === 'Unknown') {
        issues.unknownTypes.push({ id: movie.id, title: movie.title });
      }

      // Empty genres — only an issue for Movie type (Animation/Iranian/Series have empty genres by design)
      if (movie.type === 'Movie' && (!movie.genres || movie.genres.length === 0)) {
        issues.emptyGenres.push({ id: movie.id, title: movie.title });
      }
    }

    // Check for broken file references
    for (const [filePath, entry] of this._fileIndex) {
      if (!fs.existsSync(filePath)) {
        issues.brokenLinks.push({ path: filePath, id: entry.id });
      }
    }

    return issues;
  }
}

module.exports = CatalogIndexer;
