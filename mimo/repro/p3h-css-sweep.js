'use strict';
/**
 * P3h CSS-deletion sweep: for each of the 10 components touched by P1c
 * (4777e40), extract CSS selectors from the baseline-* git tag and from
 * current HEAD,
 * then search css/*.css for any baseline selector missing in the current file.
 *
 * Output: mimo/shots/p3h/sweep-raw.json + human-readable table.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  'js/components/movie-card.js',
  'js/components/movie-detail.js',
  'js/components/edit-modal.js',
  'js/components/add-modal.js',
  'js/components/selection-sidebar.js',
  'js/components/admin-panel.js',
  'js/components/order-card.js',
  'js/components/order-panel.js',
  'js/components/diagnostics-modal.js',
  'js/components/genre-sidebar.js',
];
// Baseline tag resolved at runtime — no hard-coded version (ARCH-01).
function resolveBaselineTag() {
  try {
    const out = execSync('git tag -l "baseline-*" --sort=-v:refname', { cwd: ROOT, encoding: 'utf8' });
    return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}
const BASE = resolveBaselineTag();
if (!BASE) {
  console.error('No baseline-* git tag found — fetch tags or create one first.');
  process.exit(2);
}

function gitShow(rev, file) {
  try {
    return execSync(`git show "${rev}:${file}"`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/**
 * Extract CSS selectors from a JS source string.
 * Finds style.textContent = `...` or <style> blocks and pulls selector lines
 * that precede a `{` (handles multi-line selectors ending in `{`).
 * Also captures @keyframes names and @media openings as special rules.
 */
function extractSelectors(src) {
  if (!src) return { selectors: [], keyframes: [], blocks: 0 };
  const rules = [];
  const keyframes = new Set();

  // Collect all template literals that look like CSS (contain { and } and :)
  // Simpler approach: find style.textContent = ` ... `
  const styleRe = /style\.textContent\s*=\s*`([\s\S]*?)`/g;
  const blocks = [];
  let m;
  while ((m = styleRe.exec(src)) !== null) blocks.push(m[1]);

  // Also <style>...</style>
  const tagRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
  while ((m = tagRe.exec(src)) !== null) blocks.push(m[1]);

  // Also detect raw CSS-looking template without style.textContent (rare)
  // Skip if no blocks found — try a broader heuristic: any template with `--space` or `var(--`
  if (blocks.length === 0) {
    const broad = /`([^`]{50,})`/g;
    while ((m = broad.exec(src)) !== null) {
      if (/var\(--|@keyframes|\.order-|admin-panel\s*\{/.test(m[1])) blocks.push(m[1]);
    }
  }

  for (const css of blocks) {
    // Remove comments
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Split into rule-ish chunks by scanning braces
    let i = 0;
    let selBuf = '';
    let depth = 0;
    while (i < clean.length) {
      const ch = clean[i];
      if (ch === '{') {
        if (depth === 0) {
          const sel = selBuf.trim().replace(/\s+/g, ' ');
          if (sel) {
            if (/^@keyframes\s+/.test(sel)) {
              const kf = sel.replace(/^@keyframes\s+/, '').trim();
              keyframes.add(kf);
            } else if (/^@media/.test(sel) || /^@supports/.test(sel) || /^@font-face/.test(sel)) {
              rules.push({ selector: sel, kind: 'at-rule' });
            } else {
              // Split comma-separated selectors, preserve nesting prefix for nested at-rules
              const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
              for (const p of parts) rules.push({ selector: p, kind: 'selector' });
            }
          }
          selBuf = '';
        } else {
          selBuf += ch;
        }
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth < 0) depth = 0;
        if (depth === 0) selBuf = '';
        else selBuf += ch;
      } else {
        if (depth === 0) selBuf += ch;
        else if (depth >= 1) {
          // inside a block — only track nested selectors when depth will re-open?
          // For simplicity: at depth>=1 we don't extract nested (CSS here is flat)
        }
      }
      i++;
    }
  }

  // Dedupe preserving order
  const seen = new Set();
  const uniq = [];
  for (const r of rules) {
    const k = r.kind + '\0' + r.selector;
    if (!seen.has(k)) { seen.add(k); uniq.push(r); }
  }
  return { selectors: uniq, keyframes: [...keyframes], blocks: blocks.length };
}

function collectCssFiles() {
  const dir = path.join(ROOT, 'css');
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.css')) out[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  return out;
}

function selectorInCss(selector, cssFiles) {
  // Normalize: look for the core simple selector token
  // For compound selectors like ".foo .bar", check the last simple part or full
  const hits = [];
  // Build a regex from the selector that tolerates whitespace differences
  let core = selector
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  // Also try just the most specific class/id/tag at the start
  const simpleMatch = selector.match(/^[.#]?[\w-]+/);
  const re = new RegExp(core, 'i');
  for (const [name, text] of Object.entries(cssFiles)) {
    if (re.test(text)) hits.push(name);
    else if (simpleMatch) {
      const simpleRe = new RegExp(simpleMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      // only count as hit if full selector-like occurrence exists — skip loose match
    }
  }
  return hits;
}

function selectorInSource(selector, src) {
  if (!src) return false;
  // Check if the selector appears in current JS source (CSS or markup class=)
  const simple = selector.match(/^[.#]?[\w-]+/);
  if (!simple) return false;
  // Prefer checking as a CSS rule: selector followed by { somewhere in style
  // Loose: the class name appears at all
  const tok = simple[0];
  if (tok.startsWith('.') || tok.startsWith('#')) {
    return src.includes(tok.slice(1)) || src.includes(tok);
  }
  // element selector like `order-detail` or `admin-panel`
  return src.includes(tok);
}

function main() {
  const cssFiles = collectCssFiles();
  const results = [];

  for (const file of FILES) {
    const baseSrc = gitShow(BASE, file);
    const curSrc = gitShow('HEAD', file); // committed current
    // Also read working tree in case of uncommitted changes
    const wtPath = path.join(ROOT, file);
    const wtSrc = fs.existsSync(wtPath) ? fs.readFileSync(wtPath, 'utf8') : curSrc;

    const base = extractSelectors(baseSrc);
    const cur = extractSelectors(wtSrc);

    const curSelSet = new Set(cur.selectors.map(r => r.selector));
    const rows = [];

    for (const r of base.selectors) {
      if (r.kind === 'at-rule') {
        // @media etc — check presence in current file CSS blocks
        const kept = cur.selectors.some(x => x.selector === r.selector);
        rows.push({ selector: r.selector, kind: 'at-rule', disposition: kept ? 'kept' : 'check', inCurFile: kept });
        continue;
      }
      if (curSelSet.has(r.selector)) {
        rows.push({ selector: r.selector, kind: 'selector', disposition: 'kept', inCurFile: true, inCss: [] });
        continue;
      }
      // Search css/*.css
      const inCss = selectorInCss(r.selector, cssFiles);
      if (inCss.length) {
        rows.push({ selector: r.selector, kind: 'selector', disposition: 'moved', inCurFile: false, inCss });
        continue;
      }
      // Intentionally superseded? Known cases:
      // - confirm-modal styles superseded by confirm-modal.js
      // - login-modal by login-modal.js
      // - change-password* by admin-panel (still there)
      rows.push({ selector: r.selector, kind: 'selector', disposition: 'MISSING', inCurFile: false, inCss: [] });
    }

    // Also note keyframes
    for (const kf of base.keyframes) {
      const inCur = cur.keyframes.includes(kf);
      const inCssFiles = Object.entries(cssFiles).filter(([, t]) => t.includes(`@keyframes ${kf}`)).map(([n]) => n);
      rows.push({
        selector: `@keyframes ${kf}`,
        kind: 'keyframes',
        disposition: inCur ? 'kept' : (inCssFiles.length ? 'moved' : 'MISSING'),
        inCurFile: inCur,
        inCss: inCssFiles,
      });
    }

    results.push({
      file,
      baseSelectorCount: base.selectors.filter(r => r.kind === 'selector').length,
      curSelectorCount: cur.selectors.filter(r => r.kind === 'selector').length,
      baseKeyframes: base.keyframes,
      curKeyframes: cur.keyframes,
      rows,
      missing: rows.filter(r => r.disposition === 'MISSING'),
    });
  }

  const outDir = path.join(ROOT, 'mimo', 'shots', 'p3h');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sweep-raw.json'), JSON.stringify(results, null, 2));

  // Human summary
  let totalBase = 0, totalMissing = 0;
  const lines = [];
  for (const r of results) {
    const miss = r.missing;
    totalBase += r.baseSelectorCount;
    totalMissing += miss.length;
    lines.push(`\n## ${r.file}  (baseline selectors: ${r.baseSelectorCount}, current: ${r.curSelectorCount})`);
    for (const row of r.rows) {
      const extra = row.inCss && row.inCss.length ? ` [css: ${row.inCss.join(',')}]` : '';
      lines.push(`  ${row.disposition.padEnd(12)} ${row.selector}${extra}`);
    }
    if (miss.length === 0) lines.push('  (no MISSING)');
  }
  lines.unshift(`TOTAL baseline selectors scanned: ${totalBase}, MISSING: ${totalMissing}`);
  const text = lines.join('\n');
  fs.writeFileSync(path.join(outDir, 'sweep-summary.txt'), text);
  console.log(text);
}

main();
