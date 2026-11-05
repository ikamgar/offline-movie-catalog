/**
 * XSS-safe HTML utilities.
 *
 * `esc(v)`       — escapes & < > " ' ` for safe interpolation in HTML/attributes.
 * `html\`…\``   — tagged template that auto-escapes every interpolation.
 *                  Use `raw(s)` inside to mark a trusted fragment.
 * `raw(str)`     — marks a string as pre-escaped / trusted (SVG icons only).
 *
 * Usage:
 *   import { esc, html, raw } from './html.js';
 *   this.innerHTML = html`<div title="${movie.title}">${movie.plotSummary}</div>`;
 *   this.innerHTML = html`<div>${raw('<svg>…</svg>')}</div>`;
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const ESC_RE = /[&<>"'`]/g;

/**
 * Escape a value for safe insertion into HTML text or attribute values.
 * @param {*} v
 * @returns {string}
 */
function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return s.replace(ESC_RE, ch => ESC_MAP[ch]);
}

/** Sentinel for trusted raw fragments inside html``. */
const RAW = Symbol('raw');

/**
 * Mark a string as pre-escaped / trusted.
 * @param {string} str
 * @returns {{ [RAW]: true, str: string }}
 */
function raw(str) {
  return { [RAW]: true, str };
}

/**
 * Tagged template literal that auto-escapes interpolations.
 * Values wrapped with `raw()` are passed through unescaped.
 * @param {TemplateStringsArray} strings
 * @param  {...any} values
 * @returns {string}
 */
function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v && v[RAW]) {
      out += v.str;
    } else if (Array.isArray(v)) {
      out += v.map(item => item && item[RAW] ? item.str : esc(item)).join('');
    } else {
      out += esc(v);
    }
    out += strings[i + 1];
  }
  return out;
}

export { esc, html, raw, RAW };
