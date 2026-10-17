import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseRecency } from '../lib/exerciseRecency.js';

test('latest date wins whatever the order, warm-ups and empty sets ignored', () => {
  const r = exerciseRecency([
    { date: '2026-10-01', exercises: [{ exerciseId: 'bench', sets: [{ weight: 70, reps: 8 }] }] },
    { date: '2026-10-16', exercises: [
      { exerciseId: 'bench', sets: [{ weight: 100, reps: 3, setType: 'warmup' }, { weight: 80, reps: 6 }] },
      { exerciseId: 'row', sets: [{ weight: 50, reps: 0 }] },
    ] },
    { date: '2026-10-09', exercises: [{ exerciseId: 'bench', sets: [{ weight: 90, reps: 5 }] }] },
  ]);
  assert.deepEqual(r.bench, { lastDate: '2026-10-16', lastTopKg: 80 });
  assert.equal(r.row, undefined);
});

test('bodyweight work has a date but no kg', () => {
  const r = exerciseRecency([{ date: '2026-10-10', exercises: [{ exerciseId: 'pullup', sets: [{ weight: 0, reps: 10 }] }] }]);
  assert.deepEqual(r.pullup, { lastDate: '2026-10-10', lastTopKg: null });
});
