/**
 * Diagnostics Module
 *
 * Provides a comprehensive diagnostics report for the administrator.
 * Checks for common issues in the movie catalog and library structure.
 */

const fs = require('fs');
const path = require('path');

class Diagnostics {
  constructor(indexer, libraryPath) {
    this._indexer = indexer;
    this._libraryPath = libraryPath;
  }

  /**
   * Run a full diagnostics report.
   * @returns {object} - Comprehensive diagnostics data
   */
  runFullReport() {
    const movies = this._indexer.getMovies();
    const fileIndex = this._indexer._fileIndex;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMovies: movies.length,
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
        conflictingMetadata: []
      },
      stats: {
        genreDistribution: {},
        yearDistribution: {},
        topDecades: {}
      }
    };

    // Analyze each movie
    const movieIdOccurrences = new Map();
    const seriesTitleOccurrences = new Map();

    for (const movie of movies) {
      // Count occurrences — separate by type
      if (movie.type === 'Series') {
        const key = (movie.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
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

      // Track type counts
      report.summary.typeCounts[movie.type] = (report.summary.typeCounts[movie.type] || 0) + 1;

      // Track year range — only meaningful for Movie type
      if (movie.type === 'Movie' && movie.year && movie.year >= 1900 && movie.year <= 2099) {
        report.summary.yearRange.min = Math.min(report.summary.yearRange.min, movie.year);
        report.summary.yearRange.max = Math.max(report.summary.yearRange.max, movie.year);

        // Year distribution
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

      // Genre distribution
      for (const genre of (movie.genres || [])) {
        report.stats.genreDistribution[genre] = (report.stats.genreDistribution[genre] || 0) + 1;
      }

      // Empty genres — only an issue for Movie type
      if (movie.type === 'Movie' && (!movie.genres || movie.genres.length === 0)) {
        report.issues.emptyGenres.push({
          id: movie.id,
          title: movie.title
        });
      }

      // Check poster exists — use stored absolute path directly
      const posterPath = movie.absolutePosterPath;
      if (!posterPath || !fs.existsSync(posterPath)) {
        report.issues.missingPosters.push({
          id: movie.id,
          title: movie.title,
          expectedPath: posterPath
        });
      }
    }

    // Check for duplicate IDs (non-Series)
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

    // Check for duplicate Series titles
    for (const [title, occurrences] of seriesTitleOccurrences) {
      if (occurrences.length > 1) {
        report.issues.duplicateSeriesTitles.push({
          title,
          count: occurrences.length,
          titles: occurrences.map(m => m.title)
        });
      }
    }

    // Check for broken file references
    for (const [filePath, entry] of fileIndex) {
      if (!fs.existsSync(filePath)) {
        report.issues.brokenLinks.push({
          path: filePath,
          id: entry.id
        });
      }
    }

    // Summary counts
    report.summary.totalGenres = Object.keys(report.stats.genreDistribution).length;

    // Fix Infinity values
    if (report.summary.yearRange.min === Infinity) report.summary.yearRange.min = null;
    if (report.summary.yearRange.max === -Infinity) report.summary.yearRange.max = null;

    // Total issues count
    report.summary.totalIssues = Object.values(report.issues)
      .reduce((sum, arr) => sum + arr.length, 0);

    return report;
  }

  /**
   * Get a quick summary of issues (for the UI badge).
   */
  getQuickSummary() {
    const report = this.runFullReport();
    return {
      totalMovies: report.summary.totalMovies,
      totalIssues: report.summary.totalIssues,
      hasIssues: report.summary.totalIssues > 0
    };
  }
}

module.exports = Diagnostics;
