// WHEN CLAUDE IS NOT AVAILABLE (18 Oct 2026). His usage sometimes runs out;
// three flows used to fail with nothing kept. Each now keeps his input and
// does what code can without a model:
//   1. a recipe page with a complete schema.org block is filed by code alone
//      (macros only from the page's own nutrition, never invented); a page
//      that needs the model keeps its link on a retryable record;
//   2. a link or pasted text for the weave is kept on a retryable record;
//   3. recipe photos are kept as a draft recipe "needs reading".
// Temp data dir, temp vault and a failing CLAUDE_BIN stub BEFORE any import:
// nothing here touches his real server/data or the live server.
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-fallback-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-fallback-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
const stub = path.join(dataDir, 'claude-fail.sh');
await writeFile(stub, '#!/bin/sh\necho "You have hit your session limit" >&2\nexit 1\n', 'utf8');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { RECIPE_FILE } from './fixtures.js';

const { recipeFromLd, pageAsCaption, startRecipeImport, retryRecipeImport } = await import('../lib/recipeFromPage.js');
const { setLanePref } = await import('../lib/modelPrefs.js');
const { loadRecipes, RECIPES_REL_PATH } = await import('../lib/recipes.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { retryRecord } = await import('../lib/inbox.js');
const { ingestRouter } = await import('../routes/ingest.js');
const { recipesRouter } = await import('../routes/recipes.js');
const { retryRecipeScan, NEEDS_READING } = await import('../lib/scanRecipe.js');
const { _setImageFetchForTests } = await import('../lib/recipeFromVideo.js');

_setImageFetchForTests(async () => { throw new Error('no network in tests'); });
await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, RECIPES_REL_PATH), RECIPE_FILE.replace('# PART 2', '# PART 3 — ROTATION / SWAP MEALS\n\n---\n\n# PART 2'), 'utf8');
await writeFile(path.join(vault, 'CLAUDE.md'), '# vault\n', 'utf8');

test.after(async () => {
  _setImageFetchForTests(null);
  await new Promise((r) => setTimeout(r, 300));
  for (const d of [dataDir, vault]) await rm(d, { recursive: true, force: true }).catch(() => {});
});

const page = (ld) => `<html><head><title>Pot</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
const COMPLETE = {
  '@type': 'Recipe', name: 'Lentil Dal', recipeYield: '4 servings', prepTime: 'PT10M', cookTime: 'PT30M',
  recipeIngredient: ['200 g red lentils', '1 onion, diced', '1 tsp turmeric'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Fry the onion.' }, { '@type': 'HowToStep', text: 'Simmer the lentils.' }],
};
const WITH_NUTRITION = { ...COMPLETE, name: 'Lentil Dal Counted', nutrition: { calories: '420 calories', proteinContent: '22 g', carbohydrateContent: '60 g', fatContent: '8 g' } };

const setLane = (id, enabled) => setLanePref(id, { enabled });
async function waitFor(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 100)); }
}
function serve(router) {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', router);
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/api` }));
  });
}

test('recipeFromLd: a complete block reads without a model; an incomplete one hands over', () => {
  const r = recipeFromLd(COMPLETE).recipes[0];
  assert.equal(r.name, 'Lentil Dal');
  assert.equal(r.servings, 4);
  assert.equal(r.prepMin, 10);
  assert.equal(r.cookMin, 30);
  assert.equal(r.ingredients.length, 3);
  assert.equal(r.method.length, 2);
  assert.equal(r.statedPerServing, null, 'no nutrition on the page, so none is invented');
  assert.equal(recipeFromLd({ ...COMPLETE, recipeInstructions: [] }), null);
  assert.equal(recipeFromLd({ ...COMPLETE, recipeIngredient: [] }), null);
  assert.equal(recipeFromLd(null), null);
  const n = recipeFromLd(WITH_NUTRITION).recipes[0].statedPerServing;
  assert.deepEqual(n, { kcal: 420, p: 22, c: 60, f: 8 });
  assert.ok(pageAsCaption(page(COMPLETE), 'https://x.test/dal').parsed);
  assert.equal(pageAsCaption('<html><body>nothing</body></html>', 'https://x.test/y').parsed, null);
});

test('1. a complete page is filed by code with the model switched OFF and the CLI failing', async () => {
  await setLane('recipe-video', false);
  const rec = await startRecipeImport(vault, 'https://x.test/dal', '', {
    await: true, fetchCaption: async (u) => pageAsCaption(page(COMPLETE), u), pickFrame: async () => null,
  });
  const done = await getRecord(rec.id);
  assert.equal(done.status, 'filed', done.error);
  const dal = (await loadRecipes(vault)).find((r) => r.name === 'Lentil Dal');
  assert.ok(dal, 'the recipe is in the collection');
  assert.equal(dal.macros, null, 'no nutrition on the page: macros not set, never guessed');
  assert.equal(dal.servings, 4);
  const card = (await listRecords()).find((r) => r.id === done.recipeCards[0]);
  assert.equal(card.status, 'filed', 'the same card the model path files, with its undo');
  assert.equal(card.undoData.route, 'recipe');
});

test('1. the page\'s own nutrition becomes macros, and only that', async () => {
  const rec = await startRecipeImport(vault, 'https://x.test/dal2', '', {
    await: true, fetchCaption: async (u) => pageAsCaption(page(WITH_NUTRITION), u), pickFrame: async () => null,
  });
  assert.equal((await getRecord(rec.id)).status, 'filed');
  const r = (await loadRecipes(vault)).find((x) => x.name === 'Lentil Dal Counted');
  assert.deepEqual(r.macros, { p: 22, c: 60, f: 8, kcal: 420 });
});

test('1. a page with no recipe block keeps its link on a retryable record when the model is off', async () => {
  const rec = await startRecipeImport(vault, 'https://x.test/prose', '', {
    await: true, fetchCaption: async (u) => pageAsCaption('<html><body>1 cup flour, 2 eggs, mix.</body></html>', u), pickFrame: async () => null,
  });
  const kept = await getRecord(rec.id);
  assert.equal(kept.status, 'error');
  assert.match(kept.error, /Nova kept the link/);
  assert.match(kept.text, /https:\/\/x\.test\/prose/);
  // retry: the model is back (stubbed), the same record fills
  const before = (await loadRecipes(vault)).length;
  await retryRecipeImport(vault, kept, {
    await: true, pickFrame: async () => null,
    fetchCaption: async (u) => pageAsCaption('<html><body>1 cup flour</body></html>', u),
    ask: async () => ({ recipes: [{ name: 'Pancakes', servings: 2, ingredients: [{ text: '1 cup flour', name: 'flour', grams: null }], method: ['Mix.'], category: 'TREATS' }] }),
  });
  assert.equal((await getRecord(rec.id)).status, 'filed');
  assert.equal((await loadRecipes(vault)).length, before + 1);
});

test('1. retryRecord routes a kept recipe link (status error) to the recipe reader', async () => {
  await setLane('recipe-video', true);
  const rec = await startRecipeImport(vault, 'https://x.test/prose2', '', {
    await: true, fetchCaption: async (u) => pageAsCaption('<html><body>text</body></html>', u), pickFrame: async () => null,
  });
  // the CLI stub fails (usage limit): the link is kept, not lost
  assert.equal((await getRecord(rec.id)).status, 'error');
  const updated = await retryRecord(vault, rec.id);
  assert.equal(updated.status, 'classifying');
  await waitFor(async () => (await getRecord(rec.id)).status !== 'classifying');
});

test('2. the weave with the lane off answers plainly and keeps the link and the pasted text', async () => {
  await setLane('ingest', false);
  const { srv, base } = await serve(ingestRouter(vault));
  try {
    const res = await fetch(`${base}/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceUrl: 'https://example.test/talk', text: 'my own note' }) });
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.equal(j.error, "Claude isn't available right now. Nova kept the link and will weave it when you retry.");
    assert.equal(j.kept, true);
    const rec = await getRecord(j.recordId);
    assert.equal(rec.kind, 'ingest');
    assert.equal(rec.status, 'error');
    assert.equal(rec.ingestRetry.sourceUrl, 'https://example.test/talk');
    assert.equal(rec.ingestRetry.text, 'my own note');
    // retry with the lane back on: a job starts and this copy is retired
    await setLane('ingest', true);
    await retryRecord(vault, rec.id);
    const after = await getRecord(rec.id);
    assert.equal(after.status, 'discarded');
    assert.ok(after.retriedAs);
  } finally { srv.close(); }
});

test('2. a weave whose model run fails keeps its input on a retryable record', async () => {
  await setLane('ingest', true);
  const before = (await listRecords()).filter((r) => r.kind === 'ingest' && r.status === 'error').length;
  const { srv, base } = await serve(ingestRouter(vault));
  try {
    const res = await fetch(`${base}/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'pasted words to weave' }) });
    const { jobId } = await res.json();
    assert.ok(jobId);
    const job = await waitFor(async () => { const j = await (await fetch(`${base}/ingest/${jobId}`)).json(); return j.status === 'error' ? j : null; });
    await waitFor(async () => (await listRecords()).filter((r) => r.kind === 'ingest' && r.status === 'error').length > before);
    const kept = (await listRecords()).filter((r) => r.kind === 'ingest' && r.status === 'error' && r.ingestRetry?.text === 'pasted words to weave');
    assert.equal(kept.length, 1);
    assert.match(kept[0].error, /kept what you pasted/);
    assert.ok(job.error);
  } finally { srv.close(); }
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('3. recipe photos with the lane off become a draft recipe that needs reading', async () => {
  await setLane('scan-recipe', false);
  const { srv, base } = await serve(recipesRouter(vault));
  try {
    const res = await fetch(`${base}/recipes/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images: [PNG, PNG], name: 'Nan\'s lasagne' }) });
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.match(j.error, /kept your photos as a draft recipe/);
    const draft = (await loadRecipes(vault)).find((r) => r.id === j.recipeId);
    assert.equal(draft.name, 'Nan\'s lasagne');
    assert.equal(draft.macros, null);
    assert.match(draft.description, /Needs reading/);
    const rec = await getRecord(j.recordId);
    assert.equal(rec.kind, 'recipe-scan');
    assert.equal(rec.status, 'error');
    assert.equal(rec.photos.length, 2);
    for (const p of rec.photos) assert.ok(existsSync(path.join(vault, p)), 'every photo is kept');
    assert.ok(existsSync(path.join(vault, 'Wiki/Health/Recipe Photos', `${j.recipeId}.png`)), 'the first is the cover');
    assert.equal(rec.undoData.route, 'recipe', 'undo removes the draft');

    // retry reads the kept photos and fills the draft in
    await retryRecord(vault, rec.id).catch(() => {});
    await waitFor(async () => (await getRecord(rec.id)).status !== 'classifying');
    // (the CLI stub fails, so it is back to error with the draft untouched)
    assert.equal((await getRecord(rec.id)).status, 'error');
    await retryRecipeScan(vault, await getRecord(rec.id), {
      await: true,
      read: async () => ({ ingredients: ['500 g mince', '9 sheets pasta'], method: ['Layer.', 'Bake.'], macros: { p: 0, c: 0, f: 0, kcal: 0 } }),
    });
    const filled = await getRecord(rec.id);
    assert.equal(filled.status, 'filed');
    const r2 = (await loadRecipes(vault)).find((r) => r.id === j.recipeId);
    assert.equal(r2.ingredients.length, 2);
    assert.equal(r2.macros, null, 'no macros read, none invented');
    assert.ok(!String(r2.description || '').includes(NEEDS_READING));
  } finally { srv.close(); }
});

test('3. a failed read (CLI error) keeps the photos and the poll says so', async () => {
  await setLane('scan-recipe', true);
  const { srv, base } = await serve(recipesRouter(vault));
  try {
    const res = await fetch(`${base}/recipes/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images: [PNG] }) });
    const { jobId } = await res.json();
    assert.ok(jobId);
    const job = await waitFor(async () => { const j = await (await fetch(`${base}/recipes/scan/${jobId}`)).json(); return j.status === 'error' ? j : null; });
    assert.match(job.error, /kept your photos as a draft recipe/);
    assert.ok(job.kept.recipeId);
    assert.ok((await loadRecipes(vault)).some((r) => r.id === job.kept.recipeId));
  } finally { srv.close(); }
});

test('label macros with the lane off say the photos are still on screen', async () => {
  await setLane('scan-food-label', false);
  const { srv, base } = await serve(recipesRouter(vault));
  try {
    const res = await fetch(`${base}/recipes/label-macros`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servings: 2, labels: [{ image: PNG, grams: 100, name: 'oats' }] }) });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /still on this screen/);
  } finally { srv.close(); await setLane('scan-food-label', true); }
});
