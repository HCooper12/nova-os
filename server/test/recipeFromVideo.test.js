// A recipe reel becomes a recipe (lib/recipeFromVideo.js). His report, 29 Sep:
// reels captured with "Add to my recipes" went to the Watcher, which never
// read the caption, and nothing reached his collection. Temp data dir before
// any import; the caption, the model and the collection are stand-ins.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-recipe-video-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { captionHasRecipe, macrosFor, toRecipePayload, startRecipeFromVideo, ADD_NOW_RE, categoryFor } = await import('../lib/recipeFromVideo.js');
const { routeIntent, RECIPE_WORDS_RE } = await import('../lib/intentRouter.js');
const { captureLane } = await import('../lib/inbox.js');

// the shape of his Kinder Bueno caption: grams, a method, per-container macros
const CAPTION = 'OVERNIGHT OATS\n\nIngredients:\n- 240g Oats\n- 700g yoghurt\n- 150g protein powder\n- 600ml water\n\nMethod:\n1. Mix.\n2. Chill.\n\nEach container = 471 calories, 48g protein, 44g carbs, 11g fats';
const MODEL = { recipes: [{ name: 'Protein Overnight Oats', servings: 6, makes: '6 containers',
  ingredients: [{ text: '240 g oats', name: 'oats', grams: 240 }, { text: '700 g yoghurt', name: 'yoghurt', grams: 700 }],
  method: ['Mix.', 'Chill.'], statedPerServing: { kcal: 471, p: 48, c: 44, f: 11 }, category: 'BREAKFAST' }] };

test('THE REPORT: his exact capture words route to the recipe lane, from the capture box too', () => {
  for (const t of ['https://www.instagram.com/reel/DdTRWX9zwd4/?stkn=x — Add to my recipes', 'https://www.instagram.com/reel/DdinpPahJUe/ — Add these recipes to my fuel']) {
    assert.equal(routeIntent(t).lane, 'recipe', t);
    assert.equal(captureLane(t).lane, 'recipe', 'the Inbox capture box diverts it too');
  }
  assert.equal(routeIntent('https://www.instagram.com/reel/abc/ is this recipe any good?').lane, 'watch', 'a question is still a verdict');
  assert.equal(routeIntent('https://www.instagram.com/reel/abc/').lane, 'watch');
  assert.ok(RECIPE_WORDS_RE.test('turn this into a recipe'));
  assert.ok(ADD_NOW_RE.test('Add to my recipes'));
});

test('a caption with quantities or an ingredient list holds a recipe; a vibe caption does not', () => {
  assert.equal(captionHasRecipe(CAPTION), true);
  assert.equal(captionHasRecipe('so good 😍 #food'), false);
});

test('macros: the creator\'s numbers when they add up, computed from weights otherwise, never guessed', async () => {
  const stated = await macrosFor(MODEL.recipes[0]);
  assert.deepEqual(stated.macros, { p: 48, c: 44, f: 11, kcal: 471 });
  assert.match(stated.source, /creator/);
  // stated numbers that do not add up are not trusted; weights are used instead
  const compute = async (rows) => ({ macros: { p: 60, c: 300, f: 30, kcal: 1710 }, unsourced: 0, rows });
  const off = await macrosFor({ ...MODEL.recipes[0], statedPerServing: { kcal: 900, p: 10, c: 10, f: 5 } }, { compute });
  assert.deepEqual(off.macros, { p: 10, c: 50, f: 5, kcal: 285 }, 'the batch divided by 6 servings');
  // no numbers and no weights → nothing
  assert.equal(await macrosFor({ name: 'x', servings: 2, ingredients: [{ name: 'a pinch of salt', grams: null }] }, { compute }), null);
});

// His ask, 29 Sep: "Ones without macros should still be added if that's what
// I ask, but added as a recipe only so I can fill in macros when I decide to
// cook/bake it." It used to be skipped; now it files with macros NOT SET —
// still nothing guessed.
test('a recipe with no computable macros is filed with its macros not set — nothing guessed', async () => {
  const out = await toRecipePayload({ name: 'Mystery Bowl', ingredients: [{ text: 'some rice', name: 'rice' }], method: ['Cook.'] }, { url: 'u', uploader: 'x', compute: async () => null });
  assert.equal(out.skip, undefined);
  assert.equal(out.payload.macros, null, 'no number was invented');
  assert.deepEqual(out.payload.ingredients, ['some rice']);
  assert.match(out.payload.description, /Macros not set/);
  // a recipe with no ingredients is still not a recipe
  const none = await toRecipePayload({ name: 'Vibes', ingredients: [] }, { url: 'u', compute: async () => null });
  assert.match(none.skip, /no ingredients/);
});

test('the lane: a reel with no macros, and he said "add" → a "macros not set" card, applied at once', async () => {
  const created = [];
  const updates = [];
  const approved = [];
  const NO_MACROS = { recipes: [{ name: 'Kinder Bueno Oats', servings: 6, ingredients: [{ text: 'some oats', name: 'oats', grams: null }, { text: 'Kinder Bueno', name: 'Kinder Bueno', grams: null }], method: ['Mix.'], statedPerServing: null, category: 'DESSERT' }] };
  const base = {
    await: true,
    createRecord: async (r) => { created.push(r); return r; },
    updateRecord: async (id, patch) => { updates.push(patch); },
    fetchCaption: async () => ({ title: 't', uploader: 'Sean Graham', caption: 'Ingredients: oats, Kinder Bueno' }),
    fetchTranscript: async () => '',
    ask: async () => NO_MACROS,
    compute: async () => { throw new Error('too few weights: must not be asked'); },
    loadRecipes: async () => [],
    approve: async (id) => { approved.push(id); },
  };
  await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/x/', 'Add to my recipes', base);
  const card = created.find((r) => r.decision?.route === 'recipe');
  assert.equal(card.decision.title, 'Recipe: Kinder Bueno Oats — macros not set');
  assert.equal(card.decision.payload.macros, null);
  assert.equal(card.decision.payload.category, 'TREATS');
  assert.deepEqual(approved, [card.id], 'he said add, so it is added — with its macros not set');
  assert.equal(updates.at(-1).status, 'filed');
  assert.match(updates.at(-1).destination, /^Recipe bank — Kinder Bueno Oats \(macros not set\)/);
  // without "add" it still files the card, waiting for his yes
  created.length = 0; approved.length = 0;
  await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/x/', 'turn this into a recipe', base);
  assert.equal(created.find((r) => r.decision?.route === 'recipe').decision.payload.macros, null);
  assert.deepEqual(approved, []);
  assert.match(updates.at(-1).destination, /^Waiting for your yes — Kinder Bueno Oats \(macros not set\)/);
});

test('the lane: caption → recipe card → applied at once because he said "add"', async () => {
  const created = [];
  const updates = [];
  const approved = [];
  const record = await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/DdTRWX9zwd4/', 'Add to my recipes', {
    await: true,
    createRecord: async (r) => { created.push(r); return r; },
    updateRecord: async (id, patch) => { updates.push({ id, ...patch }); },
    fetchCaption: async () => ({ title: 'Video by seangrahamm_', uploader: 'Sean Graham', caption: CAPTION }),
    fetchTranscript: async () => { throw new Error('must not be needed: the caption has the recipe'); },
    ask: async (prompt) => { assert.match(prompt, /Each container = 471/); return MODEL; },
    compute: async () => null,
    loadRecipes: async () => [],
    approve: async (id) => { approved.push(id); },
  });
  assert.equal(record.kind, 'recipe-video');
  const card = created.find((r) => r.decision?.route === 'recipe');
  assert.equal(card.decision.payload.name, 'Protein Overnight Oats');
  assert.deepEqual(card.decision.payload.macros, { p: 48, c: 44, f: 11, kcal: 471 });
  assert.deepEqual(card.decision.payload.ingredients, ['240 g oats', '700 g yoghurt']);
  assert.match(card.decision.payload.description, /Sean Graham — https:\/\/www\.instagram\.com\/reel\/DdTRWX9zwd4\//);
  assert.deepEqual(approved, [card.id], 'he said add, so it is added — undo still on the rails');
  const last = updates.at(-1);
  assert.equal(last.status, 'filed');
  assert.match(last.destination, /^Recipe bank — Protein Overnight Oats/);
});

test('no recipe in the video fails honestly; a recipe already in the collection is not twinned', async () => {
  const updates = [];
  const base = {
    await: true,
    createRecord: async (r) => r,
    updateRecord: async (id, patch) => { updates.push(patch); },
    fetchCaption: async () => ({ title: 't', uploader: 'u', caption: 'vibes only' }),
    fetchTranscript: async () => '',
    compute: async () => null,
    approve: async () => {},
  };
  await startRecipeFromVideo('/v', 'https://x.com/a/status/1', 'add to my recipes', { ...base, ask: async () => ({ recipes: [], notFound: 'a menu with no amounts' }), loadRecipes: async () => [] });
  assert.equal(updates.at(-1).status, 'failed');
  assert.match(updates.at(-1).error, /No recipe in that video: a menu with no amounts/);
  await startRecipeFromVideo('/v', 'https://x.com/a/status/1', 'add to my recipes', { ...base, ask: async () => MODEL, loadRecipes: async () => [{ name: 'Protein Overnight Oats' }] });
  assert.match(updates.at(-1).error, /already in your collection/);
});

test('categories are his collection\'s own sections — the first live run bounced on "DESSERTS"', () => {
  assert.equal(categoryFor('DESSERTS'), 'TREATS');
  assert.equal(categoryFor('snacks'), 'TREATS');
  assert.equal(categoryFor('BREAKFAST'), 'ROTATION / SWAP MEALS');
  assert.equal(categoryFor('TREATS'), 'TREATS');
  assert.equal(categoryFor(''), 'ROTATION / SWAP MEALS');
});
