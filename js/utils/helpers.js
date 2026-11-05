/**
 * Utility Functions
 * Common helpers used across the application
 */

import { config } from '../config.js';

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
 * Format number with locale-aware separators
 */
export function formatNumber(num) {
  return num.toLocaleString();
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
  const safeInitials = String(initials).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeId = String(id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect fill="#1a1a24" width="300" height="450"/>
    <text x="150" y="190" text-anchor="middle" fill="#353548" font-family="sans-serif" font-size="64" font-weight="bold">${safeInitials}</text>
    <text x="150" y="230" text-anchor="middle" fill="#353548" font-family="monospace" font-size="18">#${safeId}</text>
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
  const labels = config.badgeLabels || {};
  if (movie.type === 'Animation') return { text: labels.animation || '', cls: 'badge--animation' };
  if (movie.type === 'Series')    return { text: labels.series || '',    cls: 'badge--series' };
  if (movie.type === 'Iranian')   return null;
  if (movie.type === 'Movie') {
    if (movie.genres.includes('دوبله فارسی')) return { text: labels.dubbed || '',  cls: 'badge--dubbed' };
    return { text: labels.subtitle || '', cls: 'badge--subtitle' };
  }
  return null;
}

/**
 * Identification label used by copy, print and the order snapshot (D4/FE-06).
 *
 * Movies/Animation/Iranian carry a string id, Series carry id:null and
 * Games carry no id field at all — so: id when present (I2: verbatim string,
 * leading zeros kept), otherwise the title. Never returns "undefined"/"null".
 *
 * @param {{ id?: string|null, title?: string }|null|undefined} item
 * @returns {string}
 */
export function idOrTitle(item) {
  if (item == null) return '';
  if (item.id != null && item.id !== '') return String(item.id);
  return item.title == null ? '' : String(item.title);
}

/**
 * True when the item carries a real id — same decision basis as idOrTitle().
 * Series (id:null) and Games (no id) return false.
 *
 * @param {{ id?: string|null, title?: string }|null|undefined} item
 * @returns {boolean}
 */
export function hasId(item) {
  return item != null && item.id != null && item.id !== '';
}
