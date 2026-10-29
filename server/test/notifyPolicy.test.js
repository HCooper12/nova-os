// What is worth interrupting him for (lib/notifyPolicy.js). His report, 29
// Oct 2026: the notifications were overwhelming. 22-28 Oct sent about 120
// pushes, 41 of them "Waiting for review" for drafts Nova started itself.
// NOVA_DATA_DIR is set BEFORE any import (the 30-fake-greetings lesson).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-notify-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');

import test from 'node:test';
import assert from 'node:assert/strict';

const { recordPush, kindPush } = await import('../lib/notifyPolicy.js');
const push = await import('../lib/push.js');

// quiet hours (22:00-07:00 Melbourne) would hold the pushes this file counts:
// the 11:14 UTC deploy of 29 Oct failed on exactly that
await (await import('../lib/quietHours.js')).setQuietHours({ enabled: false });

const sent = [];
push._setPushTransportForTests(async (note) => { sent.push(note); return { sent: 1 }; });
test.after(async () => {
  push._setPushTransportForTests(null);
  await rm(root, { recursive: true, force: true });
});
test.beforeEach(() => { sent.length = 0; });

const pending = (kind, extra = {}) => ({ id: 'r1', kind, status: 'pending', text: 'x', ...extra });

test('what he asked for, finished while he was away, pushes', () => {
  assert.equal(recordPush(pending('research')).push, true);
  assert.equal(recordPush(pending('briefing')).push, true);
  assert.equal(recordPush(pending('video', { source: 'watcher' })).push, true);
  assert.equal(recordPush(pending('ingest', { source: 'capture' })).push, true);
  assert.equal(recordPush(pending('guardian')).push, true);
});

test('drafts Nova started itself stay in the Inbox: the kinds that made up his week', () => {
  for (const kind of ['food-suggestion', 'training-check', 'pattern', 'coach', 'dispatch', 'review', 'plan-today', 'week-plan',
    'weekly-debrief', 'distill', 'compost', 'autonomy', 'profile-fact', 'calendar', 'meal-prep', undefined]) {
    assert.equal(recordPush(pending(kind)).push, false, String(kind));
  }
});

test('research an agent asked for mid-answer is quiet: the answer already reached him', () => {
  assert.equal(recordPush(pending('research', { askedBy: 'agent' })).push, false);
});

test('a record that is not waiting on him never pushes', () => {
  assert.equal(recordPush({ kind: 'research', status: 'filed' }).push, false);
  assert.equal(recordPush(null).push, false);
});

test('direct pushes: the scheduled reports are quiet; his reminders and unknown kinds still go', () => {
  for (const k of ['daily-review', 'dispatch', 'weekly-debrief', 'plan-today', 'fuel-review', 'model-watch', 'compose-failed']) {
    assert.equal(kindPush(k).push, false, k);
  }
  assert.equal(kindPush(null).push, true, 'a sender with no kind is never silenced by accident');
  assert.equal(kindPush('reminder').push, true);
});

test('sendPush keeps a quiet kind off his phone and lets the rest through', async () => {
  const quiet = await push.sendPush({ title: 'Daily Review — Nova', body: 'b', tag: 'record-1', kind: 'daily-review' });
  assert.deepEqual(quiet, { sent: 0, quiet: true });
  assert.equal(sent.length, 0);
  await push.sendPush({ title: 'Call the physio', body: 'b', tag: 'reminder-1', urgent: true });
  assert.equal(sent.length, 1);
});

test('pushForRecord: a food suggestion buzzes nothing; research he asked for does', async () => {
  push.pushForRecord(pending('food-suggestion'));
  push.pushForRecord(pending('research', { id: 'r2' }));
  for (let i = 0; i < 500 && sent.length < 1; i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(sent.map((n) => n.tag), ['record-r2']);
});
