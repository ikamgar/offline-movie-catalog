'use strict';
/**
 * ARCH-03 (P7a F2) — backend/constants.js and backend/utils/series-key.js
 * are the single source of truth: parser, role-provider, indexer and the
 * write endpoints must all read the same lists, and the Persian wording
 * pinned by invariants I11/I12 must not drift.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROTOCOL_VERSION,
  WS_ROLES,
  MEDIA_TYPES,
  MOVIE_TYPES,
  IMAGE_EXTENSIONS,
  TYPE_LABELS,
  BADGE_LABELS,
  PINNED_GENRES
} = require('../../backend/constants');
const { seriesKey } = require('../../backend/utils/series-key');
const parser = require('../../backend/parser');
const CatalogIndexer = require('../../backend/indexer');
const { VALID_ROLES } = require('../../server/auth/role-provider');

describe('backend/constants.js', () => {
  it('IMAGE_EXTENSIONS matches the parser-enforced Set (one list)', () => {
    assert.ok(parser.IMAGE_EXTENSIONS instanceof Set);
    assert.deepEqual([...IMAGE_EXTENSIONS].sort(), [...parser.IMAGE_EXTENSIONS].sort());
  });

  it('WS_ROLES matches exactly what role-provider accepts', () => {
    assert.deepEqual([...VALID_ROLES].sort(), [...WS_ROLES].sort());
    assert.equal(VALID_ROLES.size, WS_ROLES.length);
  });

  it('MOVIE_TYPES is MEDIA_TYPES without Game', () => {
    assert.deepEqual(MOVIE_TYPES, MEDIA_TYPES.filter(t => t !== 'Game'));
    assert.ok(MEDIA_TYPES.includes('Game'));
  });

  it('PROTOCOL_VERSION stays 3 until a message-shape change bumps it', () => {
    assert.equal(PROTOCOL_VERSION, 3);
  });

  it('Persian type labels are the wording the UI relies on', () => {
    assert.deepEqual(TYPE_LABELS, {
      Movie: 'فیلم',
      Series: 'سریال',
      Animation: 'انیمیشن',
      Iranian: 'ایرانی',
      Game: 'بازی'
    });
  });

  it('Persian badge labels are the I12 wording', () => {
    assert.deepEqual(BADGE_LABELS, {
      animation: 'انیمیشن دوبله',
      series: 'سریال',
      dubbed: 'دوبله فارسی',
      subtitle: 'زیرنویس فارسی'
    });
  });

  it('pinned genres are the I11 order', () => {
    assert.deepEqual(PINNED_GENRES, ['دوبله فارسی', 'اکشن', 'عاشقانه']);
  });
});

describe('backend/utils/series-key.js', () => {
  it('trims, collapses whitespace runs and lower-cases (I5)', () => {
    assert.equal(seriesKey('  The   Office  '), 'the office');
    assert.equal(seriesKey('Westworld'), 'westworld');
    assert.equal(seriesKey(null), '');
    assert.equal(seriesKey(undefined), '');
  });

  it('whitespace collapsing: "Breaking  Bad" with extra spaces and "Breaking Bad" must give the same key (SERIES-KEY-WHITESPACE)', () => {
    assert.equal(seriesKey('Breaking  Bad'), 'breaking bad');
    assert.equal(seriesKey('Breaking  Bad'), seriesKey('Breaking Bad'));
  });

  it('indexer re-exports the SAME function — no second copy', () => {
    assert.equal(CatalogIndexer.seriesKey, seriesKey);
  });
});
