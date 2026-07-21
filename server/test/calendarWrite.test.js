// The pure iCal builder behind confirm-first calendar writes. (The CalDAV
// transport and the model interpreter are exercised live on approval, not here.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventICal } from '../lib/calendar.js';

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
