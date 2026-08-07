// "I just ate dinner" → mark the PLANNED meal eaten with its true macros —
// never an estimate. Covers normalization, filing against a real rotation,
// the double-eat and empty-slot guards, and undo.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-foodslot-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-foodslot-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { RECIPE_FILE } from './fixtures.js';

const { normalizeDecision, fileDecision, undoFiling } = await import('../lib/inbox.js');
const { setRotationSlot, loadRotation } = await import('../lib/rotation.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('normalize: a slot payload passes clean; junk slots and nameless food still throw', () => {
  const d = normalizeDecision({ route: 'food', confidence: 'high', title: 'Dinner eaten', reason: 'slot named', payload: { slot: 'Dinner' } });
  assert.deepEqual(d.payload, { slot: 'dinner' }); // case-insensitive
  assert.throws(() => normalizeDecision({ route: 'food', confidence: 'high', payload: { slot: 'supper' } }), /not a rotation slot/);
  assert.throws(() => normalizeDecision({ route: 'food', confidence: 'high', payload: {} }), /no food name/);
});

test('filing a slot marks the planned meal eaten with its REAL macros, and undo unmarks it', async () => {
  // fileDecision loads recipes from the vault — add a real one to the seeded
  // collection and put it in tonight's dinner slot
  const { addRecipe, loadRecipeData } = await import('../lib/recipes.js');
  await addRecipe(vault, { name: 'Butter Chicken Bowl', category: 'CORE DAILY MEALS', macros: { p: 48, c: 62, f: 21, kcal: 640 }, ingredients: ['chicken'], method: ['cook'] });
  const { recipes } = await loadRecipeData(vault);
  const target = recipes.find((r) => r.name === 'Butter Chicken Bowl');
  await setRotationSlot(vault, recipes, 'dinner', target.id);

  const decision = normalizeDecision({ route: 'food', confidence: 'high', title: 'Dinner eaten', reason: 'he said he ate dinner', payload: { slot: 'dinner' } });
  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /Marked dinner eaten — Butter Chicken Bowl/);
  assert.match(destination, /48P · 62C · 21F · 640 kcal/); // the recipe's numbers, not an estimate

  const after = await loadRotation(vault, recipes);
  assert.equal(after.slots.dinner.consumed, true);

  // eating dinner twice is refused honestly
  await assert.rejects(() => fileDecision(vault, decision), /already marked eaten/);

  const note = await undoFiling(vault, undo);
  assert.match(note, /unmarked dinner/);
  const reverted = await loadRotation(vault, recipes);
  assert.equal(reverted.slots.dinner.consumed, false);
});

test('an empty slot refuses instead of inventing a meal', async () => {
  const decision = normalizeDecision({ route: 'food', confidence: 'high', title: 'Lunch eaten', reason: 'slot named', payload: { slot: 'lunch' } });
  await assert.rejects(() => fileDecision(vault, decision), /no lunch in today's rotation/);
});
