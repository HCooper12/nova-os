// Sleep must arrive in whatever shape his phone can produce. Zero of 40 day
// files had ever carried it, and insisting on one spelling and one unit is
// the likeliest reason — the same failure mode as the weightKg casing bug.
import test from 'node:test';
import assert from 'node:assert/strict';

const { pickKnownMetrics } = await import('../lib/healthData.js');

test('the canonical form still works, unchanged', () => {
  const out = pickKnownMetrics({ sleepAsleepMinutes: 412, sleepInBedMinutes: 480 });
  assert.equal(out.sleepAsleepMinutes, 412);
  assert.equal(out.sleepInBedMinutes, 480);
});

test('hours are accepted and converted — Shortcuts hands you a decimal', () => {
  const out = pickKnownMetrics({ sleepHours: 6.9, inBedHours: 8 });
  assert.equal(out.sleepAsleepMinutes, 414, '6.9h → 414 min');
  assert.equal(out.sleepInBedMinutes, 480, '8h → 480 min');
});

test('the names a person would actually type all land', () => {
  assert.equal(pickKnownMetrics({ sleep: 400 }).sleepAsleepMinutes, 400);
  assert.equal(pickKnownMetrics({ asleep: 400 }).sleepAsleepMinutes, 400);
  assert.equal(pickKnownMetrics({ timeAsleep: 400 }).sleepAsleepMinutes, 400);
  assert.equal(pickKnownMetrics({ timeInBed: 470 }).sleepInBedMinutes, 470);
  assert.equal(pickKnownMetrics({ SLEEPINBED: 470 }).sleepInBedMinutes, 470, 'casing must never matter again');
});

test('an explicit key always beats an alias, and 0 is still "no samples"', () => {
  const out = pickKnownMetrics({ sleepAsleepMinutes: 400, sleepHours: 99 });
  assert.equal(out.sleepAsleepMinutes, 400, 'the canonical value wins');
  assert.equal(pickKnownMetrics({ sleepAsleepMinutes: 0 }).sleepAsleepMinutes, undefined, '0 means iOS found no samples');
  assert.equal(pickKnownMetrics({ sleepHours: 0 }).sleepAsleepMinutes, undefined);
});

test('his real push body still parses exactly as before', () => {
  // verbatim from server/data/health/pushlog.json, 26 Aug
  const out = pickKnownMetrics({
    steps: 6302, watchSteps: 6554, restingHeartRate: 64, hrv: 75.2731097661548,
    activeEnergyKcal: 656.627000000001, walkingRunningDistanceKm: 9.93192910073651,
    weightKg: 82.1, vo2Max: 47.4775,
  });
  assert.equal(out.steps, 6554, 'the MAX device fold is untouched');
  assert.equal(out.restingHeartRate, 64);
  assert.equal(out.sleepAsleepMinutes, undefined, 'no sleep sent means no sleep stored');
});
