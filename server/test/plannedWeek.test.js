// The planned week behind "Hard sets this week" (lib/plannedWeek.js): every
// exercise the program schedules, per muscle, per day, with what is done.
// The load-bearing promise is that it ADDS UP to the bars on the card, so a
// real week's mess (a swap, a lift pulled forward, a makeup day, the session
// in progress) has to land somewhere visible and exactly once.
process.env.TZ = 'Australia/Sydney'; // his week, not the runner's

import test from 'node:test';
import assert from 'node:assert/strict';

const { plannedWeek } = await import('../lib/plannedWeek.js');
const { weeklyMuscleVolume, mondayOf } = await import('../lib/trainingAnalytics.js');

const EXERCISES = [
  { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' },
  { id: 'wpu', name: 'Weighted Pull-Up', muscleGroup: 'Back' },
  { id: 'pullup', name: 'Pull ups', muscleGroup: 'Back' },
  { id: 'pulldown', name: 'Lat Pulldown', muscleGroup: 'Back' },
  { id: 'curl', name: 'Spider Curl', muscleGroup: 'Biceps' },
  { id: 'carter', name: 'Carter Extension', muscleGroup: 'Triceps' },
  { id: 'hips', name: '90/90 Hip Switch', muscleGroup: 'Mobility' },
];
const lib = new Map(EXERCISES.map((e) => [e.id, e]));
const slot = (id, targetSets = 3) => ({ exerciseId: id, name: lib.get(id).name, muscleGroup: lib.get(id).muscleGroup, targetSets, targetRepsLow: 8, targetRepsHigh: 10, trackingType: 'weight_reps' });
const ROUTINES = [
  { id: 'push', name: 'Push', exercises: [slot('bench'), slot('carter'), slot('hips')] },
  { id: 'pull', name: 'Pull', exercises: [slot('wpu'), slot('curl')] },
  { id: 'upper', name: 'Upper Body', exercises: [slot('bench'), slot('pulldown'), slot('carter')] },
];
const SCHEDULE = { monday: 'push', wednesday: 'pull', thursday: 'active-rest', friday: 'upper' };
const FRIDAY = new Date('2026-09-25T10:00:00'); // the week of Monday 21 Sep
const targetOf = (m) => ({ target: m === 'Biceps' ? 12 : 10, goalMuscle: m === 'Biceps' });
const working = (n) => Array.from({ length: n }, () => ({ weight: 40, reps: 8 }));
const sess = (date, routineId, exercises) => ({ date, routineId, exercises: exercises.map(([exerciseId, sets]) => ({ exerciseId, sets })) });

const run = (sessions, live = null) => plannedWeek({ routines: ROUTINES, schedule: SCHEDULE, sessions, live, exercises: EXERCISES, targetOf, now: FRIDAY });
const muscle = (w, m) => w.muscles.find((x) => x.muscle === m);

test('the week runs Monday to Sunday, marks today, and a day with no routine is rest', () => {
  const w = run([]);
  assert.equal(w.start, '2026-09-21');
  assert.deepEqual(w.days.map((d) => d.date), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  assert.deepEqual(w.days.map((d) => d.routineName), ['Push', null, 'Pull', null, 'Upper Body', null, null]);
  assert.equal(w.days[3].rest, true, "'active-rest' is rest, not a routine");
  assert.equal(w.days[4].isToday, true);
  assert.deepEqual(w.days.map((d) => d.isPast), [true, true, true, true, false, false, false]);
});

test('every scheduled exercise appears under its muscle on its day; mobility never counts as volume', () => {
  const w = run([]);
  assert.deepEqual(muscle(w, 'Chest').exercises.map((e) => [e.day, e.routineName, e.planned]), [['monday', 'Push', 3], ['friday', 'Upper Body', 3]]);
  assert.equal(muscle(w, 'Chest').planned, 6);
  assert.equal(muscle(w, 'Back').planned, 6, 'weighted pull-up Wednesday + pulldown Friday');
  assert.equal(w.muscles.some((m) => m.muscle === 'Mobility'), false);
  assert.deepEqual(w.muscles.map((m) => m.muscle), ['Chest', 'Back', 'Biceps', 'Triceps'], "the library's body order, not a sort by numbers");
});

test('a lift in two routines is credited to the session it was done in', () => {
  const w = run([sess('2026-09-21', 'push', [['carter', working(3)]])]);
  const [mon, fri] = muscle(w, 'Triceps').exercises;
  assert.deepEqual([mon.day, mon.done, fri.day, fri.done], ['monday', 3, 'friday', 0]);
});

test('a swap is shown as "not in the plan", a lift pulled forward fills its own slot early', () => {
  const w = run([sess('2026-09-23', 'pull', [['pullup', working(3)], ['pulldown', working(3)], ['curl', working(3)]])]);
  const back = muscle(w, 'Back');
  const wpu = back.exercises.find((e) => e.exerciseId === 'wpu');
  const pulldown = back.exercises.find((e) => e.exerciseId === 'pulldown');
  assert.equal(wpu.done, 0, 'pull-ups are not weighted pull-ups');
  assert.deepEqual([pulldown.day, pulldown.done, pulldown.doneOn], ['friday', 3, ['wednesday']]);
  assert.deepEqual(back.extras.map((e) => [e.name, e.done, e.doneOn, e.byDay]), [['Pull ups', 3, ['wednesday'], { wednesday: 3 }]]);
  assert.equal(back.done, 6);
});

test('a makeup session (no routine of its own) fills the slot with room, earliest first', () => {
  const w = run([sess('2026-09-22', 'carryover', [['bench', working(3)]])]);
  const [mon, fri] = muscle(w, 'Chest').exercises;
  assert.deepEqual([mon.done, mon.doneOn, fri.done], [3, ['tuesday'], 0]);
});

test('extra sets stay where they were done rather than pretending a later day is finished', () => {
  const w = run([sess('2026-09-21', 'push', [['bench', working(6)]])]);
  const [mon, fri] = muscle(w, 'Chest').exercises;
  assert.deepEqual([mon.done, mon.planned, fri.done], [6, 3, 0]);
});

test('last week, warm-ups and empty sets never count', () => {
  const w = run([
    sess('2026-09-20', 'upper', [['bench', working(3)]]), // Sunday: last week
    sess('2026-09-21', 'push', [['bench', [...working(2), { weight: 20, reps: 10, setType: 'warmup' }, { weight: 0, reps: 0 }]]]),
  ]);
  assert.equal(muscle(w, 'Chest').done, 2);
});

test('the session in progress counts its ticked working sets only, and says which are live', () => {
  const live = { routineId: 'upper', exercises: [{ exerciseId: 'pulldown', sets: [{ weight: 50, reps: 8, done: true }, { weight: 50, reps: 8, done: true }, { weight: 50, reps: 8 }, { weight: 30, reps: 8, done: true, setType: 'warmup' }] }] };
  const w = run([], live);
  const pulldown = muscle(w, 'Back').exercises.find((e) => e.exerciseId === 'pulldown');
  assert.deepEqual([pulldown.done, pulldown.live, pulldown.doneOn], [2, 2, ['friday']]);
  assert.equal(muscle(w, 'Back').live, 2);
});

test('a goal muscle the plan never trains still appears, planned at zero', () => {
  const w = plannedWeek({ routines: ROUTINES, schedule: { monday: 'push' }, sessions: [], exercises: EXERCISES, targetOf, now: FRIDAY });
  const biceps = muscle(w, 'Biceps');
  assert.deepEqual([biceps.planned, biceps.done, biceps.target, biceps.goalMuscle, biceps.exercises.length], [0, 0, 12, true, 0]);
});

test("every muscle's done count equals its bar on the card", () => {
  const sessions = [
    sess('2026-09-21', 'push', [['bench', working(3)], ['carter', working(3)], ['wpu', working(3)]]),
    sess('2026-09-22', 'carryover', [['bench', working(2)], ['hips', working(3)]]),
    sess('2026-09-23', 'pull', [['pullup', working(3)], ['pulldown', working(3)], ['curl', working(4)]]),
    sess('2026-09-14', 'push', [['bench', working(5)]]), // the week before
  ];
  const w = run(sessions);
  const bars = weeklyMuscleVolume(sessions, EXERCISES, { weeks: 6 }).find((x) => x.week === mondayOf(FRIDAY)).groups;
  for (const [m, sets] of Object.entries(bars)) assert.equal(muscle(w, m)?.done, sets, `${m}: breakdown ${muscle(w, m)?.done} vs bar ${sets}`);
  const counted = w.muscles.reduce((n, m) => n + m.done, 0);
  assert.equal(counted, Object.values(bars).reduce((a, b) => a + b, 0), 'nothing counted twice, nothing dropped');
});
