import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-earned-'));
const { earnedFor, earnedCheck, EARN_CAP, readEarnedState, writeEarnedState } = await import('../lib/earnedCalories.js');
const { earnedOn, plateInstrument } = await import('../../src/fuelSummaryFacts.js');
const { runningTotal } = await import('../lib/runningTotal.js');

const usual = Array.from({ length: 20 }, () => 837);

test('half of what is above his usual, his 4 Nov day reads +150', () => {
  assert.equal(earnedFor({ active: 1137, past: usual }).kcal, 150);
});

test('a quiet day never lowers the target', () => {
  assert.equal(earnedFor({ active: 466, past: usual }).kcal, 0);
});

test('the cap holds on an absurd reading, so the deficit cannot be handed back', () => {
  assert.equal(earnedFor({ active: 4000, past: usual }).kcal, EARN_CAP);
});

test('whatever the watch says, a day never gives back more than half of the extra it claims', () => {
  for (const active of [840, 900, 1000, 1200, 1600]) {
    const r = earnedFor({ active, past: usual });
    assert.ok(r.kcal <= (active - 837) * 0.5 + 5);
  }
});

test('no history, no reading, or switched off earns nothing, and says why', () => {
  assert.equal(earnedFor({ active: 1500, past: usual.slice(0, 5) }).reason, 'not enough history');
  assert.equal(earnedFor({ past: usual }).reason, 'no reading yet');
  assert.equal(earnedFor({ active: 1500, past: usual, on: false }).kcal, 0);
});

const today = '2026-11-30';
const since = '2026-11-07';
const w = (on, kg) => ({ on, kg });

test('two weeks with weight flat proposes; dropping does not', () => {
  const flat = [w('2026-11-17', 82.8), w('2026-11-23', 82.9), w('2026-11-29', 82.8)];
  assert.equal(earnedCheck({ on: true, since, weighIns: flat, today }).verdict, 'stalled');
  const down = [w('2026-11-17', 82.8), w('2026-11-23', 82.3), w('2026-11-29', 81.8)];
  assert.equal(earnedCheck({ on: true, since, weighIns: down, today }).verdict, 'dropping');
});

test('too few weigh-ins or too early never proposes, and says which', () => {
  assert.equal(earnedCheck({ on: true, since, weighIns: [w('2026-11-29', 82)], today }).verdict, 'unknown');
  assert.equal(earnedCheck({ on: true, since: '2026-11-25', weighIns: [], today }).verdict, 'early');
  assert.equal(earnedCheck({ on: false, since, weighIns: [], today }).verdict, 'off');
});

test('the on/off state round-trips and defaults on', async () => {
  assert.equal((await readEarnedState()).on, true);
  await writeEarnedState({ on: false, since });
  assert.equal((await readEarnedState()).on, false);
});

test('the plate: only the day it belongs to, and the plain target marked on the bar', () => {
  assert.equal(earnedOn({ date: '2026-11-07', kcal: 150 }, '2026-11-07'), 150);
  assert.equal(earnedOn({ date: '2026-11-06', kcal: 150 }, '2026-11-07'), 0);
  const p = plateInstrument({ kcalCurrent: 1509, targetKcal: 2288, earnedKcal: 150 });
  assert.equal(p.kcal.left, 779);
  assert.equal(p.kcal.earned.basePct, 93.4);
  assert.equal(plateInstrument({ kcalCurrent: 1, targetKcal: 2138 }).kcal.earned, undefined);
});

test('the running total counts today\'s earned room, never a past day\'s', async () => {
  const deps = { entries: [], goals: null, profile: { targetKcal: 2138, proteinFloorG: 167 } };
  const earned = { date: '2026-11-07', kcal: 150 };
  assert.match((await runningTotal('/x', '2026-11-07', { ...deps, earned })).line, /2,288/);
  assert.match((await runningTotal('/x', '2026-11-06', { ...deps, earned })).line, /2,138/);
});
