// THE INTAKE's yes — what it writes, and that undo brings back the file he had.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTargets, restoreTargets, applyTargets, parseProfile, RECIPES_REL_PATH } from '../lib/recipes.js';
import { setIntake, getProfile, setProfile, profileContext } from '../lib/profile.js';

const COLLECTION = `# Meal Prep Recipe Collection
### High-Protein Fat-Loss Cut — Australian Supermarket Edition

**Profile:** 86kg, 188cm | Cut target ~2,200 kcal/day | Protein floor 150g+/day
**Stores:** Woolworths / Coles / Aldi

---

## Quick-Reference Macro Table
`;

async function vault() {
  const v = await mkdtemp(path.join(os.tmpdir(), 'nova-intake-'));
  await mkdir(path.join(v, 'Wiki/Health'), { recursive: true });
  await writeFile(path.join(v, RECIPES_REL_PATH), COLLECTION, 'utf8');
  return v;
}

test('the yes writes frontmatter every reader uses AND rewrites the prose line he reads in Obsidian', async () => {
  const v = await vault();
  const { prior, profile } = await setTargets(v, { proteinFloorG: 159, targetKcal: 2540, weightKg: 79.4, heightCm: 180 });
  assert.equal(prior.hadFrontmatter, false);
  assert.match(prior.prose, /86kg, 188cm/);
  assert.deepEqual(profile, { weightKg: 79.4, heightCm: 180, targetKcal: 2540, proteinFloorG: 159 });
  const raw = await readFile(path.join(v, RECIPES_REL_PATH), 'utf8');
  assert.match(raw, /^---\nproteinFloorG: 159\ntargetKcal: 2540\nweightKg: 79.4\nheightCm: 180\n---\n# Meal Prep/);
  assert.match(raw, /\*\*Profile:\*\* 79\.4kg, 180cm \| Cut target ~2,540 kcal\/day \| Protein floor 159g\+\/day/);
  assert.match(raw, /## Quick-Reference Macro Table/, 'the rest of the file is untouched');
});

test('undo restores the file he had — no frontmatter block, the original prose line', async () => {
  const v = await vault();
  const { prior } = await setTargets(v, { proteinFloorG: 159, targetKcal: 2540, weightKg: 79.4, heightCm: 180 });
  const back = await restoreTargets(v, prior);
  const raw = await readFile(path.join(v, RECIPES_REL_PATH), 'utf8');
  assert.equal(raw, COLLECTION);
  assert.equal(back.targetKcal, 2200, 'the prose fallback reads again');
});

test('a file that already has frontmatter gets its keys upserted, not a second block', () => {
  const raw = `---\ntype: recipes\ntargetKcal: 2200\n---\n# x\n`;
  const out = applyTargets(raw, { targetKcal: 2400, proteinFloorG: 150 });
  assert.equal(out, `---\ntype: recipes\ntargetKcal: 2400\nproteinFloorG: 150\n---\n# x\n`);
  assert.equal(parseProfile(out).targetKcal, 2400);
});

test('the intake lands on the profile page, survives a prose edit, and reaches every agent as HIS numbers', async () => {
  const v = await vault();
  const intake = { on: '2026-09-08', facts: { sex: 'male', age: 33, heightCm: 180, weightKg: 79.4, activity: 'very', goal: 'lose' }, plan: { tdee: 3034, targetKcal: 2534, proteinG: 159, fatG: 64, carbsG: 331 } };
  const { prior } = await setIntake(v, intake);
  assert.equal(prior, null, 'no profile existed');
  assert.deepEqual((await getProfile(v)).intake, intake);
  const ctx = await profileContext(v);
  assert.match(ctx, /His numbers \(Intake, 2026-09-08/);
  assert.match(ctx, /2534 kcal, 159 g protein floor/);
  await setProfile(v, { focus: 'lead well' });
  assert.deepEqual((await getProfile(v)).intake, intake, 'his words do not erase his numbers');
  const undone = await setIntake(v, null);
  assert.deepEqual(undone.prior, intake);
  assert.equal((await getProfile(v)).intake, null);
  assert.equal((await getProfile(v)).focus, 'lead well', 'undoing the numbers keeps his words');
});
