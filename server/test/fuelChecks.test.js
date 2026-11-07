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
