// HIS PRODUCTS IN HIS RECIPES (1 Nov 2026, mockup 109): code does every sum,
// his product is the truth for its line, a line it cannot work out leaves the
// recipe as it was, and Undo puts the numbers back. No model, no network.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-products-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
mkdirSync(process.env.NOVA_DATA_DIR, { recursive: true });

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const P = await import('../lib/products.js');

const muffin = () => ({
  id: 'almighty-muffin', name: 'Almighty Muffin', servings: 6, macros: { p: 42, c: 33, f: 14, kcal: 421 },
  ingredients: [{ qty: '', name: '400g extra lean beef mince' }, { qty: '', name: '3 eggs' }],
});
let written = [];
function stub(recipe = muffin()) {
  written = [];
  P._setProductDepsForTest({
    breakdown: async () => ({ lines: [{ n: 1, grams: 999, food: 'beef', per100: { p: 20, c: 0, f: 10, kcal: 170 } }, { n: 2, grams: 150, food: 'egg', per100: { p: 13, c: 1, f: 10, kcal: 143 } }] }),
    lookup: async () => null,
    recipes: { loadRecipeData: async () => ({ recipes: [recipe] }), editRecipe: async (v, id, e) => { written.push(e.macros); recipe.macros = e.macros; } },
  });
}

test('grams on the line win over the model; counts take the model grams', () => {
  assert.equal(P.gramsOnLine('400g extra lean beef mince'), 400);
  assert.equal(P.gramsOnLine('1.5 kg chicken'), 1500);
  assert.equal(P.gramsOnLine('300ml egg whites'), 300);
  assert.equal(P.gramsOnLine('3 eggs'), null);
});

test('a product needs all four per-100 g values, and they must be sane', async () => {
  await assert.rejects(P.saveProduct({ name: 'x', per100: { p: 20, c: 0, f: 5 } }), /all needed/);
  await assert.rejects(P.saveProduct({ name: 'x', per100: { p: 120, c: 0, f: 5, kcal: 100 } }), /all needed/);
  const p = await P.saveProduct({ name: 'Coles Extra Lean Beef Mince 5 Star', per100: { p: 22, c: 0, f: 5, kcal: 133 }, source: 'label' });
  assert.equal(p.source, 'label');
  assert.deepEqual(P.matchProducts(await P.listProducts(), '400g extra lean beef mince').map((x) => x.id), [p.id]);
  assert.deepEqual(P.matchProducts(await P.listProducts(), '3 eggs'), []);
});

test('linking his product recomputes the recipe by code, writes it, and Undo puts it back', async () => {
  const recipe = muffin();
  stub(recipe);
  const mince = (await P.listProducts())[0];
  const out = await P.linkProduct('/vault', recipe.id, '400g extra lean beef mince', mince.id);
  // (400 g × 22 + 150 g × 13) / 6 = 17.9 → 18 g protein; (400×133/100 + 150×143/100)/6 = 124.4 → 124 kcal
  assert.deepEqual(out.macros, { p: 18, c: 0, f: 6, kcal: 124 });
  assert.deepEqual(out.was, { p: 42, c: 33, f: 14, kcal: 421 });
  assert.equal(out.linked, 1);
  assert.equal(out.total, 2);
  assert.deepEqual(written.at(-1), out.macros);
  const said = await P.undoLink('/vault', out.undo);
  assert.match(said, /42 g protein, 421 kcal/);
  assert.deepEqual(written.at(-1), { p: 42, c: 33, f: 14, kcal: 421 });
  assert.deepEqual(await P.lineState(recipe), {});
});

test('500 g instead of 400 g changes the numbers: the grams on the line are read every time', async () => {
  const recipe = muffin();
  stub(recipe);
  const mince = (await P.listProducts())[0];
  const a = await P.linkProduct('/vault', recipe.id, '400g extra lean beef mince', mince.id);
  recipe.ingredients[0].name = '500g extra lean beef mince';
  const b = await P.linkProduct('/vault', recipe.id, '500g extra lean beef mince', mince.id);
  assert.ok(b.macros.p > a.macros.p && b.macros.kcal > a.macros.kcal);
});

test('a line it cannot work out leaves the recipe exactly as it was', async () => {
  const recipe = { ...muffin(), id: 'pancakes', ingredients: [{ qty: '', name: '200g oats' }, { qty: '', name: 'a pinch of something' }] };
  written = [];
  P._setProductDepsForTest({
    breakdown: async () => ({ lines: [{ n: 1, grams: 200, food: 'oats', per100: { p: 13, c: 60, f: 7, kcal: 380 } }, { n: 2 }] }),
    lookup: async () => null,
    recipes: { loadRecipeData: async () => ({ recipes: [recipe] }), editRecipe: async (v, id, e) => { written.push(e.macros); } },
  });
  const oats = await P.saveProduct({ name: 'Uncle Tobys Oats', per100: { p: 12, c: 58, f: 8, kcal: 370 } });
  await assert.rejects(P.linkProduct('/vault', 'pancakes', '200g oats', oats.id), (e) => e.code === 'unresolved');
  assert.deepEqual(written, []);
});
