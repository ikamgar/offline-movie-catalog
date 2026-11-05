'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateInput } = require('../../backend/utils/validate-input');

describe('validateInput (F29, F36)', () => {
  it('rejects non-object input with VALIDATION 400', () => {
    const err = validateInput(null);
    assert.equal(err.ok, false);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION');
  });

  describe('id validation (allowId: true)', () => {
    it('accepts valid 1-6 digit numeric string', () => {
      const res = validateInput({ id: '0042', poster: 'data:image/jpeg;base64,1234' }, { requirePoster: false });
      assert.equal(res.ok, true);
      assert.equal(res.data.id, '0042');
    });

    it('rejects non-string id with ID_INVALID 400 (F36 primitive)', () => {
      const res = validateInput({ id: 1234 }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'ID_INVALID');
    });

    it('rejects id with non-digits or >6 digits', () => {
      const res = validateInput({ id: '1234567' }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'ID_INVALID');
    });
  });

  describe('type validation', () => {
    it('accepts valid MEDIA_TYPES', () => {
      for (const t of ['Movie', 'Animation', 'Iranian', 'Series', 'Game']) {
        const res = validateInput({ type: t }, { requirePoster: false });
        assert.equal(res.ok, true);
        assert.equal(res.data.type, t);
      }
    });

    it('rejects invalid type with TYPE_INVALID 400', () => {
      const res = validateInput({ type: 'BogusType' }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'TYPE_INVALID');
    });
  });

  describe('title validation', () => {
    it('rejects non-string title with TITLE_INVALID 400', () => {
      const res = validateInput({ title: 12345 }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'TITLE_INVALID');
    });

    it('rejects title longer than MAX_TITLE_LEN (200) for movie', () => {
      const longTitle = 'A'.repeat(201);
      const res = validateInput({ title: longTitle }, { requirePoster: false, isGame: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'TITLE_INVALID');
    });

    it('rejects title longer than MAX_GAME_TITLE_LEN (120) for game', () => {
      const longTitle = 'G'.repeat(121);
      const res = validateInput({ title: longTitle }, { requirePoster: false, isGame: true });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'TITLE_INVALID');
    });
  });

  describe('year validation', () => {
    it('accepts valid 4-digit year (1900-2099)', () => {
      const res = validateInput({ year: 1999 }, { requirePoster: false });
      assert.equal(res.ok, true);
      assert.equal(res.data.year, 1999);
    });

    it('rejects year out of range with YEAR_INVALID 400', () => {
      const res = validateInput({ type: 'Movie', year: 1899 }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'YEAR_INVALID');
    });

    it('rejects non-numeric year with YEAR_INVALID 400', () => {
      const res = validateInput({ year: 'nineteen-ninety-nine' }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'YEAR_INVALID');
    });
  });

  describe('genres validation', () => {
    it('rejects string genre (must be array) with GENRE_INVALID 400 (F36)', () => {
      const res = validateInput({ genres: 'Action, Drama' }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'GENRE_INVALID');
    });

    it('rejects array containing non-string genre', () => {
      const res = validateInput({ genres: ['Action', 123] }, { requirePoster: false });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'GENRE_INVALID');
    });

    it('accepts genre array at limit (30) and rejects at limit+1 (31) with GENRE_INVALID 400', () => {
      const genres30 = Array.from({ length: 30 }, (_, i) => `Genre${i + 1}`);
      const res30 = validateInput({ genres: genres30 }, { requirePoster: false });
      assert.equal(res30.ok, true, '30 genres must be accepted');

      const genres31 = Array.from({ length: 31 }, (_, i) => `Genre${i + 1}`);
      const res31 = validateInput({ genres: genres31 }, { requirePoster: false });
      assert.equal(res31.ok, false, '31 genres must be rejected');
      assert.equal(res31.status, 400);
      assert.equal(res31.code, 'GENRE_INVALID');
      assert.equal(res31.error, 'تعداد ژانرها بیش از حد مجاز است');
    });
  });

  describe('poster validation', () => {
    it('rejects non-string poster with IMG_INVALID 400', () => {
      const res = validateInput({ poster: { raw: 'data' } }, { requirePoster: true });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'IMG_INVALID');
    });

    it('rejects missing poster when requirePoster is true', () => {
      const res = validateInput({}, { requirePoster: true });
      assert.equal(res.ok, false);
      assert.equal(res.status, 400);
      assert.equal(res.code, 'IMG_REQUIRED');
    });
  });
});
