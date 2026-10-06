// A recipe reel becomes a recipe (lib/recipeFromVideo.js). His report, 29 Sep:
// reels captured with "Add to my recipes" went to the Watcher, which never
// read the caption, and nothing reached his collection. Temp data dir before
// any import; the caption, the model and the collection are stand-ins.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-recipe-video-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-recipe-video-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

const { captionHasRecipe, macrosFor, toRecipePayload, startRecipeFromVideo, categoryFor, missingFacts, _setImageFetchForTests } = await import('../lib/recipeFromVideo.js');
const { routeIntent, RECIPE_WORDS_RE } = await import('../lib/intentRouter.js');
const { captureLane, startCapture, approveRecord, undoRecord } = await import('../lib/inbox.js');
const { createRecord, getRecord } = await import('../lib/inboxStore.js');
const { parseRecipeCollection, loadRecipes } = await import('../lib/recipes.js');

const FILE = path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md');
const PHOTOS = path.join(vault, 'Wiki/Health/Recipe Photos');
await mkdir(path.dirname(FILE), { recursive: true });
// never the network: every thumbnail in this file is this one-pixel stand-in
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
_setImageFetchForTests(async () => { throw new Error('no network in tests: inject a fetcher'); });

test.after(async () => {
  _setImageFetchForTests(null);
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

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
  // the TikTok share sheet hands over a short link (29 Sep)
  assert.equal(routeIntent('https://vt.tiktok.com/ZSabc123/ — add to my recipes').lane, 'recipe');
  assert.equal(routeIntent('https://vt.tiktok.com/ZSabc123/').lane, 'watch');
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
  // without "add" it goes straight in too (his call, 3 Oct 2026: "Every
  // recipe link should go straight in")
  created.length = 0; approved.length = 0;
  await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/x/', 'turn this into a recipe', base);
  const card2 = created.find((r) => r.decision?.route === 'recipe');
  assert.equal(card2.decision.payload.macros, null);
  assert.deepEqual(approved, [card2.id]);
  assert.match(updates.at(-1).destination, /^Recipe bank — Kinder Bueno Oats \(macros not set\)/);
  // and with no words at all
  created.length = 0; approved.length = 0;
  await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/x/', '', base);
  assert.deepEqual(approved, [created.find((r) => r.decision?.route === 'recipe').id]);
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
  // the reel is the recipe's Source now (a line in the file), not prose
  assert.deepEqual(card.decision.payload.source, { url: 'https://www.instagram.com/reel/DdTRWX9zwd4/', label: 'Sean Graham' });
  assert.equal(card.decision.payload.servings, 6);
  assert.doesNotMatch(card.decision.payload.description, /https?:/);
  assert.match(card.decision.payload.description, /creator/, 'the macros provenance sentence stays');
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
  // a twin that already has everything the reel could give → skipped as before
  const full = { id: 'protein-overnight-oats', name: 'Protein Overnight Oats', servings: 6, prepMin: 5, cookMin: 0, source: { url: 'https://x.com/a/status/1', label: 'u' } };
  await startRecipeFromVideo('/v', 'https://x.com/a/status/1', 'add to my recipes', {
    ...base, ask: async () => MODEL, loadRecipes: async () => [full],
    getPhoto: async () => ({ buffer: Buffer.from('x'), mime: 'image/png' }),
    editRecipe: async () => { throw new Error('nothing is missing: must not edit'); },
  });
  assert.match(updates.at(-1).error, /already in your collection/);
});

/* ----------------- the recipe page: times, source, photo ------------------ */

test('the payload carries servings, stated times, the reel as source and its thumbnail', async () => {
  const out = await toRecipePayload({ ...MODEL.recipes[0], prepMin: 15, cookMin: '20', servings: 6.2 }, { url: 'https://www.instagram.com/reel/x/', uploader: 'Sean Graham', thumbnail: 'https://cdn.example/t.jpg' });
  assert.equal(out.payload.servings, 6);
  assert.equal(out.payload.prepMin, 15);
  assert.equal(out.payload.cookMin, 20);
  assert.deepEqual(out.payload.source, { url: 'https://www.instagram.com/reel/x/', label: 'Sean Graham' });
  assert.equal(out.payload.photoUrl, 'https://cdn.example/t.jpg');
  // a time the video never states stays null — never estimated
  const none = await toRecipePayload({ ...MODEL.recipes[0], prepMin: null, cookMin: 'about 20' }, { url: 'https://x.com/a' });
  assert.equal(none.payload.prepMin, null);
  assert.equal(none.payload.cookMin, null);
  assert.equal(none.payload.photoUrl, null);
});

test('missingFacts: only what the recipe lacks, never a value he has', () => {
  const p = { servings: 6, prepMin: 10, cookMin: 20, source: { url: 'https://x.com/a', label: 'A' } };
  assert.deepEqual(missingFacts({ servings: null, prepMin: null, cookMin: 5, source: null }, p), {
    edit: { servings: 6, prepMin: 10, source: p.source }, fields: ['servings', 'prep time', 'source'],
  });
  assert.deepEqual(missingFacts({ servings: 4, prepMin: 0, cookMin: 0, source: { url: 'https://y' } }, p), { edit: {}, fields: [] });
});

const REEL = (name, extra = {}) => ({
  await: true,
  fetchCaption: async () => ({ title: 't', uploader: 'Sean Graham', caption: CAPTION, thumbnail: 'https://cdn.example/thumb.jpg', duration: 42 }),
  fetchTranscript: async () => '',
  ask: async () => ({ recipes: [{ ...MODEL.recipes[0], name, servings: 8, prepMin: 10, cookMin: 20, category: 'DESSERT' }] }),
  compute: async () => null,
  ...extra,
});

test('THE BACKFILL: a reel of a recipe he has fills in only what it is missing, and Undo takes exactly that back', async () => {
  await writeFile(FILE, RECIPE_FILE);
  const before = parseRecipeCollection(RECIPE_FILE).find((r) => r.id === 'protein-brownie');
  const url = 'https://www.instagram.com/reel/BROWNIE/';
  const record = await startRecipeFromVideo(vault, url, 'add to my recipes', REEL('Protein Brownie', { fetchImage: async () => PNG }));
  const job = await getRecord(record.id);
  assert.equal(job.status, 'filed');
  assert.match(job.destination, /^Updated — Protein Brownie \(photo, servings, prep time, cook time, source\)/);
  const raw = await readFile(FILE, 'utf8');
  assert.ok(raw.includes('**Macros:** 12g P / 30g C / 9g F / 250 kcal\n**Serves:** 8\n**Time:** 10 min prep · 20 min cook\n**Source:** [Sean Graham](https://www.instagram.com/reel/BROWNIE/)\n\n### Ingredients'));
  const after = parseRecipeCollection(raw).find((r) => r.id === 'protein-brownie');
  // its macros, ingredients, method and variants are exactly what they were
  assert.deepEqual({ ...after, servings: null, prepMin: null, cookMin: null, source: null }, before);
  assert.ok(existsSync(path.join(PHOTOS, 'protein-brownie.png')), 'the reel\'s thumbnail is its photo');
  assert.equal((await loadRecipes(vault)).length, 3, 'no twin was added');

  // the same reel again: nothing is missing now → skipped, file byte-identical
  const again = await startRecipeFromVideo(vault, url, 'add to my recipes', REEL('Protein Brownie', { fetchImage: async () => { throw new Error('it has a photo: must not fetch'); } }));
  assert.match((await getRecord(again.id)).error, /already in your collection/);
  assert.equal(await readFile(FILE, 'utf8'), raw);

  // Undo on the first job: the four facts and the photo go, nothing else moves
  await undoRecord(vault, record.id);
  assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE);
  assert.ok(!existsSync(path.join(PHOTOS, 'protein-brownie.png')));
});

test('a backfill never overwrites: a recipe that already has servings keeps them; a value he changed survives Undo', async () => {
  await writeFile(FILE, RECIPE_FILE);   // Chicken Burrito Bowl: Makes 4 servings
  const record = await startRecipeFromVideo(vault, 'https://www.instagram.com/reel/BOWL/', 'add to my recipes', REEL('Chicken Burrito Bowl', { fetchImage: async () => { throw new Error('CDN down'); } }));
  const job = await getRecord(record.id);
  assert.match(job.destination, /^Updated — Chicken Burrito Bowl \(prep time, cook time, source\)/, 'servings were not missing; a failed photo is simply absent');
  const bowl = (await loadRecipes(vault)).find((r) => r.id === 'chicken-burrito-bowl');
  assert.equal(bowl.servings, 4, 'his Makes count stands; the reel\'s 8 is not written');
  // he changes the cook time himself, then undoes the job
  const { editRecipe } = await import('../lib/recipes.js');
  await editRecipe(vault, 'chicken-burrito-bowl', { cookMin: 35 });
  await undoRecord(vault, record.id);
  const kept = (await loadRecipes(vault)).find((r) => r.id === 'chicken-burrito-bowl');
  assert.equal(kept.cookMin, 35, 'his own value is his');
  assert.equal(kept.prepMin, null);
  assert.equal(kept.source, null);
});

test('a new reel recipe applied at once gets its photo after it is in the file, words or none; a card waiting for his yes gets it on approve; Undo removes both', async () => {
  await writeFile(FILE, RECIPE_FILE);
  _setImageFetchForTests(async (u) => { assert.equal(u, 'https://cdn.example/thumb.jpg'); return PNG; });
  try {
    const rec = await startRecipeFromVideo(vault, 'https://www.instagram.com/reel/NEW/', 'Add to my recipes', REEL('Reel Oats'));
    const job = await getRecord(rec.id);
    assert.match(job.destination, /^Recipe bank — Reel Oats/);
    const oats = (await loadRecipes(vault)).find((r) => r.id === 'reel-oats');
    assert.equal(oats.prepMin, 10);
    assert.deepEqual(oats.source, { url: 'https://www.instagram.com/reel/NEW/', label: 'Sean Graham' });
    assert.ok(existsSync(path.join(PHOTOS, 'reel-oats.png')));
    await undoRecord(vault, job.recipeCards[0]);
    assert.ok(!(await loadRecipes(vault)).some((r) => r.id === 'reel-oats'));
    assert.ok(!existsSync(path.join(PHOTOS, 'reel-oats.png')), 'the photo Nova saved goes with it');
    assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE);

    // no words at all (a bare link): straight in as well, photo and Undo alike (3 Oct)
    const bare = await startRecipeFromVideo(vault, 'https://www.instagram.com/reel/NEW/', '', REEL('Reel Oats'));
    const bareJob = await getRecord(bare.id);
    assert.match(bareJob.destination, /^Recipe bank — Reel Oats/);
    const bareCard = await getRecord(bareJob.recipeCards[0]);
    assert.equal(bareCard.status, 'filed');
    assert.ok(existsSync(path.join(PHOTOS, 'reel-oats.png')));
    await undoRecord(vault, bareCard.id);
    assert.ok(!existsSync(path.join(PHOTOS, 'reel-oats.png')));
    assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE);

    // a recipe card still waiting for his yes (one filed before 3 Oct, or by
    // Nova's PROPOSE) carries the thumbnail URL and gets the photo on approve
    const waiting = await createRecord({
      id: 'waitoats', text: 'r', source: 'capture', mode: 'review-all', status: 'pending', createdAt: new Date().toISOString(),
      decision: { route: 'recipe', confidence: 'high', title: 'Recipe: Reel Oats', payload: { ...bareCard.decision.payload } },
    });
    assert.ok(!existsSync(path.join(PHOTOS, 'reel-oats.png')));
    await approveRecord(vault, waiting.id);
    assert.ok(existsSync(path.join(PHOTOS, 'reel-oats.png')), 'his yes saves the photo');
    await undoRecord(vault, waiting.id);
    assert.equal(await readFile(FILE, 'utf8'), RECIPE_FILE);
  } finally {
    _setImageFetchForTests(async () => { throw new Error('no network in tests: inject a fetcher'); });
  }
});

test('a thumbnail that will not download never fails the recipe', async () => {
  await writeFile(FILE, RECIPE_FILE);
  const card = await createRecord({
    id: 'photofail', text: 'r', source: 'capture', mode: 'review-all', status: 'pending', createdAt: new Date().toISOString(),
    decision: { route: 'recipe', confidence: 'high', title: 'Recipe: Failing Photo', payload: { name: 'Failing Photo', category: 'TREATS', macros: null, ingredients: ['a'], method: ['b'], photoUrl: 'https://cdn.example/gone.jpg' } },
  });
  const out = await approveRecord(vault, card.id);
  assert.equal(out.status, 'filed');
  assert.doesNotMatch(out.destination, /photo/);
  assert.ok((await loadRecipes(vault)).some((r) => r.id === 'failing-photo'));
  assert.ok(!existsSync(path.join(PHOTOS, 'failing-photo.png')));
  await undoRecord(vault, card.id);
});

/* ------------------ a bare shared link (no words at all) ------------------ */

test('THE SHARE SHEET: a bare reel whose caption is a recipe takes the recipe lane, which adds it straight in', async () => {
  const calls = [];
  const deps = {
    fetchCaption: async (u) => { calls.push(['caption', u]); return { title: 't', uploader: 'Sean Graham', caption: CAPTION }; },
    startRecipeFromVideo: async (v, u, prose, laneDeps) => { calls.push(['recipe', u, prose]); return { id: 'r1', kind: 'recipe-video', laneDeps }; },
    startVideoWatch: async (v, u) => { calls.push(['watch', u]); return { id: 'w1', kind: 'video' }; },
  };
  const out = await startCapture(vault, { text: 'https://www.instagram.com/reel/DdTRWX9zwd4/' }, deps);
  assert.equal(out.kind, 'recipe-video');
  assert.deepEqual(calls.map((c) => c[0]), ['caption', 'recipe']);
  assert.equal(calls[1][2], '', 'no words, and the lane adds it anyway (3 Oct: every recipe link goes straight in)');
  const handed = await out.laneDeps.fetchCaption();
  assert.equal(handed.caption, CAPTION, 'the caption already read is handed on, not fetched twice');
  // captureLane itself is unchanged: still pure, still "watch" for a bare link
  assert.equal(captureLane('https://www.instagram.com/reel/DdTRWX9zwd4/').lane, 'watch');
});

test('a bare link whose caption is not a recipe, cannot be read, or is too slow goes to the Watcher as before', async () => {
  const seen = [];
  const base = {
    startRecipeFromVideo: async () => { throw new Error('must not take the recipe lane'); },
    startVideoWatch: async (v, u, prose) => { seen.push(prose); return { id: 'w', kind: 'video' }; },
  };
  const vibes = await startCapture(vault, { text: 'https://www.instagram.com/reel/abc/' }, { ...base, fetchCaption: async () => ({ caption: 'so good 😍 #food' }) });
  assert.equal(vibes.kind, 'video');
  const broken = await startCapture(vault, { text: 'https://www.instagram.com/reel/abc/' }, { ...base, fetchCaption: async () => { throw new Error('login required'); } });
  assert.equal(broken.kind, 'video');
  const slow = await startCapture(vault, { text: 'https://www.instagram.com/reel/abc/' }, { ...base, captionTimeoutMs: 20, fetchCaption: () => new Promise((r) => setTimeout(() => r({ caption: CAPTION }), 500)) });
  assert.equal(slow.kind, 'video');
  // a link WITH words is routed by the words, and its caption is never fetched
  const q = await startCapture(vault, { text: 'https://www.instagram.com/reel/abc/ is this any good?' }, { ...base, fetchCaption: async () => { throw new Error('must not fetch: he wrote words'); } });
  assert.equal(q.kind, 'video');
  // a recipe caption whose lane will not start is still watched, never lost
  const off = await startCapture(vault, { text: 'https://www.instagram.com/reel/abc/' }, { ...base, fetchCaption: async () => ({ caption: CAPTION }) });
  assert.equal(off.kind, 'video');
  assert.deepEqual(seen, ['', '', '', 'is this any good?', '']);
});

test('categories are his collection\'s own sections — the first live run bounced on "DESSERTS"', () => {
  assert.equal(categoryFor('DESSERTS'), 'TREATS');
  assert.equal(categoryFor('snacks'), 'TREATS');
  assert.equal(categoryFor('BREAKFAST'), 'ROTATION / SWAP MEALS');
  assert.equal(categoryFor('TREATS'), 'TREATS');
  assert.equal(categoryFor(''), 'ROTATION / SWAP MEALS');
});

// 7 Oct, his call: "Use a clear frame of the food for the cover if it's a
// reel." Frames are sampled across the video, a vision model picks the food,
// code keeps that frame as a file; nothing picked → the cover as before.
test('frame times spread across the video, clear of its first and last seconds', async () => {
  const { frameTimes } = await import('../lib/recipeFromVideo.js');
  const t = frameTimes(40, 12);
  assert.equal(t.length, 12);
  assert.ok(t[0] >= 4 && t[11] < 39.5, JSON.stringify(t));
  assert.ok(t[11] - t[10] < t[1] - t[0], 'denser toward the end, where the finished dish is');
  assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]), 'in order');
  assert.deepEqual(frameTimes(NaN, 3), [0.5, 1, 1.5]);
});

test('pickFoodFrame keeps the frame the model chose, and returns null when it chose none', async () => {
  const { pickFoodFrame } = await import('../lib/recipeFromVideo.js');
  const { writeFile: wf, readFile: rf } = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const deps = (choice) => ({
    download: async (u) => { /* the video lands in the work dir */ },
    extract: async (input, at, file) => { await wf(file, `frame at ${at}`); },
    choose: async (frames) => { assert.equal(frames.length, 12); return choice; },
  });
  // the stub download writes no file, so stage one the way yt-dlp would
  const realDownload = (choice) => ({ ...deps(choice), download: async () => {} });
  const withVideo = (choice) => ({
    ...realDownload(choice),
    download: async () => {
      const os = await import('node:os');
      const dirs = (await import('node:fs')).readdirSync(os.tmpdir()).filter((d) => d.startsWith('nova-frames-'));
      for (const d of dirs) await wf(pathMod.join(os.tmpdir(), d, 'v.mp4'), 'video');
    },
  });
  const kept = await pickFoodFrame('https://www.instagram.com/reel/TESTFRAME/', { duration: 40 }, withVideo({ frames: [{ n: 5, food: true, complete: true, share: 0.6, text: false, hand: false, sharp: true }] }));
  assert.ok(kept && kept.includes('recipe-frames'), String(kept));
  assert.match(await rf(kept, 'utf8'), /^frame at /);
  assert.equal(await pickFoodFrame('https://www.instagram.com/reel/TESTFRAME2/', { duration: 40 }, withVideo({ frames: [{ n: 2, food: true, complete: false, share: 0.7, text: false, hand: false, sharp: true }] })), null);
  assert.equal(await pickFoodFrame('https://www.instagram.com/reel/TESTFRAME3/', { duration: 40 }, withVideo({ frames: [{ n: 99, food: true, complete: true, share: 0.7, text: false, hand: false, sharp: true }] })), null, 'an out-of-range pick is no pick');
});

test('the lane carries the kept frame as the photo, with the cover as the fallback', async () => {
  const created = [];
  await startRecipeFromVideo('/vault', 'https://www.instagram.com/reel/DdTRWX9zwd4/', 'Add to my recipes', {
    await: true,
    createRecord: async (r) => { created.push(r); return r; },
    updateRecord: async () => {},
    fetchCaption: async () => ({ title: 't', uploader: 'Sean Graham', caption: CAPTION, thumbnail: 'https://cdn.example/cover.jpg', duration: 40 }),
    fetchTranscript: async () => '',
    pickFrame: async () => '/tmp/recipe-frames/abc.jpg',
    ask: async () => MODEL,
    compute: async () => null,
    loadRecipes: async () => [],
    approve: async () => {},
  });
  const card = created.find((r) => r.decision?.route === 'recipe');
  assert.equal(card.decision.payload.photoFile, '/tmp/recipe-frames/abc.jpg');
  assert.equal(card.decision.payload.photoUrl, 'https://cdn.example/cover.jpg');
});

test('code ranks the described frames: finished, sharp, no words, food over 30%; no hand beats a hand; bigger food wins', async () => {
  const { rankFrames } = await import('../lib/recipeFromVideo.js');
  const f = (n, o = {}) => ({ n, food: true, complete: true, share: 0.5, text: false, hand: false, sharp: true, ...o });
  assert.equal(rankFrames({ frames: [f(1, { share: 0.4 }), f(2, { share: 0.7 }), f(3, { share: 0.9, hand: true })] }), 2, 'no hand beats a bigger frame with a spoon in it');
  assert.equal(rankFrames({ frames: [f(1, { text: true, share: 0.9 }), f(2, { share: 0.35 })] }), 2, 'a clean frame beats one with words');
  assert.equal(rankFrames({ frames: [f(1, { text: true, share: 0.6 }), f(2, { text: true, share: 0.3 })] }), 1, 'no clean frame: the food with a small caption beats a titled cover, if it fills 40%');
  assert.equal(rankFrames({ frames: [f(1, { share: 0.05 })] }), null, 'a person at an oven, the cookies a speck');
  assert.equal(rankFrames({ frames: [f(1, { complete: false, share: 0.8 })] }), null, 'mid-assembly');
  assert.equal(rankFrames({ frames: [f(1, { hand: true, share: 0.6 })] }), 1, 'a hand is allowed when nothing better exists');
  assert.equal(rankFrames({}), null);
});
