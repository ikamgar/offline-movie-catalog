/**
 * Filesystem Watcher Module
 *
 * Monitors the Library directory for changes using native fs.watch.
 * When files are added, modified, or removed, updates the catalog index
 * in real-time without requiring a full rescan.
 *
 * Falls back to polling if native watching is unavailable.
 */

const fs = require('fs');
const path = require('path');
const { parseFilename, classifyFromPath } = require('./parser');

class LibraryWatcher {
  /**
   * @param {string} libraryPath - Absolute path to the Library root
   * @param {object} indexer - CatalogIndexer instance
   * @param {function} onChange - Callback fired when the catalog changes
   */
  constructor(libraryPath, indexer, onChange) {
    this._libraryPath = libraryPath;
    this._indexer = indexer;
    this._onChange = onChange;
    this._watchers = new Map(); // dirPath → fs.FSWatcher
    this._debounceTimers = new Map(); // filePath → timeout
    this._isRunning = false;
  }

  /**
   * Start watching the library directory recursively.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    console.log('  [WATCHER] Starting filesystem watcher...');

    if (!fs.existsSync(this._libraryPath)) {
      console.warn(`  [WATCHER] Library folder not found: ${this._libraryPath}`);
      return;
    }

    this._watchRecursive(this._libraryPath);
    console.log(`  [WATCHER] Watching ${this._watchers.size} directories`);
  }

  /**
   * Stop all watchers.
   */
  stop() {
    for (const [dirPath, watcher] of this._watchers) {
      try { watcher.close(); } catch {}
    }
    this._watchers.clear();
    this._debounceTimers.forEach(timer => clearTimeout(timer));
    this._debounceTimers.clear();
    this._isRunning = false;
    console.log('  [WATCHER] Stopped');
  }

  /**
   * Recursively watch a directory and all its subdirectories.
   */
  _watchRecursive(dirPath) {
    if (this._watchers.has(dirPath)) return;

    try {
      const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
        this._handleEvent(dirPath, eventType, filename);
      });

      watcher.on('error', (err) => {
        console.error(`  [WATCHER] Error watching ${dirPath}: ${err.message}`);
        this._watchers.delete(dirPath);
      });

      this._watchers.set(dirPath, watcher);

      // Watch new subdirectories
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this._watchRecursive(path.join(dirPath, entry.name));
        }
      }
    } catch (err) {
      console.error(`  [WATCHER] Cannot watch ${dirPath}: ${err.message}`);
    }
  }

  /**
   * Handle a filesystem event (add, change, rename/delete).
   */
  _handleEvent(dirPath, eventType, filename) {
    if (!filename) return;

    const fullPath = path.join(dirPath, filename);

    // Debounce rapid events for the same file (within 500ms)
    const existing = this._debounceTimers.get(fullPath);
    if (existing) clearTimeout(existing);

    this._debounceTimers.set(fullPath, setTimeout(() => {
      this._debounceTimers.delete(fullPath);
      this._processEvent(fullPath);
    }, 500));
  }

  /**
   * Process a debounced filesystem event.
   */
  _processEvent(fullPath) {
    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!this._watchers.has(fullPath)) {
            console.log(`  [WATCHER] New directory: ${path.basename(fullPath)}`);
            this._watchRecursive(fullPath);
          }
          return;
        }

        if (stat.isFile()) {
          // File exists — parse and add/update
          const parsed = parseFilename(path.basename(fullPath));
          if (!parsed) return; // Not a valid poster filename

          const relativePath = path.relative(this._libraryPath, fullPath);
          const { type, genres } = classifyFromPath(relativePath);

          const scanResult = {
            id: parsed.id,
            title: parsed.title,
            year: parsed.year,
            genres,
            type,
            posterPath: fullPath,
            relativePath,
            extension: parsed.extension,
            fileSize: stat.size,
            lastModified: stat.mtimeMs
          };

          // Check if this is a new file or an update
          const existingFile = this._indexer._fileIndex.get(fullPath);
          if (existingFile && existingFile.lastModified === stat.mtimeMs) {
            return; // No actual change
          }

          console.log(`  [WATCHER] ${existingFile ? 'Updated' : 'Added'}: ${path.basename(fullPath)}`);
          this._indexer.updateFile(scanResult);
          this._onChange('update', scanResult);

          // Watch new directories
          const parentDir = path.dirname(fullPath);
          if (!this._watchers.has(parentDir)) {
            this._watchRecursive(parentDir);
          }
        }
      } else {
        // File was deleted
        const result = this._indexer.removeFile(fullPath);
        if (result) {
          console.log(`  [WATCHER] Removed: ${path.basename(fullPath)} (${result.action})`);
          this._onChange('remove', result);
        }
      }
    } catch (err) {
      console.error(`  [WATCHER] Error processing event for ${fullPath}: ${err.message}`);
    }
  }
}

module.exports = LibraryWatcher;
