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
  const { shouldDropLowerSteps } = await import('../lib/healthData.js');
  const now = new Date('2026-07-30T09:00:00');
  // the real case: 23:45 nightly recorded 8311, next morning's per-date push says 9400
  assert.equal(shouldDropLowerSteps(8311, 9400), false, 'higher = more complete, accept it');
  assert.equal(shouldDropLowerSteps(9400, 8311), true, 'lower = truncated reading, ignore it');
  assert.equal(shouldDropLowerSteps(8311, 8311), true, 'equal changes nothing — no rewrite');
  assert.equal(shouldDropLowerSteps(null, 9400), false, 'catch-up into a gap is welcome');
  assert.equal(shouldDropLowerSteps(9000, 5000), true, 'TODAY is not exempt — 11 Aug lost 11,107 to a later 813');
  assert.equal(shouldDropLowerSteps(8311, null), false, 'no incoming steps, nothing to judge');
});

test('the guard judges the FOLDED steps figure — a watch-only partial cannot clobber a finished day', async () => {
  // The 9→10 Aug regression: the 00:05 automation carried NO `steps` key,
  // only watchSteps 1273 (watch barely worn that day). Guarding on the raw
  // payload's absent `steps` let saveDay's later fold overwrite the day's
  // real 12,967. The route now folds first; this pins the composition.
  const { pickKnownMetrics, shouldDropLowerSteps } = await import('../lib/healthData.js');
  const now = new Date('2026-08-10T00:05:13');
  const folded = pickKnownMetrics({ watchSteps: 1273, hrv: 58 });
  assert.equal(folded.steps, 1273, 'watch-only push still folds into steps');
  assert.equal(shouldDropLowerSteps(12967, folded.steps), true,
    'the folded partial must be judged — and dropped — against the stored total');
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

test('per-device steps fold by MAX, never summed (no double counting, no missed watch steps)', async () => {
  const { pickKnownMetrics } = await import('../lib/healthData.js');
  assert.equal(pickKnownMetrics({ steps: 8311, stepsWatch: 9908 }).steps, 9908, 'the higher device wins');
  assert.equal(pickKnownMetrics({ steps: 9908, stepsWatch: 8311 }).steps, 9908, 'order does not matter');
  assert.equal(pickKnownMetrics({ steps: 8311 }).steps, 8311, 'a single figure passes through untouched');
  assert.equal(pickKnownMetrics({ stepsWatch: 9908 }).steps, 9908, 'watch-only still lands as steps');
  assert.equal(pickKnownMetrics({ steps: 8311, stepsWatch: 9908 }).stepsWatch, undefined, 'the helper key is not stored');
  // his Shortcut writes "watchSteps" — the other word order must not be dropped
  assert.equal(pickKnownMetrics({ steps: 7846, watchSteps: 7994 }).steps, 7994, 'watchSteps spelling accepted');
  assert.equal(pickKnownMetrics({ steps: 7994, watchSteps: 0 }).steps, 7994, 'a zero device reading never lowers the total');
});

test('a just-after-midnight push is filed against the day it actually describes', async () => {
  const { resolvePushDate } = await import('../lib/healthData.js');
  // the real case: automation fires 12:05am on the 31st carrying 24h of data
  const at0005 = new Date('2026-07-31T00:05:00');
  assert.deepEqual(resolvePushDate('2026-07-31', at0005), { date: '2026-07-30', shifted: true });

  // narrow on purpose
  const at0900 = new Date('2026-07-31T09:00:00');
  assert.deepEqual(resolvePushDate('2026-07-31', at0900), { date: '2026-07-31', shifted: false }, 'daytime pushes are left alone');
  assert.deepEqual(resolvePushDate('2026-07-29', at0005), { date: '2026-07-29', shifted: false }, 'an explicit past date is respected');
  const at0359 = new Date('2026-07-31T03:59:00');
  assert.equal(resolvePushDate('2026-07-31', at0359).shifted, true, 'still inside the window');
  const at0400 = new Date('2026-07-31T04:00:00');
  assert.equal(resolvePushDate('2026-07-31', at0400).shifted, false, 'cutoff respected');

  // month boundary
  const firstOfMonth = new Date('2026-08-01T00:05:00');
  assert.equal(resolvePushDate('2026-08-01', firstOfMonth).date, '2026-07-31', 'rolls back across a month end');
});
