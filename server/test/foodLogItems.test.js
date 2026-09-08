// THE ITEMISED PLATE — a logged meal keeps its lines, and one wrong line can
// go without taking the meal with it. The contract every reader depends on:
// when an entry has items, its macros ARE the sum of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let dir;
test.before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nova-plate-'));
  process.env.NOVA_DATA_DIR = dir;
});
test.after(async () => { await rm(dir, { recursive: true, force: true }); });

const PLATE = [
  { name: '3 eggs', grams: 150, macros: { p: 19, c: 1, f: 15, kcal: 210 }, source: 'USDA — egg, whole, raw', sourced: true },
  { name: 'sourdough', grams: 54, macros: { p: 4.6, c: 26, f: 0.8, kcal: 140 } },
  { name: 'half an avocado', grams: 70, macros: { p: 1.4, c: 6, f: 15, kcal: 160 } },
];

test('a logged plate keeps its lines, and the total is the sum of them — not what the model claimed', async () => {
  const { addEntry, macrosOfItems } = await import('../lib/foodLog.js');
  // the model's own total is deliberately wrong here: code owns the arithmetic
  const day = await addEntry({ name: 'Eggs on sourdough', macros: { p: 99, c: 99, f: 99, kcal: 999 }, source: 'described', date: '2026-09-08', items: PLATE });
  const entry = day.entries.at(-1);
  assert.equal(entry.items.length, 3);
  assert.deepEqual(entry.macros, macrosOfItems(entry.items));
  assert.deepEqual(entry.macros, { p: 25, c: 33, f: 30.8, kcal: 510 });
  assert.equal(entry.items[0].grams, 150);
  assert.equal(entry.items[0].source, 'USDA — egg, whole, raw');
  assert.equal(entry.items[0].sourced, true);
  assert.equal(entry.items[1].sourced, undefined, 'an unsourced line does not claim a source');
  assert.ok(entry.items.every((it) => it.id && it.id.length >= 4), 'every line is addressable');
});

test('an entry with no breakdown is untouched — the old shape still works', async () => {
  const { addEntry } = await import('../lib/foodLog.js');
  const day = await addEntry({ name: 'Flat white', macros: { p: 8, c: 12, f: 7, kcal: 140 }, date: '2026-09-08' });
  const entry = day.entries.at(-1);
  assert.equal(entry.items, undefined);
  assert.deepEqual(entry.macros, { p: 8, c: 12, f: 7, kcal: 140 });
});

test('dropping one line recomputes the meal — a wrong estimate is correctable, not a lie he accepts whole', async () => {
  const { addEntry, removeEntryItem, getDay } = await import('../lib/foodLog.js');
  const added = await addEntry({ name: 'Eggs on sourdough', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: '2026-09-07', items: PLATE });
  const entry = added.entries.at(-1);
  const avo = entry.items[2];
  const out = await removeEntryItem('2026-09-07', entry.id, avo.id);
  assert.equal(out.entryRemoved, false);
  assert.equal(out.index, 2);
  assert.equal(out.removed.name, 'half an avocado');
  const after = (await getDay('2026-09-07')).entries.find((e) => e.id === entry.id);
  assert.equal(after.items.length, 2);
  assert.deepEqual(after.macros, { p: 23.6, c: 27, f: 15.8, kcal: 350 });
});

test('the last line takes the meal with it — an empty plate is not a meal', async () => {
  const { addEntry, removeEntryItem, getDay } = await import('../lib/foodLog.js');
  const added = await addEntry({ name: 'One thing', macros: { p: 0, c: 0, f: 0, kcal: 0 }, source: 'scan', date: '2026-09-06', items: [PLATE[0]] });
  const entry = added.entries.at(-1);
  const out = await removeEntryItem('2026-09-06', entry.id, entry.items[0].id);
  assert.equal(out.entryRemoved, true);
  assert.equal(out.entry.name, 'One thing');
  assert.equal(out.entry.source, 'scan');
  assert.equal((await getDay('2026-09-06')).entries.find((e) => e.id === entry.id), undefined);
});

test('undo puts the line back where it was — and rebuilds a plate its last delete emptied', async () => {
  const { addEntry, removeEntryItem, restoreEntryItem, getDay } = await import('../lib/foodLog.js');
  const added = await addEntry({ name: 'Eggs on sourdough', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: '2026-09-05', items: PLATE });
  const entry = added.entries.at(-1);
  const middle = entry.items[1];
  const out = await removeEntryItem('2026-09-05', entry.id, middle.id);
  await restoreEntryItem('2026-09-05', entry.id, out.removed, out.index);
  const back = (await getDay('2026-09-05')).entries.find((e) => e.id === entry.id);
  assert.deepEqual(back.items.map((it) => it.name), ['3 eggs', 'sourdough', 'half an avocado']);
  assert.deepEqual(back.macros, { p: 25, c: 33, f: 30.8, kcal: 510 });

  // now empty it entirely, one line at a time, and put the last one back
  for (const it of [...back.items]) await removeEntryItem('2026-09-05', entry.id, it.id);
  assert.equal((await getDay('2026-09-05')).entries.find((e) => e.id === entry.id), undefined);
  await restoreEntryItem('2026-09-05', entry.id, PLATE[0], 0, { name: 'Eggs on sourdough', source: 'described', time: '08:15' });
  const rebuilt = (await getDay('2026-09-05')).entries.find((e) => e.id === entry.id);
  assert.equal(rebuilt.name, 'Eggs on sourdough');
  assert.equal(rebuilt.time, '08:15');
  assert.equal(rebuilt.source, 'described');
  assert.deepEqual(rebuilt.macros, { p: 19, c: 1, f: 15, kcal: 210 });
});

test('editing the totals by hand drops the lines — they no longer describe the number', async () => {
  const { addEntry, editEntryOn, getDay } = await import('../lib/foodLog.js');
  const added = await addEntry({ name: 'Eggs on sourdough', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: '2026-09-04', items: PLATE });
  const entry = added.entries.at(-1);
  await editEntryOn('2026-09-04', entry.id, { macros: { kcal: 400 } });
  const after = (await getDay('2026-09-04')).entries.find((e) => e.id === entry.id);
  assert.equal(after.items, undefined);
  assert.equal(after.macros.kcal, 400);
  assert.equal(after.edited, true);
  // renaming alone is not an arithmetic claim — the lines survive it
  const added2 = await addEntry({ name: 'Plate', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: '2026-09-03', items: PLATE });
  const e2 = added2.entries.at(-1);
  await editEntryOn('2026-09-03', e2.id, { name: 'Breakfast' });
  const after2 = (await getDay('2026-09-03')).entries.find((x) => x.id === e2.id);
  assert.equal(after2.items.length, 3);
  assert.equal(after2.name, 'Breakfast');
});

test('bad lines are refused, not stored: no name, no total, more than the cap', async () => {
  const { normalizeItems } = await import('../lib/foodLog.js');
  assert.deepEqual(normalizeItems(null), []);
  assert.deepEqual(normalizeItems([{ name: '  ' }, { macros: { p: 9 } }]), []);
  assert.equal(normalizeItems(Array.from({ length: 40 }, (_, i) => ({ name: `line ${i}`, macros: { kcal: 10 } }))).length, 24);
  const [one] = normalizeItems([{ name: 'x', grams: -5, macros: { p: -3, kcal: 12.6 } }]);
  assert.equal(one.grams, undefined, 'a negative weight is no weight');
  assert.deepEqual(one.macros, { p: 0, c: 0, f: 0, kcal: 13 });
});

test('a line that is not there, or an entry with no breakdown, says so', async () => {
  const { addEntry, removeEntryItem } = await import('../lib/foodLog.js');
  const day = await addEntry({ name: 'Plain', macros: { p: 1, c: 1, f: 1, kcal: 10 }, date: '2026-09-02' });
  const entry = day.entries.at(-1);
  await assert.rejects(removeEntryItem('2026-09-02', entry.id, 'abc'), /no itemised lines/);
  await assert.rejects(removeEntryItem('2026-09-02', 'nope', 'abc'), /no longer there/);
  const withItems = await addEntry({ name: 'Plate', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: '2026-09-02', items: PLATE });
  await assert.rejects(removeEntryItem('2026-09-02', withItems.entries.at(-1).id, 'zzzz'), /that line is no longer there/);
});
