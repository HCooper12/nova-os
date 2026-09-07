// Rotation v2: several options per slot with one in focus, any of them
// ticked on its own, extra meals, and the cooked-portion count that falls
// as he ticks. The resolved shape stays a superset of v1 so the nine
// existing readers keep working, and a v1 file migrates on read.
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-rot2-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-rot2-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { loadRecipes, addRecipe } = await import('../lib/recipes.js');
const rot = await import('../lib/rotation.js');
const por = await import('../lib/portions.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const byName = (recipes, n) => recipes.find((r) => r.name === n);

test('a v1 file migrates on read: one recipe per slot becomes one option in focus; consumed becomes eaten', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1];
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const v1 = `---\ntype: rotation\nslots:\n  breakfast: ${a.id}\n  lunch: ${b.id}\nconsumed:\n  lunch: true\nconsumedDate: '${iso}'\n---\n# Daily Rotation\n`;
  await writeFile(path.join(vault, 'Wiki/Health/Daily Rotation.md'), v1, 'utf8');
  const r = await rot.loadRotation(vault, recipes);
  assert.equal(r.version, 2);
  assert.equal(r.slots.breakfast.id, a.id);
  assert.equal(r.slots.breakfast.focus, true);
  assert.equal(r.slots.breakfast.consumed, false);
  assert.equal(r.slots.lunch.consumed, true, 'v1 consumed → eaten');
  assert.equal(r.options.lunch.length, 1);
  assert.deepEqual(r.order.slice(0, 5), ['breakfast', 'lunch', 'dinner', 'snack', 'extra']);
  assert.equal(Math.round(r.totals.p), Math.round(a.macros.p + b.macros.p), 'plan = the focused dish per slot');
  assert.equal(Math.round(r.consumedTotals.p), Math.round(b.macros.p), 'eaten = only what is ticked');
});

test('options: add several to one slot, flick focus between them, the plan follows the focus', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1]; const c = recipes[2];
  let r = await rot.addSlotOption(vault, recipes, 'breakfast', b.id);
  r = await rot.addSlotOption(vault, recipes, 'breakfast', c.id);
  assert.equal(r.options.breakfast.length, 3);
  assert.equal(r.slots.breakfast.id, a.id, 'adding options keeps the existing focus');
  assert.equal(r.slots.breakfast.optionCount, 3);
  r = await rot.setSlotFocus(vault, recipes, 'breakfast', c.id);
  assert.equal(r.slots.breakfast.id, c.id);
  assert.equal(Math.round(r.totals.p), Math.round(c.macros.p + b.macros.p), 'the plan moved with the focus');
  await assert.rejects(() => rot.setSlotFocus(vault, recipes, 'breakfast', 'nope'), /not one of the options/);
  // the file itself is written v2, with the focus starred
  const raw = await readFile(path.join(vault, 'Wiki/Health/Daily Rotation.md'), 'utf8');
  assert.match(raw, /version: 2/);
  assert.match(raw, new RegExp(`★ ${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('several dishes in one slot, each ticked on its own; eaten totals count every tick, the plan counts one', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1]; const c = recipes[2];
  await rot.addSlotOption(vault, recipes, 'snack', a.id);
  await rot.addSlotOption(vault, recipes, 'snack', b.id);
  let r = await rot.addSlotOption(vault, recipes, 'snack', c.id);
  r = await rot.setOptionEaten(vault, recipes, 'snack', a.id, true);
  r = await rot.setOptionEaten(vault, recipes, 'snack', c.id, true);
  assert.equal(r.slots.snack.eatenCount, 2);
  assert.equal(r.options.snack.filter((d) => d.eaten).length, 2);
  const snackEaten = a.macros.p + c.macros.p;
  // consumed totals = lunch (from the v1 test) + the two snacks
  assert.equal(Math.round(r.consumedTotals.p), Math.round(recipes[1].macros.p + snackEaten));
  // the plan for snack is still ONE dish — the focused one
  assert.equal(r.slots.snack.id, a.id);
  r = await rot.setOptionEaten(vault, recipes, 'snack', a.id, false);
  assert.equal(r.slots.snack.eatenCount, 1);
  await assert.rejects(() => rot.setOptionEaten(vault, recipes, 'snack', 'nope', true), /not one of the options/);
});

test('v1 compat: setRotationSlot adds + focuses without wiping the other options; setSlotConsumed ticks the focused one', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1]; const c = recipes[2];
  let r = await rot.setRotationSlot(vault, recipes, 'breakfast', a.id);
  assert.equal(r.slots.breakfast.id, a.id);
  assert.equal(r.options.breakfast.length, 3, 'nothing else was wiped');
  r = await rot.setSlotConsumed(vault, recipes, 'breakfast', true);
  assert.equal(r.slots.breakfast.consumed, true);
  assert.equal(r.options.breakfast.find((d) => d.id === b.id).eaten, false);
  r = await rot.setSlotConsumed(vault, recipes, 'breakfast', false);
  assert.equal(r.slots.breakfast.consumed, false);
  // clearing a slot clears every option
  r = await rot.setRotationSlot(vault, recipes, 'dinner', c.id);
  r = await rot.setRotationSlot(vault, recipes, 'dinner', null);
  assert.equal(r.slots.dinner, null);
  assert.equal(r.options.dinner.length, 0);
});

test('removing an option moves the focus and forgets its tick; a variant applies to the focused option', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1]; const c = recipes[2];
  await rot.setSlotFocus(vault, recipes, 'breakfast', a.id);
  let r = await rot.removeSlotOption(vault, recipes, 'breakfast', a.id);
  assert.equal(r.options.breakfast.length, 2);
  assert.notEqual(r.slots.breakfast.id, a.id, 'focus moved off the removed one');
  // variants ride the focused option — set one, then focus another and see it is per-dish
  const { addAlternate } = await import('../lib/recipes.js');
  await addAlternate(vault, b.name, { label: 'No rice', macros: { p: 40, c: 10, f: 10, kcal: 290 }, ingredients: ['x'], method: ['y'] });
  const fresh = await loadRecipes(vault);
  const alt = byName(fresh, b.name).alternates[0];
  await rot.setSlotFocus(vault, fresh, 'breakfast', b.id);
  r = await rot.setSlotVariant(vault, fresh, 'breakfast', alt.id);
  assert.equal(r.slots.breakfast.variant, 'No rice');
  assert.equal(r.slots.breakfast.macros.p, 40);
  r = await rot.setSlotFocus(vault, fresh, 'breakfast', c.id);
  assert.equal(r.slots.breakfast.variant, null, 'the other option carries no variant');
  assert.equal(r.options.breakfast.find((d) => d.id === b.id).variant, 'No rice', 'and the varianted one keeps it');
});

test('extra meals: add, rename, fill, remove — the standard five never go', async () => {
  const recipes = await loadRecipes(vault);
  let r = await rot.addCustomSlot(vault, recipes, 'Post-gym shake');
  const key = r.custom[0].key;
  assert.match(key, /^extra-\d+$/);
  assert.equal(r.labels[key], 'Post-gym shake');
  assert.ok(r.order.includes(key));
  r = await rot.addSlotOption(vault, recipes, key, recipes[0].id);
  assert.equal(r.slots[key].id, recipes[0].id);
  r = await rot.renameCustomSlot(vault, recipes, key, 'Shake');
  assert.equal(r.labels[key], 'Shake');
  await assert.rejects(() => rot.removeCustomSlot(vault, recipes, 'lunch'), /standard meals stay/);
  r = await rot.removeCustomSlot(vault, recipes, key);
  assert.ok(!r.order.includes(key));
  assert.equal(r.custom.length, 0);
});

test('cooked portions: counted dishes fall as he ticks, rise when he cooks, never go negative, and uncounted dishes are left alone', async () => {
  const recipes = await loadRecipes(vault);
  const a = recipes[0]; const b = recipes[1];
  // untracked dish: ticking does not invent a count
  let r = await rot.setOptionEaten(vault, recipes, 'snack', b.id, true);
  assert.equal(r.options.snack.find((d) => d.id === b.id).portionsLeft, null);
  await rot.setOptionEaten(vault, recipes, 'snack', b.id, false);
  // cook 2 → tick → 1 → tick a second option of the same dish elsewhere? one dish, so: tick → 1, untick → 2
  await por.setPortions(vault, a.id, 2, { name: a.name });
  r = await rot.setOptionEaten(vault, recipes, 'snack', a.id, true);
  assert.equal(r.options.snack.find((d) => d.id === a.id).portionsLeft, 1);
  r = await rot.setOptionEaten(vault, recipes, 'snack', a.id, false);
  assert.equal(r.options.snack.find((d) => d.id === a.id).portionsLeft, 2);
  // "cooked eight more when two were left" = ten
  await por.adjustPortions(vault, a.id, 8, { why: 'cooked' });
  assert.equal((await por.getPortions(vault))[a.id], 10);
  // down to zero reads as OUT, and cannot go below
  await por.setPortions(vault, a.id, 1);
  r = await rot.setOptionEaten(vault, recipes, 'snack', a.id, true);
  const dish = r.options.snack.find((d) => d.id === a.id);
  assert.equal(dish.portionsLeft, 0);
  assert.equal(dish.out, true, 'zero left reads as out — the red state');
  await assert.rejects(() => por.adjustPortions(vault, 'unknown-dish', -1), /no portion count yet/);
  await assert.rejects(() => por.setPortions(vault, a.id, -3), /whole number/);
  // stop counting: not zero, not tracked
  await por.clearPortions(vault, a.id);
  r = await rot.loadRotation(vault, recipes);
  assert.equal(r.options.snack.find((d) => d.id === a.id).portionsLeft, null);
  assert.equal(r.options.snack.find((d) => d.id === a.id).out, false);
});
