'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getClientRole, isValidRole, VALID_ROLES } = require('../../server/auth/role-provider');

describe('Role Provider (characterization)', () => {
  describe('getClientRole', () => {
    it('returns "customer" for customer role', () => {
      assert.equal(getClientRole('customer'), 'customer');
    });

    it('returns "manager" for manager role', () => {
      assert.equal(getClientRole('manager'), 'manager');
    });

    it('returns null for invalid role', () => {
      assert.equal(getClientRole('admin'), null);
      assert.equal(getClientRole('guest'), null);
      assert.equal(getClientRole(''), null);
    });

    it('returns null for null/undefined', () => {
      assert.equal(getClientRole(null), null);
      assert.equal(getClientRole(undefined), null);
    });
  });

  describe('isValidRole', () => {
    it('returns true for valid roles', () => {
      assert.equal(isValidRole('customer'), true);
      assert.equal(isValidRole('manager'), true);
    });

    it('returns false for invalid roles', () => {
      assert.equal(isValidRole('admin'), false);
      assert.equal(isValidRole('guest'), false);
      assert.equal(isValidRole(''), false);
    });
  });

  describe('VALID_ROLES', () => {
    it('contains exactly customer and manager', () => {
      assert.ok(VALID_ROLES.has('customer'));
      assert.ok(VALID_ROLES.has('manager'));
      assert.equal(VALID_ROLES.size, 2);
    });
  });
});
