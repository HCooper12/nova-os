// The plan as it stood (lib/planHistory.js): his Push changed on Friday
// after he trained Monday's, and the planned week must judge Monday by
// Monday's plan. The history is built from the snapshots taken before every
// write, plus the live file, and must outlive the snapshots' rotation.
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-planhist-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-planhist-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { stampOf, planAt, addObservation, refreshPlanHistory, loadPlanHistory } = await import('../lib/planHistory.js');

const file = (pushIds) => `---\ntype: workout-routines\nroutines:\n  - id: push\n    name: Push\n    exercises:\n${pushIds.map((id) => `      - exerciseId: ${id}\n        targetSets: 3\n        targetRepsLow: 8\n        targetRepsHigh: 12\n`).join('')}schedule:\n  monday: push\n---\n# Workout Routines\n`;
const MONDAY = ['cable-overhead-tricep-extension', 'triceps-pushdown-v-bar-attachment'];
const THURSDAY = ['cable-overhead-tricep-extension', 'triceps-pushdown-straight-bar-attachment'];
const FRIDAY = ['rope-overhead-tricep-extension', 'triceps-pushdown-straight-bar-attachment'];
const ids = (plan) => plan.routines[0].exercises.map((e) => e.exerciseId);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('a snapshot name gives the moment of the write it preceded', () => {
  assert.equal(stampOf('Workout Routines.md.2026-09-25T00-05-51-623Z.bak'), '2026-09-25T00:05:51.623Z');
  assert.equal(stampOf('Workout Routines.md.2026-09-25T00-05-51-623Z-1.bak'), '2026-09-25T00:05:51.623Z', 'a same-millisecond twin');
  assert.equal(stampOf('Workout Routines.md'), null);
});

test('planAt: the latest plan at or before the moment, the earliest known before any', () => {
  const store = { versions: [], seen: [] };
  addObservation(store, { at: '2026-09-21T00:00:00.000Z', plan: { routines: ['A'] } });
  addObservation(store, { at: '2026-09-24T00:00:00.000Z', plan: { routines: ['B'] } });
  assert.equal(addObservation(store, { at: '2026-09-24T00:00:00.000Z', plan: { routines: ['B'] } }), false, 'the same plan at the same moment is one observation');
  assert.deepEqual(planAt(store.versions, '2026-09-22T00:00:00.000Z').routines, ['A']);
  assert.deepEqual(planAt(store.versions, '2026-09-25T00:00:00.000Z').routines, ['B']);
  assert.deepEqual(planAt(store.versions, '2026-09-01T00:00:00.000Z').routines, ['A'], 'before the first: the best evidence there is');
  assert.equal(planAt([], '2026-09-22T00:00:00.000Z'), null);
});

test('snapshots and the live file become a history that places each version in time', async () => {
  const dir = path.join(vault, 'Wiki/Health/.nova-backups');
  await mkdir(dir, { recursive: true });
  // Wednesday 23:00Z: Monday's Push was replaced; Friday 01:00Z: Thursday's was
  await writeFile(path.join(dir, 'Workout Routines.md.2026-09-23T23-00-00-000Z.bak'), file(MONDAY));
  await writeFile(path.join(dir, 'Workout Routines.md.2026-09-25T01-00-00-000Z.bak'), file(THURSDAY));
  const live = path.join(vault, 'Wiki/Health/Workout Routines.md');
  await writeFile(live, file(FRIDAY));
  const t = new Date('2026-09-25T01:00:00.000Z');
  await utimes(live, t, t);

  const { versions } = await refreshPlanHistory(vault);
  assert.deepEqual(ids(planAt(versions, '2026-09-21T03:36:27.000Z')), MONDAY, "Monday's session: Monday's plan");
  assert.deepEqual(ids(planAt(versions, '2026-09-24T12:00:00.000Z')), THURSDAY);
  assert.deepEqual(ids(planAt(versions, '2026-09-25T02:00:00.000Z')), FRIDAY);

  const before = JSON.stringify(await loadPlanHistory());
  await refreshPlanHistory(vault);
  assert.equal(JSON.stringify(await loadPlanHistory()), before, 'a second pass over the same files changes nothing');

  // the snapshots rotate away; the history keeps what they said
  await rm(dir, { recursive: true, force: true });
  const { versions: kept } = await refreshPlanHistory(vault);
  assert.deepEqual(ids(planAt(kept, '2026-09-21T03:36:27.000Z')), MONDAY);
});
