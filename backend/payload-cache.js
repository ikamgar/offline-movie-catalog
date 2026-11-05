/**
 * Payload Cache Module (P8c G6)
 *
 * Caches the fully serialised JSON body (plus a gzip copy and a content
 * ETag) for the large read-only API payloads (/api/movies, /api/games).
 *
 * Why: the pre-P8c handler rebuilt the response per request with
 * `meta.lastUpdated: new Date().toISOString()`, so the body — and Express's
 * content-hash ETag — changed every second and `If-None-Match` never
 * produced a 304. Here the body is built once per catalog revision, the
 * ETag is a quoted sha1 of that exact body, and `lastUpdated` is stamped at
 * build time (stable until the next invalidation).
 *
 * Invalidation is a trailing debounce (default 100 ms) so a watcher burst
 * of N file events produces one rebuild; a request arriving inside the
 * dirty window rebuilds synchronously (lazy path) so correctness never
 * depends on the timer. gzip runs off the request path on the thread pool;
 * until it lands, requests are served the raw body (still correct, just
 * uncompressed — a few ms window after each rebuild).
 */
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');

const DEFAULT_DEBOUNCE_MS = 100;

class PayloadCache {
  /**
   * @param {function} build - Called on rebuild; returns the JSON-serialisable payload
   * @param {{ debounceMs?: number }} [options]
   */
  constructor(build, options) {
    if (typeof build !== 'function') throw new Error('PayloadCache: build function required');
    const opts = options || {};
    this._build = build;
    this._debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;
    this._entry = null; // { body: Buffer, etag: string, gzip: Buffer|null }
    this._dirty = true;
    this._timer = null;
    this._buildCount = 0;
    // Build timings (sync portion only — gzip runs off-thread): the phase
    // instrumentation needs the payload-rebuild cost attributed per rebuild.
    this._lastBuildMs = 0;
    this._maxBuildMs = 0;
  }

  /** Mark the payload stale and schedule a debounced rebuild. */
  invalidate() {
    this._dirty = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this._rebuild();
    }, this._debounceMs);
    if (this._timer.unref) this._timer.unref();
  }

  /**
   * Rebuild synchronously if dirty, right now — used by the startup
   * reconcile so the fresh body exists before meta.scanning flips false
   * (and so the cost lands inside the measured reconcile window instead of
   * stalling the first user request).
   * @returns {{ body: Buffer, etag: string, gzip: Buffer|null }}
   */
  rebuildNow() {
    if (this._dirty || !this._entry) this._rebuild();
    return this._entry;
  }

  _rebuild() {
    const t0 = process.hrtime.bigint();
    const payload = this._build();
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    this._entry = { body, etag, gzip: null };
    this._dirty = false;
    this._buildCount += 1;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    this._lastBuildMs = ms;
    if (ms > this._maxBuildMs) this._maxBuildMs = ms;
    // Warm the gzip copy off the request path (thread pool). A stale copy
    // from an earlier revision is dropped by the etag check below.
    zlib.gzip(body, { level: zlib.constants.Z_BEST_SPEED }, (err, buf) => {
      if (err || !buf) return;
      if (this._entry && this._entry.etag === etag) this._entry.gzip = buf;
    });
  }

  /**
   * The current entry, rebuilding synchronously if dirty (lazy path so a
   * request never serves stale data while waiting for the debounce timer).
   * @returns {{ body: Buffer, etag: string, gzip: Buffer|null }}
   */
  getEntry() {
    if (this._dirty || !this._entry) this._rebuild();
    return this._entry;
  }

  /** Number of completed rebuilds (instrumentation for tests). */
  get buildCount() {
    return this._buildCount;
  }

  /** Sync-portion cost of the last rebuild, and the worst so far (ms). */
  get buildStats() {
    return { buildCount: this._buildCount, lastBuildMs: this._lastBuildMs, maxBuildMs: this._maxBuildMs };
  }

  /** Cancel any pending rebuild (shutdown). */
  dispose() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

module.exports = PayloadCache;
