// The same event, showing twice.
//
// 4 Sep: his calendar carried both "Virgin Australia flight 825 to Sydney" and
// "Flight: VA 825 from MEL to SYD" at 08:50-10:15 — the airline's entry and
// Apple's detected copy of one booking. Nova showed both and counted both.
//
// The rule under test is the CONSERVATIVE half. Hiding a real event is far
// worse than showing a duplicate, so overlap alone must never collapse
// anything: back-to-back meetings, a workout inside a gym booking, and two
// genuinely different things at the same hour all have to survive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sameEventTwice, dedupeEvents } from '../lib/calendar.js';

const at = (label, start = '2026-09-04T08:50:00.000Z', end = '2026-09-04T10:15:00.000Z') =>
  ({ label, startISO: start, endISO: end });

test('the real case: the airline entry and Apple\'s detected copy collapse', () => {
  const a = at('Virgin Australia flight 825 to Sydney');
  const b = at('Flight: VA 825 from MEL to SYD');
  assert.equal(sameEventTwice(a, b), true);
  const kept = dedupeEvents([a, b]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].label, 'Virgin Australia flight 825 to Sydney', 'the fuller title survives');
});

test('identical titles collapse regardless of punctuation', () => {
  assert.equal(sameEventTwice(at('Work 💰'), at('Work💰')), true);
  assert.equal(sameEventTwice(at('Get ready'), at('Get Ready')), true);
});

test('different events in the same slot BOTH survive', () => {
  // the whole risk of this feature, pinned
  assert.equal(sameEventTwice(at('Dentist'), at('Standup')), false);
  assert.equal(sameEventTwice(at('Walk Tank 🐶🐾'), at('Work 💰')), false);
  assert.equal(dedupeEvents([at('Dentist'), at('Standup')]).length, 2);
});

test('a short title inside a longer one is not enough', () => {
  // "Gym" appears inside "Gym session with Dan" — different events
  assert.equal(sameEventTwice(at('Gym'), at('Gym session with Dan')), false);
  assert.equal(sameEventTwice(at('Call'), at('Call with the bank about the mortgage')), false);
});

test('a substantial contained title does collapse', () => {
  assert.equal(sameEventTwice(at('Nanna and Pa anniversary'), at("Nanna and Pa anniversary ❤️ — remember to call")), true);
});

test('same title at a different time is a different event', () => {
  const a = at('Get ready', '2026-09-04T04:30:00.000Z', '2026-09-04T05:00:00.000Z');
  const b = at('Get ready', '2026-09-05T04:30:00.000Z', '2026-09-05T05:00:00.000Z');
  assert.equal(sameEventTwice(a, b), false);
  assert.equal(dedupeEvents([a, b]).length, 2, 'a daily recurring event must keep every occurrence');
});

test('overlapping but not identical slots both survive', () => {
  const a = at('Flight VA 825', '2026-09-04T08:50:00.000Z', '2026-09-04T10:15:00.000Z');
  const b = at('Flight VA 825', '2026-09-04T08:50:00.000Z', '2026-09-04T11:00:00.000Z');
  assert.equal(sameEventTwice(a, b), false, 'a different end time may be a genuine change, not a copy');
});

test('flight numbers match across formatting', () => {
  assert.equal(sameEventTwice(at('QF1 to London'), at('Flight: QF 1 from SIN to LHR')), true);
  assert.equal(sameEventTwice(at('VA 825 to Sydney'), at('VA 826 to Sydney')), false, 'a different flight is a different event');
});

test('an empty or missing title never collapses anything', () => {
  assert.equal(sameEventTwice(at(''), at('Dentist')), false);
  assert.equal(sameEventTwice(at(null), at(null)), false);
});
