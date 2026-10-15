// Archive, restore, reorder and rename of routines (16 Oct 2026). An archived
// routine is invisible to every reader of loadRoutines, keeps its lifts and
// id, and comes back whole. The vault is a temp dir, never his.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-shelf-data-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-shelf-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const W = await import('../lib/workouts.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const lib = [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }, { id: 'row', name: 'Row', muscleGroup: 'Lats' }];
const lift = [{ exerciseId: 'bench', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 }];

const names = async () => (await W.loadRoutines(vault, lib)).routines.map((r) => r.name);

test('archive hides a routine from loadRoutines and the schedule, keeps it on the shelf', async () => {
  const push = await W.createRoutine(vault, lib, 'Push', lift);
  const pushCore = await W.createRoutine(vault, lib, 'Push Core', lift);
  await W.setScheduleDay(vault, lib, 'monday', push.id);
  await W.setScheduleDay(vault, lib, 'tuesday', pushCore.id);

  const out = await W.archiveRoutine(vault, lib, push.id);
  assert.deepEqual(out.unscheduled, ['monday']);
  assert.deepEqual(await names(), ['Push Core']);
  const { schedule } = await W.loadRoutines(vault, lib);
  assert.equal(schedule.monday, undefined, 'its day is freed');
  assert.equal(schedule.tuesday, pushCore.id, 'the other routine keeps its day');
  const shelf = await W.loadArchivedRoutines(vault);
  assert.deepEqual(shelf.map((r) => [r.id, r.name, r.lifts]), [[push.id, 'Push', 1]]);
  await assert.rejects(() => W.setScheduleDay(vault, lib, 'friday', push.id), /unknown routine id/);
  await assert.rejects(() => W.archiveRoutine(vault, lib, push.id), /already archived/);
});

test('the file keeps the archived routine, under its own heading', async () => {
  const raw = await readFile(path.join(vault, W.ROUTINES_REL_PATH), 'utf8');
  assert.match(raw, /archived: true/);
  assert.match(raw, /## Archived/);
  assert.match(raw, /### Push\n/);
  assert.doesNotMatch(raw.split('## Archived')[0], /^## Push$/m, 'not listed among the live routines');
});

test('renaming onto a live routine name is refused, onto an archived name is fine', async () => {
  await W.createRoutine(vault, lib, 'Pull', lift);
  const [core] = (await W.loadRoutines(vault, lib)).routines;
  await assert.rejects(() => W.updateRoutine(vault, lib, core.id, { name: 'pull' }), /already called/);
  const same = await W.updateRoutine(vault, lib, core.id, { name: 'Push Core' });
  assert.equal(same.name, 'Push Core', 'its own name is not a clash');
  const renamed = await W.updateRoutine(vault, lib, core.id, { name: 'Push' });
  assert.equal(renamed.name, 'Push');
  assert.deepEqual(await names(), ['Push', 'Pull']);
});

test('restore returns it whole, and renames it rather than colliding', async () => {
  const [old] = await W.loadArchivedRoutines(vault);
  const back = await W.restoreRoutine(vault, lib, old.id);
  assert.equal(back.name, 'Push (earlier)', 'a live Push already exists');
  const live = (await W.loadRoutines(vault, lib)).routines;
  const restored = live.find((r) => r.id === old.id);
  assert.equal(restored.exercises.length, 1);
  assert.equal(restored.exercises[0].exerciseId, 'bench');
  assert.deepEqual(await W.loadArchivedRoutines(vault), []);
  await assert.rejects(() => W.restoreRoutine(vault, lib, old.id), /not archived/);
});

test('reorder sets the live order, needs every id once, and leaves archived ones behind', async () => {
  const a = await W.createRoutine(vault, lib, 'Mobility', []);
  const live = (await W.loadRoutines(vault, lib)).routines;
  const ids = live.map((r) => r.id);
  const reversed = [...ids].reverse();
  await W.reorderRoutines(vault, lib, reversed);
  assert.deepEqual((await W.loadRoutines(vault, lib)).routines.map((r) => r.id), reversed);
  await assert.rejects(() => W.reorderRoutines(vault, lib, ids.slice(1)), /every live routine/);
  await assert.rejects(() => W.reorderRoutines(vault, lib, [...ids.slice(1), ids[1]]), /every live routine/);
  await assert.rejects(() => W.reorderRoutines(vault, lib, [...ids.slice(1), 'nope']), /every live routine/);

  await W.archiveRoutine(vault, lib, a.id);
  const liveNow = (await W.loadRoutines(vault, lib)).routines.map((r) => r.id);
  await W.reorderRoutines(vault, lib, [...liveNow].reverse());
  assert.deepEqual((await W.loadArchivedRoutines(vault)).map((r) => r.id), [a.id], 'still on the shelf after a reorder');
});
