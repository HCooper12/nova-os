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

test('skipped-exercise detection: real counts only, thin history stays quiet', async () => {
  const { detectSkippedExercises, skippedContext } = await import('../lib/coach.js');
  const routines = [{
    id: 'pull', name: 'Pull',
    exercises: [
      { exerciseId: 'row', name: 'Barbell Row' },
      { exerciseId: 'curl', name: 'Spider Curl' },
      { exerciseId: 'facepull', name: 'Face Pull' },
    ],
  }];
  const withSets = (id) => ({ exerciseId: id, sets: [{ weight: 20, reps: 10 }] });
  const sessions = [ // newest first
    { routineId: 'pull', date: '2026-07-28', exercises: [withSets('row'), withSets('facepull')] },
    { routineId: 'pull', date: '2026-07-21', exercises: [withSets('row')] },
    { routineId: 'pull', date: '2026-07-14', exercises: [withSets('row'), withSets('curl'), withSets('facepull')] },
    { routineId: 'push', date: '2026-07-27', exercises: [withSets('bench')] },
  ];

  const skipped = detectSkippedExercises(routines, sessions);
  const names = skipped.map((s) => s.name);
  assert.deepEqual(names, ['Spider Curl'], 'only the exercise missing twice is flagged');
  assert.equal(skipped[0].missed, 2);
  assert.equal(skipped[0].of, 3, 'counted against sessions of THAT routine only');
  assert.equal(skipped[0].lastDoneDate, '2026-07-14', 'says when it last actually happened');

  const ctx = skippedContext(skipped);
  assert.match(ctx, /Spider Curl in Pull — missing from 2 of the last 3 sessions \(last done 2026-07-14 — a real drop-off\)/);
  assert.match(ctx, /ask why/i);

  // one logged session is not a pattern
  assert.deepEqual(detectSkippedExercises(routines, sessions.slice(0, 1)), [], 'thin history claims nothing');
  assert.equal(skippedContext([]), '', 'nothing to say stays silent');
});

test('drop-offs rank above never-logged entries, which may just be new to the program', async () => {
  const { detectSkippedExercises, skippedContext } = await import('../lib/coach.js');
  const routines = [{ id: 'push', name: 'Push', exercises: [
    { exerciseId: 'new1', name: 'Face Pull' },
    { exerciseId: 'dropped', name: 'Dumbbell Bench Press' },
  ] }];
  const withSets = (id) => ({ exerciseId: id, sets: [{ weight: 20, reps: 10 }] });
  const sessions = [
    { routineId: 'push', date: '2026-07-28', exercises: [] },
    { routineId: 'push', date: '2026-07-21', exercises: [] },
    { routineId: 'push', date: '2026-07-14', exercises: [withSets('dropped')] },
  ];
  const skipped = detectSkippedExercises(routines, sessions);
  assert.equal(skipped[0].name, 'Dumbbell Bench Press', 'the real drop-off leads');
  const ctx = skippedContext(skipped);
  assert.match(ctx, /never logged at all — it may simply be newly added/);
  assert.match(ctx, /a real drop-off/);
});

test('outgrown: reps far past target stop earning +1 and flag a prescription change', async () => {
  const dir = path.join(vault, 'Wiki/Health/Workouts'); // the real sessions dir — mtime rescan picks these up
  await mkdir(dir, { recursive: true });
  // dips target 10-12: every set ≥ 14 (high+2) two sessions running → outgrown
  await writeFile(path.join(dir, '2026-08-10 push.md'), session('2026-08-10', [
    { exerciseId: 'dips', name: 'Dips', sets: [{ weight: 0, reps: 15 }, { weight: 0, reps: 14 }, { weight: 0, reps: 14 }] },
  ]));
  await writeFile(path.join(dir, '2026-08-13 push.md'), session('2026-08-13', [
    { exerciseId: 'dips', name: 'Dips', sets: [{ weight: 0, reps: 16 }, { weight: 0, reps: 15 }, { weight: 0, reps: 14 }] },
  ]));
  const prog = await computeProgressions(vault, routines);
  const dips = prog['push:dips'];
  assert.ok(dips, 'dips earns a signal');
  assert.equal(dips.kind, 'outgrown');
  assert.equal(dips.delta, 0, 'no more reps suggested');
  assert.match(dips.evidence, /no longer the stimulus/);
  // just past target but inside the margin → still an ordinary +1 rep.
  // NEW files with later dates: the session cache re-reads on dir-mtime
  // change (create), never on in-place rewrite — Nova only ever appends.
  await writeFile(path.join(dir, '2026-08-15 push.md'), session('2026-08-15', [
    { exerciseId: 'dips', name: 'Dips', sets: [{ weight: 0, reps: 12 }, { weight: 0, reps: 13 }, { weight: 0, reps: 12 }] },
  ]));
  await writeFile(path.join(dir, '2026-08-17 push.md'), session('2026-08-17', [
    { exerciseId: 'dips', name: 'Dips', sets: [{ weight: 0, reps: 13 }, { weight: 0, reps: 12 }, { weight: 0, reps: 12 }] },
  ]));
  const prog2 = await computeProgressions(vault, routines);
  assert.equal(prog2['push:dips']?.kind, 'reps');
  assert.equal(prog2['push:dips']?.delta, 1);
});

// ---------------------------------------------------------------------------
// EFFORT CALIBRATION (his scale). These paths shipped with no coverage at all,
// which is how a 9.5 cutoff came to hold 16/16 of his lifts unnoticed. The
// rule under test: effort alone never decides — the objective e1RM trend does,
// and effort only picks the prescription once the lift has stopped moving.
// ---------------------------------------------------------------------------

const effortRoutines = [{
  id: 'pull',
  exercises: [
    { exerciseId: 'row', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 },
  ],
}];

function pullSession(date, sets) {
  return matter.stringify('# Pull\n', {
    type: 'workout-session', id: `p-${date}`, date, routineId: 'pull', routineName: 'Pull',
    finishedAt: `${date}T10:00:00.000Z`,
    exercises: [{ exerciseId: 'row', name: 'Row', sets }],
  });
}

async function progFor(dirName, prev, now) {
  const dir = path.join(vault, dirName, 'Wiki/Health/Workouts');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '2026-07-10 pull.md'), pullSession('2026-07-10', prev), 'utf8');
  await writeFile(path.join(dir, '2026-07-14 pull.md'), pullSession('2026-07-14', now), 'utf8');
  return computeProgressions(path.join(vault, dirName), effortRoutines);
}

test('effort: RPE 9 is his WORKING set — a climbing lift still earns load', async () => {
  // 60kg x10 -> 62.5kg x10, all at RPE 9. Under the old 9.5 cutoff this was
  // still allowed; under a naive "9 means grinding" reading it would be held.
  const prog = await progFor('rpe9-climbing',
    Array.from({ length: 3 }, () => ({ weight: 60, reps: 10, rpe: 9 })),
    Array.from({ length: 3 }, () => ({ weight: 62.5, reps: 10, rpe: 9 })));
  assert.equal(prog['pull:row'].kind, 'weight', 'RPE 9 with a rising e1RM must not be held at quality');
  assert.equal(prog['pull:row'].delta, WEIGHT_STEP_KG);
});

test('effort: RPE 10 with a FLAT e1RM is a genuine sticking point → quality', async () => {
  const flat = Array.from({ length: 3 }, () => ({ weight: 60, reps: 10, rpe: 10 }));
  const prog = await progFor('rpe10-flat', flat, flat);
  assert.equal(prog['pull:row'].kind, 'quality');
  assert.equal(prog['pull:row'].delta, 0);
  assert.match(prog['pull:row'].evidence, /est\. 1RM/);
  assert.ok(prog['pull:row'].focus, 'a quality prescription must carry a concrete focus');
});

test('effort: RPE 10 but still CLIMBING is not held — the work is moving', async () => {
  const prog = await progFor('rpe10-climbing',
    Array.from({ length: 3 }, () => ({ weight: 60, reps: 10, rpe: 10 })),
    Array.from({ length: 3 }, () => ({ weight: 65, reps: 10, rpe: 10 })));
  assert.notEqual(prog['pull:row']?.kind, 'quality', 'a lift at RPE 10 that is still adding load must not be held');
});

test('effort: trading reps for load never reads as a regression', async () => {
  // His real Wide-Grip Lat Pulldown: 73kg x8 -> 75kg x6. Volume-load scored
  // this 584 -> 450 and told him he had gone backwards and to check his sleep.
  const prog = await progFor('reps-for-load',
    Array.from({ length: 3 }, () => ({ weight: 73, reps: 8, rpe: 10 })),
    Array.from({ length: 3 }, () => ({ weight: 75, reps: 6, rpe: 10 })));
  const ev = prog['pull:row']?.evidence || '';
  assert.doesNotMatch(ev, /BACKWARDS/, 'adding weight at the cost of reps is progression, not regression');
});

test('effort: a real e1RM collapse asks about recovery, not tempo', async () => {
  const prog = await progFor('true-regression',
    Array.from({ length: 3 }, () => ({ weight: 80, reps: 10, rpe: 10 })),
    Array.from({ length: 3 }, () => ({ weight: 60, reps: 8, rpe: 10 })));
  assert.equal(prog['pull:row'].kind, 'quality');
  assert.match(prog['pull:row'].evidence, /BACKWARDS/);
  assert.match(prog['pull:row'].evidence, /recovery/i);
  assert.doesNotMatch(prog['pull:row'].evidence, /3s lowering/, 'a collapse is a recovery question, not a technique one');
});
