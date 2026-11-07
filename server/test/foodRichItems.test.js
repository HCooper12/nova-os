// RICHER FOOD ITEMS: fibre, sugars, sodium, fdcId, barcode, his words, the meal.
// All optional, all additive: an old entry must read exactly as it always did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let dir;
test.before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nova-rich-'));
  process.env.NOVA_DATA_DIR = dir;
});
test.after(async () => { await rm(dir, { recursive: true, force: true }); });

test('pickNutrients reads fibre, sugars and sodium when USDA gives them, null when it does not', async () => {
  const { pickNutrients } = await import('../lib/nutritionFacts.js');
  const full = pickNutrients({ foodNutrients: [
    { nutrientName: 'Protein', value: 3 }, { nutrientName: 'Total lipid (fat)', value: 1 },
    { nutrientName: 'Carbohydrate, by difference', value: 20 },
    { nutrientName: 'Fiber, total dietary', value: 2.5 }, { nutrientName: 'Total Sugars', value: 4 },
    { nutrientName: 'Sodium, Na', value: 120 },
  ] });
  assert.equal(full.fibre, 2.5); assert.equal(full.sugar, 4); assert.equal(full.sodium, 120);
  const bare = pickNutrients({ foodNutrients: [{ nutrientName: 'Protein', value: 3 }] });
  assert.equal(bare.fibre, null, 'absent is null, not zero');
  const old = pickNutrients({ foodNutrients: [{ nutrientName: 'Sugars, total including NLEA', value: 9 }] });
  assert.equal(old.sugar, 9);
});

test('scaleExtras only returns what the database gave', async () => {
  const { scaleExtras } = await import('../lib/nutritionFacts.js');
  assert.deepEqual(scaleExtras({ fibre: 2, sodium: 100 }, 150), { fibreG: 3, sodiumMg: 150 });
  assert.deepEqual(scaleExtras({ p: 1, c: 1, f: 1 }, 150), {});
});

test('a v1 cache entry is refetched, and kept as the fallback when the refetch fails', async () => {
  const { lookupPer100g } = await import('../lib/nutritionFacts.js');
  const { createHash } = await import('node:crypto');
  const name = 'cached oats';
  const key = createHash('sha1').update('cached oats').digest('hex').slice(0, 16);
  await mkdir(path.join(dir, 'nutrition-cache'), { recursive: true });
  const v1 = { v: 1, fact: { source: 'USDA FoodData Central', matched: 'Oats', per100g: { p: 13, c: 68, f: 7 } }, at: 'x' };
  await writeFile(path.join(dir, 'nutrition-cache', `${key}.json`), JSON.stringify(v1));
  const realFetch = globalThis.fetch;
  try {
    // offline: v1 still serves
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual((await lookupPer100g(name)).per100g, v1.fact.per100g);
    // online: refetched, rewritten as v2 with the extras
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ foods: [{
      dataType: 'SR Legacy', description: 'Oats', fdcId: 7,
      foodNutrients: [
        { nutrientName: 'Protein', value: 13 }, { nutrientName: 'Carbohydrate, by difference', value: 68 },
        { nutrientName: 'Total lipid (fat)', value: 7 }, { nutrientName: 'Fiber, total dietary', value: 10 },
      ],
    }] }) });
    const fact = await lookupPer100g(name);
    assert.equal(fact.per100g.fibre, 10);
    const onDisk = JSON.parse(await readFile(path.join(dir, 'nutrition-cache', `${key}.json`), 'utf8'));
    assert.equal(onDisk.v, 2);
    // now a current entry: served with no fetch at all
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    assert.equal((await lookupPer100g(name)).per100g.fibre, 10);
  } finally { globalThis.fetch = realFetch; }
});

test('a line carries optional extras; an entry sums them only when every line has them', async () => {
  const { addEntry } = await import('../lib/foodLog.js');
  const day = await addEntry({ name: 'Porridge', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date: dayAgo(2), items: [
    { name: 'oats', grams: 50, macros: { p: 6, c: 34, f: 3, kcal: 190 }, fibreG: 5, sugarG: 0.5, sodiumMg: 4, fdcId: 7 },
    { name: 'milk', grams: 200, macros: { p: 7, c: 10, f: 4, kcal: 110 }, fibreG: 0, sodiumMg: 90 },
  ] });
  const e = day.entries.at(-1);
  assert.equal(e.items[0].fibreG, 5);
  assert.equal(e.items[0].fdcId, 7);
  assert.equal(e.items[1].fibreG, 0, 'a real zero stays a zero');
  assert.equal(e.items[1].sugarG, undefined, 'unknown stays unknown');
  assert.equal(e.fibreG, 5);
  assert.equal(e.sodiumMg, 94);
  assert.equal(e.sugarG, undefined, 'one line lacks sugar, so the entry does not pretend to know it');
});

test('junk extras are dropped; barcode must be 8 to 14 digits', async () => {
  const { sanitizeExtras } = await import('../lib/foodLog.js');
  assert.deepEqual(sanitizeExtras({ fibreG: -1, sugarG: 'x', sodiumMg: null, fdcId: 1.5, barcode: '123' }), {});
  assert.deepEqual(sanitizeExtras({ fibreG: '2.26', barcode: '9300633603105', fdcId: 99 }), { fibreG: 2.3, barcode: '9300633603105', fdcId: 99 });
});

test('his words and the meal ride on a same-day entry; the meal comes from the clock when not given', async () => {
  const { addEntry, mealForTime } = await import('../lib/foodLog.js');
  const day = await addEntry({ name: 'Toast', macros: { p: 5, c: 20, f: 2, kcal: 130 }, words: '  two  slices of toast ' });
  const e = day.entries.at(-1);
  assert.equal(e.words, 'two slices of toast');
  assert.equal(e.meal, mealForTime(e.time));
  const named = await addEntry({ name: 'Snack bar', macros: { p: 5, c: 20, f: 2, kcal: 130 }, meal: 'Dinner' });
  assert.equal(named.entries.at(-1).meal, 'dinner', 'what he said wins over the clock');
});

test('mealForTime buckets the day, and a retro entry gets no invented meal', async () => {
  const { mealForTime, addEntry } = await import('../lib/foodLog.js');
  assert.equal(mealForTime('07:15'), 'breakfast');
  assert.equal(mealForTime('12:30'), 'lunch');
  assert.equal(mealForTime('15:45'), 'snack');
  assert.equal(mealForTime('19:00'), 'dinner');
  assert.equal(mealForTime('23:30'), 'snack');
  assert.equal(mealForTime(undefined), null);
  const day = await addEntry({ name: 'Last night pasta', macros: { p: 20, c: 80, f: 15, kcal: 500 }, date: dayAgo(1) });
  assert.equal(day.entries.at(-1).meal, undefined);
  assert.equal(day.entries.at(-1).time, undefined);
});

test('an old entry with none of the new fields still reads, restores and removes a line correctly', async () => {
  const { removeEntryItem, restoreEntryItem, sanitizeRestoredEntry, getDay, addEntry } = await import('../lib/foodLog.js');
  const date = dayAgo(4);
  await mkdir(path.join(dir, 'food-log'), { recursive: true });
  await writeFile(path.join(dir, 'food-log', `${date}.json`), JSON.stringify({ date, entries: [
    { id: 'old1', name: 'Old plate', macros: { p: 10, c: 10, f: 10, kcal: 170 }, items: [
      { id: 'a1', name: 'x', macros: { p: 4, c: 4, f: 4, kcal: 68 } }, { id: 'a2', name: 'y', macros: { p: 6, c: 6, f: 6, kcal: 102 } },
    ] },
  ] }));
  const r = await removeEntryItem(date, 'old1', 'a1');
  assert.deepEqual(r.day.entries[0].macros, { p: 6, c: 6, f: 6, kcal: 102 });
  assert.equal(r.day.entries[0].fibreG, undefined);
  await restoreEntryItem(date, 'old1', r.removed, r.index);
  assert.equal((await getDay(date)).entries[0].macros.kcal, 170);
  const back = sanitizeRestoredEntry({ id: 'old1', name: 'Old plate', macros: { p: 1, c: 1, f: 1, kcal: 1 } }, 'old1');
  assert.equal(back.meal, undefined);
  await addEntry({ name: 'unused', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date });
});

test('removing a line recomputes the entry extras, and a hand edit of the totals drops them', async () => {
  const { addEntry, removeEntryItem, editEntryOn } = await import('../lib/foodLog.js');
  const date = dayAgo(5);
  const day = await addEntry({ name: 'Two', macros: { p: 0, c: 0, f: 0, kcal: 0 }, date, items: [
    { name: 'a', macros: { p: 1, c: 1, f: 1, kcal: 17 }, fibreG: 2 }, { name: 'b', macros: { p: 1, c: 1, f: 1, kcal: 17 }, fibreG: 3 },
  ] });
  const e = day.entries.at(-1);
  assert.equal(e.fibreG, 5);
  const r = await removeEntryItem(date, e.id, e.items[0].id);
  assert.equal(r.day.entries.find((x) => x.id === e.id).fibreG, 3);
  const edited = await editEntryOn(date, e.id, { macros: { kcal: 50 } });
  assert.equal(edited.entries.find((x) => x.id === e.id).fibreG, undefined);
});

test('a photo part from USDA arrives with extras and fdcId on its line', async () => {
  const { resolvePhotoParts } = await import('../lib/nutritionFacts.js');
  const r = await resolvePhotoParts([{ name: 'oats', grams: 100, macros: { p: 13, c: 66, f: 7, kcal: 380 } }], {
    lookupFn: async () => ({ source: 'USDA FoodData Central', matched: 'Oats', fdcId: 7, per100g: { p: 13, c: 68, f: 7, fibre: 10, sodium: 2 } }),
  });
  assert.equal(r.components[0].fibreG, 10);
  assert.equal(r.components[0].sodiumMg, 2);
  assert.equal(r.components[0].fdcId, 7);
});
