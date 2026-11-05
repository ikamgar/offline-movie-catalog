'use strict';
/**
 * P5c — D4 / FE-06: shared id-vs-title helper for copy, print and the
 * order snapshot.
 *
 * Rule (AGENTS I2/I4/I5/I6): Movies/Animation/Iranian carry a string id,
 * Series carry id:null, Games carry no id field at all — so the helper must
 * return the id when present and the title otherwise, and must never
 * stringify null/undefined.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('js/utils/helpers.js — idOrTitle / hasId (FE-06)', () => {
  let helpers;

  it('loads ES module via dynamic import', async () => {
    helpers = await import('../../js/utils/helpers.js');
    assert.equal(typeof helpers.idOrTitle, 'function', 'idOrTitle must be exported');
    assert.equal(typeof helpers.hasId, 'function', 'hasId must be exported');
  });

  const ref = (...args) => helpers.idOrTitle(...args);

  it('Movie / Animation / Iranian → id', () => {
    assert.equal(ref({ id: '0012', title: 'Inception', type: 'Movie' }), '0012');
    assert.equal(ref({ id: '00001', title: 'Spirited Away', type: 'Animation' }), '00001');
    assert.equal(ref({ id: '0007', title: 'The Salesman', type: 'Iranian' }), '0007');
  });

  it('leading zeros are preserved verbatim (I2: id is a string)', () => {
    assert.equal(ref({ id: '0001', title: 'x', type: 'Movie' }), '0001');
    assert.notEqual(ref({ id: '0001', title: 'x', type: 'Movie' }), '1');
  });

  it('Series (id:null) → title', () => {
    assert.equal(ref({ id: null, title: "Grey's Anatomy", type: 'Series' }), "Grey's Anatomy");
  });

  it('Games (no id field at all) → title, never "undefined"', () => {
    const game = { title: 'Ghost Rider', type: 'Game', platforms: ['PS4'] };
    assert.equal(ref(game), 'Ghost Rider');
    assert.equal(ref(game).includes('undefined'), false);
  });

  it('empty-string id falls back to title', () => {
    assert.equal(ref({ id: '', title: 'Orphan', type: 'Movie' }), 'Orphan');
  });

  it('null/undefined item → empty string, never throws', () => {
    assert.equal(ref(null), '');
    assert.equal(ref(undefined), '');
  });

  it('hasId mirrors the same decision', () => {
    assert.equal(helpers.hasId({ id: '0012', title: 'x' }), true);
    assert.equal(helpers.hasId({ id: null, title: 'x' }), false);
    assert.equal(helpers.hasId({ title: 'x' }), false);
    assert.equal(helpers.hasId({ id: '', title: 'x' }), false);
    assert.equal(helpers.hasId(null), false);
  });
});
