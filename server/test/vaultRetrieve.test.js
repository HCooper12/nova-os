// RETRIEVE BY THE QUESTION (second-brain audit #1). A temp vault and data dir
// before any import; no embedder runs here, so `meaning` is exercised through
// the pure pick, and the real-vault replay lives in the session report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

const root = await mkdtemp(path.join(tmpdir(), 'nova-retrieve-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.CLAUDE_BIN = '/nonexistent/claude-must-not-run';
delete process.env.VAULT_PATH;
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });

const page = async (rel, title, body, tags = []) => {
  const full = path.join(vault, `${rel}.md`);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, matter.stringify(`# ${title}\n\n${body}\n`, { tags, created: '2026-10-06' }), 'utf8');
};
await page('Wiki/Topics/Exercise Protocols (Huberman)', 'Exercise Protocols (Huberman)', 'Session variables: 60 minutes.\n\nExercise Protocol 4: brief mobility and flexibility work, 2 to 4 times a week, for stiff hamstrings and hips.', ['huberman', 'fitness']);
await page('Wiki/Sources/Kayo Longevity Habits', "Kayo's Five Longevity Habits", 'Consider your regime and program. Effort matters and body matters and feels matter, and the habits you incorporate into a program increase a lot.', ['video', 'reel']);
await page('Wiki/Concepts/Feedback Filter', 'Feedback Filter', 'Give feedback to a colleague by separating the person from the work. A difficult conversation starts with what you saw.', ['leadership', 'communication']);
await page('Wiki/Concepts/The X-Frame', 'The X-Frame & High-Value Aesthetic Muscles', 'Frame your physique with feedback from the mirror: shoulders and lats give the frame, and a colleague at the gym can spot it.', ['hypertrophy', 'aesthetics']);
await page('Wiki/Health/Injury Log', 'Injury Log', '## Active\n\n- **Hip** (niggle): dull ache above the glutes after leg day');
await page('Wiki/Health/Workouts/2026-10-07 — Leg Day', 'Leg Day', 'Hamstrings felt stiff, flexibility poor, mobility needed.');
await page('Wiki/Health/Exercise State', 'Exercise State', 'hamstrings flexibility mobility stiff');
await page('Wiki/Journal/2026-10-10', '2026-10-10', 'Hamstrings stiff. Flexibility and mobility came up in the evening debrief, by Nova.');
await page('Raw/Original - 8fe69531', 'Original - 8fe69531', 'hamstrings stiff flexibility mobility regime program stiff stiff stiff');
await page('Wiki/Inbox/Report Mobility run', 'Report Mobility run', 'hamstrings stiff flexibility mobility regime');
await page('Wiki/Inbox/Compound vs Isolation Lifts', 'Compound vs Isolation Lifts', 'Compound lifts versus isolation for hypertrophy: the evidence on four main days.', ['inbox']);

const {
  retrievable, domainOf, queryTerms, lexicalRank, pickPages, pagesBlock, retrieveForQuestion, vaultPagesFor, meaningQuery, turnWords, RETRIEVE_CHARS, dayPagesContext, dayWords,
} = await import('../lib/vaultRetrieve.js');
const { recallIndex, _resetRecallCache } = await import('../lib/recall.js');

test.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

const STIFF = 'My body feels quite stiff and especially my upper legs/hamstrings so that it feels like more effort. I think I need to increase my flexibility. Consider how this could be incorporated into my regime/program';

test('the 10 Oct question finds the Huberman page, ahead of a page that shares only ordinary words', async () => {
  const r = await retrieveForQuestion(vault, STIFF);
  assert.equal(r.pages[0].id, 'Wiki/Topics/Exercise Protocols (Huberman)');
  assert.match(r.pages[0].excerpt, /Protocol 4/, 'the excerpt is the sentence that fits, not the page\'s first line');
  assert.equal(r.pages[0].path, 'Wiki/Topics/Exercise Protocols (Huberman).md');
});

test('what an answer may draw on: never a transcript, a log, state, an agent run or the Journal', async () => {
  const ids = (await retrieveForQuestion(vault, STIFF, { limit: 20 })).pages.map((p) => p.id);
  for (const gone of ['Raw/', 'Wiki/Journal/', 'Wiki/Health/Workouts/', 'Wiki/Health/Exercise State', 'Wiki/Inbox/Report']) {
    assert.ok(!ids.some((id) => id.startsWith(gone)), gone);
  }
  assert.ok(retrievable({ id: 'Wiki/Concepts/X' }));
  assert.ok(retrievable({ id: 'Wiki/Library/Interests' }));
  assert.ok(retrievable({ id: 'Wiki/Health/What Works For Hayden' }));
  assert.ok(retrievable({ id: 'Wiki/Inbox/Compound vs Isolation Lifts' }));
  assert.ok(!retrievable({ id: 'Wiki/Journal/2026-10-10' }), 'his authorship rule: nearly all of it is the agents\'');
  assert.ok(!retrievable({ id: 'Wiki/Inbox/Coach review — x' }));
});

test('a page is matched on what it says: words he only speaks with fetch nothing', async () => {
  assert.deepEqual(queryTerms('Show me it first so I can have a look at it'), []);
  const r = await retrieveForQuestion(vault, 'Show me it first so I can have a look at it.');
  assert.deepEqual(r.pages, []);
  assert.ok(r.skipped);
  assert.deepEqual((await retrieveForQuestion(vault, 'zzzunfindable qwertyuiop')).pages, []);
});

test('bullets count: the Injury Log keeps every entry in a list', async () => {
  const r = await retrieveForQuestion(vault, 'a dull ache in my hip above the glutes');
  assert.ok(r.pages.some((p) => p.id === 'Wiki/Health/Injury Log'));
});

test('a leadership question gets no gym page, though "frame" and "feedback" are on it', async () => {
  const r = await retrieveForQuestion(vault, 'How do I frame feedback for a difficult colleague?');
  assert.ok(r.pages.some((p) => p.id === 'Wiki/Concepts/Feedback Filter'));
  assert.ok(!r.pages.some((p) => p.id === 'Wiki/Concepts/The X-Frame'), 'tags decide the subject, not a word');
});

test('a lane held to the body gets no leadership concept; a page with no domain is judged on what it says', async () => {
  const r = await retrieveForQuestion(vault, 'How do I frame feedback for a difficult colleague?', { domain: 'body' });
  assert.ok(!r.pages.some((p) => p.id === 'Wiki/Concepts/Feedback Filter'));
  assert.equal(domainOf({ id: 'Wiki/Health/Protocols' }), 'body');
  assert.equal(domainOf({ id: 'Wiki/Concepts/A', tags: ['leadership'] }), 'mind');
  assert.equal(domainOf({ id: 'Wiki/Concepts/A', tags: ['hypertrophy'] }), 'body');
  assert.equal(domainOf({ id: 'Wiki/Inbox/A', tags: ['inbox'] }), null);
  assert.equal(domainOf({ id: 'Wiki/Sources/A', tags: ['video', 'instagram', 'training'] }), 'body', 'a reel about training is the body, though its leading tag is `video`');
});

test('his own record holds a seat on a body question', async () => {
  const pages = await recallIndex(vault);
  const terms = ['hamstrings', 'glutes', 'ache'];
  const lexical = [{ id: 'Wiki/Topics/Exercise Protocols (Huberman)' }, { id: 'Wiki/Sources/Kayo Longevity Habits' }, { id: 'Wiki/Health/Injury Log' }];
  const out = pickPages(pages, { lexical, terms, limit: 2 });
  assert.equal(out.length, 2);
  assert.equal(out[1].id, 'Wiki/Health/Injury Log');
});

test('meaning: a transcript finds the Source page that speaks for it, and the floor keeps noise out', async () => {
  await page('Wiki/Sources/We Ranked', 'We Ranked the BEST Exercises', 'Chest: seated chest press.', ['video', 'training']);
  const full = path.join(vault, 'Wiki/Sources/We Ranked.md');
  await writeFile(full, matter.stringify('# We Ranked the BEST Exercises\n\nChest: seated chest press.\n', { tags: ['video', 'training'], raw: '[[Original - 8fe69531]]' }), 'utf8');
  _resetRecallCache();
  const pages = await recallIndex(vault);
  const out = pickPages(pages, { semantic: [['Raw/Original - 8fe69531', 0.8]], terms: ['chest'] });
  assert.equal(out[0].id, 'Wiki/Sources/We Ranked');
  assert.deepEqual(pickPages(pages, { semantic: [['Wiki/Concepts/Feedback Filter', 0.6]], terms: [] }), [], 'on meaning alone a page must clear the floor');
});

test('a long dictated turn embeds as the sentence that asks', () => {
  const long = `${'I was thinking about the plan and what we said before. '.repeat(10)}Which is better for chest growth? Thanks.`;
  assert.ok(meaningQuery(long).length < 200);
  assert.match(meaningQuery(long), /Which is better for chest growth\?/);
  assert.equal(meaningQuery('short one'), 'short one');
});

test('it never makes him wait: a cold index past the budget is skipped, and warms for the next turn', async () => {
  _resetRecallCache();
  const r = await retrieveForQuestion(vault, STIFF, { ms: 0 });
  assert.deepEqual(r.pages, []);
  assert.match(r.skipped, /still loading/);
  await recallIndex(vault);
  assert.ok((await retrieveForQuestion(vault, STIFF, { ms: 50 })).pages.length, 'lexical alone answers inside the budget');
});

test('a stale index serves at once and refreshes behind', async () => {
  const pages = await recallIndex(vault);
  assert.ok(lexicalRank(pages, queryTerms(STIFF)).length);
  const served = await recallIndex(vault, { stale: true });
  assert.equal(served, pages);
});

test('the block: budgeted, plain, and absent when nothing fits', () => {
  assert.equal(pagesBlock([]), '');
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `Wiki/Concepts/P${i}`, title: `P${i}`, type: 'concept', path: `Wiki/Concepts/P${i}.md`, excerpt: 'x'.repeat(280) }));
  const block = pagesBlock(many);
  assert.ok(block.length <= RETRIEVE_CHARS);
  assert.match(block, /name the page/);
  assert.match(block, /^- "P0" \(concept, `Wiki\/Concepts\/P0\.md`\)/m);
  const kinds = pagesBlock([{ id: 'Wiki/Inbox/Brief', title: 'Brief', type: 'raw', path: 'x', excerpt: 'e' }, { id: 'Wiki/Sources/S', title: 'S', type: 'source', path: 'y', excerpt: 'e' }]);
  assert.match(kinds, /research brief/);
  assert.match(kinds, /what somebody claimed/);
});

test('a failure of any kind is an empty block, never a thrown turn', async () => {
  assert.equal(await vaultPagesFor('/nonexistent/vault', 'stiff hamstrings'), '');
  assert.equal(await vaultPagesFor(vault, ''), '');
});

test('the cache stays whole: the pages ride after his question, and the prefix before it is the same byte for byte', async () => {
  const { buildAskPrompt, buildResumedAsk } = await import('../lib/claudeCode.js');
  const question = 'q';
  const a = buildAskPrompt({ question: turnWords(question, '', 'PAGES A'), context: 'CTX' });
  const b = buildAskPrompt({ question: turnWords(question, '', 'PAGES B'), context: 'CTX' });
  assert.ok(a.indexOf('CTX') < a.indexOf('PAGES A'));
  assert.equal(a.slice(0, a.indexOf('PAGES A')), b.slice(0, b.indexOf('PAGES B')));
  assert.equal(turnWords('q', '', ''), 'q', 'no pages, the turn it was');
  assert.match(buildResumedAsk({ question: turnWords('q', '', 'PAGES') }), /q\n\nPAGES/);
});

test('the context builder holds none of this: it is the same for every question', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../lib/askContext.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /vaultRetrieve|vaultPagesFor/);
});

test('the local model gets the pages too, after everything that does not change', async () => {
  const { buildLocalAskPrompt } = await import('../lib/localAsk.js');
  const p = buildLocalAskPrompt({ today: 'TODAY LINE', vaultPages: `PAGES ${'y'.repeat(4000)}` });
  assert.ok(p.indexOf('TODAY LINE') < p.indexOf('PAGES'));
  assert.ok(p.length - p.indexOf('PAGES') < 1500, 'clipped to the small model\'s budget');
  assert.doesNotMatch(buildLocalAskPrompt({ today: 'T' }), /PAGES/);
});

test('the guidance agrees with itself: look when the vault could answer, and say which page', async () => {
  const { buildAskPrompt } = await import('../lib/claudeCode.js');
  const p = buildAskPrompt({ question: 'q', context: 'c' });
  assert.doesNotMatch(p, /don't search reflexively/);
  assert.match(p, /BE FAST, AND USE HIS VAULT/);
  assert.match(p, /name the page/);
});

test('the morning lanes get pages on the day, one set per subject, from his to-dos and his standing topics', async () => {
  await mkdir(path.join(vault, 'Wiki'), { recursive: true });
  const words = await dayWords(vault, 'flexibility hamstrings feedback colleague');
  assert.match(words, /flexibility/);
  const ctx = await dayPagesContext(vault, 'flexibility hamstrings stiff feedback colleague difficult');
  assert.match(ctx, /TODAY'S SUBJECTS/);
  assert.match(ctx, /Exercise Protocols \(Huberman\)/);
  assert.match(ctx, /Feedback Filter/, 'a day holds both subjects');
  assert.equal(await dayPagesContext(vault, ''), null);
  const { readFileSync } = await import('node:fs');
  for (const f of ['dailyReview.js', 'planToday.js']) assert.match(readFileSync(new URL(`../lib/${f}`, import.meta.url), 'utf8'), /dayPagesContext/);
});
