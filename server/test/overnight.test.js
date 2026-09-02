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
  await assert.rejects(() => enqueueOvernight({ kind: 'studio', question: 'a long enough question' }), /research questions and Studio outlines/);

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
  // the failed item is back in the queue for ONE more night (audit [43])
  const failed = list.items.find((i) => i.requeuedAt);
  assert.equal(done.recordId, 'rec-1');
  assert.equal(done.title, 'Creatine Brief');
  assert.equal(failed.status, 'queued');
  assert.match(failed.lastError, /web went dark/);
  assert.equal(list.lastRunDay, null, 'a forced run must not consume the nightly window');

  const line = await overnightMorningLine();
  assert.match(line, /^\*\*Overnight\.\*\*/);
  assert.match(line, /1 research brief landed for review: Creatine Brief/);
  assert.match(line, /1 run failed — it will retry tonight/);
  // the retry is not spent inside THIS test's story
  await removeOvernightItem(failed.id);
});

test('outline kind: queued from a real idea, dispatched with its ideaId, counted in the morning line', async () => {
  // enqueue validates the outline fields and renders as a normal queue line
  await assert.rejects(() => enqueueOvernight({ kind: 'outline', ideaId: '', ideaTitle: '' }), /needs a Studio idea/);
  const item = await enqueueOvernight({ kind: 'outline', ideaId: 'idea-42', ideaTitle: 'Second brains that actually act' });
  assert.equal(item.kind, 'outline');
  assert.equal(item.ideaId, 'idea-42');
  assert.equal(item.question, 'Outline: Second brains that actually act');
  await assert.rejects(() => enqueueOvernight({ kind: 'outline', ideaId: 'idea-42', ideaTitle: 'Second brains that actually act' }), /already queued/);

  // the runner hands the FULL item to the job starter — kind and ideaId
  // intact — and records the outline's pending record like any other run
  const startedItems = [];
  const startJob = async (vp, it) => { startedItems.push(it); return { id: 'rec-outline' }; };
  const pollRecord = async (id) => ({ id, status: 'pending', decision: { title: 'Outline — Second brains that actually act' } });
  const summary = await runOvernightQueue('/tmp/nowhere', { startJob, pollRecord, pollMs: 1, force: true });
  assert.equal(summary.done, 1);
  assert.equal(startedItems[0].kind, 'outline');
  assert.equal(startedItems[0].ideaId, 'idea-42');

  const line = await overnightMorningLine();
  assert.match(line, /1 research brief and 1 Studio outline landed for review/);
});

// ---- audit [43]: the failed-item story ----------------------------------------

test('a failed item gets ONE more night, then rests honestly; the morning line matches each state', async () => {
  const { requeueFailed, MAX_ATTEMPTS } = await import('../lib/overnight.js');
  const now = new Date();
  // fresh queue
  for (const i of (await listOvernight()).items) { if (i.status === 'queued') await removeOvernightItem(i.id); }
  await enqueueOvernight({ question: 'Does creatine help sleep-deprived lifting?' });
  const failing = async () => ({ id: 'rec-fail-' + Math.random().toString(36).slice(2, 6) });
  const pollError = async (id) => ({ id, status: 'error', error: 'the web went dark' });

  let summary = await runOvernightQueue('/tmp/nowhere', { startJob: failing, pollRecord: pollError, pollMs: 1, force: true });
  assert.equal(summary.errors, 1);
  let item = (await listOvernight()).items.find((i) => i.question.startsWith('Does creatine'));
  assert.equal(item.status, 'queued', 'first failure: back in the queue for one more night');
  assert.equal(item.attempts, 2);
  assert.match(item.lastError, /web went dark/);
  assert.ok(item.requeuedAt);
  let line = await overnightMorningLine();
  assert.match(line, /1 run failed — it will retry tonight: Does creatine/);
  assert.ok(!/still queued thinking/.test(line), 'the old fiction is gone');

  summary = await runOvernightQueue('/tmp/nowhere', { startJob: failing, pollRecord: pollError, pollMs: 1, force: true });
  assert.equal(summary.errors, 1);
  item = (await listOvernight()).items.find((i) => i.question.startsWith('Does creatine'));
  assert.equal(item.status, 'error', 'second failure stays failed');
  assert.equal(item.failedTwice, true);
  line = await overnightMorningLine();
  assert.match(line, /1 run failed twice — re-queue it from Ops if it still matters: Does creatine/);

  // pure: an item already re-queued once is never re-queued again by the pass
  assert.equal(MAX_ATTEMPTS, 2);
  const twice = requeueFailed([{ id: 'x', status: 'error', attempts: 2, error: 'e' }], now)[0];
  assert.equal(twice.status, 'error');
  assert.equal(twice.failedTwice, true);
  const once = requeueFailed([{ id: 'y', status: 'error', error: 'e' }], now)[0];
  assert.equal(once.status, 'queued');
  assert.equal(once.attempts, 2);
});

test('reconcile before re-running: a brief that landed late is marked done, not run twice', async () => {
  for (const i of (await listOvernight()).items) { if (i.status === 'queued') await removeOvernightItem(i.id); }
  await enqueueOvernight({ question: 'What does zone 2 do for lifters, really?' });
  const started = [];
  const startJob = async (vp, it) => { started.push(it.question); return { id: 'rec-late' }; };
  // night 1: the poll times out (the brief is still classifying)
  let summary = await runOvernightQueue('/tmp/nowhere', { startJob, pollRecord: async (id) => ({ id, status: 'classifying' }), pollMs: 1, itemTimeoutMs: 5, force: true });
  assert.equal(summary.errors, 1);
  let item = (await listOvernight()).items.find((i) => i.question.startsWith('What does zone 2'));
  assert.equal(item.status, 'queued', 're-queued for tonight');
  assert.equal(item.recordId, 'rec-late', 'the record id is kept so tomorrow can look');
  // night 2: the record is pending in the Inbox — it landed after the poll gave up
  summary = await runOvernightQueue('/tmp/nowhere', { startJob, pollRecord: async (id) => ({ id, status: 'pending', decision: { title: 'Zone 2 for lifters' } }), pollMs: 1, force: true });
  assert.equal(summary.ran, 0, 'no second run was spent');
  assert.equal(summary.landedLate, 1);
  assert.equal(started.length, 1);
  item = (await listOvernight()).items.find((i) => i.question.startsWith('What does zone 2'));
  assert.equal(item.status, 'done');
  assert.equal(item.landedLate, true);
  assert.equal(item.title, 'Zone 2 for lifters');
  const line = await overnightMorningLine();
  assert.match(line, /landed for review \(1 from an earlier night, landed late\)/);
});
