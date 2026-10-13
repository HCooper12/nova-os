import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseBests, prsInSession } from '../lib/trainingAnalytics.js';

const S = (date, sets, id = 'incline') => ({ date, exercises: [{ exerciseId: id, name: 'Incline', sets }] });
const sessions = [
  S('2026-09-01', [{ weight: 55, reps: 10 }]),
  S('2026-09-15', [{ weight: 60, reps: 8 }]),
  S('2026-10-01', [{ weight: 60, reps: 10 }, { weight: 65, reps: 6 }]),
];

test('the best estimate and its set, and the last sessions oldest first', () => {
  const b = exerciseBests(sessions, ['incline']).incline;
  assert.equal(b.e1rm, 80);
  assert.deepEqual(b.from, { weight: 60, reps: 10, date: '2026-10-01' });
  assert.equal(b.weight, 65);
  assert.deepEqual(b.history.map((h) => h.date), ['2026-09-01', '2026-09-15', '2026-10-01']);
});

test('a set the banner would call a record is one Save confirms', () => {
  const today = S('2026-10-13', [{ weight: 65, reps: 8 }]);
  const best = exerciseBests(sessions, ['incline']).incline.e1rm;
  const e = Math.round(65 * (1 + 8 / 30) * 10) / 10;
  assert.ok(e > best);
  const prs = prsInSession([...sessions, today], today);
  assert.ok(prs.some((p) => p.exerciseId === 'incline'), 'the server agrees at Save');
});

test('a lift never done: nothing to beat, nothing claimed', () => {
  assert.deepEqual(exerciseBests(sessions, ['new']).new, { e1rm: null, from: null, weight: null, history: [] });
});
