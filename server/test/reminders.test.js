// Reminders — store round-trip, VTODO shape, decision normalization, filing
// + undo on the rails. iCloud is not exercised (no credentials in tests);
// the local path is the guaranteed one and that's what's proven here.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-remind-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-remind-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.ICLOUD_USERNAME; // force the local-only path

import test from 'node:test';
import assert from 'node:assert/strict';

const { createReminder, removeReminder, listReminders, buildVtodo, remindersContext } = await import('../lib/reminders.js');
const { normalizeDecision, fileDecision, undoFiling } = await import('../lib/inbox.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('create → list → remove round-trip; validation refuses junk', async () => {
  const when = new Date(Date.now() + 3600e3).toISOString();
  const r = await createReminder({ text: 'Call the bank', whenISO: when });
  assert.equal(r.status, 'scheduled');
  assert.equal(r.apple, null); // no credentials → local nudge only, honestly recorded
  const listed = await listReminders();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].text, 'Call the bank');
  const removed = await removeReminder(r.id);
  assert.equal(removed.id, r.id);
  assert.equal((await listReminders()).length, 0);

  await assert.rejects(() => createReminder({ text: '', whenISO: when }), /needs text/);
  await assert.rejects(() => createReminder({ text: 'x', whenISO: 'not-a-time' }), /valid time/);
});

test('buildVtodo emits a well-formed VTODO with an alarm at the due moment', () => {
  const ics = buildVtodo({ uid: 'nova-abc', text: 'Take the bins out; now', whenISO: '2026-08-07T16:00:00.000Z' });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VTODO/);
  assert.match(ics, /UID:nova-abc/);
  assert.match(ics, /DUE:20260807T160000Z/);
  assert.match(ics, /SUMMARY:Take the bins out\\; now/); // semicolons escaped per RFC 5545
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER;VALUE=DATE-TIME:20260807T160000Z/);
});

test('normalizeDecision: reminder needs text and a real future-parseable time', () => {
  const d = normalizeDecision({
    route: 'reminder', confidence: 'high', title: 'Remind: call bank', reason: 'time stated',
    payload: { text: 'Call the bank', whenISO: '2026-08-07T16:00:00' },
  });
  assert.equal(d.route, 'reminder');
  assert.equal(d.payload.text, 'Call the bank');
  assert.ok(!Number.isNaN(new Date(d.payload.whenISO).getTime()));

  assert.throws(() => normalizeDecision({ route: 'reminder', confidence: 'high', payload: { text: 'x', whenISO: 'garbage' } }), /valid reminder time/);
  assert.throws(() => normalizeDecision({ route: 'reminder', confidence: 'high', payload: { whenISO: '2026-08-07T16:00:00' } }), /no reminder text/);
});

test('filing a reminder decision schedules it; undo cancels it', async () => {
  const whenISO = new Date(Date.now() + 7200e3).toISOString();
  const decision = normalizeDecision({
    route: 'reminder', confidence: 'high', title: 'Remind: parcel', reason: 'time stated',
    payload: { text: 'Collect the parcel', whenISO },
  });
  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /Reminder — "Collect the parcel"/);
  assert.match(destination, /Nova nudge only/); // honest about the missing iCloud write
  assert.equal((await listReminders()).length, 1);
  assert.match(await remindersContext(), /Collect the parcel/);

  const note = await undoFiling(vault, undo);
  assert.match(note, /cancelled the reminder/);
  assert.equal((await listReminders()).length, 0);
});

// ---- audit [41]: late-fire honesty -----------------------------------------

test('a reminder fired on time speaks plainly; one the Mac slept through says so, with the time it was for', async () => {
  const { reminderFireText, LATE_MINUTES } = await import('../lib/reminders.js');
  const when = new Date(2026, 8, 2, 16, 0); // Wed 16:00 local
  const r = { id: 'x', text: 'call the bank', when: when.toISOString() };

  const onTime = reminderFireText(r, when.getTime() + 30e3);
  assert.equal(onTime.late, false);
  assert.equal(onTime.title, 'Reminder — Nova');
  assert.equal(onTime.telegram, '⏰ call the bank');

  const justUnder = reminderFireText(r, when.getTime() + (LATE_MINUTES - 1) * 60e3);
  assert.equal(justUnder.late, false, 'inside the grace it is still the live nudge');

  const sameDayLate = reminderFireText(r, when.getTime() + (LATE_MINUTES + 5) * 60e3);
  assert.equal(sameDayLate.late, true);
  assert.equal(sameDayLate.title, 'Missed reminder — Nova');
  assert.equal(sameDayLate.body, 'From 16:00, missed while the Mac slept: call the bank');
  assert.equal(sameDayLate.telegram, '⏰ from 16:00, missed while the Mac slept: call the bank');

  const nextDay = reminderFireText(r, new Date(2026, 8, 3, 8, 0).getTime());
  assert.match(nextDay.body, /^From Wed 16:00, missed while the Mac slept: call the bank$/, 'a different day names the day');
});
