import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWidgetToday } from '../lib/widgetToday.js';

const now = new Date(2026, 9, 14, 12, 41);
const targets = { protein: { value: 150 }, kcal: { value: 2200 }, steps: { value: 10000 } };
const days = [
  { date: '2026-10-07', hrv: 60 }, { date: '2026-10-08', hrv: 70 }, { date: '2026-10-09', hrv: 56 },
  { date: '2026-10-10', hrv: 80 }, { date: '2026-10-13', hrv: 66, steps: 9908 },
  { date: '2026-10-14', hrv: 83, steps: 979 },
];

test('the widget day carries his numbers against his own goals', () => {
  const w = composeWidgetToday({ now, targets, food: { p: 11.4, kcal: 182.2 }, healthDays: days, session: 'Pull' });
  assert.equal(w.date, '2026-10-14');
  assert.deepEqual(w.protein, { value: 11, goal: 150 });
  assert.deepEqual(w.kcal, { value: 182, goal: 2200 });
  assert.deepEqual(w.steps, { value: 979, goal: 10000 });
  assert.equal(w.hrv.value, 83);
  assert.equal(w.hrv.date, '2026-10-14');
  assert.equal(w.hrv.lo, 56);
  assert.equal(w.hrv.hi, 80);
  assert.equal(w.session, 'Pull');
});

test('missing data is null, never zero', () => {
  const w = composeWidgetToday({ now, targets: {}, food: null, healthDays: [] });
  assert.equal(w.protein.value, null);
  assert.equal(w.protein.goal, null);
  assert.equal(w.steps.value, null);
  assert.equal(w.hrv, null);
});

test("yesterday's steps never pose as today's", () => {
  const w = composeWidgetToday({ now, targets, food: { p: 0, kcal: 0 }, healthDays: days.slice(0, 5) });
  assert.equal(w.steps.value, null);
  assert.equal(w.hrv.date, '2026-10-13');
});
