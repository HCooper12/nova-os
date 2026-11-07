// Food in the briefs: one honest line each, from the real log, against the
// targets in force on the day measured. No new notification anywhere.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-fb-vault-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-fb-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { yesterdayFoodText, yesterdayFoodLine, eveningFuelText, isThinLog, isoDaysBefore } = await import('../lib/foodBrief.js');
const { addEntry } = await import('../lib/foodLog.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const targets = { kcal: 2138, protein: 167 };

test('nothing logged says so', () => {
  assert.equal(yesterdayFoodText({ entryCount: 0, totals: { kcal: 0, p: 0 }, targets }), "**Yesterday's food.** Nothing was logged.");
});

test('a thin log is called incomplete, not presented as a small meal day', () => {
  const t = yesterdayFoodText({ entryCount: 2, totals: { kcal: 640, p: 38 }, targets });
  assert.match(t, /Only Calories: 640 \/ 2,138 · Protein: 38 \/ 167 g was logged, so the log is probably incomplete/);
  assert.equal(isThinLog({ kcal: 1100 }, { kcal: 2138 }), false, 'over half the target and over 1,000 counts as a real day');
  assert.equal(isThinLog({ kcal: 1050 }, { kcal: 2400 }), true, 'under half the target is thin');
  assert.equal(isThinLog({ kcal: 900 }, {}), true, 'under 1,000 is thin with no target');
});

test('a normal day reads as the line he asked for', () => {
  assert.equal(
    yesterdayFoodText({ entryCount: 5, totals: { kcal: 2010, p: 150 }, targets }),
    "**Yesterday's food.** Calories: 2,010 / 2,138 · Protein: 150 / 167 g.",
  );
});

test('evening: protein as before, calories beside it, one sum', () => {
  assert.equal(eveningFuelText({ totals: { kcal: 1950, p: 170 }, targets }), '**Fuel.** Protein floor hit, 170g against 167g. Calories 1,950 of 2,138.');
  assert.equal(eveningFuelText({ totals: { kcal: 1200, p: 96 }, targets }), '**Fuel.** 96g protein against the 167g floor, 71g short. Calories 1,200 of 2,138.');
  assert.equal(eveningFuelText({ totals: { kcal: 500, p: 30 }, targets: {} }), '**Fuel.** 30g protein logged today. Calories 500 logged.');
});

test('yesterday reads the real log and that day\'s own target', async () => {
  const now = new Date();
  const y = isoDaysBefore(now, 1);
  await addEntry({ name: 'big day', macros: { p: 150, c: 200, f: 60, kcal: 2010 }, date: y });
  const goals = { kcalTarget: 2500, proteinTarget: 190, targetHistory: [
    { from: '1970-01-01', kcal: 2138, protein: 167 },
    { from: isoDaysBefore(now, 0), kcal: 2500, protein: 190 },
  ] };
  const line = await yesterdayFoodLine(vault, now, { goals, profile: null });
  assert.equal(line, "**Yesterday's food.** Calories: 2,010 / 2,138 · Protein: 150 / 167 g.", 'today\'s new goal does not re-judge yesterday');
});

test('the morning brief carries yesterday and the evening brief carries calories', async () => {
  const { composeDispatch } = await import('../lib/dispatch.js');
  const morning = await composeDispatch(vault, 'morning', new Date());
  assert.match(JSON.stringify(morning), /Yesterday's food\./);
  const evening = await composeDispatch(vault, 'evening', new Date());
  assert.match(JSON.stringify(evening), /Calories [\d,]+/);
});
