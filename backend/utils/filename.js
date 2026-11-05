'use strict';

/**
 * Shared poster filename builders (ARCH-03 / P6c E2).
 *
 * ONE implementation used by MovieCreator, MovieEditor and the
 * POST /api/movies/preview endpoint — the add-modal used to keep its own
 * third copy of this logic in js/components/add-modal.js.
 * Conventions come from I4:
 *   Movie       {ID}- {Title} {Year}.ext
 *   Animation   {ID}-{Title}.ext
 *   Iranian     {ID}-{Title}.ext
 *   Series      {Title}.ext
 *   Game        {Title}.ext
 *
 * Titles are sanitised (forbidden filename characters → '-') and then
 * validated through safeSegment so a path-escaping title throws (I10).
 */

const { safeSegment } = require('./safe-path');

const FORBIDDEN = /[/\\?%*:|"<>]/g;

function cleanTitle(title) {
  return String(title == null ? '' : title).replace(FORBIDDEN, '-').trim();
}

function cleanExtension(extension) {
  const ext = String(extension == null || extension === '' ? 'jpg' : extension).replace(/^\.+/, '');
  return ext === '' ? 'jpg' : ext;
}

/**
 * Build the poster filename for a movie/series entry.
 * @param {object} spec
 * @param {string} spec.id - ID string (ignored for Series)
 * @param {string} spec.title
 * @param {string|number|null} [spec.year] - omitted for Series / yearless Movie
 * @param {string} spec.type - Movie | Animation | Iranian | Series
 * @param {string} [spec.extension] - 'jpg', 'png', ... (a leading dot is stripped)
 * @returns {string}
 * @throws {Error} via safeSegment when the sanitised title escapes its segment (I10)
 */
function buildMovieFilename({ id, title, year, type, extension } = {}) {
  const t = cleanTitle(title);
  safeSegment(t, 'عنوان فیلم');
  const ext = cleanExtension(extension);

  switch (type) {
    case 'Movie': {
      const y = year != null && year !== '' ? String(year) : '';
      return `${id}- ${t}${y ? ' ' + y : ''}.${ext}`;
    }
    case 'Animation':
    case 'Iranian':
      return `${id}-${t}.${ext}`;
    case 'Series':
      return `${t}.${ext}`;
    default:
      return id != null && id !== '' ? `${id}-${t}.${ext}` : `${t}.${ext}`;
  }
}

/**
 * Build the poster filename for a game (title + extension only, I4/I8).
 * @param {string} title
 * @param {string} [extension]
 * @returns {string}
 * @throws {Error} via safeSegment when the sanitised title escapes its segment (I10)
 */
function buildGameFilename(title, extension) {
  const t = cleanTitle(title);
  safeSegment(t, 'عنوان بازی');
  return `${t}.${cleanExtension(extension)}`;
}

module.exports = { buildMovieFilename, buildGameFilename, cleanTitle };
