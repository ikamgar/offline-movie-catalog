'use strict';
/**
 * P6c E2 / ARCH-03 — the ONE filename builder shared by creator, editor and
 * the preview endpoint (the add-modal used to keep a third copy of this logic).
 * Conventions come from I4:
 *   Movie       {ID}- {Title} {Year}.ext
 *   Animation   {ID}-{Title}.ext
 *   Iranian     {ID}-{Title}.ext
 *   Series      {Title}.ext
 *   Game        {Title}.ext
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildMovieFilename, buildGameFilename } = require('../../backend/utils/filename');

describe('P6c E2 shared filename builder (ARCH-03, I4)', () => {
  it('I4 conventions for every movie type', () => {
    assert.equal(
      buildMovieFilename({ id: '0042', title: 'The Matrix', year: 1999, type: 'Movie', extension: 'jpg' }),
      '0042- The Matrix 1999.jpg'
    );
    assert.equal(
      buildMovieFilename({ id: '0007', title: 'Cars', type: 'Animation', extension: 'png' }),
      '0007-Cars.png'
    );
    assert.equal(
      buildMovieFilename({ id: '0011', title: 'Makhooz', type: 'Iranian', extension: 'jpg' }),
      '0011-Makhooz.jpg'
    );
    assert.equal(
      buildMovieFilename({ title: 'Breaking Bad', type: 'Series', extension: 'jpg' }),
      'Breaking Bad.jpg'
    );
    // Movie without a year (editor path: a year-only edit may clear it) —
    // separator stays "- " exactly as the editor produced it before ARCH-03
    assert.equal(
      buildMovieFilename({ id: '0042', title: 'No Year', type: 'Movie', extension: 'avif' }),
      '0042- No Year.avif'
    );
    // A leading dot in the extension never doubles up
    assert.equal(
      buildMovieFilename({ id: '0042', title: 'Dot Ext', year: 2020, type: 'Movie', extension: '.jpg' }),
      '0042- Dot Ext 2020.jpg'
    );
  });

  it('Series ignores id and year entirely (I5: identity is the title)', () => {
    assert.equal(
      buildMovieFilename({ id: '0042', title: 'Grey\'s Anatomy', year: 2005, type: 'Series', extension: 'jpg' }),
      'Grey\'s Anatomy.jpg'
    );
  });

  it('sanitizes forbidden filename characters (same rule as the old creator)', () => {
    assert.equal(
      buildMovieFilename({ id: '0001', title: 'a/b\\c:d*e?f"g<h>i|j', year: 2001, type: 'Movie', extension: 'jpg' }),
      '0001- a-b-c-d-e-f-g-h-i-j 2001.jpg'
    );
  });

  it('rejects path-escaping titles through safeSegment (I10)', () => {
    assert.throws(
      () => buildMovieFilename({ id: '0001', title: '..', year: 2001, type: 'Movie', extension: 'jpg' }),
      /\.\./
    );
    assert.throws(() => buildGameFilename('..', 'jpg'), /\.\./);
    assert.throws(
      () => buildMovieFilename({ title: '..', type: 'Series', extension: 'jpg' }),
      /\.\./
    );
  });

  it('buildGameFilename: title + extension only, no id or year (I4, I8)', () => {
    assert.equal(buildGameFilename('Ghost Rider', 'jpg'), 'Ghost Rider.jpg');
    assert.equal(buildGameFilename('God of War', 'png'), 'God of War.png');
    assert.equal(buildGameFilename('Ghost Rider', '.webp'), 'Ghost Rider.webp');
    assert.equal(
      buildGameFilename('a/b:c', 'jpg'),
      'a-b-c.jpg',
      'game titles get the same sanitization as movie titles'
    );
  });
});
