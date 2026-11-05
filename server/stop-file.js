'use strict';
/**
 * P8a follow-up — Stop.bat stop-file watch with stale-file handling.
 *
 * Stop.bat writes logs/stop.request; the running server watches for it
 * (default 1 s poll, unref'd so it never keeps the process alive).
 *
 * Stale files are REMOVED at arm time. Why that is safe: the file's only
 * meaning is "stop the server run that is currently up". A file found at
 * boot belongs to an already-finished run (previous graceful stop, or a
 * hard kill after a Stop.bat), and honouring it would instantly kill the
 * fresh server that nobody asked to stop. A real Stop.bat request can
 * only be written once the new run is already up — milliseconds after
 * arm — so no legitimate request is ever lost.
 */
const fs = require('fs');

/**
 * @param {object} options
 * @param {string} options.stopFile - absolute path of the request file
 * @param {() => void} options.onStopped - called once when a (fresh) file appears
 * @param {number} [options.intervalMs] - poll period (default 1000)
 * @param {typeof fs} [options.fs] - injected fs (tests)
 * @returns {{stop: () => void, fired: () => boolean, staleRemoved: () => boolean}}
 */
function armStopWatch(options) {
  const stopFile = options.stopFile;
  const onStopped = options.onStopped;
  const intervalMs = options.intervalMs || 1000;
  const fsImpl = options.fs || fs;

  let staleExisted = false;
  try {
    staleExisted = fsImpl.existsSync(stopFile);
    fsImpl.rmSync(stopFile, { force: true });
  } catch { /* missing file or unreadable — arm anyway */ }

  let fired = false;
  const timer = setInterval(() => {
    if (fired) return;
    let present = false;
    try { present = fsImpl.existsSync(stopFile); } catch { return; }
    if (!present) return;
    fired = true;
    clearInterval(timer);
    try { fsImpl.rmSync(stopFile, { force: true }); } catch { /* best effort */ }
    onStopped();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop: () => clearInterval(timer),
    fired: () => fired,
    staleRemoved: () => staleExisted
  };
}

module.exports = { armStopWatch };
