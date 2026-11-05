/**
 * boot.js — replaces the inline <script> in index.html.
 * Loaded as type="module" so CSP script-src 'self' covers it.
 */
window.addEventListener('load', () => {
  document.body.classList.add('loaded');
  const loader = document.getElementById('initialLoader');
  if (loader) {
    setTimeout(() => loader.remove(), 400);
  }
});
