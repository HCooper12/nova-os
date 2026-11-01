// HIS PRODUCTS IN HIS RECIPES (1 Nov 2026, mockup 109): code does every sum,
// his product is the truth for its line, a line it cannot work out leaves the
// recipe as it was, and Undo puts the numbers back. No model, no network.
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
  rmSync(path.join(process.env.NOVA_DATA_DIR, 'recipe-lines'), { recursive: true, force: true });
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

test('nothing linked, the recipe computes to exactly its own numbers (the estimates are scaled to it)', async () => {
  const recipe = muffin();
  stub(recipe);
  const store = await P.ensureLines(recipe);
  assert.deepEqual(P.computeRecipe(recipe, store, []).perServing, { p: 42, c: 33, f: 14, kcal: 421 });
});

test('linking his product changes only its own share, writes it, and Undo puts it back', async () => {
  const recipe = muffin();
  stub(recipe);
  await P.ensureLines(recipe);
  const mince = (await P.listProducts())[0];
  const out = await P.linkProduct('/vault', recipe.id, '400g extra lean beef mince', mince.id);
  // the eggs' share is untouched: (estimate × calibration) as before; the mince is his label, exactly
  const store = await P.readLines(recipe.id);
  const k = store.calibration;
  const eggsP = 150 * 0.13 * k.p;
  assert.equal(out.macros.p, Math.round((400 * 0.22 + eggsP) / 6));
  assert.deepEqual(out.was, { p: 42, c: 33, f: 14, kcal: 421 });
  assert.equal(out.linked, 1);
  assert.deepEqual(written.at(-1), out.macros);
  const said = await P.undoLink('/vault', out.undo);
  assert.match(said, /42 g protein, 421 kcal/);
  assert.deepEqual(written.at(-1), { p: 42, c: 33, f: 14, kcal: 421 });
  assert.deepEqual(await P.lineState(recipe), {});
});

test('500 g instead of 400 g: his product stays linked and the numbers go up', async () => {
  const recipe = muffin();
  stub(recipe);
  const mince = (await P.listProducts())[0];
  const a = await P.linkProduct('/vault', recipe.id, '400g extra lean beef mince', mince.id);
  recipe.ingredients[0].name = '500g extra lean beef mince';
  const store = await P.ensureLines(recipe);
  const b = P.computeRecipe(recipe, store, await P.listProducts());
  assert.equal(b.linked, 1, 'the link follows the ingredient, not the amount');
  assert.ok(b.perServing.p > a.macros.p && b.perServing.kcal > a.macros.kcal);
  // a count line moves with its count: 3 eggs → 4 eggs is a third more egg
  recipe.ingredients[1].name = '4 eggs';
  const c = P.computeRecipe(recipe, await P.ensureLines(recipe), await P.listProducts());
  assert.ok(c.perServing.p > b.perServing.p);
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

test('a tweak to 500 g is computed by code from the lines, never a guess', async () => {
  const recipe = muffin();
  stub(recipe);
  const store = await P.ensureLines(recipe);
  const before = P.computeRecipe(recipe, store, []).perServing;
  const proposed = { ...recipe, ingredients: [{ qty: '', name: '500g extra lean beef mince' }, { qty: '', name: '3 eggs' }] };
  const after = P.computeRecipe(proposed, await P.ensureLines(proposed), []).perServing;
  assert.ok(after.p > before.p && after.kcal > before.kcal);
  assert.match(readFileSync(new URL('../lib/tweakRecipe.js', import.meta.url), 'utf8'), /computedMacros\(recipe, job\.result\.ingredients\)/);
});
