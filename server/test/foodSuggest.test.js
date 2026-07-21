// Recurring-food → recipe-bank suggestions. Temp data dir + vault BEFORE imports.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-foodsuggest-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-foodsuggest-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runFoodSuggestions } = await import('../lib/foodSuggest.js');
const { listRecords } = await import('../lib/inboxStore.js');

const RECIPE_FILE = `# PART 1 — CORE DAILY MEALS

## 1. Known Meal

**Macros:** 20g P / 30g C / 10g F / 300 kcal

### Ingredients
- something

### Method
1. do it

---

# PART 2 — ROTATION / SWAP MEALS

# PART 3 — TREATS
`;

const logDir = path.join(dataDir, 'food-log');
const day = (date, names) => writeFile(
  path.join(logDir, `${date}.json`),
  JSON.stringify({ date, entries: names.map((name, i) => ({ id: `${date}-${i}`, time: '10:00', name, macros: { p: 10, c: 20, f: 5, kcal: 160 } })) })
);

test.before(async () => {
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);
  await mkdir(logDir, { recursive: true });
  // "New Snack" ×3 (should be proposed), "Known Meal" ×3 (excluded — it's a recipe),
  // "Rare Thing" ×1 (below the threshold).
  await day('2026-07-10', ['New Snack', 'Known Meal', 'Rare Thing']);
  await day('2026-07-13', ['New Snack', 'Known Meal']);
  await day('2026-07-16', ['New Snack', 'Known Meal']);
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('proposes a recurring off-plan food, excluding recipes and rare items', async () => {
  const res = await runFoodSuggestions(vault);
  assert.equal(res.proposed, 1, 'only the recurring, non-recipe item');
  const rec = res.records[0];
  assert.equal(rec.decision.payload.name, 'New Snack');
  assert.equal(rec.kind, 'food-suggestion');
  assert.equal(rec.decision.route, 'recipe', 'approval routes to a recipe insert');
  assert.equal(rec.decision.payload.category, 'ROTATION / SWAP MEALS');
  assert.ok(rec.decision.reason.includes('3 times'), 'reason cites how often');

  const filed = (await listRecords()).filter((r) => r.kind === 'food-suggestion');
  assert.equal(filed.length, 1);
});

test('never re-proposes the same item on a later run', async () => {
  const res = await runFoodSuggestions(vault);
  assert.equal(res.proposed, 0, 'already proposed once → no repeat, even after dismissal');
});
