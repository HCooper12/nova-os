// The Daily review's client schedule and demo day (mockup 96).
//   node --test src/reviewDemo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, replay, shiftISO, demoReviewToday, demoDrawn } from './reviewDemo.js';

test('nextStep matches the server table', () => {
  assert.equal(nextStep(0, 'got'), 1);
  assert.equal(nextStep(2, 'fuzzy'), 2);
  assert.equal(nextStep(4, 'forgot'), 0);
  assert.equal(nextStep(6, 'got'), 6);
  assert.equal(nextStep(1, 'read'), 2);
});

test('replay ends on the step and due date the server would write', () => {
  assert.deepEqual(replay([{ date: '2026-10-07', grade: 'fuzzy' }, { date: '2026-10-08', grade: 'got' }]), { step: 1, due: '2026-10-11' });
  assert.deepEqual(replay([]), { step: 0, due: null });
});

test('the demo day is three pages due today, covering source+time, source only, no source', () => {
  const day = demoReviewToday({ today: '2026-10-11' });
  assert.equal(day.total, 3);
  assert.equal(day.doneCount, 0);
  const [a, b, c] = day.items;
  assert.ok(a.source.time && b.source && !b.source.time && c.source === null);
  for (const i of day.items) {
    assert.equal(i.answered, false);
    assert.ok(i.connected.length >= 2 && i.connected.length <= 4);
    assert.ok(i.demo);
  }
  assert.equal(c.kind, 'new');
});

test('answering in the demo really moves the page and the day really ends', () => {
  const day = demoReviewToday({ today: '2026-10-11', answers: { 'demo-effort-debt': 'got', 'demo-two-minute-floor': 'fuzzy', 'demo-quiet-hours': 'forgot' } });
  assert.equal(day.doneCount, 3);
  assert.equal(day.items[0].due, shiftISO('2026-10-11', 7));
  assert.equal(day.items[2].due, '2026-10-12');
});

test('nothing due is an empty day with a next date', () => {
  const day = demoReviewToday({ today: '2026-10-11', scenario: 'nothing-due' });
  assert.equal(day.total, 0);
  assert.equal(day.nextDue.date, '2026-10-13');
  assert.equal(demoDrawn('2026-10-11').kind, 'new');
});
