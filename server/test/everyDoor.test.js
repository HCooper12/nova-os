// EVERY DOOR, ONE NOVA — 1 Oct 2026. His words: "Nova needs to perform
// exactly like Siri, Claude, ChatGPT etc. Where it doesn't matter the way
// that I speak with it and where I speak with it but you can perform every
// single function and action that is capable within the platform … such as
// adding links and telling it to add it to my recipe vault, asking it to
// research and capture something, ask it to analyse the video which would
// then be delegated to the watcher agent etc."
//
// What this pins:
//   1. the jobs are verbs in the one registry, and the model's catalogue is
//      GENERATED from it (describeForModel), never hand-written;
//   2. what a link IS is decided by one pure module (src/linkKind.js), shared
//      by the server and the client's lane chip;
//   3. his examples reach their lanes through the ONE path every door uses —
//      the ask lane (/api/ask from the thread, the tab bar's Nova and the
//      classic screen; /api/ask/sync from Siri and the Action Button) — by
//      the strict grammar and by the model's ACT line alike;
//   4. every job's receipt carries an undo that withdraws it honestly;
//   5. the hold on the tab bar's Nova opens the core, listening.
//
// No real job ever starts: every lane is injected (_setJobLanesForTests),
// CLAUDE_BIN is a stub and NOVA_DATA_DIR a temp dir, both set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-everydoor-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const argv = process.argv.slice(2);
const reply = (text) => {
  if (/MODEL_ANALYSE/.test(text)) return 'Analysing it properly now.\\nACT {"verb":"video.analyse","args":{"url":"https://youtu.be/Zx9QpL0aB1c"}}';
  if (/MODEL_RESEARCH/.test(text)) return 'On it.\\nACT {"verb":"research.run","args":{"question":"Is creatine timing important?"}}';
  if (/MODEL_RECIPE/.test(text)) return 'Saving it.\\nACT {"verb":"recipe.import","args":{"url":"https://www.instagram.com/reel/DcAbCdEfGh/"}}';
  return 'A plain answer.';
};
if (argv.includes('--input-format')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let text = '';
    try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
    const out = reply(text);
    process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
  });
} else {
  const prompt = argv[argv.indexOf('-p') + 1] || '';
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: reply(prompt) }));
}
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-everydoor-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-everydoor-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const { VERB_IDS, describeForModel, parseCommand, tryCommand, runVerb, verbFor } = await import('../lib/verbs.js');
const { _setJobLanesForTests, parseJobCommand, screenFor } = await import('../lib/verbJobs.js');
const { classifyLink, isRecipePage } = await import('../../src/linkKind.js');
const { findRecipeLd, recipeTextFromLd, pageAsCaption, isoMinutes, startRecipeImport } = await import('../lib/recipeFromPage.js');
const { routeIntent } = await import('../lib/intentRouter.js');
const { captureLane } = await import('../lib/inbox.js');
const { createRecord, getRecord, listRecords } = await import('../lib/inboxStore.js');
const { startAskNova, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { voiceRouter } = await import('../routes/voice.js');
const { setLanePref } = await import('../lib/modelPrefs.js');

const NEW_VERBS = ['capture.add', 'link.file', 'recipe.import', 'video.watch', 'video.analyse', 'research.run', 'briefing.start', 'book.add', 'repertoire.start', 'practice.prepare', 'browse.run', 'screen.open', 'quick.session', 'inbox.approve', 'inbox.undo'];

// every lane a verb can start, recorded rather than run. Each returns the
// shape the real lane returns (a record, or an ingest job id).
const calls = [];
let seq = 0;
async function fakeRecord(kind, text, status = 'classifying') {
  const r = { id: `fk${++seq}`, kind, text, source: 'test', mode: 'draft', status, createdAt: new Date(Date.now() + seq).toISOString() };
  await createRecord(r);
  return r;
}
_setJobLanesForTests({
  startCapture: async (v, opts) => { calls.push(['capture', opts.text]); return fakeRecord(undefined, opts.text, 'pending'); },
  startRecipeImport: async (v, url, prose) => { calls.push(['recipe', url, prose]); return fakeRecord('recipe-video', `Recipe from: ${url}`); },
  startVideoWatch: async (v, url, q, opts) => { calls.push(['watch', url, q, opts?.model || null]); return fakeRecord('video', `Watch: ${url}`); },
  startWeave: async (v, url) => { calls.push(['weave', url]); return 'ing1'; },
  startBook: async (v, book) => { calls.push(['book', book.title, book.author]); return 'ing2'; },
  getIngestJob: async (id) => ({ id, status: id === 'ing1' ? 'running' : 'ready' }),
  discardIngestJob: async (id) => { calls.push(['discard-ingest', id]); },
  startResearch: async (v, q, opts) => { calls.push(['research', q, opts?.model || null]); return fakeRecord('research', `Research: ${q}`); },
  enqueueOvernight: async (item) => { calls.push(['overnight', item.question]); return { id: 'ov1' }; },
  removeOvernightItem: async (id) => { calls.push(['overnight-remove', id]); },
  startBriefing: async (v, o) => { calls.push(['briefing', o.topic]); return fakeRecord('briefing', `Briefing: ${o.topic}`); },
  startStudy: async (v, o) => { calls.push(['study', o.urls[0]]); return fakeRecord('study', 'Study'); },
  startRepertoire: async (v, o) => { calls.push(['repertoire', o.url]); return fakeRecord('repertoire', 'Repertoire'); },
  resolvePracticeAsk: async (v, text) => (/sam/i.test(text) ? { slug: 'hard-talk', title: 'The hard conversation', scenario: null } : null),
  startPrepare: async (v, o) => { calls.push(['prepare', o.text]); return fakeRecord('practice-skill', 'Practice'); },
  startBrowse: async (v, task) => { calls.push(['browse', task]); return fakeRecord('browse', task); },
});
const take = () => calls.splice(0, calls.length);

function serve() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test.after(() => { _dropAllWarm(); _setJobLanesForTests(null); });

const REEL = 'https://www.instagram.com/reel/DcAbCdEfGh/';
const PAGE = 'https://www.recipetineats.com/chicken-stir-fry/';
const YT = 'https://youtu.be/Zx9QpL0aB1c';

// ---------------------------------------------------------------- 1. registry

test('the registry lists every new verb, each with an args contract, a tier and a run; describeForModel generates them all', () => {
  const catalogue = describeForModel();
  for (const id of NEW_VERBS) {
    assert.ok(VERB_IDS.includes(id), `${id} is in the registry`);
    const v = verbFor(id);
    assert.ok(v.args && typeof v.args === 'object', `${id} has an args contract`);
    assert.ok(['act', 'confirm'].includes(v.tier), `${id} has a tier`);
    assert.equal(typeof v.run, 'function', `${id} has a run`);
    // an undo for everything that writes; the screen and the quick session
    // write nothing, and inbox.undo has no redo (said, not faked)
    if (!['screen.open', 'quick.session', 'inbox.undo'].includes(id)) assert.equal(typeof v.undo, 'function', `${id} has an undo`);
    assert.match(catalogue, new RegExp(`ACT \\{"verb":"${id.replace('.', '\\.')}"`), `${id} is in the generated catalogue`);
  }
  // and the ask prompt carries that catalogue, generated, not hand-written
  assert.match(read('server/lib/claudeCode.js'), /The verbs:\n\$\{describeForModel\(\)\}/);
});

// ---------------------------------------------------------- 2. the classifier

test('the link classifier: recipe reel, recipe page, video, channel, article', () => {
  const k = (u, w = '') => classifyLink(u, w).kind;
  // a reel is a recipe only when his words ask for one
  assert.equal(k(REEL, 'add this to my recipes'), 'recipe-reel');
  assert.equal(k('https://vt.tiktok.com/ZS6abc/', 'save this into my recipe bank'), 'recipe-reel');
  assert.equal(k(REEL), 'video');
  assert.equal(k(REEL, 'is this recipe any good?'), 'video', 'a question about a recipe is not a request to keep it');
  // a recipe page by its address alone: a recipe site, or a /recipe/ path
  assert.equal(k(PAGE), 'recipe-page');
  assert.equal(k('https://www.taste.com.au/recipes/chicken-satay/abc123'), 'recipe-page');
  assert.equal(k('https://someblog.net/2026/09/my-best-banana-bread-recipe/'), 'recipe-page');
  assert.equal(k('https://someblog.net/2026/09/banana-bread/', 'add this to my recipes'), 'recipe-page', 'any page he asks to keep as a recipe');
  // videos and bodies of work
  assert.equal(k(YT), 'video');
  assert.equal(k('https://www.youtube.com/watch?v=sxn5kPQ4Gl0&si=x'), 'video');
  assert.equal(k('https://www.youtube.com/shorts/abc'), 'video');
  assert.equal(k('https://www.youtube.com/@hubermanlab'), 'channel');
  assert.equal(k('https://www.tiktok.com/@someone'), 'channel');
  // everything else is a page to read or keep
  assert.equal(k('https://www.theatlantic.com/health/archive/2026/09/sleep/'), 'article');
  assert.equal(k('not a link'), null);
  assert.equal(classifyLink(`${PAGE},`).url, PAGE, 'trailing punctuation is not part of the link');
  assert.equal(isRecipePage(YT), false, 'a video host is never a recipe page');
});

test('the router and the capture path learned the recipe page; the client chip reads the same module', () => {
  assert.equal(routeIntent(PAGE).lane, 'recipe', 'a bare recipe page goes to the recipe bank');
  assert.equal(routeIntent(`save this to my recipes ${'https://someblog.net/banana-bread/'}`).lane, 'recipe');
  assert.equal(routeIntent(`${PAGE} is this healthy?`).lane, 'research', 'a question about it is read, not imported');
  assert.equal(captureLane(PAGE)?.lane, 'recipe');
  // the old lanes are untouched
  assert.equal(routeIntent(`${YT} watch this`).lane, 'watch');
  assert.equal(routeIntent(`${REEL} add this to my recipes`).lane, 'recipe');
  const app = read('src/App.jsx');
  assert.match(app, /import \{ classifyLink, RECIPE_WORDS_RE \} from '\.\/linkKind\.js';/);
  assert.match(app, /return L\('recipe', 'RECIPE', /);
  assert.match(read('server/lib/intentRouter.js'), /from '\.\.\/\.\.\/src\/linkKind\.js'/);
});

test('a recipe page is read from its schema.org Recipe block by code', () => {
  const html = `<html><head><title>Chicken Stir Fry | RecipeTin Eats</title>
<meta property="og:site_name" content="RecipeTin Eats"><meta property="og:image" content="https://img.example/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},{"@type":["Recipe"],"name":"Chicken Stir Fry",
"recipeYield":["4","4 servings"],"prepTime":"PT15M","cookTime":"PT1H5M","image":[{"url":"https://img.example/dish.jpg"}],
"recipeIngredient":["500 g chicken thigh","2 tbsp soy sauce","1 &amp; 1/2 cups rice"],
"recipeInstructions":[{"@type":"HowToStep","text":"Slice the chicken."},{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Stir fry <b>hot</b>."}]}],
"nutrition":{"calories":"520 kcal","proteinContent":"42 g","carbohydrateContent":"55 g","fatContent":"12 g"}}]}</script></head><body>…</body></html>`;
  const ld = findRecipeLd(html);
  assert.equal(ld.name, 'Chicken Stir Fry');
  assert.equal(isoMinutes('PT1H5M'), 65);
  assert.equal(isoMinutes('nonsense'), null);
  const r = recipeTextFromLd(ld);
  assert.match(r.text, /Ingredients:\n- 500 g chicken thigh\n- 2 tbsp soy sauce\n- 1 & 1\/2 cups rice/);
  assert.match(r.text, /Method:\n1\. Slice the chicken\.\n2\. Stir fry hot\./);
  assert.match(r.text, /Prep time: 15 minutes\nCook time: 65 minutes/);
  assert.match(r.text, /protein 42 g/);
  assert.equal(r.image, 'https://img.example/dish.jpg');
  const cap = pageAsCaption(html, PAGE);
  assert.equal(cap.medium, 'page');
  assert.equal(cap.structured, true);
  assert.equal(cap.uploader, 'RecipeTin Eats');
  // no Recipe block: the readable words go to the model, which says if none
  const plain = pageAsCaption('<html><title>Notes</title><script>var x=1</script><p>Mix 200 g flour.</p></html>', 'https://x.net/a');
  assert.equal(plain.structured, false);
  assert.match(plain.caption, /Mix 200 g flour\./);
  assert.doesNotMatch(plain.caption, /var x/);
});

test('startRecipeImport picks the reader from the link: a page never reaches yt-dlp', async () => {
  const seen = [];
  const deps = {
    createRecord: async (r) => { seen.push(['record', r.kind]); return r; },
    updateRecord: async () => {},
    fetchCaption: async (u) => { seen.push(['caption', u]); return { title: 't', uploader: 'u', caption: '', thumbnail: null }; },
    ask: async () => ({ recipes: [], notFound: 'test' }),
    await: true,
  };
  await startRecipeImport(vault, PAGE, 'add to my recipes', { ...deps, fetchTranscript: async () => { seen.push(['transcript']); return ''; } });
  assert.deepEqual(seen.slice(0, 2), [['record', 'recipe-video'], ['caption', PAGE]]);
  await assert.rejects(() => startRecipeImport(vault, 'https://www.youtube.com/@hubermanlab', ''), /whole channel/);
});

// -------------------------------------------------------------- 3. the grammar

test('the grammar: his examples parse to the right verbs; the neighbours keep theirs', () => {
  const p = (t) => parseCommand(t);
  assert.deepEqual(p(`add this to my recipes: ${REEL}`), { verb: 'recipe.import', args: { url: REEL, words: 'add this to my recipes' } });
  assert.deepEqual(p(`Add this to my recipe bank ${PAGE}`), { verb: 'recipe.import', args: { url: PAGE, words: 'Add this to my recipe bank' } });
  assert.deepEqual(p(`analyse this video ${YT}`), { verb: 'video.analyse', args: { url: YT } });
  assert.deepEqual(p('research creatine timing and capture it'), { verb: 'research.run', args: { question: 'creatine timing' } });
  assert.deepEqual(p('capture this: the drone shot for the opener'), { verb: 'capture.add', args: { text: 'the drone shot for the opener' } });
  assert.deepEqual(p('remember that the gate code is 4411'), { verb: 'capture.add', args: { text: 'the gate code is 4411' } });
  assert.deepEqual(p(PAGE), { verb: 'link.file', args: { url: PAGE } }, 'a bare recipe page is filed, and code decides it is a recipe (straight in since 3 Oct)');
  assert.deepEqual(p(REEL), { verb: 'link.file', args: { url: REEL } }, 'a bare reel: the capture path reads its caption first');
  assert.deepEqual(p(`${YT} what does this claim?`), { verb: 'video.watch', args: { url: YT, question: 'what does this claim?' } });
  assert.equal(p('brief me on zone 2 training').verb, 'briefing.start');
  assert.deepEqual(p('add the book Atomic Habits by James Clear'), { verb: 'book.add', args: { title: 'Atomic Habits', author: 'James Clear' } });
  assert.deepEqual(p('open fuel'), { verb: 'screen.open', args: { screen: 'fuel' } });
  assert.deepEqual(p('build me a 30 minute session for legs'), { verb: 'quick.session', args: { minutes: 30, note: 'legs' } });
  assert.deepEqual(p('approve that'), { verb: 'inbox.approve', args: { card: 'latest' } });
  assert.deepEqual(p('undo that'), { verb: 'inbox.undo', args: { card: 'latest' } });
  // his 4 Sep case stays the Watcher's triage: "analyse" must OPEN the sentence
  assert.equal(p('https://www.youtube.com/watch?v=sxn5kPQ4Gl0 — watch and analyse this').verb, 'video.watch');
  // neighbours
  assert.equal(p('undo lunch').verb, 'meal.uneaten');
  assert.equal(p('add call mum to my to-do list').verb, 'todo.add');
  assert.equal(p(`remind me to watch ${YT} at 8`).any[0].verb, 'reminder.set');
  assert.equal(p('open https://github.com'), null, 'opening a link is the Mac\'s or the browser\'s');
  assert.equal(p('start a workout'), null, 'a plain workout start is not a quick session');
  assert.equal(p('remember when we talked about sleep?'), null);
  assert.equal(p('what does the evidence say about creatine?'), null, 'a question is answered, not dispatched');
  assert.equal(p('why are my steps low'), null);
  // at the Mac a bare "open notes" is the Mac's Notes app, unless he says it is Nova's
  assert.equal(parseCommand('open notes', { fromMac: true })?.any?.[0]?.verb, 'mac.open');
  assert.equal(parseCommand('open the notes tab', { fromMac: true })?.verb, 'screen.open');
  assert.deepEqual(screenFor('the shopping list'), { screen: 'shopping', label: 'Shop' });
  assert.equal(screenFor('my calendar'), null);
  assert.equal(parseJobCommand(`${YT} ${REEL}`), null, 'two links are a study or a plan, not one verb');
  // the browser hand: the app's doors start it on the device (its windows land
  // on that glass); only the door with no screen — Siri — takes it as a verb,
  // and at the Mac "open github.com" stays Clicky's
  assert.equal(parseCommand('open the diary of a ceo channel'), null);
  assert.deepEqual(parseCommand('open the diary of a ceo channel', { direct: true }), { verb: 'browse.run', args: { task: 'open the diary of a ceo channel' } });
  assert.equal(parseCommand('open github.com', { fromMac: true })?.any?.[0]?.verb, 'mac.open');
});

// ----------------------------------------------------- 4. through every door

test('"add this to my recipes: <url>" from the Nova thread (/api/ask) and from Siri (/api/ask/sync) both reach the recipe import', async () => {
  const server = await serve();
  try {
    take();
    // the thread sends its situation block in `question` and his words in `raw`
    const thread = await post(server, '/ask', { question: `[On his screen right now — Fuel.]\n\nadd this to my recipes: ${REEL}`, raw: `add this to my recipes: ${REEL}`, device: 'other' });
    assert.equal(thread.reflex, true, 'answered by code, no model');
    assert.ok(thread.acted?.recordId, 'a receipt with an id');
    assert.equal(thread.acted.undoable, true);
    assert.match(thread.text, /recipe bank/);
    assert.deepEqual(take(), [['recipe', REEL, 'add this to my recipes']], 'the reel, its capitals intact, and an add word so it goes straight in');
    const siri = await post(server, '/ask/sync', { question: `Add this to my recipes ${PAGE}` });
    assert.match(siri.text, /recipe bank/);
    assert.deepEqual(take(), [['recipe', PAGE, 'Add this to my recipes']]);
  } finally { server.close(); }
});

test('"analyse this video" reaches the deep weave from every door; by the model\'s ACT too', async () => {
  const server = await serve();
  try {
    take();
    const a = await post(server, '/ask', { question: `analyse this video ${YT}` });
    assert.equal(a.acted.ingest.jobId, 'ing1', 'the client polls the weave\'s review from this');
    assert.deepEqual(take(), [['weave', YT]]);
    const s = await post(server, '/ask/sync', { question: `Analyse this video ${YT}` });
    assert.match(s.text, /Nothing is written until you approve/);
    assert.deepEqual(take(), [['weave', YT]]);
  } finally { server.close(); }
  // the model decides when the grammar is not sure: its ACT reaches the same lane
  const jobId = startAskNova(stubDir, { question: 'MODEL_ANALYSE give that one the full treatment', context: 'ctx' });
  const job = await waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
  assert.equal(job.status, 'ready', job.error || '');
  assert.equal(job.result.acted?.ingest?.jobId, 'ing1');
  assert.doesNotMatch(job.result.text, /ACT \{/, 'the directive never reaches his screen');
  assert.deepEqual(take(), [['weave', YT]]);
});

test('"research X and capture it" reaches the Researcher — through the model-choice gate when his board asks for one, at once from Siri', async () => {
  const server = await serve();
  try {
    take();
    // his board on its default (Sonnet) for the Researcher: the gate asks first
    await setLanePref('researcher', { model: 'sonnet' });
    const gated = await post(server, '/ask', { question: 'research creatine timing and capture it' });
    assert.equal(gated.modelChoicePending?.kind, 'act');
    assert.equal(gated.modelChoicePending.verb, 'research.run');
    assert.match(gated.text, /Want Opus for/);
    assert.deepEqual(take(), [], 'nothing runs before he answers');
    // his answer comes back by name, with the model he chose
    const answered = await post(server, '/act', { verb: 'research.run', args: { ...gated.modelChoicePending.args, model: 'opus' }, gateAnswered: true });
    assert.equal(answered.acted.research.question, 'creatine timing');
    assert.deepEqual(take(), [['research', 'creatine timing', 'opus']]);
    // "keep it" sends no model: the board's runs
    await post(server, '/act', { verb: 'research.run', args: gated.modelChoicePending.args, gateAnswered: true });
    assert.deepEqual(take(), [['research', 'creatine timing', null]]);
    // Siri has nobody to answer the gate: it runs on the board's model
    const siri = await post(server, '/ask/sync', { question: 'Research creatine timing and capture it' });
    assert.match(siri.text, /Researcher is on it/);
    assert.deepEqual(take(), [['research', 'creatine timing', null]]);
    // his board already on Opus: nothing to ask
    await setLanePref('researcher', { model: 'opus' });
    const direct = await post(server, '/ask', { question: 'research creatine timing and capture it' });
    assert.ok(direct.acted?.research?.recordId);
    assert.deepEqual(take(), [['research', 'creatine timing', null]]);
  } finally { server.close(); await setLanePref('researcher', { model: 'sonnet' }); }
  // the model's ACT honours the same gate, and says the question in its reply
  const jobId = startAskNova(stubDir, { question: 'MODEL_RESEARCH timing', context: 'ctx' });
  const job = await waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
  assert.equal(job.result.modelChoicePending?.kind, 'act');
  assert.equal(job.result.modelChoicePending.args.question, 'Is creatine timing important?');
  assert.match(job.result.text, /Want Opus for/);
  assert.deepEqual(take(), []);
});

test('capture, links and the rest reach their lanes from /api/ask; Siri says plainly what it cannot show', async () => {
  const server = await serve();
  try {
    take();
    assert.match((await post(server, '/ask', { question: 'capture this: the drone shot for the opener' })).text, /Captured/);
    assert.deepEqual(take(), [['capture', 'the drone shot for the opener']]);
    await post(server, '/ask', { question: PAGE });
    assert.deepEqual(take(), [['recipe', PAGE, '']], 'a bare recipe page: imported straight in, no add word needed (3 Oct)');
    await post(server, '/ask', { question: 'https://www.youtube.com/@hubermanlab' });
    assert.deepEqual(take(), [['study', 'https://www.youtube.com/@hubermanlab']]);
    await post(server, '/ask', { question: 'save this https://www.theatlantic.com/health/sleep/' });
    assert.deepEqual(take(), [['capture', 'save this https://www.theatlantic.com/health/sleep/']]);
    await post(server, '/ask', { question: 'brief me on zone 2 training' });
    assert.deepEqual(take(), [['briefing', 'brief me on zone 2 training']]);
    const opened = await post(server, '/ask', { question: 'open fuel' });
    assert.deepEqual(opened.acted.open, { screen: 'recipes' });
    assert.equal(opened.acted.recordId, null, 'opening a screen lands no receipt');
    const practice = await post(server, '/ask', { question: "let's practise the difficult conversation with Sam" });
    assert.equal(practice.acted.open.slug, 'hard-talk');
    // Siri cannot show a screen, and says so instead of pretending
    const siri = await post(server, '/ask/sync', { question: 'open fuel' });
    assert.match(siri.text, /can't open a screen through Siri/);
    const quick = await post(server, '/ask/sync', { question: 'build me a 30 minute session' });
    assert.match(quick.text, /built on your phone/);
  } finally { server.close(); }
});

test('a photo or a file from a Shortcut rides the Siri turn: the verbs stand aside for the model', async () => {
  const server = await serve();
  try {
    take();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const out = await post(server, '/ask/sync', { question: `add this to my recipes ${REEL}`, files: [png] });
    assert.equal(out.text, 'A plain answer.', 'the model answered, with the material in front of it');
    assert.deepEqual(take(), [], 'no verb ran over an attachment');
    const bad = await post(server, '/ask/sync', { question: 'what is this', attachmentId: 'zzzz-abcdef' });
    assert.match(bad.text, /gone — send them again/);
  } finally { server.close(); }
});

// ------------------------------------------------------------------- 4b. undo

test('every job\'s receipt withdraws it honestly: a waiting draft is discarded, a running job says so', async () => {
  const { approveRecord, undoRecord } = await import('../lib/inbox.js');
  take();
  const out = await runVerb(vault, 'capture this: milk', { verb: 'capture.add', args: { text: 'milk' } });
  const receipt = await getRecord(out.acted.recordId);
  assert.equal(receipt.kind, 'act');
  assert.equal(receipt.undoData.verb, 'capture.add');
  const captured = receipt.undoData.recordId;
  await undoRecord(vault, receipt.id);
  assert.equal((await getRecord(captured)).status, 'discarded', 'the capture it started is withdrawn');
  // a job still running cannot be taken back, and the receipt says why
  const w = await runVerb(vault, 'watch', { verb: 'video.watch', args: { url: YT } }, { direct: true });
  await assert.rejects(() => undoRecord(vault, w.acted.recordId), /still running/);
  // the weave: nothing is written until his review; a running one says so
  const a = await runVerb(vault, 'analyse', { verb: 'video.analyse', args: { url: YT } });
  await assert.rejects(() => undoRecord(vault, a.acted.recordId), /still running — nothing is written until you approve/);
  // tonight's research comes off the queue
  const t = await runVerb(vault, 'research tonight', { verb: 'research.run', args: { question: 'sleep and HRV', when: 'tonight' } });
  await undoRecord(vault, t.acted.recordId);
  assert.deepEqual(take().filter((c) => c[0].startsWith('overnight')), [['overnight', 'sleep and HRV'], ['overnight-remove', 'ov1']]);
  // the Inbox by voice: approve the newest card, then undo it
  const card = await createRecord({ id: 'card-x', text: 'buy oat milk', source: 'test', mode: 'review-all', status: 'pending', createdAt: new Date(Date.now() + 99_999).toISOString(),
    decision: { route: 'act', confidence: 'high', title: 'Add oat milk', reason: 'test', payload: { verb: 'capture.add', args: { text: 'oat milk' } } } });
  const ap = await tryCommand(vault, 'approve that');
  assert.match(ap.text, /Done — "Add oat milk"/);
  assert.equal((await getRecord(card.id)).status, 'filed');
  const un = await tryCommand(vault, 'undo that');
  assert.match(un.text, /Undone/);
  void approveRecord; void listRecords;
});

// ------------------------------------------------------------- 5. the doors

test('no door is a smaller Nova: the tab bar\'s Nova runs the conversation\'s own pipeline, and only browse and code start on the device', () => {
  const app = read('src/App.jsx');
  const send = app.slice(app.indexOf('  sendLiveTalk(said) {'), app.indexOf('  takePresenceMeta() {'));
  assert.match(send, /this\.doOrb\(q\);/, 'the Nova button on another page goes through doOrb, like the thread');
  assert.doesNotMatch(send, /api\.ask\(/, 'it no longer posts to /api/ask on its own');
  // the thread's composer, its mic and the classic Voice screen all send through sendOrb → doOrb
  assert.match(read('src/vals/valsMisc.js'), /sendOrb: \(text\) => app\.doOrb\(text\),/);
  assert.match(read('src/vals/valsNovaThread.js'), /send: \(t\) => v\.sendOrb\(t\),/);
  // the chat starts on the device only what needs the device's screen
  assert.match(app, /if \(!preview \|\| !chatDispatchesHere\(preview\.lane\)\) return false;/);
  // what a verb started is followed on both reply paths
  assert.match(app, /this\.followActed\(resp\.acted\);/);
  assert.match(app, /this\.followActed\(job\.result\.acted, \{ research: false \}\);/);
  assert.match(app, /if \(mc\?\.kind === 'act'\) this\.armActGate\(mc\);/);
  // attachments: documents too, from both composers
  assert.match(read('src/screens/NovaThread.jsx'), /accept="image\/\*,video\/\*,application\/pdf/);
  assert.match(read('src/Controls.jsx'), /accept="image\/\*,video\/\*,application\/pdf/);
});

test('the dock\'s hold: the Nova page, the core in focus, the microphone open — from any page', () => {
  const app = read('src/App.jsx');
  const hold = app.slice(app.indexOf('  holdNovaCore() {'), app.indexOf('  toggleLiveText() {'));
  assert.match(hold, /this\.pendingNovaHold = \{ at: Date\.now\(\) \};/);
  assert.match(hold, /if \(this\.state\.screen === 'voice' && typeof this\.novaThreadFocus === 'function'\) \{ this\.consumeNovaHold\(\); return; \}\n    this\.navigate\('voice'\);/);
  assert.match(hold, /this\.novaThreadFocus\(\);\n[\s\S]*if \(!this\.state\.voiceScreenMic && typeof this\.novaThreadTalk === 'function'\) this\.novaThreadTalk\(\);/);
  assert.match(read('src/SummaryDock.jsx'), /onLongPress=\{v\.holdNovaCore \|\| v\.holdNovaText\}/);
  assert.match(read('src/vals/valsNovaThread.js'), /registerFocus: \(fn\) => \{ app\.novaThreadFocus = fn; if \(fn\) app\.consumeNovaHold\?\.\(\); \},/);
  // the thread registers its focus AFTER its talk, so the hold finds both
  const thread = read('src/screens/NovaThread.jsx');
  assert.ok(thread.indexOf('T.registerTalk(') < thread.indexOf('T.registerFocus('), 'talk registers first');
  // nothing is lost: the capture composer is a tap away on the Inbox's hint line
  assert.match(read('src/screens/InboxSummary.jsx'), /className="nv-sum-ib-hint" onClick=\{S\.openCapture\}/);
});
