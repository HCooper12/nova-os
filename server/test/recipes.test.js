import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecipeCollection,
  parseProfile,
  insertRecipeIntoRaw,
  insertAlternateIntoRaw,
} from '../lib/recipes.js';
import { RECIPE_FILE } from './fixtures.js';

test('parseRecipeCollection finds every recipe with its category and macros', () => {
  const recipes = parseRecipeCollection(RECIPE_FILE);
  assert.equal(recipes.length, 3);
  const [bowl, yogurt, brownie] = recipes;

  assert.equal(bowl.name, 'Chicken Burrito Bowl');
  assert.equal(bowl.category, 'CORE DAILY MEALS');
  assert.deepEqual(bowl.macros, { p: 42, c: 55, f: 18, kcal: 560 });
  assert.equal(bowl.makes, '4 servings');
  assert.equal(bowl.method.length, 2);
  assert.equal(bowl.notes.length, 1);
  // Ingredient group labels are kept as marked rows
  assert.ok(bowl.ingredients.some((i) => i.group));
  assert.ok(bowl.ingredients.some((i) => i.name.includes('600g chicken breast')));

  // Prose-only recipe falls back to a description instead of empty detail
  assert.equal(yogurt.name, 'YoPro Yogurt');
  assert.equal(yogurt.ingredients.length, 0);
  assert.match(yogurt.description, /straight from the fridge/);

  assert.equal(brownie.category, 'TREATS');
  assert.equal(brownie.alternates.length, 1);
  assert.equal(brownie.alternates[0].label, 'Choc-Orange Brownie');
  assert.deepEqual(brownie.alternates[0].macros, { p: 12, c: 28, f: 9, kcal: 240 });
  assert.equal(brownie.alternates[0].ingredients.length, 3);
  // The alternate's deeper-nested ingredients must not leak into the parent
  assert.equal(brownie.ingredients.length, 2);
});

test('parseRecipeCollection drops headings without macros', () => {
  const raw = RECIPE_FILE + '\n## 4. Not A Recipe\n\nSome stray section.\n';
  assert.equal(parseRecipeCollection(raw).length, 3);
});

test('parseProfile reads the profile line', () => {
  assert.deepEqual(parseProfile(RECIPE_FILE), {
    weightKg: 86,
    heightCm: 188,
    targetKcal: 2200,
    proteinFloorG: 150,
  });
  assert.equal(parseProfile('# Nothing here'), null);
});

test('insertRecipeIntoRaw roundtrips: parse count grows by exactly one', () => {
  const input = {
    name: 'Test Chili',
    category: 'CORE DAILY MEALS',
    makes: '5 servings',
    macros: { p: 38, c: 40, f: 12, kcal: 430 },
    ingredients: ['500g beef mince', '2 cans tomatoes'],
    method: ['Brown the mince.', 'Simmer 30 minutes.'],
  };
  const newRaw = insertRecipeIntoRaw(RECIPE_FILE, input);
  const recipes = parseRecipeCollection(newRaw);
  assert.equal(recipes.length, 4);
  const added = recipes.find((r) => r.name === 'Test Chili');
  assert.ok(added);
  assert.equal(added.category, 'CORE DAILY MEALS');
  assert.deepEqual(added.macros, { p: 38, c: 40, f: 12, kcal: 430 });
  // Quick-ref table row is inserted too
  assert.match(newRaw, /\| Test Chili \| 38g \| 40g \| 12g \| 430 \|/);
  // Inserted into PART 1, before PART 2
  assert.ok(newRaw.indexOf('## 4. Test Chili') < newRaw.indexOf('# PART 2'));
});

test('insertRecipeIntoRaw throws on an unknown category', () => {
  const input = {
    name: 'X',
    category: 'MYSTERY MEALS',
    macros: { p: 1, c: 1, f: 1, kcal: 10 },
    ingredients: ['x'],
    method: ['x'],
  };
  assert.throws(() => insertRecipeIntoRaw(RECIPE_FILE, input), /Could not find/);
});

test('insertAlternateIntoRaw adds an alternate under the right recipe', () => {
  const alt = {
    label: 'Salted Caramel Brownie',
    macros: { p: 12, c: 29, f: 9, kcal: 245 },
    ingredients: ['100g protein powder', '2 eggs', 'caramel essence'],
    method: ['Mix with essence.', 'Bake 20 minutes.'],
  };
  const newRaw = insertAlternateIntoRaw(RECIPE_FILE, 'Protein Brownie', alt);
  const brownie = parseRecipeCollection(newRaw).find((r) => r.name === 'Protein Brownie');
  assert.equal(brownie.alternates.length, 2);
  const added = brownie.alternates.find((a) => a.label === 'Salted Caramel Brownie');
  assert.ok(added);
  assert.deepEqual(added.macros, { p: 12, c: 29, f: 9, kcal: 245 });
  // Other recipes untouched
  assert.equal(parseRecipeCollection(newRaw).length, 3);
});

test('insertAlternateIntoRaw throws for a recipe that does not exist', () => {
  const alt = { label: 'X', macros: { p: 1, c: 1, f: 1, kcal: 10 }, ingredients: [], method: [] };
  assert.throws(() => insertAlternateIntoRaw(RECIPE_FILE, 'Ghost Recipe', alt), /Could not find/);
});
