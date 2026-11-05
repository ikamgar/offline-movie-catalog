'use strict';
/**
 * P8a G2 — config resolution: env > config.json > defaults, plus the
 * validation messages (malformed JSON, unknown keys, invalid port,
 * missing library folder). Everything runs against os.tmpdir() fixtures;
 * the real data/ and Library/ are never touched.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveConfig, formatConfigMessages, ALLOWED_KEYS, CONFIG_ERROR_EXIT_CODE } = require('../../server/config');

const tmpDirs = [];
function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8a-config-'));
  tmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

function writeConfig(rootDir, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  fs.writeFileSync(path.join(rootDir, 'config.json'), raw);
}

describe('P8a G2 - resolveConfig precedence', () => {
  it('uses defaults when nothing is set', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'Library'));
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.sources.port, 'default');
    assert.equal(cfg.libraryPath, path.join(root, 'Library'));
    assert.equal(cfg.dataDir, path.join(root, 'data'));
    assert.equal(cfg.usedConfigFile, false);
    assert.equal(cfg.messages.length, 0);
  });

  it('config.json overrides defaults', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'MyLib'));
    writeConfig(root, { port: 8080, libraryPath: 'MyLib', dataDir: 'MyData' });
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.port, 8080);
    assert.equal(cfg.sources.port, 'config');
    assert.equal(cfg.libraryPath, path.join(root, 'MyLib'));
    assert.equal(cfg.dataDir, path.join(root, 'MyData'));
    assert.equal(cfg.usedConfigFile, true);
    assert.equal(cfg.hasFatal, false, 'a fully valid file has no fatal errors');
  });

  it('environment variables override config.json', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'EnvLib'));
    writeConfig(root, { port: 8080, libraryPath: 'MyLib', dataDir: 'MyData' });
    const cfg = resolveConfig({
      env: { PORT: '9090', LIBRARY_PATH: path.join(root, 'EnvLib'), DATA_DIR: path.join(root, 'EnvData') },
      rootDir: root
    });
    assert.equal(cfg.port, 9090);
    assert.equal(cfg.sources.port, 'env');
    assert.equal(cfg.libraryPath, path.join(root, 'EnvLib'));
    assert.equal(cfg.sources.libraryPath, 'env');
    assert.equal(cfg.dataDir, path.join(root, 'EnvData'));
    assert.equal(cfg.sources.dataDir, 'env');
  });

  it('relative config.json paths resolve against the app root', () => {
    const root = tmpRoot();
    writeConfig(root, { libraryPath: 'nested/MyLib' });
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.libraryPath, path.join(root, 'nested', 'MyLib'));
  });

  it('absolute config.json paths are kept', () => {
    const root = tmpRoot();
    const abs = path.join(root, 'abs-lib');
    writeConfig(root, { libraryPath: abs, dataDir: abs });
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.libraryPath, path.normalize(abs));
  });

  it('legacy env quirks kept: PORT=0 falls back to 3000, empty string ignored', () => {
    const root = tmpRoot();
    const zero = resolveConfig({ env: { PORT: '0' }, rootDir: root });
    assert.equal(zero.port, 3000);
    assert.equal(zero.sources.port, 'env');
    const empty = resolveConfig({ env: { PORT: '' }, rootDir: root });
    assert.equal(empty.port, 3000);
    assert.equal(empty.sources.port, 'default');
  });
});

describe('P8a follow-up - resolveConfig validation (fatal vs warn)', () => {
  it('unusable config.json exit code is the dedicated 2', () => {
    assert.equal(CONFIG_ERROR_EXIT_CODE, 2);
  });

  it('malformed JSON: FATAL message + hasFatal, resolution shape still returned', () => {
    const root = tmpRoot();
    writeConfig(root, '{ port: 8080, }');
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.hasFatal, true);
    assert.equal(cfg.port, 3000, 'value still falls back for the return shape');
    const codes = cfg.messages.map((m) => m.code);
    assert.ok(codes.includes('CONFIG_JSON'), `CONFIG_JSON reported: ${codes}`);
    const m = cfg.messages.find((x) => x.code === 'CONFIG_JSON');
    assert.equal(m.level, 'error');
    assert.ok(m.lines.some((l) => l.includes('not valid JSON')), 'English line present');
    assert.ok(m.lines.some((l) => l.includes('سرور اجرا نمی‌شود')), 'Persian stop line present');
    assert.ok(m.lines.some((l) => l.includes('Fix or delete config.json')), 'fix hint given');
  });

  it('unreadable config.json (read throws): FATAL', () => {
    const root = tmpRoot();
    writeConfig(root, { port: 8080 });
    const cfg = resolveConfig({
      env: {},
      rootDir: root,
      readFileSync: () => { throw new Error('EACCES: permission denied'); }
    });
    assert.equal(cfg.hasFatal, true);
    assert.ok(cfg.messages.some((m) => m.code === 'CONFIG_READ' && m.level === 'error'));
  });

  it('UTF-8 BOM is stripped: a valid BOM file is accepted, not refused', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'config.json'), '\uFEFF{ "port": 8080 }');
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.port, 8080, 'BOM-only difference must not break a valid file');
    assert.equal(cfg.hasFatal, false);
  });

  it('non-object config.json (valid JSON, wrong shape): FATAL', () => {
    const root = tmpRoot();
    writeConfig(root, '[1,2,3]');
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.hasFatal, true);
    const m = cfg.messages.find((x) => x.code === 'CONFIG_SHAPE');
    assert.equal(m && m.level, 'error');
    assert.equal(cfg.port, 3000);
  });

  it('libraryPath present but not a usable string: FATAL (number/empty/blank/null/object/bool)', () => {
    const root = tmpRoot();
    for (const bad of [123, '', '   ', null, { a: 1 }, true]) {
      writeConfig(root, { libraryPath: bad });
      const cfg = resolveConfig({ env: {}, rootDir: root });
      assert.equal(cfg.hasFatal, true, `libraryPath ${JSON.stringify(bad)} is fatal`);
      const m = cfg.messages.find((x) => x.code === 'LIBRARY_PATH_INVALID');
      assert.ok(m && m.level === 'error', `LIBRARY_PATH_INVALID for ${JSON.stringify(bad)}`);
      assert.ok(m.lines.some((l) => l.includes('lost data') || l.includes('اطلاعات')), 'lost-data rationale given');
    }
  });

  it('dataDir present but not a usable string: FATAL', () => {
    const root = tmpRoot();
    for (const bad of [42, '', '  ', null, [], false]) {
      writeConfig(root, { dataDir: bad });
      const cfg = resolveConfig({ env: {}, rootDir: root });
      assert.equal(cfg.hasFatal, true, `dataDir ${JSON.stringify(bad)} is fatal`);
      assert.ok(cfg.messages.some((x) => x.code === 'DATA_DIR_INVALID' && x.level === 'error'));
    }
  });

  it('bad libraryPath + env override: the bad value would be used... env wins, no fatal', () => {
    // Assumption (addendum): fatal applies when the bad config value
    // would actually be used; an env override replaces it entirely.
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'EnvLib'));
    writeConfig(root, { libraryPath: 123 });
    const cfg = resolveConfig({ env: { LIBRARY_PATH: path.join(root, 'EnvLib') }, rootDir: root });
    assert.equal(cfg.hasFatal, false);
    assert.equal(cfg.libraryPath, path.join(root, 'EnvLib'));
    assert.equal(cfg.sources.libraryPath, 'env');
  });

  it('malformed JSON + full env override: still FATAL (whole file is broken)', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'EnvLib'));
    writeConfig(root, '{oops');
    const cfg = resolveConfig({
      env: { LIBRARY_PATH: path.join(root, 'EnvLib'), DATA_DIR: path.join(root, 'EnvData'), PORT: '4000' },
      rootDir: root
    });
    assert.equal(cfg.hasFatal, true, 'a broken file always stops, even with env set');
    assert.equal(cfg.port, 4000, 'env still shapes the return value');
  });

  it('unknown keys: warn only — hasFatal stays false', () => {
    const root = tmpRoot();
    writeConfig(root, { port: 8080, prot: 9999, somethingElse: true });
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.port, 8080, 'valid keys still apply');
    const m = cfg.messages.find((x) => x.code === 'CONFIG_UNKNOWN_KEYS');
    assert.ok(m, 'CONFIG_UNKNOWN_KEYS reported');
    assert.equal(m.level, 'warn');
    assert.ok(m.lines[0].includes('prot') && m.lines[0].includes('somethingElse'));
    assert.ok(m.lines[0].includes(ALLOWED_KEYS.join(', ')));
    assert.equal(cfg.hasFatal, false, 'unknown keys never stop the server');
  });

  it('invalid port values: WARN + default 3000 (never fatal)', () => {
    const root = tmpRoot();
    for (const bad of [-1, 0, 65536, 3.5, '8080', null, true]) {
      writeConfig(root, { port: bad });
      const cfg = resolveConfig({ env: {}, rootDir: root });
      assert.equal(cfg.port, 3000, `port ${JSON.stringify(bad)} → 3000`);
      const m = cfg.messages.find((x) => x.code === 'CONFIG_PORT');
      assert.ok(m, `CONFIG_PORT reported for ${JSON.stringify(bad)}`);
      assert.equal(m.level, 'warn');
      assert.ok(m.lines.some((l) => l.includes('config.json')));
      assert.equal(cfg.hasFatal, false, `bad port ${JSON.stringify(bad)} never fatal`);
    }
    writeConfig(root, { port: 65535 });
    assert.equal(resolveConfig({ env: {}, rootDir: root }).port, 65535, '65535 valid');
    writeConfig(root, { port: 1 });
    assert.equal(resolveConfig({ env: {}, rootDir: root }).port, 1, '1 valid');
  });

  it('invalid env PORT: message + default (legacy lenient, never fatal)', () => {
    const root = tmpRoot();
    const cfg = resolveConfig({ env: { PORT: 'abc' }, rootDir: root });
    assert.equal(cfg.port, 3000);
    assert.ok(cfg.messages.some((m) => m.code === 'ENV_PORT_FALLBACK'));
    assert.equal(cfg.hasFatal, false);
  });

  it('missing library folder: bilingual actionable message, WARN only, keeps resolving', () => {
    const root = tmpRoot();
    const cfg = resolveConfig({ env: {}, rootDir: root });
    const m = cfg.messages.find((x) => x.code === 'LIBRARY_MISSING');
    assert.ok(m, 'LIBRARY_MISSING reported');
    assert.equal(m.level, 'warn', 'missing Library stays warn + continue');
    assert.equal(cfg.hasFatal, false);
    assert.ok(m.lines.some((l) => l.includes(path.join(root, 'Library'))), 'path named');
    assert.ok(m.lines.some((l) => l.includes('Library/Movies/Action')), 'structure example given');
    assert.ok(m.lines.some((l) => l.includes('config.json')), 'config hint given');
    assert.ok(m.lines.some((l) => l.includes('کتابخانه')), 'Persian line present');
    assert.equal(cfg.port, 3000, 'resolution continues');
  });

  it('existing library folder: no LIBRARY_MISSING message', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'Library'));
    const cfg = resolveConfig({ env: {}, rootDir: root });
    assert.equal(cfg.messages.length, 0);
    assert.equal(cfg.hasFatal, false);
  });

  it('formatConfigMessages produces level-tagged console lines (ERROR for fatal)', () => {
    const root = tmpRoot();
    writeConfig(root, '{broken');
    const cfg = resolveConfig({ env: {}, rootDir: root });
    const lines = formatConfigMessages(cfg.messages);
    assert.ok(lines.some((l) => l.includes('[CONFIG ERROR] CONFIG_JSON')));
    assert.ok(lines.every((l) => l === '' || l.startsWith('  ')));
  });
});
