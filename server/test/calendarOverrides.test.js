// THE "calendar never updates" regression: a single-occurrence edit of a
// recurring event (RECURRENCE-ID override) lives in node-ical's
// master.recurrences, not top-level — the old expansion never read it, so a
// moved occurrence kept rendering at the series' ORIGINAL time. Built from a
// real ICS through the real parser so the library dependency stays covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import ical from 'node-ical';
import { expandUidGroup } from '../lib/calendar.js';

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:workout@test',
  'DTSTAMP:20260701T000000Z',
  'DTSTART:20260701T073000Z',
  'DTEND:20260701T083000Z',
  'RRULE:FREQ=DAILY',
  'SUMMARY:Workout',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:workout@test',
  'DTSTAMP:20260722T000000Z',
  'RECURRENCE-ID:20260723T073000Z',
  'DTSTART:20260723T091500Z',
  'DTEND:20260723T101500Z',
  'SUMMARY:Workout',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function versionsFromICS(ics) {
  const parsed = ical.sync.parseICS(ics);
  return Object.values(parsed).filter((e) => e.type === 'VEVENT' && e.start && e.uid);
}

test('a moved occurrence renders at ITS time, once — the original slot never ghosts back', () => {
  const versions = versionsFromICS(ICS);
  const dayStart = new Date('2026-07-23T00:00:00Z');
  const dayEnd = new Date('2026-07-23T23:59:59Z');
  const events = expandUidGroup(versions, dayStart, dayEnd, 'Health');

  assert.equal(events.length, 1, 'exactly one Workout today — no duplicate at the old time');
  assert.equal(events[0].startISO, '2026-07-23T09:15:00.000Z', 'the OVERRIDE time, not the series original');
  assert.equal(events[0].recurring, true, 'an override is still part of a series (command moves stay declined)');

  // a normal day (no override) still expands from the master at the series time
  const normal = expandUidGroup(versionsFromICS(ICS), new Date('2026-07-24T00:00:00Z'), new Date('2026-07-24T23:59:59Z'), 'Health');
  assert.equal(normal.length, 1);
  assert.equal(normal[0].startISO, '2026-07-24T07:30:00.000Z');
});

test('an occurrence moved OUT of the window suppresses its old slot without appearing', () => {
  // override moves the 07-25 occurrence to 07-26 — the 25th must show NOTHING
  const moved = ICS
    .replace('RECURRENCE-ID:20260723T073000Z', 'RECURRENCE-ID:20260725T073000Z')
    .replace('DTSTART:20260723T091500Z', 'DTSTART:20260726T091500Z')
    .replace('DTEND:20260723T101500Z', 'DTEND:20260726T101500Z');
  const day25 = expandUidGroup(versionsFromICS(moved), new Date('2026-07-25T00:00:00Z'), new Date('2026-07-25T23:59:59Z'), 'Health');
  assert.equal(day25.length, 0, 'the vacated slot is empty, not a ghost of the master');
  const day26 = expandUidGroup(versionsFromICS(moved), new Date('2026-07-26T00:00:00Z'), new Date('2026-07-26T23:59:59Z'), 'Health');
  const times = day26.map((e) => e.startISO).sort();
  assert.deepEqual(times, ['2026-07-26T07:30:00.000Z', '2026-07-26T09:15:00.000Z'], "the 26th has its own occurrence plus the moved one");
});
