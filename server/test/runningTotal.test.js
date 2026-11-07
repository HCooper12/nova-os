// The running total on every food confirmation: the sum is code's, and the
// target is the one in force on THAT day (a new goal never rewrites the past).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-rt-vault-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-rt-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runningTotalLine, runningTotal, withRunningTotal, targetsForDay } = await import('../lib/runningTotal.js');
const { addEntry } = await import('../lib/foodLog.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('the line reads exactly as he asked for it', () => {
  assert.equal(
    runningTotalLine({ totals: { kcal: 1240, p: 96 }, targets: { kcal: 2138, protein: 167 } }),
    'Calories: 1,240 / 2,138 · Protein: 96 / 167 g',
  );
});

test('an unknown target stands alone rather than against an invented one', () => {
  assert.equal(runningTotalLine({ totals: { kcal: 300, p: 20 }, targets: {} }), 'Calories: 300 · Protein: 20 g');
  assert.equal(runningTotalLine({ totals: { kcal: 300.4, p: 19.6 }, targets: { kcal: 2000 } }), 'Calories: 300 / 2,000 · Protein: 20 g');
});

test('the sum comes from the real entries, not from the sentence', async () => {
  const date = dayAgo(2);
  await addEntry({ name: 'a', macros: { p: 30, c: 0, f: 0, kcal: 400 }, date });
  await addEntry({ name: 'b', macros: { p: 66, c: 0, f: 0, kcal: 840 }, date });
  const r = await runningTotal(vault, date, { goals: { kcalTarget: 2138, proteinTarget: 167 }, profile: null });
  assert.equal(r.line, 'Calories: 1,240 / 2,138 · Protein: 96 / 167 g');
});

test('that day\'s own targets: a goal changed later does not re-judge a past day', async () => {
  const goals = { kcalTarget: 2500, proteinTarget: 190, targetHistory: [
    { from: '1970-01-01', kcal: 2138, protein: 167 },
    { from: dayAgo(1), kcal: 2500, protein: 190 },
  ] };
  const past = await targetsForDay(vault, dayAgo(2), { goals, profile: null });
  assert.deepEqual(past, { kcal: 2138, protein: 167 });
  const now = await targetsForDay(vault, dayAgo(0), { goals, profile: null });
  assert.deepEqual(now, { kcal: 2500, protein: 190 });
});

test('withRunningTotal appends in the right voice and never throws', async () => {
  const date = dayAgo(2);
  const said = await withRunningTotal(vault, date, 'Logged.', { goals: { kcalTarget: 2138, proteinTarget: 167 }, profile: null });
  assert.equal(said, 'Logged. Today so far, Calories: 1,240 / 2,138 · Protein: 96 / 167 g.');
  const label = await withRunningTotal(vault, date, 'Food log: a', { label: true, goals: { kcalTarget: 2138, proteinTarget: 167 }, profile: null });
  assert.equal(label, 'Food log: a. Today: Calories: 1,240 / 2,138 · Protein: 96 / 167 g');
  // a day he may not read (the future) is not a reason for the confirmation to fail
  assert.equal(await withRunningTotal(vault, '2999-01-01', 'Logged.'), 'Logged.');
});

test('the filed food capture and the eaten verb carry the tally', async () => {
  const { fileDecision } = await import('../lib/inbox.js');
  const r = await fileDecision(vault, { route: 'food', payload: { name: 'Protein bar', macros: { p: 20, c: 24, f: 9, kcal: 250 } } });
  assert.match(r.destination, /^Food log — Protein bar \(20P · 24C · 9F · 250 kcal\)\. Today: Calories: [\d,]+ · Protein: [\d,]+/);
});
