// The sheet behind "Hard sets this week" (src/weekSets.js): the sentence at
// its top and the state of every set pip. Built from plannedWeek's real
// output so the two ends of the contract are tested together.
process.env.TZ = 'Australia/Sydney';

import test from 'node:test';
import assert from 'node:assert/strict';

const { plannedWeek } = await import('../lib/plannedWeek.js');
const { weekSetsView, slotPips } = await import('../../src/weekSets.js');

const EXERCISES = [
  { id: 'lateral', name: 'Cable Lateral Raise', muscleGroup: 'Shoulders' },
  { id: 'facepull', name: 'Face Pull', muscleGroup: 'Shoulders' },
  { id: 'curl', name: 'Spider Curl', muscleGroup: 'Biceps' },
  { id: 'pullup', name: 'Pull ups', muscleGroup: 'Back' },
  { id: 'hang', name: 'Dead Hang', muscleGroup: 'Forearms' },
  { id: 'squat', name: 'Hack Squat', muscleGroup: 'Quads' },
];
const lib = new Map(EXERCISES.map((e) => [e.id, e]));
const slot = (id, extra = {}) => ({ exerciseId: id, name: lib.get(id).name, muscleGroup: lib.get(id).muscleGroup, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10, trackingType: 'weight_reps', ...extra });
const ROUTINES = [
  { id: 'push', name: 'Push', exercises: [slot('lateral'), slot('facepull')] },
  { id: 'pull', name: 'Pull', exercises: [slot('curl'), slot('hang', { targetRepsLow: 20, targetRepsHigh: 30, trackingType: 'bodyweight_time' })] },
  { id: 'upper', name: 'Upper Body', exercises: [slot('lateral'), slot('curl')] },
  { id: 'legs', name: 'Leg Day', exercises: [slot('squat')] },
];
const SCHEDULE = { monday: 'push', wednesday: 'pull', friday: 'upper', saturday: 'legs', sunday: 'active-rest' };
const FRIDAY = new Date('2026-09-25T10:00:00');
const GOALS = new Set(['Shoulders', 'Biceps']);
const targetOf = (m) => ({ target: GOALS.has(m) ? 12 : 10, goalMuscle: GOALS.has(m) });
const working = (n) => Array.from({ length: n }, () => ({ weight: 20, reps: 8 }));
const SESSIONS = [
  { date: '2026-09-21', routineId: 'push', exercises: [{ exerciseId: 'lateral', sets: working(3) }] }, // face pulls not done
  { date: '2026-09-23', routineId: 'pull', exercises: [{ exerciseId: 'curl', sets: working(3) }, { exerciseId: 'pullup', sets: working(3) }] },
];
const view = (sessions = SESSIONS, live = null) => weekSetsView(plannedWeek({ routines: ROUTINES, schedule: SCHEDULE, sessions, live, exercises: EXERCISES, targetOf, now: FRIDAY }));
const muscle = (v, m) => v.muscles.find((x) => x.muscle === m);

test('a set is done, live, still to come, or missed once its day has passed', () => {
  assert.deepEqual(slotPips({ planned: 3, done: 1, live: 0 }, { isPast: false }), ['done', 'due', 'due']);
  assert.deepEqual(slotPips({ planned: 3, done: 1, live: 0 }, { isPast: true }), ['done', 'missed', 'missed']);
  assert.deepEqual(slotPips({ planned: 3, done: 2, live: 1 }, { isPast: false }), ['done', 'live', 'due']);
  assert.deepEqual(slotPips({ planned: 3, done: 5, live: 0 }, { isPast: true }), ['done', 'done', 'done', 'done', 'done'], 'sets beyond the plan are still drawn');
});

test('the headline counts the week and names what is still to come, the way he would say it', () => {
  const v = view();
  assert.equal(v.headline, '9 hard sets done this week, against 21 planned. Upper Body today and Leg Day tomorrow hold 9 more.');
});

test('a goal muscle that cannot reach its target on the plan as written is the one loud line', () => {
  const v = view();
  // shoulders: 3 done, face pulls missed Monday, 3 more today → 6 of 12
  assert.equal(muscle(v, 'Shoulders').projected, 6);
  assert.equal(muscle(v, 'Shoulders').short, true);
  assert.equal(muscle(v, 'Biceps').projected, 6);
  assert.equal(v.warn, 'Shoulders can reach 6 of 12 this week on the plan as written. Biceps can reach 6 of 12 this week on the plan as written.');
  assert.equal(muscle(v, 'Quads').short, false, 'a muscle outside his goal is never shouted about');
});

test('rows say what their pips cannot: missed, today, done on another day, not in the plan, timed holds', () => {
  const v = view();
  const shoulders = muscle(v, 'Shoulders').rows;
  assert.deepEqual(shoulders.map((r) => [r.day, r.name, r.status?.text ?? null]), [
    ['Mon', 'Cable Lateral Raise', null],
    ['Mon', 'Face Pull', 'not done'],
    ['Fri', 'Cable Lateral Raise', 'today'],
  ]);
  const back = muscle(v, 'Back').rows;
  assert.deepEqual(back.map((r) => [r.day, r.name, r.detail, r.pips]), [['Wed', 'Pull ups', 'Not in the plan', ['extra', 'extra', 'extra']]]);
  const hang = muscle(v, 'Forearms').rows[0];
  assert.equal(hang.detail, 'Pull · 3 × 20–30 s');
});

test('the week grid puts planned sets on their day and off-plan sets on the day they happened', () => {
  const v = view();
  const back = muscle(v, 'Back');
  assert.deepEqual(back.cells.map((c) => c.length), [0, 0, 1, 0, 0, 0, 0], 'one line per exercise');
  assert.deepEqual(back.cells[2], [['extra', 'extra', 'extra']]);
  const shoulders = muscle(v, 'Shoulders');
  assert.deepEqual(shoulders.cells[0], [['done', 'done', 'done'], ['missed', 'missed', 'missed']], 'laterals done, face pulls not');
  assert.deepEqual(shoulders.cells[4], [['due', 'due', 'due']]);
  assert.deepEqual(v.days.map((d) => d.routine), ['Push', 'Rest', 'Pull', 'Rest', 'Upper', 'Leg', 'Rest']);
});

test('the session in progress lights its ticked sets as live', () => {
  const live = { routineId: 'upper', exercises: [{ exerciseId: 'curl', sets: [{ weight: 20, reps: 8, done: true }, { weight: 20, reps: 8 }] }] };
  const v = view(SESSIONS, live);
  const friCurl = muscle(v, 'Biceps').rows.find((r) => r.day === 'Fri');
  assert.deepEqual(friCurl.pips, ['live', 'due', 'due']);
  assert.equal(friCurl.status.text, 'in progress');
});

test('an empty or missing week renders nothing rather than a hollow sheet', () => {
  assert.equal(weekSetsView(null), null);
  assert.equal(weekSetsView({ days: [], muscles: [] }), null);
});

test('the card\'s warning is the projection, and Coach gets the figures behind it', () => {
  const v = view();
  assert.deepEqual(v.cta.muscles, ['Shoulders', 'Biceps']);
  assert.equal(v.cta.text, 'Shoulders (6 of 12) and Biceps (6 of 12) fall short by Sunday on the plan as written. Ask Coach how to add sets →');
  assert.equal(v.cta.question, 'On my plan as written, shoulders and biceps finish this week short of target for my goal: Shoulders 3 done + 3 still scheduled = 6 of 12; Biceps 3 done + 3 still scheduled = 6 of 12. How should I add volume?');
});

test('a goal muscle behind today but carried to target by what is still scheduled is not called short', () => {
  // three more biceps sessions' worth on the plan: 3 done Wednesday, 9 to come
  const routines = ROUTINES.map((r) => (r.id === 'upper' ? { ...r, exercises: [slot('lateral'), slot('curl', { targetSets: 9 })] } : r));
  const v = weekSetsView(plannedWeek({ routines, schedule: SCHEDULE, sessions: SESSIONS, exercises: EXERCISES, targetOf, now: FRIDAY }));
  assert.equal(muscle(v, 'Biceps').done, 3, 'well under 12 right now');
  assert.equal(muscle(v, 'Biceps').short, false, 'but 3 + 9 reach it by Sunday');
  assert.deepEqual(v.cta.muscles, ['Shoulders']);
  assert.equal(v.cta.text, 'Shoulders can reach 6 of 12 by Sunday on the plan as written. Ask Coach how to add sets →');
});

