// TODAY ONLY (15 Oct 2026). His words: "add that into the plan for today at
// least, but then make it go back to normal for the next leg session". Nova
// could only change the routine. What must hold: one Coach "today" line is one
// checked card; his yes stores the day's changes and NEVER writes the routine;
// the session built today applies them, tagged; another day reads nothing;
// Undo puts back exactly what was there.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-today-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-today-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateCoachEdit, routeForAction } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { loadTrainToday, localDay } = await import('../lib/trainToday.js');
const { applyTrainToday, todayPlanFor } = await import('../../src/trainToday.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const hack = await addCustomExercise(vault, 'Hack Squat', 'Quads', 'weight_reps');
const standing = await addCustomExercise(vault, 'Standing Machine Calf Raises', 'Calves', 'weight_reps');
const bulgarian = await addCustomExercise(vault, 'Bulgarian Split Squat', 'Quads', 'weight_reps');
const seated = await addCustomExercise(vault, 'Seated Calf Raise', 'Calves', 'weight_reps');
const ext = await addCustomExercise(vault, 'Leg Extension', 'Quads', 'weight_reps');
const { exercises } = await loadExerciseLibrary(vault);
const legs = await createRoutine(vault, exercises, 'Leg Day', [
  { exerciseId: hack.id, targetSets: 4, targetRepsLow: 6, targetRepsHigh: 8 },
  { exerciseId: standing.id, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
  { exerciseId: bulgarian.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
]);
const routineNow = async () => (await loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).routines.find((r) => r.id === legs.id);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const HIS_MORNING = {
  action: 'today', routine: 'Leg Day', reason: 'lighter on your lower back today',
  changes: [
    { exercise: 'Hack Squat', weightKg: 90, targetSets: 3, targetRepsLow: 10, note: 'no pause at the bottom' },
    { swap: 'Standing Machine Calf Raises', with: 'Seated Calf Raise' },
    { skip: 'Bulgarian Split Squat' },
    { add: 'Leg Extension', targetSets: 3, targetRepsLow: 12 },
  ],
};

test('his morning as one today line: one card that says every change, on its own route', async () => {
  const v = await validateCoachEdit(vault, HIS_MORNING);
  assert.equal(routeForAction(v.payload.action), 'train-today');
  assert.equal(v.payload.changes.length, 4);
  assert.match(v.title, /^Today only, Leg Day: /);
  assert.match(v.title, /Hack Squat: 90 kg, 3 × 10, no pause at the bottom/);
  assert.match(v.title, /Standing Machine Calf Raises → Seated Calf Raise/);
  assert.match(v.title, /skip Bulgarian Split Squat/);
  assert.match(v.title, /add Leg Extension/);
});

test('a today line is checked like any other: unknown lifts, empties and no-ops come back', async () => {
  await assert.rejects(validateCoachEdit(vault, { action: 'today', routine: 'Leg Day', changes: [] }), /changes/);
  await assert.rejects(validateCoachEdit(vault, { action: 'today', routine: 'Leg Day', changes: [{ swap: 'Hack Squat', with: 'Moon Squat' }] }), /isn't in his exercise library/);
  await assert.rejects(validateCoachEdit(vault, { action: 'today', routine: 'Leg Day', changes: [{ skip: 'Hack Squat' }, { skip: 'Standing Machine Calf Raises' }, { skip: 'Bulgarian Split Squat' }] }), /rest day/);
  await assert.rejects(validateCoachEdit(vault, { action: 'today', routine: 'Leg Day', changes: [{ exercise: 'Hack Squat' }] }), /says nothing new/);
});

test('his yes stores today and never writes the routine; Undo clears it', async () => {
  const before = JSON.stringify((await routineNow()).exercises);
  const v = await validateCoachEdit(vault, HIS_MORNING);
  const done = await fileDecision(vault, { route: 'train-today', payload: v.payload });
  assert.match(done.destination, /Your next Leg Day is as written/);
  assert.equal(JSON.stringify((await routineNow()).exercises), before, 'the routine in the vault is untouched');
  const plan = await loadTrainToday();
  assert.equal(plan.date, localDay());
  assert.equal(plan.routineId, legs.id);

  const tomorrow = new Date(Date.now() + 36 * 3600_000);
  assert.equal(await loadTrainToday(tomorrow), null, 'tomorrow reads nothing');
  assert.equal(todayPlanFor(plan, legs.id, tomorrow), null);

  await undoFiling(vault, done.undo);
  assert.equal(await loadTrainToday(), null, 'undo leaves today as written');
});

test('the session built today carries every change, tagged; another routine is untouched', async () => {
  const v = await validateCoachEdit(vault, HIS_MORNING);
  await fileDecision(vault, { route: 'train-today', payload: v.payload });
  const plan = await loadTrainToday();
  const r = await routineNow();
  const built = r.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh, coach: { kind: 'weight', delta: 2.5 }, sets: [{ weight: 100, reps: 8, done: false }, { weight: 100, reps: 8, done: false }] }));
  const out = applyTrainToday(built, todayPlanFor(plan, legs.id));
  const by = (n) => out.find((e) => e.name === n);
  assert.deepEqual(by('Hack Squat').sets.map((s) => [s.weight, s.reps]), [[90, 10], [90, 10], [90, 10]]);
  assert.equal(by('Hack Squat').coach, null, "today's dose replaces the progression nudge");
  assert.match(by('Hack Squat').todayOnly, /90 kg/);
  assert.ok(by('Seated Calf Raise'), 'the swap arrives as the other lift');
  assert.equal(by('Standing Machine Calf Raises'), undefined);
  assert.equal(by('Bulgarian Split Squat').skipped, true, 'a skip arrives skipped, one tap from back');
  assert.equal(by('Leg Extension').adhoc, true);
  assert.equal(by('Leg Extension').sets.length, 3);
  assert.equal(todayPlanFor(plan, 'some-other-routine'), null);
});
