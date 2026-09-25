// SIMPLE CHANGES CANNOT GO WRONG (25 Sep 2026). His Coach chat, 11:01–11:26
// AEST: he asked to bring Upper Body closer to an hour. Six of Coach's twelve
// PROPOSE lines were refused because an "add" named its exercise in
// `exercise`; a move was a remove card plus an add card, so his yes to the
// remove deleted the rope extension outright; Coach twice put a curl on his
// Push day; and the add that finally landed went to the end of Push, not
// "straight after the incline bench". What must hold now, on his real shape
// of program:
//   - the field Coach reaches for is accepted, and nothing is guessed
//   - a move is ONE card that changes both routines in one write, undoable
//   - an add or a move lands where the card says
//   - a suggestion that breaks his split is refused with where it belongs
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-changesright-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-changesright-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateCoachEdit, normaliseProposal, splitMisfit, splitRulesLine } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { readMarkers } = await import('../lib/coachPlan.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const ex = {};
for (const [name, group] of [
  ['Incline Barbell Bench Press', 'Chest'], ['Rope Overhead Tricep Extension', 'Triceps'], ['Carter Extension', 'Triceps'],
  ['Cable Lateral Raise (behind back, wrist height)', 'Shoulders'], ['Face Pull', 'Shoulders'],
  ['Weighted Pull-Up', 'Back'], ['Cable Hammer Curls', 'Biceps'], ['Spider Curl', 'Biceps'], ['EZ-Bar Reverse Curl', 'Forearms'],
  ['Barbell Bench Press', 'Chest'], ['Wide-Grip Lat Pulldown', 'Back'], ['Cable Bicep Curl', 'Biceps'], ['Alternate Incline Dumbbell Curl', 'Biceps'],
  ['Hack Squat', 'Quads'], ['Hamstring Lying Leg Curls', 'Hamstrings'], ['Rear Delt Fly', 'Shoulders'], ['Hanging Leg Raise', 'Abs'],
]) ex[name] = await addCustomExercise(vault, name, group, 'weight_reps');
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const e = (name, sets = 3, low = 8, high = 12) => ({ exerciseId: ex[name].id, targetSets: sets, targetRepsLow: low, targetRepsHigh: high });
const push = await createRoutine(vault, await lib(), 'Push', [e('Incline Barbell Bench Press', 3, 6, 10), e('Cable Lateral Raise (behind back, wrist height)', 3, 8, 9), e('Carter Extension'), e('Face Pull', 3, 12, 12)]);
const pull = await createRoutine(vault, await lib(), 'Pull', [e('Weighted Pull-Up', 3, 12, 12), e('Cable Hammer Curls', 3, 5, 7), e('Spider Curl', 3, 8, 10), e('EZ-Bar Reverse Curl', 3, 9, 9)]);
const upper = await createRoutine(vault, await lib(), 'Upper Body', [e('Barbell Bench Press', 3, 6, 8), e('Wide-Grip Lat Pulldown', 3, 8, 9), e('Rope Overhead Tricep Extension', 3, 6, 7), e('Cable Bicep Curl', 3, 6, 8), e('Alternate Incline Dumbbell Curl', 3, 6, 6)]);
const legs = await createRoutine(vault, await lib(), 'Leg Day', [e('Hack Squat', 3, 12, 12), e('Hamstring Lying Leg Curls', 3, 5, 10)]);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const order = async (id) => (await loadRoutines(vault, await lib())).routines.find((r) => r.id === id).exercises.map((x) => x.name);
const refusal = async (p) => {
  try { await validateCoachEdit(vault, p); } catch (err) { return err; }
  assert.fail(`expected a refusal for ${JSON.stringify(p)}`);
};

test('his exact 11:17 line — an add that names its exercise in "exercise" — is now a card', async () => {
  const line = { action: 'add', routine: 'Push', exercise: 'Rope Overhead Tricep Extension', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12, reason: 'Completes the agreed move from Upper Body.', instructed: true };
  const { payload, title } = await validateCoachEdit(vault, line);
  assert.equal(payload.addExerciseId, ex['Rope Overhead Tricep Extension'].id);
  assert.equal(title, 'Coach: add Rope Overhead Tricep Extension to Push');
  // and the other shapes a model reaches for
  assert.equal(normaliseProposal({ action: 'Drop', routine: 'Push', name: 'Face Pull' }).action, 'remove');
  assert.equal(normaliseProposal({ action: 'drop', routine: 'Push', name: 'Face Pull' }).exercise, 'Face Pull');
  assert.deepEqual(
    (({ from, to, exercise }) => ({ from, to, exercise }))(normaliseProposal({ action: 'move', routine: 'Upper Body', to: 'Push', exercise: 'X' })),
    { from: 'Upper Body', to: 'Push', exercise: 'X' }, 'the named end is "to", so "routine" is where it comes from');
});

test('nothing is guessed: no name, no routine, or a name that fits several are refused, never a first match', async () => {
  // before: "".includes is always true, so this removed Push's FIRST exercise
  assert.match((await refusal({ action: 'remove', routine: 'Push' })).message, /names no exercise in Push/);
  assert.match((await refusal({ action: 'add', add: 'Face Pull' })).message, /name the routine/);
  assert.match((await refusal({ action: 'remove', routine: 'Pull', exercise: 'Curl' })).message, /fits 2 in Pull \(Cable Hammer Curls, Spider Curl\)|fits 3 in Pull/);
  // a name in the wrong routine says where it actually is
  assert.match((await refusal({ action: 'remove', routine: 'Push', exercise: 'Rope Overhead Tricep Extension' })).message, /isn't in Push .*it is in Upper Body/);
  // punctuation and case are not a different exercise
  const { payload } = await validateCoachEdit(vault, { action: 'remove', routine: 'upper body', exercise: 'wide grip lat pulldown' });
  assert.equal(payload.removeExerciseId, ex['Wide-Grip Lat Pulldown'].id);
});

test('a move is ONE card: both routines change in one write, it lands where it says, and one undo puts both back', async () => {
  const beforePush = await order(push.id);
  const beforeUpper = await order(upper.id);
  const { payload, title } = await validateCoachEdit(vault, {
    action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push',
    after: 'Incline Barbell Bench Press', targetRepsLow: 8, targetRepsHigh: 12, reason: 'triceps belong on Push',
  });
  assert.equal(title, 'Coach: move Rope Overhead Tricep Extension from Upper Body to Push, after Incline Barbell Bench Press, at 3 × 8–12');
  assert.equal(payload.routineId, push.id, 'the card belongs to where the exercise lands');
  assert.equal(payload.fromRoutineId, upper.id);
  const { destination, undo } = await fileDecision(vault, { route: 'routine-edit', confidence: 'high', title, reason: 'x', payload });
  assert.match(destination, /moved Rope Overhead Tricep Extension from Upper Body to Push, number 2/);
  assert.deepEqual(await order(push.id), ['Incline Barbell Bench Press', 'Rope Overhead Tricep Extension', 'Cable Lateral Raise (behind back, wrist height)', 'Carter Extension', 'Face Pull']);
  assert.ok(!(await order(upper.id)).includes('Rope Overhead Tricep Extension'), 'and it is gone from where it came from');
  const moved = (await loadRoutines(vault, await lib())).routines.find((r) => r.id === push.id).exercises[1];
  assert.equal(moved.targetRepsLow, 8, 'the new targets came with it');
  assert.ok((await readMarkers())[`${push.id}:${ex['Rope Overhead Tricep Extension'].id}`], 'the plan shows Coach put it there');
  assert.match(await undoFiling(vault, undo), /restored Upper Body and Push/);
  assert.deepEqual(await order(push.id), beforePush);
  assert.deepEqual(await order(upper.id), beforeUpper);
  assert.equal((await readMarkers())[`${push.id}:${ex['Rope Overhead Tricep Extension'].id}`], undefined, 'and the highlight goes with the undo');
});

test('an add lands where the card says, not always last', async () => {
  const first = await validateCoachEdit(vault, { action: 'add', routine: 'Push', add: 'Rear Delt Fly', position: 'first' });
  assert.equal(first.title, 'Coach: add Rear Delt Fly to Push, first');
  const after = await validateCoachEdit(vault, { action: 'add', routine: 'Push', add: 'Rear Delt Fly', position: 'after Carter Extension' });
  assert.equal(after.title, 'Coach: add Rear Delt Fly to Push, after Carter Extension');
  const before = await order(push.id);
  const { undo } = await fileDecision(vault, { route: 'routine-edit', confidence: 'high', title: after.title, reason: 'x', payload: after.payload });
  assert.deepEqual(await order(push.id), ['Incline Barbell Bench Press', 'Cable Lateral Raise (behind back, wrist height)', 'Carter Extension', 'Rear Delt Fly', 'Face Pull']);
  await undoFiling(vault, undo);
  assert.deepEqual(await order(push.id), before);
  const end = await validateCoachEdit(vault, { action: 'add', routine: 'Push', add: 'Rear Delt Fly' });
  assert.equal(end.payload.position, null, 'no place named = the end, which stays the end');
  assert.match((await refusal({ action: 'add', routine: 'Push', add: 'Rear Delt Fly', after: 'Hack Squat' })).message, /"Hack Squat" isn't in Push/);
});

test('his split is checked: a curl onto Push is refused, with where it belongs; his own instruction is his call', async () => {
  const curl = await refusal({ action: 'move', exercise: 'Cable Bicep Curl', from: 'Upper Body', to: 'Push' });
  assert.equal(curl.kind, 'substance');
  assert.match(curl.message, /Cable Bicep Curl trains Biceps, and Push is a push day \(Chest, Shoulders, Triceps\)/);
  assert.match(curl.message, /belongs on Pull or Upper Body/);
  const incline = await refusal({ action: 'add', routine: 'Push', exercise: 'Alternate Incline Dumbbell Curl' });
  assert.equal(incline.kind, 'substance');
  const legDay = await refusal({ action: 'add', routine: 'Leg Day', add: 'Rear Delt Fly' });
  assert.match(legDay.message, /Leg Day is a leg day/);
  // what fits, fits
  await validateCoachEdit(vault, { action: 'add', routine: 'Leg Day', add: 'Hanging Leg Raise' });
  await validateCoachEdit(vault, { action: 'move', exercise: 'Cable Bicep Curl', from: 'Upper Body', to: 'Pull' });
  // HE asked for it: allowed
  await validateCoachEdit(vault, { action: 'move', exercise: 'Cable Bicep Curl', from: 'Upper Body', to: 'Push', instructed: true });
  assert.equal(splitMisfit('Upper Body', 'Quads')?.day, 'an upper-body day');
  assert.equal(splitMisfit('Full Body', 'Biceps'), null, 'a routine whose name promises no split is not checked');
  assert.match(splitRulesLine([{ name: 'Push' }, { name: 'Pull' }]), /Push holds Chest, Shoulders, Triceps; Pull holds Back, Biceps, Forearms, Shoulders/);
});

test('changes that change nothing, or duplicate, are refused as substance', async () => {
  assert.equal((await refusal({ action: 'add', routine: 'Push', add: 'Carter Extension' })).kind, 'substance');
  assert.equal((await refusal({ action: 'move', exercise: 'Carter Extension', from: 'Push', to: 'Push' })).kind, 'substance');
  assert.equal((await refusal({ action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 })).kind, 'substance');
  assert.match((await refusal({ action: 'targets', routine: 'Push', exercise: 'Carter Extension' })).message, /needs targetSets/);
  assert.equal((await refusal({ action: 'swap', routine: 'Push', remove: 'Face Pull', add: 'Carter Extension' })).kind, 'substance');
  assert.match((await refusal({ action: 'add', routine: 'Push', add: 'Zottman Kickback Hybrid' })).message, /give its "muscleGroup"/, 'a brand-new exercise must say what it trains, or it counts for nothing');
  await validateCoachEdit(vault, { action: 'add', routine: 'Push', add: 'Zottman Kickback Hybrid', muscleGroup: 'Shoulders' });
  // unrelated to the split: Legs keeps its two exercises
  void legs; void pull;
});
