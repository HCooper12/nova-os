// Coach changes the plan — the appliers that touch his real program.
//
// The stakes: these ops rewrite the routines his sessions run from. A swap
// that loses the prescription, an undo that restores half, or a model op
// outside the schema would corrupt the program silently. Models decide,
// code acts — and this is the code, so it gets the tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'coachplan-data-'));
// The state-file cache is per module, not per vault path (vaultStateFile.js);
// without this, a second scratch vault seeded inside the grace window reads
// the first one's cached library and never writes its own file.
process.env.NOVA_VAULT_GRACE_MS = '0';

const { applyOps, opsFromFix, validateOps, swapEntry, readMarkers, buildAmendPrompt } = await import('../lib/coachPlan.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines, updateRoutine } = await import('../lib/workouts.js');
const { undoFiling } = await import('../lib/inbox.js');

async function seedVault() {
  const dir = await mkdtemp(path.join(tmpdir(), 'coachplan-'));
  await mkdir(path.join(dir, 'Wiki', 'Health'), { recursive: true });
  const pullup = await addCustomExercise(dir, 'Pull-Up', 'Back', 'bodyweight_reps');
  const flys = await addCustomExercise(dir, 'Cable Flys Low Position', 'Chest', 'weight_reps');
  const incline = await addCustomExercise(dir, 'Incline Barbell Bench Press', 'Chest', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(dir);
  const routine = await createRoutine(dir, exercises, 'Push Day', [
    { exerciseId: flys.id, targetSets: 4, targetRepsLow: 10, targetRepsHigh: 12 },
    { exerciseId: pullup.id, targetSets: 3, targetRepsLow: 12, targetRepsHigh: 12 },
  ]);
  return { dir, pullup, flys, incline, routine };
}

test('his exact coach card: swap Cable Flys for Incline Bench, prescription intact', async () => {
  const { dir, flys, incline, routine } = await seedVault();
  try {
    const routinesFile = path.join(dir, 'Wiki/Health/Workout Routines.md');
    const routinesRawBefore = await readFile(routinesFile, 'utf8');
    const ops = opsFromFix({ action: 'swap', exerciseId: flys.id, replaceWith: incline.id });
    const { summary, undo } = await applyOps(dir, ops, { why: 'same stimulus, same result' });
    assert.equal(undo.changes.length, 1, 'the undo carries the routines file, and only that');
    assert.equal(undo.changes[0].prior, routinesRawBefore, 'with its exact prior bytes');
    assert.match(summary, /swapped Cable Flys Low Position → Incline Barbell Bench Press/);

    const { exercises } = await loadExerciseLibrary(dir);
    const { routines } = await loadRoutines(dir, exercises);
    const entry = routines[0].exercises.find((e) => e.exerciseId === incline.id);
    assert.ok(entry, 'the new exercise is in the plan');
    assert.equal(entry.targetSets, 4, 'sets survive the swap');
    assert.equal(entry.targetRepsLow, 10, 'reps survive the swap');
    assert.ok(!routines[0].exercises.some((e) => e.exerciseId === flys.id), 'the old one is out');

    // the highlight exists, so he never has to remember the change was made
    const markers = await readMarkers();
    assert.ok(markers[`${routine.id}:${incline.id}`], 'COACH marker set');
    assert.match(markers[`${routine.id}:${incline.id}`].why, /same stimulus/);

    // UNDO restores the exact prior program and clears the highlight
    const msg = await undoFiling(dir, undo);
    assert.match(msg, /restored 1 routine/);
    const after = await loadRoutines(dir, (await loadExerciseLibrary(dir)).exercises);
    assert.ok(after.routines[0].exercises.some((e) => e.exerciseId === flys.id), 'Cable Flys is back');
    assert.equal(await readFile(routinesFile, 'utf8'), routinesRawBefore, 'the file is back BYTE-EXACT, not re-rendered');
    const cleared = await readMarkers();
    assert.equal(cleared[`${routine.id}:${incline.id}`], undefined, 'highlight cleared');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a change that dies mid-way lands nothing: the library is rolled back and no highlight is set', async () => {
  const { dir, pullup, routine } = await seedVault();
  const routinesFile = path.join(dir, 'Wiki/Health/Workout Routines.md');
  const libraryFile = path.join(dir, 'Wiki/Health/Exercise Library.md');
  try {
    // a weighted-variant writes the library FIRST, then the routines; a
    // read-only routines file makes the second write fail after the first landed
    const libraryBefore = await readFile(libraryFile, 'utf8');
    const routinesBefore = await readFile(routinesFile, 'utf8');
    await chmod(routinesFile, 0o444);
    await assert.rejects(
      () => applyOps(dir, opsFromFix({ action: 'weighted-variant', exerciseId: pullup.id }), { why: 'outgrown' }),
      /the 1 file already written was put back; the vault is as it was/,
    );
    assert.equal(await readFile(libraryFile, 'utf8'), libraryBefore, 'the new exercise never landed on disk');
    assert.equal(await readFile(routinesFile, 'utf8'), routinesBefore, 'the plan is untouched');
    const { exercises } = await loadExerciseLibrary(dir);
    assert.ok(!exercises.some((e) => e.name === 'Weighted Pull-Up'), 'and the process cache agrees with the disk');
    const markers = await readMarkers();
    assert.ok(!Object.keys(markers).some((k) => k.startsWith(`${routine.id}:`)), 'no highlight for a change that never happened');
  } finally {
    await chmod(routinesFile, 0o644).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('a record filed before the staged pass still undoes by its prior entries', async () => {
  const { dir, flys, incline, routine } = await seedVault();
  try {
    const { exercises } = await loadExerciseLibrary(dir);
    const priorEntries = (await loadRoutines(dir, exercises)).routines
      .find((r) => r.id === routine.id).exercises
      .map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh }));
    await updateRoutine(dir, exercises, routine.id, { exercises: [{ exerciseId: incline.id, targetSets: 4, targetRepsLow: 10, targetRepsHigh: 12 }] });
    const msg = await undoFiling(dir, { kind: 'coach-plan', routines: [{ routineId: routine.id, entries: priorEntries }], markerKeys: [] });
    assert.match(msg, /restored 1 routine/);
    const after = await loadRoutines(dir, exercises);
    assert.ok(after.routines.find((r) => r.id === routine.id).exercises.some((e) => e.exerciseId === flys.id), 'the legacy shape still restores');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('his exact focus case: Pull-Up outgrown → Weighted Pull-Up with a low start', async () => {
  const { dir, pullup, routine } = await seedVault();
  try {
    const ops = opsFromFix({ action: 'weighted-variant', exerciseId: pullup.id });
    const { summary } = await applyOps(dir, ops, { why: 'outgrown — add load' });
    assert.match(summary, /Weighted Pull-Up/);
    assert.match(summary, /5kg/);

    const { exercises } = await loadExerciseLibrary(dir);
    const weighted = exercises.find((e) => e.name === 'Weighted Pull-Up');
    assert.ok(weighted, 'the weighted variant exists in the library');
    assert.equal(weighted.trackingType, 'weighted_bodyweight_reps', 'tracks added load, not just reps');
    assert.equal(weighted.muscleGroup, 'Back', 'inherits the muscle group');

    const { routines } = await loadRoutines(dir, exercises);
    const entry = routines[0].exercises.find((e) => e.exerciseId === weighted.id);
    assert.ok(entry, 'swapped into the plan');
    assert.equal(entry.targetSets, 3, 'prescription carried over');
    assert.ok(!routines[0].exercises.some((e) => e.exerciseId === pullup.id), 'bodyweight version is out');

    const markers = await readMarkers();
    assert.equal(markers[`${routine.id}:${weighted.id}`].startWeightKg, 5, 'the starting load rides the highlight');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('swapping toward an exercise already in the routine removes, never duplicates', () => {
  const entries = [
    { exerciseId: 'a', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
    { exerciseId: 'b', targetSets: 4, targetRepsLow: 6, targetRepsHigh: 10 },
  ];
  const out = swapEntry(entries, 'a', 'b');
  assert.equal(out.length, 1, 'no duplicate entry');
  assert.equal(out[0].exerciseId, 'b');
  // and an exercise not present is a null, not a silent no-op write
  assert.equal(swapEntry(entries, 'zzz', 'b'), null);
});

test('the op schema is a wall: unknown or oversized op lists are refused', () => {
  assert.throws(() => validateOps([{ op: 'delete-everything' }]), /unknown operation/);
  assert.throws(() => validateOps([]), /no operations/);
  assert.throws(() => validateOps(Array.from({ length: 13 }, () => ({ op: 'swap' }))), /too many/);
  assert.throws(() => validateOps('not an array'), /no operations/);
});

test('a swap against an exercise in no routine fails loudly, never silently', async () => {
  const { dir, incline } = await seedVault();
  try {
    const ghost = await addCustomExercise(dir, 'Ghost Lift', 'Chest', 'weight_reps');
    await assert.rejects(
      () => applyOps(dir, [{ op: 'swap', exerciseId: ghost.id, replaceWith: incline.id }]),
      /not in any routine/,
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('opsFromFix: observations without a mechanical fix stay a conversation', () => {
  assert.equal(opsFromFix({ action: 'add-sets', muscle: 'Triceps', target: 12 }), null);
  assert.equal(opsFromFix(null), null);
  assert.equal(opsFromFix({}), null);
  assert.ok(opsFromFix({ action: 'remap', exerciseId: 'x', muscleGroup: 'Back' }));
});

test('the amend prompt pins the rules: his words win, ops only, [] is a real answer', () => {
  const prompt = buildAmendPrompt({
    proposal: 'Swap flys for incline bench',
    note: 'add the new one but keep the old one',
    routines: [{ id: 'r1', name: 'Push', exercises: [{ exerciseId: 'flys', targetSets: 4, targetRepsLow: 10, targetRepsHigh: 12 }] }],
    exercises: [{ id: 'flys', name: 'Cable Flys', muscleGroup: 'Chest' }],
  });
  assert.match(prompt, /his instruction always wins/);
  assert.match(prompt, /ONLY a JSON array of operations/);
  assert.match(prompt, /empty array means no change/);
  assert.match(prompt, /a change you cannot express in these does not happen/i);
  assert.ok(prompt.includes('"add the new one but keep the old one"'), 'his words are in front of the model');
});
