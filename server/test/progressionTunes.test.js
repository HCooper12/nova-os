// Progression tuning — the feedback-becomes-behaviour store, plus its
// effect on computeProgressions and the Coach's tune proposal path.
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-tunes-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-tunes-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { getTunes, setTune, clearTune, tunesContext } = await import('../lib/progressionTunes.js');
const { computeProgressions, liveSessionContext } = await import('../lib/coach.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('tunes round-trip: set, read, prior for undo, clear-with-restore', async () => {
  assert.deepEqual(await getTunes(vault), []);
  const first = await setTune(vault, { exerciseId: 'ex-ohp', name: 'Overhead Press', stepKg: 1.25, note: '+2.5 jumps stall it' });
  assert.equal(first.prior, null);
  const second = await setTune(vault, { exerciseId: 'ex-ohp', name: 'Overhead Press', hold: true, note: 'shoulder niggle' });
  assert.equal(second.prior.stepKg, 1.25); // exact prior returned for undo
  let tunes = await getTunes(vault);
  assert.equal(tunes.length, 1);
  assert.equal(tunes[0].hold, true);
  // undo path: clear with restore puts the earlier tune back
  await clearTune(vault, 'ex-ohp', { restore: second.prior });
  tunes = await getTunes(vault);
  assert.equal(tunes[0].stepKg, 1.25);
  assert.equal(tunes[0].hold, false);
  // the vault page is real markdown a human can read
  const raw = await readFile(path.join(vault, 'Wiki/Health/Progression Tuning.md'), 'utf8');
  assert.match(raw, /Overhead Press/);
  assert.match(raw, /1\.25/);
});

test('a focus-only tune is valid and reaches context', async () => {
  await setTune(vault, { exerciseId: 'ex-lat', name: 'Lateral Raise', focus: '3s eccentric, same load' });
  const ctx = await tunesContext(vault);
  assert.match(ctx, /Lateral Raise: current focus: 3s eccentric/);
  assert.match(ctx, /Overhead Press/); // both tunes present
});

test('a tune that changes nothing is rejected', async () => {
  await assert.rejects(() => setTune(vault, { exerciseId: 'ex-x', name: 'X' }), /at least one/);
});

test('computeProgressions honours tuned step and hold', async () => {
  // two topped-out sessions for two exercises → both would earn +2.5kg
  const matter = (await import('gray-matter')).default;
  const sessionsDir = path.join(vault, 'Wiki/Health/Workouts');
  await mkdir(sessionsDir, { recursive: true });
  const sets = (weight, reps) => Array.from({ length: 3 }, () => ({ weight, reps }));
  const mkSession = (date) => matter.stringify('# Push\n', {
    type: 'workout-session', id: `s-${date}`, date, routineId: 'r1', routineName: 'Push',
    finishedAt: `${date}T10:00:00.000Z`,
    exercises: [
      { exerciseId: 'ex-bench', name: 'Bench Press', sets: sets(60, 10) },
      { exerciseId: 'ex-ohp', name: 'Overhead Press', sets: sets(40, 10) },
    ],
  });
  await writeFile(path.join(sessionsDir, '2026-08-01 Push.md'), mkSession('2026-08-01'), 'utf8');
  await writeFile(path.join(sessionsDir, '2026-08-03 Push.md'), mkSession('2026-08-03'), 'utf8');

  const routines = [{
    id: 'r1', name: 'Push',
    exercises: [
      { exerciseId: 'ex-bench', name: 'Bench Press', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
      { exerciseId: 'ex-ohp', name: 'Overhead Press', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
    ],
  }];
  // ex-ohp is tuned to 1.25 (from the earlier test); hold ex-bench entirely
  await setTune(vault, { exerciseId: 'ex-bench', name: 'Bench Press', hold: true, note: 'testing hold' });
  const prog = await computeProgressions(vault, routines);
  assert.equal(prog['r1:ex-bench'], undefined); // held — no suggestion at all
  if (prog['r1:ex-ohp']) {
    assert.equal(prog['r1:ex-ohp'].delta, 1.25); // tuned step, not 2.5
    assert.match(prog['r1:ex-ohp'].evidence, /tuned to 1\.25kg/);
  } else {
    // if the session-file format above doesn't parse, the tune logic is
    // still proven by the hold test — but flag it loudly
    assert.fail('expected ex-ohp to earn a progression from two topped-out sessions');
  }
});

test('liveSessionContext renders the mid-workout truth compactly', () => {
  const ctx = liveSessionContext({
    routineName: 'Push',
    exercises: [
      { name: 'Bench Press', sets: [{ weight: 60, reps: 10, done: true }, { weight: 60, reps: 8, rpe: 9, done: true }, { weight: 60, reps: 8, done: false }] },
      { name: 'Overhead Press', skipped: true, sets: [{ weight: 40, reps: 10, done: false }] },
      { name: 'Lateral Raise', sets: [{ weight: 10, reps: 12, done: false }] },
    ],
  });
  assert.match(ctx, /LIVE SESSION IN PROGRESS — Push, 2 sets logged/);
  assert.match(ctx, /Bench Press: 60x10, 60x8@9 \(2\/3 sets\)/);
  assert.match(ctx, /Overhead Press: SKIPPED today/);
  assert.match(ctx, /Lateral Raise: not started/);
  assert.equal(liveSessionContext(null), '');
  assert.equal(liveSessionContext({ exercises: [] }), '');
});

test('validateCoachEdit tune: resolves the exercise, rejects an empty tune', async () => {
  const { validateCoachEdit } = await import('../lib/coach.js');
  // seed a minimal exercise library page the loader can read
  const { addCustomExercise } = await import('../lib/exercises.js');
  await addCustomExercise(vault, 'Incline Dumbbell Curl', 'Biceps', 'weight_reps');
  const { payload, title } = await validateCoachEdit(vault, { action: 'tune', exercise: 'incline dumbbell curl', stepKg: 1, focus: 'slow eccentric', reason: 'small muscle, small steps' });
  assert.equal(payload.action, 'tune');
  assert.equal(payload.stepKg, 1);
  assert.equal(payload.focus, 'slow eccentric');
  assert.match(title, /tune Incline Dumbbell Curl/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'tune', exercise: 'incline dumbbell curl' }), /needs stepKg/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'tune', exercise: 'no such lift', hold: true }), /no exercise called/);
});
