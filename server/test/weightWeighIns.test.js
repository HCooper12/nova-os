// HE DOES NOT WEIGH DAILY — AND NOVA MUST NOT PRETEND HE DOES.
//
// His report, 7 Sep 2026: Nova showed +2.9 kg "in a day". It hadn't been a
// day. The Shortcut asks Health for the most recent Body Mass sample and
// Health answers with his LAST weigh-in whichever day that was, so the same
// 82.0 was written into five separate day files as if he had stood on the
// scale each morning — and his first real weigh-in in ten days then read as
// an overnight spike. Every middle number was fiction and the alarming one
// was an artefact of it.
//
// The rule under test: one data point per WEIGH-IN, dated by when he actually
// weighed, and every surface says how long ago that was.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-weight-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const { saveDay, computeWeightTrend, weightTrendLine } = await import('../lib/healthData.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

test('a repeated reading is the SAME weigh-in carried forward, not a new one', async () => {
  await saveDay('2026-08-28', { weightKg: 82.0, steps: 8309 });
  const carried = await saveDay('2026-09-01', { weightKg: 82.0, steps: 7908 });
  assert.equal(carried.weightMeasuredOn, '2026-08-28', 'it keeps the day he actually weighed');
  assert.equal(carried.weightCarried, true);

  const again = await saveDay('2026-09-06', { weightKg: 82.0, steps: 5088 });
  assert.equal(again.weightMeasuredOn, '2026-08-28', 'still the same weigh-in a week later');

  // a genuinely different number IS a new weigh-in, dated today
  const fresh = await saveDay('2026-09-07', { weightKg: 84.9 });
  assert.equal(fresh.weightMeasuredOn, '2026-09-07');
  assert.equal(fresh.weightCarried, false);
});

test('the trend spans weigh-ins — the +2.9 is over ten days, never over one', () => {
  const days = [
    { date: '2026-08-24', weightKg: 82.1, weightMeasuredOn: '2026-08-24' },
    { date: '2026-08-28', weightKg: 82.0, weightMeasuredOn: '2026-08-28' },
    { date: '2026-09-01', weightKg: 82.0, weightMeasuredOn: '2026-08-28', weightCarried: true },
    { date: '2026-09-05', weightKg: 82.0, weightMeasuredOn: '2026-08-28', weightCarried: true },
    { date: '2026-09-07', weightKg: 84.9, weightMeasuredOn: '2026-09-07' },
  ];
  const t = computeWeightTrend(days, '2026-09-07');
  assert.equal(t.weighIns, 3, 'five day files, three actual weigh-ins');
  assert.equal(t.latestDate, '2026-09-07');
  assert.equal(t.lastChangeKg, 2.9);
  assert.equal(t.lastChangeDays, 10, 'the change he saw is over TEN days, not one');
  assert.equal(t.spanDays, 14);

  const line = weightTrendLine(days, '2026-09-07');
  assert.match(line, /previous weigh-in 10 days earlier/);
  assert.match(line, /does NOT weigh daily/, 'every agent reading this is warned');
});

test('a stale weight says how stale, so nothing reads it as today', () => {
  const days = [
    { date: '2026-08-24', weightKg: 82.1, weightMeasuredOn: '2026-08-24' },
    { date: '2026-08-28', weightKg: 82.0, weightMeasuredOn: '2026-08-28' },
    { date: '2026-09-07', weightKg: 82.0, weightMeasuredOn: '2026-08-28', weightCarried: true },
  ];
  const t = computeWeightTrend(days, '2026-09-07');
  assert.equal(t.staleDays, 10);
  assert.equal(t.weighIns, 2, 'the carried reading adds no point');
  assert.match(weightTrendLine(days, '2026-09-07'), /last weighed 10 days ago/);
});

test('an explicit weightDate from the Shortcut is exact and wins', async () => {
  const d = await saveDay('2026-09-09', { weightKg: 83.4, weightDate: '2026-09-08' });
  assert.equal(d.weightMeasuredOn, '2026-09-08');
  assert.equal(d.weightCarried, true, 'measured yesterday, pushed today');
});

test('no weight at all is still said honestly', () => {
  assert.equal(computeWeightTrend([]), null);
  assert.equal(computeWeightTrend([{ date: '2026-09-07', steps: 100 }]), null);
  assert.match(weightTrendLine([]), /no data yet/);
});
