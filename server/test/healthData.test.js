// Point the module at a temp dir BEFORE importing it — tests must never
// touch the real server/data directory.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-health-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { saveDay, loadDay, loadRecentDays } = await import('../lib/healthData.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('saveDay rejects a malformed date', async () => {
  await assert.rejects(saveDay('17-07-2026', { steps: 100 }), /YYYY-MM-DD/);
  await assert.rejects(saveDay('2026/07/17', { steps: 100 }), /YYYY-MM-DD/);
});

test('saveDay keeps only known numeric metrics', async () => {
  const saved = await saveDay('2026-01-01', {
    steps: '8421', // numeric strings coerce
    hrv: 62,
    weightKg: 'not a number', // dropped
    hackField: 'evil', // unknown key dropped
    restingHeartRate: null, // null dropped
  });
  assert.equal(saved.steps, 8421);
  assert.equal(saved.hrv, 62);
  assert.ok(!('weightKg' in saved));
  assert.ok(!('hackField' in saved));
  assert.ok(!('restingHeartRate' in saved));
});

test('impossible zeros are "no samples yet", never a stored reading', async () => {
  // a morning push before HRV/sleep exist — iOS sums an empty sample list to 0
  const saved = await saveDay('2025-12-28', { steps: 0, hrv: 0, sleepAsleepMinutes: 0, weightKg: 0, restingHeartRate: 0 });
  assert.equal(saved.steps, 0, '0 steps at 00:05 is a real reading and stays');
  assert.ok(!('hrv' in saved), 'HRV 0 ms is not a measurement');
  assert.ok(!('sleepAsleepMinutes' in saved));
  assert.ok(!('weightKg' in saved));
  assert.ok(!('restingHeartRate' in saved));

  // a later 0 must never clobber a real value already stored for the day
  await saveDay('2025-12-28', { hrv: 71.5 });
  const after = await saveDay('2025-12-28', { hrv: 0 });
  assert.equal(after.hrv, 71.5, 'the real reading survives a no-samples re-push');
});

test('metric keys are case-insensitive — a hand-built Shortcut\'s "weightkg" still lands as weightKg', async () => {
  // the exact bug from the real push: the phone dictionary sent lowercase keys
  const saved = await saveDay('2025-12-29', { steps: 8000, weightkg: 78.4, vo2max: 47, RestingHeartRate: 53 });
  assert.equal(saved.weightKg, 78.4, 'lowercase weightkg maps onto the canonical weightKg');
  assert.equal(saved.vo2Max, 47);
  assert.equal(saved.restingHeartRate, 53);

  // exact case still wins when both somehow arrive
  const both = await saveDay('2025-12-30', { weightKg: 80, weightkg: 999 });
  assert.equal(both.weightKg, 80, 'the exact-case value takes precedence over the fallback');
});

test('a second save the same day merges instead of overwriting', async () => {
  await saveDay('2026-01-02', { steps: 5000 });
  const merged = await saveDay('2026-01-02', { hrv: 55 });
  assert.equal(merged.steps, 5000);
  assert.equal(merged.hrv, 55);

  const loaded = await loadDay('2026-01-02');
  assert.equal(loaded.steps, 5000);
  assert.equal(loaded.hrv, 55);
});

test('loadRecentDays returns oldest-first and respects the limit', async () => {
  await saveDay('2026-01-03', { steps: 1 });
  await saveDay('2026-01-04', { steps: 2 });
  const days = await loadRecentDays(2);
  assert.deepEqual(days.map((d) => d.date), ['2026-01-03', '2026-01-04']);
});

test('loadDay returns null for a day with no data', async () => {
  assert.equal(await loadDay('1999-01-01'), null);
});

test('monotonic-steps rule: a HIGHER later reading wins for a past day, a truncated one is ignored', async () => {
  const { shouldDropPastSteps } = await import('../lib/healthData.js');
  const now = new Date('2026-07-30T09:00:00');
  // the real case: 23:45 nightly recorded 8311, next morning's per-date push says 9400
  assert.equal(shouldDropPastSteps('2026-07-29', 8311, 9400, now), false, 'higher = more complete, accept it');
  assert.equal(shouldDropPastSteps('2026-07-29', 9400, 8311, now), true, 'lower = truncated reading, ignore it');
  assert.equal(shouldDropPastSteps('2026-07-29', 8311, 8311, now), true, 'equal changes nothing — no rewrite');
  assert.equal(shouldDropPastSteps('2026-07-29', null, 9400, now), false, 'catch-up into a gap is welcome');
  assert.equal(shouldDropPastSteps('2026-07-30', 9000, 5000, now), false, 'today keeps updating freely');
  assert.equal(shouldDropPastSteps('2026-07-29', 8311, null, now), false, 'no incoming steps, nothing to judge');
});

test('steps completeness is stamped honestly: during the day = partial, after = total', async () => {
  const { stepsCaptureIsComplete, saveDay, loadDay } = await import('../lib/healthData.js');
  assert.equal(stepsCaptureIsComplete('2026-07-29', '2026-07-29T23:45:00'), false, 'the 23:45 push is a partial');
  assert.equal(stepsCaptureIsComplete('2026-07-29', '2026-07-30T11:25:00'), true, 'next-morning capture saw the whole day');
  assert.equal(stepsCaptureIsComplete('2026-07-29', null), false, 'no timestamp claims nothing');

  // the real nightly case: a push for TODAY, captured today → partial
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const day = await saveDay(todayKey, { steps: 8311 });
  assert.equal(day.stepsComplete, false, 'a reading captured during the day is a partial');
  assert.ok(day.stepsAt, 'capture time recorded');

  const fixed = await saveDay(todayKey, { steps: 9908 }, { manual: true });
  assert.equal(fixed.stepsComplete, true, 'his own correction is complete by definition');
  assert.equal((await loadDay(todayKey)).steps, 9908);
});
