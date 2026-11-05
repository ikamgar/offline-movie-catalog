'use strict';
/**
 * P8a G1 — restart supervisor. Start.bat (Windows) and `node
 * scripts/supervisor.js` (Linux/macOS) run the server under this loop:
 *
 *   - the child's stdout/stderr pass straight through (compact console)
 *   - exit code 0 (graceful stop: Ctrl+C or Stop.bat) → supervisor exits 0
 *   - exit code CONFIG_ERROR_EXIT_CODE (2, broken config.json — the
 *     server already printed the bilingual explanation) → supervisor
 *     exits 2 immediately: no restart, not counted as a crash
 *   - any other crash (non-zero exit / signal) → restart after 3 s
 *   - 5 crashes within any 2-minute window → stop with a readable
 *     bilingual message (no stack traces on screen — details are in
 *     logs/app-YYYYMMDD.log)
 *   - a child that lived >= 2 minutes resets the crash history
 *
 * The crash-window policy is a pure, unit-tested function
 * (test/unit/supervisor.test.js); this file only wires it to spawn().
 */

const { spawn } = require('child_process');
const path = require('path');
const { CONFIG_ERROR_EXIT_CODE } = require('../server/config');

const DELAY_MS = 3000;
const WINDOW_MS = 120000;
const MAX_CRASHES = 5;

/**
 * Rolling-window crash policy (pure; injected clock).
 * @param {{now?: () => number, windowMs?: number, maxCrashes?: number}} [options]
 */
function createCrashTracker(options) {
  const opts = options || {};
  const now = opts.now || Date.now;
  const windowMs = opts.windowMs || WINDOW_MS;
  const maxCrashes = opts.maxCrashes || MAX_CRASHES;
  let crashes = [];

  return {
    /**
     * @param {{code: number, uptimeMs: number}} exit
     * @returns {{action: 'done'|'config-error'|'restart'|'stop', delayMs?: number, count: number}}
     */
    onExit(exit) {
      if (exit.code === 0) return { action: 'done', count: crashes.length };
      if (exit.code === CONFIG_ERROR_EXIT_CODE) {
        // Broken config.json: restarting cannot help and would just
        // repeat the fatal message — stop without counting a crash.
        return { action: 'config-error', count: crashes.length };
      }
      if (exit.uptimeMs >= windowMs) crashes = [];
      const t = now();
      crashes = crashes.filter((c) => t - c < windowMs);
      crashes.push(t);
      if (crashes.length >= maxCrashes) return { action: 'stop', count: crashes.length };
      return { action: 'restart', delayMs: DELAY_MS, count: crashes.length };
    },
    get count() { return crashes.length; }
  };
}

function main() {
  const appRoot = path.resolve(__dirname, '..');
  const script = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.join(appRoot, 'server.js');
  const tracker = createCrashTracker();
  let stopping = false;
  let restarting = false;

  process.on('SIGINT', () => {
    // In a console, Ctrl+C reaches the whole process group; the server
    // shuts down gracefully on its own. Remember so we never restart.
    stopping = true;
    if (!restarting) console.log('\n  [SUPERVISOR] Stopping... / در حال توقف...');
  });

  function run() {
    restarting = false;
    const started = Date.now();
    const child = spawn(process.execPath, [script], { stdio: 'inherit', cwd: appRoot });

    child.on('error', (err) => {
      console.error(`  [SUPERVISOR] Could not start the server: ${err.message}`);
      console.error('  [SUPERVISOR] اجرای سرور ممکن نشد.');
      process.exit(1);
    });

    child.on('exit', (code, signal) => {
      const uptimeMs = Date.now() - started;
      const exitCode = code == null ? 1 : code;
      if (stopping || exitCode === 0) process.exit(exitCode);

      const decision = tracker.onExit({ code: exitCode, uptimeMs });
      if (decision.action === 'config-error') {
        // The server already printed the bilingual "fix config.json"
        // block — pass the dedicated code through and stop.
        process.exit(CONFIG_ERROR_EXIT_CODE);
      }
      if (decision.action === 'stop') {
        console.log('');
        console.log('  ====================================================');
        console.log('  The server crashed ' + MAX_CRASHES + ' times within 2 minutes');
        console.log('  and will NOT be restarted. Fix the problem, then run');
        console.log('  Start.bat again. Technical details: logs\\app-YYYYMMDD.log');
        console.log('  ---------------------------------------------------');
        console.log('  سرور ' + MAX_CRASHES + ' بار در عرض ۲ دقیقه بسته شد و دوباره اجرا نمی‌شود.');
        console.log('  مشکل را برطرف کنید و دوباره Start.bat را اجرا کنید.');
        console.log('  جزئیات فنی در فایل logs\\app-YYYYMMDD.log هست.');
        console.log('  ====================================================');
        console.log('');
        process.exit(1);
      }

      restarting = true;
      console.log('');
      console.log('  [SUPERVISOR] The server stopped unexpectedly (exit code ' + exitCode +
        (signal ? ', signal ' + signal : '') + ').');
      console.log('  [SUPERVISOR] Restarting in 3 seconds... press Ctrl+C to quit.');
      console.log('  [SUPERVISOR] سرور به‌صورت غیرمنتظره بسته شد؛ ۳ ثانیه دیگر دوباره اجرا می‌شود...');
      console.log('');
      setTimeout(run, DELAY_MS);
    });
  }

  run();
}

if (require.main === module) main();

module.exports = { createCrashTracker, DELAY_MS, WINDOW_MS, MAX_CRASHES };
