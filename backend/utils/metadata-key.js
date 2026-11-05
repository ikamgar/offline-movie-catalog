'use strict';

/**
 * ONE definition of the manager-metadata key (F41 / DATA-10).
 *
 * data/metadata.json and every attach/lookup in the indexer MUST go through
 * metadataKeyFor() — no call site may build or guess a metadata key string
 * itself. The key format is the item's uid (invariant I6):
 *
 *   Movie / Animation / Iranian → the id string with leading zeros ("0001")
 *   Series                      → "series:<normalised title>" (series-key.js)
 *   Game                        → "game:<normalised title>" — DEFINED by the
 *                                 same uid pipeline (I6), but games carry no
 *                                 editor metadata (game-editor never wires the
 *                                 store, docs/audit/AUDIT-P9c.md §3), so this helper returns
 *                                 null for uid-less game objects and nothing
 *                                 game-shaped is ever attached here. The F41
 *                                 journey test pins this contract.
 *
 * When the movie object carries a uid it is used directly — it IS the
 * canonical key. The derivations below only cover raw objects (catalog
 * migration rows, freshly built objects) and must produce the same string the
 * uid pipeline would.
 *
 * F41 regression context: the scan-rebuild attach passed the indexer's MAP
 * key ("Movie:0001" / bare seriesKey) while the store keys bare uids
 * ("0001" / "series:…") — ratings and plots became unreachable right after
 * every restart or rescan (first bad commit 724b8178).
 */

const { seriesKey } = require('./series-key');

/**
 * @param {{ type?: string, id?: string, title?: string, uid?: string }|null|undefined} movie
 * @returns {string|null} the metadata key, or null when it cannot be derived
 *   (no id/title to derive from, or a uid-less game).
 */
function metadataKeyFor(movie) {
  if (!movie || typeof movie !== 'object') return null;
  if (movie.uid != null && movie.uid !== '') return String(movie.uid);
  if (movie.type === 'Series' && movie.title) return 'series:' + seriesKey(movie.title);
  if (movie.type === 'Game') return null;
  return movie.id != null && String(movie.id) !== '' ? String(movie.id) : null;
}

module.exports = { metadataKeyFor };
