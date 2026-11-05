'use strict';

/**
 * In-process storage warning registry (A7).
 * Collected during load/migrate/recover and surfaced on GET /api/diagnostics.
 */

const _warnings = [];

/**
 * @param {{ file: string, kind: string, detail?: string, at?: string }} warning
 */
function recordWarning(warning) {
  if (!warning || !warning.file || !warning.kind) return;
  _warnings.push({
    file: warning.file,
    kind: warning.kind,
    detail: warning.detail || '',
    at: warning.at || new Date().toISOString()
  });
}

function getWarnings() {
  return _warnings.map((w) => ({ ...w }));
}

function clearWarnings() {
  _warnings.length = 0;
}

module.exports = { recordWarning, getWarnings, clearWarnings };
