'use strict';

/**
 * Backup policy for durable data files (orders.json, metadata.json, auth.json).
 *
 * Location: data/backups/<name>.<yyyymmdd-HHMMSS>.json
 *
 * Rules (P2 A2):
 *   - one at startup if the file changed since its last backup
 *   - at most one per 10 minutes while changing
 *   - always one immediately before a destructive operation (force)
 *   - retention = newest 30 + one per day for 14 days
 *   - never delete the last valid backup
 *   - NOT applied to catalog.json (rebuildable cache)
 */

const fs = require('fs');
const path = require('path');

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const KEEP_RECENT = 30;
const DAY_RETENTION = 14;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function stamp(d) {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`
  );
}

function dayKeyUTC(d) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

function dayKeyFromFilename(filename) {
  const m = filename.match(/\.(\d{8})-\d{6}(?:-\d+)?\.json$/);
  return m ? m[1] : null;
}

function backupTimestampFromFilename(filename) {
  const m = filename.match(/\.(\d{8}-\d{6})(?:-\d+)?\.json$/);
  return m ? m[1] : null;
}

class BackupManager {
  /**
   * @param {string} backupDir - Directory for backup files
   * @param {{ now?: () => Date }} [options] - Injectable clock for tests
   */
  constructor(backupDir, options) {
    this._dir = backupDir;
    this._now = (options && options.now) || (() => new Date());
    /** @type {Map<string, number>} name → last backup epoch ms */
    this._lastBackupAt = new Map();
    /** @type {Map<string, number>} name → last startup-check mtime */
    this._startupMtime = new Map();
  }

  _ensureDir() {
    fs.mkdirSync(this._dir, { recursive: true });
  }

  _list(name) {
    if (!fs.existsSync(this._dir)) return [];
    const prefix = `${name}.`;
    return fs.readdirSync(this._dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  }

  /**
   * Create a backup of `filePath` under the backup directory.
   * @param {string} file - Source file to back up
   * @param {string} name - Logical name (orders | metadata | auth)
   * @param {{ force?: boolean }} [options] - force bypasses the 10-minute throttle
   * @returns {string|null} Absolute path of the new backup, or null if skipped
   */
  backup(file, name, options) {
    if (!file || !name) return null;
    if (!fs.existsSync(file)) return null;

    const force = !!(options && options.force);
    const now = this._now();
    const nowMs = now.getTime();
    const last = this._lastBackupAt.get(name) || 0;

    if (!force && nowMs - last < MIN_INTERVAL_MS) {
      return null;
    }

    this._ensureDir();
    const base = `${name}.${stamp(now)}.json`;
    let dest = path.join(this._dir, base);
    let collision = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(this._dir, `${name}.${stamp(now)}-${collision}.json`);
      collision += 1;
    }

    try {
      fs.copyFileSync(file, dest);
    } catch {
      return null;
    }

    this._lastBackupAt.set(name, nowMs);
    this.prune(name);
    return dest;
  }

  /**
   * Startup rule: back up only if the file is newer than the newest existing backup
   * (or if no backup exists yet).
   * @returns {string|null}
   */
  startupBackup(file, name) {
    if (!file || !name || !fs.existsSync(file)) return null;

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return null;
    }

    const existing = this._list(name)
      .filter((f) => backupTimestampFromFilename(f) !== null)
      .sort()
      .reverse();

    if (existing.length > 0) {
      const newestMtime = (() => {
        try {
          return fs.statSync(path.join(this._dir, existing[0])).mtimeMs;
        } catch {
          return 0;
        }
      })();
      // Prefer comparing content mtime of the source vs when we last backed it up.
      const lastBacked = this._startupMtime.get(name);
      if (lastBacked !== undefined && stat.mtimeMs <= lastBacked) {
        return null;
      }
      if (lastBacked === undefined && newestMtime >= stat.mtimeMs) {
        // Backups exist from a previous run and source is not newer → skip.
        this._startupMtime.set(name, stat.mtimeMs);
        return null;
      }
      if (lastBacked === undefined && stat.mtimeMs <= newestMtime) {
        this._startupMtime.set(name, stat.mtimeMs);
        return null;
      }
    }

    this._startupMtime.set(name, stat.mtimeMs);
    return this.backup(file, name, { force: true });
  }

  /**
   * Retention: keep the newest KEEP_RECENT files, plus the newest backup for
   * each of the last DAY_RETENTION calendar days. Never delete the newest
   * (last valid) backup.
   * @param {string} name
   */
  prune(name) {
    const files = this._list(name).sort(); // lexicographic ≈ chronological
    if (files.length === 0) return;

    const sortedDesc = files.slice().reverse();
    const keep = new Set();

    // Newest 30
    for (let i = 0; i < Math.min(KEEP_RECENT, sortedDesc.length); i++) {
      keep.add(sortedDesc[i]);
    }

    // One per day for the last 14 UTC days (from `now`)
    const now = this._now();
    const wantedDays = new Set();
    for (let d = 0; d < DAY_RETENTION; d++) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d));
      wantedDays.add(dayKeyUTC(day));
    }

    const seenDays = new Set();
    for (const f of sortedDesc) {
      const day = dayKeyFromFilename(f);
      if (day && wantedDays.has(day) && !seenDays.has(day)) {
        seenDays.add(day);
        keep.add(f);
      }
    }

    // Never delete the last valid backup
    keep.add(sortedDesc[0]);

    for (const f of files) {
      if (!keep.has(f)) {
        try {
          fs.unlinkSync(path.join(this._dir, f));
        } catch {
          // non-fatal
        }
      }
    }
  }
}

/**
 * @param {string} backupDir
 * @param {{ now?: () => Date }} [options]
 * @returns {BackupManager}
 */
function createBackupManager(backupDir, options) {
  return new BackupManager(backupDir, options);
}

module.exports = { createBackupManager, BackupManager, MIN_INTERVAL_MS, KEEP_RECENT, DAY_RETENTION };
