'use strict';

/**
 * Metadata Store (DATA-10 / P2 A3).
 *
 * Durable home for manager-entered fields (imdbRating, plotSummary) that must
 * survive deletion of the rebuildable catalog.json cache.
 *
 * File: data/metadata.json = { version: 1, items: { "<key>": { imdbRating, plotSummary, updatedAt } } }
 *
 * Migration on first start: if metadata.json is missing and an old catalog.json
 * contains imdbRating/plotSummary, import them. The old catalog is not rewritten.
 */

const fs = require('fs');
const path = require('path');
const { writeJsonAtomic, readJsonSafe } = require('./atomic-json');
const { createBackupManager } = require('./backup');
const { recordWarning } = require('./warnings');
const { metadataKeyFor } = require('../utils/metadata-key');

const STORE_VERSION = 1;

function defaultBackupDir(filePath) {
  return path.join(path.dirname(filePath), 'backups');
}

class MetadataStore {
  /**
   * @param {string} filePath - Path to metadata.json
   * @param {{ backupDir?: string, catalogPath?: string, backupManager?: object }} [options]
   */
  constructor(filePath, options) {
    this._filePath = filePath;
    this._backupDir = (options && options.backupDir) || defaultBackupDir(filePath);
    this._catalogPath = (options && options.catalogPath) || null;
    this._backups = (options && options.backupManager) || createBackupManager(this._backupDir);
    /** @type {Map<string, { imdbRating: number|null, plotSummary: string|null, updatedAt: string }>} */
    this._items = new Map();
    this._dirty = false;
    this._saveTimer = null;
  }

  /**
   * Load from disk; migrate from catalog.json when metadata.json is missing.
   * @returns {{ migrated: boolean, status: string }}
   */
  load() {
    const result = readJsonSafe(this._filePath, { backupDir: this._backupDir });

    if (result.status === 'ok' && result.data && result.data.items) {
      this._items.clear();
      for (const [key, entry] of Object.entries(result.data.items)) {
        if (entry && typeof entry === 'object') {
          this._items.set(key, {
            imdbRating: entry.imdbRating != null ? entry.imdbRating : null,
            plotSummary: entry.plotSummary != null ? entry.plotSummary : null,
            updatedAt: entry.updatedAt || new Date().toISOString()
          });
        }
      }
      return { migrated: false, status: result.status };
    }

    if (result.status === 'corrupt') {
      // readJsonSafe already quarantined + recorded a warning; start empty.
      return { migrated: false, status: result.status };
    }

    // missing (or empty) — try one-shot migration from an old catalog.json
    const migrated = this._migrateFromCatalog();
    if (migrated) {
      this.save();
    }
    return { migrated, status: result.status };
  }

  /**
   * Import imdbRating/plotSummary from catalog.json if present.
   * Does not delete or rewrite the old file. Idempotent (only runs when
   * metadata.json was missing).
   * @returns {boolean} true if anything was imported
   */
  _migrateFromCatalog() {
    if (!this._catalogPath || !fs.existsSync(this._catalogPath)) return false;

    let catalog;
    try {
      catalog = JSON.parse(fs.readFileSync(this._catalogPath, 'utf8'));
    } catch {
      return false;
    }

    const movies = Array.isArray(catalog.movies) ? catalog.movies : [];
    let imported = 0;
    for (const movie of movies) {
      if (!movie || typeof movie !== 'object') continue;
      const hasRating = movie.imdbRating != null && movie.imdbRating !== '';
      const hasPlot = movie.plotSummary != null && movie.plotSummary !== '';
      if (!hasRating && !hasPlot) continue;

      // ONE key source (F41): uid — equivalent to the derivation below for
      // every real row (uid = id string / series:<title> per I6)
      const key = metadataKeyFor(movie);
      if (!key) continue;

      this._items.set(key, {
        imdbRating: hasRating ? Number(movie.imdbRating) : null,
        plotSummary: hasPlot ? String(movie.plotSummary) : null,
        updatedAt: new Date().toISOString()
      });
      imported += 1;
    }

    if (imported > 0) {
      this._dirty = true;
      recordWarning({
        file: this._filePath,
        kind: 'migrated-metadata',
        detail: `imported ${imported} items from catalog.json`,
        at: new Date().toISOString()
      });
      console.log(`  [METADATA] Migrated ${imported} items from catalog.json`);
      return true;
    }
    return false;
  }

  /**
   * @param {string} key - uid key (id string or series:<title>) via metadataKeyFor (F41)
   * @returns {{ imdbRating: number|null, plotSummary: string|null, updatedAt: string }|null}
   */
  get(key) {
    if (typeof key !== 'string') return null;
    return this._items.get(key) || null;
  }

  /**
   * Patch metadata for a key. Only provided fields are updated.
   * @param {string} key
   * @param {{ imdbRating?: number|null, plotSummary?: string|null }} patch
   */
  set(key, patch) {
    if (typeof key !== 'string' || !key) return;
    const existing = this._items.get(key) || {
      imdbRating: null,
      plotSummary: null,
      updatedAt: new Date().toISOString()
    };
    const next = {
      imdbRating: existing.imdbRating,
      plotSummary: existing.plotSummary,
      updatedAt: new Date().toISOString()
    };
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'imdbRating')) {
      next.imdbRating = patch.imdbRating != null ? Number(patch.imdbRating) : null;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'plotSummary')) {
      next.plotSummary = patch.plotSummary != null ? String(patch.plotSummary) : null;
    }
    // Skip empty entries
    if (next.imdbRating == null && next.plotSummary == null) {
      this._items.delete(key);
    } else {
      this._items.set(key, next);
    }
    this._dirty = true;
    this._scheduleSave();
  }

  /**
   * Move metadata when an item's key changes (id edit / series title edit).
   */
  rename(oldKey, newKey) {
    if (typeof oldKey !== 'string' || typeof newKey !== 'string') return;
    if (oldKey === newKey) return;
    if (!this._items.has(oldKey)) return;
    const entry = this._items.get(oldKey);
    this._items.delete(oldKey);
    this._items.set(newKey, { ...entry, updatedAt: new Date().toISOString() });
    this._dirty = true;
    this._scheduleSave();
  }

  /**
   * Delete metadata for a key (poster removed).
   */
  remove(key) {
    if (typeof key !== 'string') return;
    if (this._items.delete(key)) {
      this._dirty = true;
      this._scheduleSave();
    }
  }

  /**
   * Keys present in the store but not in `existingKeys`.
   * @param {Set<string>|string[]} existingKeys
   * @returns {string[]}
   */
  orphans(existingKeys) {
    const set = existingKeys instanceof Set ? existingKeys : new Set(existingKeys || []);
    const out = [];
    for (const key of this._items.keys()) {
      if (!set.has(key)) out.push(key);
    }
    return out;
  }

  /**
   * Merge stored metadata onto a movie-like object (does not mutate input).
   * Key default comes from metadataKeyFor() (F41) — the uid the store writes
   * and the indexer attaches under; never a raw movie field guessed here.
   * @param {object} movie
   * @param {string} [key] - explicit override (service-level callers)
   * @returns {object}
   */
  attach(movie, key) {
    if (!movie || typeof movie !== 'object') return movie;
    const k = key != null ? key : metadataKeyFor(movie);
    const entry = this.get(typeof k === 'string' ? k : null);
    const out = { ...movie };
    if (entry) {
      out.imdbRating = entry.imdbRating;
      out.plotSummary = entry.plotSummary;
    } else {
      if (!('imdbRating' in out)) out.imdbRating = null;
      if (!('plotSummary' in out)) out.plotSummary = null;
    }
    return out;
  }

  /** Debounced save (trailing 500 ms). */
  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, 500);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  /**
   * Synchronously persist to disk (atomic).
   * No-op when nothing changed (unless force).
   * @param {{ force?: boolean }} [options]
   */
  save(options) {
    const force = !!(options && options.force);
    if (!force && !this._dirty) return false;

    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    // Backup current file before overwrite (throttled by policy)
    try {
      if (fs.existsSync(this._filePath)) {
        this._backups.backup(this._filePath, 'metadata');
      }
    } catch { /* non-fatal */ }

    const payload = {
      version: STORE_VERSION,
      items: {}
    };
    for (const [key, entry] of this._items) {
      payload.items[key] = entry;
    }

    try {
      writeJsonAtomic(this._filePath, payload);
      this._dirty = false;
      return true;
    } catch (err) {
      console.error(`  [METADATA] Failed to save: ${err.message}`);
      recordWarning({
        file: this._filePath,
        kind: 'persist-failed',
        detail: err.message,
        at: new Date().toISOString()
      });
      return false;
    }
  }

  /**
   * Cancel timers and write any pending changes (shutdown / A6).
   */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._dirty) {
      return this.save({ force: true });
    }
    return true;
  }

  /** Number of tracked keys. */
  get count() {
    return this._items.size;
  }
}

module.exports = MetadataStore;
