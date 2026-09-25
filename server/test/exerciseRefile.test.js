// Re-filing an exercise on his word (lib/exerciseRefile.js): his case, the
// EZ-Bar Reverse Curl filed under Biceps when it is a forearm lift. It must
// move every past set with it, land in the Inbox as a filed record, and come
// back with one Undo.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-refile-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-refile-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { refileExercise } = await import('../lib/exerciseRefile.js');
const { undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { weeklyMuscleVolume } = await import('../lib/trainingAnalytics.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const curl = await addCustomExercise(vault, 'EZ-Bar Reverse Curl', 'Biceps', 'weight_reps');
const groupOf = async () => (await loadExerciseLibrary(vault)).exercises.find((e) => e.id === curl.id).muscleGroup;
const WEDNESDAY = [{ date: '2026-09-23', exercises: [{ exerciseId: curl.id, sets: [{ weight: 30, reps: 8 }, { weight: 30, reps: 5 }, { weight: 30, reps: 4 }] }] }];

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('his case: the reverse curl moves to Forearms, and its logged sets move with it', async () => {
  const before = weeklyMuscleVolume(WEDNESDAY, (await loadExerciseLibrary(vault)).exercises)[0].groups;
  assert.deepEqual(before, { Biceps: 3 });

  const out = await refileExercise(vault, curl.id, 'Forearms');
  assert.equal(out.before, 'Biceps');
  assert.equal(await groupOf(), 'Forearms');
  const after = weeklyMuscleVolume(WEDNESDAY, (await loadExerciseLibrary(vault)).exercises)[0].groups;
  assert.deepEqual(after, { Forearms: 3 }, 'the week recounts from the library, no session rewritten');

  const rec = await getRecord(out.record.id);
  assert.equal(rec.status, 'filed');
  assert.match(rec.destination, /EZ-Bar Reverse Curl filed under Forearms \(was Biceps\)/);
  assert.deepEqual(rec.undoData, { kind: 'exercise-muscle-group', exerciseId: curl.id, muscleGroup: 'Biceps' });
});

test('one Undo in the Inbox puts it back', async () => {
  const out = await refileExercise(vault, curl.id, 'Biceps'); // back to a known start
  assert.equal(await groupOf(), 'Biceps');
  const again = await refileExercise(vault, curl.id, 'Forearms');
  await undoRecord(vault, again.record.id);
  assert.equal(await groupOf(), 'Biceps');
  assert.equal((await getRecord(again.record.id)).status, 'undone');
  assert.ok(out.record, 'each real change files its own record');
});

test('asking for the group it already has changes nothing and files nothing', async () => {
  const out = await refileExercise(vault, curl.id, 'Biceps');
  assert.equal(out.unchanged, true);
  assert.equal(out.record, null);
});

test('an unknown exercise or muscle is refused before anything is written', async () => {
  await assert.rejects(() => refileExercise(vault, 'no-such-lift', 'Forearms'), /no such exercise/);
  await assert.rejects(() => refileExercise(vault, curl.id, 'Wrists'), /muscleGroup must be one of/);
  assert.equal(await groupOf(), 'Biceps');
});
