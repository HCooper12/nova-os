// THE RECIPE PAGE'S FACTS (29 Sep 2026): **Serves:**, **Time:** and
// **Source:** lines in the recipe collection. His ask came with the Osta reel
// (share a recipe reel → a clean page with a photo, prep/cook time, servings
// he can scale, where it came from). A shared-format change, so the reader,
// the writer, the editor and the route are pinned together here, and every
// recipe written before these lines existed must parse and re-serialise
// byte for byte (the vault-writer rule: identity round-trip first).
//
// Temp data dir and a temp vault BEFORE any lib import; his real vault and
// server/data are never touched.
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-facts-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-facts-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { RECIPE_FILE } from './fixtures.js';

const {
  parseRecipeCollection, insertRecipeIntoRaw, editRecipeInRaw, editRecipe, addRecipe, loadRecipes,
  removeRecipe, parseTimeLine, recipeMetaError,
} = await import('../lib/recipes.js');
const { recipesRouter } = await import('../routes/recipes.js');

const FILE = path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md');
await mkdir(path.dirname(FILE), { recursive: true });

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

// Shape-accurate to his real file's quirks: a Version line above Macros, an
// annotation after the Macros numbers and after Makes, "Makes 8 big slices",
// a prose-only entry, a pending recipe, a variant.
const REAL = `# Meal Prep Recipe Collection

**Profile:** 86kg, 188cm | Cut target ~2,200 kcal/day | Protein floor 150g+/day

### Core Daily Meals

| Recipe | P | C | F | kcal |
|---|---|---|---|---|
| Chicken Caesar Pasta | 46.3g | 41.3g | 16.1g | 494 |
| Garlic Butter Steak Bites | 60g | 8g | 12g | 380 |

### Rotation / Swap Meals

| Recipe | P | C | F | kcal |
|---|---|---|---|---|

### Treats

| Recipe | P | C | F | kcal |
|---|---|---|---|---|
| Oreo Protein Brookie | 19g | 18g | 7g | 190 |
| High protein Oreo brownies | — | — | — | — |

# PART 1 — CORE DAILY MEALS

## 5. Chicken Caesar Pasta

**Version:** Doubled to 8 servings

**Macros:** 46.3g P / 41.3g C / 16.1g F / 494 kcal
**Makes:** 4 servings | *Cold meal — no reheating required*

### Ingredients (makes 4 servings)
- 1kg raw chicken breast (Nuttab or Woolworths RSPCA)
- **400g pasta** (any short shape)

### Method
1. Cook the pasta.
2. **Grill** the chicken.

> Keeps 4 days.

#### Alternative: Lighter

**Macros:** 40g P / 30g C / 10g F / 380 kcal

##### Ingredients
- 1kg raw chicken breast

##### Method
1. Grill.

---

## 14. Garlic Butter Steak Bites

**Macros:** 60g P / 8g C / 12g F / 380 kcal | *Lowest-calorie high-protein meal*

### Ingredients
- 250g rump steak

### Method
1. Sear.

---

## 18. YoPro Yogurt (Snack)

**Macros:** 20g P / 6g C / 1g F / 115 kcal

Just a tub of YoPro straight from the fridge.

---

# PART 2 — TREATS

## 26. Oreo Protein Brookie

**Macros:** 19g P / 18g C / 7g F / 190 kcal
**Makes:** Makes 8 big slices

### Ingredients (Makes 8 big slices)
- 2 medium eggs
- 120g egg whites

### Method
1. Bake.

---

## 36. High protein Oreo brownies

**Macros:** not set yet — add them when you make it
**Makes:** 1 batch of brownies

### Ingredients (1 batch of brownies)
- 1 medium egg

### Method
1. Mix.

---
`;

/* ------------------------------ the reader ------------------------------ */

test('a recipe written before these lines parses with servings from Makes and the rest null', () => {
  const byId = Object.fromEntries(parseRecipeCollection(REAL).map((r) => [r.id, r]));
  assert.equal(Object.keys(byId).length, 5);
  assert.equal(byId['chicken-caesar-pasta'].servings, 4);
  assert.equal(byId['oreo-protein-brookie'].servings, 8);
  assert.equal(byId['high-protein-oreo-brownies'].servings, null, 'a batch is not a portion count');
  assert.equal(byId['yopro-yogurt-snack'].servings, null);
  for (const r of Object.values(byId)) {
    assert.equal(r.prepMin, null);
    assert.equal(r.cookMin, null);
    assert.equal(r.source, null);
  }
  const fixture = parseRecipeCollection(RECIPE_FILE);
  assert.deepEqual(fixture.map((r) => r.servings), [4, null, null]);
});

test('the three lines read in any order, with either half of Time missing', () => {
  const block = (lines) => `# PART 2 — TREATS\n\n## 1. Oats\n\n**Macros:** 1g P / 2g C / 3g F / 45 kcal\n**Makes:** 6 jars\n${lines}\n\n### Ingredients\n- 240 g oats\n\n### Method\n1. Mix.\n`;
  const [a] = parseRecipeCollection(block('**Source:** [Sean Graham](https://www.instagram.com/reel/DdTRWX9zwd4/)\n**Time:** 15 min prep · 20 min cook\n**Serves:** 3'));
  assert.equal(a.servings, 3, 'Serves wins over Makes');
  assert.equal(a.prepMin, 15);
  assert.equal(a.cookMin, 20);
  assert.deepEqual(a.source, { url: 'https://www.instagram.com/reel/DdTRWX9zwd4/', label: 'Sean Graham' });
  assert.deepEqual(a.ingredients, [{ qty: '', name: '240 g oats' }]);
  const [b] = parseRecipeCollection(block('**Time:** 20 min cook\n**Source:** https://x.com/a/status/1'));
  assert.equal(b.servings, 6);
  assert.equal(b.prepMin, null);
  assert.equal(b.cookMin, 20);
  assert.deepEqual(b.source, { url: 'https://x.com/a/status/1', label: null });
  const [c] = parseRecipeCollection(block('**Source:** [https://x.com/a](https://x.com/a)'));
  assert.deepEqual(c.source, { url: 'https://x.com/a', label: null }, '[url](url) reads as a link with no label');
  assert.deepEqual(parseTimeLine('1 hr 5 min cook, 10 mins prep'), { prepMin: 10, cookMin: 65 });
});

test('a prose-only entry never shows the fact lines as its description', () => {
  const raw = insertRecipeIntoRaw(RECIPE_FILE, { name: 'Protein Bar', category: 'TREATS', macros: { p: 20, c: 20, f: 5, kcal: 205 }, description: 'One bar.', source: { url: 'https://x.com/a', label: 'Label' }, prepMin: 0 });
  const bar = parseRecipeCollection(raw).find((r) => r.id === 'protein-bar');
  assert.equal(bar.description, 'One bar.');
  assert.equal(bar.prepMin, 0);
  assert.deepEqual(bar.source, { url: 'https://x.com/a', label: 'Label' });
});

/* ------------------------------ the writer ------------------------------ */

test('a new recipe writes only the lines that have a value, under Makes, in order', () => {
  const out = insertRecipeIntoRaw(RECIPE_FILE, {
    name: 'Kinder Bueno Oats', category: 'TREATS', macros: { p: 48, c: 44, f: 11, kcal: 471 }, makes: '6 jars',
    servings: 6, prepMin: 15, cookMin: null, source: { url: 'https://www.instagram.com/reel/DdTRWX9zwd4/', label: 'Sean Graham' },
    ingredients: ['240 g oats'], method: ['Mix.'],
  });
  assert.ok(out.includes('## 4. Kinder Bueno Oats\n\n**Macros:** 48g P / 44g C / 11g F / 471 kcal\n**Makes:** 6 jars\n**Time:** 15 min prep\n**Source:** [Sean Graham](https://www.instagram.com/reel/DdTRWX9zwd4/)\n\n### Ingredients (6 jars)\n'));
  assert.ok(!out.includes('**Serves:**'), 'Makes already says 6: no repeated Serves line');
  // a Serves count Makes does not carry is written
  const other = insertRecipeIntoRaw(RECIPE_FILE, { name: 'Sliders', category: 'TREATS', macros: { p: 1, c: 1, f: 1, kcal: 17 }, makes: '14 sliders = 7 meals', servings: 7, ingredients: ['a'], method: ['b'] });
  assert.ok(other.includes('**Makes:** 14 sliders = 7 meals\n**Serves:** 7\n\n'));
  assert.equal(parseRecipeCollection(other).find((r) => r.id === 'sliders').servings, 7);
  // an unusable value is dropped, never written, and never refuses the recipe
  const junk = insertRecipeIntoRaw(RECIPE_FILE, { name: 'Junk', category: 'TREATS', macros: { p: 1, c: 1, f: 1, kcal: 17 }, servings: 0, prepMin: -5, cookMin: 'soon', source: { url: 'javascript:alert(1)' }, ingredients: ['a'], method: ['b'] });
  assert.ok(!/Serves|Time|Source|undefined|NaN|null/.test(junk.slice(junk.indexOf('## 4. Junk'))));
  // and a recipe with none of them is written exactly as before this change
  const plain = insertRecipeIntoRaw(RECIPE_FILE, { name: 'Plain', category: 'TREATS', macros: { p: 1, c: 1, f: 1, kcal: 17 }, makes: '2 serves', ingredients: ['a'], method: ['b'] });
  assert.ok(plain.includes('## 4. Plain\n\n**Macros:** 1g P / 1g C / 1g F / 17 kcal\n**Makes:** 2 serves\n\n### Ingredients (2 serves)\n- a\n\n### Method\n1. b\n\n---\n\n'));
});

/* ------------------------------ the editor ------------------------------ */

test('THE IDENTITY ROUND-TRIP: re-setting every recipe to the facts it already has changes no byte', () => {
  for (const r of parseRecipeCollection(REAL)) {
    const same = { servings: r.servings, prepMin: r.prepMin, cookMin: r.cookMin, source: r.source };
    assert.equal(editRecipeInRaw(REAL, r.id, same), REAL, `${r.name}: facts identity`);
    const full = {
      ...same,
      ...(r.ingredients.length ? { ingredients: r.ingredients.map((i) => i.name) } : {}),
      ...(r.method.length ? { method: r.method } : {}),
      ...(r.macros ? { macros: r.macros } : {}),
    };
    assert.equal(editRecipeInRaw(REAL, r.id, full), REAL, `${r.name}: full identity`);
  }
});

test('a macro save keeps what he wrote after the numbers (the identity run found it dropped)', () => {
  const out = editRecipeInRaw(REAL, 'garlic-butter-steak-bites', { macros: { p: 61, c: 8, f: 12, kcal: 384 } });
  assert.ok(out.includes('**Macros:** 61g P / 8g C / 12g F / 384 kcal | *Lowest-calorie high-protein meal*\n'));
  assert.equal(out.split('\n').filter((l, i) => l !== REAL.split('\n')[i]).length, 1, 'exactly one line moved');
});

test('each fact is inserted, changed and removed in place, and removing puts the file back byte for byte', () => {
  const lines = (s) => s.split('\n');
  const src = { url: 'https://www.instagram.com/reel/DdTRWX9zwd4/', label: 'Sean Graham' };
  // insert: exactly one line appears, straight under Makes
  const withSrc = editRecipeInRaw(REAL, 'oreo-protein-brookie', { source: src });
  assert.equal(lines(withSrc).length, lines(REAL).length + 1);
  assert.ok(withSrc.includes('**Makes:** Makes 8 big slices\n**Source:** [Sean Graham](https://www.instagram.com/reel/DdTRWX9zwd4/)\n\n### Ingredients'));
  // Time goes between Makes and Source whatever order they arrive in
  const withTime = editRecipeInRaw(withSrc, 'oreo-protein-brookie', { cookMin: 25 });
  assert.ok(withTime.includes('**Makes:** Makes 8 big slices\n**Time:** 25 min cook\n**Source:** ['));
  // one half changes; the other half he had stays
  const both = editRecipeInRaw(withTime, 'oreo-protein-brookie', { prepMin: 10 });
  assert.ok(both.includes('**Time:** 10 min prep · 25 min cook\n'));
  const cookOnly = editRecipeInRaw(both, 'oreo-protein-brookie', { prepMin: null });
  assert.equal(cookOnly, withTime);
  // Serves: a number Makes does not carry is written; the Makes number removes it
  const serves = editRecipeInRaw(cookOnly, 'oreo-protein-brookie', { servings: 16 });
  assert.ok(serves.includes('**Makes:** Makes 8 big slices\n**Serves:** 16\n**Time:** 25 min cook\n'));
  assert.equal(editRecipeInRaw(serves, 'oreo-protein-brookie', { servings: 8 }), cookOnly);
  assert.equal(editRecipeInRaw(serves, 'oreo-protein-brookie', { servings: null }), cookOnly);
  // removing every line → the original file, byte for byte
  const back = editRecipeInRaw(serves, 'oreo-protein-brookie', { servings: null, cookMin: null, source: null });
  assert.equal(back, REAL);
  // a recipe with no Makes line anchors under Macros, even an annotated one
  const bites = editRecipeInRaw(REAL, 'garlic-butter-steak-bites', { servings: 2 });
  assert.ok(bites.includes('*Lowest-calorie high-protein meal*\n**Serves:** 2\n\n### Ingredients'));
  // a pending recipe (macros not set) takes them too, and stays pending
  const pend = editRecipeInRaw(REAL, 'high-protein-oreo-brownies', { servings: 9 });
  const got = parseRecipeCollection(pend).find((r) => r.id === 'high-protein-oreo-brownies');
  assert.equal(got.servings, 9);
  assert.equal(got.macrosPending, true);
  // the version-named recipe with a variant: the variant is untouched
  const pasta = editRecipeInRaw(REAL, 'chicken-caesar-pasta', { source: src });
  const p2 = parseRecipeCollection(pasta).find((r) => r.id === 'chicken-caesar-pasta');
  const p1 = parseRecipeCollection(REAL).find((r) => r.id === 'chicken-caesar-pasta');
  assert.deepEqual({ ...p2, source: null }, p1);
});

test('facts belong to the recipe, not a variant; and bad values are refused plainly', () => {
  assert.throws(() => editRecipeInRaw(REAL, 'chicken-caesar-pasta', { servings: 2 }, 'lighter'), /not one of its variants/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { servings: 0 }), /1 to 99/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { servings: 100 }), /1 to 99/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { servings: 1.5 }), /1 to 99/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { prepMin: -1 }), /0 to 1440/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { cookMin: 1441 }), /0 to 1440/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { source: { url: 'ftp://x' } }), /http\(s\)/);
  assert.throws(() => editRecipeInRaw(REAL, 'oreo-protein-brookie', { source: { url: `https://x.com/${'a'.repeat(500)}` } }), /500/);
  assert.equal(recipeMetaError({ servings: 4, prepMin: 0, cookMin: 1440, source: { url: 'https://x.com', label: 'x' } }), null);
});

test('on disk: editRecipe writes a facts edit, and an identical one writes nothing at all', async () => {
  await writeFile(FILE, REAL);
  const updated = await editRecipe(vault, 'oreo-protein-brookie', { prepMin: 10, cookMin: 25, source: { url: 'https://x.com/a', label: 'Label' } });
  assert.equal(updated.prepMin, 10);
  assert.equal(updated.cookMin, 25);
  assert.deepEqual(updated.ingredients, parseRecipeCollection(REAL).find((r) => r.id === 'oreo-protein-brookie').ingredients);
  const t0 = (await stat(FILE)).mtimeMs;
  const raw0 = await readFile(FILE, 'utf8');
  await new Promise((r) => setTimeout(r, 20));
  await editRecipe(vault, 'oreo-protein-brookie', { prepMin: 10 });
  assert.equal((await stat(FILE)).mtimeMs, t0, 'no write, no backup for a no-op');
  assert.equal(await readFile(FILE, 'utf8'), raw0);
  await editRecipe(vault, 'oreo-protein-brookie', { prepMin: null, cookMin: null, source: null });
  assert.equal(await readFile(FILE, 'utf8'), REAL);
});

test('add → load → remove with every fact: the file is left exactly as it was', async () => {
  await writeFile(FILE, RECIPE_FILE);
  const added = await addRecipe(vault, { name: 'Reel Oats', category: 'TREATS', macros: null, makes: '6 jars', servings: 6, prepMin: 5, cookMin: 0, source: { url: 'https://www.instagram.com/reel/x/', label: 'Sean' }, ingredients: ['240 g oats'], method: ['Mix.'] });
  assert.equal(added.servings, 6);
  assert.equal(added.prepMin, 5);
  assert.equal(added.cookMin, 0, 'zero minutes of cooking is a fact, not an absence');
  assert.deepEqual((await loadRecipes(vault)).find((r) => r.id === 'reel-oats').source, { url: 'https://www.instagram.com/reel/x/', label: 'Sean' });
  await removeRecipe(vault, 'reel-oats');
  assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE);
});

/* ------------------------------ the route ------------------------------- */

function startServer() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api', recipesRouter(vault));
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/api` }));
  });
}
const post = (base, p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('over the wire: /edit, POST /recipes and /recipes/quick take the facts, validated', async (t) => {
  await writeFile(FILE, RECIPE_FILE);
  const { srv, base } = await startServer();
  t.after(() => srv.close());
  let r = await post(base, '/recipes/protein-brownie/edit', { servings: 8, prepMin: 10, cookMin: 20, source: { url: 'https://x.com/a', label: 'A' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.recipe.servings, 8);
  assert.equal(r.body.recipe.cookMin, 20);
  assert.ok((await readFile(FILE, 'utf8')).includes('**Serves:** 8\n**Time:** 10 min prep · 20 min cook\n**Source:** [A](https://x.com/a)\n'));
  r = await post(base, '/recipes/protein-brownie/edit', { servings: null, prepMin: null, cookMin: null, source: null });
  assert.equal(r.status, 200);
  assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE, 'null removes every line');
  for (const bad of [{ servings: 0 }, { servings: 12.5 }, { prepMin: 2000 }, { source: { url: 'nope' } }]) {
    r = await post(base, '/recipes/protein-brownie/edit', bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE, 'a refused edit writes nothing');
  r = await post(base, '/recipes', { name: 'Route Oats', category: 'TREATS', macros: { p: 1, c: 2, f: 3, kcal: 39 }, ingredients: ['240 g oats'], method: ['Mix.'], servings: 4, cookMin: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.recipe.servings, 4);
  assert.equal(r.body.recipe.cookMin, 0);
  r = await post(base, '/recipes/quick', { name: 'Quick Bar', category: 'TREATS', macros: { p: 1, c: 2, f: 3, kcal: 39 }, source: { url: 'https://x.com/b' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.recipe.source, { url: 'https://x.com/b', label: null });
  r = await post(base, '/recipes/quick', { name: 'Bad Bar', category: 'TREATS', macros: { p: 1, c: 2, f: 3, kcal: 39 }, prepMin: -3 });
  assert.equal(r.status, 400);
});
