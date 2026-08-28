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
 * Output per file:
 *   { path, filename, id, title, year, type, genres, posterPath, ... }
 */

const fs = require('fs');
const path = require('path');
const { parseFilename, parseGameFilename, classifyFromPath, IMAGE_EXTENSIONS } = require('./parser');

const DEBUG_LOGGING = true;

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
 * Recursively walk a directory tree.
 * Returns { dirsVisited, imageFiles: [{fullPath, filename}], ignoredFiles }
 */
function walkDir(dirPath) {
  const result = { dirsVisited: 0, imageFiles: [], ignoredFiles: 0 };

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`  [SCANNER] Cannot read directory: ${dirPath} — ${err.message}`);
    return result;
  }

  result.dirsVisited = 1;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const sub = walkDir(fullPath);
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

/**
 * Scan the entire Library directory from scratch.
 * Returns { results, stats }
 *
 * stats = { dirsVisited, imageFilesFound, moviesParsed, ignoredFiles, elapsedMs }
 */
function scanLibrary(libraryPath) {
  const t0 = Date.now();

  log(`Scanning: ${libraryPath}`);

  if (!fs.existsSync(libraryPath)) {
    console.warn(`  [SCANNER] Library folder not found: ${libraryPath}`);
    return { results: [], stats: { dirsVisited: 0, imageFilesFound: 0, moviesParsed: 0, ignoredFiles: 0, elapsedMs: 0 } };
  }

  const walk = walkDir(libraryPath);
  log(`Visited ${walk.dirsVisited} directories, found ${walk.imageFiles.length} image files, ignored ${walk.ignoredFiles} non-image files`);

  const results = [];
  let parseFailures = 0;

  for (const { fullPath, filename } of walk.imageFiles) {
    const relativePath = path.relative(libraryPath, fullPath);
    log(`Scanning: ${relativePath}`);

    // Classify first to get the type, then parse with type context
    const { type, genres } = classifyFromPath(relativePath);

    const parsed = parseFilename(filename, type);
    if (!parsed) {
      parseFailures++;
      log(`  ⚠ Could not parse filename: ${filename} (type=${type})`);
      continue;
    }

    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      parseFailures++;
      continue;
    }

    results.push({
      path: relativePath,
      filename,
      id: parsed.id,
      title: parsed.title,
      year: parsed.year,
      type,
      genres,
      posterPath: fullPath,
      extension: parsed.extension,
      fileSize: stats.size,
      lastModified: stats.mtimeMs
    });

    log(`  ✓ id=${parsed.id} title="${parsed.title}" year=${parsed.year} type=${type} genres=[${genres}]`);
  }

  const elapsedMs = Date.now() - t0;

  const stats = {
    dirsVisited: walk.dirsVisited,
    imageFilesFound: walk.imageFiles.length,
    moviesParsed: results.length,
    ignoredFiles: walk.ignoredFiles,
    parseFailures,
    elapsedMs
  };

  log(`Scan complete: ${stats.moviesParsed} movies parsed from ${stats.imageFilesFound} image files in ${stats.elapsedMs}ms`);

  if (stats.moviesParsed !== stats.imageFilesFound) {
    console.warn(`  [SCANNER] ⚠ Mismatch: found ${stats.imageFilesFound} images but parsed only ${stats.moviesParsed} movies (${parseFailures} failed to parse)`);
  }

  return { results, stats };
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

    const walk = walkDir(platformDir);
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
    results.push({
      title: game.title,
      platforms: Array.from(game.platforms).sort(),
      posterPath: game.posterPath,
      extension: game.extension,
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

module.exports = { scanLibrary, scanGames };
