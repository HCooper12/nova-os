// Env overrides must land before the module under test is imported —
// static imports hoist, so everything below uses dynamic import.
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { createVaultStateFile, createWriteLock } = await import('../lib/vaultStateFile.js');

const REL = 'Wiki/Health/State.md';

function makeFile() {
  return createVaultStateFile({
    relPath: REL,
    parse: (raw) => JSON.parse(raw),
    empty: () => ({ fresh: true }),
  });
}

test('vaultStateFile', async (t) => {
  let vault;
  t.beforeEach(async () => {
    vault = await mkdtemp(path.join(tmpdir(), 'nova-test-'));
  });
  t.afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  await t.test('load returns empty() when the file is absent', async () => {
    const file = makeFile();
    assert.deepEqual(await file.load(vault), { fresh: true });
  });

  await t.test('write then load returns the written value without re-reading', async () => {
    const file = makeFile();
    await file.write(vault, '{"n":1}', { n: 1 });
    assert.deepEqual(await file.load(vault), { n: 1 });
    const onDisk = await readFile(path.join(vault, REL), 'utf8');
    assert.equal(onDisk, '{"n":1}');
  });

  await t.test('an external edit is detected and wins over the cache', async () => {
    const file = makeFile();
    await file.write(vault, '{"n":1}', { n: 1 });
    // Simulate an Obsidian edit: new content, mtime nudged forward so it
    // can't collide with the write's timestamp at coarse granularity.
    const full = path.join(vault, REL);
    await writeFile(full, '{"n":2}', 'utf8');
    const future = new Date(Date.now() + 5000);
    await utimes(full, future, future);
    assert.deepEqual(await file.load(vault), { n: 2 });
  });

  await t.test('a write after an external edit starts from the re-read state', async () => {
    const file = makeFile();
    await file.write(vault, '{"n":1}', { n: 1 });
    const full = path.join(vault, REL);
    await writeFile(full, '{"n":99}', 'utf8');
    const future = new Date(Date.now() + 5000);
    await utimes(full, future, future);
    // The read-modify-write pattern every module uses:
    const state = await file.load(vault);
    assert.equal(state.n, 99); // external edit visible, not clobbered by cache
  });

  await t.test('unchanged mtime keeps serving the cache', async () => {
    const file = makeFile();
    await file.write(vault, '{"n":1}', { n: 1 });
    assert.deepEqual(await file.load(vault), { n: 1 });
    assert.deepEqual(await file.load(vault), { n: 1 });
  });
});

test('createWriteLock serializes read-modify-write cycles', async () => {
  const withLock = createWriteLock();
  const order = [];
  await Promise.all([
    withLock(async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
    }),
    withLock(async () => {
      order.push('b-start');
      order.push('b-end');
    }),
  ]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('createWriteLock keeps running after a failed task', async () => {
  const withLock = createWriteLock();
  await assert.rejects(withLock(async () => {
    throw new Error('boom');
  }));
  const result = await withLock(async () => 'still alive');
  assert.equal(result, 'still alive');
});
