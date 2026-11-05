'use strict';
/**
 * Tiny helpers shared by the repro scripts.
 * PROJECT_ROOT defaults to the repo root (two levels above this folder).
 * Each check() prints PRESENT (bug still there), FIXED, or ERROR (script could not run — adapt it, never weaken the assertion).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : path.resolve(__dirname, '..', '..');
const req = (rel) => require(path.join(ROOT, rel));
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const mk = (...p) => fs.mkdirSync(path.join(...p), { recursive: true });
const touch = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function quiet(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}
async function quietAsync(fn) {
  const l = console.log, w = console.warn, e = console.error;
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; }
}

const summary = { present: 0, fixed: 0, error: 0 };
/** fn() -> { present: boolean, detail?: string } */
async function check(id, title, fn) {
  try {
    const r = await fn();
    if (r.present) { summary.present++; console.log(`PRESENT  ${id}  ${title}`); }
    else { summary.fixed++; console.log(`FIXED    ${id}  ${title}`); }
    if (r.detail) console.log(`         ${r.detail}`);
  } catch (err) {
    summary.error++;
    console.log(`ERROR    ${id}  ${title}\n         ${err && err.message}`);
  }
}
function done() {
  console.log(`\n${summary.present} present, ${summary.fixed} fixed, ${summary.error} error`);
  process.exitCode = summary.present || summary.error ? 1 : 0;
}
module.exports = { ROOT, req, tmp, mk, touch, sleep, quiet, quietAsync, check, done, path, fs, os };
