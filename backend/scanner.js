/**
 * Library Scanner Module v2.0
 *
 * Generic recursive filesystem scanner.
 * Walks EVERY directory, finds EVERY image file, classifies by path.
 *
 * Classification (single source of truth via parser.TYPE_MAP):
 *   Library/Movies/{Genre}/...   → type = "Movie",   genres = [Genre]
 *   Library/Animation/...        → type = "Animation", genres = []
 *   Library/Series/...           → type = "Series",   genres = []
 *   Library/Iranian/...          → type = "Iranian",  genres = []
 *
 * Shared per-file pipeline: scanFile(absPath, libraryPath) is used by both
 * scanLibrary and the watcher so they can never diverge.
 *
 * Output per file:
 *   { path, filename, id, title, year, type, genres, posterPath, ... }
 */

const fs = require('fs');
const path = require('path');
const { parseFilenameEx, parseGameFilename, classifyFromPath, IMAGE_EXTENSIONS } = require('./parser');

// Quiet by default: summary + warnings still log; per-file lines only with DEBUG_SCAN=1 (ARCH-04)
const DEBUG_LOGGING = process.env.DEBUG_SCAN === '1';

function log(msg) {
  if (DEBUG_LOGGING) console.log(`  [SCANNER] ${msg}`);
}

/**
 * Normalize a game title into a unique map key.
 * trim → collapse spaces → lowercase
 */
function gameKey(title) {
  return (title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Classify + parse a single poster file through the shared pipeline.
 *
 * @param {string} absPath - Absolute path to the image file
 * @param {string} libraryPath - Absolute Library root
 * @returns {{ok:true, entry:object} | {ok:false, reason:string, file:string}}
 *   entry: { path, filename, id, title, year, type, genres, posterPath,
 *            extension, fileSize, lastModified }
 */
function scanFile(absPath, libraryPath) {
  const relativePath = path.relative(libraryPath, absPath);
  const filename = path.basename(absPath);
  const { type, genres } = classifyFromPath(relativePath);

  const parsed = parseFilenameEx(filename, type);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, file: relativePath };
  }

  let stats;
  try {
    stats = fs.statSync(absPath);
  } catch {
    return { ok: false, reason: 'unreadable', file: relativePath };
  }

  return {
    ok: true,
    entry: {
      path: relativePath,
      filename,
      id: parsed.entry.id,
      title: parsed.entry.title,
      year: parsed.entry.year,
      type,
      genres,
      posterPath: absPath,
      extension: parsed.entry.extension,
      fileSize: stats.size,
      lastModified: stats.mtimeMs
    }
  };
}

/**
 * Recursively walk a directory tree.
 * Skips Games/ (own pipeline) and any dot-folder (.trash, .tmp) at the top level.
 * Returns { dirsVisited, imageFiles: [{fullPath, filename}], ignoredFiles }
 */
function walkDir(dirPath, libraryRoot) {
  const result = { dirsVisited: 0, imageFiles: [], ignoredFiles: 0 };

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`  [SCANNER] Cannot read directory: ${dirPath} — ${err.message}`);
    return result;
  }

  result.dirsVisited = 1;

  const isLibraryRoot = libraryRoot != null && path.resolve(dirPath) === path.resolve(libraryRoot);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // At the Library root: skip Games/ (own pipeline, DATA-04) and dot-folders
      if (isLibraryRoot) {
        if (entry.name.toLowerCase() === 'games') {
          log(`Skipping Games/ (own pipeline)`);
          continue;
        }
        if (entry.name.startsWith('.')) {
          log(`Skipping dot-folder: ${entry.name}`);
          continue;
        }
      }

      const sub = walkDir(fullPath, libraryRoot);
      result.dirsVisited += sub.dirsVisited;
      result.imageFiles.push(...sub.imageFiles);
      result.ignoredFiles += sub.ignoredFiles;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        result.imageFiles.push({ fullPath, filename: entry.name });
      } else {
        result.ignoredFiles++;
      }
    }
  }

  return result;
}

/** Yield one turn of the event loop (B10 async walk). */
function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Async recursive walk — same skip rules as walkDir; yields between directories
 * so a long rescan does not stall the event loop (B10 / AC8).
 */
async function walkDirAsync(dirPath, libraryRoot) {
  const result = { dirsVisited: 0, imageFiles: [], ignoredFiles: 0 };

  let entries;
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`  [SCANNER] Cannot read directory: ${dirPath} — ${err.message}`);
    return result;
  }

  result.dirsVisited = 1;

  const isLibraryRoot = libraryRoot != null && path.resolve(dirPath) === path.resolve(libraryRoot);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (isLibraryRoot) {
        if (entry.name.toLowerCase() === 'games') {
          log(`Skipping Games/ (own pipeline)`);
          continue;
        }
        if (entry.name.startsWith('.')) {
          log(`Skipping dot-folder: ${entry.name}`);
          continue;
        }
      }

      const sub = await walkDirAsync(fullPath, libraryRoot);
      result.dirsVisited += sub.dirsVisited;
      result.imageFiles.push(...sub.imageFiles);
      result.ignoredFiles += sub.ignoredFiles;
      await yieldTick();
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        result.imageFiles.push({ fullPath, filename: entry.name });
      } else {
        result.ignoredFiles++;
      }
    }
  }

  await yieldTick();
  return result;
}

/**
 * Scan the entire Library directory from scratch.
 * Returns { results, stats, invalid }
 *
 * stats = { dirsVisited, imageFilesFound, moviesParsed, ignoredFiles,
 *           parseFailures, invalidCount, elapsedMs }
 * invalid = [{ file, reason }] for every poster that could not be indexed.
 */
function scanLibrary(libraryPath) {
  const t0 = Date.now();

  log(`Scanning: ${libraryPath}`);

  if (!fs.existsSync(libraryPath)) {
    console.warn(`  [SCANNER] Library folder not found: ${libraryPath}`);
    return {
      results: [],
      stats: { dirsVisited: 0, imageFilesFound: 0, moviesParsed: 0, ignoredFiles: 0, parseFailures: 0, invalidCount: 0, elapsedMs: 0 },
      invalid: []
    };
  }

  const walk = walkDir(libraryPath, libraryPath);
  log(`Visited ${walk.dirsVisited} directories, found ${walk.imageFiles.length} image files, ignored ${walk.ignoredFiles} non-image files`);

  const results = [];
  const invalid = [];
  let parseFailures = 0;

  for (const { fullPath } of walk.imageFiles) {
    const relativePath = path.relative(libraryPath, fullPath);
    log(`Scanning: ${relativePath}`);

    const scan = scanFile(fullPath, libraryPath);
    if (!scan.ok) {
      parseFailures++;
      invalid.push({ file: scan.file, reason: scan.reason });
      log(`  ⚠ ${scan.reason}: ${scan.file}`);
      continue;
    }

    results.push(scan.entry);
    log(`  ✓ id=${scan.entry.id} title="${scan.entry.title}" year=${scan.entry.year} type=${scan.entry.type} genres=[${scan.entry.genres}]`);
  }

  const elapsedMs = Date.now() - t0;

  const stats = {
    dirsVisited: walk.dirsVisited,
    imageFilesFound: walk.imageFiles.length,
    moviesParsed: results.length,
    ignoredFiles: walk.ignoredFiles,
    parseFailures,
    invalidCount: invalid.length,
    elapsedMs
  };

  log(`Scan complete: ${stats.moviesParsed} movies parsed from ${stats.imageFilesFound} image files in ${stats.elapsedMs}ms`);

  // Summary warning (always): unparseable posters are invisible to the admin otherwise (DATA-15)
  if (invalid.length > 0) {
    console.warn(`  [SCANNER] ⚠ ${invalid.length} file(s) could not be indexed (set DEBUG_SCAN=1 for details)`);
  }

  return { results, stats, invalid };
}

/**
 * Async full library scan (B10) — same output shape as scanLibrary.
 * Yields to the event loop between directories and every 64 files.
 */
async function scanLibraryAsync(libraryPath) {
  const t0 = Date.now();

  log(`Scanning (async): ${libraryPath}`);

  if (!fs.existsSync(libraryPath)) {
    console.warn(`  [SCANNER] Library folder not found: ${libraryPath}`);
    return {
      results: [],
      stats: { dirsVisited: 0, imageFilesFound: 0, moviesParsed: 0, ignoredFiles: 0, parseFailures: 0, invalidCount: 0, elapsedMs: 0 },
      invalid: []
    };
  }

  const walk = await walkDirAsync(libraryPath, libraryPath);
  log(`Visited ${walk.dirsVisited} directories, found ${walk.imageFiles.length} image files, ignored ${walk.ignoredFiles} non-image files`);

  const results = [];
  const invalid = [];
  let parseFailures = 0;

  for (let i = 0; i < walk.imageFiles.length; i++) {
    const { fullPath } = walk.imageFiles[i];
    if (i > 0 && i % 64 === 0) {
      await yieldTick();
    }

    const relativePath = path.relative(libraryPath, fullPath);
    log(`Scanning: ${relativePath}`);

    const scan = scanFile(fullPath, libraryPath);
    if (!scan.ok) {
      parseFailures++;
      invalid.push({ file: scan.file, reason: scan.reason });
      log(`  ⚠ ${scan.reason}: ${scan.file}`);
      continue;
    }

    results.push(scan.entry);
    log(`  ✓ id=${scan.entry.id} title="${scan.entry.title}" year=${scan.entry.year} type=${scan.entry.type} genres=[${scan.entry.genres}]`);
  }

  const elapsedMs = Date.now() - t0;

  const stats = {
    dirsVisited: walk.dirsVisited,
    imageFilesFound: walk.imageFiles.length,
    moviesParsed: results.length,
    ignoredFiles: walk.ignoredFiles,
    parseFailures,
    invalidCount: invalid.length,
    elapsedMs
  };

  log(`Scan complete: ${stats.moviesParsed} movies parsed from ${stats.imageFilesFound} image files in ${stats.elapsedMs}ms`);

  if (invalid.length > 0) {
    console.warn(`  [SCANNER] ⚠ ${invalid.length} file(s) could not be indexed (set DEBUG_SCAN=1 for details)`);
  }

  return { results, stats, invalid };
}

/**
 * Resolve the on-disk folder for a media type (D7).
 * Series: find an existing `Series`/`Serries` directory (case-insensitive);
 * new libraries get `Series`. Other types use the conventional folder name.
 *
 * @param {string} libraryPath - Absolute Library root
 * @param {string} type - Movie | Animation | Iranian | Series
 * @returns {string} Absolute path of the target folder (not necessarily created)
 */
function resolveTypeFolder(libraryPath, type) {
  if (type === 'Series') {
    let entries = [];
    try {
      entries = fs.readdirSync(libraryPath, { withFileTypes: true });
    } catch {
      // missing library root → fall through to default name
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (lower === 'series' || lower === 'serries') {
        return path.join(libraryPath, entry.name);
      }
    }
    return path.join(libraryPath, 'Series');
  }

  switch (type) {
    case 'Animation': return path.join(libraryPath, 'Animation');
    case 'Iranian':   return path.join(libraryPath, 'Iranian');
    default:          return path.join(libraryPath, 'Movies');
  }
}

/**
 * Scan the Games directory for PS4 and PS5 game posters.
 * Merges identical titles across platforms into single entries.
 *
 * Games/PS4/Ghost Rider.jpg → { title: "Ghost Rider", platforms: ["PS4"] }
 * Games/PS5/Ghost Rider.jpg → merged into same entry → { platforms: ["PS4", "PS5"] }
 *
 * @param {string} libraryPath - Absolute path to Library root
 * @returns {{ results: Array<{title, platforms, posterPath, extension}>, stats: object }}
 */
function scanGames(libraryPath) {
  const t0 = Date.now();
  const gamesDir = path.join(libraryPath, 'Games');

  log(`Scanning games: ${gamesDir}`);

  if (!fs.existsSync(gamesDir)) {
    log('Games folder not found — skipping');
    return { results: [], stats: { dirsVisited: 0, imageFilesFound: 0, gamesParsed: 0, elapsedMs: 0 } };
  }

  const platforms = ['PS4', 'PS5'];
  const gameMap = new Map(); // normalizedTitle → { title, platforms: Set, posterPath, extension }
  let imageFilesFound = 0;
  let dirsVisited = 0;

  for (const platform of platforms) {
    const platformDir = path.join(gamesDir, platform);
    if (!fs.existsSync(platformDir)) {
      log(`Platform folder not found: ${platform}`);
      continue;
    }

    const walk = walkDir(platformDir, null);
    dirsVisited += walk.dirsVisited;
    imageFilesFound += walk.imageFiles.length;

    for (const { fullPath, filename } of walk.imageFiles) {
      const parsed = parseGameFilename(filename);
      if (!parsed) {
        log(`  ⚠ Could not parse game filename: ${filename}`);
        continue;
      }

      const key = gameKey(parsed.title);

      if (gameMap.has(key)) {
        // Merge: add platform to existing entry
        gameMap.get(key).platforms.add(platform);
      } else {
        // New game
        gameMap.set(key, {
          title: parsed.title,
          platforms: new Set([platform]),
          posterPath: fullPath,
          extension: parsed.extension
        });
      }

      log(`  ✓ platform=${platform} title="${parsed.title}"`);
    }
  }

  // Convert Sets to Arrays for output
  const results = [];
  for (const game of gameMap.values()) {
    let lastModified;
    try {
      lastModified = fs.statSync(game.posterPath).mtimeMs;
    } catch { /* path vanished mid-scan — poster route 404s */ }
    results.push({
      title: game.title,
      platforms: Array.from(game.platforms).sort(),
      posterPath: game.posterPath,
      extension: game.extension,
      lastModified,
      type: 'Game'
    });
  }

  const elapsedMs = Date.now() - t0;
  const stats = {
    dirsVisited,
    imageFilesFound,
    gamesParsed: results.length,
    elapsedMs
  };

  log(`Game scan complete: ${stats.gamesParsed} games from ${stats.imageFilesFound} images in ${stats.elapsedMs}ms`);

  return { results, stats };
}

/**
 * Async game scan (B10) — same output shape as scanGames.
 */
async function scanGamesAsync(libraryPath) {
  const t0 = Date.now();
  const gamesDir = path.join(libraryPath, 'Games');

  log(`Scanning games (async): ${gamesDir}`);

  if (!fs.existsSync(gamesDir)) {
    log('Games folder not found — skipping');
    return { results: [], stats: { dirsVisited: 0, imageFilesFound: 0, gamesParsed: 0, elapsedMs: 0 } };
  }

  const platforms = ['PS4', 'PS5'];
  const gameMap = new Map();
  let imageFilesFound = 0;
  let dirsVisited = 0;

  for (const platform of platforms) {
    const platformDir = path.join(gamesDir, platform);
    if (!fs.existsSync(platformDir)) {
      log(`Platform folder not found: ${platform}`);
      continue;
    }

    const walk = await walkDirAsync(platformDir, null);
    dirsVisited += walk.dirsVisited;
    imageFilesFound += walk.imageFiles.length;

    for (const { fullPath, filename } of walk.imageFiles) {
      const parsed = parseGameFilename(filename);
      if (!parsed) {
        log(`  ⚠ Could not parse game filename: ${filename}`);
        continue;
      }

      const key = gameKey(parsed.title);

      if (gameMap.has(key)) {
        gameMap.get(key).platforms.add(platform);
      } else {
        gameMap.set(key, {
          title: parsed.title,
          platforms: new Set([platform]),
          posterPath: fullPath,
          extension: parsed.extension
        });
      }

      log(`  ✓ platform=${platform} title="${parsed.title}"`);
    }
    await yieldTick();
  }

  const results = [];
  for (const game of gameMap.values()) {
    let lastModified;
    try {
      lastModified = fs.statSync(game.posterPath).mtimeMs;
    } catch { /* path vanished mid-scan — poster route 404s */ }
    results.push({
      title: game.title,
      platforms: Array.from(game.platforms).sort(),
      posterPath: game.posterPath,
      extension: game.extension,
      lastModified,
      type: 'Game'
    });
  }

  const elapsedMs = Date.now() - t0;
  const stats = {
    dirsVisited,
    imageFilesFound,
    gamesParsed: results.length,
    elapsedMs
  };

  log(`Game scan complete: ${stats.gamesParsed} games from ${stats.imageFilesFound} images in ${stats.elapsedMs}ms`);

  return { results, stats };
}

module.exports = {
  scanLibrary,
  scanLibraryAsync,
  scanGames,
  scanGamesAsync,
  scanFile,
  resolveTypeFolder,
  walkDir,
  walkDirAsync
};
