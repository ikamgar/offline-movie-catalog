'use strict';

/**
 * ARCH-03 (P7a F2): single source of truth for constants shared across the
 * REST server, the WebSocket server, the scanner/parser — and, through
 * GET /api/config, the front end as well.
 *
 * Plain data only: no state, no I/O. Consumers read at call time.
 * Persian strings here are the wording pinned by invariants I11/I12 — do not
 * reword them.
 */

/**
 * WebSocket JSON protocol version. Bump on any change to the message
 * shapes in docs/ARCHITECTURE.md (server, client, tests and docs together).
 */
const PROTOCOL_VERSION = 3;

/**
 * Roles spoken on the WebSocket `hello` message.
 * Naming convention (docs/ARCHITECTURE.md): the REST/session world
 * calls the privileged user `admin`, the WS wire calls it `manager`;
 * `customer` is the kiosk role.
 */
const WS_ROLES = ['customer', 'manager'];

/** All media types the app knows (Invariant I3); Game runs its own pipeline. */
const MEDIA_TYPES = ['Movie', 'Animation', 'Iranian', 'Series', 'Game'];

/** Types the movie write endpoints accept (Game is not added through them). */
const MOVIE_TYPES = ['Movie', 'Animation', 'Iranian', 'Series'];

/** Poster file extensions accepted by the scanner and upload endpoints (I4). */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

/** Persian labels for every media type (search haystack + filter chips). */
const TYPE_LABELS = {
  Movie: 'فیلم',
  Series: 'سریال',
  Animation: 'انیمیشن',
  Iranian: 'ایرانی',
  Game: 'بازی'
};

/**
 * Persian badge texts (Invariant I12). Iranian and Game get no badge —
 * kept explicit so no caller invents wording.
 */
const BADGE_LABELS = {
  animation: 'انیمیشن دوبله',
  series: 'سریال',
  dubbed: 'دوبله فارسی',
  subtitle: 'زیرنویس فارسی'
};

/** Genres pinned first in every genre list, in order (Invariant I11). */
const PINNED_GENRES = ['دوبله فارسی', 'اکشن', 'عاشقانه'];

/**
 * Payload served by `GET /api/config`. One builder so the real server
 * and the ui-stub cannot drift apart on the shape.
 *
 * @param {string} version - app version from package.json
 * @returns {object}
 */
function publicConfig(version) {
  return {
    version,
    mediaTypes: MEDIA_TYPES,
    typeLabels: TYPE_LABELS,
    badgeLabels: BADGE_LABELS,
    pinnedGenres: PINNED_GENRES,
    imageExtensions: IMAGE_EXTENSIONS,
    protocol: PROTOCOL_VERSION
  };
}

module.exports = {
  PROTOCOL_VERSION,
  WS_ROLES,
  MEDIA_TYPES,
  MOVIE_TYPES,
  IMAGE_EXTENSIONS,
  TYPE_LABELS,
  BADGE_LABELS,
  PINNED_GENRES,
  publicConfig
};
