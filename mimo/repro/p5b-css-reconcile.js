'use strict';
/**
 * P5b CSS-move reconciliation.
 *
 * extract  — pull each JS-injected style block as it was immediately before
 *            this session (baseline ref) and write it to
 *            mimo/shots/p5b/baseline/<name>.css (evidence of "before").
 * check    — property-by-property compare baseline blocks vs their new CSS
 *            file(s), plus the components.css sections moved into
 *            css/modals.css. Zero properties may be dropped; value changes
 *            are allowed only when listed in EXPECTED_CHANGES; missing
 *            entries only when listed in EXPECTED_MISSING (with reason).
 *
 * Usage:
 *   node mimo/repro/p5b-css-reconcile.js extract
 *   node mimo/repro/p5b-css-reconcile.js check
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_REF = process.env.P5B_BASELINE_REF || '3b06649';
const OUT_DIR = path.join(ROOT, 'mimo', 'shots', 'p5b', 'baseline');

const JS_SOURCES = [
  { name: 'admin-panel', file: 'js/components/admin-panel.js' },
  { name: 'login-modal', file: 'js/components/login-modal.js' },
  { name: 'confirm-modal', file: 'js/components/confirm-modal.js' },
  { name: 'store-print', file: 'js/store.js', kind: 'style-tag' }
];

// components.css sections moved to css/modals.css this session (selector strings)
const COMPONENTS_MOVED = [
  '.modal-backdrop',
  '.modal-backdrop.hidden,\n  diagnostics-modal.hidden',
  '@keyframes fadeIn',
  '.modal',
  '@keyframes modalIn',
  '.modal-header',
  '.modal-title',
  '.modal-body',
  '.movie-detail-backdrop',
  'movie-detail.hidden',
  '.movie-detail',
  '.edit-modal-backdrop',
  'edit-modal.hidden',
  '.edit-modal',
  '.edit-modal-header',
  '.edit-modal-title',
  '.edit-modal-close',
  '.edit-modal-close:hover',
  '.edit-modal-body',
  'add-modal.hidden'
];

// baseline selector -> extra class the element now also carries (markup change);
// reconciliation unions the rules containing both selector strings.
const ALIAS = {
  '.edit-modal-close': ['.modal-close'],
  '.edit-modal-close:hover': ['.modal-close:hover'],
  '.movie-detail-close': ['.modal-close'],
  '.movie-detail-close:hover': ['.modal-close:hover'],
  '.order-detail-close': ['.modal-close'],
  '.order-detail-close:hover': ['.modal-close:hover']
};

// exact value changes that are intentional this session: `selector|prop` -> [old, new]
const EXPECTED_CHANGES = {
  'login-modal .modal-overlay|z-index': ['1000', 'var(--z-modal)'],
  'confirm-modal .modal-overlay|z-index': ['1000', 'var(--z-modal)'],
  '.change-password-overlay|z-index': ['1000', 'var(--z-modal)'],
  // same numeric value, now a shared token (z-index token inventory, D6)
  '.admin-panel-header|z-index': ['10', 'var(--z-panel-head)'],
  '.order-detail-header|z-index': ['10', 'var(--z-panel-head)'],
  // D7/FE-14 WCAG AA: accent-as-text moved to --color-text-accent
  '.admin-selection-id|color': ['var(--color-accent-primary)', 'var(--color-text-accent)'],
  '.order-detail-movie-id|color': ['var(--color-accent-primary)', 'var(--color-text-accent)']
};

// missing declarations allowed with a reason
const EXPECTED_MISSING = {
  'admin-panel|@keyframes modalIn':
    'duplicate of the identical global @keyframes modalIn now living in css/modals.css (was already duplicated across files at baseline)'
};

const NEW_FILES = [
  'css/modals.css',
  'css/admin.css',
  'css/print.css'
];

function gitShow(rel) {
  return execSync(`git show ${BASELINE_REF}:${rel}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}

function extractBlock(src, name) {
  if (name === 'store-print') {
    const m = src.match(/<style>([\s\S]*?)<\/style>/);
    if (!m) throw new Error('store-print style tag not found');
    return m[1];
  }
  const idx = src.indexOf('_applyStyles()');
  if (idx < 0) throw new Error('no _applyStyles in ' + name);
  const after = src.slice(idx);
  const m = after.match(/style\.textContent = `([\s\S]*?)`;/);
  if (!m) throw new Error('no style.textContent block in ' + name);
  return m[1];
}

/** Parse CSS text into [{selector, decls:[{prop,value}], raw}] — comments stripped. */
function parseCss(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  const n = clean.length;
  while (i < n) {
    const braceOpen = clean.indexOf('{', i);
    if (braceOpen < 0) break;
    const selector = clean.slice(i, braceOpen).trim();
    // find matching close brace (handles nested at-rules)
    let depth = 1;
    let j = braceOpen + 1;
    while (j < n && depth > 0) {
      if (clean[j] === '{') depth++;
      else if (clean[j] === '}') depth--;
      j++;
    }
    const body = clean.slice(braceOpen + 1, j - 1);
    if (selector.startsWith('@keyframes')) {
      rules.push({ selector: normSel(selector), decls: [{ prop: '@keyframes', value: normWs(body) }], rawKey: true });
    } else if (selector.startsWith('@')) {
      // recurse into @media etc.
      for (const r of parseCss(body)) rules.push(r);
    } else {
      const decls = [];
      for (const part of splitDecls(body)) {
        const ci = part.indexOf(':');
        if (ci < 0) continue;
        const prop = part.slice(0, ci).trim().toLowerCase();
        const value = normWs(part.slice(ci + 1));
        if (prop) decls.push({ prop, value });
      }
      if (decls.length) rules.push({ selector: normSel(selector), decls });
    }
    i = j;
  }
  return rules;
}

function splitDecls(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function normWs(s) { return s.replace(/\s+/g, ' ').replace(/,\s*/g, ', ').trim(); }
function normSel(s) {
  return s.split(',').map((p) => normWs(p)).join(',\n');
}
function selList(selector) {
  return selector.split(',').map((s) => s.trim()).filter(Boolean);
}

/** union declarations for baseline selector(s), from parsed rules of target files */
function unionFor(rules, selKey) {
  const wanted = new Set(selKey.split('||'));
  for (const a of (ALIAS[selKey] || [])) wanted.add(a);
  const map = new Map(); // prop -> {value, from:[]}
  for (const rule of rules) {
    const sels = selList(rule.selector);
    if (sels.some((s) => wanted.has(s))) {
      for (const d of rule.decls) {
        const prev = map.get(d.prop);
        if (prev) { prev.value = prev.value === d.value ? prev.value : `${prev.value} || ${d.value}`; prev.from.push(rule.selector.replace(/\n/g, ' ')); }
        else map.set(d.prop, { value: d.value, from: [rule.selector.replace(/\n/g, ' ')] });
      }
    }
  }
  return map;
}

function compare(name, baselineText, targetRules, label) {
  const baseRules = parseCss(baselineText);
  const issues = [];
  let checked = 0;
  for (const br of baseRules) {
    const selKey = selList(br.selector).join('||');
    for (const d of br.decls) {
      checked++;
      const key = `${selKey}|${d.prop}`;
      const union = unionFor(targetRules, selKey);
      const got = union.get(d.prop);
      if (!got) {
        const missKey = d.prop === '@keyframes'
          ? `${name}|@keyframes ${selKey.replace('@keyframes ', '')}`
          : `${name}|${selKey}|${d.prop}`;
        if (EXPECTED_MISSING[missKey]) continue;
        issues.push(`MISSING  [${label}] ${selKey} :: ${d.prop}: ${d.value}`);
        continue;
      }
      // value compare (a || b means selector-group mismatch noise; compare against each side)
      const values = got.value.split(' || ');
      if (!values.includes(d.value)) {
        const exp = EXPECTED_CHANGES[`${selKey}|${d.prop}`];
        if (exp && values.includes(exp[1]) && exp[0] === d.value) continue;
        issues.push(`CHANGED  [${label}] ${selKey} :: ${d.prop}: "${d.value}" -> "${got.value}"`);
      }
    }
  }
  return { checked, issues };
}

function main() {
  const mode = process.argv[2];
  if (mode === 'extract') {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const src of JS_SOURCES) {
      const text = extractBlock(gitShow(src.file), src.name);
      fs.writeFileSync(path.join(OUT_DIR, `${src.name}.css`), text);
      console.log(`extracted ${src.name} (${parseCss(text).length} rules)`);
    }
    // components.css baseline (for the moved-sections check)
    fs.writeFileSync(path.join(OUT_DIR, 'components-baseline.css'), gitShow('css/components.css'));
    console.log('extracted components-baseline');
    return;
  }

  if (mode === 'check') {
    const report = [];
    let totalChecked = 0;
    const allIssues = [];

    // 1. JS blocks -> new files
    const newRules = [];
    for (const f of NEW_FILES) newRules.push(...parseCss(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    for (const src of JS_SOURCES) {
      const baselineText = fs.readFileSync(path.join(OUT_DIR, `${src.name}.css`), 'utf8');
      const { checked, issues } = compare(src.name, baselineText, newRules, src.name);
      totalChecked += checked;
      allIssues.push(...issues);
      report.push(`${src.name}: ${checked} declarations checked, ${issues.length} issues`);
    }

    // 2. components.css moved sections -> css/modals.css (selector-list exact match)
    const modalsRules = parseCss(fs.readFileSync(path.join(ROOT, 'css/modals.css'), 'utf8'));
    const compBaseline = fs.readFileSync(path.join(OUT_DIR, 'components-baseline.css'), 'utf8');
    const compRules = parseCss(compBaseline);
    const movedNorm = new Set(COMPONENTS_MOVED.map(normSel));
    let compChecked = 0;
    for (const cr of compRules) {
      if (!movedNorm.has(cr.selector)) continue;
      const selKey = selList(cr.selector).join('||');
      const union = unionFor(modalsRules, selKey);
      for (const d of cr.decls) {
        compChecked++;
        const got = union.get(d.prop);
        if (!got) { allIssues.push(`MISSING  [components->modals] ${selKey} :: ${d.prop}: ${d.value}`); continue; }
        const values = got.value.split(' || ');
        if (!values.includes(d.value)) allIssues.push(`CHANGED  [components->modals] ${selKey} :: ${d.prop}: "${d.value}" -> "${got.value}"`);
      }
    }
    report.push(`components moved sections: ${compChecked} declarations checked`);
    totalChecked += compChecked;

    report.push(`TOTAL: ${totalChecked} declarations checked, ${allIssues.length} issues`);
    const out = report.join('\n') + '\n' + (allIssues.length ? allIssues.join('\n') + '\n' : 'NO ISSUES\n');
    fs.writeFileSync(path.join(ROOT, 'mimo', 'shots', 'p5b', 'reconcile.txt'), out);
    console.log(out);
    process.exitCode = allIssues.length ? 1 : 0;
    return;
  }

  console.error('usage: node mimo/repro/p5b-css-reconcile.js extract|check');
  process.exit(1);
}

main();
