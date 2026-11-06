'use strict';

/**
 * Canonical Game-title normalisation (Invariants I6/I8): trim, collapse
 * runs of whitespace to single spaces, lower-case.
 *
 * Every `game:<title>` uid, every _gamesMap key, game-editor lookup,
 * and movie-trash game collection MUST use this shared function (F26).
 *
 * @param {string} title
 * @returns {string}
 */
function gameKey(title) {
  return String(title == null ? '' : title)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

module.exports = { gameKey };
