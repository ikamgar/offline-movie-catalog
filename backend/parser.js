/**
 * Filename Parser Module
 *
 * Extracts movie ID, title, and year from poster filenames.
 * Supports a wide variety of naming conventions used in real libraries.
 *
 * Supported formats:
 *   5273-Shelter 2026.jpg
 *   5273-Shelter (2026).jpg
 *   5273-Shelter-2026.jpg
 *   5273-Shelter.2026.jpg
 *   5273 Shelter 2026.jpg
 *   5273 - Shelter (2026).jpg
 *   5273_Shelter_2026.jpg
 *   5273 - The Dark Knight (2008) [1080p] [BluRay].jpg
 *   5273 The Dark Knight 2008 WEB-DL x265.jpg
 *
 * Classification (single source of truth):
 *   Library/Movies/{Genre}/...   → type = "Movie",   genres = [Genre]
 *   Library/Animation/...        → type = "Animation", genres = []
 *   Library/Series/...           → type = "Series",   genres = []
 *   Library/Iranian/...          → type = "Iranian",  genres = []
 */

const { IMAGE_EXTENSIONS: IMAGE_EXTENSIONS_LIST } = require('./constants');
const IMAGE_EXTENSIONS = new Set(IMAGE_EXTENSIONS_LIST);

// Technical tokens only — ambiguous title words (Web, Amazon, Apple, Disney,
// Netflix, Hulu, HBO, Limited, Extended, Multi, Final Cut, Uncut, AMZN, NF,
// DSNP, itunes, DC, SE, CE, …) were removed so real titles survive (DATA-12).
const RELEASE_TAGS = [
  'BluRay', 'Blu-Ray', 'BDRip', 'BDRemux', 'BD',
  'WEB-DL', 'WEBDL', 'WEBRip',
  'HDRip', 'HDTV', 'DVDRip', 'DVD', 'VHS',
  'REMUX', 'Remux',
  '2160p', '1080p', '720p', '480p', '4K', 'UHD',
  'HDR', 'HDR10', 'HDR10+', 'Dolby Vision', 'DV', 'DoVi',
  'HEVC', 'H.265', 'x265', 'x264', 'H.264', 'AVC', 'AV1',
  'AAC', 'AC3', 'DTS', 'FLAC', 'TrueHD', 'Atmos', 'DD5',
  'Directors Cut', "Director's Cut",
  'Theatrical Cut', 'Theatrical', 'Ultimate Cut',
  'Unrated', 'IMAX', 'Proper', 'Repack', 'Rerip',
  'INTERNAL', 'TS', 'CAM', 'TELECINE', 'TELESYNC', 'WORKPRINT',
  'Criterion', 'Special Edition', 'Anniversary Edition',
  'Dual Audio', 'Subbed', 'Dubbed',
  'READNFO', 'PROPER', 'REPACK', 'RERIP'
];

// ─── TYPE CONFIGURATION (single source of truth) ────────────────────────────
// Keys are lowercase top-level folder names inside Library/.
// Values are the canonical type string returned by the API.
const TYPE_MAP = {
  'movies':    'Movie',
  'animation': 'Animation',
  'series':    'Series',
  'serries':   'Series',
  'iranian':   'Iranian',
  'games':     'Game',
};

const DEFAULT_TYPE = 'Movie';

// Exact technical tokens (case-insensitive), used for bracket-group checks.
const TECHNICAL_TOKENS = new Set(RELEASE_TAGS.map(t => t.toLowerCase()));

function isTechnicalGroup(inner) {
  const s = inner.trim();
  if (!s) return false;
  if (TECHNICAL_TOKENS.has(s.toLowerCase())) return true;
  const tokens = s.split(/\s+/);
  return tokens.every(t => TECHNICAL_TOKENS.has(t.toLowerCase()));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-first so "Special Edition" wins over any shorter substring.
const TECHNICAL_TAGS_SORTED = [...RELEASE_TAGS].sort((a, b) => b.length - a.length);

/**
 * Clean a movie title: NFC-normalise, strip technical bracket/paren groups and
 * standalone technical tokens, collapse whitespace, trim. Keeps ZWNJ.
 * Never strips ambiguous title words (DATA-12).
 */
function cleanTitle(raw) {
  let title = String(raw).normalize('NFC');

  title = title.replace(/\[([^\]]*)\]/g, (match, inner) =>
    isTechnicalGroup(inner) ? ' ' : match);
  title = title.replace(/\(([^)]*)\)/g, (match, inner) =>
    isTechnicalGroup(inner) ? ' ' : match);

  for (const tag of TECHNICAL_TAGS_SORTED) {
    const escaped = escapeRegExp(tag);
    title = title.replace(new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'gi'), ' ');
  }

  title = title.replace(/\s{2,}/g, ' ').trim();
  return title;
}

/**
 * Prefer a parenthesised year; otherwise take the last bare 19xx/20xx token.
 * Resolution tags like 1080p/2160p can never match (DATA-17).
 * Returns { year, yearStr, titlePart }.
 */
function extractYear(remainder) {
  const paren = remainder.match(/\s*\((19\d{2}|20\d{2})\)/);
  if (paren) {
    const year = parseInt(paren[1], 10);
    let titlePart = remainder.slice(0, paren.index) +
      remainder.slice(paren.index + paren[0].length);
    titlePart = titlePart.replace(/\s+/g, ' ').trim()
      .replace(/^[\s\-_.]+/, '').replace(/[\s\-_.]+$/, '');
    return { year, yearStr: paren[1], titlePart };
  }

  const re = /(?<!\d)(19\d{2}|20\d{2})(?!\d)/g;
  let m, last = null;
  while ((m = re.exec(remainder)) !== null) last = m;
  if (last) {
    const year = parseInt(last[0], 10);
    const before = remainder.slice(0, last.index);
    const after = remainder.slice(last.index + last[0].length);
    let titlePart = (before + after).replace(/\s+/g, ' ').trim()
      .replace(/^[\s\-_.]+/, '').replace(/[\s\-_.]+$/, '');
    return { year, yearStr: last[0], titlePart };
  }

  return { year: null, yearStr: null, titlePart: remainder };
}

/**
 * Parse a poster filename; detailed result with a machine-readable reason.
 *
 * @returns {{ok:true, entry:{id,title,year,extension}} | {ok:false, reason}}
 *   reasons: no-id | id-too-long | no-year | empty-title | unsupported-ext
 */
function parseFilenameEx(filename, type) {
  if (typeof filename !== 'string' || filename === '') {
    return { ok: false, reason: 'unsupported-ext' };
  }

  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) return { ok: false, reason: 'unsupported-ext' };

  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return { ok: false, reason: 'unsupported-ext' };

  const baseName = filename.slice(0, dotIdx);
  if (!baseName) return { ok: false, reason: 'empty-title' };

  // Series: no ID, no year — title only (I5)
  if (type === 'Series') {
    const raw = baseName.normalize('NFC').trim();
    if (!raw) return { ok: false, reason: 'empty-title' };
    let title = cleanTitle(raw);
    if (!title) title = raw;
    if (!title) return { ok: false, reason: 'empty-title' };
    return { ok: true, entry: { id: null, title, year: null, extension: ext } };
  }

  // Movie / Animation / Iranian: ID = ^(\d{1,6})(?=\D|$)
  const idMatch = baseName.match(/^(\d+)/);
  if (!idMatch) return { ok: false, reason: 'no-id' };
  if (idMatch[1].length > 6) return { ok: false, reason: 'id-too-long' };

  const id = idMatch[1]; // STRING — never parseInt (I2)
  let remainder = baseName.slice(id.length).replace(/^[\s\-_.]+/, '');
  if (!remainder) return { ok: false, reason: 'empty-title' };

  let { year, yearStr, titlePart } = extractYear(remainder);

  let title;
  if (!titlePart.trim()) {
    // Taking the year would leave an empty title — the number IS the title.
    if (yearStr) {
      title = yearStr;
      year = null;
    } else {
      return { ok: false, reason: 'empty-title' };
    }
  } else {
    title = cleanTitle(titlePart);
    if (!title) title = titlePart.normalize('NFC').trim();
    if (!title) return { ok: false, reason: 'empty-title' };
  }

  // Movie requires a year; Animation/Iranian keep it when present (D3, DATA-11).
  if (type === 'Movie' && year == null) return { ok: false, reason: 'no-year' };

  return { ok: true, entry: { id, title, year, extension: ext } };
}

/**
 * Parse a poster filename and extract structured movie data.
 *
 * Type-aware parsing rules:
 *   Movie:    id (string), title, year (required)
 *   Animation: id (string), title, year (optional, kept when present)
 *   Iranian:  id (string), title, year (optional, kept when present)
 *   Series:   id (null), title, year (null — always)
 *
 * @param {string} filename - The poster filename (e.g., "5273-Shelter 2026.jpg")
 * @param {string} type - Media type: "Movie", "Animation", "Series", "Iranian"
 * @returns {object|null} - Parsed data or null if filename doesn't match pattern
 */
function parseFilename(filename, type) {
  const r = parseFilenameEx(filename, type);
  return r.ok ? r.entry : null;
}

/**
 * Classify a movie by examining its path relative to the Library root.
 *
 * Returns { type, genres }.
 *
 * Rules:
 *   Library/Movies/{Genre}/...  → type = "Movie",   genres = [Genre]
 *   Library/Animation/...       → type = "Animation", genres = []
 *   Library/Series/...          → type = "Series",   genres = []
 *   Library/Iranian/...         → type = "Iranian",  genres = []
 *
 * Only the immediate subfolder of "Movies" becomes a genre.
 * All other top-level types ignore subfolders for genre purposes.
 *
 * @param {string} relativePath - Path relative to Library root (e.g. "Movies/Action/5273-Foo 2026.jpg")
 * @returns {{ type: string, genres: string[] }}
 */
function classifyFromPath(relativePath) {
  const parts = relativePath.split(/[/\\]/);
  const topFolder = (parts[0] || '').toLowerCase();

  const type = TYPE_MAP[topFolder] || DEFAULT_TYPE;

  // Only Movies folder gets genres from its immediate subfolder
  if (topFolder === 'movies') {
    const genre = (parts[1] || '').trim();
    return { type, genres: genre ? [genre] : [] };
  }

  return { type, genres: [] };
}

/**
 * Parse a Game poster filename — extracts ONLY the title.
 * Games have no ID, no year, no genre, no release tags.
 *
 * Example:
 *   "Ghost Rider.jpg" → { title: "Ghost Rider" }
 *   "GTA V.jpg"       → { title: "GTA V" }
 *
 * @param {string} filename - The poster filename
 * @returns {{ title: string, extension: string } | null}
 */
function parseGameFilename(filename) {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) return null;

  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const title = filename.slice(0, dotIdx).trim();
  if (!title) return null;

  return { title, extension: ext };
}

module.exports = {
  parseFilename,
  parseFilenameEx,
  parseGameFilename,
  cleanTitle,
  classifyFromPath,
  TYPE_MAP,
  DEFAULT_TYPE,
  IMAGE_EXTENSIONS,
  RELEASE_TAGS
};
