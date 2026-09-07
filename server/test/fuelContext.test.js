// THE COACH AS A NUTRITION EXPERT.
//
// His instruction, 7 Sep 2026: the Coach should be as expert on Fuel as on
// training. Until now it saw nutrition only as aggregates ("floor met 3/7"),
// which diagnoses a miss and cannot fix one. The property under test is that
// the Coach can see what he ACTUALLY plans to eat and what he actually owns —
// so it can name a real dish instead of inventing food.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-fuelctx-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-fuelctx-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { fuelContext } = await import('../lib/fuelContext.js');
const { loadRecipes } = await import('../lib/recipes.js');
const { setRotationSlot, setOptionEaten } = await import('../lib/rotation.js');
const { setPortions } = await import('../lib/portions.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

test("the Coach sees his real rotation, what he ticked, and the dishes he owns", async () => {
  const recipes = await loadRecipes(vault);
  const first = recipes[0];
  await setRotationSlot(vault, recipes, 'lunch', first.id);
  await setOptionEaten(vault, recipes, 'lunch', first.id, true);
  await setPortions(vault, first.id, 4, { name: first.name });

  const out = await fuelContext(vault);
  assert.match(out, /FUEL — his actual eating system/);
  assert.match(out, new RegExp(first.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the planned dish is named');
  assert.match(out, /✓ eaten/, 'what he ticked is visible, not just the total');
  assert.match(out, /4 cooked/, 'the fridge count rides along');
  assert.match(out, /recipe collection/, 'the dishes he actually cooks are listed');
  assert.match(out, /never invent one/, 'and the rule against inventing food is stated');
});

test('a missing profile is said plainly, never assumed', async () => {
  const bare = await mkdtemp(path.join(tmpdir(), 'nova-fuelctx-bare-'));
  await mkdir(path.join(bare, 'Wiki/Health'), { recursive: true });
  // the same collection with its targets stripped — the state his vault has
  // actually been in all along (About You is empty; audited 7 Sep)
  const noTargets = RECIPE_FILE
    .replace(/^proteinFloorG\s*:.*$/m, '')
    .replace(/^targetKcal\s*:.*$/m, '')
    .replace(/\*\*Profile:\*\*[^\n]*\n/, '');
  await writeFile(path.join(bare, 'Wiki/Health/Meal Prep Recipe Collection.md'), noTargets);
  const out = await fuelContext(bare);
  assert.match(out, /NONE SET/, 'an empty profile is named as a gap, not filled with a guess');
  await rm(bare, { recursive: true, force: true });
});
