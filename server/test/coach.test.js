// Coach progression engine — temp vault BEFORE imports (see healthData.test.js).
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-coach-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { computeProgressions, WEIGHT_STEP_KG, normalizeQuickPlan, computeDeloadSignal } = await import('../lib/coach.js');

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

test('quick-plan normalize: maps to library ids with last-weight prefill, ad-hoc for new movements', () => {
  const library = [
    { id: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest', trackingType: 'weight_reps' },
    { id: 'row', name: 'Chest-Supported Dumbbell Row', muscleGroup: 'Back', trackingType: 'weight_reps' },
  ];
  const state = { bench: { lastSets: [{ weight: 80, reps: 8 }, { weight: 82.5, reps: 6 }] } };
  const plan = normalizeQuickPlan({
    name: '40-Minute Upper Pump',
    rationale: 'Fills the upper gap without stealing tomorrow’s legs.',
    exercises: [
      { name: 'barbell bench press', sets: 3, reps: 8, weightHint: '~80kg' }, // case-insensitive exact
      { name: 'Chest-Supported Row', sets: 3, reps: 12 }, // fuzzy contains
      { name: 'Hotel Band Pull-Apart', sets: 2, reps: 20 }, // genuinely new
    ],
  }, library, state);

  assert.equal(plan.exercises[0].exerciseId, 'bench');
  assert.equal(plan.exercises[0].sets[0].weight, 82.5, 'prefill = best logged weight');
  assert.equal(plan.exercises[0].sets[0].done, false);
  assert.equal(plan.exercises[1].exerciseId, 'row');
  assert.equal(plan.exercises[2].exerciseId, 'adhoc-hotel-band-pull-apart');
  assert.equal(plan.exercises[2].adhoc, true);
  assert.equal(plan.exercises[2].sets.length, 2);

  assert.throws(() => normalizeQuickPlan({ name: 'X', exercises: [] }, library), /incomplete/);
});

test('deload signal: date-aware — honest on thin/sparse data, fires on a real drop, quiet when steady', () => {
  // daysAgo → a dated health-day file; the signal must reason over CALENDAR
  // days, not file order (the sweep found sparse files masquerading as
  // "the last 3 days")
  const iso = (daysAgo) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const day = (daysAgo, hrv, sleep = 420) => ({ date: iso(daysAgo), hrv, sleepAsleepMinutes: sleep });

  const thin = computeDeloadSignal([day(1, 80), day(2, 82)]);
  assert.equal(thin.advise, false);
  assert.match(thin.reason, /not enough recent recovery data/);

  const dropping = computeDeloadSignal([day(6, 90), day(5, 88), day(4, 91), day(3, 89), day(2, 75), day(1, 74), day(0, 73)]);
  assert.equal(dropping.advise, true);
  assert.match(dropping.reason, /HRV is down 1\d%/);

  const steady = computeDeloadSignal([day(6, 85), day(5, 86), day(4, 84), day(3, 85), day(2, 86), day(1, 85), day(0, 84)]);
  assert.equal(steady.advise, false);
  assert.match(steady.reason, /steady/);

  const sleepless = computeDeloadSignal([day(6, 85), day(5, 85), day(4, 85), day(3, 85), day(2, 85, 300), day(1, 85, 320), day(0, 85, 310)]);
  assert.equal(sleepless.advise, true);
  assert.match(sleepless.reason, /sleep/);

  // REGRESSION (the sweep's A5): seven files spanning five weeks — the three
  // newest are 12+ days old. File-order logic saw "a drop over the last 3
  // days"; date-aware logic must refuse rather than claim recency.
  const sparse = computeDeloadSignal([
    day(34, 90), day(30, 88), day(26, 91), day(22, 89), day(18, 75), day(15, 74), day(12, 73),
  ]);
  assert.equal(sparse.advise, false, 'stale files must not fire a "last 3 days" advisory');
  assert.match(sparse.reason, /not enough recent recovery data/);

  // gaps INSIDE the window are fine — 2 of the last 3 days present still reads
  const gappy = computeDeloadSignal([
    day(9, 90), day(8, 88), day(7, 91), day(6, 89), day(5, 90), day(3, 74), day(1, 73),
  ]);
  assert.equal(gappy.advise, true, 'two genuinely recent low days against a real baseline still advises');
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
