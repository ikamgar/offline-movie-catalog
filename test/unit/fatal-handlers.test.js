'use strict';
/**
 * P8a follow-up — fatal handlers run FOR REAL: each case spawns a child
 * node process that requires server/logger.js, initialises it into a
 * temp log dir and installs the very handlers the server auto-start
 * installs (logger.installFatalHandlers). We assert:
 *   - exit code 1,
 *   - the FATAL line (with the probe message) landed in the file log,
 *   - the bilingual [FATAL] console summary was printed,
 *   - NO secret leaked: the child runs with ADMIN_PASSWORD in its env
 *     and neither the log nor the output contains it (or the key name).
 * Temp dirs only.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const SECRET_ENV = 'F4tal-Env-Probe-22!';

const tmpDirs = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8a-fatal-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

const CHILD_SOURCE = `
'use strict';
const logger = require(${JSON.stringify(path.join(REPO, 'server', 'logger.js'))});
logger.init({ dir: process.env.PROBE_LOG_DIR, now: () => new Date(2026, 0, 1) });
logger.installFatalHandlers({ onExit: (code) => process.exit(code) });
if (process.env.PROBE_MODE === 'reject') {
  Promise.reject(new Error('fatal probe rejection'));
} else {
  setTimeout(() => { throw new Error('fatal probe exception'); }, 10);
}
`;

function runChild(mode) {
  const dir = tmpDir();
  const script = path.join(dir, 'probe.js');
  fs.writeFileSync(script, CHILD_SOURCE);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        PROBE_MODE: mode,
        PROBE_LOG_DIR: dir,
        ADMIN_PASSWORD: SECRET_ENV
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out, dir }));
  });
}

function readLog(dir) {
  const file = path.join(dir, 'app-20260101.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

describe('P8a follow-up - fatal handlers (real child processes)', () => {
  it('unhandledRejection: exit 1, FATAL logged, bilingual console line, no secret', async () => {
    const { code, out, dir } = await runChild('reject');
    const log = readLog(dir);
    assert.equal(code, 1, `exit code 1 (got ${code}); output:\n${out}`);
    assert.ok(log.includes('ERROR FATAL unhandledRejection: Error: fatal probe rejection'), `log has FATAL line:\n${log}`);
    assert.ok(out.includes('[FATAL] unhandledRejection'), 'bilingual console summary printed');
    assert.ok(out.includes('جزئیات در لاگ'), 'Persian console line printed');
    assert.ok(!log.includes(SECRET_ENV), 'env password never in the log');
    assert.ok(!out.includes(SECRET_ENV), 'env password never on the console');
    assert.ok(!log.includes('ADMIN_PASSWORD'), 'env key name never in the log');
  });

  it('uncaughtException: exit 1, FATAL logged, bilingual console line, no secret', async () => {
    const { code, out, dir } = await runChild('throw');
    const log = readLog(dir);
    assert.equal(code, 1, `exit code 1 (got ${code}); output:\n${out}`);
    assert.ok(log.includes('ERROR FATAL uncaughtException: Error: fatal probe exception'), `log has FATAL line:\n${log}`);
    assert.ok(log.includes('at '), 'stack detail went to the file log');
    assert.ok(out.includes('[FATAL] uncaughtException'), 'bilingual console summary printed');
    assert.ok(!log.includes(SECRET_ENV) && !out.includes(SECRET_ENV), 'env password never leaks');
    assert.ok(!log.includes('ADMIN_PASSWORD') && !out.includes('ADMIN_PASSWORD'), 'env key name never leaks');
  });

  it('server.js auto-start installs exactly these handlers (source wiring)', () => {
    const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    assert.ok(src.includes('logger.installFatalHandlers('), 'server.js delegates to logger');
    assert.ok(!src.includes("process.on('uncaughtException'"), 'inline handler removed');
    assert.ok(!src.includes("process.on('unhandledRejection'"), 'inline handler removed');
  });
});
