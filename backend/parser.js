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

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

const RELEASE_TAGS = [
  'BluRay', 'Blu-Ray', 'BDRip', 'BDRemux', 'BD',
  'WEB-DL', 'WEBDL', 'WEBRip', 'WEB', 'Web',
  'HDRip', 'HDTV', 'DVDRip', 'DVD', 'VHS',
  'REMUX', 'Remux',
  '2160p', '1080p', '720p', '480p', '4K', 'UHD',
  'HDR', 'HDR10', 'HDR10+', 'Dolby Vision', 'DV', 'DoVi',
  'HEVC', 'H.265', 'x265', 'x264', 'H.264', 'AVC', 'AV1',
  'AAC', 'AC3', 'DTS', 'FLAC', 'TrueHD', 'Atmos', 'DD5',
  'Director\'s Cut', 'Directors Cut', 'Extended Edition', 'Extended',
  'Theatrical Cut', 'Theatrical', 'Final Cut', 'Ultimate Cut',
  'Unrated', 'Uncut', 'IMAX', 'Proper', 'Repack', 'Rerip',
  'INTERNAL', 'TS', 'CAM', 'TELECINE', 'TELESYNC', 'WORKPRINT',
  'DC', 'SE', 'CE', 'Criterion', 'Special Edition', 'Anniversary Edition',
  'Limited', 'Dual Audio', 'Multi', 'Subbed', 'Dubbed',
  'AMZN', 'NF', 'Netflix', 'Amazon', 'Disney', 'Hulu', 'HBO',
  'DSNP', 'ATVP', 'PMTP', 'APPLE', 'iTunes',
  'PROPER', 'REPACK', 'RERIP', 'READNFO'
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

/**
 * Clean a movie title by removing release tags, brackets, and extra whitespace.
 */
function cleanTitle(raw) {
  let title = raw;

  // Remove bracketed content: [1080p], [BluRay], etc.
  title = title.replace(/\[[^\]]*\]/g, ' ');

  // Remove parenthesized tags that look like release info (not the year)
  // Keep parentheses that are part of the title (e.g., "Shelter (2026)")
  title = title.replace(/\((?:BluRay|WEB-DL|REMUX|HDR|x265|1080p|2160p|720p|4K|UHD|HEVC|Director.s Cut|Extended|Proper|Repack|INTERNAL|AAC|DTS|FLAC|TrueHD|Atmos|IMAX|Unrated|Uncut)\)/gi, ' ');

  // Remove individual release tags as standalone words
  for (const tag of RELEASE_TAGS) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }

  // Collapse multiple spaces and trim
  title = title.replace(/\s{2,}/g, ' ').trim();

  return title;
}

/**
 * Parse a poster filename and extract structured movie data.
 *
 * Type-aware parsing rules:
 *   Movie:    id (string), title, year (required, 1900-2099)
 *   Animation: id (string), title, year (optional, null if absent)
 *   Iranian:  id (string), title, year (optional, null if absent)
 *   Series:   id (null), title, year (null — always)
 *
 * @param {string} filename - The poster filename (e.g., "5273-Shelter 2026.jpg")
 * @param {string} type - Media type: "Movie", "Animation", "Series", "Iranian"
 * @returns {object|null} - Parsed data or null if filename doesn't match pattern
 */
function parseFilename(filename, type) {
  // Get extension
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) return null;

  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const baseName = filename.slice(0, dotIdx);

  // Series: no ID, no year — title only
  if (type === 'Series') {
    const title = cleanTitle(baseName);
    if (!title) return null;
    return { id: null, title, year: null, extension: ext };
  }

  // Movie, Animation, Iranian: extract ID (as STRING — leading zeros are meaningful)
  const idMatch = baseName.match(/^(\d{1,6})/);
  if (!idMatch) return null;

  const id = idMatch[1]; // STRING — never parseInt
  let remainder = baseName.slice(idMatch[1].length);

  // Strip leading separator(s) after the ID
  remainder = remainder.replace(/^[\s\-_.]+/, '');
  remainder = remainder.replace(/^\s*-\s+/, '');
  remainder = remainder.replace(/^\s+-\s*/, '');

  if (!remainder) return null;

  // Try to extract a 4-digit year from the end
  const yearMatch = remainder.match(/(\d{4})(?!.*\d{4})/);

  if (type === 'Movie') {
    // Movie: year is REQUIRED
    if (!yearMatch) return null;

    const year = parseInt(yearMatch[1], 10);
    if (year < 1900 || year > 2099) return null;

    const yearIdx = remainder.lastIndexOf(yearMatch[1]);
    let titlePart = remainder.slice(0, yearIdx).trim();
    titlePart = titlePart.replace(/[\s\-_.]+$/, '');

    if (!titlePart) return null;

    const title = cleanTitle(titlePart);
    if (!title) return null;

    return { id, title, year, extension: ext };
  } else {
    // Animation, Iranian: year is OPTIONAL
    let titlePart = remainder;

    if (yearMatch) {
      const yearStr = yearMatch[1];
      const yearIdx = remainder.lastIndexOf(yearStr);
      titlePart = remainder.slice(0, yearIdx).trim();
      titlePart = titlePart.replace(/[\s\-_.]+$/, '');
    }

    if (!titlePart) return null;

    const title = cleanTitle(titlePart);
    if (!title) return null;

    return { id, title, year: null, extension: ext };
  }
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
  parseGameFilename,
  cleanTitle,
  classifyFromPath,
  TYPE_MAP,
  DEFAULT_TYPE,
  IMAGE_EXTENSIONS,
  RELEASE_TAGS
};
