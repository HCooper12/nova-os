// Today-variants + promote-to-primary: the stored recipe is sacred; today's
// version and permanent promotion are explicit, separate, honest moves.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-rotvar-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-rotvar-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { addRecipe, addAlternate, loadRecipes, promoteAlternate } = await import('../lib/recipes.js');
const { loadRotation, setRotationSlot, setSlotVariant, setSlotConsumed } = await import('../lib/rotation.js');

test.after(async () => { await rm(vault, { recursive: true, force: true }); });

async function recipes() { return loadRecipes(vault); }

test('a today-variant changes the slot and totals but never the stored recipe', async () => {
  await addRecipe(vault, { name: 'Works Burger', category: 'CORE DAILY MEALS', macros: { p: 54, c: 60, f: 30, kcal: 725 }, ingredients: ['Aldi brioche bun', 'beef patty', 'avocado'], method: ['grill', 'assemble'] });
  await addAlternate(vault, 'Works Burger', { label: 'White bread, no avocado', macros: { p: 52, c: 48, f: 18, kcal: 580 }, ingredients: ['2 white bread slices', 'beef patty'], method: ['grill', 'assemble'] });

  let rs = await recipes();
  const burger = rs.find((r) => r.name === 'Works Burger');
  await setRotationSlot(vault, rs, 'lunch', burger.id);
  let rot = await setSlotVariant(vault, rs, 'lunch', 'white-bread-no-avocado');
  assert.equal(rot.slots.lunch.variant, 'White bread, no avocado');
  assert.equal(rot.slots.lunch.macros.kcal, 580, "today's slot wears the variant macros");
  assert.equal(rot.totals.kcal, 580);

  rot = await setSlotConsumed(vault, rs, 'lunch', true);
  assert.equal(rot.consumedTotals.kcal, 580, 'eaten totals use the variant, not the stored recipe');

  rs = await recipes();
  assert.equal(rs.find((r) => r.name === 'Works Burger').macros.kcal, 725, 'the stored recipe is untouched');

  rot = await setSlotVariant(vault, rs, 'lunch', null);
  assert.equal(rot.slots.lunch.variant, null);
  assert.equal(rot.slots.lunch.macros.kcal, 725, 'cleared back to the original');
});

test('unknown variant and empty slot are honest errors', async () => {
  const rs = await recipes();
  await assert.rejects(setSlotVariant(vault, rs, 'lunch', 'no-such-alt'), /has no alternate/);
  await assert.rejects(setSlotVariant(vault, rs, 'dinner', 'x'), /no recipe today/);
});

test('promoting a macro-only alternate swaps macros and preserves the Original', async () => {
  await addRecipe(vault, { name: 'Biscoff Slice', category: 'CORE DAILY MEALS', macros: { p: 40, c: 320, f: 160, kcal: 2900 }, ingredients: ['biscoff', 'butter'], method: ['mix', 'set'] });
  await addAlternate(vault, 'Biscoff Slice', { label: 'Per bar (1 of 8)', macros: { p: 5, c: 40, f: 20, kcal: 363 }, ingredients: [], method: [] });
  let rs = await recipes();
  const slice = rs.find((r) => r.name === 'Biscoff Slice');

  const after = await promoteAlternate(vault, slice.id, 'per-bar-1-of-8');
  assert.equal(after.macros.kcal, 363, 'per-bar macros are now primary');
  assert.deepEqual(after.ingredients.map((i) => i.name).length, 2, 'macro-only promote keeps the batch ingredients');
  const original = after.alternates.find((a) => /^Original/.test(a.label));
  assert.ok(original, 'old main preserved as Original');
  assert.equal(original.macros.kcal, 2900);
  assert.ok(!after.alternates.some((a) => a.id === 'per-bar-1-of-8'), 'promoted alternate no longer duplicated');
});

test('promoting an alternate WITH ingredients swaps the content too, reversibly', async () => {
  let rs = await recipes();
  const burger = rs.find((r) => r.name === 'Works Burger');
  const after = await promoteAlternate(vault, burger.id, 'white-bread-no-avocado');
  assert.equal(after.macros.kcal, 580);
  assert.ok(after.ingredients.some((i) => /white bread/i.test(i.name)), 'ingredients swapped');
  const original = after.alternates.find((a) => /^Original/.test(a.label));
  assert.equal(original.macros.kcal, 725);
  assert.ok(original.ingredients.some((x) => /brioche/i.test(x)), 'original ingredients preserved in the alternate');

  // reversible: promote Original back
  const back = await promoteAlternate(vault, burger.id, original.id);
  assert.equal(back.macros.kcal, 725, 'promoting Original restores the batch macros');
});

test('promote with full ingredients/method leaves NO leftovers from the old body (the m-flag $ bug)', async () => {
  await addRecipe(vault, { name: 'Leftover Trap', category: 'CORE DAILY MEALS', macros: { p: 10, c: 10, f: 10, kcal: 170 }, ingredients: ['old one', 'old two', 'old three'], method: ['old step A', 'old step B'] });
  await addAlternate(vault, 'Leftover Trap', { label: 'New Way', macros: { p: 12, c: 8, f: 9, kcal: 161 }, ingredients: ['new only'], method: ['new step'] });
  let rs = await recipes();
  const trap = rs.find((r) => r.name === 'Leftover Trap');
  await promoteAlternate(vault, trap.id, trap.alternates[0].id);

  rs = await recipes();
  const after = rs.find((r) => r.name === 'Leftover Trap');
  assert.deepEqual(after.ingredients.map((i) => i.name), ['new only'], 'main ingredients are EXACTLY the promoted list');
  assert.deepEqual(after.method, ['new step'], 'main method is exactly the promoted steps');
  const orig = after.alternates.find((a) => /^Original/.test(a.label));
  assert.deepEqual(orig.ingredients, ['old one', 'old two', 'old three'], 'the Original block holds the full old list');
});
