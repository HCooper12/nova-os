// Carry-over store — push missed exercises to a day, reschedule, clear.
// Operational data (data/, not the vault): point NOVA_DATA_DIR at a temp dir
// BEFORE importing the module so it never touches the real store.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-carryover-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { listCarryovers, addCarryover, rescheduleCarryover, removeCarryover } = await import('../lib/workoutCarryover.js');
const { setMakeupDay } = await import('../lib/makeupDay.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const sampleExercises = [
  { exerciseId: 'ohp', name: 'Overhead Press', muscleGroup: 'shoulders', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 10 },
  { exerciseId: 'lat', name: 'Lat Raise', muscleGroup: 'shoulders', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 },
];

test('adds a carry-over and lists it back, sorted by date', async () => {
  const later = await addCarryover({ forDate: '2026-07-25', sourceRoutineName: 'Push Day', exercises: sampleExercises });
  const sooner = await addCarryover({ forDate: '2026-07-21', sourceRoutineName: 'Pull Day', exercises: [sampleExercises[0]] });

  assert.match(later.id, /^[0-9a-f]{8}$/, 'gets a short id');
  assert.equal(later.exercises.length, 2);
  assert.ok(later.createdAt, 'stamped');

  const list = await listCarryovers();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((c) => c.forDate), ['2026-07-21', '2026-07-25'], 'sorted ascending by forDate');
});

test('rejects a bad date and an empty exercise set', async () => {
  await assert.rejects(() => addCarryover({ forDate: 'tomorrow', sourceRoutineName: 'X', exercises: sampleExercises }), /YYYY-MM-DD/);
  await assert.rejects(() => addCarryover({ forDate: '2026-08-01', sourceRoutineName: 'X', exercises: [] }), /no exercises/);
  // exercises missing an id/name are dropped; if that empties the list, it's an error
  await assert.rejects(() => addCarryover({ forDate: '2026-08-01', sourceRoutineName: 'X', exercises: [{ targetSets: 3 }] }), /no exercises/);
});

test('normalizes exercise fields defensively', async () => {
  const rec = await addCarryover({
    forDate: '2026-08-02', sourceRoutineName: 'Legs',
    exercises: [{ exerciseId: 'squat', name: 'x'.repeat(200), targetSets: 99, targetRepsLow: -3 }],
  });
  assert.equal(rec.exercises[0].name.length, 120, 'name clamped');
  assert.equal(rec.exercises[0].targetSets, 12, 'sets clamped to a sane ceiling');
  assert.equal(rec.exercises[0].targetRepsLow, 0, 'negative reps floored');
  assert.equal(rec.exercises[0].trackingType, 'weight_reps', 'default tracking type');
  await removeCarryover(rec.id);
});

test('reschedules a carry-over to a new day (re-push as often as needed)', async () => {
  const rec = await addCarryover({ forDate: '2026-07-21', sourceRoutineName: 'Arms', exercises: sampleExercises });
  const moved = await rescheduleCarryover(rec.id, '2026-07-22');
  assert.equal(moved.forDate, '2026-07-22');
  assert.ok(moved.rescheduledAt, 'reschedule stamped');

  // and again — the whole point is you can keep pushing it
  const movedAgain = await rescheduleCarryover(rec.id, '2026-07-23');
  assert.equal(movedAgain.forDate, '2026-07-23');

  await assert.rejects(() => rescheduleCarryover(rec.id, 'nope'), /YYYY-MM-DD/);
  await assert.rejects(() => rescheduleCarryover('missing', '2026-07-24'), /not found/);
  await removeCarryover(rec.id);
});

test('removes a carry-over (and reports when nothing matched)', async () => {
  const rec = await addCarryover({ forDate: '2026-09-01', sourceRoutineName: 'Test', exercises: sampleExercises });
  const before = (await listCarryovers()).length;
  assert.deepEqual(await removeCarryover(rec.id), { removed: 1 });
  assert.equal((await listCarryovers()).length, before - 1);
  assert.deepEqual(await removeCarryover(rec.id), { removed: 0 }, 'idempotent — removing again is a no-op');
});

/* ------------------------------------------------ one row per date+routine ---

His report, 12 Sep 2026: two identical "Upper Body — makeup" sessions on the
same date, thirteen seconds apart. He pushed the exercises he missed forward,
then marked that date a make-up day for the same routine — two writers, one
statement. These pin the invariant that makes that impossible either way
round, because the order he takes the two actions in is his business.       */

const UPPER = [
  { exerciseId: 'barbell-bench-press', name: 'Barbell Bench Press', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 10 },
  { exerciseId: 'wide-grip-lat-pulldown', name: 'Wide-Grip Lat Pulldown', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
];
const forDate = (c) => c.forDate === '2026-10-05';

test('pushing missed work forward, then marking that day a make-up, is ONE row', async () => {
  // exactly the two payloads his two writers send
  const pushed = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'Upper Body', exercises: UPPER });
  const madeUp = await setMakeupDay({
    date: '2026-10-05',
    routine: { id: 'f5a0c85d', name: 'Upper Body', exercises: UPPER },
    sessions: [{ routineId: 'f5a0c85d', date: '2026-10-04', exercises: [] }],   // nothing logged
  });

  const rows = (await listCarryovers()).filter(forDate);
  assert.equal(rows.length, 1, 'one statement of debt, not two');
  assert.equal(madeUp.id, pushed.id, 'the make-up promoted the row already there');
  assert.equal(rows[0].plannedAs, 'day', 'and the day IS the make-up');
  assert.equal(rows[0].sourceRoutineId, 'f5a0c85d', 'gaining the identity the push could not send');
  assert.equal(rows[0].exercises.length, 2, 'the same two exercises, not four');
  await removeCarryover(rows[0].id);
});

test('and in the other order — the make-up absorbs a later push of the same session', async () => {
  const madeUp = await setMakeupDay({
    date: '2026-10-05',
    routine: { id: 'f5a0c85d', name: 'Upper Body', exercises: UPPER },
    sessions: [{ routineId: 'f5a0c85d', date: '2026-10-04', exercises: [] }],
  });
  // a push that adds a third exercise the make-up did not derive
  const merged = await addCarryover({
    forDate: '2026-10-05', sourceRoutineName: 'Upper Body',
    exercises: [...UPPER, { exerciseId: 'cable-bicep-curl', name: 'Cable Bicep Curl', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 15 }],
  });

  const rows = (await listCarryovers()).filter(forDate);
  assert.equal(rows.length, 1);
  assert.equal(merged.id, madeUp.id);
  assert.equal(rows[0].plannedAs, 'day', 'ordinary debt never demotes a make-up day');
  assert.deepEqual(rows[0].exercises.map((e) => e.exerciseId),
    ['barbell-bench-press', 'wide-grip-lat-pulldown', 'cable-bicep-curl'], 'unioned, in order');
  await removeCarryover(rows[0].id);
});

test('a double tap on "push to a day" is a no-op, not a twin', async () => {
  const a = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'Upper Body', exercises: UPPER });
  const b = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'upper body ', exercises: UPPER });
  assert.equal(b.id, a.id, 'matched despite case and a stray space');
  assert.equal((await listCarryovers()).filter(forDate).length, 1);
  await removeCarryover(a.id);
});

test('debt from a DIFFERENT session on the same day is real, and survives', async () => {
  const upper = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'Upper Body', exercises: UPPER });
  const legs = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'Leg Day', exercises: [sampleExercises[0]] });
  assert.notEqual(legs.id, upper.id, 'two routines is two rows — that is not a duplicate');
  assert.equal((await listCarryovers()).filter(forDate).length, 2);
  await removeCarryover(upper.id);
  await removeCarryover(legs.id);
});

test('re-pushing onto a day that already holds that session folds into it', async () => {
  const sitting = await addCarryover({ forDate: '2026-10-05', sourceRoutineName: 'Upper Body', exercises: [UPPER[0]] });
  const moving = await addCarryover({ forDate: '2026-10-06', sourceRoutineName: 'Upper Body', exercises: [UPPER[1]] });
  const survivor = await rescheduleCarryover(moving.id, '2026-10-05');

  assert.equal(survivor.id, sitting.id, 'it merged rather than landing beside it');
  assert.equal((await listCarryovers()).filter(forDate).length, 1);
  assert.deepEqual(survivor.exercises.map((e) => e.exerciseId), ['barbell-bench-press', 'wide-grip-lat-pulldown']);
  assert.deepEqual(await removeCarryover(moving.id), { removed: 0 }, 'the moved row is gone, not orphaned');
  await removeCarryover(survivor.id);
});
