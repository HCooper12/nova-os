// The week plan's calendar honesty: a calendar that could not be read is
// never drafted as a clear week — the CalDAV outage that used to paint seven
// days of "Calendar: clear" is the [03] family's fifth site.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'weekplan-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0'; // the state-file cache is per module, not per vault

import test from 'node:test';
import assert from 'node:assert/strict';

const { composeWeekPlan } = await import('../lib/weekPlan.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, setScheduleDay } = await import('../lib/workouts.js');

async function seedVault() {
  const dir = await mkdtemp(path.join(tmpdir(), 'weekplan-vault-'));
  await mkdir(path.join(dir, 'Wiki', 'Health'), { recursive: true });
  const row = await addCustomExercise(dir, 'Row', 'Back', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(dir);
  const pull = await createRoutine(dir, exercises, 'Pull', [{ exerciseId: row.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 }]);
  await setScheduleDay(dir, exercises, 'monday', pull.id);
  return dir;
}

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test("a calendar that could not be read is said once at the top and 'unknown' on every day — never 'clear'", async () => {
  const dir = await seedVault();
  try {
    const plan = await composeWeekPlan(dir, new Date('2026-09-02T10:00:00'), {
      fetchEvents: async () => { throw new Error('CalDAV 503'); },
    });
    assert.equal(plan.calendarUnreadable, 'CalDAV 503');
    assert.match(plan.text, /> \*\*Calendar: couldn't be read when this was drafted\*\* \(CalDAV 503\)/);
    assert.doesNotMatch(plan.text, /Calendar:\*\* clear/, 'no day claims a clear calendar it could not see');
    assert.equal((plan.text.match(/Calendar:\*\* unknown — couldn't be read/g) || []).length, 7, 'all seven days');
    assert.match(plan.text, /Training:\*\* Pull \(1 exercises\)/, 'the training schedule is still drafted');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a readable, empty calendar is genuinely clear', async () => {
  const dir = await seedVault();
  try {
    const plan = await composeWeekPlan(dir, new Date('2026-09-02T10:00:00'), { fetchEvents: async () => [] });
    assert.equal(plan.calendarUnreadable, null);
    assert.doesNotMatch(plan.text, /couldn't be read/);
    assert.equal((plan.text.match(/Calendar:\*\* clear/g) || []).length, 7);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
