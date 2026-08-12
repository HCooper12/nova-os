import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAutoExportPayload } from '../lib/autoExport.js';

test('parses a well-formed daily-summarized export into per-date metrics', async () => {
  const body = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ qty: 10139, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'active_energy', units: 'kcal', data: [{ qty: 920.5, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'walking_running_distance', units: 'km', data: [{ qty: 15.6, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'resting_heart_rate', units: 'bpm', data: [{ qty: 57, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'heart_rate_variability', units: 'ms', data: [{ qty: 66.4, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'vo2_max', units: 'mL/(kg·min)', data: [{ qty: 48.3, date: '2026-08-12 00:00:00 +1000' }] },
        { name: 'weight_body_mass', units: 'kg', data: [{ qty: 82.7, date: '2026-08-12 00:00:00 +1000' }] },
      ],
    },
  };
  const { perDate, warnings } = parseAutoExportPayload(body);
  assert.equal(warnings.length, 0);
  assert.equal(perDate.size, 1);
  const day = perDate.get('2026-08-12');
  assert.deepEqual(day.metrics, {
    steps: 10139, activeEnergyKcal: 920.5, walkingRunningDistanceKm: 15.6,
    restingHeartRate: 57, hrv: 66.4, vo2Max: 48.3, weightKg: 82.7,
  });
  assert.equal(day.warnings.length, 0);
});

test('converts imperial units onto Nova\'s canonical km/kg — never stores them raw', async () => {
  const body = {
    data: {
      metrics: [
        { name: 'walking_running_distance', units: 'mi', data: [{ qty: 10, date: '2026-08-12 00:00:00 -0800' }] },
        { name: 'weight_body_mass', units: 'lb', data: [{ qty: 180, date: '2026-08-12 00:00:00 -0800' }] },
      ],
    },
  };
  const { perDate } = parseAutoExportPayload(body);
  const day = perDate.get('2026-08-12');
  assert.ok(Math.abs(day.metrics.walkingRunningDistanceKm - 16.09344) < 0.001, '10 miles converts to ~16.09 km');
  assert.ok(Math.abs(day.metrics.weightKg - 81.6466266) < 0.001, '180 lb converts to ~81.65 kg');
});

test('an unrecognized unit is refused, not guessed', async () => {
  const body = { data: { metrics: [{ name: 'walking_running_distance', units: 'furlongs', data: [{ qty: 5, date: '2026-08-12 00:00:00 +1000' }] }] } };
  const { perDate, warnings } = parseAutoExportPayload(body);
  assert.equal(perDate.size, 0, 'nothing is stored rather than a wrong number');
  assert.ok(warnings.some((w) => w.includes('furlongs')));
});

test('an unrecognized metric name is skipped and warned, not silently dropped', async () => {
  const body = { data: { metrics: [{ name: 'some_new_metric_apple_invented', units: 'count', data: [{ qty: 1, date: '2026-08-12 00:00:00 +1000' }] }] } };
  const { perDate, warnings } = parseAutoExportPayload(body);
  assert.equal(perDate.size, 0);
  assert.ok(warnings.some((w) => w.includes('some_new_metric_apple_invented')));
});

test('multiple same-day samples: accumulators sum, point-in-time keeps the latest, both flagged', async () => {
  const body = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ qty: 4000, date: '2026-08-12 08:00:00 +1000' }, { qty: 6139, date: '2026-08-12 20:00:00 +1000' }] },
        { name: 'resting_heart_rate', units: 'bpm', data: [{ qty: 60, date: '2026-08-12 08:00:00 +1000' }, { qty: 57, date: '2026-08-12 20:00:00 +1000' }] },
      ],
    },
  };
  const { perDate } = parseAutoExportPayload(body);
  const day = perDate.get('2026-08-12');
  assert.equal(day.metrics.steps, 10139, 'accumulator: samples summed');
  assert.equal(day.metrics.restingHeartRate, 57, 'point-in-time: the latest sample wins, not a sum');
  assert.equal(day.warnings.length, 2, 'both flagged — "Summarize Data" is apparently not collapsing to one point');
});

test('a metric with no data array, or a payload with no data.metrics, degrades honestly', async () => {
  assert.deepEqual(parseAutoExportPayload({}).warnings, ['no data.metrics array in payload']);
  assert.deepEqual(parseAutoExportPayload({ data: {} }).warnings, ['no data.metrics array in payload']);
  const { perDate } = parseAutoExportPayload({ data: { metrics: [{ name: 'step_count', units: 'count' }] } });
  assert.equal(perDate.size, 0, 'a metric entry missing its data array contributes nothing, does not throw');
});
