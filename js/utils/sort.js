/**
 * Centralized Type-Aware Sorting Module
 *
 * Single source of truth for all movie list ordering.
 * Each media type has its own sorting strategy.
 *
 * v5.3.0: Version update
 */

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Extract the numeric value from an ID string.
 * Preserves leading zeros for display but compares numerically.
 *   "00452" → 452
 *   "9821"  → 9821
 *   null    → -1
 */
function numericId(id) {
  if (id === null || id === undefined) return -1;
  const str = String(id);
  const num = parseInt(str, 10);
  return isNaN(num) ? -1 : num;
}

/**
 * Normalize a Series title for alphabetical comparison.
 * - Converts to lowercase
 * - Strips leading articles: The, A, An (English and Persian variants)
 * - Trims whitespace
 *
 * Examples:
 *   "The Boys"       → "boys"
 *   "A Quiet Place"   → "quiet place"
 *   "An Education"    → "education"
 *   "Breaking Bad"    → "breaking bad"
 */
function normalizedSeriesTitle(title) {
  if (!title) return '';
  let t = title.toLowerCase().trim();
  // Strip leading articles (English)
  t = t.replace(/^(the|a|an)\s+/i, '');
  // Strip leading articles (Persian)
  t = t.replace(/^(یک|آن)\s+/i, '');
  return t.trim();
}

// ─── Type Comparators ────────────────────────────────────────────────────────

/**
 * Movie comparator:
 *   Year DESC → ID DESC
 *
 * Animation comparator:
 *   Same as Movie: Year DESC → ID DESC
 *   (IDs may have leading zeros; always compare numerically)
 */
function compareMovie(a, b) {
  // Year DESC
  const ya = a.year || 0;
  const yb = b.year || 0;
  if (ya !== yb) return yb - ya;

  // ID DESC (numeric)
  const na = numericId(a.id);
  const nb = numericId(b.id);
  return nb - na;
}

/**
 * Iranian comparator:
 *   Ignore year. ID DESC only.
 */
function compareIranian(a, b) {
  const na = numericId(a.id);
  const nb = numericId(b.id);
  return nb - na;
}

/**
 * Series comparator:
 *   Alphabetical by normalized title (case-insensitive, ignoring articles).
 *   Uses locale-aware comparison for natural ordering.
 */
function compareSeries(a, b) {
  const ta = normalizedSeriesTitle(a.title);
  const tb = normalizedSeriesTitle(b.title);
  return ta.localeCompare(tb, 'en', { numeric: true, sensitivity: 'base' });
}

// ─── Type Priority for "All Movies" ─────────────────────────────────────────

/**
 * Type priority for "All Movies" view.
 * Lower number = higher priority (appears first).
 */
const TYPE_PRIORITY = {
  'Movie': 0,
  'Iranian': 1,
  'Animation': 2,
  'Series': 3
};

// ─── Main Sorting Entry Point ────────────────────────────────────────────────

/**
 * Compare two movies using type-aware logic.
 * This is the single comparator used everywhere.
 *
 * Stable: if a and b are equal according to type rules, returns 0
 * (preserves insertion order in stable sort implementations).
 */
function compareMovies(a, b) {
  const type = a.type;

  switch (type) {
    case 'Movie':
    case 'Animation':
      return compareMovie(a, b);
    case 'Iranian':
      return compareIranian(a, b);
    case 'Series':
      return compareSeries(a, b);
    default:
      // Fallback: year DESC, then title ASC
      const ya = a.year || 0;
      const yb = b.year || 0;
      if (ya !== yb) return yb - ya;
      return (a.title || '').localeCompare(b.title || '', 'en', { numeric: true });
  }
}

/**
 * Compare two movies for "All Movies" view.
 * Groups by type priority: Movie → Iranian → Animation → Series.
 * Within each group, uses the existing type-specific comparator.
 */
function compareAllMovies(a, b) {
  const pa = TYPE_PRIORITY[a.type] ?? 4;
  const pb = TYPE_PRIORITY[b.type] ?? 4;

  if (pa !== pb) return pa - pb;

  return compareMovies(a, b);
}

/**
 * Sort an array of movies in-place using type-aware logic.
 * Returns the same array for chaining.
 *
 * @param {Array<object>} movies - Array of movie objects
 * @returns {Array<object>} - The sorted array (same reference)
 */
function sortMovies(movies) {
  movies.sort(compareMovies);
  return movies;
}

/**
 * Create a type-aware comparator function suitable for Array.prototype.sort().
 * Useful when you need to pass a comparator to third-party code.
 *
 * @returns {function} Comparator function
 */
function getMovieComparator() {
  return compareMovies;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  numericId,
  normalizedSeriesTitle,
  compareMovie,
  compareIranian,
  compareSeries,
  compareMovies,
  compareAllMovies,
  sortMovies,
  getMovieComparator
};
