// "HARD SETS THIS WEEK" must mean THIS week.
//
// He opened Train on a Monday morning and saw a full week of volume —
// Back 15/10, Shoulders 12/12 — before training once. weeklyMuscleVolume
// only returns weeks that CONTAIN sessions, and the overview took [0], so
// until the first session of a new week landed, last week's numbers sat
// under a header claiming they were this week's. Nothing errored; the bars
// were simply lying. These tests pin both halves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, weeklyMuscleVolume } from '../lib/trainingAnalytics.js';

const EXERCISES = [
  { id: 'pullup', muscleGroup: 'Back' },
  { id: 'ohp', muscleGroup: 'Shoulders' },
  { id: 'stretch', muscleGroup: 'Mobility' },
];
const set = (n) => Array.from({ length: n }, () => ({ weight: 20, reps: 8 }));

test('mondayOf: every day of a week resolves to the same Monday', () => {
  // Mon 24 Aug 2026 through Sun 30 Aug 2026
  for (const d of ['2026-08-24', '2026-08-25', '2026-08-27', '2026-08-30']) {
    assert.equal(mondayOf(d), '2026-08-24', `${d} belongs to the week of the 24th`);
  }
  // the Sunday BEFORE belongs to the previous week — the classic off-by-one
  assert.equal(mondayOf('2026-08-23'), '2026-08-17');
  // and a Monday is its own week key
  assert.equal(mondayOf('2026-08-17'), '2026-08-17');
});

test('mondayOf handles a year boundary without drifting', () => {
  assert.equal(mondayOf('2026-01-01'), '2025-12-29');
  assert.equal(mondayOf('2025-12-29'), '2025-12-29');
});

test('mondayOf accepts a Date as well as a string, at any hour', () => {
  // late-evening local time must not roll into the next day's week
  const lateSunday = new Date(2026, 7, 23, 23, 30); // Sun 23 Aug 2026, 11:30pm
  assert.equal(mondayOf(lateSunday), '2026-08-17');
  const earlyMonday = new Date(2026, 7, 24, 0, 15); // Mon 24 Aug, 12:15am
  assert.equal(mondayOf(earlyMonday), '2026-08-24');
});

test('THE BUG: last week\'s sessions must not answer for this week', () => {
  // sessions only in the week of the 17th; "now" is Monday the 24th
  const sessions = [
    { date: '2026-08-20', exercises: [{ exerciseId: 'pullup', sets: set(5) }] },
    { date: '2026-08-18', exercises: [{ exerciseId: 'ohp', sets: set(4) }] },
  ];
  const weeks = weeklyMuscleVolume(sessions, EXERCISES, { weeks: 6 });
  // the newest week WITH DATA is last week — this is what [0] used to return
  assert.equal(weeks[0].week, '2026-08-17');
  assert.equal(weeks[0].groups.Back, 5);

  // the overview's selection: ask for THIS week specifically
  const thisWeek = weeks.find((w) => w.week === mondayOf('2026-08-24'));
  assert.equal(thisWeek, undefined, 'a fresh week has no data, and must say so');
});

test('once this week has a session, only this week\'s sets are counted', () => {
  const sessions = [
    { date: '2026-08-24', exercises: [{ exerciseId: 'pullup', sets: set(3) }] }, // this week
    { date: '2026-08-20', exercises: [{ exerciseId: 'pullup', sets: set(5) }] }, // last week
  ];
  const weeks = weeklyMuscleVolume(sessions, EXERCISES, { weeks: 6 });
  const thisWeek = weeks.find((w) => w.week === '2026-08-24');
  assert.equal(thisWeek.groups.Back, 3, 'last week\'s 5 sets must not leak in');
});

test('mobility never counts as hypertrophy volume, warmups never count as sets', () => {
  const sessions = [{
    date: '2026-08-24',
    exercises: [
      { exerciseId: 'stretch', sets: set(4) },
      { exerciseId: 'pullup', sets: [...set(2), { setType: 'warmup', weight: 0, reps: 10 }] },
    ],
  }];
  const wk = weeklyMuscleVolume(sessions, EXERCISES, { weeks: 6 }).find((w) => w.week === '2026-08-24');
  assert.equal(wk.groups.Mobility, undefined);
  assert.equal(wk.groups.Back, 2);
});
