'use strict';
/**
 * P8a G1 — print-urls: collectLanUrls over stubbed network interfaces
 * (normal adapter, virtual adapters, IPv6, internal/loopback, no
 * network). Uses injection; os.networkInterfaces is never called with a
 * real stub — one wiring test monkey-patches it to prove main()'s path.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { collectLanUrls } = require('../../scripts/print-urls');

describe('P8a G1 - collectLanUrls', () => {
  it('collects non-internal IPv4 addresses with their interface names', () => {
    const urls = collectLanUrls({
      'Ethernet': [
        { family: 'IPv4', address: '192.168.1.50', internal: false },
        { family: 'IPv6', address: 'fe80::1', internal: false }
      ],
      'Wi-Fi': [
        { family: 'IPv4', address: '10.0.0.7', internal: false }
      ]
    }, 3000);
    assert.deepEqual(urls, [
      { name: 'Ethernet', address: '192.168.1.50', url: 'http://192.168.1.50:3000/' },
      { name: 'Wi-Fi', address: '10.0.0.7', url: 'http://10.0.0.7:3000/' }
    ]);
  });

  it('skips loopback/internal addresses', () => {
    const urls = collectLanUrls({
      'Loopback Pseudo-Interface 1': [
        { family: 'IPv4', address: '127.0.0.1', internal: true }
      ]
    }, 3000);
    assert.deepEqual(urls, []);
  });

  it('includes virtual adapters (VMware/VirtualBox are non-internal IPv4s)', () => {
    const urls = collectLanUrls({
      'VMware Network Adapter VMnet1': [
        { family: 'IPv4', address: '192.168.80.1', internal: false }
      ],
      'VirtualBox Host-Only Network': [
        { family: 'IPv4', address: '192.168.56.1', internal: false }
      ]
    }, 8080);
    assert.equal(urls.length, 2);
    assert.equal(urls[0].url, 'http://192.168.80.1:8080/');
    assert.equal(urls[1].url, 'http://192.168.56.1:8080/');
    assert.ok(urls[0].name.includes('VMware'));
  });

  it('handles legacy numeric family values (older Node)', () => {
    const urls = collectLanUrls({
      'Ethernet': [{ family: 4, address: '172.16.0.2', internal: false }]
    }, 3000);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].url, 'http://172.16.0.2:3000/');
  });

  it('no network at all: empty list (main falls back to localhost only)', () => {
    assert.deepEqual(collectLanUrls({}, 3000), []);
    assert.deepEqual(collectLanUrls(null, 3000), []);
    assert.deepEqual(collectLanUrls({ eth0: [] }, 3000), []);
  });

  it('wiring: uses os.networkInterfaces() and the resolved config port', () => {
    const os = require('os');
    const original = os.networkInterfaces;
    os.networkInterfaces = () => ({
      'Test': [{ family: 'IPv4', address: '192.168.7.7', internal: false }]
    });
    try {
      const urls = collectLanUrls(os.networkInterfaces(), 3000);
      assert.equal(urls[0].address, '192.168.7.7');
    } finally {
      os.networkInterfaces = original;
    }
  });
});
