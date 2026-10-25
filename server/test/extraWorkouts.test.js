// The dated two-a-day plan (lib/extraWorkouts.js): set, replace, clear, and
// every write hands back what it replaced so Undo can put it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(os.tmpdir(), 'nova-dayplans-'));
process.env.NOVA_DATA_DIR = dir;
const { setDayPlan, clearDayPlan, dayPlanFor, listDayPlans, cleanRoutineIds } = await import('../lib/extraWorkouts.js');
const known = new Set(['a', 'b', 'c']);

test('ids keep his order, drop repeats and blanks', () => {
  assert.deepEqual(cleanRoutineIds(['b', 'a', 'b', '', null, 'c']), ['b', 'a', 'c']);
});

test('two or more ids make a record; the prior one comes back for Undo', async () => {
  const first = await setDayPlan('2026-10-31', ['a', 'b'], { known });
  assert.equal(first.prior, null);
  assert.deepEqual(first.plan.routineIds, ['a', 'b']);
  const second = await setDayPlan('2026-10-31', ['b', 'c', 'a'], { known });
  assert.deepEqual(second.prior.routineIds, ['a', 'b']);
  assert.deepEqual((await dayPlanFor('2026-10-31')).routineIds, ['b', 'c', 'a']);
  const onDisk = JSON.parse(readFileSync(path.join(dir, 'workout-day-plans.json'), 'utf8'));
  assert.equal(onDisk.plans.length, 1);
});

test('one id or none clears the date (the template holds one workout)', async () => {
  const r = await setDayPlan('2026-10-31', ['a'], { known });
  assert.equal(r.plan, null);
  assert.deepEqual(r.prior.routineIds, ['b', 'c', 'a']);
  assert.equal(await dayPlanFor('2026-10-31'), null);
  await setDayPlan('2026-11-01', ['a', 'c'], { known });
  assert.equal((await clearDayPlan('2026-11-01')).prior.date, '2026-11-01');
  assert.deepEqual(await listDayPlans(), []);
});

test('an unknown routine or a bad date is refused', async () => {
  await assert.rejects(setDayPlan('2026-10-31', ['a', 'zzz'], { known }), /your routines/);
  await assert.rejects(setDayPlan('31/10', ['a', 'b'], { known }), /YYYY-MM-DD/);
});
