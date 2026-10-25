// THE WEEKLY NUMBERS REVIEW — code reads his weight, food log, Apple Health
// and training, and proposes new facts only when the record really supports it.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = path.join(os.tmpdir(), `nova-fuelreview-${process.pid}`);
const { reviewNumbers, weightSlope, isoWeek, KCAL_PER_KG } = await import('../lib/fuelReview.js');
const { compute } = await import('../lib/intake.js');

const FACTS = { sex: 'male', age: 28, heightCm: 188.5, weightKg: 83, activity: 'moderate', goal: 'lose', pace: 'aggressive', eating: '' };
const intake = (facts = FACTS) => ({ on: '2026-10-18', facts, plan: compute(facts) });
const iso = (base, i) => new Date(Date.UTC(2026, 9, base + i)).toISOString().slice(0, 10);
// 28 days ending 25 Oct
const days = (fn) => Array.from({ length: 28 }, (_, i) => fn(iso(-2 + 1, i), i)).filter(Boolean);

test('the slope is a line through every weigh-in, in kg a day', () => {
  const s = weightSlope([{ on: '2026-10-01', kg: 84 }, { on: '2026-10-08', kg: 83.5 }, { on: '2026-10-15', kg: 83 }]);
  assert.ok(Math.abs(s * 7 - -0.5) < 1e-9);
  assert.equal(weightSlope([{ on: '2026-10-01', kg: 84 }]), null);
});

test('his 26 Oct record: gaining while logging over target — the target is NOT cut on a burn no body has', () => {
  // the real shape: four weigh-ins rising ~0.5 kg/week, ~2,575 kcal logged against 2,153
  const weighIns = [{ on: '2026-09-25', kg: 82.1 }, { on: '2026-10-08', kg: 83.4 }, { on: '2026-10-15', kg: 83 }, { on: '2026-10-19', kg: 84.3 }];
  const logs = days((date) => ({ date, kcal: 2575, targetKcal: 2153 }));
  const health = days((date) => ({ date, activeEnergyKcal: 727 }));
  const r = reviewNumbers({ intake: intake(), weighIns, logs, health, sessions: 19, today: '2026-10-26' });
  assert.equal(r.verdict, 'implausible');
  assert.equal(r.proposal, null, 'no card');
  assert.ok(r.lines.some((l) => /422 above the day's target on average/.test(l)), 'says the real thing: he is eating over');
  assert.ok(r.lines.some((l) => /target is not changed on it/.test(l)));
  assert.ok(r.lines.some((l) => /Kept moderate/.test(l)));
});

test('a consistent record calibrates the burn — one capped step, and the card carries the new numbers', () => {
  // eating 2,400 and holding weight flat on an aggressive cut → he burns ~2,400, not ~2,900
  const weighIns = [0, 7, 14, 21].map((d) => ({ on: iso(-1, d), kg: 83 }));
  const logs = days((date) => ({ date, kcal: 2400, targetKcal: 2153 }));
  const health = days((date) => ({ date, activeEnergyKcal: 700 }));
  const r = reviewNumbers({ intake: intake(), weighIns, logs, health, sessions: 16, today: '2026-10-26' });
  assert.equal(r.verdict, 'propose');
  assert.equal(r.proposal.change.tdeeAdjust, -150, 'moved at most 150 a week');
  assert.equal(r.proposal.change.tdeeAdjustOn, '2026-10-26');
  assert.equal(r.proposal.plan.targetKcal, intake().plan.targetKcal - 150);
  assert.ok(r.lines.some((l) => /moved at most 150 a week/.test(l)));
});

test('the calibration converges: inside the dead band it holds', () => {
  const f = { ...FACTS, tdeeAdjust: -500 };
  const base = compute({ ...FACTS });
  const weighIns = [0, 7, 14, 21].map((d) => ({ on: iso(-1, d), kg: 83 }));
  const logs = days((date) => ({ date, kcal: base.formulaTdee - 460, targetKcal: 2000 }));
  const r = reviewNumbers({ intake: intake(f), weighIns, logs, health: [], sessions: null, today: '2026-10-26' });
  assert.ok(r.lines.some((l) => /within 100 kcal/.test(l)));
  assert.equal(r.proposal, null);
});

test('thin data says what it lacks and calibrates nothing', () => {
  const r = reviewNumbers({ intake: intake(), weighIns: [{ on: '2026-10-19', kg: 83.2 }], logs: [], health: [], today: '2026-10-26' });
  assert.equal(r.verdict, 'not-enough');
  assert.ok(r.lines.some((l) => /1 weigh-in across 0 days and 0 logged days/.test(l)));
  assert.equal(r.proposal, null);
});

test('a body fat reading arrives → the card switches him to Katch-McArdle', () => {
  const health = [{ date: '2026-10-24', bodyFatPct: 17.5 }];
  const r = reviewNumbers({ intake: intake(), weighIns: [], logs: [], health, today: '2026-10-26' });
  assert.equal(r.verdict, 'propose');
  assert.equal(r.proposal.facts.bodyFatPct, 17.5);
  assert.equal(r.proposal.plan.bmrFormula, 'katch-mcardle');
});

test('activity changes only when Apple Health AND his training both say so', () => {
  const health = days((date) => ({ date, activeEnergyKcal: 450 }));
  const both = reviewNumbers({ intake: intake(), weighIns: [], logs: [], health, sessions: 4, today: '2026-10-26' });
  assert.equal(both.proposal?.change.activity, 'light');
  const one = reviewNumbers({ intake: intake(), weighIns: [], logs: [], health, sessions: 16, today: '2026-10-26' });
  assert.equal(one.proposal, null);
  assert.ok(one.lines.some((l) => /do not agree/.test(l)));
});

test('a new weigh-in that moves the numbers enough is proposed; a small one is only reported', () => {
  const big = reviewNumbers({ intake: intake(), weighIns: [{ on: '2026-10-24', kg: 87 }], logs: [], health: [], today: '2026-10-26' });
  assert.equal(big.proposal.facts.weightKg, 87);
  assert.equal(big.proposal.plan.proteinG, Math.round(87 * 2));
  const small = reviewNumbers({ intake: intake(), weighIns: [{ on: '2026-10-24', kg: 84.2 }], logs: [], health: [], today: '2026-10-26' });
  assert.equal(small.proposal, null);
  assert.ok(small.lines.some((l) => /too close to change/.test(l)));
});

test('one review per ISO week', () => {
  assert.equal(isoWeek(new Date(2026, 9, 26)), '2026-W44');
  assert.equal(isoWeek(new Date(2026, 10, 1)), '2026-W44');
  assert.equal(isoWeek(new Date(2026, 10, 2)), '2026-W45');
  assert.equal(KCAL_PER_KG, 7700);
});

test('Apple Health body fat arrives as a fraction and is stored as a percent', async () => {
  const { normalizeMetric, HEALTH_METRICS } = await import('../lib/healthData.js');
  assert.ok(HEALTH_METRICS.includes('bodyFatPct') && HEALTH_METRICS.includes('leanBodyMassKg'));
  assert.equal(normalizeMetric('bodyFatPct', 0.182), 18.2);
  assert.equal(normalizeMetric('bodyFatPct', 18.2), 18.2);
  assert.equal(normalizeMetric('bodyFatPct', 95), null);
  assert.equal(normalizeMetric('leanBodyMassKg', 69000), 69);
});
