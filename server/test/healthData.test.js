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
