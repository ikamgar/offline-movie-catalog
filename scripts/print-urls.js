'use strict';
/**
 * P8a G1 — print every non-internal IPv4 LAN address so staff can type
 * the catalog URL on a phone. Called by Start.bat; also usable directly:
 *
 *   node scripts/print-urls.js             full listing (+ localhost)
 *   node scripts/print-urls.js --port-only print just the resolved port
 *
 * The port resolves with the same precedence as the server:
 * env > config.json > 3000 (server/config.js).
 */

const os = require('os');
const { resolveConfig } = require('../server/config');

/**
 * Collect LAN URLs from an os.networkInterfaces()-shaped map.
 * Non-internal IPv4 entries only (virtual adapters included — they are
 * real non-internal IPv4s; the owner can ignore ones they do not use).
 * Handles both string ('IPv4') and legacy numeric (4) family values.
 * @param {Record<string, Array<{family: string|number, address: string, internal: boolean}>>} interfaces
 * @param {number} port
 * @returns {Array<{name: string, address: string, url: string}>}
 */
function collectLanUrls(interfaces, port) {
  const urls = [];
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    for (const addr of addrs || []) {
      if (addr.internal) continue;
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      urls.push({ name, address: addr.address, url: `http://${addr.address}:${port}/` });
    }
  }
  return urls;
}

function main() {
  const portOnly = process.argv.includes('--port-only');
  const cfg = resolveConfig();
  if (portOnly) {
    process.stdout.write(String(cfg.port));
    return;
  }
  const urls = collectLanUrls(os.networkInterfaces(), cfg.port);
  console.log('');
  console.log('  On this PC:  http://localhost:' + cfg.port + '/');
  if (urls.length === 0) {
    console.log('  No LAN network detected - only localhost is available right now.');
    console.log('  الان فقط آدرس داخلی در دسترس است؛ شبکه‌ای پیدا نشد.');
  } else {
    console.log('  On phones / other PCs, type one of these addresses:');
    console.log('  برای موبایل، یکی از این آدرس‌ها را تایپ کنید:');
    for (const u of urls) {
      console.log('    ' + u.url + '    (' + u.name + ')');
    }
  }
  console.log('');
}

if (require.main === module) main();

module.exports = { collectLanUrls };
