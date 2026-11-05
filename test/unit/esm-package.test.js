'use strict';
/**
 * ARCH-01 (F1): js/ must be a declared ES-module package.
 * Without js/package.json Node emits MODULE_TYPELESS_PACKAGE_JSON warnings
 * whenever a test imports files under js/.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../../js/package.json');

describe('ARCH-01 — js/ is an ES module package', () => {
  it('declares type "module" so Node parses js/ files as ESM', () => {
    assert.equal(pkg.type, 'module');
  });

  it('stays public, minimal and dependency-free', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
    assert.ok(pkg['//'], 'the explanatory note must stay');
  });
});
