// "It was 2 servings": a logged entry scaled by voice. The diff is shown before
// the yes, every line and the total move together, and undo is exact.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-scale-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-scale-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { parseCommand, runVerb } = await import('../lib/verbs.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { addEntry, getToday, scaleEntry } = await import('../lib/foodLog.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const cand = (t) => parseCommand(t)?.any?.[0];

test('grammar: the scale sentences reach foodlog.fix as candidates', () => {
  assert.deepEqual(cand('it was 2 servings').args, { entry: 'that', scale: 2 });
  assert.deepEqual(cand('that was 1.5 servings').args, { entry: 'that', scale: 1.5 });
  assert.deepEqual(cand('that was half').args, { entry: 'that', scale: 0.5 });
  assert.deepEqual(cand('double that').args, { entry: 'that', scale: 2 });
  assert.deepEqual(cand('make the rice 200 g').args, { entry: 'rice', grams: 200 });
  assert.deepEqual(cand('change the chicken to 150 grams').args, { entry: 'chicken', grams: 150 });
  // the older sentences are not stolen
  assert.deepEqual(cand('that protein bar was 25 grams of protein').args, { entry: 'protein bar', p: 25 });
  assert.equal(parseCommand('set eggs to 12').verb, 'shopping.qty');
  assert.equal(parseCommand('make lunch to burrito bowl').verb, 'recipe.slot');
});

const PLATE = [
  { name: 'chicken thigh', grams: 150, macros: { p: 39, c: 0, f: 15, kcal: 291 }, fibreG: 0, sodiumMg: 100 },
  { name: 'jasmine rice', grams: 100, macros: { p: 2.7, c: 28, f: 0.3, kcal: 126 }, fibreG: 0.4, sodiumMg: 1 },
];

test('scaleEntry: every line and the total move together, and the total stays the sum of its lines', () => {
  const entry = { id: 'e1', name: 'Chicken rice', macros: { p: 41.7, c: 28, f: 15.3, kcal: 417 }, items: PLATE.map((it, i) => ({ id: `i${i}`, ...it })) };
  const { entry: out, factor } = scaleEntry(entry, { factor: 2 });
  assert.equal(factor, 2);
  assert.equal(out.items[0].grams, 300);
  assert.equal(out.items[0].macros.p, 78);
  assert.equal(out.items[1].macros.kcal, 252);
  assert.equal(out.items[0].sodiumMg, 200);
  assert.equal(out.macros.kcal, out.items.reduce((a, it) => a + it.macros.kcal, 0));
  assert.equal(out.fibreG, 0.8);
  assert.equal(out.edited, true);
  assert.equal(entry.items[0].grams, 150, 'the input is not mutated');
});

test('one line re-weighed leaves the others alone', () => {
  const entry = { id: 'e1', name: 'x', macros: { p: 0, c: 0, f: 0, kcal: 417 }, items: PLATE.map((it, i) => ({ id: `i${i}`, ...it })) };
  const { entry: out } = scaleEntry(entry, { itemId: 'i1', grams: 200 });
  assert.equal(out.items[1].grams, 200);
  assert.equal(out.items[1].macros.kcal, 252);
  assert.deepEqual(out.items[0], entry.items[0]);
  assert.equal(out.macros.kcal, 291 + 252);
});

test('a plain entry scales its macros; nonsense is refused in plain words', () => {
  const { entry: out } = scaleEntry({ id: 'e', name: 'Bar', macros: { p: 20, c: 24, f: 9, kcal: 250 } }, { factor: 0.5 });
  assert.deepEqual(out.macros, { p: 10, c: 12, f: 4.5, kcal: 125 });
  assert.throws(() => scaleEntry({ id: 'e', name: 'Bar', macros: { p: 20, c: 24, f: 9, kcal: 250 } }, { grams: 200 }), /no weights on file/);
  assert.throws(() => scaleEntry({ id: 'e', name: 'Bar', macros: { p: 1, c: 1, f: 1, kcal: 17 } }, { factor: 500 }), /huge/);
  assert.throws(() => scaleEntry({ id: 'e', name: 'Bar', macros: { p: 1, c: 1, f: 1, kcal: 17 } }, { factor: 0 }), /how much/);
});

test('by voice: the diff comes first, nothing is written before the yes, undo is exact', async () => {
  await addEntry({ name: 'Chicken rice', macros: { p: 0, c: 0, f: 0, kcal: 0 }, items: PLATE });
  const before = (await getToday()).entries.at(-1);
  const prop = await runVerb(vault, 'it was 2 servings', { verb: 'foodlog.fix', args: { entry: 'that', scale: 2 } });
  assert.ok(prop.proposal, 'lands pending');
  assert.match(prop.proposal.title, /Chicken rice x2 — 41\.7P · 28C · 15\.3F · 417 kcal → 83\.4P · 56C · 30\.6F · 834 kcal/);
  assert.deepEqual((await getToday()).entries.at(-1), before, 'nothing written before the yes');

  await approveRecord(vault, prop.proposal.recordId);
  const after = (await getToday()).entries.at(-1);
  assert.equal(after.macros.kcal, 834);
  assert.equal(after.items[0].grams, 300);

  await undoRecord(vault, prop.proposal.recordId);
  assert.deepEqual((await getToday()).entries.at(-1), before, 'the entry returns exactly, lines and all');
});

test('by voice: "make the rice 200 g" finds the LINE inside the plate', async () => {
  const prop = await runVerb(vault, 'make the rice 200 g', { verb: 'foodlog.fix', args: { entry: 'rice', grams: 200 } });
  assert.match(prop.proposal.title, /jasmine rice in Chicken rice/);
  await approveRecord(vault, prop.proposal.recordId);
  const e = (await getToday()).entries.at(-1);
  assert.equal(e.items[1].grams, 200);
  assert.equal(e.items[0].grams, 150);
  assert.equal(e.macros.kcal, e.items.reduce((a, it) => a + it.macros.kcal, 0));
  await undoRecord(vault, prop.proposal.recordId);
  assert.equal((await getToday()).entries.at(-1).items[1].grams, 100);
});

test('a stale scale refuses rather than clobbering', async () => {
  const prop = await runVerb(vault, 'q', { verb: 'foodlog.fix', args: { entry: 'that', scale: 3 } });
  const { editEntryOn } = await import('../lib/foodLog.js');
  const e = (await getToday()).entries.at(-1);
  await editEntryOn(e.date || (await getToday()).date, e.id, { macros: { p: 1 } });
  await assert.rejects(() => approveRecord(vault, prop.proposal.recordId), /changed since you asked/);
});
