// A RE-FILE KEEPS WHAT ELSE THE LIFT TRAINS (16 Oct 2026, his rule). When he
// (or a Coach remap) changes an exercise's primary only, its audited
// secondaries stay, minus the new primary; only an explicit secondary list
// replaces them. The undo puts the entry back exactly as it was stored.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-refile2-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-refile2-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { setMuscleGroupIn, addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { refileExercise } = await import('../lib/exerciseRefile.js');
const { undoRecord, fileDecision, undoFiling } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { creditsFor } = await import('../lib/muscleSecondary.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

// the audit: Lying T Bar Row is Upper Back, also Lats, Rear Delts, Biceps at ½
const ROW = { id: 'lying-t-bar-row', name: 'Lying T Bar Row', muscleGroup: 'Back', trackingType: 'weight_reps' };

test('a primary-only re-file keeps the audited secondaries, minus the new primary', () => {
  const { exercise, before } = setMuscleGroupIn([ROW], ROW.id, 'Lats');
  assert.equal(before, 'Upper Back');
  assert.equal(exercise.primary, 'Lats');
  assert.deepEqual(exercise.secondary, ['Rear Delts', 'Biceps'], 'Lats is the primary now, so it leaves the list');
  assert.deepEqual(creditsFor(exercise).map((c) => [c.muscle, c.credit]), [['Lats', 1], ['Rear Delts', 0.5], ['Biceps', 0.5]]);
});

test('only an explicit secondary list replaces them; a non-volume primary takes none', () => {
  assert.deepEqual(setMuscleGroupIn([ROW], ROW.id, 'Lats', { secondary: ['Biceps'] }).exercise.secondary, ['Biceps']);
  assert.deepEqual(setMuscleGroupIn([ROW], ROW.id, 'Lats', { secondary: [] }).exercise.secondary, []);
  assert.throws(() => setMuscleGroupIn([ROW], ROW.id, 'Lats', { secondary: ['Wings'] }), /secondary muscles must be among/);
  assert.deepEqual(setMuscleGroupIn([ROW], ROW.id, 'Grip').exercise.secondary, []);
  // his own earlier list is what is kept, when he gave one
  const own = { ...ROW, primary: 'Upper Back', secondary: ['Lats'] };
  assert.deepEqual(setMuscleGroupIn([own], ROW.id, 'Rear Delts').exercise.secondary, ['Lats']);
  // same primary, same secondaries: nothing to write
  assert.equal(setMuscleGroupIn([ROW], ROW.id, 'Upper Back').unchanged, true);
});

test('the re-file writer keeps them, and its Inbox undo puts the entry back exactly', async () => {
  const lift = await addCustomExercise(vault, 'Lying T Bar Row', 'Back', 'weight_reps');
  assert.equal(lift.id, ROW.id, 'the audited id');
  const lib = async () => (await loadExerciseLibrary(vault)).exercises.find((e) => e.id === lift.id);
  assert.deepEqual((await lib()).secondary, ['Lats', 'Rear Delts', 'Biceps']);
  const out = await refileExercise(vault, lift.id, 'Lats');
  const now = await lib();
  assert.equal(now.muscleGroup, 'Lats');
  assert.deepEqual(now.secondary, ['Rear Delts', 'Biceps']);
  const rec = await getRecord(out.record.id);
  assert.match(rec.destination, /still training Rear Delts, Biceps at ½/);
  await undoRecord(vault, rec.id);
  const back = await lib();
  assert.equal(back.muscleGroup, 'Upper Back', 'the audited mapping again');
  assert.deepEqual(back.secondary, ['Lats', 'Rear Delts', 'Biceps']);
  assert.equal(back.audit, 'audited', 'not an override of his');
});

test("a Coach remap with an explicit list replaces them; without one it keeps them", async () => {
  const lib = async () => (await loadExerciseLibrary(vault)).exercises.find((e) => e.id === ROW.id);
  const { undo } = await fileDecision(vault, { route: 'exercise-remap', payload: { exerciseId: ROW.id, muscleGroup: 'Lats', secondary: ['Biceps'] } });
  assert.deepEqual((await lib()).secondary, ['Biceps']);
  await undoFiling(vault, undo);
  assert.deepEqual((await lib()).secondary, ['Lats', 'Rear Delts', 'Biceps']);
  const { validateCoachEdit } = await import('../lib/coach.js');
  const card = await validateCoachEdit(vault, { action: 'remap', exercise: 'Lying T Bar Row', muscleGroup: 'Lats' });
  assert.equal(card.payload.secondary, undefined, 'no list named: the writer keeps them');
  const named = await validateCoachEdit(vault, { action: 'remap', exercise: 'Lying T Bar Row', muscleGroup: 'Lats', secondary: ['Biceps', 'Lats'] });
  assert.deepEqual(named.payload.secondary, ['Biceps']);
});
