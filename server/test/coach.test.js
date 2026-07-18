// Coach progression engine — temp vault BEFORE imports (see healthData.test.js).
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-coach-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { computeProgressions, WEIGHT_STEP_KG } = await import('../lib/coach.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

const routines = [{
  id: 'push',
  exercises: [
    { exerciseId: 'bench', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
    { exerciseId: 'ohp', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
    { exerciseId: 'dips', trackingType: 'bodyweight_reps', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
    { exerciseId: 'plank', trackingType: 'bodyweight_time', targetSets: 3, targetRepsLow: 45, targetRepsHigh: 60 },
  ],
}];

function session(date, exercises) {
  return matter.stringify('# Push\n', {
    type: 'workout-session', id: `s-${date}`, date, routineId: 'push', routineName: 'Push',
    finishedAt: `${date}T10:00:00.000Z`, exercises,
  });
}

test('progressions: earned after two topped-out sessions, withheld otherwise, typed by tracking', async () => {
  const dir = path.join(vault, 'Wiki/Health/Workouts');
  await mkdir(dir, { recursive: true });

  // bench: both sessions topped out (3 sets, all ≥ 10 reps) → +2.5kg
  // ohp: latest session has a set below target-high → no progression
  // dips: bodyweight, both topped out → +1 rep
  // plank: time-based → never suggested
  const sets = (weight, reps, n = 3) => Array.from({ length: n }, () => ({ weight, reps }));
  await writeFile(path.join(dir, '2026-07-10 push.md'), session('2026-07-10', [
    { exerciseId: 'bench', name: 'Bench Press', sets: sets(80, 10) },
    { exerciseId: 'ohp', name: 'Overhead Press', sets: sets(50, 10) },
    { exerciseId: 'dips', name: 'Dips', sets: sets(0, 12) },
    { exerciseId: 'plank', name: 'Plank', sets: sets(0, 60) },
  ]), 'utf8');
  await writeFile(path.join(dir, '2026-07-14 push.md'), session('2026-07-14', [
    { exerciseId: 'bench', name: 'Bench Press', sets: sets(80, 11) },
    { exerciseId: 'ohp', name: 'Overhead Press', sets: [...sets(50, 10, 2), { weight: 50, reps: 8 }] },
    { exerciseId: 'dips', name: 'Dips', sets: sets(0, 13) },
    { exerciseId: 'plank', name: 'Plank', sets: sets(0, 60) },
  ]), 'utf8');

  const prog = await computeProgressions(vault, routines);
  assert.deepEqual(Object.keys(prog).sort(), ['push:bench', 'push:dips']);
  assert.equal(prog['push:bench'].kind, 'weight');
  assert.equal(prog['push:bench'].delta, WEIGHT_STEP_KG);
  assert.match(prog['push:bench'].evidence, /at 80kg/);
  assert.deepEqual(prog['push:dips'], { kind: 'reps', delta: 1, evidence: prog['push:dips'].evidence });
  assert.match(prog['push:dips'].evidence, /topped 12 reps/);
});

test('progressions: a single session is never enough, and short set counts don\'t qualify', async () => {
  const dir = path.join(vault, 'Wiki/Health/Workouts');
  // squat appears in only one session; rows topped reps but only 2 of 3 sets
  await writeFile(path.join(dir, '2026-07-15 legs.md'), session('2026-07-15', [
    { exerciseId: 'squat', name: 'Squat', sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }] },
    { exerciseId: 'rows', name: 'Rows', sets: [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }] },
  ]), 'utf8');
  await writeFile(path.join(dir, '2026-07-11 legs.md'), session('2026-07-11', [
    { exerciseId: 'rows', name: 'Rows', sets: [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }] },
  ]), 'utf8');

  const legRoutines = [{
    id: 'legs',
    exercises: [
      { exerciseId: 'squat', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
      { exerciseId: 'rows', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
    ],
  }];
  const prog = await computeProgressions(vault, legRoutines);
  assert.equal(prog['legs:squat'], undefined, 'one session is not a trend');
  assert.equal(prog['legs:rows'], undefined, 'fewer sets than target does not top out');
});
