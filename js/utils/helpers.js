/**
 * Utility Functions
 * Common helpers used across the application
 */

/**
 * Debounce function - delays execution until after wait period
 */
export function debounce(fn, wait = 250) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle function - limits execution to once per wait period
 */
export function throttle(fn, wait = 100) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Format number with locale-aware separators
 */
export function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Generate a CSS-safe class name from a genre string
 */
export function genreClass(genre) {
  return 'genre-' + genre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Create an element with attributes and children
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key.startsWith('on')) {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'html') {
      el.innerHTML = val;
    } else {
      el.setAttribute(key, val);
    }
  }

  children.flat().forEach(child => {
    if (child == null || child === false) return;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });

  return el;
}

/**
 * Get genre color from the predefined palette
 */
const GENRE_COLOR_MAP = {
  'Action': '#ef4444',
  'Drama': '#8b5cf6',
  'Romance': '#ec4899',
  'Sci-Fi': '#06b6d4',
  'Horror': '#7c3aed',
  'Comedy': '#f59e0b',
  'Thriller': '#64748b',
  'Animation': '#10b981',
  'Documentary': '#6366f1',
  'اکشن': '#ef4444',
  'درام': '#8b5cf6',
  'عاشقانه': '#f97316',
  'علمی-تخیلی': '#06b6d4',
  'ترسناک': '#7c3aed',
  'کمدی': '#f59e0b',
  'هیجانی': '#64748b',
  'انیمیشن': '#10b981',
  'مستند': '#6366f1',
  'دوبله فارسی': '#16a34a',
  'هندی': '#14b8a6',
  'Cloner': '#a855f7',
  'Tarsnak': '#7c3aed'
};

export function getGenreColor(genre) {
  return GENRE_COLOR_MAP[genre] || '#6b7280';
}

/**
 * Truncate a string to a given length with ellipsis
 */
export function truncate(str, max = 50) {
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + '...';
}

/**
 * Generate a placeholder SVG data URI for missing posters
 */
export function generatePosterPlaceholder(title, id) {
  const initials = title.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect fill="#1a1a24" width="300" height="450"/>
    <text x="150" y="190" text-anchor="middle" fill="#353548" font-family="sans-serif" font-size="64" font-weight="bold">${initials}</text>
    <text x="150" y="230" text-anchor="middle" fill="#353548" font-family="monospace" font-size="18">#${id}</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * Single source of truth for badge rendering.
 *
 * Rules (type takes priority over genre):
 *   Animation → "انیمیشن دوبله" (yellow)
 *   Series    → "سریال" (gray)
 *   Iranian   → no badge
 *   Movie + دوبله فارسی genre → "دوبله فارسی" (green)
 *   Movie (default) → "زیرنویس فارسی" (red)
 *
 * @param {object} movie - { type, genres, ... }
 * @returns {{ text: string, cls: string } | null}
 */
export function getBadge(movie) {
  if (movie.type === 'Animation') return { text: 'انیمیشن دوبله', cls: 'badge--animation' };
  if (movie.type === 'Series')    return { text: 'سریال',         cls: 'badge--series' };
  if (movie.type === 'Iranian')   return null;
  if (movie.type === 'Movie') {
    if (movie.genres.includes('دوبله فارسی')) return { text: 'دوبله فارسی',  cls: 'badge--dubbed' };
    return { text: 'زیرنویس فارسی', cls: 'badge--subtitle' };
  }
  return null;
}
