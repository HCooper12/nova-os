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
