// A RECIPE WITH ITS MACROS NOT SET (29 Sep 2026).
//
// His ask: "Ones without macros should still be added if that's what I ask,
// but added as a recipe only so I can fill in macros when I decide to
// cook/bake it." Nova still never guesses a macro, so the recipe is written
// with a pending line in place of the numbers and a dash row in its table.
// This is a shared-format change: the writer, the parser, the editor, the
// rotation, the agent context and the Fuel view models are all pinned here.
//
// Temp data dir and a temp vault BEFORE any lib import; his real vault and
// server/data are never touched.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-pending-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-pending-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

const FILE = path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md');
await mkdir(path.dirname(FILE), { recursive: true });
await writeFile(FILE, RECIPE_FILE);

const {
  parseRecipeCollection, insertRecipeIntoRaw, addRecipe, loadRecipes, editRecipe, removeRecipe,
  renameCurrentVersion, PENDING_MACROS_LINE, updateQuickRefRow,
} = await import('../lib/recipes.js');
const { addSlotOption, setRotationSlot, setOptionEaten, loadRotation } = await import('../lib/rotation.js');
const { fuelContext } = await import('../lib/fuelContext.js');
const { createVoiceProposal } = await import('../lib/voiceActions.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { valsRecipes } = await import('../../src/vals/valsRecipes.js');
const { valsFuelSummary } = await import('../../src/vals/valsFuelSummary.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

const PENDING = {
  name: 'Kinder Bueno Oats', category: 'TREATS', macros: null,
  ingredients: ['240 g oats', '2 Kinder Bueno bars'], method: ['Mix.', 'Chill overnight.'], makes: '6 jars',
};

/* ------------------------------ the format ------------------------------ */

test('every recipe that has numbers parses exactly as before: no new key, same macros, same count', () => {
  const recipes = parseRecipeCollection(RECIPE_FILE);
  assert.equal(recipes.length, 3);
  for (const r of recipes) {
    assert.ok(!('macrosPending' in r), `${r.name} carries no pending flag`);
    assert.ok(r.macros && Number.isFinite(r.macros.kcal), `${r.name} still has numbers`);
  }
  assert.deepEqual(recipes.map((r) => r.macros.kcal), [560, 115, 250]);
});

test('a pending recipe is written with the pending line and a dash row, and everything else is byte-identical', () => {
  const out = insertRecipeIntoRaw(RECIPE_FILE, PENDING);
  assert.ok(out.includes(`## 4. Kinder Bueno Oats\n\n${PENDING_MACROS_LINE}\n**Makes:** 6 jars\n`));
  assert.ok(out.includes('| Kinder Bueno Oats | — | — | — | — |\n'), 'the quick-ref row says unknown with dashes, never 0g');
  assert.ok(!/undefined|NaN|null/.test(out), 'nothing unset leaks into the file');
  // remove exactly the two inserted pieces → the original file, byte for byte
  // (TREATS is the fixture's last section, so the block runs to the end)
  const block = out.slice(out.indexOf('## 4. Kinder Bueno Oats'));
  const back = out.replace(block, '').replace('| Kinder Bueno Oats | — | — | — | — |\n', '');
  assert.equal(back, RECIPE_FILE);
  // the other three parse exactly as they did
  const before = parseRecipeCollection(RECIPE_FILE);
  const after = parseRecipeCollection(out);
  assert.deepEqual(after.filter((r) => r.id !== 'kinder-bueno-oats'), before);
  const got = after.find((r) => r.id === 'kinder-bueno-oats');
  assert.equal(got.macros, null);
  assert.equal(got.macrosPending, true);
  assert.deepEqual(got.method, ['Mix.', 'Chill overnight.']);
});

test('a heading with neither numbers nor the pending line is still dropped as a stray heading', () => {
  const stray = RECIPE_FILE.replace('# PART 2 — TREATS', '## 9. Shopping notes\n\nJust some words.\n\n# PART 2 — TREATS');
  assert.equal(parseRecipeCollection(stray).length, 3);
});

test('half a macro object is refused at the writer, never written as "undefinedg P"', () => {
  assert.throws(() => insertRecipeIntoRaw(RECIPE_FILE, { ...PENDING, macros: { p: 10, c: 5 } }), /four non-negative numbers/);
});

test('THE ROUND TRIP: add pending → load (present, pending) → edit macros → load (numbers) → the table row follows', async () => {
  const added = await addRecipe(vault, PENDING);
  assert.equal(added.macros, null);
  assert.equal(added.macrosPending, true);
  let loaded = (await loadRecipes(vault)).find((r) => r.id === 'kinder-bueno-oats');
  assert.ok(loaded, 'the loader keeps a pending recipe');
  assert.equal(loaded.macrosPending, true);

  // an ingredient edit alone leaves it pending — no zeros sneak in
  await editRecipe(vault, 'kinder-bueno-oats', { ingredients: ['240 g oats', '2 Kinder Bueno bars', '300 g yoghurt'] });
  loaded = (await loadRecipes(vault)).find((r) => r.id === 'kinder-bueno-oats');
  assert.equal(loaded.macros, null);
  assert.equal(loaded.macrosPending, true);

  // naming the current version still works on a pending recipe
  await renameCurrentVersion(vault, 'kinder-bueno-oats', 'Overnight');
  loaded = (await loadRecipes(vault)).find((r) => r.id === 'kinder-bueno-oats');
  assert.equal(loaded.versionLabel, 'Overnight');
  assert.equal(loaded.macrosPending, true);

  // he makes it and enters the numbers
  await editRecipe(vault, 'kinder-bueno-oats', { macros: { p: 21, c: 48, f: 12, kcal: 384 } });
  loaded = (await loadRecipes(vault)).find((r) => r.id === 'kinder-bueno-oats');
  assert.deepEqual(loaded.macros, { p: 21, c: 48, f: 12, kcal: 384 });
  assert.ok(!('macrosPending' in loaded), 'no longer pending');
  const raw = await readFile(FILE, 'utf8');
  assert.ok(raw.includes('| Kinder Bueno Oats | 21g | 48g | 12g | 384 |'), 'the dash row became the real numbers');
  assert.ok(!raw.includes('— | — | — | — |'), 'no dash row is left behind');
  assert.ok(!raw.includes('not set yet'), 'the pending line is gone');
  assert.equal(loaded.ingredients.length, 3);

  await removeRecipe(vault, 'kinder-bueno-oats');
  assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE, 'removing it leaves the file exactly as it was');
});

test('updateQuickRefRow finds a dash row by name', () => {
  const out = updateQuickRefRow('| Kinder | — | — | — | — |\n', 'Kinder', { p: 1, c: 2, f: 3, kcal: 29 });
  assert.equal(out, '| Kinder | 1g | 2g | 3g | 29 |\n');
});

/* ------------------------------ the rotation ----------------------------- */

test('a pending recipe is refused a rotation slot, plainly, at every door', async () => {
  await addRecipe(vault, PENDING);
  const recipes = await loadRecipes(vault);
  await assert.rejects(() => addSlotOption(vault, recipes, 'snack', 'kinder-bueno-oats'), /Add its macros first — the plan can't count it without them/);
  await assert.rejects(() => setRotationSlot(vault, recipes, 'snack', 'kinder-bueno-oats'), /Add its macros first/);
  const rot = await loadRotation(vault, recipes);
  assert.ok(!(rot.options.snack || []).some((d) => d.id === 'kinder-bueno-oats'), 'nothing was written');
  // a real recipe still goes in
  await addSlotOption(vault, recipes, 'snack', 'yopro-yogurt');
  // and a pending dish already in a slot (a hand-edited file) can't be ticked
  // eaten, while totals skip it rather than counting a zero
  const handEdited = recipes.map((r) => (r.id === 'yopro-yogurt' ? { ...r, macros: null, macrosPending: true } : r));
  await assert.rejects(() => setOptionEaten(vault, handEdited, 'snack', 'yopro-yogurt', true), /Add its macros first/);
  const resolved = await loadRotation(vault, handEdited);
  const dish = resolved.options.snack.find((d) => d.id === 'yopro-yogurt');
  assert.equal(dish.macros, null);
  assert.equal(dish.macrosPending, true);
  assert.ok(Number.isFinite(resolved.totals.kcal));
});

/* ---------------------------- the agent context --------------------------- */

test('agents see a pending recipe listed as "macros not set", never a 0, and are told not to count it', async () => {
  const text = await fuelContext(vault);
  assert.match(text, /Kinder Bueno Oats \(macros not set\)/);
  assert.doesNotMatch(text, /Kinder Bueno Oats \(0P/);
  assert.match(text, /1 of those has its macros NOT SET/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

/* ------------------------ the voice and inbox rails ----------------------- */

test('a recipe drafted in conversation with no macros at all files as pending; approve writes it, undo removes it', async () => {
  const out = await createVoiceProposal(vault, 'add a matcha loaf, I have no macros', {
    kind: 'recipe', name: 'Matcha Loaf', category: 'TREATS', ingredients: ['200 g flour', '2 tsp matcha'], method: ['Bake.'],
  });
  assert.equal(out.title, 'Recipe: Matcha Loaf — macros not set');
  await approveRecord(vault, out.recordId);
  const loaf = (await loadRecipes(vault)).find((r) => r.name === 'Matcha Loaf');
  assert.equal(loaf.macros, null);
  assert.equal(loaf.macrosPending, true);
  await undoRecord(vault, out.recordId);
  assert.ok(!(await loadRecipes(vault)).some((r) => r.name === 'Matcha Loaf'));
  // three of four numbers is still a half-guess, and still refused
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'recipe', name: 'X', ingredients: ['a'], macros: { p: 1, c: 2, f: 3 } }), /sensible calorie number/);
});

/* --------------------------- the Fuel view models -------------------------- */

const LIVE = [
  { id: 'chicken-rice', name: 'Chicken rice', category: 'CORE DAILY MEALS', macros: { p: 45, c: 60, f: 12, kcal: 520 }, ingredients: [], method: [], alternates: [], notes: [] },
  { id: 'kinder-bueno-oats', name: 'Kinder Bueno Oats', category: 'TREATS', makes: '6 jars', macros: null, macrosPending: true,
    ingredients: [{ qty: '', name: '240 g oats' }], method: ['Mix.'], alternates: [], notes: [], description: null },
];
function runVals(state = {}) {
  const calls = [];
  const app = new Proxy({
    state: {
      novaStyle: 'summary', screen: 'recipes', connectionStatus: 'connected',
      recipeFilter: 'All', liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {}, recipeChat: [],
      foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodPortionCustom: '',
      liveRecipes: LIVE, liveRecipesEmpty: false, liveRecipeProfile: { proteinFloorG: 160, targetKcal: 2600 },
      liveFoodLog: { date: '2026-09-29', entries: [] }, liveRotation: { order: ['breakfast', 'lunch', 'dinner', 'snack'], slots: {}, options: {}, totals: { p: 0, c: 0, f: 0, kcal: 0 }, consumedTotals: { p: 0, c: 0, f: 0, kcal: 0 } },
      ...state,
    },
    recipes: [],
  }, { get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, ...args]); }) });
  const ctx = { demoMode: false, isOffline: false };
  const v = { ...valsRecipes(app, ctx), foodLogDays: [], summary: true };
  return { v, F: valsFuelSummary(app, ctx, v).fuelSummary, calls };
}

test('the recipe card: pending in gold words, no numbers, no bars, no Log — and nothing reads NaN or 0', () => {
  const { v } = runVals();
  const card = v.recipeList.find((r) => r.name === 'Kinder Bueno Oats');
  assert.equal(card.macrosPending, true);
  assert.equal(card.p, null);
  assert.equal(card.kcal, null);
  assert.equal(card.pBar, null);
  assert.equal(card.logIt, null, 'logging it would log zeros — the card offers no Log');
  assert.doesNotMatch(JSON.stringify(card), /NaN|undefined/);
  const real = v.recipeList.find((r) => r.name === 'Chicken rice');
  assert.equal(real.kcal, 520);
  assert.equal(typeof real.logIt, 'function');
});

test('"fits what is left" leaves a pending recipe out — it fits nothing until it has numbers', () => {
  const { v } = runVals({ recipeFitsOnly: true });
  assert.deepEqual(v.recipeList.map((r) => r.name), ['Chicken rice']);
});

test('the recipe overlay: "not set", Add macros opens the editor with blank fields, Log waits, no tweak', () => {
  const { v, calls } = runVals({ openRecipeId: 'kinder-bueno-oats' });
  assert.equal(v.orMacrosPending, true);
  assert.equal(v.orLogActive, null);
  assert.equal(v.orShowTweak, false);
  assert.equal(typeof v.orAddMacros, 'function');
  v.orAddMacros();
  const seed = calls.find(([k]) => k === 'startRecipeEdit')[1];
  assert.equal(seed.macros, null);
  assert.equal(seed.pending, true, 'four blank fields keep it unset rather than saving zeros');
  assert.equal(seed.servings, 6, 'servings read from "6 jars" for the label helper');
  // a recipe with numbers is untouched by all of this
  const real = runVals({ openRecipeId: 'chicken-rice' }).v;
  assert.equal(real.orMacrosPending, false);
  assert.equal(real.orAddMacros, null);
  assert.equal(typeof real.orLogActive, 'function');
});

test('the summary idiom: the row says "Macros not set", the sheet offers Add macros, and Log it waits', () => {
  const { F } = runVals();
  const row = F.recipesPage.rows.find((r) => r.name === 'Kinder Bueno Oats');
  assert.equal(row.pending, true);
  assert.equal(row.sub, 'Macros not set · 6 jars');
  assert.equal(row.p, null);
  assert.equal(row.kcal, null);
  const S = runVals({ openRecipeId: 'kinder-bueno-oats' }).F.recipeSheet;
  assert.ok(S, 'the sheet builds for the open recipe');
  assert.equal(S.macros, null, 'no four figures to draw');
  assert.equal(S.log, null, 'Log it waits for the numbers');
  assert.equal(typeof S.pending.add, 'function');
  assert.equal(S.tweak, null);
  const real = runVals({ openRecipeId: 'chicken-rice' }).F.recipeSheet;
  assert.equal(real.pending, null);
  assert.equal(typeof real.log, 'function');
});
