'use strict';
/**
 * P5b — CSS consolidation + accessibility unit tests (D6, D7 / FE-10, FE-14).
 *
 * 1. z-index: no hard-coded numbers anywhere in css/ or js/ (tokens only)
 * 2. prefers-reduced-motion block exists and freezes animation/transition
 *    while keeping the loader spinner (essential indicator)
 * 3. every var(--...) used in css/ has a definition (catches dead tokens)
 * 4. WCAG 2.1 AA contrast matrix for the dark, light AND gaming theme
 *    scopes (4.5:1 normal text, 3:1 large text / UI components)
 * 5. gaming gradient button labels (flipped from todo in P5c)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CSS_FILES = [
  'css/themes.css',
  'css/main.css',
  'css/components.css',
  'css/modals.css',
  'css/admin.css',
  'css/mobile.css',
  'css/print.css'
];

const JS_FILES = (function collectJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectJs(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
})('js');

// ─── tiny CSS helpers ────────────────────────────────────────────────────────

function braceBlock(css, startIndex) {
  // startIndex points at '{'; returns inner text
  let depth = 1;
  let i = startIndex + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(startIndex + 1, i - 1);
}

function blockFor(css, selectorPattern) {
  const m = css.match(selectorPattern);
  if (!m) return null;
  return braceBlock(css, m.index + m[0].length - 1);
}

function declsOf(block) {
  const map = {};
  if (!block) return map;
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map[m[1]] = m[2].trim();
  }
  return map;
}

// ─── colour maths (sRGB, WCAG 2.1) ──────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

// ─── theme scopes ───────────────────────────────────────────────────────────

function themeScopes() {
  const css = read('css/themes.css');
  const base = declsOf(blockFor(css, /:root\s*\{/));
  const dark = declsOf(blockFor(css, /\[data-theme="dark"\],\s*:root\s*\{/));
  const light = declsOf(blockFor(css, /\[data-theme="light"\]\s*\{/));
  const gaming = declsOf(blockFor(css, /\[data-gaming="true"\]\s*\{/));
  const gamingLight = declsOf(blockFor(css, /\[data-gaming="true"\]\[data-theme="light"\]\s*\{/));
  const darkScope = { ...base, ...dark };
  // Real cascade for <html data-theme="light" data-gaming="true">:
  // dark base → light block → gaming block (later in source) → gamingLight block
  return {
    dark: darkScope,
    light: { ...darkScope, ...light },
    gaming: { ...darkScope, ...gaming },
    gamingLight: { ...darkScope, ...light, ...gaming, ...gamingLight }
  };
}

// ─── 1. z-index tokens only ─────────────────────────────────────────────────

test('D6/FE-10: css/ has no hard-coded z-index values (var(--z-*) only)', () => {
  const offenders = [];
  for (const f of CSS_FILES) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      // token definitions are "--z-name: 123" and do not use the z-index property
      if (/z-index\s*:\s*\d/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `hard-coded z-index found:\n${offenders.join('\n')}`);
});

test('D6/FE-10: js/ sets no numeric z-index (styles moved to css tokens)', () => {
  const offenders = [];
  for (const f of JS_FILES) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      if (/z-index\s*:\s*\d/.test(line) || /\.zIndex\s*=\s*\d/.test(line)) {
        offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `hard-coded z-index in JS found:\n${offenders.join('\n')}`);
});

test('D6: z-index scale is complete and ordered', () => {
  const base = declsOf(blockFor(read('css/themes.css'), /:root\s*\{/));
  const names = ['--z-base', '--z-raised', '--z-panel-head', '--z-dropdown', '--z-sticky', '--z-overlay', '--z-modal', '--z-toast'];
  let prev = -1;
  for (const n of names) {
    assert.ok(n in base, `missing z token ${n}`);
    const v = Number(base[n]);
    assert.ok(v > prev, `${n}=${v} must be greater than the previous step`);
    prev = v;
  }
});

// ─── 2. reduced motion ──────────────────────────────────────────────────────

test('D7/FE-14: prefers-reduced-motion freezes motion but keeps the loader spinner', () => {
  const main = read('css/main.css');
  const m = main.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*$/);
  assert.ok(m, 'main.css must end with a @media (prefers-reduced-motion: reduce) block');
  const block = m[0];
  assert.match(block, /animation-duration:\s*0\.01ms\s*!important/, 'must freeze animations');
  assert.match(block, /transition-duration:\s*0\.01ms\s*!important/, 'must freeze transitions');
  assert.match(block, /\.initial-spinner\s*\{[^}]*animation:\s*spin\s+0\.7s/, 'loader spinner must keep spinning (essential indicator)');
  assert.match(read('index.html'), /@keyframes\s+spin/, 'spin keyframes must still be defined');
});

// ─── 3. every var() resolves ────────────────────────────────────────────────

test('D6: every custom property used in css/ is defined somewhere in css/', () => {
  const defs = new Set();
  const uses = new Map(); // token -> file:line
  for (const f of CSS_FILES) {
    const text = read(f);
    for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defs.add(m[1]);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!uses.has(m[1])) uses.set(m[1], `${f}:${i + 1}`);
      }
    });
  }
  const missing = [];
  for (const [token, where] of uses) {
    if (!defs.has(token)) missing.push(`${token} used at ${where} but never defined`);
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

// ─── 4. WCAG contrast matrix (dark + light) ─────────────────────────────────

const PAIRS = [
  // [fg, bg, kind]  kind: text=4.5, large=3.0, ui=3.0
  ['--color-text-primary', '--color-bg-primary', 'text'],
  ['--color-text-primary', '--color-bg-secondary', 'text'],
  ['--color-text-primary', '--color-bg-tertiary', 'text'],
  ['--color-text-primary', '--color-surface-card', 'text'],
  ['--color-text-primary', '--color-surface-input', 'text'],
  ['--color-text-secondary', '--color-bg-primary', 'text'],
  ['--color-text-secondary', '--color-bg-secondary', 'text'],
  ['--color-text-secondary', '--color-bg-tertiary', 'text'],
  ['--color-text-secondary', '--color-surface-input', 'text'],
  ['--color-text-tertiary', '--color-bg-primary', 'text'],
  ['--color-text-tertiary', '--color-bg-secondary', 'text'],
  ['--color-text-tertiary', '--color-bg-tertiary', 'text'],
  ['--color-text-tertiary', '--color-surface-input', 'text'],
  ['--color-text-muted', '--color-bg-secondary', 'text'],
  ['--color-text-muted', '--color-bg-tertiary', 'text'],
  ['--color-text-muted', '--color-bg-primary', 'text'],
  ['--color-text-accent', '--color-bg-primary', 'text'],
  ['--color-text-accent', '--color-bg-secondary', 'text'],
  ['--color-accent-danger', '--color-bg-secondary', 'text'], // required asterisk
  ['--color-accent-primary', '--color-bg-secondary', 'ui'],   // borders / focus (UI ≥3)
  ['--color-border-focus', '--color-bg-primary', 'ui'],       // focus ring
  ['--color-border-focus', '--color-bg-secondary', 'ui'],
  ['#ffffff', '--color-accent-primary', 'text'],              // primary button label
  ['#ffffff', '--color-accent-primary-hover', 'text'],
  ['#ffffff', '--color-accent-primary-active', 'text'],
  ['#ffffff', '--gradient-stop-0', 'text'],                   // gradient badge label
  ['#ffffff', '--gradient-stop-1', 'text'],
  ['--color-accent-success', '--color-bg-tertiary', 'large'], // diag number (32px bold)
  ['--color-accent-warning', '--color-bg-tertiary', 'large']
];

function gradientStops(token) {
  const g = token.trim();
  const stops = g.matchAll(/#[0-9a-fA-F]{6}/g);
  const out = [...stops].map((m) => m[0]);
  return out;
}

function resolve(scope, fgTok, bgTok) {
  let fg = fgTok;
  let bg = bgTok;
  if (fg.startsWith('--')) fg = scope[fg];
  if (bg.startsWith('--')) bg = scope[bg];
  if (bgTok === '--gradient-stop-0') bg = gradientStops(scope['--gradient-accent'])[0];
  if (bgTok === '--gradient-stop-1') bg = gradientStops(scope['--gradient-accent'])[1];
  if (!isHex(fg) || !isHex(bg)) return null;
  return { fg: fg.trim(), bg: bg.trim() };
}

function threshold(kind) {
  return kind === 'text' ? 4.5 : 3.0;
}

for (const theme of ['dark', 'light', 'gaming', 'gamingLight']) {
  test(`D7/FE-14: WCAG AA contrast — ${theme} theme pairs`, () => {
    const scope = themeScopes()[theme];
    const failures = [];
    for (const [fgTok, bgTok, kind] of PAIRS) {
      const pair = resolve(scope, fgTok, bgTok);
      if (!pair) {
        failures.push(`unresolvable pair ${fgTok} on ${bgTok} (non-hex or missing token)`);
        continue;
      }
      const ratio = contrast(pair.fg, pair.bg);
      if (ratio + 1e-9 < threshold(kind)) {
        failures.push(
          `${fgTok} (${pair.fg}) on ${bgTok} (${pair.bg}) = ${ratio.toFixed(2)} < ${threshold(kind)}`
        );
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
}

// ─── 5. gaming gradient (flipped from todo in P5c) ──────────────────────────

for (const [theme, key] of [['dark', 'gaming'], ['light', 'gamingLight']]) {
  test(`P5c: gaming ${theme} gradient button labels ≥ 4.5`, () => {
    const scope = themeScopes()[key];
    const stops = gradientStops(scope['--gradient-accent']);
    const worst = Math.min(contrast('#ffffff', stops[0]), contrast('#ffffff', stops[1]));
    assert.ok(worst >= 4.5, `white on gaming gradient = ${worst.toFixed(2)}`);
  });
}
