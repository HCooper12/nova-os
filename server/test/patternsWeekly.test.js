// THE WEEKLY RUN. His confirmation, 22 Sep, of the surface: Sunday evening,
// over Telegram, with Ops as the reference page.
//
// The cadence is the argument. Correlations move at the speed of n — one more
// day against 31 changes r in the third decimal — so a daily card would show
// him an identical number 365 times a year. He already has the receipt for
// what that does: 154 records made in a month, 9 filed. These pin the two
// things that keep this from becoming the 155th: it runs weekly, and it says
// nothing when there is nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueNow, buildMessage, runWeeklyPatterns, RUN_WEEKDAY, RUN_HOUR } from '../lib/patternsWeekly.js';

const sunday = (h, d = 20) => new Date(2026, 8, d, h, 0);   // 20 Sep 2026 is a Sunday

test('it runs on a Sunday evening and at no other time', () => {
  assert.equal(new Date(2026, 8, 20).getDay(), RUN_WEEKDAY, 'the fixture is not a Sunday');
  assert.equal(dueNow(sunday(RUN_HOUR), null), true);
  assert.equal(dueNow(sunday(RUN_HOUR - 1), null), false, 'it ran before the evening');
  assert.equal(dueNow(new Date(2026, 8, 21, 20), null), false, 'it ran on a Monday');
  assert.equal(dueNow(new Date(2026, 8, 19, 20), null), false, 'it ran on a Saturday');
});

test('ONCE a week, not every hour of Sunday evening', () => {
  // the scheduler ticks hourly; without this he gets the same message five
  // times between six and eleven
  const at18 = sunday(18).toISOString();
  assert.equal(dueNow(sunday(19), at18), false);
  assert.equal(dueNow(sunday(23), at18), false);
  // ...and next Sunday it runs again
  assert.equal(dueNow(new Date(2026, 8, 27, 18), at18), true);
  // a corrupt stamp does not wedge it shut forever
  assert.equal(dueNow(sunday(18), 'not a date'), true);
});

test('A QUIET WEEK SENDS NOTHING AT ALL', () => {
  // the expected result most weeks, and the reason this can live on Telegram
  assert.equal(buildMessage({ tested: 7, findings: [], watching: [] }), null);
  assert.equal(buildMessage(null), null);
});

test('the message carries the count and the caveat, always', () => {
  const m = buildMessage({
    tested: 7,
    findings: [{ sentence: 'A tracks with B. 40 days of overlap, r=0.61. Not a cause.' }],
    watching: [],
  });
  assert.match(m, /7 pairs tested/);
  assert.match(m, /Correlation, not cause/i);
  assert.match(m, /40 days of overlap/);
});

test('a watch-list-only week still says something, clearly labelled', () => {
  const m = buildMessage({
    tested: 7, findings: [],
    watching: [{ sentence: 'NOT ESTABLISHED — X may lean with Y.' }],
  });
  assert.match(m, /Not established yet/i);
  assert.match(m, /NOT ESTABLISHED/);
  assert.doesNotMatch(m, /^• [^N]/m, 'an unestablished item is being listed as a finding');
});

test('THE RUN IS RECORDED EVEN WHEN NOTHING IS SENT', async () => {
  // Ops must be able to show a quiet week as a quiet week, not as a run that
  // never happened — "no patterns" and "nothing ran" are different facts
  let saved = null;
  const out = await runWeeklyPatterns(new Date(2026, 8, 20, 18), {
    find: async () => ({ tested: 7, findings: [], watching: [], coverage: [], skipped: [] }),
    send: async () => { throw new Error('must not send'); },
    configured: () => true,
    save: async (r) => { saved = r; },
  });
  assert.equal(out.sent, false);
  assert.ok(saved, 'a quiet week left no receipt');
  assert.equal(saved.messaged, false);
  assert.equal(saved.tested, 7);
  assert.ok(saved.at);
});

test('it sends when something held, and records that it did', async () => {
  const sent = [];
  let saved = null;
  const out = await runWeeklyPatterns(new Date(2026, 8, 20, 18), {
    find: async () => ({
      tested: 7, coverage: [], skipped: [],
      findings: [{ sentence: 'A tracks with B. 40 days of overlap, r=0.61. Not a cause.' }],
      watching: [],
    }),
    send: async (t) => { sent.push(t); },
    configured: () => true,
    save: async (r) => { saved = r; },
  });
  assert.equal(out.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(saved.messaged, true);
  assert.equal(saved.findings.length, 1);
});

test('no Telegram is not a crash, and the run is still recorded', async () => {
  let saved = null;
  const out = await runWeeklyPatterns(new Date(2026, 8, 20, 18), {
    find: async () => ({ tested: 7, coverage: [], skipped: [], findings: [{ sentence: 'x' }], watching: [] }),
    send: async () => { throw new Error('must not send'); },
    configured: () => false,
    save: async (r) => { saved = r; },
  });
  assert.equal(out.sent, false);
  assert.match(out.why, /not configured/);
  assert.ok(saved, 'the run vanished because Telegram was off');
});
