'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

function makeLibrary(tree, baseDir) {
  const root = baseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-lib-'));
  for (const [relPath, value] of Object.entries(tree)) {
    const full = path.join(root, relPath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (typeof value === 'string') {
      fs.writeFileSync(full, value);
    } else {
      fs.writeFileSync(full, JPEG_HEADER);
    }
  }
  return root;
}

module.exports = { makeLibrary, JPEG_HEADER };
