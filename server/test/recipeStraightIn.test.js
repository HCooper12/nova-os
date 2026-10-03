// EVERY RECIPE LINK GOES STRAIGHT IN — 3 Oct 2026. His words: "Every recipe
// link should go straight in."
//
// Until then a recipe link went straight into his recipe bank only when his
// words asked for it ("add", "save"…); a bare recipe link drafted a card that
// waited for his yes. Now the recipe import adds it at once, words or none,
// and the receipt carries an Undo that takes it back out.
//
// Pinned from the two doors he named in the brief: the Nova thread (/api/ask)
// and Siri (/api/ask/sync). The real verb, the real recipe import and the
// real recipe bank run; only the page fetch and the reading model are
// stand-ins (no network, no model). NOVA_DATA_DIR and CLAUDE_BIN are set
// BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-recipein-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "A plain answer." }));\n');
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-recipein-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-recipein-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { RECIPE_FILE } from './fixtures.js';

writeFileSync(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

await import('../lib/verbs.js'); // verbs.js first: it reads the job verbs as it loads
const { _setJobLanesForTests } = await import('../lib/verbJobs.js');
const { startRecipeImport } = await import('../lib/recipeFromPage.js');
const { _setImageFetchForTests } = await import('../lib/recipeFromVideo.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');
const { loadRecipes } = await import('../lib/recipes.js');
const { voiceRouter } = await import('../routes/voice.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');

_setImageFetchForTests(async () => { throw new Error('no network in tests'); });

// the page reader and the model, stood in; everything after them is real
const PAGE_TEXT = 'Ingredients:\n- 500 g chicken thigh\n- 2 tbsp soy sauce\nMethod:\n1. Slice.\n2. Stir fry hot.';
const imports = [];
_setJobLanesForTests({
  startRecipeImport: (v, url, prose) => {
    imports.push([url, prose]);
    const name = url.includes('banana') ? 'Banana Loaf From The Page' : 'Weeknight Chicken Stir Fry';
    return startRecipeImport(v, url, prose, {
      await: true,
      fetchCaption: async () => ({ title: name, uploader: 'recipetineats.com', caption: PAGE_TEXT, thumbnail: null, duration: null, medium: 'page', structured: true }),
      fetchTranscript: async () => '',
      ask: async () => ({ recipes: [{ name, servings: 4, ingredients: [{ text: '500 g chicken thigh', name: 'chicken thigh', grams: 500 }], method: ['Slice.', 'Stir fry hot.'], category: 'DESSERT' }] }),
      compute: async () => null,
    });
  },
});
test.after(() => { _setJobLanesForTests(null); _setImageFetchForTests(null); _dropAllWarm(); });

function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};
const has = async (name) => (await loadRecipes(vault)).some((r) => r.name === name);

test('THE NOVA THREAD: a bare recipe link, no words at all, goes straight into his recipe bank, and its Undo takes it out', async () => {
  const server = await serve();
  try {
    const PAGE = 'https://www.recipetineats.com/chicken-stir-fry/';
    const out = await post(server, '/ask', { question: `[On his screen right now — Fuel.]\n\n${PAGE}`, raw: PAGE, device: 'other' });
    assert.equal(out.reflex, true, 'code answered: no model, no waiting on a yes');
    assert.match(out.text, /straight into your recipe bank/);
    assert.doesNotMatch(out.text, /yes/);
    assert.deepEqual(imports.splice(0), [[PAGE, '']], 'no recipe words were said');
    assert.ok(await has('Weeknight Chicken Stir Fry'), 'it is in the recipe bank now');
    // the import's own record says where it went, and the card was applied
    const receipt = await getRecord(out.acted.recordId);
    assert.equal(receipt.kind, 'act');
    const job = await getRecord(receipt.undoData.recordId);
    assert.match(job.destination, /^Recipe bank — Weeknight Chicken Stir Fry/);
    const card = await getRecord(job.recipeCards[0]);
    assert.equal(card.status, 'filed', 'applied at once, not pending');
    // the receipt's Undo takes the recipe back out
    await undoRecord(vault, receipt.id);
    assert.equal(await has('Weeknight Chicken Stir Fry'), false);
  } finally { server.close(); }
});

test('SIRI: "keep this" on a recipe page goes straight in from the hands-free door too', async () => {
  const server = await serve();
  try {
    const PAGE = 'https://www.taste.com.au/recipes/banana-bread/abc123';
    const out = await post(server, '/ask/sync', { question: `${PAGE} for later` });
    assert.match(out.text, /straight into your recipe bank/);
    assert.deepEqual(imports.splice(0), [[PAGE, 'for later']], 'his words ride along; they no longer decide');
    assert.ok(await has('Banana Loaf From The Page'));
    await undoRecord(vault, out.acted.recordId);
    assert.equal(await has('Banana Loaf From The Page'), false);
  } finally { server.close(); }
});
