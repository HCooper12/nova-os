// jobRegistry's two jobs: `activeJobs()` (restart-safety, unchanged here)
// and, since 18 Oct 2026, `recordJobReceipt` — a bounded on-disk trail of
// every completed model job, because the in-memory job object is gone the
// moment it is evicted or the server restarts.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-jobregistry-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { registerJobMap, activeJobs, recordJobReceipt } = await import('../lib/jobRegistry.js');

const receiptsPath = path.join(dataDir, 'jobs', 'receipts.jsonl');
test.after(() => rm(dataDir, { recursive: true, force: true }));

test('activeJobs still counts only non-terminal jobs across every registered map', () => {
  const map = registerJobMap('probe-lane', new Map());
  map.set('a', { status: 'running' });
  map.set('b', { status: 'ready' }); // terminal
  const snap = activeJobs();
  assert.equal(snap.byLane['probe-lane'], 1);
});

test('recordJobReceipt writes one JSONL line with the given fields plus a timestamp', async () => {
  await recordJobReceipt({
    kind: 'voice', lane: 'ask-nova', model: 'claude-sonnet-5', ms: 1234, firstTextMs: null,
    consults: [], status: 'done', error: null, costUsd: 0.0123, chars: 240,
  });
  const lines = (await readFile(receiptsPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.ok(row.at, 'every receipt is timestamped');
  assert.equal(row.lane, 'ask-nova');
  assert.equal(row.model, 'claude-sonnet-5');
  assert.equal(row.costUsd, 0.0123);
  assert.equal(row.status, 'done');
});

test('20 concurrent receipts all land — no lost rows, no corrupt file', async () => {
  await rm(receiptsPath, { force: true });
  await Promise.all(Array.from({ length: 20 }, (_, i) => (
    recordJobReceipt({ kind: 'coach', lane: 'coach', model: 'claude-sonnet-5', ms: i, status: 'done' })
  )));
  const lines = (await readFile(receiptsPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 20);
  const seen = new Set(lines.map((l) => JSON.parse(l).ms));
  for (let i = 0; i < 20; i++) assert.ok(seen.has(i), `receipt ${i} is missing`);
});

test('the receipts file is bounded at 5000 lines, oldest dropped first', async () => {
  await rm(receiptsPath, { force: true });
  // write a smaller bound's worth sequentially (concurrency is already
  // covered above) so the newest-kept assertion is unambiguous
  for (let i = 0; i < 5020; i++) {
    // eslint-disable-next-line no-await-in-loop
    await recordJobReceipt({ kind: 'coach', lane: 'coach', ms: i, status: 'done' });
  }
  const lines = (await readFile(receiptsPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 5000, 'never grows past the cap');
  assert.equal(JSON.parse(lines[0]).ms, 20, 'the oldest 20 fell off the front');
  assert.equal(JSON.parse(lines.at(-1)).ms, 5019, 'the newest is last');
});
