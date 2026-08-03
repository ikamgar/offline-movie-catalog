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
const { parseFilename, classifyFromPath, IMAGE_EXTENSIONS } = require('./parser');

const DEBUG_LOGGING = true;

function log(msg) {
  if (DEBUG_LOGGING) console.log(`  [SCANNER] ${msg}`);
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

module.exports = { scanLibrary };
