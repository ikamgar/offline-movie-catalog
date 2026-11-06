'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { gameKey } = require('../../backend/utils/game-key');
const CatalogIndexer = require('../../backend/indexer');

describe('F26 — ONE shared game-key normaliser', () => {
  const indexer = new CatalogIndexer();

  const testVectors = [
    { input: 'God of War', expected: 'god of war' },
    { input: '  God   of   War  ', expected: 'god of war' },
    { input: 'GOD OF WAR', expected: 'god of war' },
    { input: 'The Last of Us Part I', expected: 'the last of us part i' },
    { input: 'Red\tDead\n\nRedemption  2', expected: 'red dead redemption 2' },
    { input: 'فوتبال 2024', expected: 'فوتبال 2024' },
    { input: '  فوتبال   ۲۰۲۴  ', expected: 'فوتبال ۲۰۲۴' },
    { input: '', expected: '' },
    { input: null, expected: '' },
    { input: undefined, expected: '' },
    { input: '   ', expected: '' },
    { input: 12345, expected: '12345' },
    { input: 'Spider-Man: Miles Morales', expected: 'spider-man: miles morales' },
  ];

  it('normalises game titles correctly according to invariants I6/I8', () => {
    for (const { input, expected } of testVectors) {
      assert.equal(gameKey(input), expected, `gameKey(${JSON.stringify(input)}) should equal ${JSON.stringify(expected)}`);
    }
  });

  it('preserves parity with CatalogIndexer.gameKey and CatalogIndexer.prototype._gameKey', () => {
    assert.equal(CatalogIndexer.gameKey, gameKey, 'CatalogIndexer.gameKey must export the shared gameKey');
    for (const { input } of testVectors) {
      const canonical = gameKey(input);
      const fromIndexerMethod = indexer._gameKey(input);
      const fromIndexerStatic = CatalogIndexer.gameKey(input);
      assert.equal(fromIndexerMethod, canonical, `indexer._gameKey(${JSON.stringify(input)}) parity mismatch`);
      assert.equal(fromIndexerStatic, canonical, `CatalogIndexer.gameKey(${JSON.stringify(input)}) parity mismatch`);
    }
  });
});
