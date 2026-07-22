// The pure iCal builder behind confirm-first calendar writes. (The CalDAV
// transport and the model interpreter are exercised live on approval, not here.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventICal, rewriteEventTimes } from '../lib/calendar.js';

test('builds a valid VEVENT with UTC times and CRLF lines', () => {
  const ics = buildEventICal({
    uid: 'abc@novaos',
    title: 'Dentist',
    start: new Date('2026-07-25T14:00:00Z'),
    end: new Date('2026-07-25T15:00:00Z'),
    notes: 'bring card',
    stamp: new Date('2026-07-22T09:00:00Z'),
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /UID:abc@novaos/);
  assert.match(ics, /DTSTART:20260725T140000Z/);
  assert.match(ics, /DTEND:20260725T150000Z/);
  assert.match(ics, /DTSTAMP:20260722T090000Z/);
  assert.match(ics, /SUMMARY:Dentist/);
  assert.match(ics, /DESCRIPTION:bring card/);
  assert.match(ics, /END:VEVENT\r\nEND:VCALENDAR$/);
  assert.ok(ics.includes('\r\n'), 'CRLF line endings');
});

test('escapes commas/semicolons/newlines and omits an empty description', () => {
  const ics = buildEventICal({
    uid: 'u',
    title: 'Lunch; with A, B',
    start: new Date('2026-07-25T12:00:00Z'),
    end: new Date('2026-07-25T13:00:00Z'),
  });
  assert.match(ics, /SUMMARY:Lunch\\; with A\\, B/);
  assert.ok(!ics.includes('DESCRIPTION:'), 'no empty DESCRIPTION line when notes are absent');
});

test('accepts ISO strings as well as Date objects for start/end', () => {
  const ics = buildEventICal({ uid: 'u', title: 'X', start: '2026-08-01T06:30:00Z', end: '2026-08-01T07:30:00Z' });
  assert.match(ics, /DTSTART:20260801T063000Z/);
  assert.match(ics, /DTEND:20260801T073000Z/);
});

test('rewriteEventTimes moves an event to new UTC times, bumps SEQUENCE, keeps the rest', () => {
  const raw = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:abc@x',
    'DTSTAMP:20260101T000000Z',
    'DTSTART;TZID=Australia/Sydney:20260722T140000',
    'DTEND;TZID=Australia/Sydney:20260722T150000',
    'SUMMARY:Dentist', 'LOCATION:Clinic', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const out = rewriteEventTimes(raw, new Date('2026-07-23T04:00:00Z'), new Date('2026-07-23T05:00:00Z'));
  assert.match(out, /DTSTART:20260723T040000Z/);
  assert.match(out, /DTEND:20260723T050000Z/);
  assert.ok(!out.includes('TZID=Australia'), 'the old tz-based time lines are replaced');
  assert.match(out, /SUMMARY:Dentist/, 'other properties preserved');
  assert.match(out, /LOCATION:Clinic/);
  assert.match(out, /SEQUENCE:1/, 'sequence stamped for the update');

  const again = rewriteEventTimes(out, new Date('2026-07-24T04:00:00Z'), new Date('2026-07-24T05:00:00Z'));
  assert.match(again, /SEQUENCE:2/, 'sequence bumps on a second move');
});
