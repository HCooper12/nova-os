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

// ---- [14] plans 2 + 5: the catch-up window, the target Monday, and a discarded draft that must not block ----
test('the plan targets NEXT Monday from any day but THIS Monday on a Monday morning; the window is Sunday from 16:00 or Monday before noon', async () => {
  const { planTargetMonday, weekPlanWindowOpen } = await import('../lib/weekPlan.js');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(iso(planTargetMonday(new Date('2026-09-06T16:30:00'))), '2026-09-07', 'Sunday → tomorrow');
  assert.equal(iso(planTargetMonday(new Date('2026-09-07T09:00:00'))), '2026-09-07', 'Monday morning → today, not the week after');
  assert.equal(iso(planTargetMonday(new Date('2026-09-08T09:00:00'))), '2026-09-14', 'Tuesday → next Monday');
  assert.equal(iso(planTargetMonday(new Date('2026-09-13T23:59:00'))), '2026-09-14', 'late Sunday → tomorrow');
  assert.equal(weekPlanWindowOpen(new Date('2026-09-06T15:59:00')), false);
  assert.equal(weekPlanWindowOpen(new Date('2026-09-06T16:00:00')), true);
  assert.equal(weekPlanWindowOpen(new Date('2026-09-07T08:00:00')), true, 'Monday morning catch-up');
  assert.equal(weekPlanWindowOpen(new Date('2026-09-07T12:00:00')), false, 'by noon the week is under way');
  assert.equal(weekPlanWindowOpen(new Date('2026-09-09T17:00:00')), false);
});

test('a discarded week-plan draft does not block a re-run; a live one does', async () => {
  const { runWeekPlan, planTargetMonday } = await import('../lib/weekPlan.js');
  const { createRecord } = await import('../lib/inboxStore.js');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const vault = await mkdtemp(path.join(tmpdir(), 'weekplan-vault-'));
  await mkdir(path.join(vault, 'Wiki'), { recursive: true });
  const mondayIso = iso(planTargetMonday(new Date()));
  await createRecord({ id: 'wpdisc1', kind: 'week-plan', status: 'discarded', text: 'x', source: 'nova', mode: 'draft', createdAt: new Date().toISOString(),
    decision: { route: 'vault-note', confidence: 'high', title: 'x', reason: 'x', payload: { relPath: `Wiki/Plans/Week of ${mondayIso}.md`, text: 'x' } } });
  const first = await runWeekPlan(vault);
  assert.ok(first.record, 'the rejected draft did not stand in the way');
  const second = await runWeekPlan(vault);
  assert.equal(second.skipped, 'already drafted', 'the live draft does');
  await rm(vault, { recursive: true, force: true });
});
