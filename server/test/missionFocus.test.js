// Mission Control's two new judgements, pinned — which thing is THE thing,
// and whether this morning earns a record moment. Both are small rules that
// are easy to get subtly wrong and impossible to notice from a screenshot:
// a finished item promoted as if unfinished, or a PR celebrated twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOneThing, prMomentFor, ringState } from '../../src/missionFocus.js';

// ---- C2: the one thing ----

test('the one thing is the first priority he has not settled', () => {
  const r = pickOneThing([{ text: 'a', outcome: 'done' }, { text: 'b' }, { text: 'c' }]);
  assert.equal(r.index, 1);
  assert.equal(r.priority.text, 'b');
});

test('a skipped item is settled too — the next open one is the day', () => {
  const r = pickOneThing([{ text: 'a', outcome: 'skipped' }, { text: 'b', outcome: 'done' }, { text: 'c' }]);
  assert.equal(r.priority.text, 'c');
});

test('when everything is settled there is no one thing, not a stale one', () => {
  // promoting a finished item to look like the day's task would be a lie
  assert.equal(pickOneThing([{ text: 'a', outcome: 'done' }, { text: 'b', outcome: 'skipped' }]), null);
  assert.equal(pickOneThing([]), null);
  assert.equal(pickOneThing(undefined), null);
});

// ---- C3: the record moment ----

const PRS = [
  { name: 'Cable Lateral Raise', kind: 'e1rm', value: 11.2, date: '2026-09-03' },
  { name: 'Carter Extension', kind: 'e1rm', value: 14.3, date: '2026-09-03' },
  { name: 'Old PR', kind: 'e1rm', value: 100, date: '2026-08-20' },
];

test('the morning after a PR earns a moment, and only yesterday\'s PRs are in it', () => {
  const m = prMomentFor(PRS, null, '2026-09-04');
  assert.equal(m.date, '2026-09-03');
  assert.deepEqual(m.prs.map((p) => p.name), ['Cable Lateral Raise', 'Carter Extension'], 'the week-old PR is history, not a moment');
});

test('once shown, the same PRs never show again', () => {
  assert.equal(prMomentFor(PRS, '2026-09-03', '2026-09-04'), null);
});

test('a PR from today outranks yesterday\'s, so the newest lift is the one celebrated', () => {
  const both = [...PRS, { name: 'Today', kind: 'e1rm', value: 50, date: '2026-09-04' }];
  const m = prMomentFor(both, null, '2026-09-04');
  assert.equal(m.date, '2026-09-04');
  assert.deepEqual(m.prs.map((p) => p.name), ['Today']);
});

test('two days later it is over — no moment for a PR from the day before yesterday', () => {
  assert.equal(prMomentFor(PRS, null, '2026-09-05'), null);
});

test('no PRs, no date, or PRs without dates: no moment', () => {
  assert.equal(prMomentFor([], null, '2026-09-04'), null);
  assert.equal(prMomentFor(PRS, null, undefined), null);
  assert.equal(prMomentFor([{ name: 'x', value: 1 }], null, '2026-09-04'), null);
});

test('the month boundary is handled — 1 Sep\'s morning sees 31 Aug\'s PR', () => {
  const m = prMomentFor([{ name: 'x', value: 1, date: '2026-08-31' }], null, '2026-09-01');
  assert.equal(m?.date, '2026-08-31');
});

// ---- B1: colour is the verdict ----

test('ring state follows the percentage, and a dash is absent — never a zero', () => {
  assert.equal(ringState({ value: '146', pct: 97 }), 'good');
  assert.equal(ringState({ value: '74', pct: 49 }), 'missed');
  assert.equal(ringState({ value: '101', pct: 67 }), 'behind');
  assert.equal(ringState({ value: '—', pct: 0 }), 'absent', 'the em-dash means not reported');
  assert.equal(ringState(null), 'absent');
  assert.equal(ringState({ value: '7:12', pct: 'n/a' }), 'absent', 'an unreadable percentage is a hole, not a failure');
});

test('the thresholds are adjustable per metric', () => {
  assert.equal(ringState({ value: '80', pct: 80 }, { goodFrom: 75 }), 'good');
  assert.equal(ringState({ value: '80', pct: 80 }, { goodFrom: 90, behindFrom: 85 }), 'missed');
});
