'use strict';

/**
 * Cross-platform test runner for Node 18–24.
 *
 * Usage:  node scripts/run-tests.js unit|ui|all
 *
 * Node 22+ removed glob expansion for `node --test <dir>`, and plain
 * `node --test` picks up helper files.  This script collects *.test.js
 * files explicitly and passes them as individual arguments.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const mode = (args[0] || '').toLowerCase();

if (!mode || !['unit', 'ui', 'all'].includes(mode)) {
  console.error('Usage: node scripts/run-tests.js unit|ui|all');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

function collectTestFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    walk(abs, files);
  }
  return files.sort();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
}

function hasPlaywrightBrowser() {
  try {
    const { chromium } = require('playwright');
    const p = chromium.executablePath();
    return Boolean(p && fs.existsSync(p));
  } catch {
    return false;
  }
}

if (mode === 'ui' && !hasPlaywrightBrowser()) {
  console.log('\n  [SKIP] Playwright Chromium browser is not installed.');
  console.log('  To run UI tests, install it with: npx playwright install chromium\n');
  process.exit(0);
}

const dirs = [];
if (mode === 'unit' || mode === 'all') dirs.push('test/unit');
if (mode === 'ui') {
  dirs.push('test/ui');
} else if (mode === 'all') {
  if (hasPlaywrightBrowser()) {
    dirs.push('test/ui');
  } else {
    console.log('\n  [SKIP] Playwright Chromium browser is not installed — skipping UI tests.');
    console.log('  Install with: npx playwright install chromium\n');
  }
}

const files = collectTestFiles(dirs);

if (files.length === 0) {
  console.error(`No *.test.js files found under ${dirs.join(', ')}`);
  process.exit(1);
}

// P6c review fix: P4-C5 perf budgets must run in their OWN `node --test`
// invocation — long-task and grid-paint budgets drift when Chromium suites
// and the 20k-grid measurement share one process (390 ms flake vs ≤ 273 ms
// standalone). Perf is split out of the ui/all suite runs below.
const PERF_FILE = path.join(root, 'test', 'ui', 'perf.test.js');
const isPerf = (f) => f === PERF_FILE;
const suiteFiles = files.filter((f) => !isPerf(f));
const perfFiles = files.filter(isPerf);

const label = (list) => {
  console.log(`Running ${list.length} test file(s) from ${dirs.join(', ')}:\n`);
  for (const f of list) console.log('  ' + path.relative(root, f));
  console.log('');
};

function runInvocation(list) {
  const spawnArgs = ['--test', ...list];
  if (mode === 'ui') spawnArgs.push('--test-concurrency=1');
  const child = spawnSync(process.execPath, spawnArgs, {
    stdio: 'inherit',
    cwd: root,
  });
  return child.status ?? 1;
}

// UI mode: run files one at a time — concurrent Chromium suites contend for
// CPU and make the perf budgets (long-task > 100ms) unmeasurable.
let status = 0;
if (suiteFiles.length) {
  label(suiteFiles);
  status = runInvocation(suiteFiles);
}

if (perfFiles.length) {
  if (suiteFiles.length) {
    console.log('Separate invocation: perf budgets in their own process (P4-C5 isolation):\n');
  }
  label(perfFiles);
  const perfStatus = runInvocation(perfFiles);
  if (status === 0) status = perfStatus;
}

process.exit(status);
