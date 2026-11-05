'use strict';

/**
 * Atomic JSON file helpers.
 *
 * writeJsonAtomic: write to a temp file in the same directory, fsync, rename
 * over the target. On Windows, rename can fail with EPERM/EBUSY/EACCES when an
 * antivirus or indexer holds the file — retry up to 5× with 40 ms back-off.
 *
 * readJsonSafe: never overwrites a corrupt file. Quarantines it to
 * `<name>.corrupt-<timestamp>.json`, then tries the newest valid backup;
 * if none, starts empty and records a storageWarning.
 */

const fs = require('fs');
const path = require('path');
const { recordWarning } = require('./warnings');

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 40;

function sleepSync(ms) {
  // Node 18+: Atomics.wait on the main thread is allowed.
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function renameWithRetry(src, dest) {
  let lastErr;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (err) {
      lastErr = err;
      if (!RETRY_CODES.has(err.code) || attempt === RETRY_ATTEMPTS - 1) {
        break;
      }
      sleepSync(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetryAsync(src, dest) {
  let lastErr;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      await fs.promises.rename(src, dest);
      return;
    } catch (err) {
      lastErr = err;
      if (!RETRY_CODES.has(err.code) || attempt === RETRY_ATTEMPTS - 1) {
        break;
      }
      await delay(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

/**
 * Atomically write JSON to `file`.
 * @param {string} file - Destination path
 * @param {*} data - JSON-serialisable value
 * @param {{ pretty?: boolean }} [options]
 */
function writeJsonAtomic(file, data, options) {
  const pretty = !!(options && options.pretty);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, json, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }

  try {
    renameWithRetry(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/**
 * Async twin of writeJsonAtomic for a PRE-SERIALIZED JSON string.
 * The caller does the (chunked) stringify; this only performs promise-based
 * I/O — no Atomics.wait sleep on retry — so the event loop keeps ticking
 * during the startup reconcile write (P8c lag budget).
 * @param {string} file - Destination path
 * @param {string} json - Final JSON text to write
 */
async function writeJsonStringAtomicAsync(file, json) {
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });

  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );

  let handle;
  try {
    handle = await fs.promises.open(tmp, 'w');
    await handle.writeFile(json, 'utf8');
    await handle.datasync();
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* already closed */ }
    }
  }

  try {
    await renameWithRetryAsync(tmp, file);
  } catch (err) {
    try { await fs.promises.unlink(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timestampSlug(d) {
  const when = d || new Date();
  return (
    `${when.getFullYear()}${pad2(when.getMonth() + 1)}${pad2(when.getDate())}` +
    `-${pad2(when.getHours())}${pad2(when.getMinutes())}${pad2(when.getSeconds())}`
  );
}

function quarantinePath(file, when) {
  const dir = path.dirname(file);
  const base = path.basename(file).replace(/\.json$/i, '');
  return path.join(dir, `${base}.corrupt-${timestampSlug(when || new Date())}.json`);
}

/**
 * Find the newest valid JSON backup for logical name `name` in `backupDir`.
 * Files are expected as `<name>.<yyyymmdd-HHMMSS>.json` (lexicographic sort
 * matches chronological order for that stamp format).
 * @returns {{ file: string, data: * } | null}
 */
function findNewestValidBackup(backupDir, name) {
  if (!backupDir || !fs.existsSync(backupDir)) return null;
  const prefix = `${name}.`;
  const candidates = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const f of candidates) {
    const full = path.join(backupDir, f);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      return { file: full, data };
    } catch {
      // try next older candidate
    }
  }
  return null;
}

/**
 * Safely read a JSON file.
 *
 * @param {string} file - Path to read
 * @param {{ backupDir?: string }} [options] - Optional backups directory for recovery
 * @returns {{ status: 'ok'|'missing'|'corrupt', data: *|null, warning?: object, quarantine?: string }}
 *   - ok: parsed data (possibly restored from backup; check warning.kind)
 *   - missing: file does not exist
 *   - corrupt: unrecoverable (quarantined; data is null)
 *   - warning: {file, kind, detail, at} when something notable happened
 */
function readJsonSafe(file, options) {
  const backupDir = options && options.backupDir;
  let raw;

  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { status: 'missing', data: null };
    }
    const warning = {
      file,
      kind: 'corrupt-quarantined',
      detail: err.message,
      at: new Date().toISOString()
    };
    recordWarning(warning);
    return { status: 'corrupt', data: null, warning };
  }

  try {
    return { status: 'ok', data: JSON.parse(raw) };
  } catch (err) {
    // 1) Quarantine the bad file first — never overwrite it.
    const qPath = quarantinePath(file);
    try {
      fs.renameSync(file, qPath);
    } catch {
      // If rename fails we still refuse to treat this as empty success.
    }

    const name = path.basename(file).replace(/\.json$/i, '');

    // 2) Try the newest valid backup.
    if (backupDir) {
      const restored = findNewestValidBackup(backupDir, name);
      if (restored) {
        const warning = {
          file,
          kind: 'restored-from-backup',
          detail: path.basename(restored.file),
          at: new Date().toISOString()
        };
        recordWarning(warning);
        return { status: 'ok', data: restored.data, warning, quarantine: qPath };
      }
    }

    // 3) No backup — start empty, record warning.
    const warning = {
      file,
      kind: 'corrupt-quarantined',
      detail: err.message,
      at: new Date().toISOString()
    };
    recordWarning(warning);
    return { status: 'corrupt', data: null, warning, quarantine: qPath };
  }
}

module.exports = {
  writeJsonAtomic,
  writeJsonStringAtomicAsync,
  readJsonSafe,
  findNewestValidBackup,
  quarantinePath,
  timestampSlug
};
