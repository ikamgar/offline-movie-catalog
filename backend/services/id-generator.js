'use strict';

/**
 * Global ID generator (D2 default).
 *
 * nextId(indexer, type) = (max numeric id over ALL non-Series types) + 1,
 * zero-padded to the type's width (Movie 4, Animation 5, Iranian 4).
 * assertIdFree(indexer, id) checks across types.
 */

const TYPE_PAD = { Movie: 4, Animation: 5, Iranian: 4 };

/**
 * Next free ID across all non-Series types, padded for the requested type.
 * @param {object} indexer - CatalogIndexer
 * @param {string} type - Movie | Animation | Iranian | Series
 * @returns {string|null} null for Series
 */
function nextId(indexer, type) {
  if (type === 'Series') return null;

  let maxId = 0;
  for (const movie of indexer.getMovies()) {
    if (movie.type === 'Series' || !movie.id) continue;
    const n = parseInt(movie.id, 10);
    if (!Number.isNaN(n) && n > maxId) maxId = n;
  }

  const next = maxId + 1;
  const pad = TYPE_PAD[type] || 4;
  return String(next).padStart(pad, '0');
}

/**
 * Throw if the ID is already used by any type (cross-type uniqueness).
 * @param {object} indexer
 * @param {string} id
 */
function assertIdFree(indexer, id) {
  const existing = indexer.getMovieById(String(id));
  if (existing) {
    const err = new Error(`شناسه ${id} قبلاً استفاده شده است`);
    err.code = 'ID_TAKEN';
    throw err;
  }
}

module.exports = { nextId, assertIdFree };
