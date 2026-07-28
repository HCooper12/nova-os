// The overnight queue: honest caps, a testable-to-the-minute run window,
// and a sequential runner that leaves review-gated records — injected
// runners mean nothing spawns here. Temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-overnight-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { enqueueOvernight, removeOvernightItem, listOvernight, runOvernightQueue, shouldRunNow, overnightMorningLine } = await import('../lib/overnight.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('enqueue: real questions only, dup refusal, honest cap', async () => {
  await assert.rejects(() => enqueueOvernight({ question: 'hm' }), /real question/);
  await assert.rejects(() => enqueueOvernight({ kind: 'studio', question: 'a long enough question' }), /only research/);

  const item = await enqueueOvernight({ question: 'Does creatine timing matter?' });
  assert.equal(item.status, 'queued');
  await assert.rejects(() => enqueueOvernight({ question: 'does CREATINE timing matter?' }), /already queued/);

  for (let i = 0; i < 7; i++) await enqueueOvernight({ question: `Filler question number ${i} to reach the cap` });
  await assert.rejects(() => enqueueOvernight({ question: 'One question over the honest cap' }), /queue holds 8/);

  const list = await listOvernight();
  assert.equal(list.queuedCount, 8);
  for (let i = 0; i < 7; i++) {
    const filler = list.items.find((x) => x.question.includes(`number ${i} `));
    await removeOvernightItem(filler.id);
  }
  assert.equal((await listOvernight()).queuedCount, 1);
});

test('shouldRunNow: window edges to the minute, once a night, only with work', () => {
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const fresh = { lastRunDay: null };
  assert.equal(shouldRunNow(at(3, 29), fresh, 2), false, 'before the window');
  assert.equal(shouldRunNow(at(3, 30), fresh, 2), true, 'window opens 03:30');
  assert.equal(shouldRunNow(at(6, 29), fresh, 2), true, 'window tail');
  assert.equal(shouldRunNow(at(6, 30), fresh, 2), false, 'window closes 06:30');
  assert.equal(shouldRunNow(at(4, 0), fresh, 0), false, 'no work, no run');
  const today = new Date();
  const ranToday = { lastRunDay: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` };
  assert.equal(shouldRunNow(at(4, 0), ranToday, 2), false, 'once a night');
});

test('runner: sequential, review-gated results recorded; failures honest; force spares the window', async () => {
  await enqueueOvernight({ question: 'A second real question about sleep' });
  const started = [];
  const startJob = async (vp, item) => { started.push(item.question); return { id: 'rec-' + started.length }; };
  const pollRecord = async (id) => (id === 'rec-1'
    ? { id, status: 'pending', decision: { title: 'Creatine Brief' } }
    : { id, status: 'error', error: 'the web went dark' });

  const summary = await runOvernightQueue('/tmp/nowhere', { startJob, pollRecord, pollMs: 1, force: true });
  assert.deepEqual(summary, { ran: 2, done: 1, errors: 1 });
  assert.equal(started.length, 2, 'both ran, one at a time');

  const list = await listOvernight();
  const done = list.items.find((i) => i.status === 'done');
  const failed = list.items.find((i) => i.status === 'error');
  assert.equal(done.recordId, 'rec-1');
  assert.equal(done.title, 'Creatine Brief');
  assert.match(failed.error, /web went dark/);
  assert.equal(list.lastRunDay, null, 'a forced run must not consume the nightly window');

  const line = await overnightMorningLine();
  assert.match(line, /^\*\*Overnight\.\*\*/);
  assert.match(line, /1 research brief landed for review: Creatine Brief/);
  assert.match(line, /1 run failed/);
});
