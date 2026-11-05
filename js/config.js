/**
 * Front-end holder for the server config (`GET /api/config`).
 *
 * Empty until store.boot() fills it ONCE; consumers read at call time, so
 * nothing has to be threaded through function signatures (buildSearchIndex,
 * getBadge, … keep their shapes). The values live in backend/constants.js
 * (single source of truth) — never duplicate the Persian labels or the
 * type/extension lists in this file.
 */

/** Mutable holder — always the same object, so imports stay live. */
export const config = {};

/**
 * Merge the server payload into the holder. Safe to call once per boot.
 * @param {object} next - the GET /api/config payload
 */
export function applyConfig(next) {
  if (next && typeof next === 'object') Object.assign(config, next);
}
