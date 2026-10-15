// Weekly volume with indirect credit (15 Oct 2026): a set credits 1 to its
// primary muscle and ½ to each muscle the lift also trains, `groups` stays
// the TOTAL every reader already reads, and `direct` / `indirect` carry the
// set counts behind it. The planned week's done counts still equal the bars.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-indirect-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.TZ = 'Australia/Sydney';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { weeklyMuscleVolume, volumeBreakdown, auditProgram } = await import('../lib/trainingAnalytics.js');
const { plannedWeek } = await import('../lib/plannedWeek.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

test('fractional totals: 3 sets hack squat + 3 sets hip thrust', () => {
  const exercises = [
    { id: 'hack', name: 'Hack Squat', muscleGroup: 'Quads' },
    { id: 'thrust', name: 'Machine Hip Thrust', muscleGroup: 'Glutes' },
  ];
  const sets = [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 40, reps: 10, setType: 'warmup' }];
  const sessions = [{ date: '2026-10-13', exercises: [{ exerciseId: 'hack', sets }, { exerciseId: 'thrust', sets }] }];
  const [wk] = weeklyMuscleVolume(sessions, exercises);
  assert.deepEqual(wk.groups, { Glutes: 4.5, Quads: 3, Hamstrings: 1.5 });
  assert.deepEqual(wk.direct, { Glutes: 3, Quads: 3, Hamstrings: 0 });
  assert.deepEqual(wk.indirect, { Glutes: 3, Quads: 0, Hamstrings: 3 });
  assert.equal(volumeBreakdown('Glutes', wk.groups.Glutes, wk.direct.Glutes, wk.indirect.Glutes), 'Glutes 4½ (3 direct + 3 indirect at ½)');
  assert.equal(volumeBreakdown('Quads', 3, 3, 0), 'Quads 3');
});

test('Mobility sets stay out of volume entirely', () => {
  const exercises = [{ id: 'mob', name: 'Spider-Man Lunge', muscleGroup: 'Mobility' }];
  const sessions = [{ date: '2026-10-13', exercises: [{ exerciseId: 'mob', sets: [{ reps: 10 }] }] }];
  assert.deepEqual(weeklyMuscleVolume(sessions, exercises), []);
});

test('the planned week adds up to the bar for every muscle, indirect credit included', () => {
  const exercises = [
    { id: 'hack', name: 'Hack Squat', muscleGroup: 'Quads' },
    { id: 'thrust', name: 'Machine Hip Thrust', muscleGroup: 'Glutes' },
    { id: 'bench', name: 'Incline Barbell Bench Press', muscleGroup: 'Chest' },
  ];
  const lib = new Map(exercises.map((x) => [x.id, x]));
  const e = (id) => ({ exerciseId: id, name: lib.get(id).name, muscleGroup: lib.get(id).muscleGroup, targetSets: 3 });
  const routines = [{ id: 'legs', name: 'Leg Day', exercises: [e('hack'), e('thrust')] }, { id: 'push', name: 'Push', exercises: [e('bench')] }];
  const sets = (n) => Array.from({ length: n }, () => ({ weight: 60, reps: 8 }));
  const sessions = [
    { date: '2026-10-13', routineId: 'legs', exercises: [{ exerciseId: 'hack', sets: sets(3) }, { exerciseId: 'thrust', sets: sets(3) }] },
    { date: '2026-10-14', routineId: 'push', exercises: [{ exerciseId: 'bench', sets: sets(4) }] },
  ];
  const now = new Date('2026-10-15T10:00:00');
  const w = plannedWeek({ routines, schedule: { tuesday: 'legs', wednesday: 'push' }, sessions, exercises, now, targetOf: () => ({ target: 10, goalMuscle: false }) });
  const bars = weeklyMuscleVolume(sessions, exercises)[0].groups;
  assert.deepEqual(bars, { Glutes: 4.5, Chest: 4, Quads: 3, Triceps: 2, Shoulders: 2, Hamstrings: 1.5 });
  for (const [m, total] of Object.entries(bars)) assert.equal(w.muscles.find((x) => x.muscle === m)?.done, total, m);
  const glutes = w.muscles.find((x) => x.muscle === 'Glutes');
  assert.deepEqual([glutes.direct.done, glutes.indirect.done, glutes.planned], [3, 3, 4.5]);
});

test('the push/pull audit counts direct sets only: a press\'s triceps and delts never double its push', () => {
  const exercises = [
    { id: 'shrug', name: 'Dumbbell Shrug', muscleGroup: 'Back' },
    { id: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest' },
  ];
  // 10 push v 11 pull direct: balanced. Counted with ½ spill the bench would
  // read 20 push against 11 pull, past the 1.8 ratio, and flag a skew that
  // is not there
  const routines = [{ id: 'a', name: 'A', exercises: [{ exerciseId: 'shrug', targetSets: 11 }, { exerciseId: 'bench', targetSets: 10 }] }];
  assert.deepEqual(auditProgram({ routines, schedule: { monday: 'a' }, exercises }), []);
});
