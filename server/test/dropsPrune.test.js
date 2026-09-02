// Health drops — the boot-time sweep of Processed/: only old *.json goes,
// recent files and anything that is not an archived drop stay.
import { mkdtemp, mkdir, writeFile, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-drops-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { pruneProcessedDrops, PROCESSED_KEEP_DAYS } = await import('../lib/healthDrops.js');

test('pruneProcessedDrops removes only archived drops older than the keep window', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-drops-'));
  assert.deepEqual(await pruneProcessedDrops(dir), { pruned: 0 }, 'no Processed folder yet: nothing to do');
  const processed = path.join(dir, 'Processed');
  await mkdir(processed);
  const old = Date.now() - (PROCESSED_KEEP_DAYS + 5) * 86400e3;
  const write = async (name, at) => { const p = path.join(processed, name); await writeFile(p, '{}'); await utimes(p, new Date(at), new Date(at)); };
  await write('2026-06-01.json', old);
  await write('bad-2026-06-02.json', old);
  await write('2026-09-01.json', Date.now() - 86400e3);
  await write('notes.md', old); // not a drop — never touched
  await write('.hidden.json', old);
  const r = await pruneProcessedDrops(dir);
  assert.equal(r.pruned, 2);
  assert.deepEqual((await readdir(processed)).sort(), ['.hidden.json', '2026-09-01.json', 'notes.md']);
});
