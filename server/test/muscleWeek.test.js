// The week in muscle sets (lib/muscleWeek.js), the model behind his weekly
// muscle sets sheet. The load-bearing promises: every line under a muscle
// adds up to its by-Sunday number exactly; credit comes only through
// creditsFor (1 focus, ½ accessory); today's half-done routine is never
// counted twice; and the non-volume filings never appear.
process.env.TZ = 'Australia/Sydney'; // his week, not the runner's
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-muscleweek-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { muscleWeek } = await import('../lib/muscleWeek.js');
const { VOLUME_RANGE } = await import('../../src/muscleTaxonomy.js');

// the library's override shape: each lift says what it trains outright
const EXERCISES = [
  { id: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest', secondary: ['Front Delts', 'Triceps'] },
  { id: 'pulldown', name: 'Wide-Grip Lat Pulldown', muscleGroup: 'Lats', secondary: ['Upper Back', 'Biceps'] },
  { id: 'curl', name: 'Spider Curl', muscleGroup: 'Biceps', secondary: [] },
  { id: 'lateral', name: 'Cable Lateral Raise', muscleGroup: 'Side Delts', secondary: [] },
  { id: 'row', name: 'Chest-Supported Row', muscleGroup: 'Lats', secondary: ['Upper Back', 'Rear Delts', 'Biceps'] },
  { id: 'hang', name: 'Dead Hang', muscleGroup: 'Grip', secondary: [] },
  { id: 'hips', name: '90/90 Hip Switch', muscleGroup: 'Mobility', secondary: [] },
  { id: 'burpee', name: 'Burpee', muscleGroup: 'Full Body', secondary: [] },
  { id: 'mystery', name: 'Mystery Machine', muscleGroup: 'Chest', audit: 'pending' },
];
const byId = new Map(EXERCISES.map((e) => [e.id, e]));
const slot = (id, targetSets = 3) => ({ exerciseId: id, name: byId.get(id).name, targetSets });
const ROUTINES = [
  { id: 'push', name: 'Push', exercises: [slot('bench'), slot('lateral'), slot('hips'), slot('mystery')] },
  { id: 'pull', name: 'Pull', exercises: [slot('pulldown'), slot('curl'), slot('hang')] },
  { id: 'upper', name: 'Upper Body', exercises: [slot('bench'), slot('row'), slot('lateral'), slot('burpee')] },
  { id: 'arms', name: 'Arms', exercises: [slot('curl'), slot('lateral')] },
];
const SCHEDULE = { monday: 'active-rest', tuesday: 'push', wednesday: 'pull', friday: 'upper', saturday: 'arms', sunday: 'active-rest' };
const FRIDAY = new Date('2026-10-16T09:00:00'); // the week of Mon 12 Oct
const working = (n) => Array.from({ length: n }, (_, i) => ({ weight: 40 + i, reps: 8 }));
const sess = (date, routineId, routineName, exercises, extra = {}) => ({
  id: `${date}-${routineId}`, date, routineId, routineName, finishedAt: `${date}T08:00:00.000Z`,
  exercises: exercises.map(([exerciseId, n]) => ({ exerciseId, name: byId.get(exerciseId)?.name, sets: working(n) })), ...extra,
});
const TUE = sess('2026-10-13', 'push', 'Push', [['bench', 3], ['lateral', 1], ['hips', 2], ['mystery', 3]]);
const WED = sess('2026-10-14', 'pull', 'Pull', [['pulldown', 3], ['curl', 3], ['hang', 3]]);
const run = (over = {}) => muscleWeek({ routines: ROUTINES, schedule: SCHEDULE, sessions: [TUE, WED], exercises: EXERCISES, now: FRIDAY, goalMuscles: ['Biceps', 'Side Delts', 'Lats', 'Upper Back'], ...over });
const M = (w, m) => w.muscles.find((x) => x.muscle === m);
const sum = (xs) => xs.reduce((n, l) => n + l.value, 0);

test('every muscle: its lines add up exactly to its by-Sunday total, and the totals are focus + ½ accessory', () => {
  const w = run();
  assert.equal(w.start, '2026-10-12');
  assert.equal(w.end, '2026-10-18');
  for (const m of w.muscles) {
    assert.equal(sum(m.lines), m.bySunday, `${m.muscle}: lines ${sum(m.lines)} vs by Sunday ${m.bySunday}`);
    assert.equal(sum(m.lines.filter((l) => l.status === 'done')), m.done, `${m.muscle}: done lines`);
    assert.equal(m.done, m.focusDone + m.accDone / 2);
    assert.equal(m.bySunday, m.done + m.focusPlanned + m.accPlanned / 2);
  }
  // Biceps: Wed curls 3 (focus) + Wed pulldown 3 (½) done; Fri row 3 (½) + Sat curls 3 planned
  const b = M(w, 'Biceps');
  assert.deepEqual([b.focusDone, b.accDone, b.focusPlanned, b.accPlanned], [3, 3, 3, 3]);
  assert.equal(b.done, 4.5);
  assert.equal(b.bySunday, 9);
  assert.deepEqual(b.lines.map((l) => [l.short, l.exercise, l.sets, l.credit, l.status]), [
    ['Wed', 'Wide-Grip Lat Pulldown', 3, 0.5, 'done'],
    ['Wed', 'Spider Curl', 3, 1, 'done'],
    ['Fri', 'Chest-Supported Row', 3, 0.5, 'today'],
    ['Sat', 'Spider Curl', 3, 1, 'planned'],
  ]);
});

test('a muscle with only accessory work shows 0 focus', () => {
  const w = run();
  const t = M(w, 'Triceps'); // only ever the bench's accessory
  assert.equal(t.focusDone, 0);
  assert.equal(t.focusPlanned, 0);
  assert.equal(t.accDone, 3);
  assert.equal(t.accPlanned, 3);
  assert.equal(t.bySunday, 3);
  assert.ok(t.lines.every((l) => l.credit === 0.5));
});

test("today's partly logged routine is not counted twice", () => {
  // he is in Upper Body now: 2 bench sets ticked, one row set filed earlier today
  const live = { routineId: 'upper', routineName: 'Upper Body', exercises: [
    { exerciseId: 'bench', sets: [{ weight: 60, reps: 8, done: true }, { weight: 60, reps: 8, done: true }, { weight: 60, reps: 8, done: false }] },
    { exerciseId: 'row', sets: [{ weight: 20, reps: 10, setType: 'warmup', done: true }] },
  ] };
  const w = run({ live });
  const chest = M(w, 'Chest');
  const today = chest.lines.filter((l) => l.date === '2026-10-16');
  assert.deepEqual(today.map((l) => [l.sets, l.status]), [[2, 'done'], [1, 'today']], 'two done, one to come: 3 in all, as planned');
  assert.equal(chest.focusDone, 3 + 2);
  assert.equal(chest.focusPlanned, 1);
  assert.equal(chest.bySunday, 6, 'Tue 3 + Fri 3, never 3 + 2 + 3');
  // the warm-up row is not a working set: all three row sets are still to come
  assert.equal(M(w, 'Lats').lines.find((l) => l.exerciseId === 'row').sets, 3);
  const fri = w.days.find((d) => d.date === '2026-10-16');
  assert.equal(fri.status, 'today');
  assert.equal(fri.focus.Chest, 3);
});

test('a routine already filed today plans nothing more, and a session filed twice counts once', () => {
  const FRI = sess('2026-10-16', 'upper', 'Upper Body', [['bench', 3], ['row', 2]]);
  const w = run({ sessions: [TUE, WED, { ...WED, id: 'twin', finishedAt: '2026-10-14T08:05:00.000Z' }, FRI] });
  assert.equal(M(w, 'Lats').lines.filter((l) => l.date === '2026-10-16').length, 1);
  assert.equal(M(w, 'Lats').focusPlanned, 0, 'filed today: the third row set he chose to leave is not planned');
  assert.equal(M(w, 'Biceps').focusDone, 3, "Wednesday's twin is not a second 3 sets of curls");
  const wed = w.days.find((d) => d.date === '2026-10-14');
  assert.equal(wed.dup, true);
  assert.ok(M(w, 'Biceps').lines.filter((l) => l.date === '2026-10-14').every((l) => l.dup), "the card's Wednesday says so too");
  assert.equal(w.days.find((d) => d.date === '2026-10-16').status, 'done');
});

test('a routine pulled forward is not planned again on its own day', () => {
  const THU = sess('2026-10-15', 'arms', 'Arms', [['curl', 3], ['lateral', 3]]);
  const w = run({ sessions: [TUE, WED, THU] });
  assert.equal(w.days.some((d) => d.date === '2026-10-17'), false, "Saturday's Arms was done on Thursday");
  assert.equal(M(w, 'Biceps').focusPlanned, 0);
});

test('non-volume filings never appear, and unaudited lifts are said, not counted', () => {
  const w = run();
  for (const m of ['Mobility', 'Full Body', 'Grip', 'Other']) assert.equal(w.muscles.some((x) => x.muscle === m), false, m);
  for (const d of w.days) for (const m of ['Mobility', 'Full Body', 'Grip']) assert.equal(d.focus[m] ?? d.accessory[m], undefined);
  assert.equal(w.uncounted.sets, 3);
  assert.deepEqual(w.uncounted.lifts.map((l) => l.name), ['Mystery Machine']);
  assert.equal(M(w, 'Chest').focusDone, 3, 'the unaudited machine adds nothing to Chest');
});

test('goal muscles come first in the body order, even untrained; the rest by projected total; each carries its range', () => {
  const w = run({ goalMuscles: ['Triceps', 'Rear Delts', 'Side Delts'], ranges: { 'Side Delts': [12, 22] } });
  assert.deepEqual(w.muscles.slice(0, 3).map((m) => m.muscle), ['Side Delts', 'Rear Delts', 'Triceps']);
  assert.ok(w.muscles.slice(0, 3).every((m) => m.goal));
  const rest = w.muscles.slice(3);
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i - 1].bySunday >= rest[i].bySunday);
  assert.deepEqual([M(w, 'Side Delts').low, M(w, 'Side Delts').high], [12, 22]);
  assert.deepEqual([M(w, 'Chest').low, M(w, 'Chest').high], [...VOLUME_RANGE]);
});

test('the days: done, today and planned; a missed day is drawn; a planned make-up takes its day', () => {
  const carry = [{ forDate: '2026-10-18', plannedAs: 'day', sourceRoutineName: 'Push', sourceRoutineId: 'push', exercises: [slot('lateral', 2)] }];
  const w = run({ sessions: [WED], carryovers: carry });
  assert.deepEqual(w.days.map((d) => [d.short, d.routine, d.status]), [
    ['Tue', 'Push', 'missed'], ['Wed', 'Pull', 'done'], ['Fri', 'Upper Body', 'today'], ['Sat', 'Arms', 'planned'], ['Sun', 'Push make-up', 'planned'],
  ]);
  assert.equal(M(w, 'Side Delts').lines.find((l) => l.short === 'Sun').sets, 2);
  const sat = w.days.find((d) => d.short === 'Sat');
  assert.deepEqual(sat.focus, { Biceps: 3, 'Side Delts': 3 });
});

test('a filed make-up session is its own card, named for the routine it finished', () => {
  const MK = sess('2026-10-15', 'carryover', 'Pull — makeup', [['pulldown', 3], ['hang', 3]], { sourceRoutineName: 'Pull' });
  const w = run({ sessions: [TUE, WED, MK] });
  const thu = w.days.find((d) => d.date === '2026-10-15');
  assert.equal(thu.routine, 'Pull make-up');
  assert.equal(thu.makeup, true);
  assert.deepEqual(thu.focus, { Lats: 3 });
  assert.deepEqual(thu.accessory, { 'Upper Back': 3, Biceps: 3 });
});

// HIS SATURDAY, 31 OCT 2026: Arms and Delts & Back both planned for the one
// date (a dated two-a-day, lib/extraWorkouts.js). The template still says
// Arms; the second session was missing from the sheet until the day plan
// was read. Both must tally, net of what is filed, and a cleared plan must
// fall back to the template alone.
const DB = { id: 'dback', name: 'Delts & Back', exercises: [slot('lateral', 4), slot('row', 3)] };
const TWO_A_DAY = [{ date: '2026-10-31', routineIds: ['arms', 'dback'] }];
const SAT = new Date('2026-10-31T07:00:00');
const sat = (over = {}) => muscleWeek({ routines: [...ROUTINES, DB], schedule: SCHEDULE, sessions: [], exercises: EXERCISES, now: SAT, dayPlans: TWO_A_DAY, ...over });

test('a dated two-a-day plans BOTH routines, before either is filed', () => {
  const w = sat();
  const today = w.days.filter((d) => d.date === '2026-10-31');
  assert.deepEqual(today.map((d) => [d.routine, d.status]), [['Arms', 'today'], ['Delts & Back', 'today']]);
  // Side Delts: Arms lateral 3 + Delts & Back lateral 4; Rear Delts: ½ of the row's 3
  assert.equal(M(w, 'Side Delts').bySunday, 7);
  assert.equal(M(w, 'Rear Delts').bySunday, 1.5);
  assert.equal(M(w, 'Lats').bySunday, 3);
  assert.equal(M(w, 'Upper Back').bySunday, 1.5);
  assert.equal(M(w, 'Biceps').bySunday, 3 + 1.5, 'Arms curls + ½ of the row');
  for (const m of w.muscles) assert.equal(sum(m.lines), m.bySunday, m.muscle);
});

test('a two-a-day with one session filed plans only the other; with both filed, nothing more', () => {
  const armsDone = sess('2026-10-31', 'arms', 'Arms', [['curl', 3], ['lateral', 3]]);
  const one = sat({ sessions: [armsDone] });
  assert.equal(M(one, 'Side Delts').done, 3);
  assert.equal(M(one, 'Side Delts').bySunday, 7, 'the done Arms lateral + the planned Delts & Back lateral, no double count');
  assert.equal(M(one, 'Lats').bySunday, 3);
  const cards = one.days.filter((d) => d.date === '2026-10-31');
  assert.deepEqual(cards.map((d) => [d.routine, d.status]), [['Arms', 'done'], ['Delts & Back', 'today']]);

  const dbDone = sess('2026-10-31', 'dback', 'Delts & Back', [['lateral', 4], ['row', 3]]);
  const both = sat({ sessions: [armsDone, dbDone] });
  assert.equal(M(both, 'Side Delts').done, 7);
  assert.equal(M(both, 'Side Delts').bySunday, 7);
  assert.equal(M(both, 'Lats').bySunday, 3);
  assert.ok(both.muscles.every((m) => m.bySunday === m.done), 'nothing is left to plan');
});

test('the day plan cleared: Saturday is the template alone, and Delts & Back appears nowhere', () => {
  const w = sat({ dayPlans: [] });
  assert.deepEqual(w.days.filter((d) => d.date === '2026-10-31').map((d) => d.routine), ['Arms']);
  assert.equal(M(w, 'Side Delts').bySunday, 3);
  assert.equal(M(w, 'Rear Delts'), undefined);
  assert.ok(w.muscles.every((m) => m.lines.every((l) => l.routine !== 'Delts & Back')));
});

test('a routine in a past day plan that was never filed is drawn missed, adding nothing', () => {
  const sun = new Date('2026-11-01T09:00:00');
  const w = sat({ now: sun });
  const missed = w.days.filter((d) => d.date === '2026-10-31');
  assert.deepEqual(missed.map((d) => [d.routine, d.status]), [['Arms', 'missed'], ['Delts & Back', 'missed']]);
  assert.equal(M(w, 'Side Delts')?.bySunday || 0, 0);
});

test('on a two-a-day, a set ticked live in the second session nets against that session, not the first', () => {
  const live = { routineId: 'dback', routineName: 'Delts & Back', exercises: [
    { exerciseId: 'lateral', sets: [{ weight: 10, reps: 12, done: true }, { weight: 10, reps: 12, done: true }] },
  ] };
  const w = sat({ live });
  const lines = M(w, 'Side Delts').lines.map((l) => [l.routine, l.sets, l.status]);
  assert.deepEqual(lines.sort(), [['Arms', 3, 'today'], ['Delts & Back', 2, 'done'], ['Delts & Back', 2, 'today']]);
  assert.equal(M(w, 'Side Delts').bySunday, 7);
});
