import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-fuelchecks-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-fuelchecks-vault-'));
const F = await import('../lib/fuelChecks.js');
const { withRunningTotal } = await import('../lib/runningTotal.js');

const at = (h) => new Date(2026, 10, 9, h, 0, 0); // 9 Nov 2026, local
const LONG = [{ type: 'Traditional Strength Training', minutes: 82, kcal: 430, cardio: null }];
const USUAL = [{ type: 'Traditional Strength Training', minutes: 60, kcal: 316, cardio: null }];
const food = (kcal, p = 40) => ({ totals: { kcal, p }, entryCount: 3 });
const targets = { kcal: 2300, protein: 167 };

test('a long session with food far under, late in the day: said first', () => {
  const [f] = F.fuelChecks({ now: at(16), workouts: LONG, food: food(640), targets });
  assert.equal(f.key, 'hard-day-underfuelled');
  assert.equal(f.rank, 1);
  assert.match(f.line, /82 minute/);
  assert.match(f.line, /640 of 2,300 kcal/);
});

test('not at 9 am: a low total in the morning is a day not yet eaten', () => {
  assert.deepEqual(F.fuelChecks({ now: at(9), workouts: LONG, food: food(0), targets }), []);
  assert.deepEqual(F.fuelChecks({ now: at(14), workouts: LONG, food: food(300), targets }), []);
});

test('his ordinary lifting day (60 min, 316 kcal, 16 sets) never fires, however little he ate', () => {
  const sessions = [{ routineName: 'Push B', workingSets: 16 }];
  assert.deepEqual(F.fuelChecks({ now: at(20), workouts: USUAL, sessions, planned: { name: 'Push B', sets: 18 }, food: food(300), targets }), []);
});

test('the bar rises after 7 pm; at or near target is silent', () => {
  assert.equal(F.fuelChecks({ now: at(16), workouts: LONG, food: food(1200), targets }).length, 0, '52% at 4 pm is fine');
  assert.equal(F.fuelChecks({ now: at(20), workouts: LONG, food: food(1200), targets }).length, 1, '52% at 8 pm is not');
  assert.equal(F.fuelChecks({ now: at(20), workouts: LONG, food: food(2100), targets }).length, 0);
});

test('no target, no judgement', () => {
  assert.deepEqual(F.fuelChecks({ now: at(20), workouts: LONG, food: food(0), targets: null }), []);
});

test('a planned session counts by its sets; a walk never counts as hard, a hard ride does', () => {
  assert.equal(F.fuelChecks({ now: at(17), planned: { name: 'Upper', sets: 24 }, food: food(500), targets }).length, 1);
  const walk = [{ type: 'Walking', minutes: 60, kcal: 250, cardio: 'walk' }];
  assert.equal(F.fuelChecks({ now: at(17), workouts: walk, food: food(500), targets }).length, 0);
  const ride = [{ type: 'Cycling', minutes: 50, kcal: 420, cardio: 'cycle' }];
  assert.equal(F.fuelChecks({ now: at(17), workouts: ride, food: food(500), targets }).length, 1);
});

test('the target includes earned room: the same food is further under a bigger target', () => {
  const plain = F.fuelChecks({ now: at(16), workouts: LONG, food: food(1100), targets: { kcal: 2300, protein: 167 } });
  const earned = F.fuelChecks({ now: at(16), workouts: LONG, food: food(1100), targets: { kcal: 2500, protein: 167 } });
  assert.equal(plain.length, 0);
  assert.equal(earned.length, 1);
});

test('his profile can override a threshold; unknown or bad keys are ignored', () => {
  const t = F.resolveThresholds({ hardMinutes: 50, nonsense: 9, lateHour: -3, carbsPerHour: 'x' });
  assert.equal(t.hardMinutes, 50);
  assert.equal(t.lateHour, F.FUEL_CHECK_DEFAULTS.lateHour);
  assert.equal(t.carbsPerHour, 60);
  assert.equal(F.fuelChecks({ now: at(16), thresholds: t, workouts: USUAL, food: food(640), targets }).length, 1);
});

test('the running total carries the hard-day line, only when it is true and only for today', async () => {
  const now = new Date();
  now.setHours(17, 0, 0, 0);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entries = [{ id: 'a', name: 'Toast', macros: { p: 10, c: 30, f: 5, kcal: 250 } }];
  const fuelDeps = { workouts: async () => LONG, sessions: async () => [], planned: async () => null, profile: null };
  const base = { entries, now, goals: null, profile: { targetKcal: 2300, proteinFloorG: 167 }, earned: { date: null, kcal: 0 } };
  const warned = await withRunningTotal(vault, date, 'Logged.', { ...base, fuelDeps });
  assert.match(warned, /Today so far, Calories: .*Hard day, and the food is behind/);
  const calm = await withRunningTotal(vault, date, 'Logged.', { ...base, fuelDeps: { ...fuelDeps, workouts: async () => USUAL } });
  assert.doesNotMatch(calm, /Hard day/);
  const label = await withRunningTotal(vault, date, 'Food log', { ...base, label: true, fuelDeps });
  assert.doesNotMatch(label, /Hard day/, 'a record label stays a label');
});

// ---- losing too fast -------------------------------------------------------

const iso = (daysAgo) => { const d = at(12); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const weigh = (kgPerWeek, n = 6, spanDays = 17) => Array.from({ length: n }, (_, i) => {
  const ago = spanDays - Math.round((i * spanDays) / (n - 1));
  return { on: iso(ago), kg: Math.round((90 - (kgPerWeek / 7) * (spanDays - ago)) * 10) / 10 };
});
const lift = (id, name, daysAgo, kg) => ({ date: iso(daysAgo), exercises: [{ exerciseId: id, name, sets: [{ weight: kg, reps: 5 }] }] });
const BACKWARDS = [
  lift('bench', 'Bench Press', 35, 80), lift('bench', 'Bench Press', 28, 80), lift('bench', 'Bench Press', 14, 74), lift('bench', 'Bench Press', 7, 74),
  lift('squat', 'Squat', 35, 110), lift('squat', 'Squat', 28, 110), lift('squat', 'Squat', 14, 100), lift('squat', 'Squat', 7, 100),
];
const FINE = [
  lift('bench', 'Bench Press', 35, 80), lift('bench', 'Bench Press', 28, 80), lift('bench', 'Bench Press', 14, 80), lift('bench', 'Bench Press', 7, 82),
];
const eatingFull = Array.from({ length: 10 }, (_, i) => ({ date: iso(i + 1), kcal: 2200, targetKcal: 2200 }));
const eatingFar = Array.from({ length: 10 }, (_, i) => ({ date: iso(i + 1), kcal: 1650, targetKcal: 2200 }));
const fast = (extra) => F.fuelChecks({ now: at(10), weighIns: weigh(1.3), sessionsAll: FINE, foodDays: eatingFull, deload: { advise: false }, ...extra });

test('about 1 kg a week with nothing wrong is not worth a word', () => {
  assert.deepEqual(fast({}), []);
});

test('at or past the line AND lifts going backwards: it speaks', () => {
  const [f] = fast({ sessionsAll: BACKWARDS });
  assert.equal(f.key, 'losing-too-fast');
  assert.equal(f.rank, 2);
  assert.match(f.line, /1\.3 kg a week/);
  assert.match(f.line, /Squat down 9%, Bench Press down 7%/);
});

test('one lift down is a bad week, not a sign (two lifts needed)', () => {
  assert.deepEqual(fast({ sessionsAll: BACKWARDS.slice(0, 4) }), []);
});

test('the recovery signal alone is a sign; so is eating far under on most days', () => {
  assert.equal(fast({ deload: { advise: true, reason: 'x' } })[0].key, 'losing-too-fast');
  assert.equal(fast({ foodDays: eatingFar })[0].key, 'losing-too-fast');
  assert.match(fast({ foodDays: eatingFar })[0].line, /10 of 10 fully logged days/);
});

test('under the line, a sign of harm alone says nothing here', () => {
  assert.deepEqual(fast({ weighIns: weigh(0.7), sessionsAll: BACKWARDS, deload: { advise: true } }), []);
});

test('too few weigh-ins, or too short a span, or too few logged days: silent, never a guess', () => {
  assert.deepEqual(fast({ weighIns: weigh(1.6, 3), sessionsAll: BACKWARDS }), []);
  assert.deepEqual(fast({ weighIns: weigh(2, 5, 9), sessionsAll: BACKWARDS }), []);
  assert.deepEqual(fast({ foodDays: eatingFar.slice(0, 5) }), []);
});

test('the loader never throws: every source failing leaves every check silent', async () => {
  const boom = async () => { throw new Error('unreadable'); };
  const r = await F.loadFuelChecks(vault, { now: at(18), deps: { profile: null, sessions: boom, workouts: boom, day: boom, targets: boom, planned: boom, health: boom, foodDays: boom } });
  assert.deepEqual(r.findings, []);
  assert.equal(r.thresholds.carbsPerHour, 60);
});

test('the loader reads his own overrides from the profile and reaches the checks', async () => {
  const entries = [{ id: 'a', name: 'Toast', macros: { p: 10, c: 30, f: 5, kcal: 250 } }];
  const deps = {
    profile: { intake: { fuelChecks: { hardMinutes: 50 } } },
    sessions: async () => [], workouts: async () => USUAL, planned: async () => null, health: async () => [], foodDays: async () => [],
    day: async () => ({ entries }), targets: async () => ({ kcal: 2300, protein: 167 }),
  };
  const r = await F.loadFuelChecks(vault, { now: at(17), deps });
  assert.equal(r.findings[0]?.key, 'hard-day-underfuelled');
});

// ---- session fuel ----------------------------------------------------------

test('a planned session over 75 minutes: carbs an hour from minute 30, the number from the thresholds', () => {
  const [f] = F.fuelChecks({ now: at(8), planned: { name: 'Ride', minutes: 150 } });
  assert.equal(f.key, 'session-fuel');
  assert.match(f.line, /2\.5|150 minute/);
  assert.match(f.line, /60 g of carbs an hour from minute 30/);
  assert.match(f.line, /around 120 g in all/);
  const [g] = F.fuelChecks({ now: at(8), thresholds: F.resolveThresholds({ carbsPerHour: 40 }), planned: { minutes: 120 } });
  assert.match(g.line, /40 g of carbs an hour/);
  assert.match(g.line, /2 hour/);
});

test('his ordinary lifting sessions produce nothing: 75 minutes exactly, no planned length, 60 minutes', () => {
  assert.deepEqual(F.fuelChecks({ now: at(8), planned: { name: 'Push B', sets: 18, minutes: 75 } }), []);
  assert.deepEqual(F.fuelChecks({ now: at(8), planned: { name: 'Push B', sets: 18, minutes: null } }), []);
  assert.deepEqual(F.fuelChecks({ now: at(8), planned: { name: 'Push B', sets: 18, minutes: 60 } }), []);
});

test('a hard-day finding outranks it', () => {
  const out = F.fuelChecks({ now: at(17), weighIns: weigh(1.3), sessionsAll: BACKWARDS, foodDays: eatingFull, workouts: LONG, food: food(500), targets });
  assert.deepEqual(out.map((f) => f.key), ['hard-day-underfuelled', 'losing-too-fast']);
});
