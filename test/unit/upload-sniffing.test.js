'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startTestServer, loginAsAdmin } = require('../helpers/test-server');

function fetch(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, body });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Signatures
function makeFtyp(brand) {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(16, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand, 8, 'ascii');
  return buf;
}

const MP4_ISOM = makeFtyp('isom');
const MP4_MP42 = makeFtyp('mp42');
const MP4_3GP5 = makeFtyp('3gp5');
const AVIF_SIG = makeFtyp('avif');
const AVIS_SIG = makeFtyp('avis');

const JPEG_SIG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

const PNG_SIG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
]);

const WEBP_SIG = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')
]);

const HTML_BODY = Buffer.from('<!DOCTYPE html><html><body><h1>test</h1></body></html>');
const PHP_BODY = Buffer.from('<?php echo "evil script execution payload"; ?>');

function toDataUrl(buf, mime = 'image/jpeg') {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

describe('Upload sniffing on every poster route (F32 / Part B)', () => {
  let server;
  let token;

  before(async () => {
    server = await startTestServer({
      admin: { username: 'admin', password: 'testadmin123456' },
      tree: {
        'Movies/Action/0001- Heat 1995.jpg': true,
        'Games/PS4/God of War.jpg': true
      }
    });
    token = await loginAsAdmin(server.baseUrl, 'admin', 'testadmin123456');
  });

  after(async () => {
    await server.close();
  });

  let nextMovieId = 100;
  const routes = [
    {
      name: 'create movie (POST /api/movies)',
      send: (buf) => fetch(server.baseUrl, '/api/movies', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { id: String(nextMovieId++).padStart(4, '0'), type: 'Movie', title: 'Sniff Movie ' + nextMovieId, year: 2020, genres: ['Action'], poster: toDataUrl(buf) }
      })
    },
    {
      name: 'create game (POST /api/games)',
      send: (buf) => fetch(server.baseUrl, '/api/games', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { title: 'Sniff Game ' + Math.random(), platforms: ['PS4'], poster: toDataUrl(buf) }
      })
    },
    {
      name: 'PUT by-uid poster replace (PUT /api/movies/by-uid/:uid)',
      send: (buf) => fetch(server.baseUrl, '/api/movies/by-uid/0001', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { poster: toDataUrl(buf) }
      })
    },
    {
      name: 'preview (POST /api/movies/preview)',
      send: (buf) => fetch(server.baseUrl, '/api/movies/preview', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: { type: 'Movie', title: 'Preview Movie', year: 2020, id: '0092', poster: toDataUrl(buf) }
      })
    }
  ];

  for (const route of routes) {
    describe(route.name, () => {
      it('rejects ISO-BMFF container with brand isom with IMG_UNSUPPORTED 400', async () => {
        const res = await route.send(MP4_ISOM);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'IMG_UNSUPPORTED');
      });

      it('rejects ISO-BMFF container with brand mp42 with IMG_UNSUPPORTED 400', async () => {
        const res = await route.send(MP4_MP42);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'IMG_UNSUPPORTED');
      });

      it('rejects ISO-BMFF container with brand 3gp5 with IMG_UNSUPPORTED 400', async () => {
        const res = await route.send(MP4_3GP5);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'IMG_UNSUPPORTED');
      });

      it('rejects HTML body with IMG_UNSUPPORTED 400', async () => {
        const res = await route.send(HTML_BODY);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'IMG_UNSUPPORTED');
      });

      it('rejects PHP body with IMG_UNSUPPORTED 400', async () => {
        const res = await route.send(PHP_BODY);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'IMG_UNSUPPORTED');
      });

      it('accepts ftyp with brand avif (200)', async () => {
        const res = await route.send(AVIF_SIG);
        assert.equal(res.status, 200, `expected 200 for avif, got ${res.status}: ${res.body}`);
        assert.equal(res.json?.success, true);
      });

      it('accepts ftyp with brand avis (200)', async () => {
        const res = await route.send(AVIS_SIG);
        assert.equal(res.status, 200, `expected 200 for avis, got ${res.status}: ${res.body}`);
        assert.equal(res.json?.success, true);
      });

      it('accepts JPEG signature (200)', async () => {
        const res = await route.send(JPEG_SIG);
        assert.equal(res.status, 200, `expected 200 for jpeg, got ${res.status}: ${res.body}`);
        assert.equal(res.json?.success, true);
      });

      it('accepts PNG signature (200)', async () => {
        const res = await route.send(PNG_SIG);
        assert.equal(res.status, 200, `expected 200 for png, got ${res.status}: ${res.body}`);
        assert.equal(res.json?.success, true);
      });

      it('accepts WEBP signature (200)', async () => {
        const res = await route.send(WEBP_SIG);
        assert.equal(res.status, 200, `expected 200 for webp, got ${res.status}: ${res.body}`);
        assert.equal(res.json?.success, true);
      });
    });
  }
});
