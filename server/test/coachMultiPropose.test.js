// EVERY CHANGE, NOT JUST THE FIRST (25 Sep 2026). His program review came back
// with five changes and "tick the ones you want" — the parser read one PROPOSE
// line, and Coach could not move an exercise in the order or a routine to a
// different day at all. He approved the research brief and nothing happened.
// What must hold: every PROPOSE line becomes its own validated card; reorder
// and schedule exist, apply on the rails, and undo exactly.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-multiprop-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-multiprop-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { parseCoachProposals, validateCoachEdit, createCoachEditRecord } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines, setScheduleDay } = await import('../lib/workouts.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const fly = await addCustomExercise(vault, 'High Cable Fly', 'Chest', 'weight_reps');
const incline = await addCustomExercise(vault, 'Incline Barbell Bench', 'Chest', 'weight_reps');
const carter = await addCustomExercise(vault, 'Carter Extension', 'Triceps', 'weight_reps');
const { exercises } = await loadExerciseLibrary(vault);
const push = await createRoutine(vault, exercises, 'Push', [
  { exerciseId: fly.id, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
  { exerciseId: carter.id, targetSets: 2, targetRepsLow: 10, targetRepsHigh: 12 },
  { exerciseId: incline.id, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
]);
await setScheduleDay(vault, exercises, 'monday', push.id);
await setScheduleDay(vault, exercises, 'tuesday', push.id);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const order = async () => (await loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).routines.find((r) => r.id === push.id).exercises.map((e) => e.name);

test('every PROPOSE line is read, in order; prose and bad JSON are named, never silent', () => {
  const reply = [
    'Five changes, each below.',
    'PROPOSE {"action":"remove","routine":"Push","remove":"High Cable Fly","reason":"flat for weeks"}',
    'PROPOSE {"action":"targets","routine":"Push","exercise":"Carter Extension","targetSets":3}',
    'PROPOSE {"action":"reorder","routine":"Push","exercise":"Incline Barbell Bench","position":"first"}',
    'PROPOSE {"action":"schedule","day":"tuesday","routine":"rest"}',
    'PROPOSE {not json}',
    'PROPOSE swap: A → B',
  ].join('\n');
  const { cleanText, proposals, parseErrors } = parseCoachProposals(reply);
  assert.equal(cleanText, 'Five changes, each below.');
  assert.deepEqual(proposals.map((p) => p.action), ['remove', 'targets', 'reorder', 'schedule']);
  assert.equal(parseErrors.length, 2);
});

test('reorder: incline first, exactly as his note asked — applies, and undo restores the order', async () => {
  const { payload, title } = await validateCoachEdit(vault, { action: 'reorder', routine: 'Push', exercise: 'Incline Barbell Bench', position: 'first' });
  assert.equal(title, 'Coach: move Incline Barbell Bench to first in Push');
  await assert.rejects(() => validateCoachEdit(vault, { action: 'reorder', routine: 'Push', exercise: 'Incline Barbell Bench', position: 9 }), /position must be/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'reorder', routine: 'Push', exercise: 'High Cable Fly', position: 'first' }), /already number 1/);
  const before = await order();
  const { destination, undo } = await fileDecision(vault, { route: 'routine-edit', confidence: 'high', title, reason: 'x', payload });
  assert.match(destination, /moved Incline Barbell Bench to number 1/);
  assert.deepEqual(await order(), ['Incline Barbell Bench', 'High Cable Fly', 'Carter Extension']);
  await undoFiling(vault, undo);
  assert.deepEqual(await order(), before);
});

test('schedule: Tuesday stops being a second Push — applies, and undo puts Push back', async () => {
  const { payload, title } = await validateCoachEdit(vault, { action: 'schedule', day: 'Tuesday', routine: 'rest', reason: 'no back-to-back Push' });
  assert.equal(title, 'Coach: Tuesday → rest (was Push)');
  await assert.rejects(() => validateCoachEdit(vault, { action: 'schedule', day: 'funday', routine: 'rest' }), /day must be one of/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'schedule', day: 'monday', routine: 'Push' }), /already Push/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'schedule', day: 'friday', routine: 'Arms Day' }), /no routine called/);
  const record = await createCoachEditRecord(vault, { question: 'review my program', proposal: { action: 'schedule', day: 'tuesday', routine: 'rest' } });
  assert.equal(record.decision.route, 'schedule-edit');
  const sched = async () => (await loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).schedule;
  const { destination, undo } = await fileDecision(vault, record.decision);
  assert.match(destination, /Tuesday is now rest/);
  assert.equal((await sched()).tuesday, undefined);
  assert.match(await undoFiling(vault, undo), /put Tuesday back to Push/);
  assert.equal((await sched()).tuesday, push.id);
  assert.equal(payload.beforeName, 'Push');
});

test('a retarget card says what it changes to, not just that it changes', async () => {
  const { title } = await validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 3 });
  assert.equal(title, 'Coach: retarget Carter Extension in Push to 3 sets');
  const both = await validateCoachEdit(vault, { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 });
  assert.equal(both.title, 'Coach: retarget Carter Extension in Push to 3 × 10–12');
});
