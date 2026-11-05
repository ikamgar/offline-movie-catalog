'use strict';
/**
 * P8a G2 (+follow-up) — runtime configuration: optional config.json
 * merged UNDER environment variables (precedence: env > config.json >
 * defaults).
 *
 * Keys (config.json, all optional): port, libraryPath, dataDir.
 * Relative paths inside config.json resolve against the app root.
 *
 * Validation tiers:
 *  - FATAL (server does not start, exit code CONFIG_ERROR_EXIT_CODE = 2;
 *    the supervisor does not restart on that code): config.json exists
 *    but cannot be read/parsed, is not a JSON object, or its
 *    libraryPath/dataDir is present but not a usable non-empty string.
 *    Silently swapping to default folders could look like lost data
 *    (empty catalog, first-run admin setup, a fresh data/), so the
 *    owner must fix or delete the file.
 *  - WARN (message + fall back + continue): unknown keys, an invalid
 *    port, an invalid env PORT, a missing Library folder (the documented
 *    empty-catalog boot).
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const ALLOWED_KEYS = ['port', 'libraryPath', 'dataDir'];
const CONFIG_ERROR_EXIT_CODE = 2;
const FIX_HINT_EN = 'Fix or delete config.json, then start again.';
const FIX_HINT_FA = 'config.json را درست کنید یا حذف کنید، بعد دوباره اجرا کنید.';

function msg(level, code, lines) {
  return { level, code, lines };
}

/**
 * Resolve the effective configuration.
 *
 * @param {object} [options]
 * @param {object} [options.env] - environment map (default: process.env)
 * @param {string} [options.rootDir] - app root for relative paths / config.json lookup
 * @param {(p: string, enc: string) => string} [options.readFileSync]
 * @param {(p: string) => boolean} [options.existsSync]
 * @returns {{port: number, libraryPath: string, dataDir: string,
 *            configPath: string, usedConfigFile: boolean, hasFatal: boolean,
 *            sources: {port: string, libraryPath: string, dataDir: string},
 *            messages: Array<{level: string, code: string, lines: string[]}>}}
 */
function resolveConfig(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const rootDir = opts.rootDir || APP_ROOT;
  const readFileSync = opts.readFileSync || fs.readFileSync;
  const existsSync = opts.existsSync || fs.existsSync;
  const messages = [];

  // ── config.json (optional) ────────────────────────────────────────────────
  const configPath = path.join(rootDir, 'config.json');
  let fileCfg = {};
  let usedConfigFile = false;
  if (existsSync(configPath)) {
    usedConfigFile = true;
    let raw;
    try {
      raw = readFileSync(configPath, 'utf8');
    } catch (err) {
      messages.push(msg('error', 'CONFIG_READ', [
        `config.json exists but could not be read (${err.message}) — the server will not start.`,
        `فایل config.json هست اما خوانده نشد (${err.message}) — سرور اجرا نمی‌شود.`,
        FIX_HINT_EN,
        FIX_HINT_FA
      ]));
    }
    if (raw !== undefined) {
      // Editors like old Notepad save UTF-8 with a BOM; JSON.parse
      // chokes on it, so strip it before parsing (a valid file must
      // not be refused just for a BOM).
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      try {
        fileCfg = JSON.parse(raw);
      } catch (err) {
        fileCfg = {};
        messages.push(msg('error', 'CONFIG_JSON', [
          `config.json is not valid JSON (${err.message}) — the server will not start.`,
          `فایل config.json معتبر نیست (${err.message}) — سرور اجرا نمی‌شود.`,
          FIX_HINT_EN,
          FIX_HINT_FA
        ]));
      }
      if (fileCfg && typeof fileCfg === 'object' && !Array.isArray(fileCfg)) {
        const unknown = Object.keys(fileCfg).filter((k) => !ALLOWED_KEYS.includes(k));
        if (unknown.length) {
          messages.push(msg('warn', 'CONFIG_UNKNOWN_KEYS', [
            `config.json has unknown key(s): ${unknown.join(', ')}. Allowed keys: ${ALLOWED_KEYS.join(', ')}.`,
            `کلید(های) ناشناخته در config.json: ${unknown.join(', ')}. کلیدهای مجاز: ${ALLOWED_KEYS.join(', ')}.`
          ]));
        }
      } else {
        fileCfg = {};
        messages.push(msg('error', 'CONFIG_SHAPE', [
          'config.json must contain a JSON object like {"port": 3000} — the server will not start.',
          'config.json باید یک شیء JSON باشد، مانند {"port": 3000} — سرور اجرا نمی‌شود.',
          FIX_HINT_EN,
          FIX_HINT_FA
        ]));
      }
    }
  }

  // ── port: env > config.json > 3000 ────────────────────────────────────────
  let port;
  let portSource;
  const envPort = env.PORT !== undefined && env.PORT !== '' ? parseInt(env.PORT, 10) : NaN;
  if (Number.isInteger(envPort) && envPort >= 0) {
    // Legacy lenient env semantics (unchanged): PORT=0 falls back to 3000.
    port = envPort || 3000;
    portSource = 'env';
  } else {
    if (env.PORT !== undefined && env.PORT !== '') {
      messages.push(msg('warn', 'ENV_PORT_FALLBACK', [
        `PORT="${env.PORT}" is not a valid port — using default 3000.`,
        `مقدار PORT="${env.PORT}" معتبر نیست — از پورت پیش‌فرض 3000 استفاده شد.`
      ]));
    }
    if (fileCfg.port !== undefined) {
      if (Number.isInteger(fileCfg.port) && fileCfg.port >= 1 && fileCfg.port <= 65535) {
        port = fileCfg.port;
        portSource = 'config';
      } else {
        port = 3000;
        portSource = 'default';
        messages.push(msg('warn', 'CONFIG_PORT', [
          `config.json: "port" must be an integer from 1 to 65535 (got ${JSON.stringify(fileCfg.port)}) — using default 3000.`,
          `config.json: مقدار "port" باید عددی بین ۱ تا ۶۵۵۳۵ باشد (دریافت ${JSON.stringify(fileCfg.port)}) — از پورت پیش‌فرض 3000 استفاده شد.`
        ]));
      }
    } else {
      port = 3000;
      portSource = 'default';
    }
  }

  // ── libraryPath: env > config.json > ./Library ────────────────────────────
  let libraryRaw;
  let librarySource;
  if (env.LIBRARY_PATH) {
    libraryRaw = env.LIBRARY_PATH;
    librarySource = 'env';
  } else if (Object.prototype.hasOwnProperty.call(fileCfg, 'libraryPath')) {
    if (typeof fileCfg.libraryPath === 'string' && fileCfg.libraryPath.trim() !== '') {
      libraryRaw = fileCfg.libraryPath;
      librarySource = 'config';
    } else {
      libraryRaw = path.join(rootDir, 'Library');
      librarySource = 'default';
      messages.push(msg('error', 'LIBRARY_PATH_INVALID', [
        `config.json: "libraryPath" must be a non-empty text value (got ${JSON.stringify(fileCfg.libraryPath)}) — the server will not start. Switching folders silently could look like lost data.`,
        `config.json: مقدار "libraryPath" باید یک متن غیرخالی باشد (دریافت ${JSON.stringify(fileCfg.libraryPath)}) — سرور اجرا نمی‌شود؛ عوض کردن پوشه بدون اخطار ممکن است شبیه از دست رفتن اطلاعات به‌نظر برسد.`,
        FIX_HINT_EN,
        FIX_HINT_FA
      ]));
    }
  } else {
    libraryRaw = path.join(rootDir, 'Library');
    librarySource = 'default';
  }
  const libraryPath = path.isAbsolute(libraryRaw)
    ? path.normalize(libraryRaw)
    : path.resolve(rootDir, libraryRaw);

  if (!existsSync(libraryPath)) {
    messages.push(msg('warn', 'LIBRARY_MISSING', [
      `Library folder not found: ${libraryPath}`,
      `پوشهٔ کتابخانه پیدا نشد: ${libraryPath}`,
      'Create it with this structure (see README.md), or fix "libraryPath" in config.json:',
      'این ساختار را بسازید (توضیحات در README.md)، یا "libraryPath" را در config.json درست کنید:',
      '  Library/Movies/Action/0042- The Matrix 1999.jpg',
      '  Library/Animation/0012-Cars.jpg',
      '  Library/Series/Breaking Bad.jpg',
      '  Library/Games/PS4/Ghost Rider.jpg',
      'The server keeps running with an empty catalog. / سرور با کتابخانهٔ خالی ادامه می‌دهد.'
    ]));
  }

  // ── dataDir: env > config.json > ./data ───────────────────────────────────
  let dataRaw;
  let dataSource;
  if (env.DATA_DIR) {
    dataRaw = env.DATA_DIR;
    dataSource = 'env';
  } else if (Object.prototype.hasOwnProperty.call(fileCfg, 'dataDir')) {
    if (typeof fileCfg.dataDir === 'string' && fileCfg.dataDir.trim() !== '') {
      dataRaw = fileCfg.dataDir;
      dataSource = 'config';
    } else {
      dataRaw = path.join(rootDir, 'data');
      dataSource = 'default';
      messages.push(msg('error', 'DATA_DIR_INVALID', [
        `config.json: "dataDir" must be a non-empty text value (got ${JSON.stringify(fileCfg.dataDir)}) — the server will not start. Switching folders silently could look like lost data.`,
        `config.json: مقدار "dataDir" باید یک متن غیرخالی باشد (دریافت ${JSON.stringify(fileCfg.dataDir)}) — سرور اجرا نمی‌شود؛ عوض کردن پوشه بدون اخطار ممکن است شبیه از دست رفتن اطلاعات به‌نظر برسد.`,
        FIX_HINT_EN,
        FIX_HINT_FA
      ]));
    }
  } else {
    dataRaw = path.join(rootDir, 'data');
    dataSource = 'default';
  }
  const dataDir = path.isAbsolute(dataRaw)
    ? path.normalize(dataRaw)
    : path.resolve(rootDir, dataRaw);

  return {
    port,
    libraryPath,
    dataDir,
    configPath,
    usedConfigFile,
    hasFatal: messages.some((m) => m.level === 'error'),
    sources: { port: portSource, libraryPath: librarySource, dataDir: dataSource },
    messages
  };
}

/**
 * Format resolveConfig messages as console lines (bilingual, level-tagged).
 * @param {Array<{level: string, code: string, lines: string[]}>} messages
 * @returns {string[]}
 */
function formatConfigMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    out.push('');
    out.push(`  [CONFIG ${m.level.toUpperCase()}] ${m.code}`);
    for (const line of m.lines) out.push(`    ${line}`);
  }
  return out;
}

module.exports = { resolveConfig, formatConfigMessages, ALLOWED_KEYS, APP_ROOT, CONFIG_ERROR_EXIT_CODE };
