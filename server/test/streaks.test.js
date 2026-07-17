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
