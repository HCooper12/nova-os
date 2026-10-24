// Adding a calendar event without a model. Env first: nothing here may touch
// the real calendar, data dir, or Claude.
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-callocal-data-'));
const stubDir = await mkdtemp(path.join(tmpdir(), 'nova-callocal-bin-'));
const stub = path.join(stubDir, 'claude-fail');
await writeFile(stub, '#!/bin/sh\necho "usage limit reached" >&2\nexit 1\n');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;
delete process.env.ICLOUD_USERNAME;
delete process.env.ICLOUD_APP_PASSWORD;

import test from 'node:test';
import assert from 'node:assert/strict';
// Dynamic: static imports hoist above the env setup, and calendarCommand reads
// CLAUDE_BIN at load.
const { parseEventLocal } = await import('../lib/calendarLocal.js');
const { runCalendarCommand } = await import('../lib/calendarCommand.js');
const { listRecords } = await import('../lib/inboxStore.js');

// Sunday 18 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 18, 10, 0, 0);
const hm = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

test('"dentist friday 3pm" -> Fri 23 Oct 15:00-16:00', () => {
  const r = parseEventLocal('dentist friday 3pm', NOW);
  assert.equal(r.title, 'Dentist');
  assert.equal(hm(r.start), '2026-10-23 15:00');
  assert.equal(hm(r.end), '2026-10-23 16:00');
});

test('"add gym tomorrow at 6am"', () => {
  const r = parseEventLocal('add gym tomorrow at 6am', NOW);
  assert.equal(r.title, 'Gym');
  assert.equal(hm(r.start), '2026-10-19 6:00');
});

test('"lunch with Sam on the 24th at 12:30"', () => {
  const r = parseEventLocal('lunch with Sam on the 24th at 12:30', NOW);
  assert.equal(r.title, 'Lunch with Sam');
  assert.equal(hm(r.start), '2026-10-24 12:30');
});

test('"put dentist on Friday at 3" reads 3 as the afternoon', () => {
  const r = parseEventLocal('put dentist on Friday at 3', NOW);
  assert.equal(r.title, 'Dentist');
  assert.equal(hm(r.start), '2026-10-23 15:00');
});

test('durations and ranges', () => {
  const a = parseEventLocal('book haircut friday 2pm for 30 minutes', NOW);
  assert.equal(a.title, 'Haircut');
  assert.equal(hm(a.end), '2026-10-23 14:30');
  const b = parseEventLocal('workshop tomorrow 3-4pm', NOW);
  assert.equal(hm(b.start), '2026-10-19 15:00');
  assert.equal(hm(b.end), '2026-10-19 16:00');
  const c = parseEventLocal('schedule planning on 5 Nov at 10am for 2 hours', NOW);
  assert.equal(hm(c.start), '2026-11-5 10:00');
  assert.equal(hm(c.end), '2026-11-5 12:00');
  const d = parseEventLocal('call mum tomorrow at 7pm for an hour', NOW);
  assert.equal(hm(d.end), '2026-10-19 20:00');
});

test('ambiguity returns null', () => {
  assert.equal(parseEventLocal('dentist friday', NOW), null); // no time
  assert.equal(parseEventLocal('dentist at 3pm', NOW), null); // no day
  assert.equal(parseEventLocal('dentist friday 3pm or 4pm', NOW), null); // two times
  assert.equal(parseEventLocal('dentist friday saturday 3pm', NOW), null); // two days
  assert.equal(parseEventLocal('move dentist to friday 3pm', NOW), null); // an edit
  assert.equal(parseEventLocal('cancel gym tomorrow 6am', NOW), null);
  assert.equal(parseEventLocal('tomorrow 3pm', NOW), null); // no title
  assert.equal(parseEventLocal('standup today 8am', NOW), null); // already past
  assert.equal(parseEventLocal('', NOW), null);
});

test('flow: stub CLI fails, the local add is still filed on the inbox rails', async () => {
  const out = await runCalendarCommand('add gym tomorrow at 6am', null);
  assert.equal(out.proposed, true);
  assert.equal(out.record.kind, 'calendar');
  assert.equal(out.record.status, 'pending');
  assert.equal(out.record.decision.action, 'create');
  assert.equal(out.record.decision.payload.title, 'Gym');
  const stored = (await listRecords()).find((r) => r.id === out.record.id);
  assert.ok(stored);
});

test('flow: an add that cannot be read, with Claude down, gives the plain error', async () => {
  await assert.rejects(() => runCalendarCommand('dentist sometime next week'), /Nova couldn't read a time in that, and .* is switched off in Settings → Claude models\. Try 'dentist Friday 3pm'\./);
});

test('flow: move/delete with Claude down says nothing changed', async () => {
  await assert.rejects(() => runCalendarCommand('move my gym to 7am'), /Moving or deleting needs Claude, and .* is switched off in Settings → Claude models\. Nothing changed\./);
  await assert.rejects(() => runCalendarCommand('cancel dentist friday 3pm'), /Moving or deleting needs Claude/);
});
