import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { editRecipeInRaw, editRecipe, parseRecipeCollection, RECIPES_REL_PATH } from '../lib/recipes.js';

const RAW = `# PART 1 — CORE DAILY MEALS

## 1. Big Breakfast

**Macros:** 38g P / 30g C / 20g F / 470 kcal
**Makes:** 1 serve

### Ingredients
- 2 eggs
- 1 hash brown
**Sauce:**
- 1 tbsp ketchup

### Method
1. Fry the eggs.
2. Bake the hash brown.

> Cheap and fast.

#### Alternative: Higher protein

**Macros:** 44g P / 17g C / 17g F / 410 kcal

##### Ingredients
- 2 eggs
- 100g egg whites

##### Method
1. Fry the eggs.

---

## 2. YoPro Yogurt

**Macros:** 20g P / 8g C / 0g F / 120 kcal

A tub of YoPro, eaten as is.

---
`;

async function vaultWith(raw) {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-edit-'));
  const full = path.join(dir, RECIPES_REL_PATH);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, raw, 'utf8');
  return { dir, full };
}

test('editing the method leaves ingredients, macros, notes and the variant alone', () => {
  const out = editRecipeInRaw(RAW, 'big-breakfast', { method: ['Fry the eggs.', 'Air-fry the hash brown.', 'Plate up.'] });
  const r = parseRecipeCollection(out).find((x) => x.id === 'big-breakfast');
  assert.deepEqual(r.method, ['Fry the eggs.', 'Air-fry the hash brown.', 'Plate up.']);
  assert.equal(r.ingredients.length, 4);
  assert.deepEqual(r.macros, { p: 38, c: 30, f: 20, kcal: 470 });
  assert.deepEqual(r.notes, ['Cheap and fast.']);
  assert.equal(r.alternates.length, 1);
  assert.deepEqual(r.alternates[0].macros, { p: 44, c: 17, f: 17, kcal: 410 });
  assert.deepEqual(r.alternates[0].method, ['Fry the eggs.']);
  // the next recipe must survive intact
  assert.ok(parseRecipeCollection(out).some((x) => x.id === 'yopro-yogurt'));
});

test('editing ingredients keeps group labels and can carry corrected macros', () => {
  const out = editRecipeInRaw(RAW, 'big-breakfast', {
    ingredients: ['2 eggs', '100g egg whites', '— Sauce —', '1 tbsp ketchup'],
    macros: { p: 48, c: 22, f: 18, kcal: 440 },
  });
  const r = parseRecipeCollection(out).find((x) => x.id === 'big-breakfast');
  assert.deepEqual(r.ingredients.map((i) => i.name), ['2 eggs', '100g egg whites', '— Sauce —', '1 tbsp ketchup']);
  assert.equal(r.ingredients[2].group, true);
  assert.deepEqual(r.macros, { p: 48, c: 22, f: 18, kcal: 440 });
  assert.deepEqual(r.method, ['Fry the eggs.', 'Bake the hash brown.']);
});

test('a variant can be edited without touching its parent', () => {
  const out = editRecipeInRaw(RAW, 'big-breakfast', { ingredients: ['3 eggs', '150g egg whites'] }, 'higher-protein');
  const r = parseRecipeCollection(out).find((x) => x.id === 'big-breakfast');
  assert.deepEqual(r.alternates[0].ingredients, ['3 eggs', '150g egg whites']);
  assert.deepEqual(r.ingredients.map((i) => i.name), ['2 eggs', '1 hash brown', '— Sauce —', '1 tbsp ketchup']);
  assert.deepEqual(r.alternates[0].method, ['Fry the eggs.']);
});

test('a prose-only entry grows real sections the first time it is edited', () => {
  const out = editRecipeInRaw(RAW, 'yopro-yogurt', { ingredients: ['1 tub YoPro'], method: ['Open it.'] });
  const r = parseRecipeCollection(out).find((x) => x.id === 'yopro-yogurt');
  assert.deepEqual(r.ingredients.map((i) => i.name), ['1 tub YoPro']);
  assert.deepEqual(r.method, ['Open it.']);
  assert.deepEqual(r.macros, { p: 20, c: 8, f: 0, kcal: 120 });
});

test('an empty or unknown edit is refused rather than half-applied', () => {
  assert.throws(() => editRecipeInRaw(RAW, 'big-breakfast', {}), /nothing to change/);
  assert.throws(() => editRecipeInRaw(RAW, 'big-breakfast', { method: [] }), /at least one method step/);
  assert.throws(() => editRecipeInRaw(RAW, 'nope', { method: ['x'] }), /recipe not found/);
  assert.throws(() => editRecipeInRaw(RAW, 'big-breakfast', { method: ['x'] }, 'no-such'), /no variant/);
});

test('editRecipe writes through to the vault file and backs it up first', async () => {
  const { dir, full } = await vaultWith(RAW);
  const updated = await editRecipe(dir, 'big-breakfast', { method: ['One step only.'] });
  assert.deepEqual(updated.method, ['One step only.']);
  const onDisk = parseRecipeCollection(await readFile(full, 'utf8')).find((r) => r.id === 'big-breakfast');
  assert.deepEqual(onDisk.method, ['One step only.']);
  assert.equal(onDisk.alternates.length, 1);
});
