'use strict';
/**
 * Flat ESLint config (P7a F1) — two environments, tuned rule options:
 *
 *   js/**                    browser + ES modules (zero-build front-end)
 *   backend/**, server/**, server.js, scripts/**, test/**
 *                            Node.js + CommonJS (server, tooling, tests)
 *
 * Out of scope on purpose: mimo/** (one-off repro/shots probes), docs/**
 * (comments-only), styles/markup. Findings are fixed in code — rule options
 * below encode two deliberate codebase idioms instead of blanket disables:
 *   eqeqeq … null:'ignore'   `x == null` / `x != null` null-check idiom
 *   no-empty allowEmptyCatch empty `catch {}` is intentional (cleanup paths)
 */

const js = require('@eslint/js');

/** Browser globals used by js/** (no CDN shims — plain DOM APIs only). */
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  customElements: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLImageElement: 'readonly',
  Node: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  WebSocket: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  PerformanceObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  Image: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  crypto: 'readonly',
  performance: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly'
};

/** Node.js globals for CommonJS files (server, scripts, tests). */
const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  fetch: 'readonly',
  performance: 'readonly',
  crypto: 'readonly',
  structuredClone: 'readonly',
  queueMicrotask: 'readonly'
};

/** Shared rule set for both environments (eslint:recommended + project rules). */
const rules = {
  ...js.configs.recommended.rules,
  // ignoreRestSiblings: the `const { dead, ...rest } = obj` omit idiom.
  'no-unused-vars': ['error', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    ignoreRestSiblings: true
  }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-implicit-globals': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }]
};

module.exports = [
  {
    ignores: ['node_modules/**', 'data/**', 'Library/**', 'mimo/**', 'docs/**']
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals
    },
    rules
  },
  {
    files: [
      'backend/**/*.js',
      'server/**/*.js',
      'server.js',
      'scripts/**/*.js',
      'test/**/*.js',
      'eslint.config.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: nodeGlobals
    },
    rules
  },
  {
    // Playwright specs: page.evaluate() callbacks EXECUTE IN THE BROWSER,
    // so those files legitimately reference browser globals too. Source stays
    // CommonJS; only the globals map is extended (rules unchanged).
    files: ['test/ui/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...browserGlobals }
    },
    rules
  }
];
