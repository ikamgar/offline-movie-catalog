/**
 * Diagnostics Module
 *
 * Provides a comprehensive diagnostics report for the administrator.
 * Checks for common issues in the movie catalog and library structure.
 *
 * P3 B9 / DATA-15:
 *   - No per-movie existsSync — missing posters derived from the file index
 *   - Populates invalidFilenames, duplicateIds, conflictingMetadata,
 *     unknownTypes, orphanMetadata; includes games; storage from P2
 *   - Report cached 30 s; invalidate() on catalog:changed
 */

const { getWarnings } = require('./storage/warnings');
const { seriesKey } = require('./utils/series-key');

const CACHE_TTL_MS = 30000;

class Diagnostics {
  /**
   * @param {object} indexer - CatalogIndexer
   * @param {string} libraryPath - Library root (unused for hot path; kept for API)
   * @param {object|null} [metadataStore] - MetadataStore for orphanMetadata (DATA-15)
   */
  constructor(indexer, libraryPath, metadataStore = null) {
    this._indexer = indexer;
    this._libraryPath = libraryPath;
    this._metadataStore = metadataStore;
    this._cache = null;
    this._cacheAt = 0;
  }

  /** Drop the 30 s report cache (called on catalog:changed). */
  invalidate() {
    this._cache = null;
    this._cacheAt = 0;
  }

  /**
   * Run (or serve cached) full diagnostics report.
   * @returns {object} - Comprehensive diagnostics data
   */
  runFullReport() {
    const now = Date.now();
    if (this._cache && now - this._cacheAt < CACHE_TTL_MS) {
      return this._cache;
    }
    const report = this._buildReport();
    this._cache = report;
    this._cacheAt = now;
    return report;
  }

  _buildReport() {
    // Internal fields (absolutePosterPath) live on raw _movieMap entries —
    // getMovies() returns SEC-08 public copies that strip them.
    const rawMovies = Array.from(this._indexer._movieMap.values());
    const movies = rawMovies.map((m) => ({
      uid: m.uid,
      id: m.id,
      title: m.title,
      year: m.year,
      genres: m.genres,
      type: m.type,
      absolutePosterPath: m.absolutePosterPath
    }));
    const games = typeof this._indexer.getGames === 'function' ? this._indexer.getGames() : [];
    const fileIndex = this._indexer._fileIndex;
    const indexedPaths = new Set(fileIndex.keys());

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMovies: movies.length,
        totalGames: games.length,
        totalFiles: fileIndex.size,
        totalGenres: 0,
        typeCounts: {},
        yearRange: { min: Infinity, max: -Infinity }
      },
      issues: {
        duplicateIds: [],
        duplicateSeriesTitles: [],
        missingPosters: [],
        invalidFilenames: [],
        missingYears: [],
        unknownTypes: [],
        brokenLinks: [],
        emptyGenres: [],
        conflictingMetadata: [],
        orphanMetadata: []
      },
      stats: {
        genreDistribution: {},
        yearDistribution: {},
        topDecades: {},
        gamePlatforms: {}
      },
      // A7 — storage warnings (corrupt-quarantined / restored-from-backup / migrated-metadata)
      storage: {
        warnings: getWarnings()
      }
    };

    // Scan-time invalid filenames (B2 scanner.invalid — DATA-15)
    try {
      const invalid = this._indexer.getLastInvalid ? this._indexer.getLastInvalid() : [];
      report.issues.invalidFilenames = invalid.map((x) => ({
        file: x.file,
        reason: x.reason
      }));
    } catch { /* optional */ }

    const movieIdOccurrences = new Map();
    const seriesTitleOccurrences = new Map();

    for (const movie of movies) {
      if (movie.type === 'Series') {
        const key = seriesKey(movie.title);
        if (!seriesTitleOccurrences.has(key)) {
          seriesTitleOccurrences.set(key, []);
        }
        seriesTitleOccurrences.get(key).push(movie);
      } else {
        if (!movieIdOccurrences.has(movie.id)) {
          movieIdOccurrences.set(movie.id, []);
        }
        movieIdOccurrences.get(movie.id).push(movie);
      }

      report.summary.typeCounts[movie.type] = (report.summary.typeCounts[movie.type] || 0) + 1;

      if (movie.type === 'Movie' && movie.year && movie.year >= 1900 && movie.year <= 2099) {
        report.summary.yearRange.min = Math.min(report.summary.yearRange.min, movie.year);
        report.summary.yearRange.max = Math.max(report.summary.yearRange.max, movie.year);

        const decade = `${Math.floor(movie.year / 10) * 10}s`;
        report.stats.yearDistribution[movie.year] = (report.stats.yearDistribution[movie.year] || 0) + 1;
        report.stats.topDecades[decade] = (report.stats.topDecades[decade] || 0) + 1;
      } else if (movie.type === 'Movie') {
        report.issues.missingYears.push({
          id: movie.id,
          title: movie.title,
          year: movie.year
        });
      }

      for (const genre of (movie.genres || [])) {
        report.stats.genreDistribution[genre] = (report.stats.genreDistribution[genre] || 0) + 1;
      }

      if (movie.type === 'Movie' && (!movie.genres || movie.genres.length === 0)) {
        report.issues.emptyGenres.push({
          id: movie.id,
          title: movie.title
        });
      }

      // Missing poster — from file index only (no existsSync — DATA-15 / ARCH-04)
      if (!movie.absolutePosterPath || !indexedPaths.has(movie.absolutePosterPath)) {
        report.issues.missingPosters.push({
          id: movie.id,
          title: movie.title,
          expectedPath: movie.absolutePosterPath || null
        });
      }

      // Unknown media type
      if (!movie.type || movie.type === 'Unknown') {
        report.issues.unknownTypes.push({ id: movie.id, title: movie.title });
      }
    }

    // Games (B9 — include games in type counts + platform stats)
    for (const game of games) {
      report.summary.typeCounts.Game = (report.summary.typeCounts.Game || 0) + 1;
      for (const p of (game.platforms || [])) {
        report.stats.gamePlatforms[p] = (report.stats.gamePlatforms[p] || 0) + 1;
      }
    }

    for (const [id, occurrences] of movieIdOccurrences) {
      if (occurrences.length > 1) {
        report.issues.duplicateIds.push({
          id,
          count: occurrences.length,
          titles: occurrences.map(m => m.title),
          years: occurrences.map(m => m.year)
        });
      }
    }

    for (const [title, occurrences] of seriesTitleOccurrences) {
      if (occurrences.length > 1) {
        report.issues.duplicateSeriesTitles.push({
          title,
          count: occurrences.length,
          titles: occurrences.map(m => m.title)
        });
      }
    }

    // Broken links: file-index entries whose key no longer resolves to a movie
    // (stale index). Disk re-stat is deferred to the next scan/watcher — no existsSync.
    const movieKeys = new Set();
    for (const movie of movies) {
      if (movie.uid != null) movieKeys.add(this._indexer.constructor.getKey
        ? this._indexer.constructor.getKey(movie)
        : movie.uid);
    }
    // Prefer map keys from _movieMap when available
    try {
      for (const key of this._indexer._movieMap.keys()) movieKeys.add(key);
    } catch { /* optional */ }

    for (const [filePath, entry] of fileIndex) {
      if (entry && entry.key != null && !movieKeys.has(entry.key)) {
        report.issues.brokenLinks.push({
          path: filePath,
          id: entry.id
        });
      }
    }

    // Orphan metadata keys (DATA-10 / B9) — keys in metadata.json with no movie uid
    if (this._metadataStore && typeof this._metadataStore.orphans === 'function') {
      try {
        const uids = new Set();
        for (const movie of movies) {
          if (movie.uid != null) uids.add(String(movie.uid));
        }
        const orphanKeys = this._metadataStore.orphans(uids);
        report.issues.orphanMetadata = orphanKeys.map((key) => ({ key }));
      } catch { /* optional */ }
    }

    // Merge scan-time conflicts (DATA-05 / B4) — both file paths, never drop
    try {
      const scanIssues = this._indexer.runDiagnostics();
      for (const d of (scanIssues.duplicateIds || [])) {
        if (d.paths) {
          const existing = report.issues.duplicateIds.find(x => String(x.id) === String(d.id));
          if (existing) {
            existing.paths = d.paths;
            existing.types = d.types;
          } else {
            report.issues.duplicateIds.push(d);
          }
        }
      }
      if (Array.isArray(scanIssues.conflictingMetadata) && scanIssues.conflictingMetadata.length) {
        report.issues.conflictingMetadata = scanIssues.conflictingMetadata;
      }
      for (const u of (scanIssues.unknownTypes || [])) {
        if (!report.issues.unknownTypes.some(x => x.id === u.id)) {
          report.issues.unknownTypes.push(u);
        }
      }
    } catch { /* indexer diagnostics optional */ }

    report.summary.totalGenres = Object.keys(report.stats.genreDistribution).length;

    if (report.summary.yearRange.min === Infinity) report.summary.yearRange.min = null;
    if (report.summary.yearRange.max === -Infinity) report.summary.yearRange.max = null;

    report.summary.totalIssues = Object.values(report.issues)
      .reduce((sum, arr) => sum + arr.length, 0);

    return report;
  }
}

module.exports = Diagnostics;
