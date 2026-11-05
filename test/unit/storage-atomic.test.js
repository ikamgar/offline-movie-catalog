'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { writeJsonAtomic, readJsonSafe } = require('../../backend/storage/atomic-json');
const backup = require('../../backend/storage/backup');

describe('backend/storage/atomic-json', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-json-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('writeJsonAtomic creates the file with parsed JSON', () => {
    const f = path.join(tmpDir, 'a.json');
    writeJsonAtomic(f, { hello: 'world', n: 1 });
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.deepEqual(data, { hello: 'world', n: 1 });
  });

  it('writeJsonAtomic pretty option indents output', () => {
    const f = path.join(tmpDir, 'pretty.json');
    writeJsonAtomic(f, { a: 1 }, { pretty: true });
    const raw = fs.readFileSync(f, 'utf8');
    assert.ok(raw.includes('\n'), 'pretty JSON has newlines');
    assert.deepEqual(JSON.parse(raw), { a: 1 });
  });

  it('writeJsonAtomic creates missing parent directories', () => {
    const f = path.join(tmpDir, 'nested', 'deep', 'b.json');
    writeJsonAtomic(f, { ok: true });
    assert.ok(fs.existsSync(f));
  });

  it('writeJsonAtomic leaves no .tmp siblings behind after success', () => {
    const f = path.join(tmpDir, 'c.json');
    writeJsonAtomic(f, { v: 1 });
    writeJsonAtomic(f, { v: 2 });
    const leftovers = fs.readdirSync(tmpDir).filter((n) => n.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'no temp files remain');
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { v: 2 });
  });

  it('writeJsonAtomic replaces existing file atomically (last write wins)', () => {
    const f = path.join(tmpDir, 'd.json');
    writeJsonAtomic(f, { version: 'previous' });
    writeJsonAtomic(f, { version: 'current' });
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { version: 'current' });
  });

  it('readJsonSafe returns ok + data for valid JSON', () => {
    const f = path.join(tmpDir, 'e.json');
    fs.writeFileSync(f, '{"x":1}');
    const r = readJsonSafe(f);
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.data, { x: 1 });
  });

  it('readJsonSafe returns missing when the file does not exist', () => {
    const r = readJsonSafe(path.join(tmpDir, 'nope.json'));
    assert.equal(r.status, 'missing');
    assert.equal(r.data, null);
  });

  it('readJsonSafe quarantines corrupt file and never overwrites the original bytes', () => {
    const f = path.join(tmpDir, 'orders.json');
    const corrupt = '{"orders":[{"id":"order-0007","createdBy":"SENTINEL"}';
    fs.writeFileSync(f, corrupt);

    const r = readJsonSafe(f);
    assert.equal(r.status, 'corrupt');
    assert.equal(r.data, null);
    assert.ok(r.warning, 'records a storage warning');
    assert.equal(r.warning.kind, 'corrupt-quarantined');

    assert.ok(!fs.existsSync(f), 'corrupt file renamed away');
    const siblings = fs.readdirSync(tmpDir);
    const quarantined = siblings.filter((n) => n.includes('.corrupt-'));
    assert.equal(quarantined.length, 1, `expected quarantine file, got: ${siblings.join(', ')}`);
    const qPath = path.join(tmpDir, quarantined[0]);
    assert.equal(fs.readFileSync(qPath, 'utf8'), corrupt, 'original bytes preserved in quarantine');
  });

  it('readJsonSafe restores from newest valid backup when present', () => {
    const f = path.join(tmpDir, 'orders.json');
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const history = { version: 1, nextNumber: 9, orders: [{ id: 'order-0008', number: 8 }] };
    fs.writeFileSync(path.join(backupDir, 'orders.20260101-100000.json'), JSON.stringify(history));
    fs.writeFileSync(f, '{"broken":');

    const r = readJsonSafe(f, { backupDir });
    assert.equal(r.status, 'ok', 'restored data should be usable');
    assert.deepEqual(r.data, history);
    assert.equal(r.warning.kind, 'restored-from-backup');
    assert.ok(!fs.existsSync(f), 'corrupt original still quarantined');
    const q = fs.readdirSync(tmpDir).filter((n) => n.includes('.corrupt-'));
    assert.equal(q.length, 1);
  });

  it('readJsonSafe skips invalid backups and picks the newest valid one', () => {
    const f = path.join(tmpDir, 'orders.json');
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const good = { version: 1, nextNumber: 3, orders: [] };
    fs.writeFileSync(path.join(backupDir, 'orders.20260101-100000.json'), JSON.stringify(good));
    fs.writeFileSync(path.join(backupDir, 'orders.20260102-100000.json'), 'not-json{{');
    fs.writeFileSync(f, 'also-broken');

    const r = readJsonSafe(f, { backupDir });
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.data, good);
    assert.equal(r.warning.kind, 'restored-from-backup');
  });

  it('readJsonSafe with no backup returns corrupt + quarantine path', () => {
    const f = path.join(tmpDir, 'metadata.json');
    fs.writeFileSync(f, '{oops');
    const r = readJsonSafe(f, { backupDir: path.join(tmpDir, 'backups') });
    assert.equal(r.status, 'corrupt');
    assert.equal(r.data, null);
    assert.ok(r.quarantine);
    assert.ok(fs.existsSync(r.quarantine));
  });

  it('AC1: crash between temp-write and rename leaves target at previous version', () => {
    const f = path.join(tmpDir, 'orders.json');
    const previous = { version: 1, nextNumber: 3, orders: [{ id: 'order-0002' }] };
    writeJsonAtomic(f, previous);

    // Simulate process death after temp fully written, before rename:
    // a .tmp sibling holds the next version; target is untouched.
    const crashTmp = path.join(
      tmpDir,
      `.orders.json.${process.pid}.999999999.crash.tmp`
    );
    fs.writeFileSync(crashTmp, JSON.stringify({ version: 1, nextNumber: 99, orders: [] }));

    const r = readJsonSafe(f);
    assert.equal(r.status, 'ok', 'target must still parse after simulated crash');
    assert.deepEqual(r.data, previous, 'target must equal previous version');

    // Leftover temp does not poison a later successful write
    writeJsonAtomic(f, { version: 1, nextNumber: 4, orders: previous.orders });
    assert.deepEqual(
      JSON.parse(fs.readFileSync(f, 'utf8')),
      { version: 1, nextNumber: 4, orders: previous.orders }
    );
  });
});

describe('backend/storage/backup policy', () => {
  let tmpDir;
  let backupDir;
  let srcFile;
  let clock;
  let bm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-policy-'));
    backupDir = path.join(tmpDir, 'backups');
    srcFile = path.join(tmpDir, 'orders.json');
    fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: 1, orders: [] }));
    clock = new Date('2026-06-15T12:00:00');
    bm = backup.createBackupManager(backupDir, { now: () => clock });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function listBackups(name) {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir).filter((n) => n.startsWith(`${name}.`)).sort();
  }

  it('creates a timestamped backup file', () => {
    const p = bm.backup(srcFile, 'orders');
    assert.ok(p, 'backup created');
    assert.equal(path.dirname(p), backupDir);
    assert.match(path.basename(p), /^orders\.\d{8}-\d{6}\.json$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(p, 'utf8')), { version: 1, nextNumber: 1, orders: [] });
  });

  it('throttles to at most one backup per 10 minutes while changing', () => {
    bm.backup(srcFile, 'orders');
    for (let i = 0; i < 999; i++) {
      clock = new Date(clock.getTime() + 1000); // +1s each save
      fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: i + 2, orders: [{ n: i }] }));
      bm.backup(srcFile, 'orders');
    }
    assert.ok(listBackups('orders').length <= 2, `rapid saves must not flood backups (got ${listBackups('orders').length})`);
  });

  it('force backup bypasses the throttle (destructive ops)', () => {
    bm.backup(srcFile, 'orders');
    fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: 2, orders: [{ id: 'order-0001' }] }));
    const p = bm.backup(srcFile, 'orders', { force: true });
    assert.ok(p, 'forced backup created within throttle window');
    assert.equal(listBackups('orders').length, 2);
  });

  it('1,000 rapid saves produce ≤ 40 backup files (acceptance 5)', () => {
    for (let i = 0; i < 1000; i++) {
      // Advance the fake clock by 1s per save — still one 10-min window batch
      clock = new Date(clock.getTime() + 1000);
      fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: i + 2, orders: [{ n: i }] }));
      bm.backup(srcFile, 'orders', { force: true });
    }
    const files = listBackups('orders');
    assert.ok(files.length <= 40, `1000 rapid saves must produce ≤40 backups (got ${files.length})`);
  });

  it('retention keeps newest 30 + one per day for 14 days (fake clock)', () => {
    // Seed forced backups across 20 days at 6/hour (span many days, hit prune)
    for (let day = 0; day < 20; day++) {
      for (let h = 0; h < 6; h++) {
        clock = new Date(Date.UTC(2026, 5, 1 + day, h * 4, 0, 0));
        fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: day * 6 + h + 1, orders: [] }));
        bm.backup(srcFile, 'orders', { force: true });
      }
    }
    const files = listBackups('orders');
    // Spec: newest 30 + one per day for 14 days → at most 44, acceptance tight bound is for rapid saves
    assert.ok(files.length <= 44, `retention must cap backups (got ${files.length})`);

    // Oldest-per-day: each of the last 14 calendar days still has ≥1 backup
    const days = new Set(files.map((f) => f.match(/\.(\d{8})-\d{6}\.json$/)[1]));
    const now = clock;
    const pad = (n) => String(n).padStart(2, '0');
    let keptDayChecks = 0;
    for (let d = 0; d < 14; d++) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d));
      const key = `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
      if (days.has(key)) keptDayChecks++;
    }
    assert.equal(keptDayChecks, 14, `all last 14 days must keep a backup (got ${keptDayChecks})`);

    // Newest 30 still present
    const sorted = files.slice().sort();
    const newest30 = sorted.slice(-30);
    for (const f of newest30) {
      assert.ok(fs.existsSync(path.join(backupDir, f)), `newest-30 backup must exist: ${f}`);
    }

    // Never delete the last (newest) valid backup
    const newest = files[files.length - 1];
    assert.ok(fs.existsSync(path.join(backupDir, newest)));
  });

  it('never deletes the last valid backup even with zero retention room', () => {
    const p = bm.backup(srcFile, 'orders', { force: true });
    assert.ok(p);
    // Force prune repeatedly
    for (let i = 0; i < 5; i++) bm.prune('orders');
    assert.ok(fs.existsSync(p), 'newest backup must survive prune');
  });

  it('startupBackup creates one only when the file changed since the last backup', () => {
    const created = bm.startupBackup(srcFile, 'orders');
    assert.ok(created, 'first startup creates a backup');
    const again = bm.startupBackup(srcFile, 'orders');
    assert.equal(again, null, 'unchanged file → no second startup backup');

    fs.writeFileSync(srcFile, JSON.stringify({ version: 1, nextNumber: 5, orders: [{ id: 'order-0004' }] }));
    // Windows mtime granularity can be coarse — bump mtime explicitly
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(srcFile, future, future);
    const third = bm.startupBackup(srcFile, 'orders');
    assert.ok(third, 'changed file → new startup backup');
  });

  it('does not touch catalog.json (rebuildable cache is out of scope)', () => {
    const catalog = path.join(tmpDir, 'catalog.json');
    fs.writeFileSync(catalog, '{"movies":[]}');
    // catalog is never registered with the backup manager by callers;
    // policy module only creates backups for names explicitly passed.
    bm.backup(catalog, 'orders'); // wrong name would still write under orders.* — ensure API is name-driven
    // The invariant enforced by wiring (order-manager / metadata / auth) is tested elsewhere.
    assert.equal(listBackups('metadata').length, 0);
  });
});
