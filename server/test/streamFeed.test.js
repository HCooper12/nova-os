// The Stream: one merged timeline assembled ONLY from receipts that exist —
// inbox records and timestamped request-log lines. Sync polls stay out,
// unmatched kinds stay out, and a quiet system produces an empty feed.
// Temp data dir + temp request log BEFORE imports.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-stream-'));
process.env.NOVA_REQLOG = path.join(process.env.NOVA_DATA_DIR, 'req.log');

import test from 'node:test';
import assert from 'node:assert/strict';

const { createRecord } = await import('../lib/inboxStore.js');
const { streamFeed } = await import('../lib/streamFeed.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('quiet system → empty feed, zero pending', async () => {
  const feed = await streamFeed();
  assert.deepEqual(feed.events, []);
  assert.equal(feed.pending, 0);
});

test('records and significant requests merge newest-first; polls and old-format lines stay out', async () => {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60_000).toISOString();

  await createRecord({ id: 'r1', kind: 'dispatch', status: 'pending', createdAt: iso(30), text: 'x', source: 't', mode: 'draft', decision: { title: 'Morning Brief' } });
  await createRecord({ id: 'r2', kind: 'todo', status: 'filed', createdAt: iso(5), text: 'Buy protein', source: 't', mode: 'auto' });
  await createRecord({ id: 'r3', kind: 'mystery', status: 'pending', createdAt: iso(1), text: 'no home', source: 't', mode: 'draft' });

  await writeFile(process.env.NOVA_REQLOG, [
    `req ${iso(10)} POST /api/ask ← 100.65.137.114 → 200 in 6100ms`,
    `req ${iso(8)} GET /api/snapshot ← 127.0.0.1 → 200 in 80ms`, // a poll — excluded
    `req ${iso(2)} POST /api/workouts/coach ← 100.65.137.114 → 200 in 45ms`,
    `req ${iso(1)} POST /api/health-data ← 100.77.255.37 → 200 in 12ms`, // the real push path — regressed once as /api/health/data
    'req POST /api/ask ← 127.0.0.1 → 200 in 10ms', // pre-timestamp format — can’t join a timeline
  ].join('\n'), 'utf8');

  const feed = await streamFeed();
  const labels = feed.events.map((e) => e.label);
  assert.deepEqual(labels, [
    'Health push landed',
    'Coach was asked',
    'Capture filed “Buy protein”',
    'Nova was asked',
    'Dispatch filed “Morning Brief”',
  ], 'newest first, polls and unmapped kinds excluded');
  assert.equal(feed.events[2].ms, 6100);
  assert.equal(feed.pending, 2, 'the mystery-kind record still counts as pending — the gate is the gate');
});
