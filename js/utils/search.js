/**
 * Search module (P5a / D2 — closes FE-07, FE-03).
 *
 * One normalised haystack is precomputed per catalog item on load
 * (title + id + year + genres + type labels in Persian and English).
 * null/undefined fields are SKIPPED — never stringified — so a query
 * like "null" can never match Series or no-year items.
 *
 * Query pipeline: normalizeFa → tokenise on spaces → AND the tokens.
 * Ranking: exact ID match (0) → title prefix (1) → contains (2).
 * The rank sort is stable, so ties keep the caller's (I11 type-rule) order.
 */

import { normalizeFa } from './text.js';
import { config } from '../config.js';

const RANK_EXACT_ID = 0;
const RANK_TITLE_PREFIX = 1;
const RANK_CONTAINS = 2;

function pushPart(parts, value) {
  if (value === null || value === undefined || value === '') return;
  if (Array.isArray(value)) {
    for (const v of value) pushPart(parts, v);
    return;
  }
  parts.push(String(value));
}

/**
 * Build the search entry for one catalog item.
 * @returns {{item: object, id: string, title: string, hay: string}}
 */
export function buildSearchEntry(item) {
  const parts = [];
  pushPart(parts, item.title);
  pushPart(parts, item.id);
  pushPart(parts, item.year);
  pushPart(parts, item.genres);
  pushPart(parts, item.type);
  pushPart(parts, config.typeLabels?.[item.type]);
  pushPart(parts, item.platforms);

  return {
    item,
    id: item.id !== null && item.id !== undefined ? normalizeFa(item.id) : '',
    title: item.title !== null && item.title !== undefined ? normalizeFa(item.title) : '',
    hay: normalizeFa(parts.join(' '))
  };
}

/** Precompute the index for a full catalog array. */
export function buildSearchIndex(items) {
  return items.map(buildSearchEntry);
}

function matchRank(entry, tokens, fullQuery) {
  for (const t of tokens) {
    if (!entry.hay.includes(t)) return -1;
  }
  if (entry.id && entry.id === fullQuery) return RANK_EXACT_ID;
  if (entry.title && entry.title.startsWith(fullQuery)) return RANK_TITLE_PREFIX;
  return RANK_CONTAINS;
}

/**
 * Filter `items` (a subset of `index`) by the normalised query.
 * Returns matches ordered by rank; equal ranks fall through to the optional
 * `tieBreak` comparator (the caller's type-specific sort — I11), so browsing
 * order survives as the tie-break without re-sorting the whole catalog.
 * Empty/whitespace query returns `items` unchanged.
 *
 * @param {Array} items   category-filtered list
 * @param {Array} index   entries from buildSearchIndex for the full catalog
 * @param {string} query  raw user query
 * @param {function} [tieBreak] comparator for equal ranks (e.g. compareAllMovies)
 * @returns {Array} filtered items
 */
export function searchItems(items, index, query, tieBreak) {
  const normalized = normalizeFa(query);
  const tokens = normalized ? normalized.split(' ').filter(Boolean) : [];
  if (!tokens.length) return items;
  const fullQuery = tokens.join(' ');

  const restrict = items.length === index.length ? null : new Set(items);
  const matched = [];
  for (const entry of index) {
    if (restrict && !restrict.has(entry.item)) continue;
    const rank = matchRank(entry, tokens, fullQuery);
    if (rank >= 0) matched.push({ item: entry.item, rank });
  }

  matched.sort((a, b) =>
    (a.rank - b.rank) || (tieBreak ? tieBreak(a.item, b.item) : 0));
  return matched.map(m => m.item);
}
