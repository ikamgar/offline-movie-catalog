'use strict';

/**
 * Canonical Series-title normalisation (Invariant I5): trim, collapse
 * runs of whitespace to single spaces, lower-case.
 *
 * Every `series:<title>` uid and every Series map key MUST be built with
 * this one function — CatalogIndexer re-exports it for call sites that
 * already import the indexer (ARCH-03).
 *
 * @param {string} title
 * @returns {string}
 */
function seriesKey(title) {
  return (title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

module.exports = { seriesKey };
