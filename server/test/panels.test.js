// Companion canvas panels — the model names a view, deterministic code
// draws it from the vault. Temp vault + data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-panels-vault-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-panels-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { parseShowDirective, buildPanel } = await import('../lib/panels.js');
const { addCustomExercise } = await import('../lib/exercises.js');
const { createRoutine, setScheduleDay, WEEKDAYS, loadRoutines } = await import('../lib/workouts.js');
const { loadExerciseLibrary } = await import('../lib/exercises.js');
const { completeSession } = await import('../lib/workoutSessions.js');
const { saveDay } = await import('../lib/nutritionLog.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

test('parseShowDirective extracts and strips the trailing SHOW line', () => {
  const { cleanText, directive } = parseShowDirective('Here is your week.\n\nSHOW {"panel":"training-week"}');
  assert.equal(cleanText, 'Here is your week.');
  assert.deepEqual(directive, { panel: 'training-week' });

  const none = parseShowDirective('No panel here.');
  assert.equal(none.directive, null);
  assert.equal(none.cleanText, 'No panel here.');

  // malformed JSON degrades to no directive, text kept whole minus the junk line
  const bad = parseShowDirective('Reply.\nSHOW {broken');
  assert.equal(bad.directive, null);
});

test('unknown panel type throws honestly', async () => {
  await assert.rejects(() => buildPanel(vault, { panel: 'net-worth' }), /unknown panel/);
});

test('exercise panel: real history, honest error for unknown names', async () => {
  const bench = await addCustomExercise(vault, 'Bench Press', 'Chest', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(vault);
  const routine = await createRoutine(vault, exercises, 'Push', [
    { exerciseId: bench.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
  ]);
  await completeSession(vault, {
    routineId: routine.id, routineName: 'Push',
    exercises: [{ exerciseId: bench.id, name: 'Bench Press', sets: [
      { weight: 80, reps: 8, done: true }, { weight: 80, reps: 8, done: true },
    ] }],
  });

  const panel = await buildPanel(vault, { panel: 'exercise', name: 'bench press' }); // ci match
  assert.equal(panel.type, 'exercise');
  assert.equal(panel.data.name, 'Bench Press');
  assert.deepEqual(panel.data.inRoutines, ['Push']);
  assert.equal(panel.data.recent.length, 1);
  assert.match(panel.data.recent[0].sets, /80×8/);
  assert.ok(panel.data.e1rm.value > 80, 'e1RM estimated from the real sets');

  await assert.rejects(() => buildPanel(vault, { panel: 'exercise', name: 'Cable Flye' }), /no exercise called/);
  await assert.rejects(() => buildPanel(vault, { panel: 'exercise' }), /needs a name/);
});

test('training-week panel: 7 days, schedule vs actually-done from the log', async () => {
  const { exercises } = await loadExerciseLibrary(vault);
  const { routines } = await loadRoutines(vault, exercises);
  for (const d of WEEKDAYS) await setScheduleDay(vault, exercises, d, routines[0].id);

  const panel = await buildPanel(vault, { panel: 'training-week' });
  assert.equal(panel.data.days.length, 7);
  const today = panel.data.days[6];
  assert.equal(today.isToday, true);
  assert.equal(today.planned, 'Push', 'schedule name resolved');
  assert.equal(today.done.length, 1, "today's completed session shows as done");
  assert.equal(today.done[0].sets, 2);
  assert.equal(panel.data.days[0].done.length, 0, 'six days ago: nothing invented');
});

test('nutrition-week panel: real days, floor from the log, missing days honest', async () => {
  const d = new Date();
  const iso = (offset) => { const x = new Date(d); x.setDate(x.getDate() - offset); return x.toISOString().slice(0, 10); };
  await saveDay(iso(1), { p: 160, c: 300, f: 70, kcal: 2470 }, 150);
  await saveDay(iso(0), { p: 120, c: 250, f: 60, kcal: 2020 }, 150);

  const panel = await buildPanel(vault, { panel: 'nutrition-week' });
  assert.equal(panel.data.floor, 150, 'floor read from the log itself');
  assert.equal(panel.data.metCount, 1);
  assert.equal(panel.data.trackedCount, 2);
  assert.equal(panel.data.avgP, 140);
  const met = panel.data.days.find((x) => x.p === 160);
  assert.equal(met.floorMet, true);
});
