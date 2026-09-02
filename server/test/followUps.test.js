// Calendar follow-ups on the rails: the shared detector, the dedupe, the two
// windows. Temp data dir BEFORE imports.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-followups-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { TASK_HINTS, isTaskEvent, pendingFollowUps, followUpRecord, followUpKey, sweepFollowUps } = await import('../lib/followUps.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('TASK_HINTS is one list: the client (src/vals/valsInbox.js) carries the same words in the same order', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const client = await readFile(path.join(here, '..', '..', 'src', 'vals', 'valsInbox.js'), 'utf8');
  const m = client.match(/const TASK_HINTS = \[([^\]]*)\]/);
  assert.ok(m, 'the client still declares TASK_HINTS');
  const clientList = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  assert.deepEqual(clientList, TASK_HINTS);
  assert.equal(isTaskEvent('Cook 👨‍🍳'), true);
  assert.equal(isTaskEvent('Plan meals and shopping list for next week'), true);
  assert.equal(isTaskEvent('Workout'), false);
  assert.equal(isTaskEvent('Work 💰'), false, '"Work" is not "wash"');
  assert.equal(isTaskEvent(''), false);
});

test('pendingFollowUps: task events only, once per day, not when a record exists (any status or shape) or an open to-do already carries it', () => {
  const date = '2026-09-03';
  const events = [{ label: 'Cook 👨‍🍳', time: '09:30' }, { label: 'Workout', time: '13:20' }, { label: 'Tank Wash 🧼🐶', time: '17:00' }, { label: 'Tidy up 🧹', time: '20:00' }, { label: 'Tidy up 🧹', time: '21:00' }];
  const records = [
    { kind: 'followup', status: 'filed', text: '✓ Cook 👨‍🍳', createdAt: '2026-09-03T19:05:00' }, // the client's legacy shape
    { kind: 'followup', status: 'pending', findingKey: followUpKey(date, 'Tidy up 🧹'), createdAt: '2026-09-03T19:05:00' }, // the sweep's own
  ];
  const due = pendingFollowUps({ date, events, records, openTodos: [{ text: 'tank wash 🧼🐶', checked: false }] });
  assert.deepEqual(due.map((d) => d.label), [], 'Cook answered, Tidy up already asked, Tank Wash is an open to-do, Workout is not a task');
  const fresh = pendingFollowUps({ date, events, records: [], openTodos: [] });
  assert.deepEqual(fresh.map((d) => d.label), ['Cook 👨‍🍳', 'Tank Wash 🧼🐶', 'Tidy up 🧹'], 'and the duplicate Tidy up asks once');
  const rec = followUpRecord(fresh[0], { now: new Date('2026-09-03T19:10:00') });
  assert.equal(rec.kind, 'followup');
  assert.equal(rec.status, 'pending');
  assert.equal(rec.findingKey, followUpKey(date, 'Cook 👨‍🍳'));
  assert.equal(rec.decision.route, 'journal');
  assert.match(rec.decision.payload.text, /^✓ Cook 👨‍🍳 \(09:30 on the calendar\) — done\.$/);
  assert.equal(rec.decision.payload.eventLabel, 'Cook 👨‍🍳');
  const y = followUpRecord(fresh[0], { yesterday: true, now: new Date('2026-09-04T08:00:00') });
  assert.match(y.decision.reason, /yesterday's calendar/);
  assert.match(y.decision.payload.text, /— done \(2026-09-03\)\.$/);
});

test('the sweep asks about today in the evening and yesterday in the morning, and nothing in between', async () => {
  const made = [];
  const deps = {
    records: [], openTodos: [],
    createRecord: async (r) => { made.push(r); return r; },
    eventsFor: async (d) => (d.getDate() === 3 ? [{ label: 'Cook 👨‍🍳', time: '09:30' }] : [{ label: 'Tidy up 🧹', time: '18:00' }]),
  };
  const noon = await sweepFollowUps('/v', { ...deps, now: new Date('2026-09-03T12:00:00') });
  assert.equal(noon.created.length, 0);
  assert.match(noon.skipped, /outside the windows/);
  const evening = await sweepFollowUps('/v', { ...deps, now: new Date('2026-09-03T19:30:00') });
  assert.equal(evening.window, 'evening');
  assert.deepEqual(evening.created.map((r) => r.decision.payload.eventLabel), ['Cook 👨‍🍳']);
  const morning = await sweepFollowUps('/v', { ...deps, records: made, now: new Date('2026-09-04T08:00:00') });
  assert.equal(morning.window, 'morning');
  assert.equal(morning.date, '2026-09-03', "the morning pass asks about yesterday's leftovers");
  assert.deepEqual(morning.created.map((r) => r.decision.payload.eventLabel), [], "Cook was already asked yesterday evening — nothing left over");
  const unreadable = await sweepFollowUps('/v', { ...deps, eventsFor: async () => { throw new Error('CalDAV down'); }, now: new Date('2026-09-03T19:30:00') });
  assert.deepEqual(unreadable.created, []);
  assert.match(unreadable.skipped, /couldn't be read/);
});
