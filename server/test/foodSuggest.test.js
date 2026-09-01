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

test('describe-it prompt: decompose into weighed components, never recall totals', async () => {
  const { buildDescribePrompt } = await import('../lib/scanFood.js');
  const p = buildDescribePrompt('1 large movie popcorn from Village Cinemas');
  assert.match(p, /1 large movie popcorn from Village Cinemas/);
  assert.match(p, /Australian context/);
  // THE CONTRACT CHANGED, deliberately. Asking the model to recall totals is
  // what produced 1050 kcal/50g then 940/36g for one pizza. It now supplies
  // WEIGHTS and code does the arithmetic against USDA.
  assert.match(p, /NOT the arithmetic/i, 'the model must be told the sums are not its job');
  assert.match(p, /grams: your best estimate/i, 'weights are the thing being asked for');
  assert.match(p, /WEIGHTS right is the whole job/i, 'accuracy lives in the portion estimate');
  assert.match(p, /Output ONLY a JSON object with exactly these keys: name, components, confidence, question/);
  assert.doesNotMatch(p, /already know these well enough/, 'the recall instruction must be gone');
  assert.match(p, /confidence.*"high" or "low"/s);
});

test('describe-it refuses input too thin or too long to be honest about', async () => {
  const { startFoodDescribe } = await import('../lib/scanFood.js');
  assert.throws(() => startFoodDescribe('ok'), /few more words/);
  assert.throws(() => startFoodDescribe('x'.repeat(301)), /under 300 characters/);
});


test('a dismissed food asks once more only after 60 days AND a doubled habit — then never again', async () => {
  const DAY = 86_400_000;
  const { updateRecord } = await import('../lib/inboxStore.js');
  const rec = (await listRecords()).find((r) => r.kind === 'food-suggestion' && r.decision.payload.name === 'New Snack');
  assert.equal(rec.decision.payload.count, 3, 'the count rides the payload');
  const t0 = Date.now();
  await updateRecord(rec.id, { status: 'discarded', discardedAt: new Date(t0).toISOString(), declineReason: 'a snack, not a recipe' });

  assert.equal((await runFoodSuggestions(vault, { now: t0 + 30 * DAY })).proposed, 0, 'inside the cooldown a no is a no');
  assert.equal((await runFoodSuggestions(vault, { now: t0 + 61 * DAY })).proposed, 0, 'after it, the same three logs are not a changed habit');

  // he now eats it twice as often as the bar that prompted the first ask
  await day('2026-07-19', ['New Snack']);
  await day('2026-07-22', ['New Snack']);
  await day('2026-07-25', ['New Snack']);
  const res = await runFoodSuggestions(vault, { now: t0 + 61 * DAY });
  assert.equal(res.proposed, 1, 'a doubled habit earns exactly one more ask');
  assert.match(res.records[0].decision.reason, /You passed on this on \d{1,2} \w{3,4} \("a snack, not a recipe"\); the number behind it has moved from 3 to 6, so asking once more/);
  assert.equal(res.records[0].decision.payload.count, 6);

  // he says no again → a standing no, however often he eats it
  await updateRecord(res.records[0].id, { status: 'discarded', discardedAt: new Date(t0 + 61 * DAY).toISOString() });
  await day('2026-07-28', ['New Snack']);
  await day('2026-07-31', ['New Snack']);
  await day('2026-08-03', ['New Snack']);
  await day('2026-08-06', ['New Snack']);
  await day('2026-08-09', ['New Snack']);
  await day('2026-08-12', ['New Snack']);
  assert.equal((await runFoodSuggestions(vault, { now: t0 + 200 * DAY })).proposed, 0, 'twice declined is a standing no');
});
