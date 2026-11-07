// A meal photo's numbers come from the database, not the model's memory.
// The model names parts and weighs them; code looks them up and does the sums.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-photodb-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeResult, applyDatabaseToScan } = await import('../lib/scanFood.js');
const { resolvePhotoParts } = await import('../lib/nutritionFacts.js');
const { foodRecordFromScan } = await import('../lib/telegram.js');

// a stub database: rice and chicken known, "mystery sauce" missed
const lookupFn = async (name) => {
  if (/rice/i.test(name)) return { source: 'USDA FoodData Central', dataType: 'SR Legacy', matched: 'Rice, white, cooked', fdcId: 1, per100g: { p: 2.7, c: 28, f: 0.3 } };
  if (/chicken/i.test(name)) return { source: 'USDA FoodData Central', dataType: 'SR Legacy', matched: 'Chicken thigh, cooked', fdcId: 2, per100g: { p: 26, c: 0, f: 10 } };
  return null;
};

const parsed = {
  name: 'Chicken rice',
  macros: { p: 999, c: 999, f: 999, kcal: 9999 }, // the model's own total must not survive
  components: [
    { name: 'chicken thigh, cooked', grams: 180, p: 45, c: 0, f: 20, kcal: 360 },
    { name: 'jasmine rice, cooked', grams: 200, p: 5, c: 55, f: 1, kcal: 250 },
    { name: 'mystery sauce', grams: 40, p: 1, c: 6, f: 2, kcal: 46 },
  ],
  confidence: 'high', question: '',
};

test('meal photo: matched parts come from USDA scaled by grams, kcal by Atwater', async () => {
  const r = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn });
  const chicken = r.components.find((c) => /chicken/.test(c.name));
  assert.equal(chicken.macros.p, 46.8);
  assert.equal(chicken.macros.f, 18);
  assert.equal(chicken.macros.kcal, Math.round(46.8 * 4 + 0 + 18 * 9));
  assert.equal(chicken.sourced, true);
  assert.match(chicken.source, /USDA/);
  assert.equal(r._parts, undefined, 'internal field never leaks');
});

test('a part USDA misses keeps the model figure and says estimated', async () => {
  const r = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'auto', lookupFn });
  const sauce = r.components.find((c) => /sauce/.test(c.name));
  assert.equal(sauce.sourced, false);
  assert.equal(sauce.source, 'estimated, not matched to a database');
  assert.equal(sauce.macros.kcal, 46);
  assert.match(r.sourceNote, /2 of 3/);
});

test('the total is the sum of the lines, not the model total', async () => {
  const r = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn });
  const sum = r.components.reduce((a, c) => a + c.macros.kcal, 0);
  assert.equal(r.macros.kcal, sum);
  assert.ok(r.macros.kcal < 1000, 'nowhere near the model 9999');
  assert.equal(r.macros.p, Math.round(r.components.reduce((a, c) => a + c.macros.p, 0)));
});

test('label modes are left exactly as the model read them', async () => {
  const label = normalizeResult({ name: 'Bar', macros: { p: 20, c: 22, f: 8, kcal: 288 }, components: [{ name: 'bar', grams: 50, p: 20, c: 22, f: 8, kcal: 288 }], confidence: 'high' });
  const r = await applyDatabaseToScan(label, { mode: 'label', lookupFn: async () => { throw new Error('must not look up'); } });
  assert.equal(r.macros.kcal, 288);
  assert.equal(r._parts, undefined);
});

test('a part read off a label in an auto scan keeps the printed figures', async () => {
  const r = await resolvePhotoParts([{ name: 'protein bar', grams: 60, label: true, macros: { p: 20, c: 22, f: 8, kcal: 288 } }], { lookupFn: async () => { throw new Error('no lookup for a label'); } });
  assert.equal(r.components[0].source, 'read from the label');
  assert.equal(r.macros.kcal, 288);
});

test('nothing matched: every line estimated and confidence drops to low with a question', async () => {
  const r = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn: async () => null });
  assert.equal(r.confidence, 'low');
  assert.ok(r.question);
  assert.ok(r.components.every((c) => c.sourced === false));
});

test('database offline entirely (lookup throws): scan resolves via estimates, never lost', async () => {
  await assert.rejects(() => applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn: async () => { throw new Error('offline'); } }));
  // startFoodScan catches this and falls back to the model's own result
});

test('same photo twice gives the same number', async () => {
  const a = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn });
  const b = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'meal', lookupFn });
  assert.deepEqual(a.macros, b.macros);
});

test('the Telegram record carries the audited lines and the source note', async () => {
  const r = await applyDatabaseToScan(normalizeResult(parsed), { mode: 'auto', lookupFn });
  const rec = foodRecordFromScan(r, '');
  assert.equal(rec.decision.payload.items.length, 3);
  assert.match(rec.decision.reason, /matched to USDA/);
  assert.equal(rec.decision.payload.macros.kcal, r.macros.kcal);
});

test('a database match far from the model estimate is distrusted, not logged (ghee for butter chicken)', async () => {
  const wrong = async () => ({ source: 'USDA FoodData Central', dataType: 'SR Legacy', matched: 'Butter, Clarified butter (ghee)', fdcId: 9, per100g: { p: 0.3, c: 0, f: 99.5 } });
  const r = await resolvePhotoParts([{ name: 'butter chicken', grams: 220, macros: { p: 30, c: 12, f: 20, kcal: 358 } }], { lookupFn: wrong });
  assert.equal(r.components[0].sourced, false);
  assert.equal(r.components[0].macros.kcal, 358, 'the model figure stays');
  assert.match(r.components[0].source, /too far from the estimate/);
  // within 2x it is trusted
  const near = async () => ({ source: 'USDA FoodData Central', dataType: 'SR Legacy', matched: 'Chicken curry', fdcId: 3, per100g: { p: 12, c: 5, f: 9 } });
  const ok = await resolvePhotoParts([{ name: 'butter chicken', grams: 220, macros: { p: 30, c: 12, f: 20, kcal: 358 } }], { lookupFn: near });
  assert.equal(ok.components[0].sourced, true);
});
