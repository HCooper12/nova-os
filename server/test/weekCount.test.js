// "N of M done" per workout (mockup 104): a double day counts two, a walk of
// 15+ minutes ticks an active-rest day, and on a training day it never
// stands in for the session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-weekcount-'));
const { weekCount } = await import('../lib/weekCount.js');
const { countsForActiveRest, cardioKind, ACTIVE_REST_MIN_MINUTES } = await import('../lib/healthWorkouts.js');

const routines = [{ id: 'push', name: 'Push' }, { id: 'pull', name: 'Pull' }, { id: 'arms', name: 'Arms Optional' }, { id: 'delts', name: 'Delts and Back Optional' }];
// Mon 19 Oct 2026 .. Sun 25 Oct
const base = {
  start: '2026-10-19', routines,
  schedule: { monday: 'push', wednesday: 'active-rest', thursday: 'pull', saturday: 'delts', sunday: 'active-rest' },
  counts: countsForActiveRest, isCardio: (w) => !!cardioKind(w.type),
};

test('a date with two workouts counts as two, and each is ticked by its own session', () => {
  const out = weekCount({ ...base, today: '2026-10-24',
    dayPlans: [{ date: '2026-10-24', routineIds: ['delts', 'arms'] }],
    sessions: [{ date: '2026-10-19', routineId: 'push' }, { date: '2026-10-24', routineId: 'delts' }] });
  const sat = out.days[5];
  assert.equal(sat.plannedCount, 2);
  assert.deepEqual(sat.slots.map((s) => [s.name, s.done]), [['Delts and Back Optional', true], ['Arms Optional', false]]);
  assert.equal(sat.state, 'partial');
  // Mon push, Wed AR, Thu pull, Sat x2, Sun AR = 6
  assert.equal(out.planned, 6);
  assert.equal(out.done, 2);
});

test('a walk of 15+ minutes ticks an active-rest day; a shorter one shows but does not', () => {
  const walk = { date: '2026-10-25', type: 'Indoor Walk', minutes: 42, minutesExact: 41.98, distanceKm: 3.87, kcal: 270, avgHr: 97 };
  const out = weekCount({ ...base, today: '2026-10-25', cardio: [walk, { date: '2026-10-21', type: 'Outdoor Walk', minutes: 12 }] });
  const sun = out.days[6];
  assert.equal(sun.state, 'done');
  assert.equal(sun.slots[0].byWalk, true);
  assert.equal(sun.walk.counted, true);
  assert.equal(sun.walk.distanceKm, 3.87);
  const wed = out.days[2];
  assert.equal(wed.state, 'missed');
  assert.equal(wed.walk.qualifies, false, `under ${ACTIVE_REST_MIN_MINUTES} minutes`);
  assert.equal(out.done, 1);
});

test('the 15-minute threshold is inclusive and strength is never cardio', () => {
  assert.equal(countsForActiveRest({ type: 'Outdoor Walk', minutes: 15 }), true);
  assert.equal(countsForActiveRest({ type: 'Outdoor Walk', minutes: 14, minutesExact: 14.9 }), false);
  assert.equal(countsForActiveRest({ type: 'Traditional Strength Training', minutes: 60 }), false);
});

test('on a training day the walk sits beside the session and never stands in for it', () => {
  const out = weekCount({ ...base, today: '2026-10-22', cardio: [{ date: '2026-10-22', type: 'Outdoor Run', minutes: 30 }] });
  const thu = out.days[3];
  assert.equal(thu.state, 'today');
  assert.equal(thu.doneCount, 0);
  assert.equal(thu.walk.dayKind, 'training');
  assert.equal(thu.walk.counted, false);
});

test('a swapped session still fills the day, and nothing ahead of today counts', () => {
  const out = weekCount({ ...base, today: '2026-10-22',
    sessions: [{ date: '2026-10-22', routineId: 'arms' }, { date: '2026-10-24', routineId: 'delts' }] });
  assert.equal(out.days[3].state, 'done', 'Arms on a Pull day still did the day');
  assert.equal(out.days[5].doneCount, 0, 'a session dated in the future is ignored');
});

test('a make-up day is one slot, filled by the make-up session', () => {
  const out = weekCount({ ...base, today: '2026-10-20',
    makeups: [{ forDate: '2026-10-20', sourceRoutineId: 'push', sourceRoutineName: 'Push' }],
    sessions: [{ date: '2026-10-20', routineId: 'carryover', routineName: 'Push — makeup', sourceRoutineId: 'push' }] });
  assert.equal(out.days[1].plannedCount, 1);
  assert.equal(out.days[1].state, 'done');
});
