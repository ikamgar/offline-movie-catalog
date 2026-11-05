'use strict';

const path = require('path');

const WIN_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)
]);

/**
 * Validate a movie ID: 1–6 digits only.
 * @param {string} id
 * @throws {Error} with a Persian message on invalid input
 */
function validateId(id) {
  if (typeof id !== 'string') {
    throw new Error('شناسه فیلم باید رشته باشد');
  }
  if (!/^\d{1,6}$/.test(id)) {
    throw new Error(`شناسه فیلم نامعتبر است: ${id}`);
  }
}

/**
 * Validate a single path segment (genre name, title-derived name, etc.).
 * Rules:
 *   - Must be a string, 1–120 chars
 *   - NFC-normalised
 *   - No path separators, no '..', no control chars
 *   - No trailing dot or space
 *   - Not a Windows reserved name (CON, PRN, …)
 * @param {string} name
 * @param {string} [label] - Human label for the error message
 * @throws {Error} with a Persian message on invalid input
 */
function safeSegment(name, label) {
  const lbl = label || 'نام';
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${lbl} نمی‌تواند خالی باشد`);
  }

  // NFC-normalise
  const normalised = name.normalize('NFC');

  if (normalised.length > 120) {
    throw new Error(`${lbl} خیلی طولانی است (حداکثر ۱۲۰ کاراکتر)`);
  }

  // No path separators
  if (normalised.includes('/') || normalised.includes('\\')) {
    throw new Error(`${lbl} نمی‌تواند شامل / یا \\ باشد`);
  }

  // No '..'
  if (normalised === '..') {
    throw new Error(`${lbl} نمی‌تواند .. باشد`);
  }

  // No control characters (U+0000–U+001F, U+007F–U+009F).
  // Checked via char codes instead of a regex so the sanitizer itself never
  // carries control-character literals (lint: no-control-regex).
  let hasControlChar = false;
  for (let i = 0; i < normalised.length; i++) {
    const c = normalised.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) {
      hasControlChar = true;
      break;
    }
  }
  if (hasControlChar) {
    throw new Error(`${lbl} شامل کاراکتر کنترلی است`);
  }

  // No trailing dot or space
  if (normalised.endsWith('.') || normalised.endsWith(' ')) {
    throw new Error(`${lbl} نمی‌تواند با نقطه یا فاصله تمام شود`);
  }

  // Not a Windows reserved name (exact match, case-insensitive)
  if (WIN_RESERVED.has(normalised.toUpperCase())) {
    throw new Error(`${lbl} یک نام رزرو شده ویندوز است`);
  }

  return normalised;
}

/**
 * Resolve a path and ensure it is strictly inside a root directory.
 * @param {string} root - The allowed root directory (absolute)
 * @param {...string} parts - Path parts to join and resolve
 * @returns {string} The resolved absolute path
 * @throws {Error} if the resolved path escapes root
 */
function resolveInside(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const normRoot = path.resolve(root);
  if (resolved === normRoot) {
    throw new Error('مسیر خروج از پوشه مجاز نیست');
  }
  if (!resolved.startsWith(normRoot + path.sep) && resolved !== normRoot) {
    throw new Error('مسیر خروج از پوشه مجاز نیست');
  }
  return resolved;
}

module.exports = { validateId, safeSegment, resolveInside };
