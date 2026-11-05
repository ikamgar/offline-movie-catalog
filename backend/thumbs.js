'use strict';
/**
 * Poster thumbnail service (FE-12 / G4, decision D4).
 *
 * WebP thumbnails for the grid, cached under `data/thumbs/` with the file
 * name `sha256(absPath | mtimeMs | width)[0..32].webp` — a changed file or a
 * different width yields a different name, so invalidation needs no eviction
 * logic (orphans are swept at startup instead).
 *
 * `sharp` is an OPTIONAL dependency (package.json optionalDependencies).
 * When it is missing or a conversion fails, `get()` resolves to null and the
 * caller serves the original poster — the app must behave identically.
 *
 * Generation goes through a small promise pool (default concurrency 2) and
 * writes atomically: `<name>.webp.tmp-<rand>` → rename. A crash mid-write
 * can only leave a `.tmp-*` file, never a corrupt `.webp`.
 */
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

/** Thumbnail widths the API accepts (P8 G4). */
const WIDTHS = [300, 600];

function isThumbWidth(w) {
  return WIDTHS.includes(w);
}

/** Default sharp loader — kept separate so tests can inject failures. */
function loadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.thumbsDir - Cache directory (usually `<dataDir>/thumbs`)
 * @param {number} [options.concurrency] - Max parallel generations (default 2)
 * @param {Function} [options.loadSharp] - Injectable sharp loader (tests)
 * @param {Function} [options.log] - One-time status lines (default console.log)
 */
function createThumbService(options) {
  const opts = options || {};
  if (!opts.thumbsDir) throw new Error('createThumbService: thumbsDir is required');
  const thumbsDir = opts.thumbsDir;
  const concurrency = Math.max(1, opts.concurrency || 2);
  const load = opts.loadSharp || loadSharp;
  const log = opts.log || console.log;

  let sharpRef = null;
  let sharpTried = false;
  let missingLogged = false;
  let failLogged = false;
  let dirReady = false;
  let dirBlocked = false; // F38: thumbsDir is a file/locked — fail open

  // ── Promise pool ─────────────────────────────────────────────────────────
  const pool = { active: 0, queue: [] };

  function schedule(task) {
    return new Promise((resolve, reject) => {
      pool.queue.push({ task, resolve, reject });
      pump();
    });
  }

  function pump() {
    while (pool.active < concurrency && pool.queue.length) {
      const item = pool.queue.shift();
      pool.active++;
      item.task()
        .then(item.resolve, item.reject)
        .finally(() => {
          pool.active--;
          pump();
        });
    }
  }

  function getSharp() {
    if (!sharpTried) {
      sharpTried = true;
      try {
        sharpRef = load() || null;
      } catch {
        sharpRef = null;
      }
      if (!sharpRef && !missingLogged) {
        missingLogged = true;
        log('  [THUMBS] sharp not available — serving original posters (thumbnails disabled)');
      }
    }
    return sharpRef;
  }

  function hashFor(absPath, mtimeMs, w) {
    const material = `${absPath}|${Math.trunc(mtimeMs)}|${w}`;
    return `${crypto.createHash('sha256').update(material).digest('hex').slice(0, 32)}.webp`;
  }

  async function ensureDir() {
    if (dirReady || dirBlocked) return;
    try {
      await fsp.mkdir(thumbsDir, { recursive: true });
      dirReady = true;
    } catch (err) {
      // F38: thumbsDir is occupied by a file or locked (EEXIST/EISDIR/EACCES).
      // Fail open — serve the original poster, log one line, stop retrying.
      dirBlocked = true;
      if (!missingLogged) {
        missingLogged = true;
        log(`  [THUMBS] thumbs dir blocked (${err.message}) — serving original posters`);
      }
    }
  }

  async function generate(absPath, mtimeMs, w, file) {
    const s = getSharp();
    if (!s) return null;
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      // Read the source into a Buffer first: sharp(path) keeps the source fd
      // open for the whole decode+encode, which makes a concurrent rename of
      // the poster hit EBUSY on Windows. sharp(Buffer) never touches the path.
      const source = await fsp.readFile(absPath);
      await s(source)
        .resize({ width: w, withoutEnlargement: true })
        // q75: grid thumbnails — keeps the 40-poster projection under the
        // 1.5 MB budget (G4) with margin, visually fine at card size.
        .webp({ quality: 75 })
        .toFile(tmp);
      try {
        await fsp.rename(tmp, file);
      } catch (renameErr) {
        // Windows: rename onto an existing file fails — a concurrent request
        // won the race; keep its result.
        if (fs.existsSync(file)) {
          await fsp.unlink(tmp).catch(() => {});
        } else {
          throw renameErr;
        }
      }
      return { file, hash: path.basename(file) };
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      if (!failLogged) {
        failLogged = true;
        log(`  [THUMBS] generation failed (${err.message}) — serving original posters`);
      }
      return null;
    }
  }

  /**
   * Return the cached thumbnail for (absPath, mtimeMs, w), generating it if
   * needed. Resolves to `{ file, hash }` or null (caller serves the original).
   */
  async function get(absPath, mtimeMs, w) {
    if (typeof absPath !== 'string' || !isThumbWidth(w) || !Number.isFinite(mtimeMs)) {
      return null;
    }
    if (!getSharp()) return null;
    await ensureDir();
    const hash = hashFor(absPath, mtimeMs, w);
    const file = path.join(thumbsDir, hash);
    if (fs.existsSync(file)) return { file, hash };
    return schedule(() => generate(absPath, mtimeMs, w, file));
  }

  /**
   * Startup sweep: delete every file in thumbsDir that is not in
   * `expectedNames` (a Set of `hashFor(...)` values). Leaves `.tmp-*` alone
   * only if newer than 1 hour (a generation may be in flight).
   * @param {Set<string>} expectedNames
   * @returns {Promise<{removed:number, kept:number}>}
   */
  async function cleanOrphans(expectedNames) {
    let names;
    try {
      names = await fsp.readdir(thumbsDir);
    } catch {
      return { removed: 0, kept: 0 }; // no cache dir yet — nothing to do
    }
    let removed = 0;
    let kept = 0;
    for (const name of names) {
      if (expectedNames.has(name)) {
        kept++;
        continue;
      }
      if (name.includes('.tmp-')) {
        try {
          const st = await fsp.stat(path.join(thumbsDir, name));
          if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
            kept++;
            continue;
          }
        } catch { /* fall through to unlink */ }
      }
      try {
        await fsp.unlink(path.join(thumbsDir, name));
        removed++;
      } catch { /* raced away — fine */ }
    }
    return { removed, kept };
  }

  /**
   * Idle warm-up: pre-generate both widths for the first `limit` entries.
   * Never throws; returns a promise that settles when the queue drains.
   * @param {Array<{absPath:string, mtimeMs:number}>} entries
   * @param {number} limit
   */
  async function warmUp(entries, limit) {
    const s = getSharp();
    if (!s || !Array.isArray(entries) || !entries.length) return 0;
    const slice = entries.slice(0, Math.max(0, limit));
    const jobs = [];
    for (const e of slice) {
      if (!e || typeof e.absPath !== 'string' || !Number.isFinite(e.mtimeMs)) continue;
      for (const w of WIDTHS) {
        jobs.push(get(e.absPath, e.mtimeMs, w));
      }
    }
    await Promise.allSettled(jobs);
    return slice.length;
  }

  return { get, hashFor, cleanOrphans, warmUp, isThumbWidth, WIDTHS, thumbsDir };
}

module.exports = { createThumbService, isThumbWidth, WIDTHS, loadSharp };
