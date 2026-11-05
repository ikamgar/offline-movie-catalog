'use strict';
/**
 * P8a G3 — file logger: logs/app-YYYYMMDD.log with 7-day rotation.
 *
 * - Disabled by default (no-op) so unit/UI tests never touch the real
 *   logs/ directory; the auto-start block of server.js calls init().
 * - The console keeps its existing compact banner; this file gets the
 *   structured trail (startup, HTTP requests, fatals).
 * - HTTP request lines carry method + path + status + duration only —
 *   never request bodies, Authorization headers, cookies, tokens or
 *   passwords (P8a secrets rule; enforced by test/unit/logger.test.js).
 * - The clock is injectable so rotation is unit-testable.
 */

const fs = require('fs');
const path = require('path');

const KEEP_FILES = 7;
const FILE_RE = /^app-\d{8}\.log$/;

let state = {
  enabled: false,
  dir: null,
  now: () => new Date(),
  keep: KEEP_FILES
};

function pad(n) { return String(n).padStart(2, '0'); }

function fileNameFor(date) {
  return `app-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.log`;
}

function currentFile() {
  return state.dir ? path.join(state.dir, fileNameFor(state.now())) : null;
}

function prune() {
  if (!state.dir) return;
  let names;
  try {
    names = fs.readdirSync(state.dir).filter((n) => FILE_RE.test(n)).sort();
  } catch { return; }
  while (names.length > state.keep) {
    const victim = path.join(state.dir, names.shift());
    try { fs.unlinkSync(victim); } catch { /* best effort */ }
  }
}

/**
 * Initialise the logger. No-op-safe to call once at startup.
 * @param {object} [options]
 * @param {string} options.dir - log directory (e.g. <app>/logs)
 * @param {() => Date} [options.now] - injected clock (tests)
 * @param {number} [options.keep] - files to keep (default 7)
 */
function init(options) {
  const opts = options || {};
  if (!opts.dir) { state.enabled = false; return; }
  state = {
    enabled: true,
    dir: opts.dir,
    now: opts.now || (() => new Date()),
    keep: opts.keep || KEEP_FILES
  };
  try { fs.mkdirSync(state.dir, { recursive: true }); } catch { state.enabled = false; return; }
  prune();
}

/** Disable logging (back to no-op). */
function disable() {
  state.enabled = false;
  state.dir = null;
}

function write(level, message) {
  if (!state.enabled) return;
  const ts = state.now().toISOString();
  const line = `${ts} ${level.padEnd(5)} ${message}\n`;
  try {
    fs.appendFileSync(currentFile(), line);
    prune();
  } catch { /* never crash the app over logging */ }
}

function info(message) { write('INFO', message); }
function warn(message) { write('WARN', message); }
function error(message) { write('ERROR', message); }

/**
 * Express middleware: one line per completed request —
 * `METHOD /path STATUS Nms`. Query strings are stripped; headers and
 * bodies are never touched. No-op while the logger is disabled.
 */
function requestMiddleware() {
  return (req, res, next) => {
    if (!state.enabled) return next();
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const cleanPath = String(req.originalUrl || req.url || '').split('?')[0];
      write('HTTP', `${req.method} ${cleanPath} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  };
}

/**
 * Report a fatal error: full detail (stack) into the file log, a short
 * bilingual summary on the console — stacks stay out of the owner's face.
 * Only the error itself is written; never the environment, env vars,
 * credentials or request data (secrets rule; enforced by
 * test/unit/fatal-handlers.test.js).
 */
function reportFatal(kind, err) {
  const detail = (err && (err.stack || err.message)) || String(err);
  error(`FATAL ${kind}: ${detail}`);
  console.error(`  [FATAL] ${kind} — the server must stop. / سرور به دلیل خطای غیرمنتظره متوقف شد.`);
  if (err && err.message) console.error(`  [FATAL] ${err.message}`);
  console.error(`  [FATAL] Details: / جزئیات در لاگ: ${currentFile()}`);
}

/**
 * Install the process-level fatal handlers the server auto-start uses.
 * Both fire reportFatal() then exit with code 1 (a crash the supervisor
 * may restart after the backoff delay).
 * @param {{onExit: (code: number) => void}} options
 */
function installFatalHandlers(options) {
  const onExit = options && options.onExit;
  process.on('uncaughtException', (err) => {
    reportFatal('uncaughtException', err);
    onExit(1);
  });
  process.on('unhandledRejection', (reason) => {
    reportFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
    onExit(1);
  });
}

module.exports = { init, disable, info, warn, error, requestMiddleware, currentFile, fileNameFor, KEEP_FILES, reportFatal, installFatalHandlers };
