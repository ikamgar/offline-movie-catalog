/**
 * Catalog Indexer Module
 *
 * Builds and maintains the in-memory movie index.
 * Handles deduplication, merging, persistence, and change detection.
 *
 * Architecture:
 *   Raw scan results → Deduplicate by ID → Merge genres → Build index → Persist to disk
 *
 * On startup:
 *   1. Load catalog.json from disk (previous state)
 *   2. Scan library for new/changed files
 *   3. Merge scan results into existing catalog
 *   4. Save updated catalog to disk
 *   5. Build in-memory index for fast API lookups
 */

const path = require('path');
const { writeJsonAtomic, writeJsonStringAtomicAsync, readJsonSafe } = require('./storage/atomic-json');
const { seriesKey } = require('./utils/series-key');
const { gameKey } = require('./utils/game-key');
const { metadataKeyFor } = require('./utils/metadata-key');
const { version: APP_VERSION } = require('../package.json');

/**
 * Compute the Map key for any movie based on its type.
 * Series use normalized title; everything else uses `type:id` so Movie 0001
 * and Iranian 0001 never collapse (DATA-05 / D2 default: uid stays bare id).
 */
function getKey(movie) {
  if (movie.type === 'Series') return seriesKey(movie.title);
  if (movie.id == null || movie.id === '') return String(movie.id);
  return `${movie.type}:${movie.id}`;
}

/**
 * Total order for persistence sort (DATA-14).
 * Type priority (matches "All" view grouping), then key with numeric-aware
 * en locale compare. Keys are always strings (Series keys are normalised
 * titles), so null-id comparisons never occur.
 */
const TYPE_PERSIST_PRIORITY = { Movie: 0, Iranian: 1, Animation: 2, Series: 3 };

/**
 * Numeric-aware key comparison without ICU for ASCII-safe keys (P8c lag
 * budget). Digit runs compare by value (leading zeros ignored), everything
 * else by UTF-16 code unit. Equal to `localeCompare(b, 'en', { numeric: true })`
 * for the key forms isFastKey() accepts — proven by the fuzz pairs in
 * test/unit/persist-compare.test.js. ~12× faster: sorting 19k keys costs
 * ~75 ms instead of ~890 ms. Callers must gate through compareKeysPersist().
 */
function compareNumericAware(a, b) {
  let i = 0;
  let j = a.length;
  let k = 0;
  let l = b.length;
  while (i < j && k < l) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(k);
    const da = ca >= 48 && ca <= 57;
    const db = cb >= 48 && cb <= 57;
    if (da && db) {
      const si = i;
      const sk = k;
      while (i < j && a.charCodeAt(i) >= 48 && a.charCodeAt(i) <= 57) i++;
      while (k < l && b.charCodeAt(k) >= 48 && b.charCodeAt(k) <= 57) k++;
      let na = a.slice(si, i);
      let nb = b.slice(sk, k);
      let za = 0;
      let zb = 0;
      while (za < na.length - 1 && na.charCodeAt(za) === 48) za++;
      while (zb < nb.length - 1 && nb.charCodeAt(zb) === 48) zb++;
      na = na.slice(za);
      nb = nb.slice(zb);
      if (na.length !== nb.length) return na.length - nb.length;
      if (na !== nb) return na < nb ? -1 : 1;
      // numeric value equal ("007" vs "7") — keep scanning the tails
    } else if (ca !== cb) {
      return ca < cb ? -1 : 1;
    } else {
      i++;
      k++;
    }
  }
  return (j - i) - (l - k);
}

function isDigitsFrom(s, from) {
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/**
 * True for key forms where compareNumericAware equals ICU en/numeric:
 * the fixed-case `Movie|Iranian|Animation:<digits>` id keys, or Series
 * keys made only of lower-case letters, digits and spaces. Anything else
 * (punctuation like - . ( ) _ , or Persian letters — ICU orders Arabic
 * script by dictionary order, not code point) must use localeCompare.
 */
function isFastKey(s) {
  if (s.length > 0 && s.charCodeAt(0) >= 65 && s.charCodeAt(0) <= 90) {
    if (s.startsWith('Movie:')) return isDigitsFrom(s, 6);
    if (s.startsWith('Iranian:')) return isDigitsFrom(s, 8);
    if (s.startsWith('Animation:')) return isDigitsFrom(s, 10);
    return false; // uppercase keys must be the three known prefixes
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 32;
    if (!ok) return false;
  }
  return true;
}

/** Key comparison for persistence: fast path when both keys are isFastKey. */
function compareKeysPersist(ka, kb) {
  if (isFastKey(ka) && isFastKey(kb)) return compareNumericAware(ka, kb);
  return ka.localeCompare(kb, 'en', { numeric: true });
}

function compareForPersist(a, b) {
  const pa = TYPE_PERSIST_PRIORITY[a.type] != null ? TYPE_PERSIST_PRIORITY[a.type] : 99;
  const pb = TYPE_PERSIST_PRIORITY[b.type] != null ? TYPE_PERSIST_PRIORITY[b.type] : 99;
  if (pa !== pb) return pa - pb;
  const ka = String(getKey(a) == null ? '' : getKey(a));
  const kb = String(getKey(b) == null ? '' : getKey(b));
  return compareKeysPersist(ka, kb);
}

/**
 * Persistence sort with pre-computed (priority, key) pairs — the sync
 * comparator re-runs getKey() per comparison, which cost ~920 ms on a 19k
 * library (the dominant part of the 1.6 s reconcile flush). Same order as
 * `[...movies].sort(compareForPersist)` (verified by the DATA-14 tests).
 */
function sortForPersist(movies) {
  const dec = new Array(movies.length);
  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    const p = TYPE_PERSIST_PRIORITY[m.type] != null ? TYPE_PERSIST_PRIORITY[m.type] : 99;
    const k = getKey(m);
    dec[i] = { m, p, k: String(k == null ? '' : k) };
  }
  dec.sort((x, y) => (x.p !== y.p ? x.p - y.p : compareKeysPersist(x.k, y.k)));
  const out = new Array(movies.length);
  for (let i = 0; i < dec.length; i++) out[i] = dec[i].m;
  return out;
}

function yieldToLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

const SAVE_CHUNK = 2000; // movies per synchronous stringify chunk
const SCAN_CHUNK = 4096; // scan rows / built movies per generator yield

/**
 * Byte-identical to JSON.stringify(catalog) (compact form, same property
 * order), but yields to the event loop every SAVE_CHUNK movies so a 20k
 * catalog never serialises in one long synchronous chunk (P8c G6 lag
 * budget). Used by saveToDiskAsync().
 */
async function stringifyCatalogAsync(catalog) {
  const movies = Array.isArray(catalog.movies) ? catalog.movies : [];
  const out = ['{"meta":', JSON.stringify(catalog.meta || {}), ',"movies":['];
  for (let i = 0; i < movies.length; i++) {
    out.push(i === 0 ? JSON.stringify(movies[i]) : ',' + JSON.stringify(movies[i]));
    if ((i + 1) % SAVE_CHUNK === 0) await yieldToLoop();
  }
  out.push('],"fileIndex":', JSON.stringify(catalog.fileIndex || {}), '}');
  return out.join('');
}

/**
 * Compute the poster URL for a movie based on its key.
 * Carries `?v=<mtimeMs>` when known so clients can cache immutably (FE-12).
 */
function posterUrl(movie) {
  const key = getKey(movie);
  const base = `/api/poster/${encodeURIComponent(key)}`;
  const v = Number(movie && movie.mtime);
  return Number.isFinite(v) && v > 0 ? `${base}?v=${Math.trunc(v)}` : base;
}

/**
 * Compute the poster URL for a game (FE-12 — same `?v` contract as movies).
 */
function gamePosterUrl(key, mtimeMs) {
  const base = `/api/game-poster/${encodeURIComponent(key)}`;
  const v = Number(mtimeMs);
  return Number.isFinite(v) && v > 0 ? `${base}?v=${Math.trunc(v)}` : base;
}

/**
 * Generate a unique frontend ID (uid) for a movie.
 * Movie/Animation/Iranian: uid = id (string)
 * Series: uid = "series:<normalized-title>"
 */
function makeUid(type, id, title) {
  if (type === 'Series') return 'series:' + seriesKey(title);
  return String(id);
}

class CatalogIndexer {
  /**
   * @param {string} catalogPath - Path to catalog.json cache
   * @param {{ metadata?: import('./storage/metadata-store') }} [options] - Optional metadata store (DATA-10)
   */
  constructor(catalogPath, options) {
    this._catalogPath = catalogPath;
    this._catalog = { meta: {}, movies: [], fileIndex: {} };
    this._movieMap = new Map(); // map key → movie object (type:id or seriesKey)
    this._fileIndex = new Map(); // absolutePath → { id, key, lastModified }
    this._gamesMap = new Map(); // normalizedTitle → game object
    this._metadata = (options && options.metadata) || null;
    this._saveTimer = null;
    this._firstSaveAt = null;
    this._dirty = false;
    this._scanConflicts = { duplicateIds: [], conflictingMetadata: [] };
    this._lastInvalid = []; // last full-scan invalid files [{file,reason}] — DATA-15
    /**
     * Optional change hook (P8c G6): called after any in-memory mutation so
     * the server can invalidate cached API payloads. NOT fired for
     * scheduleSave()/flush() — disk writes do not change what we serve.
     */
    this.onChange = null;
  }

  /** Notify the attached onChange hook, if any (G6 payload invalidation). */
  _notifyChange() {
    if (typeof this.onChange !== 'function') return;
    try {
      this.onChange();
    } catch (err) {
      console.error(`  [INDEXER] onChange error: ${err.message}`);
    }
  }

  /**
   * Public change notification (P8c follow-up). Services that mutate the
   * in-memory maps directly — movie-editor re-keys _movieMap/_fileIndex on
   * rename — call this so the attached onChange hook refreshes the cached
   * payloads even when the change touches no file the watcher will report
   * (metadata-only edits). The HTTP layer's own invalidation is the belt;
   * this is the braces: every in-memory mutation notifies at the source.
   */
  notifyChanged() {
    this._notifyChange();
  }

  /**
   * Store the invalid-file list from the latest full library scan (DATA-15).
   * @param {Array<{file:string, reason:string}>} invalid
   */
  setLastInvalid(invalid) {
    this._lastInvalid = Array.isArray(invalid) ? invalid : [];
  }

  /** Invalid files from the latest full scan (never null). */
  getLastInvalid() {
    return this._lastInvalid || [];
  }

  /**
   * Attach a metadata store (DATA-10). Called by the server after construction.
   * @param {import('./storage/metadata-store')} store
   */
  setMetadataStore(store) {
    this._metadata = store;
  }

  /**
   * Merge stored manager metadata onto a movie-like object in place.
   * The key ALWAYS comes from metadataKeyFor() (F41) — the uid format the
   * store writes, never the indexer MAP key ("Movie:0001" etc.).
   * @param {object} movie
   * @param {string} [key] - optional explicit key (service-level callers)
   */
  _attachMetadata(movie, key) {
    if (!this._metadata || !movie) return movie;
    const k = key != null ? key : metadataKeyFor(movie);
    const entry = this._metadata.get(typeof k === 'string' ? k : null);
    movie.imdbRating = entry ? entry.imdbRating : null;
    movie.plotSummary = entry ? entry.plotSummary : null;
    return movie;
  }

  /**
   * Return a public-safe movie object (SEC-08).
   * Strips absolutePosterPath, _posterSet and any other internal fields.
   */
  static toPublicMovie(m) {
    return {
      uid: m.uid,
      id: m.id,
      title: m.title,
      year: m.year,
      genres: m.genres,
      type: m.type,
      poster: m.poster,
      imdbRating: m.imdbRating,
      plotSummary: m.plotSummary
    };
  }

  /**
   * Return a public-safe game object (SEC-08).
   */
  static toPublicGame(g) {
    return {
      uid: g.uid,
      title: g.title,
      platforms: g.platforms,
      type: g.type,
      poster: g.poster
    };
  }

  /**
   * Load the catalog from disk.
   * Returns the loaded catalog or an empty structure if no cache exists.
   * Uses readJsonSafe so a truncated cache never throws or blocks startup.
   */
  loadFromDisk() {
    const result = readJsonSafe(this._catalogPath, {
      backupDir: path.join(path.dirname(this._catalogPath), 'backups')
    });

    if (result.status === 'missing') {
      return null;
    }

    if (result.status === 'corrupt' || !result.data) {
      console.error('  [INDEXER] catalog.json was corrupt — starting with empty cache (quarantined)');
      return null;
    }

    const data = result.data;
    this._catalog = data;

    // Rebuild in-memory maps
    this._movieMap.clear();
    this._fileIndex.clear();

    for (const movie of (data.movies || [])) {
      if (!movie.uid) {
        movie.uid = makeUid(movie.type, movie.id, movie.title);
      }
      // Manager metadata lives in metadata.json, not the rebuildable cache (DATA-10);
      // key via metadataKeyFor (F41) — same uid string either way here
      this._attachMetadata(movie);
      this._movieMap.set(getKey(movie), movie);
    }

    for (const [filePath, entry] of Object.entries(data.fileIndex || {})) {
      // Re-resolve map keys written by older caches (bare id → type:id)
      let key = entry.key;
      if (key != null && !this._movieMap.has(key) && entry.id != null) {
        const m = this.getMovieById(String(entry.id));
        if (m) key = getKey(m);
      }
      this._fileIndex.set(filePath, key !== entry.key ? { ...entry, key } : entry);
    }

    // FE-12: backfill mtime from the fileIndex and normalise poster URLs so
    // caches written before ?v= support pick up versioned, cacheable URLs.
    for (const movie of this._movieMap.values()) {
      const entry = movie.absolutePosterPath
        ? this._fileIndex.get(movie.absolutePosterPath)
        : null;
      if (entry && Number.isFinite(entry.lastModified)) {
        movie.mtime = entry.lastModified;
      }
      movie.poster = posterUrl(movie);
    }

    console.log(`  [INDEXER] Loaded ${this._movieMap.size} movies from cache`);
    return data;
  }

  /**
   * Create a timestamped backup of the current catalog file.
   * @deprecated catalog.json is rebuildable — P2 A2 does not back it up.
   * Kept as a no-op so older call sites remain safe.
   */
  _createBackup() {
    // intentionally empty (see backend/storage/backup.js — not applied to catalog)
  }

  /**
   * Build the persistence snapshot: fresh meta, sorted+stripped movies,
   * plain-object fileIndex. Shared byte-for-byte by saveToDisk() and
   * saveToDiskAsync() (P8c).
   */
  _buildCatalogSnapshot() {
    this._catalog.meta = {
      version: APP_VERSION,
      lastUpdated: new Date().toISOString(),
      totalMovies: this._movieMap.size
    };

    this._catalog.movies = sortForPersist(Array.from(this._movieMap.values())).map((m) => {
      const { imdbRating, plotSummary, ...rest } = m;
      return rest;
    });

    // Convert fileIndex Map to plain object for JSON serialization
    this._catalog.fileIndex = {};
    for (const [key, val] of this._fileIndex) {
      this._catalog.fileIndex[key] = val;
    }

    return this._catalog;
  }

  /**
   * Persist the catalog cache atomically (compact JSON).
   * Synchronous write used by flush(); prefer scheduleSave() on hot paths (A5).
   * Manager-entered imdbRating/plotSummary are NOT written here (DATA-10).
   */
  saveToDisk() {
    try {
      writeJsonAtomic(this._catalogPath, this._buildCatalogSnapshot());
      this._dirty = false;
      this._firstSaveAt = null;
      console.log(`  [INDEXER] Saved catalog to disk: ${this._movieMap.size} movies`);
      return true;
    } catch (err) {
      console.error(`  [INDEXER] Failed to save cache: ${err.message}`);
      return false;
    }
  }

  /**
   * Async atomic save (P8c lag budget): same bytes as saveToDisk(), but the
   * stringify is chunked and the file I/O is promise-based, so the startup
   * reconcile's cache write never blocks the event loop for long.
   */
  async saveToDiskAsync() {
    try {
      const snapshot = this._buildCatalogSnapshot();
      const json = await stringifyCatalogAsync(snapshot);
      await writeJsonStringAtomicAsync(this._catalogPath, json);
      this._dirty = false;
      this._firstSaveAt = null;
      console.log(`  [INDEXER] Saved catalog to disk: ${this._movieMap.size} movies`);
      return true;
    } catch (err) {
      console.error(`  [INDEXER] Failed to save cache: ${err.message}`);
      return false;
    }
  }

  /**
   * Debounced async save (A5): trailing 500 ms, max wait 5 s.
   * Coalesces bursts of watcher/API changes into one atomic write.
   */
  scheduleSave() {
    this._dirty = true;
    const now = Date.now();
    if (this._firstSaveAt == null) this._firstSaveAt = now;

    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    const elapsed = now - this._firstSaveAt;
    const MAX_WAIT_MS = 5000;
    const TRAILING_MS = 500;
    const delay = Math.max(0, Math.min(TRAILING_MS, MAX_WAIT_MS - elapsed));

    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveToDisk();
    }, delay);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  /**
   * Cancel any pending debounced save and write immediately (shutdown / A6).
   * Always writes so startup creates catalog.json even for an empty library.
   */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    return this.saveToDisk();
  }

  /**
   * Async twin of flush() — used by the startup reconcile so the cache write
   * yields to the event loop (P8c lag budget). Shutdown and tests keep the
   * synchronous flush().
   */
  async flushAsync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    return this.saveToDiskAsync();
  }

  /**
   * Add a single file to the index (called by the watcher on file creation).
   */
  addFile(scanResult) {
    const key = getKey(scanResult);
    if (this._movieMap.has(key)) {
      const movie = this._movieMap.get(key);
      for (const g of scanResult.genres) {
        if (!movie.genres.includes(g)) {
          movie.genres.push(g);
        }
      }
      movie.genres.sort();
      movie.type = scanResult.type;
      movie.absolutePosterPath = scanResult.posterPath;
      // Filesystem is the source of truth for filename-derived fields (I1).
      // A same-id rename must pick up the new title/year on reconcile (AC2).
      if (scanResult.title != null) movie.title = scanResult.title;
      if (scanResult.year !== undefined) movie.year = scanResult.year;
      movie.mtime = scanResult.lastModified;
      movie.poster = posterUrl(movie);
    } else {
      const uid = makeUid(scanResult.type, scanResult.id, scanResult.title);
      const movie = {
        uid,
        id: scanResult.id,
        title: scanResult.title,
        year: scanResult.year,
        genres: [...scanResult.genres].sort(),
        type: scanResult.type,
        absolutePosterPath: scanResult.posterPath,
        mtime: scanResult.lastModified,
        _posterSet: true
      };
      movie.poster = posterUrl(movie);
      this._attachMetadata(movie);
      this._movieMap.set(key, movie);
    }

    this._fileIndex.set(scanResult.posterPath, {
      id: scanResult.id,
      key: key,
      lastModified: scanResult.lastModified
    });

    this._notifyChange();
    return this._movieMap.get(key);
  }

  /**
   * Remove a file from the index (called by the watcher on file deletion).
   */
  removeFile(filePath) {
    const entry = this._fileIndex.get(filePath);
    if (!entry) return null;

    this._fileIndex.delete(filePath);

    const movieKey = entry.key;
    // Check if any other files exist for this movie
    for (const [, otherEntry] of this._fileIndex) {
      if (otherEntry.key === movieKey) {
        // Other files still exist — keep the movie (fileIndex still changed)
        this._notifyChange();
        return { action: 'kept', id: entry.id };
      }
    }

    // No more files — remove the movie
    const movie = this._movieMap.get(movieKey);
    this._movieMap.delete(movieKey);
    this._notifyChange();
    return { action: 'removed', id: entry.id, movie };
  }

  /**
   * Update a file in the index (called by the watcher on file modification).
   */
  updateFile(scanResult) {
    return this.addFile(scanResult);
  }

  /**
   * Get all movies as an array (for API response).
   * Returns public-safe objects without internal fields (SEC-08).
   */
  getMovies() {
    return Array.from(this._movieMap.values()).map(CatalogIndexer.toPublicMovie);
  }

  /**
   * Get a movie by its map key or bare id (URL param, already Express-decoded).
   * Exact `type:id` / series-key match first, then bare-id fallback by priority
   * Movie > Iranian > Animation (D2: uid stays the bare id string).
   * Do NOT call decodeURIComponent here — Express already decoded the param (DATA-06).
   */
  getMovieById(id) {
    if (id == null) return null;
    const key = String(id);
    const exact = this._movieMap.get(key);
    if (exact) return exact;
    for (const type of ['Movie', 'Iranian', 'Animation']) {
      const m = this._movieMap.get(`${type}:${key}`);
      if (m) return m;
    }
    return null;
  }

  /**
   * Look up a movie or game by its uid (S9 — WS re-hydration).
   * @param {string} uid
   * @returns {object|null} The raw movie/game object or null if not found
   */
  getByUid(uid) {
    if (typeof uid !== 'string') return null;
    // Game: uid === "game:<normalised title>"
    if (uid.startsWith('game:')) {
      return this._gamesMap.get(uid.slice(5)) || null;
    }
    // Series: uid === "series:<normalised title>", map key is the bare seriesKey
    if (uid.startsWith('series:')) {
      return this._movieMap.get(uid.slice(7)) || null;
    }
    // Movie/Animation/Iranian: uid === id string
    return this.getMovieById(uid);
  }

  /**
   * Get the poster file path for a movie.
   * Uses the absolutePosterPath stored directly in the movie object.
   * The key param is the Express-decoded route param — no second decode (DATA-06).
   */
  getPosterPath(id) {
    if (id == null) return null;
    const movie = this.getByUid(String(id)) || this.getMovieById(String(id));
    if (movie && movie.absolutePosterPath) return movie.absolutePosterPath;
    return null;
  }

  /**
   * Get the total number of movies in the catalog.
   */
  get count() {
    return this._movieMap.size;
  }

  /**
   * Clear the entire in-memory index.
   * Used before a full rescan to ensure no stale data remains.
   */
  clear() {
    this._movieMap.clear();
    this._fileIndex.clear();
    this._catalog = { meta: {}, movies: [], fileIndex: {} };
    this._scanConflicts = { duplicateIds: [], conflictingMetadata: [] };
    console.log('  [INDEXER] Index cleared');
  }

  /**
   * Build a fresh index from scan results WITHOUT touching the live maps
   * (build-aside, P8c). Yields every SCAN_CHUNK rows so replaceFromScanAsync
   * never blocks the event loop; replaceFromScan drains the same generator
   * synchronously (yields are no-ops) — both produce identical state.
   *
   * Merges with previous state — preserves custom fields (imdbRating, plotSummary, edited titles).
   * Merges genres across files with the same ID within the scan.
   *
   * @param {Array<object>} scanResults - Complete fresh results from scanner
   * @param {Map<string, object>} existingMovies - Prior movieMap (custom fields)
   * @returns {{movieMap: Map<string,object>, fileIndex: Map<string,object>, conflicts: object}}
   */
  *_buildIndexFromScan(scanResults, existingMovies) {
    const movieMap = new Map();
    const fileIndex = new Map();
    const conflicts = { duplicateIds: [], conflictingMetadata: [] };

    // Step 1: Accumulate genres and file paths per key across all files
    const genreMap = new Map(); // key → Set of genres
    const movieData = new Map(); // key → { id, title, year, type } (first occurrence)
    const filesPerMovie = new Map(); // key → [{ posterPath, lastModified }]
    // Cross-type same bare id → both file paths for duplicateIds (never drop)
    const bareIdPaths = new Map(); // id → [{type, path}]

    let rows = 0;
    for (const result of scanResults) {
      const key = getKey(result);

      // Accumulate genres
      if (!genreMap.has(key)) {
        genreMap.set(key, new Set());
      }
      for (const g of result.genres) {
        genreMap.get(key).add(g);
      }

      // Keep first occurrence of movie metadata (winner by path order within type)
      if (!movieData.has(key)) {
        movieData.set(key, result);
      } else {
        const first = movieData.get(key);
        if (first.title !== result.title || first.year !== result.year) {
          conflicts.conflictingMetadata.push({
            key,
            type: result.type,
            entries: [
              { title: first.title, year: first.year, path: first.path || first.posterPath },
              { title: result.title, year: result.year, path: result.path || result.posterPath }
            ]
          });
        }
      }

      // Track ALL file paths for this key
      if (!filesPerMovie.has(key)) {
        filesPerMovie.set(key, []);
      }
      filesPerMovie.get(key).push({
        posterPath: result.posterPath,
        lastModified: result.lastModified
      });

      // Bare-id collisions across types (DATA-05) — report with both paths
      if (result.type !== 'Series' && result.id != null) {
        if (!bareIdPaths.has(result.id)) bareIdPaths.set(result.id, []);
        const list = bareIdPaths.get(result.id);
        if (!list.some(e => e.type === result.type && e.path === (result.path || result.posterPath))) {
          list.push({ type: result.type, path: result.path || result.posterPath });
        }
      }
      if (++rows % SCAN_CHUNK === 0) yield;
    }

    // Record cross-type duplicate ids (different types sharing a bare id)
    for (const [id, entries] of bareIdPaths) {
      const types = new Set(entries.map(e => e.type));
      if (types.size > 1) {
        conflicts.duplicateIds.push({ id, paths: entries.map(e => e.path), types: [...types] });
      }
    }

    // Step 2: Build the final movie entries with merged genres + metadata store (DATA-10)
    rows = 0;
    for (const [key, result] of movieData) {
      const mergedGenres = [...(genreMap.get(key) || [])].sort();
      const uid = makeUid(result.type, result.id, result.title);
      const existing = existingMovies.get(key);

      const movie = {
        uid,
        id: result.id,
        // Preserve manually edited title if it exists in the database
        title: (existing && existing.title) ? existing.title : result.title,
        year: result.year,
        genres: mergedGenres,
        type: result.type,
        absolutePosterPath: result.posterPath,
        _posterSet: true
      };
      // mtime of the served copy (absolutePosterPath) — feeds ?v= (FE-12)
      const primaryFile = (filesPerMovie.get(key) || [])
        .find((f) => f.posterPath === result.posterPath);
      if (primaryFile && Number.isFinite(primaryFile.lastModified)) {
        movie.mtime = primaryFile.lastModified;
      }
      // Prefer durable metadata store; fall back to in-memory merge for
      // stores not yet wired (unit tests) so custom fields survive a rescan.
      // F41: key = the uid (metadataKeyFor), NOT the MAP key `key` — the old
      // `this._attachMetadata(movie, key)` here made ratings/plots vanish on
      // every restart/rescan (regression from 724b8178).
      if (this._metadata) {
        this._attachMetadata(movie);
      } else {
        movie.imdbRating = existing ? existing.imdbRating : null;
        movie.plotSummary = existing ? existing.plotSummary : null;
      }
      movie.poster = posterUrl(movie);
      movieMap.set(key, movie);

      // Index ALL file paths for this movie (multiple posters possible)
      for (const file of (filesPerMovie.get(key) || [])) {
        fileIndex.set(file.posterPath, {
          id: result.id,
          key: key,
          lastModified: file.lastModified
        });
      }
      if (++rows % SCAN_CHUNK === 0) yield;
    }

    return { movieMap, fileIndex, conflicts };
  }

  /**
   * Single-step publish of a build-aside index: the live maps are swapped
   * atomically (one synchronous step — no request can observe a half-built
   * catalog), mirroring the state `clear()` used to create mid-rebuild.
   */
  _publishScan(built) {
    this._movieMap = built.movieMap;
    this._fileIndex = built.fileIndex;
    this._scanConflicts = built.conflicts;
    this._catalog = { meta: {}, movies: [], fileIndex: {} };
    console.log('  [INDEXER] Index cleared');

    const stats = { total: this._movieMap.size };
    if (this._scanConflicts.duplicateIds.length || this._scanConflicts.conflictingMetadata.length) {
      console.warn(
        `  [INDEXER] ⚠ scan conflicts: ${this._scanConflicts.duplicateIds.length} cross-type id(s), ` +
        `${this._scanConflicts.conflictingMetadata.length} metadata clash(es) — see diagnostics`
      );
    }
    console.log(`  [INDEXER] Replaced catalog: ${stats.total} movies, ${this._fileIndex.size} files indexed`);
    this._notifyChange();
    return stats;
  }

  /**
   * Replace the entire catalog from a fresh set of scan results (sync).
   * Drains the build-aside generator in one go — same behaviour as before
   * the P8c split, and identical state to replaceFromScanAsync().
   *
   * @param {Array<object>} scanResults - Complete fresh results from scanner
   * @returns {object} - Stats
   */
  replaceFromScan(scanResults) {
    const existingMovies = new Map(this._movieMap);
    const iter = this._buildIndexFromScan(scanResults, existingMovies);
    let step = iter.next();
    while (!step.done) step = iter.next();
    return this._publishScan(step.value);
  }

  /**
   * Async twin of replaceFromScan (P8c): the same generator, yielded between
   * chunks, then one atomic swap. The live index keeps serving the previous
   * catalog until the very last step — never a partially built one.
   *
   * @param {Array<object>} scanResults - Complete fresh results from scanner
   * @returns {Promise<object>} - Stats
   */
  async replaceFromScanAsync(scanResults) {
    const existingMovies = new Map(this._movieMap);
    const iter = this._buildIndexFromScan(scanResults, existingMovies);
    let step = iter.next();
    while (!step.done) {
      await yieldToLoop();
      step = iter.next();
    }
    return this._publishScan(step.value);
  }

  /**
   * Add a single movie to the in-memory index.
   * Called by MovieCreator after successful creation.
   *
   * @param {object} movie - Movie object to add
   */
  addMovieToIndex(movie) {
    const key = getKey(movie);
    this._movieMap.set(key, movie);
    console.log(`  [INDEXER] Added movie to index: ${movie.id} - ${movie.title}`);
    this._notifyChange();
  }

  /**
   * Remove a movie from the in-memory index by map key (type:id / seriesKey).
   * Used by MovieCreator rollback (DATA-09 — never filter by bare id/null).
   * Also drops every _fileIndex entry whose key matches.
   * @param {string} key - CatalogIndexer.getKey(movie)
   * @returns {boolean} true if a movie was removed
   */
  removeMovieByKey(key) {
    if (key == null || !this._movieMap.has(key)) return false;
    this._movieMap.delete(key);
    for (const [filePath, entry] of [...this._fileIndex]) {
      if (entry && entry.key === key) {
        this._fileIndex.delete(filePath);
      }
    }
    console.log(`  [INDEXER] Removed movie from index by key: ${key}`);
    this._notifyChange();
    return true;
  }

  /**
   * Normalize a game title into a unique map key (F26 canonical helper).
   */
  _gameKey(title) {
    return gameKey(title);
  }

  /**
   * Process raw game scan results: merge by title, assign platforms.
   *
   * @param {Array<object>} scanResults - Results from scanGames()
   * @returns {object} - Stats
   */
  processGameResults(scanResults) {
    let added = 0;
    let updated = 0;

    for (const result of scanResults) {
      const key = this._gameKey(result.title);

      if (this._gamesMap.has(key)) {
        // Merge platforms
        const game = this._gamesMap.get(key);
        for (const p of result.platforms) {
          if (!game.platforms.includes(p)) {
            game.platforms.push(p);
          }
        }
        game.platforms.sort();
        // Refresh mtime only for the copy that is actually served
        if (result.posterPath === game.absolutePosterPath && Number.isFinite(result.lastModified)) {
          game.mtime = result.lastModified;
          game.poster = gamePosterUrl(key, game.mtime);
        }
        updated++;
      } else {
        // New game
        const game = {
          uid: 'game:' + key,
          title: result.title,
          platforms: [...result.platforms].sort(),
          type: 'Game',
          absolutePosterPath: result.posterPath,
          mtime: result.lastModified,
          poster: gamePosterUrl(key, result.lastModified)
        };
        this._gamesMap.set(key, game);
        added++;
      }
    }

    const stats = { added, updated, total: this._gamesMap.size };
    console.log(`  [INDEXER] Games: +${added} new, ~${updated} updated, ${stats.total} total`);
    this._notifyChange();
    return stats;
  }

  /**
   * Replace the entire games index from a fresh scanGames() result.
   * Builds the new map aside, then swaps it in with one synchronous step so a
   * request never observes a half-applied games catalog (F31 / I1 for games).
   * Games whose files no longer exist on disk are dropped; absolutePosterPath
   * and platforms are re-pointed to surviving copies. A deleted PS5 poster
   * removes the PS5 platform and its path; deleting every copy removes the
   * game. Platform merging (I8) stays with the creator/edit commit paths.
   *
   * @param {Array<object>} scanResults - Results from scanGames()
   * @returns {{total:number}}
   */
  replaceGames(scanResults) {
    const gamesMap = new Map();
    for (const result of scanResults) {
      const key = this._gameKey(result.title);
      let game = gamesMap.get(key);
      if (!game) {
        game = {
          uid: 'game:' + key,
          title: result.title,
          platforms: [],
          type: 'Game',
          absolutePosterPath: result.posterPath,
          mtime: result.lastModified,
          poster: gamePosterUrl(key, result.lastModified)
        };
        gamesMap.set(key, game);
      }
      for (const p of (result.platforms || [])) {
        if (!game.platforms.includes(p)) game.platforms.push(p);
      }
      game.platforms.sort();
      if (result.posterPath === game.absolutePosterPath && Number.isFinite(result.lastModified)) {
        game.mtime = result.lastModified;
        game.poster = gamePosterUrl(key, game.mtime);
      }
    }
    this._gamesMap = gamesMap;
    this._notifyChange();
    return { total: gamesMap.size };
  }

  /**
   * Get all games as an array (for API response).
   */
  getGames() {
    return Array.from(this._gamesMap.values());
  }

  /**
   * Get a game by its normalized title key.
   */
  getGameByTitle(title) {
    const key = this._gameKey(title);
    return this._gamesMap.get(key) || null;
  }

  /**
   * Get the game poster file path for a game.
   */
  getGamePosterPath(title) {
    const key = this._gameKey(title);
    const game = this._gamesMap.get(key);
    if (game && game.absolutePosterPath) return game.absolutePosterPath;
    return null;
  }

  /**
   * Drop a game from the in-memory index by title (P6c E4).
   * Games are never cached in catalog.json — the filesystem is the store —
   * so this only mutates the running index (delete / pre-rescan refresh).
   * @param {string} title
   * @returns {boolean} whether an entry was removed
   */
  removeGame(title) {
    const key = this._gameKey(title);
    const had = this._gamesMap.delete(key);
    if (had) {
      console.log(`  [INDEXER] Removed game from index: ${key}`);
      this._notifyChange();
    }
    return had;
  }

  /**
   * Run diagnostics on the catalog.
   * Returns an object with arrays of issues found.
   */
  runDiagnostics() {
    const issues = {
      duplicateIds: [],
      duplicateSeriesTitles: [],
      missingPosters: [],
      invalidFilenames: [],
      missingYears: [],
      unknownTypes: [],
      brokenLinks: [],
      emptyGenres: [],
      conflictingMetadata: []
    };

    // Prefer scan-time conflicts (both file paths) when available
    if (this._scanConflicts) {
      for (const d of this._scanConflicts.duplicateIds) {
        issues.duplicateIds.push({ id: d.id, count: d.paths.length, paths: d.paths, types: d.types });
      }
      for (const c of this._scanConflicts.conflictingMetadata) {
        issues.conflictingMetadata.push(c);
      }
    }

    // Separate duplicate detection for Movies vs Series
    const movieIdCounts = new Map();   // id → count (Movie/Animation/Iranian)
    const seriesTitleCounts = new Map(); // normalized title → count (Series)

    for (const movie of this._movieMap.values()) {
      if (movie.type === 'Series') {
        const key = seriesKey(movie.title);
        seriesTitleCounts.set(key, (seriesTitleCounts.get(key) || 0) + 1);
      } else {
        movieIdCounts.set(movie.id, (movieIdCounts.get(movie.id) || 0) + 1);
      }
    }

    for (const [id, count] of movieIdCounts) {
      if (count > 1) {
        // Cross-type same bare id already reported with paths — enrich if missing
        const existing = issues.duplicateIds.find(d => d.id === id);
        if (existing) {
          existing.count = count;
        } else {
          issues.duplicateIds.push({ id, count });
        }
      }
    }

    for (const [title, count] of seriesTitleCounts) {
      if (count > 1) {
        issues.duplicateSeriesTitles.push({ title, count });
      }
    }

    // Missing posters / broken links from file-index membership only —
    // no per-file existsSync (DATA-15 / B9 / ARCH-04). Disk truth returns
    // on the next scan or watcher reconcile.
    const indexedPaths = new Set(this._fileIndex.keys());
    const movieKeys = new Set(this._movieMap.keys());

    for (const movie of this._movieMap.values()) {
      if (!movie.absolutePosterPath || !indexedPaths.has(movie.absolutePosterPath)) {
        issues.missingPosters.push({ id: movie.id, title: movie.title });
      }

      // Missing year — only an issue for Movie type (Animation/Iranian/Series have null year by design)
      if (movie.type === 'Movie' && (!movie.year || movie.year < 1900 || movie.year > 2099)) {
        issues.missingYears.push({ id: movie.id, title: movie.title, year: movie.year });
      }

      // Unknown media type
      if (!movie.type || movie.type === 'Unknown') {
        issues.unknownTypes.push({ id: movie.id, title: movie.title });
      }

      // Empty genres — only an issue for Movie type (Animation/Iranian/Series have empty genres by design)
      if (movie.type === 'Movie' && (!movie.genres || movie.genres.length === 0)) {
        issues.emptyGenres.push({ id: movie.id, title: movie.title });
      }
    }

    // Stale file-index entries whose key no longer resolves to a movie
    for (const [filePath, entry] of this._fileIndex) {
      if (entry && entry.key != null && !movieKeys.has(entry.key)) {
        issues.brokenLinks.push({ path: filePath, id: entry.id });
      }
    }

    return issues;
  }
}

module.exports = CatalogIndexer;
module.exports.compareForPersist = compareForPersist;
module.exports.compareNumericAware = compareNumericAware;
module.exports.compareKeysPersist = compareKeysPersist;
module.exports.isFastKey = isFastKey;
module.exports.sortForPersist = sortForPersist;
module.exports.stringifyCatalogAsync = stringifyCatalogAsync;
module.exports.getKey = getKey;
module.exports.seriesKey = seriesKey;
module.exports.gameKey = gameKey;
module.exports.posterUrl = posterUrl;
module.exports.gamePosterUrl = gamePosterUrl;
