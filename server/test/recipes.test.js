import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecipeCollection,
  parseProfile,
  insertRecipeIntoRaw,
  insertAlternateIntoRaw,
  removeRecipeFromRaw,
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

test('insertRecipeIntoRaw supports a macro-only quick recipe (promoted from a scan)', () => {
  const input = {
    name: 'Protein Pretzels',
    category: 'TREATS',
    macros: { p: 10, c: 20, f: 2, kcal: 145 },
    ingredients: [],
    method: [],
    description: 'Saved from the food tracker.',
  };
  const newRaw = insertRecipeIntoRaw(RECIPE_FILE, input);
  const recipes = parseRecipeCollection(newRaw);
  assert.equal(recipes.length, 4, 'still parses as one more recipe');
  const added = recipes.find((r) => r.name === 'Protein Pretzels');
  assert.ok(added, 'the macro-only recipe is found');
  assert.deepEqual(added.macros, { p: 10, c: 20, f: 2, kcal: 145 });
  assert.deepEqual(added.ingredients, [], 'no ingredients, honestly');
  assert.deepEqual(added.method, [], 'no method steps');
  // no empty "### Ingredients"/"### Method" headings were emitted for it
  assert.ok(!/## \d+\. Protein Pretzels[\s\S]*?### Ingredients/.test(newRaw));
});

test('removeRecipeFromRaw removes a recipe block + its quick-ref row (undo path)', () => {
  // add a macro-only recipe, then remove it — back to the original set exactly
  const input = { name: 'Temp Snack', category: 'TREATS', macros: { p: 5, c: 10, f: 3, kcal: 90 }, ingredients: [], method: [], description: 'x' };
  const withIt = insertRecipeIntoRaw(RECIPE_FILE, input);
  assert.equal(parseRecipeCollection(withIt).length, 4);
  const without = removeRecipeFromRaw(withIt, 'temp-snack'); // slug of "Temp Snack"
  assert.equal(parseRecipeCollection(without).length, 3, 'back to the original count');
  assert.ok(!without.includes('Temp Snack'), 'the block is gone');
  assert.ok(!/\|\s*Temp Snack\s*\|/.test(without), 'the quick-ref row is gone too');
});

test('removeRecipeFromRaw leaves other recipes intact and throws when not found', () => {
  const first = parseRecipeCollection(RECIPE_FILE)[0];
  const without = removeRecipeFromRaw(RECIPE_FILE, first.id);
  const left = parseRecipeCollection(without);
  assert.equal(left.length, 2);
  assert.ok(!left.some((r) => r.id === first.id), 'the target is gone');
  assert.throws(() => removeRecipeFromRaw(RECIPE_FILE, 'no-such-recipe'), /not found/);
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

test('quick-ref table follows a macro edit and a promotion — it can no longer drift', async () => {
  const { updateQuickRefRow } = await import('../lib/recipes.js');
  const raw = [
    '### Core Daily Meals',
    '',
    '| Recipe | Protein | Carbs | Fat | kcal |',
    '|---|---|---|---|---|',
    '| Works Burger | 54g | 66g | 27.5g | 725 |',
    '| Other Meal | 30g | 40g | 10g | 380 |',
    '',
  ].join('\n');
  const out = updateQuickRefRow(raw, 'Works Burger', { p: 52, c: 42, f: 17.5, kcal: 540 });
  assert.match(out, /\| Works Burger \| 52g \| 42g \| 17\.5g \| 540 \|/);
  assert.match(out, /\| Other Meal \| 30g \| 40g \| 10g \| 380 \|/, 'other rows untouched');
  // a recipe with no row is a no-op, never an error
  assert.equal(updateQuickRefRow(raw, 'Ghost Meal', { p: 1, c: 1, f: 1, kcal: 1 }), raw);
});

// ---------------------------------------------------------------------------
// VERSION NAMES SURVIVE PROMOTION.
// He renamed a variant, made it the one he was using, and the name vanished:
// the version he promoted came back as the recipe's plain name and the one he
// demoted was stamped "Original" regardless of what he had called it. Cause:
// the MAIN recipe had no label slot at all, so promotion had nowhere to put
// the promoted version's name and hard-coded "Original" for the demoted one.
// ---------------------------------------------------------------------------

const { promoteAlternateInRaw, renameCurrentVersionInRaw, upsertVersionLine } = await import('../lib/recipes.js');

const withAlt = (label, macros = '30g P / 10g C / 5g F / 210 kcal') => `# PART 1 — CORE DAILY MEALS

## 1. Chicken Burrito Bowl

**Macros:** 42g P / 55g C / 18g F / 560 kcal

### Ingredients
- 200g chicken
- 100g rice

### Method
1. Cook the chicken.
2. Serve.

#### Alternative: ${label}

**Macros:** ${macros}

##### Ingredients
- 250g chicken
- 80g rice

##### Method
1. Cook it hotter.
`;

test('promote: the promoted version keeps the name he gave it', () => {
  const out = promoteAlternateInRaw(withAlt('Higher Protein'), 'Chicken Burrito Bowl', 'higher-protein');
  const recipe = parseRecipeCollection(out)[0];
  assert.equal(recipe.versionLabel, 'Higher Protein', 'the version in use is named, not anonymous');
  assert.deepEqual(recipe.macros, { p: 30, c: 10, f: 5, kcal: 210 }, 'and it really is the promoted content');
  assert.ok(recipe.ingredients.some((i) => i.name.includes('250g chicken')));
});

test('promote: the demoted version keeps ITS name instead of becoming "Original"', () => {
  // first promotion: the main was never named, so "Original" is honest
  const once = promoteAlternateInRaw(withAlt('Higher Protein'), 'Chicken Burrito Bowl', 'higher-protein');
  assert.equal(parseRecipeCollection(once)[0].alternates[0].label, 'Original');

  // now promote back — the demoted version is "Higher Protein", NOT "Original"
  const twice = promoteAlternateInRaw(once, 'Chicken Burrito Bowl', 'original');
  const recipe = parseRecipeCollection(twice)[0];
  assert.equal(recipe.versionLabel, 'Original', 'the one now in use is the one he promoted');
  assert.deepEqual(recipe.alternates.map((a) => a.label), ['Higher Protein'],
    'the demoted version kept its own name — this is the bug he reported');
});

test('promote: round-tripping twice returns the original content, names intact', () => {
  const start = withAlt('Higher Protein');
  const there = promoteAlternateInRaw(start, 'Chicken Burrito Bowl', 'higher-protein');
  const back = promoteAlternateInRaw(there, 'Chicken Burrito Bowl', 'original');
  const recipe = parseRecipeCollection(back)[0];
  assert.deepEqual(recipe.macros, { p: 42, c: 55, f: 18, kcal: 560 }, 'the numbers came home');
  assert.ok(recipe.ingredients.some((i) => i.name.includes('200g chicken')));
  assert.equal(recipe.alternates.length, 1, 'no variant was duplicated or lost');
});

test('promote: a demoted name that collides with an existing variant is disambiguated', () => {
  // main is named "Higher Protein" and a DIFFERENT variant is also called that
  let raw = withAlt('Higher Protein');
  raw = promoteAlternateInRaw(raw, 'Chicken Burrito Bowl', 'higher-protein'); // main := Higher Protein
  raw = insertAlternateIntoRaw(raw, 'Chicken Burrito Bowl', {
    label: 'Higher Protein', macros: { p: 1, c: 1, f: 1, kcal: 10 }, ingredients: ['x'], method: ['y'],
  });
  const out = promoteAlternateInRaw(raw, 'Chicken Burrito Bowl', 'original');
  const labels = parseRecipeCollection(out)[0].alternates.map((a) => a.label);
  assert.equal(new Set(labels).size, labels.length, 'no two variants may share a name');
  assert.ok(labels.some((l) => /^Higher Protein \(\d{4}-\d{2}-\d{2}\)$/.test(l)), 'the clash is dated, not overwritten');
});

test('rename the CURRENT version — the thing he could not do at all', () => {
  const out = renameCurrentVersionInRaw(withAlt('Higher Protein'), 'Chicken Burrito Bowl', 'My Weekday Bowl');
  const recipe = parseRecipeCollection(out)[0];
  assert.equal(recipe.versionLabel, 'My Weekday Bowl');
  // renaming touches the NAME and nothing else
  assert.deepEqual(recipe.macros, { p: 42, c: 55, f: 18, kcal: 560 });
  assert.equal(recipe.ingredients.length, 2);
  assert.equal(recipe.method.length, 2);
  assert.deepEqual(recipe.alternates.map((a) => a.label), ['Higher Protein'], 'variants untouched');
});

test('rename the current version twice — it replaces, never stacks', () => {
  let raw = renameCurrentVersionInRaw(withAlt('Higher Protein'), 'Chicken Burrito Bowl', 'First Name');
  raw = renameCurrentVersionInRaw(raw, 'Chicken Burrito Bowl', 'Second Name');
  assert.equal(parseRecipeCollection(raw)[0].versionLabel, 'Second Name');
  assert.equal((raw.match(/\*\*Version:\*\*/g) || []).length, 1, 'one Version line, not a pile of them');
});

test('rename rejects an empty or multi-line name', () => {
  assert.throws(() => renameCurrentVersionInRaw(withAlt('X'), 'Chicken Burrito Bowl', '   '), /needs a name/);
  assert.throws(() => renameCurrentVersionInRaw(withAlt('X'), 'Chicken Burrito Bowl', 'a\nb'), /one line/);
});

test('a whole-item entry (no ingredients) can still carry a version name', () => {
  // YoPro Yogurt is prose-only — his Pauls protein yoghurt is the same shape
  const named = renameCurrentVersionInRaw(RECIPE_FILE, 'YoPro Yogurt', 'The 700g Tub');
  const yogurt = parseRecipeCollection(named).find((r) => r.name === 'YoPro Yogurt');
  assert.equal(yogurt.versionLabel, 'The 700g Tub');
  assert.equal(yogurt.ingredients.length, 0, 'still a whole item, not turned into a recipe');
  assert.match(yogurt.description, /straight from the fridge/, 'its prose survived');
  assert.doesNotMatch(yogurt.description, /Version/, 'and the version line is not read back as prose');
});

test('upsertVersionLine leaves a block it cannot place a name in alone', () => {
  assert.equal(upsertVersionLine('no macro line here', 'X'), 'no macro line here');
  assert.equal(upsertVersionLine('**Macros:** 1g P / 1g C / 1g F / 1 kcal', '  '), '**Macros:** 1g P / 1g C / 1g F / 1 kcal');
});
