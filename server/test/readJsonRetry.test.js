// 18 Oct 2026 ledger: "Unexpected end of JSON input" 12 times — a reader
// opened an operational JSON file in the brief window a writer had it
// truncated (mid-write, before the rename landed). This pins the one shared
// fix: a parse failure is retried a few times before it is treated as real
// corruption; a missing file is not retried at all.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import test from 'node:test';
import assert from 'node:assert/strict';

import { readJsonRetry, readJsonRetrySync } from '../lib/readJsonRetry.js';

const dir = await mkdtemp(path.join(tmpdir(), 'nova-readjson-'));
test.after(() => rm(dir, { recursive: true, force: true }));

test('a truncated file read once, then valid on retry, is returned (async)', async () => {
  const file = path.join(dir, 'a.json');
  await writeFile(file, '{"incompl');
  // the fix lands mid-retry, exactly as a sibling writer's rename would
  setTimeout(() => { writeFile(file, '{"ok":true}'); }, 10);
  const value = await readJsonRetry(file, { tries: 5, waitMs: 20 });
  assert.deepEqual(value, { ok: true });
});

test('a file that never becomes valid JSON still throws after all tries', async () => {
  const file = path.join(dir, 'b.json');
  await writeFile(file, 'not json at all');
  await assert.rejects(() => readJsonRetry(file, { tries: 2, waitMs: 5 }));
});

test('a missing file throws immediately — ENOENT is not retried', async () => {
  const file = path.join(dir, 'does-not-exist.json');
  const start = Date.now();
  await assert.rejects(() => readJsonRetry(file, { tries: 5, waitMs: 200 }));
  assert.ok(Date.now() - start < 150, 'ENOENT must not pay the retry waits');
});

test('the sync variant behaves the same way', async () => {
  // Atomics.wait blocks this thread's event loop, so a same-process
  // setTimeout/writeFile would never fire while it's waiting. A separate
  // OS process (a real sibling writer, not a simulated one) can still land
  // the fix mid-retry.
  const file = path.join(dir, 'c.json');
  await writeFile(file, '{"not done');
  spawn('sh', ['-c', `sleep 0.03 && printf '%s' '{"ok":1}' > ${JSON.stringify(file)}`], { shell: false });
  const value = readJsonRetrySync(file, { tries: 10, waitMs: 15 });
  assert.deepEqual(value, { ok: 1 });

  assert.throws(() => readJsonRetrySync(path.join(dir, 'missing.json'), { tries: 3, waitMs: 50 }));
});
