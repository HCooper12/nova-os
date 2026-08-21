// "When does hard sets this week update, and is it accurate?" — his two
// questions, mid-workout. The week must run Monday→Sunday, and the session
// he is IN must count toward it as he ticks, not only when he finishes.
process.env.TZ = 'Australia/Sydney'; // his week, not the runner's

import test from 'node:test';
import assert from 'node:assert/strict';

const { weeklyMuscleVolume } = await import('../lib/trainingAnalytics.js');

const EXERCISES = [
  { id: 'row', muscleGroup: 'Back' },
  { id: 'curl', muscleGroup: 'Biceps' },
  { id: 'stretch', muscleGroup: 'Mobility' },
];
const sess = (date, exerciseId, sets) => ({ date, exercises: [{ exerciseId, sets }] });
const working = (n) => Array.from({ length: n }, () => ({ weight: 40, reps: 10 }));

test('the week runs Monday to Sunday — Sunday belongs to the week that started six days earlier', () => {
  // 2026-08-17 is a Monday; 2026-08-23 is the Sunday that closes that week.
  const out = weeklyMuscleVolume([
    sess('2026-08-17', 'row', working(3)),   // Monday
    sess('2026-08-23', 'row', working(2)),   // Sunday — same week
    sess('2026-08-24', 'row', working(5)),   // the NEXT Monday — a new week
  ], EXERCISES);
  const byWeek = Object.fromEntries(out.map((w) => [w.week, w.groups]));
  assert.deepEqual(byWeek['2026-08-17'], { Back: 5 }, 'Monday and Sunday land in one week');
  assert.deepEqual(byWeek['2026-08-24'], { Back: 5 }, 'the next Monday starts a new one');
});

test('warm-ups and empty sets never inflate the count; mobility never counts as volume', () => {
  const out = weeklyMuscleVolume([{
    date: '2026-08-19',
    exercises: [
      { exerciseId: 'row', sets: [...working(2), { weight: 20, reps: 10, setType: 'warmup' }, { weight: 0, reps: 0 }] },
      { exerciseId: 'stretch', sets: working(4) },
    ],
  }], EXERCISES);
  assert.deepEqual(out[0].groups, { Back: 2 }, 'two working sets — not four');
});

test('a bodyweight set with reps but no load still counts', () => {
  const out = weeklyMuscleVolume([sess('2026-08-19', 'curl', [{ weight: 0, reps: 12 }])], EXERCISES);
  assert.deepEqual(out[0].groups, { Biceps: 1 });
});

// The live merge is the part he asked for: it happens in trainOverview, where
// the mirrored draft is folded in. This pins the RULE it applies.
test('only TICKED, non-warm-up sets from the live draft should count', () => {
  const draftExercises = [{
    exerciseId: 'row',
    sets: [
      { weight: 40, reps: 10, done: true },
      { weight: 40, reps: 10, done: true },
      { weight: 40, reps: 10 },                          // typed but not ticked yet
      { weight: 20, reps: 10, done: true, setType: 'warmup' }, // ticked warm-up
      { weight: 0, reps: 0, done: true },                 // ticked but empty
    ],
  }];
  const counted = draftExercises.flatMap((ex) => (ex.sets || []).filter(
    (x) => x.done && x.setType !== 'warmup' && (Number(x.weight) > 0 || Number(x.reps) > 0),
  ));
  assert.equal(counted.length, 2, 'the two real ticked working sets, and nothing else');
});
