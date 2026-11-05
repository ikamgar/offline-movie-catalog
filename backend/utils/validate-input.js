'use strict';

/**
 * Shared input validator for create / edit / preview routes (F29, F36).
 *
 * One validation function used by POST /api/movies, POST /api/games,
 * PUT /api/movies/by-uid/:uid, PUT /api/movies/:id and POST /api/movies/preview
 * so every route rejects wrong-typed or malformed input with a structured
 * 400 (code + Persian message) instead of a 500 with a raw JavaScript message.
 *
 * This is a TYPE GUARD: it validates the shape/format of fields that ARE
 * present. Required-field checks (poster, title for create, genres for
 * Movie, etc.) remain with the service layer. Fields that are absent are
 * simply not validated.
 *
 * Returns { ok: true, data: { ...normalised fields...} }
 *      or { ok: false, status: 400, code: '...', error: '...' }
 *
 * Persian user-visible strings are pinned (AGENTS §2); codes are mapped by
 * the client to UI behaviour and never parsed.
 */

const { MEDIA_TYPES } = require('../constants');

const MAX_TITLE_LEN = 200;
const MAX_GAME_TITLE_LEN = 120;
const MAX_GENRES = 30;
const MAX_GENRE_LEN = 60;

function fail(code, status, message) {
  const err = new Error(message);
  err.ok = false;
  err.code = code;
  err.status = status;
  err.error = message;
  return err;
}

/**
 * Validate and normalise create/edit/preview input (type guard).
 * Fields that are absent are skipped; present fields are checked for type
 * and format. Required-field enforcement stays with the service layer.
 * @param {object} input - raw req.body fields
 * @param {object} [options]
 * @param {boolean} [options.isGame] - true for game routes (title cap 120)
 * @param {boolean} [options.allowId] - id field allowed (movie routes)
 * @returns {{ok: true, data: object} | {ok: false, status: number, code: string, error: string}}
 */
function validateInput(input, options = {}) {
  const {
    isGame = false,
    requirePoster = true,
    allowId = true
  } = options;

  if (!input || typeof input !== 'object') {
    return fail('VALIDATION', 400, 'بدنه درخواست نامعتبر است');
  }

  // ─── id ────────────────────────────────────────────────────────────────
  if (allowId && input.id != null) {
    if (typeof input.id !== 'string') {
      return fail('ID_INVALID', 400, 'شناسه فیلم نامعتبر است');
    }
    const idStr = input.id.trim();
    if (idStr !== '' && !/^\d{1,6}$/.test(idStr)) {
      return fail('ID_INVALID', 400, `شناسه فیلم نامعتبر است: ${idStr}`);
    }
  }

  // ─── type ──────────────────────────────────────────────────────────────
  if (input.type != null && (typeof input.type !== 'string' || !MEDIA_TYPES.includes(input.type))) {
    return fail('TYPE_INVALID', 400, 'نوع فیلم نامعتبر است');
  }

  // ─── title ─────────────────────────────────────────────────────────────
  if (input.title != null) {
    if (typeof input.title !== 'string') {
      return fail('TITLE_INVALID', 400, 'عنوان نامعتبر است');
    }
    const title = input.title.trim();
    const titleMaxLen = isGame ? MAX_GAME_TITLE_LEN : MAX_TITLE_LEN;
    if (title.length > titleMaxLen) {
      return fail('TITLE_INVALID', 400, 'عنوان بیش از حد مجاز است');
    }
  }

  // ─── year ──────────────────────────────────────────────────────────────
  if (input.year != null) {
    if (typeof input.year !== 'number' || !Number.isFinite(input.year)) {
      return fail('YEAR_INVALID', 400, 'سال انتشار نامعتبر است');
    }
    if (input.type === 'Movie' && (input.year < 1900 || input.year > 2099)) {
      return fail('YEAR_INVALID', 400, 'سال انتشار برای فیلم الزامی است (1900-2099)');
    }
  }

  // ─── genres ────────────────────────────────────────────────────────────
  if (input.genres != null) {
    if (!Array.isArray(input.genres)) {
      return fail('GENRE_INVALID', 400, 'ژانرها باید یک لیست باشند');
    }
    if (input.genres.length > MAX_GENRES) {
      return fail('GENRE_INVALID', 400, 'تعداد ژانرها بیش از حد مجاز است');
    }
    for (const g of input.genres) {
      if (typeof g !== 'string' || g.trim() === '') {
        return fail('GENRE_INVALID', 400, 'نامژانر نامعتبر است');
      }
      if (g.trim().length > MAX_GENRE_LEN) {
        return fail('GENRE_INVALID', 400, 'نامژانر بیش از حد مجاز است');
      }
    }
  }

  // ─── poster (required for create, optional for edit/preview) ───────────
  if (input.poster == null) {
    if (requirePoster) {
      return fail('IMG_REQUIRED', 400, 'تصویر پوستر الزامی است');
    }
  } else {
    if (typeof input.poster !== 'string') {
      return fail('IMG_INVALID', 400, 'فرمت تصویر نامعتبر است');
    }
    if (input.poster === '') {
      return fail('IMG_REQUIRED', 400, 'تصویر پوستر الزامی است');
    }
    if (input.poster.startsWith('data:') && !input.poster.includes(',')) {
      return fail('IMG_INVALID', 400, 'فرمت تصویر نامعتبر است');
    }
  }

  return {
    ok: true,
    data: {
      id: allowId && input.id != null ? input.id.trim() : undefined,
      type: input.type,
      title: input.title != null ? input.title.trim() : undefined,
      year: input.year,
      genres: input.genres,
      poster: input.poster
    }
  };
}

module.exports = { validateInput };
module.exports.fail = fail;
