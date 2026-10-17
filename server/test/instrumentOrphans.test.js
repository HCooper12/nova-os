// The orphan-reaping decision behind scripts/shot.mjs, probe.mjs and
// rec.mjs — the pure part of the 18 Oct 2026 incident fix. Chrome profile
// dirs these tools leave in $TMPDIR carry an `owner.pid`; a later run's
// sweep must kill the Chrome and remove the dir for exactly the ones
// whose owner is no longer alive, and leave everything else untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

const { orphanDirs, isPidAlive, pidFromDirName } = await import('../../scripts/cdp/lifecycle.mjs');

test('orphanDirs keeps a dir whose owner is alive', () => {
  const entries = [{ dir: '/tmp/nova-shot-profile-111', name: 'nova-shot-profile-111', ownerPid: 111 }];
  const isAlive = (pid) => pid === 111;
  assert.deepEqual(orphanDirs(entries, isAlive), []);
});

test('orphanDirs sweeps a dir whose owner has died', () => {
  const entries = [{ dir: '/tmp/nova-shot-profile-222', name: 'nova-shot-profile-222', ownerPid: 222 }];
  const isAlive = () => false;
  assert.deepEqual(orphanDirs(entries, isAlive), entries);
});

test('orphanDirs sweeps a dir with no determinable owner (NaN pid)', () => {
  const entries = [{ dir: '/tmp/nova-probe-x', name: 'nova-probe-x', ownerPid: NaN }];
  const isAlive = () => true; // should never even be consulted meaningfully for NaN
  assert.deepEqual(orphanDirs(entries, isAlive), entries);
});

test('orphanDirs is selective across a mixed batch — never touches a live owner', () => {
  const entries = [
    { dir: '/tmp/nova-shot-profile-1', name: 'nova-shot-profile-1', ownerPid: 1 },   // alive
    { dir: '/tmp/nova-shot-profile-2', name: 'nova-shot-profile-2', ownerPid: 2 },   // dead
    { dir: '/tmp/nova-probe-3', name: 'nova-probe-3', ownerPid: 3 },                 // alive
    { dir: '/tmp/nova-rec-4', name: 'nova-rec-4', ownerPid: 4 },                     // dead
  ];
  const isAlive = (pid) => pid === 1 || pid === 3;
  const result = orphanDirs(entries, isAlive);
  assert.deepEqual(result.map((e) => e.dir), ['/tmp/nova-shot-profile-2', '/tmp/nova-rec-4']);
});

test('isPidAlive is false for a pid that is not a finite number', () => {
  assert.equal(isPidAlive(NaN), false);
  assert.equal(isPidAlive(null), false);
  assert.equal(isPidAlive(undefined), false);
});

test('isPidAlive is true for this test process itself', () => {
  assert.equal(isPidAlive(process.pid), true);
});

test('isPidAlive is false for a pid essentially guaranteed not to exist', () => {
  // PIDs this large are not assignable by the OS; signal 0 against one
  // reliably throws ESRCH rather than racing a real process.
  assert.equal(isPidAlive(999999999), false);
});

test('pidFromDirName reads the trailing pid of an old-style dir name', () => {
  assert.equal(pidFromDirName('nova-shot-profile-12345'), 12345);
  assert.equal(pidFromDirName('nova-probe-42'), 42);
  assert.equal(pidFromDirName('nova-rec-7'), 7);
});

test('pidFromDirName is NaN when the name has no trailing pid', () => {
  assert.ok(Number.isNaN(pidFromDirName('nova-shot-profile-')));
  assert.ok(Number.isNaN(pidFromDirName('something-else')));
});
