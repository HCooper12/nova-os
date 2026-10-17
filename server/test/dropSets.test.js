// DROP SETS (16 Oct 2026, his ask for the lateral raise): the last n sets of a
// lift are drops, lighter and straight after the top set. What must hold: the
// structure survives every write, the session opens with it, progression reads
// the top sets only, and Coach can plan one on the rails with an exact undo.
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-drops-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-drops-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';
import { applyDrops, cleanDropSets, dropWeight, topSetCount } from '../../src/fitSets.js';

const { validateCoachEdit, computeProgressions } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const W = await import('../lib/workouts.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');

await mkdir(path.join(vault, 'Wiki/Health/Workouts'), { recursive: true });
const raise = await addCustomExercise(vault, 'Cable Lateral Raise', 'Side Delts', 'weight_reps');
const bench = await addCustomExercise(vault, 'Barbell Bench Press', 'Chest', 'weight_reps');
const { exercises } = await loadExerciseLibrary(vault);
const push = await W.createRoutine(vault, exercises, 'Push', [
  { exerciseId: bench.id, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
  { exerciseId: raise.id, targetSets: 5, targetRepsLow: 12, targetRepsHigh: 15 },
]);
const live = async () => (await W.loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).routines.find((r) => r.id === push.id);
const raiseEntry = async () => (await live()).exercises.find((e) => e.exerciseId === raise.id);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('the drop chain: 20% lighter each, to half a kilo, from the set above as it now stands', () => {
  assert.equal(dropWeight(4.5), 3.5);
  assert.equal(dropWeight(0), 0);
  const straight = Array.from({ length: 5 }, () => ({ weight: 4.5, reps: 12, done: false }));
  const out = applyDrops(straight, 4);
  assert.deepEqual(out.map((s) => s.weight), [4.5, 3.5, 3, 2.5, 2]);
  assert.deepEqual(out.map((s) => s.setType || 'working'), ['working', 'drop', 'drop', 'drop', 'drop']);
  assert.equal(straight[1].setType, undefined, 'the input is not changed');
});

test('weights he really logged as drops are kept; straight sets at one load are not mistaken for drops', () => {
  const lastTime = [{ weight: 6, reps: 15 }, { weight: 5.5, reps: 14 }, { weight: 3, reps: 12 }];
  assert.deepEqual(applyDrops(lastTime, 2, { keepRecorded: 3 }).map((s) => s.weight), [6, 5.5, 3], 'his own drop loads stand');
  const flat = [{ weight: 5, reps: 15 }, { weight: 5, reps: 14 }, { weight: 5, reps: 12 }];
  assert.deepEqual(applyDrops(flat, 2, { keepRecorded: 3 }).map((s) => s.weight), [5, 4, 3], 'straight sets at one load step down');
  assert.deepEqual(applyDrops(lastTime, 2, { keepRecorded: 0 }).map((s) => s.weight), [6, 5, 4], 'a moved top set re-derives the drops');
});

test('the count is a whole number from 1 to one less than the sets, else none; top sets are what is left', () => {
  assert.equal(cleanDropSets(4, 5), 4);
  assert.equal(cleanDropSets(5, 5), 0, 'a drop needs a top set above it');
  assert.equal(cleanDropSets(0, 5), 0);
  assert.equal(cleanDropSets('x', 5), 0);
  assert.equal(topSetCount({ targetSets: 5, dropSets: 4 }), 1);
  assert.equal(topSetCount({ targetSets: 3 }), 3);
  assert.equal(applyDrops([{ weight: 20, reps: 8 }], 1).length, 1, 'one set cannot have a drop');
});

test('the structure is stored with the routine, read back, and refused when it leaves no top set', async () => {
  await W.updateRoutine(vault, exercises, push.id, { exercises: [
    { exerciseId: bench.id, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8, dropSets: 3 },
    { exerciseId: raise.id, targetSets: 5, targetRepsLow: 12, targetRepsHigh: 15, dropSets: 4 },
  ] });
  assert.equal((await raiseEntry()).dropSets, 4);
  assert.equal((await live()).exercises.find((e) => e.exerciseId === bench.id).dropSets, undefined, '3 of 3 is no structure');
  const raw = await readFile(path.join(vault, W.ROUTINES_REL_PATH), 'utf8');
  assert.match(raw, /dropSets: 4/);
  assert.match(raw, /5 × 12-15 \(1 top, 4 drop\)/);
});

test('progression reads the top sets only: easy drops cannot earn the weight, a topped-out top set can', async () => {
  const dir = path.join(vault, 'Wiki/Health/Workouts');
  const sess = (date, sets) => matter.stringify('# Push\n', {
    type: 'workout-session', id: `s-${date}`, date, routineId: push.id, routineName: 'Push',
    finishedAt: `${date}T10:00:00.000Z`, exercises: [{ exerciseId: raise.id, name: 'Cable Lateral Raise', sets }],
  });
  const drops = (top) => [
    { weight: 4.5, reps: top }, { weight: 3.5, reps: 15, setType: 'drop' }, { weight: 3, reps: 15, setType: 'drop' },
    { weight: 2.5, reps: 15, setType: 'drop' }, { weight: 2, reps: 15, setType: 'drop' },
  ];
  const routines = [await live()];
  // top set short of 15 both days, every drop at 15: the old rule (every set) would have fired
  await writeFile(path.join(dir, '2026-09-10 push.md'), sess('2026-09-10', drops(13)), 'utf8');
  await writeFile(path.join(dir, '2026-09-13 push.md'), sess('2026-09-13', drops(14)), 'utf8');
  assert.equal((await computeProgressions(vault, routines))[`${push.id}:${raise.id}`], undefined, 'drops do not count');
  // the top set reaches 15 both days: that earns the step on the TOP weight
  await writeFile(path.join(dir, '2026-10-10 push.md'), sess('2026-10-10', drops(15)), 'utf8');
  await writeFile(path.join(dir, '2026-10-13 push.md'), sess('2026-10-13', drops(15)), 'utf8');
  const p = (await computeProgressions(vault, routines))[`${push.id}:${raise.id}`];
  assert.equal(p.kind, 'weight');
});

test('Coach plans a drop structure on a card: it says what it does, applies, and undo restores the old entry', async () => {
  await W.updateRoutine(vault, exercises, push.id, { exercises: [
    { exerciseId: bench.id, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
    { exerciseId: raise.id, targetSets: 5, targetRepsLow: 12, targetRepsHigh: 15 },
  ] });
  const { payload, title } = await validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', dropSets: 4 });
  assert.match(title, /retarget Cable Lateral Raise in Push to 4 drop sets after the top sets/);
  assert.equal(payload.dropSets, 4);
  const withSets = await validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', targetSets: 5, targetRepsLow: 12, targetRepsHigh: 15, dropSets: 4 });
  assert.match(withSets.title, /to 5 × 12–15 \(1 top, 4 drop\)/);
  const { destination, undo } = await fileDecision(vault, { route: 'routine-edit', confidence: 'high', title, reason: 'x', payload });
  assert.ok(destination);
  assert.equal((await raiseEntry()).dropSets, 4);
  assert.equal((await raiseEntry()).targetSets, 5, 'the sets and reps are as they were');
  await undoFiling(vault, undo);
  assert.equal((await raiseEntry()).dropSets, undefined, 'undo puts the straight sets back');
});

test('a card that would leave no top set, or says nothing new, is refused before he sees it', async () => {
  await assert.rejects(() => validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', dropSets: 5 }), /keep at least one/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', targetSets: 3, dropSets: 3 }), /keep at least one/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', dropSets: 'lots' }), /dropSets is a count/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Cable Lateral Raise', dropSets: 0 }), /already/, 'clearing what is not there says nothing new');
});

test('a drop structure is not read as a week of grinding: drop sets are left out of the effort share', async () => {
  const { findEffortCeiling } = await import('../lib/coachProgramReview.js');
  const day = (date) => ({ date, exercises: [{ exerciseId: 'x', sets: [
    { weight: 20, reps: 12, rpe: 7 },
    ...Array.from({ length: 4 }, () => ({ weight: 15, reps: 15, rpe: 10, setType: 'drop' })),
  ] }] });
  const sessions = Array.from({ length: 12 }, (_, i) => day(`2026-10-${String(1 + i).padStart(2, '0')}`));
  assert.deepEqual(findEffortCeiling(sessions, { minSets: 10, share: 0.7, now: new Date('2026-10-16T12:00:00') }), [], 'the drops at RPE 10 do not make it a grinding block');
  const straight = sessions.map((s) => ({ ...s, exercises: [{ exerciseId: 'x', sets: s.exercises[0].sets.map((x) => ({ ...x, setType: undefined })) }] }));
  assert.equal(findEffortCeiling(straight, { minSets: 10, share: 0.7, now: new Date('2026-10-16T12:00:00') }).length > 0, true, 'the same effort as straight sets does flag');
});
