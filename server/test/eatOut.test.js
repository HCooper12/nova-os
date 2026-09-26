// PICK IT UP — the catalogue store + pure search. Temp data dir BEFORE imports.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-eatout-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateRow, normaliseName, buildBrandRecord, saveBrand, loadCatalogue, catalogueSummary, whatFits, KNOWN_MISSING } = await import('../lib/eatOut.js');

/* ------------------------------ validateRow -------------------------------- */

test('validateRow: passes a real My Muscle Chef-style row', () => {
  const r = validateRow({ name: 'High Protein Beef Lasagne', grams: 400, kj: 2100, kcal: 502, p: 45, c: 40, f: 15 });
  assert.equal(r.ok, true);
  assert.equal(r.item.name, 'High Protein Beef Lasagne');
  assert.equal(r.item.macros.kcal, 502);
  assert.equal(r.item.macros.p, 45);
});

test('validateRow: rejects the real garbage row (per-100g/per-serve mix-up)', () => {
  const r = validateRow({ name: 'Spaghetti Bolognese', grams: 330, kj: 6810, kcal: 461, p: 122, c: 165, f: 49.5 });
  assert.equal(r.ok, false);
  assert.ok(r.reason, 'must name a reason');
});

test('validateRow: empty name rejected', () => {
  const r = validateRow({ name: '  ', p: 10, c: 10, f: 10, kcal: 200 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /name/);
});

test('validateRow: negative protein rejected', () => {
  const r = validateRow({ name: 'X', p: -1, c: 10, f: 10, kcal: 200 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /protein/);
});

test('validateRow: negative carbs rejected', () => {
  const r = validateRow({ name: 'X', p: 10, c: -1, f: 10, kcal: 200 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /carbs/);
});

test('validateRow: negative fat rejected', () => {
  const r = validateRow({ name: 'X', p: 10, c: 10, f: -1, kcal: 200 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /fat/);
});

test('validateRow: kcal missing and no kJ to derive from is rejected', () => {
  const r = validateRow({ name: 'X', p: 10, c: 10, f: 10 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /kcal/);
});

test('validateRow: zero/negative kcal rejected', () => {
  const r = validateRow({ name: 'X', p: 10, c: 10, f: 10, kcal: 0 });
  assert.equal(r.ok, false);
});

test('validateRow: kcal derived from kJ when kcal absent', () => {
  const r = validateRow({ name: 'X', p: 20, c: 20, f: 5, kj: 837 }); // 837/4.184 = 200
  assert.equal(r.ok, true);
  assert.equal(r.item.macros.kcal, 200);
});

test('validateRow: kcal > 3000 rejected (family bucket)', () => {
  const r = validateRow({ name: 'Family Bucket', p: 100, c: 100, f: 300, kcal: 3500 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /3000/);
});

test('validateRow: Atwater check rejects a mismatched row beyond 20% tolerance', () => {
  // 4*5 + 4*5 + 9*5 = 85, kcal claimed 500 -> way off
  const r = validateRow({ name: 'X', p: 5, c: 5, f: 5, kcal: 500 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Atwater|disagree/i);
});

test('validateRow: Atwater check allows fibre/alcohol/rounding within 20%', () => {
  // 4*30+4*30+9*10 = 330, kcal 380 -> diff ~13% within tolerance
  const r = validateRow({ name: 'X', p: 30, c: 30, f: 10, kcal: 380 });
  assert.equal(r.ok, true);
});

test('validateRow: kJ vs kcal disagreement beyond 6% rejected when both given', () => {
  // kcal 200 matches macros closely but kJ implies ~300kcal (7% off is more, use larger)
  const r = validateRow({ name: 'X', p: 20, c: 20, f: 5, kcal: 200, kj: 1400 }); // 1400/4.184=334.6, diff 67%
  assert.equal(r.ok, false);
});

test('validateRow: kJ vs kcal within 6% passes', () => {
  const kcal = 200;
  const kj = kcal * 4.184 * 1.02; // 2% off
  const r = validateRow({ name: 'X', p: 20, c: 20, f: 5, kcal, kj });
  assert.equal(r.ok, true);
});

test('validateRow: grams present and macros exceed grams rejected', () => {
  // atwater 4*20+4*20+9*20=340 vs kcal 360, diff ~5.5% ok; but p+c+f=60 > grams(50)
  const r = validateRow({ name: 'Y', grams: 50, p: 20, c: 20, f: 20, kcal: 360 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /grams/);
});

test('validateRow: kcal exceeds 9 per gram of serve weight rejected', () => {
  // grams=20, all fat: atwater = 9*20 = 180; p+c+f=20<=20 (grams rule passes);
  // kcal=200 is within 20% of atwater (10% off) but exceeds 9*grams=180
  const r = validateRow({ name: 'X', grams: 20, p: 0, c: 0, f: 20, kcal: 200 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /9 kcal per gram/);
});

/* ------------------------------ normaliseName ------------------------------ */

test('normaliseName lowercases, strips punctuation, collapses spaces', () => {
  assert.equal(normaliseName('  Spaghetti, Bolognese!!  '), 'spaghetti bolognese');
});

/* ------------------------------ buildBrandRecord ---------------------------- */

test('buildBrandRecord dedupes by normalised name and counts rejections', () => {
  const rawRows = [
    { name: 'Chicken Bowl', p: 40, c: 50, f: 10, kcal: 450 },
    { name: 'chicken   bowl', p: 41, c: 50, f: 10, kcal: 452 }, // dupe, kept first
    { name: 'Bad Row', p: 200, c: 0, f: 0, kcal: 100 }, // atwater way off -> rejected
  ];
  const record = buildBrandRecord({ key: 'test-brand', name: 'Test Brand', kind: 'fast-food', source: { kind: 'off', url: null }, fetchedAt: '2026-01-01T00:00:00.000Z', rawRows });
  assert.equal(record.items.length, 1);
  assert.equal(record.items[0].macros.p, 40);
  assert.equal(record.rejected, 1);
  assert.ok(record.items[0].id.startsWith('test-brand:'));
});

/* --------------------------------- store ------------------------------------ */

test('loadCatalogue returns empty shape when no file exists yet', async () => {
  const cat = await loadCatalogue();
  assert.equal(cat.updatedAt, null);
  assert.deepEqual(cat.brands, {});
});

test('saveBrand persists atomically and catalogueSummary reflects it', async () => {
  const record = buildBrandRecord({
    key: 'brand-a', name: 'Brand A', kind: 'supermarket', source: { kind: 'off', url: null },
    fetchedAt: '2026-01-01T00:00:00.000Z',
    rawRows: [{ name: 'Meal One', p: 30, c: 40, f: 10, kcal: 380 }],
  });
  await saveBrand('brand-a', record);
  const cat = await loadCatalogue();
  assert.equal(cat.brands['brand-a'].items.length, 1);
  const summary = catalogueSummary(cat);
  assert.equal(summary.total, 1);
  assert.equal(summary.brands.length, 1);
  assert.equal(summary.brands[0].key, 'brand-a');
  assert.deepEqual(summary.missing, KNOWN_MISSING);
});

/* --------------------------------- whatFits --------------------------------- */

function catalogueWith(items) {
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    brands: {
      'brand-a': { key: 'brand-a', name: 'Brand A', kind: 'fast-food', source: { kind: 'off', url: null }, fetchedAt: '2026-01-01T00:00:00.000Z', items, rejected: 0 },
    },
  };
}

function item(name, p, c, f, kcal, overrides = {}) {
  return { id: `brand-a:${name}`, brandKey: 'brand-a', brand: 'Brand A', kind: 'fast-food', name, serve: '1 serve', grams: null, macros: { p, c, f, kcal }, ...overrides };
}

test('whatFits: empty catalogue returns catalogueEmpty true with no throw', () => {
  const result = whatFits({ updatedAt: null, brands: {} }, { kcal: 600 });
  assert.equal(result.catalogueEmpty, true);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.pairs, []);
});

test('whatFits: blank fields are ignored', () => {
  const cat = catalogueWith([item('A', 10, 10, 10, 200), item('B', 50, 50, 50, 900)]);
  const result = whatFits(cat, {});
  assert.equal(result.count, 2); // no filters -> everything fits
});

test('whatFits: protein floor is 0.8x target, not a hard minimum', () => {
  const cat = catalogueWith([item('CloseEnough', 44, 30, 10, 400), item('TooLow', 20, 30, 10, 400)]);
  const result = whatFits(cat, { p: 50 });
  const names = result.items.map((i) => i.name);
  assert.ok(names.includes('CloseEnough'), '44g against 50g target should pass the 0.8x floor');
  assert.ok(!names.includes('TooLow'), '20g against 50g target should fail the 0.8x floor');
});

test('whatFits: a protein hit beats a near-miss', () => {
  const cat = catalogueWith([item('Hit', 51, 30, 10, 500), item('NearMiss', 45, 30, 10, 500)]);
  const result = whatFits(cat, { p: 50, kcal: 700 });
  assert.equal(result.items[0].name, 'Hit');
});

test('whatFits: nearer protein beats farther protein among hits', () => {
  const cat = catalogueWith([item('Nearer', 51, 30, 10, 500), item('Farther', 70, 30, 10, 500)]);
  const result = whatFits(cat, { p: 50, kcal: 700 });
  assert.equal(result.items[0].name, 'Nearer');
});

test('whatFits: bigger meal beats a snack on ties (uses the budget well)', () => {
  const cat = catalogueWith([item('BigMeal', 50, 40, 15, 600), item('Snack', 50, 10, 5, 200)]);
  const result = whatFits(cat, { p: 50, kcal: 700 });
  assert.equal(result.items[0].name, 'BigMeal');
});

test('whatFits: kcal/c/f budgets exclude items over them', () => {
  const cat = catalogueWith([item('UnderKcal', 30, 30, 10, 400), item('OverKcal', 30, 30, 10, 900)]);
  const result = whatFits(cat, { kcal: 500 });
  const names = result.items.map((i) => i.name);
  assert.ok(names.includes('UnderKcal'));
  assert.ok(!names.includes('OverKcal'));
});

test('whatFits: brand filter limits which brands are searched', () => {
  const cat = {
    updatedAt: null,
    brands: {
      'brand-a': { key: 'brand-a', name: 'Brand A', kind: 'fast-food', items: [item('A1', 30, 30, 10, 400)], rejected: 0 },
      'brand-b': { key: 'brand-b', name: 'Brand B', kind: 'supermarket', items: [{ ...item('B1', 30, 30, 10, 400), brandKey: 'brand-b' }], rejected: 0 },
    },
  };
  const result = whatFits(cat, { kcal: 600, brands: ['brand-a'] });
  assert.equal(result.brandsSearched, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].brandKey, 'brand-a');
});

test('whatFits: kind filter limits which brands are searched', () => {
  const cat = {
    updatedAt: null,
    brands: {
      'brand-a': { key: 'brand-a', name: 'Brand A', kind: 'fast-food', items: [item('A1', 30, 30, 10, 400)], rejected: 0 },
      'brand-b': { key: 'brand-b', name: 'Brand B', kind: 'supermarket', items: [{ ...item('B1', 30, 30, 10, 400), brandKey: 'brand-b' }], rejected: 0 },
    },
  };
  const result = whatFits(cat, { kcal: 600, kind: 'supermarket' });
  assert.equal(result.brandsSearched, 1);
  assert.equal(result.items[0].brandKey, 'brand-b');
});

test('whatFits pairs: same brand only, never the same item twice', () => {
  const cat = catalogueWith([item('P1', 30, 20, 10, 300), item('P2', 30, 20, 10, 300)]);
  const result = whatFits(cat, { p: 50, kcal: 700, mode: 'pairs' });
  assert.ok(result.pairs.length > 0);
  for (const pair of result.pairs) {
    assert.equal(pair.items.length, 2);
    assert.notEqual(pair.items[0].id, pair.items[1].id);
    assert.equal(pair.items[0].brandKey, pair.items[1].brandKey);
  }
  assert.deepEqual(result.items, []);
});

test('whatFits pairs: macros are summed and fit the same rules', () => {
  const cat = catalogueWith([item('P1', 30, 20, 10, 300), item('P2', 30, 20, 10, 300)]);
  const result = whatFits(cat, { kcal: 700, mode: 'pairs' });
  assert.ok(result.pairs.length > 0);
  assert.equal(result.pairs[0].macros.kcal, 600);
  assert.equal(result.pairs[0].macros.p, 60);
});
