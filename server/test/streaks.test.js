// Temp data dir + temp vault BEFORE imports (see healthData.test.js).
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-streaks-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-streaks-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { computeStreaks } = await import('../lib/streaks.js');
const { saveDay } = await import('../lib/healthData.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function writeSession(date) {
  const dir = path.join(vault, 'Wiki/Health/Workouts');
  await mkdir(dir, { recursive: true });
  const session = {
    type: 'workout-session',
    id: `s-${date}`,
    date,
    routineId: 'push',
    routineName: 'Push Day',
    exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ weight: 60, reps: 8 }] }],
    finishedAt: `${date}T10:00:00.000Z`,
  };
  await writeFile(path.join(dir, `${date} — Push Day.md`), matter.stringify('# session', session), 'utf8');
}

test('streaks count consecutive qualifying days, tolerating an incomplete today', async () => {
  // Steps: goal met yesterday and the day before, NOT today → streak still 2.
  await saveDay(dayStr(-2), { steps: 12000, sleepAsleepMinutes: 500 });
  await saveDay(dayStr(-1), { steps: 11000, sleepAsleepMinutes: 300 });
  await saveDay(dayStr(0), { steps: 400 });

  // Workouts: today and yesterday → 2. A gap 3 days back doesn't extend it.
  await writeSession(dayStr(-4));
  await writeSession(dayStr(-1));
  await writeSession(dayStr(0));

  const streaks = await computeStreaks(vault);
  assert.equal(streaks.stepGoalStreak, 2);
  assert.equal(streaks.workoutStreak, 2);
  // Sleep goal met only 2 days ago — yesterday broke it → streak 0.
  assert.equal(streaks.sleepGoalStreak, 0);
});

test('a training check he approved is a trained day — the reconciliation reconciles', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  // no session logged two days ago, but he confirmed it through the check
  const twoAgo = dayStr(-2);
  await createRecord({ id: 'tc000001', kind: 'training-check', status: 'filed', text: 'x', source: 'nova', mode: 'draft', createdAt: `${twoAgo}T19:05:00`, decision: { route: 'journal', title: 'x', confidence: 'high', payload: {} } });
  const streaks = await computeStreaks(vault);
  assert.equal(streaks.workoutStreak, 3, 'today + yesterday + the reconciled day');
  assert.equal(streaks.workoutStreakUnit, 'days', 'no schedule yet → consecutive days');
});

test('with a program, the streak walks scheduled days only — rest days neither count nor break it', async () => {
  const { scheduledStreak } = await import('../lib/streaks.js');
  const schedule = { monday: 'push', wednesday: 'pull', friday: 'legs', saturday: 'active-rest' };
  // Mon 24 Aug, Wed 26, Fri 28 trained; Tue/Thu/Sat/Sun are not training days
  const trained = new Set(['2026-08-24', '2026-08-26', '2026-08-28']);
  assert.deepEqual(scheduledStreak(trained, schedule, '2026-08-30'), { streak: 3, basis: 'scheduled' }, 'three sessions across a week with rest days');
  assert.deepEqual(scheduledStreak(trained, schedule, '2026-08-31'), { streak: 3, basis: 'scheduled' }, 'an untrained scheduled TODAY is not yet a miss');
  assert.deepEqual(scheduledStreak(new Set(['2026-08-24', '2026-08-28']), schedule, '2026-08-30'), { streak: 1, basis: 'scheduled' }, 'the missed Wednesday breaks it');
  assert.deepEqual(scheduledStreak(new Set(), { saturday: 'active-rest' }, '2026-08-30'), { streak: 0, basis: 'daily' }, 'a schedule with no training days falls back to days');
  // and through computeStreaks: a real schedule in the vault flips the unit
  const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
  const { createRoutine, setScheduleDay } = await import('../lib/workouts.js');
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  const bench = await addCustomExercise(vault, 'Bench', 'Chest', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(vault);
  const push = await createRoutine(vault, exercises, 'Push Day', [{ exerciseId: bench.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 }]);
  const todayKey = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][(new Date().getDay() + 6) % 7];
  await setScheduleDay(vault, exercises, todayKey, push.id);
  const s = await computeStreaks(vault);
  assert.equal(s.workoutStreakUnit, 'sessions');
  assert.ok(s.workoutStreak >= 1, 'today is scheduled and trained');
});
