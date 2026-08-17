// Moving ONE occurrence of a repeating event. His request — "push my workout
// to 10:30 and push walk Tank to 12:15pm" — did nothing: both are recurring,
// and recurring moves were refused outright.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOccurrenceOverride } from '../lib/calendar.js';

const MASTER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:workout-abc123',
  'DTSTAMP:20260702T090000Z',
  'SEQUENCE:2',
  'DTSTART;TZID=Australia/Melbourne:20260702T073000',
  'DTEND;TZID=Australia/Melbourne:20260702T083000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO',
  'SUMMARY:Workout',
  'LOCATION:Gym',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

test('an override names the occurrence, keeps the series, and carries the details', () => {
  // 18 Aug 07:30 Melbourne == 2026-08-17T21:30Z; move to 10:30 local
  const out = buildOccurrenceOverride(MASTER, '2026-08-17T21:30:00Z', '2026-08-18T00:30:00Z', '2026-08-18T01:30:00Z');
  assert.match(out, /RRULE:FREQ=WEEKLY;BYDAY=MO/, 'the series survives untouched');
  const overrides = out.match(/RECURRENCE-ID[^\r\n]*/g) || [];
  assert.equal(overrides.length, 1);
  // must match the master's TIME FORM (TZID), or Apple can't tie it to the
  // series and shows the moved instance as a SECOND event — his bug
  assert.equal(overrides[0], 'RECURRENCE-ID;TZID=Australia/Melbourne:20260818T073000');
  assert.match(out, /DTSTART;TZID=Australia\/Melbourne:20260818T103000/);
  assert.match(out, /DTEND;TZID=Australia\/Melbourne:20260818T113000/);
  // and out-rank every existing SEQUENCE or the reader discards it as stale
  assert.match(out, /SEQUENCE:3/);
  assert.equal((out.match(/UID:workout-abc123/g) || []).length, 2, 'override shares the master UID');
  assert.match(out, /SUMMARY:Workout/);
  assert.match(out, /LOCATION:Gym/, 'details carry across so the moved instance is not blank');
  assert.ok(out.trimEnd().endsWith('END:VCALENDAR'), 'still a well-formed calendar');
});

test('moving the same occurrence twice replaces its override rather than stacking', () => {
  const once = buildOccurrenceOverride(MASTER, '2026-08-17T21:30:00Z', '2026-08-18T00:30:00Z', '2026-08-18T01:30:00Z');
  const twice = buildOccurrenceOverride(once, '2026-08-17T21:30:00Z', '2026-08-18T02:00:00Z', '2026-08-18T03:00:00Z');
  assert.equal((twice.match(/RECURRENCE-ID[^:]*:20260818T073000/g) || []).length, 1, 'one override, not two — no duplicate event');
  assert.match(twice, /DTSTART;TZID=Australia\/Melbourne:20260818T120000/);
  assert.doesNotMatch(twice, /20260818T103000/, 'the stale override is gone');
});

test('a different occurrence adds its own override alongside', () => {
  const one = buildOccurrenceOverride(MASTER, '2026-08-17T21:30:00Z', '2026-08-18T00:30:00Z', '2026-08-18T01:30:00Z');
  const two = buildOccurrenceOverride(one, '2026-08-24T21:30:00Z', '2026-08-25T00:30:00Z', '2026-08-25T01:30:00Z');
  assert.equal((two.match(/RECURRENCE-ID/g) || []).length, 2);
});

test('a raw without a VEVENT or UID fails loudly, never silently', () => {
  assert.throws(() => buildOccurrenceOverride('BEGIN:VCALENDAR\r\nEND:VCALENDAR', '2026-08-17T21:30:00Z', '2026-08-18T00:30:00Z', '2026-08-18T01:30:00Z'), /could not read the event/);
  const noUid = MASTER.replace(/UID:[^\r\n]*\r\n/, '');
  assert.throws(() => buildOccurrenceOverride(noUid, '2026-08-17T21:30:00Z', '2026-08-18T00:30:00Z', '2026-08-18T01:30:00Z'), /no UID/);
});
