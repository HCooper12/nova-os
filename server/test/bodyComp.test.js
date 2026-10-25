// WHERE HE STANDS: pure arithmetic over his records, honest "unknown" when a
// record is missing, and the phase verdict by the published bands.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// before ANY lib import: nothing here may touch his live server/data
const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-bodycomp-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const { computeStanding, formatStanding, STANDING_HEAD } = await import('../lib/bodyComp.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

const TODAY = '2026-10-26';
const isoBack = (n) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

// his real shape, 18 Oct Intake
const INTAKE = {
  on: '2026-10-18',
  facts: { sex: 'male', age: 28, heightCm: 188.5, weightKg: 83, bodyFatPct: 17.5, bodyFatRange: [16, 19], bodyFatMethod: 'visual+navy', activity: 'moderate', goal: 'lose', pace: 'aggressive' },
  plan: { bmr: 1849, tdee: 2866, targetKcal: 2116, proteinG: 166 },
};
const GOALS = { goal: 'Bigger arms and shoulders', daysPerWeek: 4, stepsTarget: 10000, goalMuscles: ['Side Delts', 'Biceps', 'Triceps'], targets: [] };

// 28 days: steps alternate 6,000 / 10,000 (avg 8,000, 14 days met), sleep on
// 10 nights at 6.4 h, HRV 50 for the prior 21 and 42.5 for the last 7 (−15%)
function healthDays() {
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = { date: isoBack(i), steps: i % 2 ? 6000 : 10000, hrv: i < 7 ? 42.5 : 50, restingHeartRate: i < 7 ? 58 : 55, activeEnergyKcal: 600 };
    if (i < 10) d.sleepAsleepMinutes = 384; // 6.4 h
    if (i % 7 === 0) { d.weightKg = 83 - (27 - i) * 0.02; d.weightMeasuredOn = d.date; }
    days.push(d);
  }
  return days;
}
const sessions19 = Array.from({ length: 19 }, (_, i) => ({ date: isoBack(i), finishedAt: `${isoBack(i)}T09:00:00.000Z` }));

test('his real shape: cutting at ~17.5% fits, the lean bulk comes after 14%, weeks counted at his pace', () => {
  const s = computeStanding({ intake: INTAKE, goals: GOALS, health: healthDays(), sessions: sessions19, today: TODAY });
  assert.equal(s.phase.current, 'cut');
  assert.equal(s.phase.fits, true);
  assert.match(s.phase.advice, /lean bulk/i);
  assert.match(s.phase.advice, /14%/);
  assert.ok(Number.isInteger(s.phase.weeksToBand) && s.phase.weeksToBand > 0, `weeksToBand ${s.phase.weeksToBand}`);
  assert.equal(s.bodyComp.pct, 17.5);
  assert.deepEqual(s.bodyComp.range, [16, 19]);
  assert.equal(s.bodyComp.methodWords, 'visual guide + Navy tape');
  assert.ok(s.bodyComp.leanKg > 60 && s.bodyComp.leanKg < 75);
  // activity
  assert.equal(s.activity.stepsAvg, 8000);
  assert.equal(s.activity.stepsLogged, 28);
  assert.equal(s.activity.stepsMet, 14);
  assert.equal(s.activity.sessions, 19);
  assert.equal(s.activity.sessionsPerWeek, 4.8);
  // recovery
  assert.equal(s.recovery.sleepNights, 10);
  assert.equal(s.recovery.sleepAvgH, 6.4);
  assert.equal(s.recovery.hrvChangePct, -15);
  assert.equal(s.recovery.hrvDown, true);
  assert.equal(s.recovery.rhrChange, 3);
  // weight slope from the weigh-ins
  assert.ok(s.weight.perWeekKg < 0);
  // the block
  const text = formatStanding(s, ['Weight: 82.5 kg on 2026-10-25.']);
  assert.ok(text.startsWith(STANDING_HEAD));
  assert.match(text, /STRATEGY: He is cutting at ~17\.5% \(estimate 16-19%, visual guide \+ Navy tape\)\. A lean bulk usually starts at or below 12-15%, so the cut comes first: about \d+ weeks? to 14% at his aggressive pace\. Then a lean bulk for his goal muscles/);
  assert.match(text, /14 of 28 days met his 10,000 target/);
  assert.match(text, /That is a down-trend/);
  assert.match(text, /THIS WEEK'S NUMBERS REVIEW \(code\):\n- Weight: 82\.5 kg/);
  assert.doesNotMatch(text, /[—–]/, 'no em or en dashes');
});

test('no body fat known: fits is null and the advice names the estimate', () => {
  const intake = { ...INTAKE, facts: { ...INTAKE.facts, bodyFatPct: undefined, bodyFatRange: undefined, bodyFatMethod: undefined } };
  const s = computeStanding({ intake, goals: GOALS, health: healthDays(), sessions: sessions19, today: TODAY });
  assert.equal(s.phase.current, 'cut');
  assert.equal(s.phase.fits, null);
  assert.equal(s.phase.weeksToBand, null);
  assert.match(s.phase.advice, /Estimate it/);
  assert.equal(s.bodyComp.pct, null);
  assert.match(s.lines[0], /^Body fat: unknown/);
});

test('empty health, no intake, unreadable sessions: every line says unknown, nothing invented', () => {
  const s = computeStanding({ intake: null, goals: null, health: [], sessions: null, today: TODAY });
  for (const l of s.lines) assert.match(l, /unknown/i, l);
  assert.equal(s.activity.stepsAvg, null);
  assert.equal(s.recovery.sleepAvgH, null);
  assert.equal(s.recovery.hrvAvg, null);
  assert.equal(s.weight.latestKg, null);
  assert.equal(s.phase.fits, null);
  assert.doesNotMatch(formatStanding(s), /\d{2,} (kcal|steps|ms|bpm)/);
});

test('goal gain at 19%: does not fit, the advice says cut first', () => {
  const intake = { ...INTAKE, facts: { ...INTAKE.facts, goal: 'gain', pace: 'steady', bodyFatPct: 19, bodyFatRange: undefined, bodyFatMethod: 'visual' } };
  const s = computeStanding({ intake, goals: GOALS, health: healthDays(), sessions: sessions19, today: TODAY });
  assert.equal(s.phase.current, 'gain');
  assert.equal(s.phase.fits, false);
  assert.match(s.phase.advice, /cut first/);
  assert.ok(s.phase.weeksToBand > 0);
});

test('a lean man gaining fits; a woman at 20% is inside her band', () => {
  const lean = computeStanding({ intake: { ...INTAKE, facts: { ...INTAKE.facts, goal: 'gain', bodyFatPct: 12 } }, goals: GOALS, health: [], sessions: [], today: TODAY });
  assert.equal(lean.phase.fits, true);
  assert.equal(lean.phase.weeksToBand, 0);
  const her = computeStanding({ intake: { ...INTAKE, facts: { ...INTAKE.facts, sex: 'female', goal: 'gain', bodyFatPct: 20 } }, goals: null, health: [], sessions: [], today: TODAY });
  assert.equal(her.phase.fits, true);
  assert.deepEqual(her.phase.band, [20, 23]);
});

test('days outside the 28-day window are ignored', () => {
  const old = [{ date: isoBack(40), steps: 30000, hrv: 90 }];
  const s = computeStanding({ intake: null, goals: GOALS, health: old, sessions: [], today: TODAY });
  assert.equal(s.activity.stepsAvg, null);
  assert.equal(s.recovery.hrvAvg, null);
  assert.equal(s.activity.sessions, 0);
});
