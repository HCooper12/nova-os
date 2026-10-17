// ONE CALORIE TARGET (17 Oct 2026). He changed his calorie goal in Nova and
// Fuel still showed 2,200: the goals page held 2,100, the recipe collection
// (what Fuel reads) still held the old number. A goals save now writes the
// same figures through, and the Intake's yes goes the other way.
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-targets-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-targets-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../lib/fitnessGoals.js');
const R = await import('../lib/recipes.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const COLLECTION = path.join(vault, R.RECIPES_REL_PATH);
await writeFile(COLLECTION, `# Meal Prep Recipe Collection
### High-Protein Fat-Loss Cut

**Profile:** 86kg, 188cm | Cut target ~2,200 kcal/day | Protein floor 150g+/day

## Quick-Reference Macro Table

| Meal | Protein | Carbs | Fat | Calories |
|---|---|---|---|---|
`, 'utf8');
const profile = async () => (await R.loadRecipeData(vault)).profile;

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('a calorie goal saved on the goals page reaches the collection Fuel reads, prose line included', async () => {
  assert.equal((await profile()).targetKcal, 2200);
  await G.setFitnessGoals(vault, { goal: 'Cut', focus: 'x', kcalTarget: 2100, proteinTarget: 150 });
  assert.equal((await profile()).targetKcal, 2100, 'Fuel now reads what he set');
  assert.equal((await profile()).proteinFloorG, 150);
  const raw = await readFile(COLLECTION, 'utf8');
  assert.match(raw, /Cut target ~2,?100 kcal\/day/, 'what he reads in Obsidian agrees');
});

test('a save that changes only the protein changes only the protein, and a save with no numbers leaves both alone', async () => {
  await G.setFitnessGoals(vault, { goal: 'Cut', focus: 'x', kcalTarget: 2100, proteinTarget: 160 });
  assert.deepEqual([(await profile()).targetKcal, (await profile()).proteinFloorG], [2100, 160]);
  await G.setFitnessGoals(vault, { goal: 'Cut again', focus: 'x' });
  assert.deepEqual([(await profile()).targetKcal, (await profile()).proteinFloorG], [2100, 160], 'a goal-line edit does not clear the targets');
});

test('no collection yet: the goals save still succeeds and creates nothing', async () => {
  const bare = await mkdtemp(path.join(tmpdir(), 'nova-targets-bare-'));
  const g = await G.setFitnessGoals(bare, { goal: 'Cut', focus: 'x', kcalTarget: 2000 });
  assert.equal(g.kcalTarget, 2000);
  await assert.rejects(() => readFile(path.join(bare, R.RECIPES_REL_PATH), 'utf8'), /ENOENT/);
  await rm(bare, { recursive: true, force: true });
});

test('the Intake\'s numbers land on the goals page too (so they cannot be shadowed), and the prior comes back for undo', async () => {
  await G.setFitnessGoals(vault, { goal: 'Cut', focus: 'x', kcalTarget: 2100, proteinTarget: 160 });
  const { prior } = await G.setGoalTargets(vault, { kcalTarget: 2300, proteinTarget: 170 });
  assert.deepEqual(prior, { kcalTarget: 2100, proteinTarget: 160 });
  const g = await G.getFitnessGoals(vault);
  assert.deepEqual([g.kcalTarget, g.proteinTarget, g.goal], [2300, 170, 'Cut'], 'only the two numbers moved');
  await G.setGoalTargets(vault, prior);
  assert.equal((await G.getFitnessGoals(vault)).kcalTarget, 2100);
});
