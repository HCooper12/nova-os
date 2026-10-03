// A rotation tick while the log shows a past day lands on THAT day (his
// report, 3 Oct 2026: the lasagne he ate yesterday, ticked from the
// rotation while looking at yesterday, went onto today). Temp vault and
// NOVA_DATA_DIR, both set before any import, so nothing here can reach his.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-rotretro-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-rotretro-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { loadRecipes } = await import('../lib/recipes.js');
const rot = await import('../lib/rotation.js');
const por = await import('../lib/portions.js');
const { getDay, getToday } = await import('../lib/foodLog.js');
const { setRotationEatenOn } = await import('../lib/rotationRetro.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const iso = (daysBack) => {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a tick while viewing yesterday lands on yesterday, leaves today alone, and takes one portion', async () => {
  const recipes = await loadRecipes(vault);
  const dish = recipes.find((r) => r.macros);
  await rot.addSlotOption(vault, recipes, 'dinner', dish.id);
  await por.setPortions(vault, dish.id, 3);
  const yesterday = iso(1);

  const out = await setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: true, date: yesterday });
  assert.equal(out.date, yesterday);
  const entry = out.day.entries.find((e) => e.source === 'rotation');
  assert.ok(entry, 'the dish is on yesterday');
  assert.equal(entry.slot, 'dinner');
  assert.equal(entry.recipeId, dish.id);
  assert.equal(entry.name, dish.name);
  assert.equal(entry.time, undefined, 'a retro entry carries no invented clock time');
  assert.equal((await getDay(yesterday)).entries.length, 1, 'persisted on that day');
  assert.equal((await getToday()).entries.length, 0, 'nothing went onto today');
  assert.equal(out.rotation.options.dinner.find((d) => d.id === dish.id).eaten, false, "today's rotation tick is untouched");
  assert.equal((await por.getPortions(vault))[dish.id], 2, 'one portion came out of the fridge');

  // a second tick is the same tick, never a second portion or a second entry
  await setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: true, date: yesterday });
  assert.equal((await getDay(yesterday)).entries.length, 1);
  assert.equal((await por.getPortions(vault))[dish.id], 2);

  // the un-tick (a swipe-delete of that row, or its Undo) takes it back off and returns the portion
  const back = await setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: false, date: yesterday });
  assert.equal(back.day.entries.length, 0);
  assert.equal((await por.getPortions(vault))[dish.id], 3);
});

test('a dish that has left the slot can still be taken off a past day', async () => {
  const recipes = await loadRecipes(vault);
  const dish = recipes.find((r) => r.macros);
  const d2 = iso(2);
  await setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: true, date: d2 });
  await rot.removeSlotOption(vault, recipes, 'dinner', dish.id);
  const out = await setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: false, date: d2 });
  assert.equal(out.day.entries.length, 0);
});

test('outside the retro window it refuses rather than guessing a day', async () => {
  const recipes = await loadRecipes(vault);
  const dish = recipes.find((r) => r.macros);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const t = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  await assert.rejects(setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: true, date: t }), /future/);
  await assert.rejects(setRotationEatenOn({ vaultPath: vault, recipes, slot: 'dinner', recipeId: dish.id, eaten: true, date: iso(45) }), /retro/);
});
