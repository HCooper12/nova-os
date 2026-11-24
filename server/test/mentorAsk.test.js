import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The questions, the research and the brief (lib/mentorAsk.js) with no model,
// no web and no real vault: a temp data dir set BEFORE any lib is imported, a
// temp vault, and every model call answered by `deps.ask`.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-ask-'));
process.env.NOVA_DATA_DIR = dir;
const vault = path.join(dir, 'vault');

let A; let W; let R; let P; let Q; let Rd; let MP; let T;
before(async () => {
  A = await import('../lib/mentorAsk.js');
  W = await import('../lib/mentorWeave.js');
  R = await import('../lib/mentorRegister.js');
  P = await import('../lib/mentorPeople.js');
  Q = await import('../lib/mentorQueue.js');
  Rd = await import('../lib/mentorRead.js');
  MP = await import('../lib/modelPrefs.js');
  T = await import('../lib/mentorTranscripts.js');
  (await import('../lib/spawnBoundary.js'))._setEffortSupportedForTest(true);
});
after(async () => {
  A._setAskDepsForTest(null); W._setWeaveDepsForTest(null); Q._setQueueDepsForTest(null);
  await MP.resetLanePref('mentor-brief'); await MP.resetLanePref('mentor-research');
  await (await import('../lib/modelSpend.js'))._flushSpend();
  fs.rmSync(dir, { recursive: true, force: true });
});

/* -------------------------------- fixtures --------------------------------- */

const NOW = Date.parse('2026-11-25T01:00:00Z');
const K1 = 'yt:aaaaaaaaaa1';
const K2 = 'yt:bbbbbbbbbb2';
const PAGE = 'Wiki/Mentors/Sam Host.md';

const fixtureBook = () => ({
  version: 1, personId: 'sam', name: 'Sam Host', updatedAt: null, glance: 'Calm first, then the words.',
  sources: [{ n: 1, key: K1, title: 'Rude Comments Talk', url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1', publishedAt: '2026-11-20T00:00:00.000Z', minutes: 2, people: ['Sam Host'], show: 'Test Show', page: 'Wiki/Sources/Rude Comments Talk.md', raw: 'Raw/Rude Comments Talk (Transcript).md', summary: 'S.' }],
  principles: [{ name: 'Ask first', sentence: 'Ask before you answer.', sources: [1], at: { s: 1, t: '00:30' } }],
  chapters: [],
  scripts: [{ situation: 'a rude comment', say: 'did you mean for that to sound rude', insteadOf: null, by: 'Sam Host', s: 1, t: '00:30' }],
  cards: [{ q: 'What first?', a: 'A question.', s: 1, t: '00:30' }],
  fromGuests: [],
  concepts: [{ title: 'Ask About Intent', page: 'Wiki/Concepts/Ask About Intent.md', gist: 'A question about intent. More.', sources: [1] }],
  held: [],
  raised: [
    { rid: 'R1.1', kind: 'idea', name: 'Weekly beats daily', text: 'Once a week did more than three times.', by: 'A Guest', s: 1, t: '26:18', why: 'A named study worth checking against the paper.', question: 'Does the interval change the effect?', status: 'new', at: '2026-11-22T00:00:00.000Z', batchId: 'b1' },
    { rid: 'R1.2', kind: 'idea', name: 'Kept one', text: 'Text two.', by: 'unclear', s: 1, t: '01:00', why: 'Worth a look for the reason given here.', question: '', status: 'kept', at: '2026-11-21T00:00:00.000Z', batchId: 'b1' },
    { rid: 'R1.3', kind: 'framework', name: 'In research', text: '', by: 'Sam Host', s: 1, t: '01:30', why: 'Worth a look for the reason given here.', question: 'Is it so?', status: 'research', at: '2026-11-20T00:00:00.000Z', batchId: 'b1' },
    { rid: 'R1.4', kind: 'idea', name: 'Dismissed one', text: 'Gone.', by: 'A Guest', s: 1, t: '02:00', why: 'Worth a look for the reason given here.', status: 'dismissed', at: '2026-11-19T00:00:00.000Z', batchId: 'b1' },
  ],
});

// The mentor page for fixtureBook() exactly as the code before this build
// rendered it (generated from HEAD's mentorWeave.js on 25 Nov 2026).
const GOLDEN = `---
type: mentor
person: "[[Sam Host]]"
sources_read: 1
created: 2026-11-22
updated: 2026-11-25
woven_by: mentors
---
# Sam Host

## At a glance
Calm first, then the words.

### Core principles
- **Ask first.** Ask before you answer. (in 1 of 1; S1 00:30)

## For your review
- Weekly beats daily (A Guest; S1 26:18): Once a week did more than three times. Why: A named study worth checking against the paper. Question: Does the interval change the effect?
- Kept one (S1 01:00): Text two. Why: Worth a look for the reason given here. [kept]
- In research (Sam Host; S1 01:30) Why: Worth a look for the reason given here. Question: Is it so? [research]

## Chapters
## Scripts
- Situation: a rude comment | Say: "did you mean for that to sound rude" | Instead of: none | By: Sam Host | S1 00:30

## Revision cards
- Q: What first? | A: A question. | S1 00:30

## Concepts
- [[Ask About Intent]]: A question about intent.

## Sources
- S1 | [[Rude Comments Talk]] | 2026-11-20 | https://www.youtube.com/watch?v=aaaaaaaaaa1 | 2 min
`;

// a timed transcript: a line every 30 s from 00:00 to 29:30
const TRANSCRIPT = Array.from({ length: 60 }, (_, i) => `[${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}] words at minute ${Math.floor(i / 2)} part ${i % 2}`).join('\n');

const NOTES = {
  summary: 'Sam talks about rude comments. Then silence. Then no.',
  people: [],
  ideas: [
    { name: 'Ask about intent', text: 'A question about intent makes them double back. They hear themselves.', by: 'Sam Host', at: '00:30' },
    { name: 'Silence answers', text: 'Dr. Rowan says four seconds of silence says enough. Then you move on.', by: 'Gail Rowan', at: '01:00' },
    { name: 'No goes first', text: `${'Decline first without the long excuse because nobody needs it and every extra word you add after the no only gives them a handle to argue with you about the reasons '.repeat(2)}. Second sentence.`, by: 'Sam Host', at: '1:01:30' },
    { name: 'Weekly gratitude', text: 'Once a week beat three times a week!', by: 'A Guest', at: '26:18' },
  ],
  frameworks: [{ name: 'Did you mean', useWhen: 'Someone is rude to you. It works at work too.', steps: ['Hold', 'Ask'], shape: 'steps', by: 'Sam Host', at: '00:30' }],
  scripts: [], stories: [], lines: [], references: [],
};

let asks;
const answer = (o) => ({ text: JSON.stringify(o), usd: 0.0123, answeredBy: 'claude-sonnet-4-5' });
function install(ask) {
  asks = [];
  A._setAskDepsForTest({ now: () => NOW, sleep: async () => {}, ask: async (lane, prompt, opts) => { asks.push({ lane, prompt, ...opts }); return ask(lane, prompt, opts, asks.length); } });
}

async function seed({ book = fixtureBook(), withPage = true } = {}) {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following' });
  await R.upsertSources([{ key: K1, kind: 'video', tier: 1, title: 'Rude Comments Talk', url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1', publishedAt: '2026-11-20T00:00:00.000Z', durationSec: 1800, people: [{ id: 'sam', role: 'host' }] }]);
  await R.setStage(K1, 'read', { read: { version: 'read-v1', costUsd: 0.1, ideas: 4, scripts: 0, lines: 0 } });
  const tp = T.transcriptPathFor(K1);
  fs.mkdirSync(path.dirname(tp), { recursive: true });
  fs.writeFileSync(tp, TRANSCRIPT);
  const base = path.join(dir, 'mentors', 'notes', `${K1.replace(/:/g, '_')}.read-v1`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify({ version: 'read-v1', key: K1, parsed: NOTES }));
  fs.mkdirSync(path.join(dir, 'mentors', 'books'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mentors', 'books', 'sam.json'), JSON.stringify(book, null, 2));
  fs.mkdirSync(path.join(vault, 'Wiki', 'Mentors'), { recursive: true });
  if (withPage) fs.writeFileSync(path.join(vault, PAGE), W.mentorPage(book, '2026-11-25', '2026-11-22'));
}
const book = async () => W.getBook('sam');
const item = async (rid) => (await book()).raised.find((r) => r.rid === rid);
const page = () => fs.readFileSync(path.join(vault, PAGE), 'utf8');

beforeEach(async () => {
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  fs.rmSync(vault, { recursive: true, force: true });
  R._resetRegisterForTests(); P._resetPeopleForTests(); Q._resetQueueForTests(); W._resetWeaveForTests(); A._resetAskForTests();
  W._setWeaveDepsForTest({ now: () => NOW });
  Q._setQueueDepsForTest({ now: () => NOW, readClaudeUsage: async () => ({ at: 'x', session: { percent: 10, resetsAt: '2026-11-25T05:00:00Z' }, week: { percent: 20, resetsAt: '2026-11-30T00:00:00Z' } }) });
  await MP.resetLanePref('mentor-brief'); await MP.resetLanePref('mentor-research');
  install(() => { throw new Error('no model call was expected'); });
});

/* -------------------------------- 1 questions ------------------------------ */

test('questions: one call for every new item that lacks them, the weave question kept as "true", a bad reply dropped not repaired', async () => {
  const b = fixtureBook();
  b.raised.push({ rid: 'R1.5', kind: 'idea', name: 'No question yet', text: 'A claim.', by: 'Sam Host', s: 1, t: '03:00', why: 'Worth a look for the reason given here.', status: 'new', at: '2026-11-23T00:00:00.000Z', batchId: 'b1' });
  await seed({ book: b });
  install(() => answer({ items: [
    { rid: 'R1.1', deeper: 'Where does the idea of weekly gratitude come from in the research?', use: 'How would he bring this up — with a friend this week?', true: 'Ignored because it was not missing for this item?' },
    { rid: 'R1.5', true: 'Is the claim made here supported by any published evidence?', deeper: 'Where from?', use: 'How could he use this claim in a real conversation this week' },
    { rid: 'R1.2', deeper: 'Is a kept item ever asked for its questions at all?' },
  ] }));
  const pageBefore = page();
  const r = await A.ensureQuestions('sam');
  assert.equal(asks.length, 1, 'one call for all of them');
  assert.equal(asks[0].lane, 'mentor-brief');
  assert.equal(asks[0].allowed, '', 'no tools');
  assert.match(asks[0].prompt, /^R1\.1 \| Weekly beats daily .*its "true" question already: Does the interval change the effect\? \| MISSING: deeper, use$/m);
  assert.match(asks[0].prompt, /^R1\.5 \| No question yet .*\| MISSING: true, deeper, use$/m);
  assert.doesNotMatch(asks[0].prompt, /^R1\.[234] \|/m, 'only new items are asked about');
  const r1 = await item('R1.1');
  assert.deepEqual(r1.questions, { true: 'Does the interval change the effect?', deeper: 'Where does the idea of weekly gratitude come from in the research?', use: null });
  const r5 = await item('R1.5');
  assert.deepEqual(r5.questions, { true: 'Is the claim made here supported by any published evidence?', deeper: null, use: null }, 'too short and no "?" are dropped, never repaired');
  assert.equal((await item('R1.2')).questions, undefined, 'a kept item is not touched');
  assert.deepEqual([r.asked, r.written, r.dropped, r.missing], [2, 2, 3, 3]);
  assert.equal(r.costUsd, 0.0123);
  assert.equal(page(), pageBefore, 'the vault page is not rendered again for questions');
  // nothing left to ask: no call
  install(() => { throw new Error('no call'); });
  const b2 = await book();
  for (const it of b2.raised) if (it.questions) { it.questions.use = 'How would he use this in a conversation this week?'; it.questions.deeper ||= 'Where does this idea come from and what is known?'; }
  fs.writeFileSync(path.join(dir, 'mentors', 'books', 'sam.json'), JSON.stringify(b2));
  assert.equal((await A.ensureQuestions('sam')).asked, 0);
  assert.equal(asks.length, 0);
});

test('questions: the checks', () => {
  assert.deepEqual(A.questionFailures('Is the evidence for this claim any good at all?'), []);
  assert.ok(A.questionFailures('Is it true').some((f) => /does not end/.test(f)));
  assert.ok(A.questionFailures('Is it true?').some((f) => /3 words/.test(f)));
  assert.ok(A.questionFailures(`${'word '.repeat(30)}word?`).some((f) => /31 words/.test(f)));
  assert.ok(A.questionFailures('Is this – really the evidence base for it?').some((f) => /dash/.test(f)));
  assert.deepEqual(A.questionFailures('Is well-being raised by a weekly gratitude list?'), [], 'a hyphen inside a word is not a dash');
  assert.ok(A.questionFailures(7).length);
});

test('questions: a failed call fails the call, not the weave batch, and the queue logs it', async () => {
  await seed();
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', repeatsCheckedAt: '2026-11-24T00:00:00Z' });
  await R.upsertSources([{ key: K2, kind: 'video', tier: 1, title: 'Two', publishedAt: '2026-11-19T00:00:00Z', people: [{ id: 'sam', role: 'host' }] }]);
  await R.setStage(K2, 'read', { read: { version: 'read-v1' } });
  await Q.allowReading('sam');
  Q._setVaultPathForTests(vault);
  const calls = [];
  Q._setQueueDepsForTest({
    now: () => NOW, busy: async () => false, onBattery: async () => false,
    readClaudeUsage: async () => ({ at: 'x', session: { percent: 10, resetsAt: null }, week: { percent: 20, resetsAt: null } }),
    weaveBatch: async (personId, keys) => { calls.push(`weave ${keys.join(',')}`); for (const k of keys) await R.setStage(k, 'woven', { woven: { batchId: 'b9' } }); return { batchId: 'b9', costUsd: 1, model: 'sonnet' }; },
    ensureQuestions: async (personId) => { calls.push(`questions ${personId}`); throw new Error('the questions call answered without an "items" list'); },
  });
  await Q.runUntilIdle({ maxMs: 5000 });
  assert.deepEqual(calls, ['weave yt:aaaaaaaaaa1,yt:bbbbbbbbbb2', 'questions sam'], 'questions run once after the batch, and the failure waits an hour before the beat tries again');
  const st = await Q.queueStatus();
  const lines = st.log.map((l) => `${l.what}: ${l.detail || ''}`);
  assert.ok(lines.some((l) => /^woven: 2 sources/.test(l)), 'the batch landed');
  assert.ok(lines.some((l) => /^questions failed: the questions call answered without an "items" list$/.test(l)), lines.join('\n'));
  assert.equal(st.people[0].waiting, null, 'no weave failure was recorded');
  Q._setVaultPathForTests(null);
});

/* --------------------------------- 2 research ------------------------------ */

const GOOD = { answer: 'Partly. Once a week raised well-being over six weeks, and three times a week did not.', sources: [{ title: 'Lyubomirsky, Sheldon and Schkade, 2005', url: 'https://doi.org/10.1037/1089-2680.9.2.111' }] };

test('research: the happy path ends answered, with its sources, model and cost, and the page shows the question, answer and links', async () => {
  await seed();
  install(() => ({ ...answer(GOOD), seen: 'search results ... https://doi.org/10.1037/1089-2680.9.2.111 ...' }));
  const started = await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  assert.equal(started.status, 'research');
  assert.deepEqual(started.asked, { kind: 'true', text: 'Does the interval change the effect?', at: new Date(NOW).toISOString() });
  assert.equal(started.researchError, null);
  assert.match(page(), /Does the interval change the effect\? \[research\]\n/, 'the page says it is being researched');
  await A.researchJob('sam', 'R1.1');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].lane, 'mentor-research');
  assert.equal(asks[0].allowed, 'WebSearch WebFetch');
  assert.match(asks[0].prompt, /THE QUESTION \(the "true" question\): Does the interval change the effect\?/);
  // 26:18 is 1578 s: the lines from 24:48 to 27:48, and the one holding it is 26:00
  assert.match(asks[0].prompt, /\[25:00\] words at minute 25 part 0\n[\s\S]*\[27:30\] words at minute 27 part 1\n/);
  assert.doesNotMatch(asks[0].prompt, /\[24:30\]|\[28:00\]/);
  const it = await item('R1.1');
  assert.equal(it.status, 'answered');
  assert.deepEqual(it.answer, { text: GOOD.answer, sources: GOOD.sources, at: new Date(NOW).toISOString(), model: 'claude-sonnet-4-5', costUsd: 0.0123 });
  assert.equal(it.researchError, null);
  assert.ok(page().includes('Question: Does the interval change the effect? [answered]\n  - Asked: Does the interval change the effect?\n  - Answer: Partly. Once a week raised well-being over six weeks, and three times a week did not.\n  - Sources: [Lyubomirsky, Sheldon and Schkade, 2005](https://doi.org/10.1037/1089-2680.9.2.111)\n'), page());
  // the item view carries everything the client needs
  const view = (await A.listRaisedViews('sam')).find((r) => r.rid === 'R1.1');
  assert.deepEqual(view.source, { id: 'aaaaaaaaaa1', title: 'Rude Comments Talk', sec: 1800, date: '2026-11-20T00:00:00.000Z' });
  assert.equal(view.ts, 1578);
  assert.equal(view.questions.true, 'Does the interval change the effect?');
});

test('research: no source for a "true" question is retried with the failures, then fails back to new with the cause', async () => {
  await seed();
  install(() => answer({ answer: 'Yes. It is true.', sources: [] }));
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await A.researchJob('sam', 'R1.1');
  assert.equal(asks.length, 2, 'one retry');
  assert.match(asks[1].prompt, /YOUR LAST REPLY FAILED THESE CHECKS[\s\S]*give at least one source/);
  const it = await item('R1.1');
  assert.equal(it.status, 'new');
  assert.equal(it.answer, undefined);
  assert.match(it.researchError.why, /^the research failed its checks twice: give at least one source/);
  assert.equal(it.researchError.at, new Date(NOW).toISOString());
  assert.doesNotMatch(page(), /\[research\]\n- Kept/, 'the page no longer says research for it');
  assert.match(page(), /Does the interval change the effect\?\n- Kept one/);
});

test('research: the reply checks', () => {
  const seen = 'https://a.example/x and https://b.example/y';
  assert.deepEqual(A.answerFailures(GOOD, 'true', null), []);
  assert.ok(A.answerFailures({ ...GOOD, answer: 'Once a week raised it.' }, 'true').some((f) => /verdict word/.test(f)));
  assert.ok(A.answerFailures({ ...GOOD, answer: `Yes. ${'word '.repeat(60)}` }, 'true').some((f) => /61 words/.test(f)));
  assert.ok(A.answerFailures({ ...GOOD, answer: 'Yes. It is — mostly.' }, 'true').some((f) => /dash/.test(f)));
  assert.ok(A.answerFailures({ ...GOOD, answer: 'Yes. It is **true**.' }, 'true').some((f) => /markdown/.test(f)));
  assert.ok(A.answerFailures({ answer: 'It helps.', sources: [] }, 'deeper').some((f) => /at least one source/.test(f)));
  assert.deepEqual(A.answerFailures({ answer: 'Say it once a week, out loud.', sources: [] }, 'use'), [], 'use may rest on the transcript');
  assert.ok(A.answerFailures({ answer: 'Ok.', sources: [{ title: 'x'.repeat(61), url: 'https://a.example/x' }] }, 'own').some((f) => /61 characters/.test(f)));
  assert.ok(A.answerFailures({ answer: 'Ok.', sources: [{ title: 'A', url: 'ftp://a.example/x' }] }, 'own').some((f) => /no http or https URL/.test(f)));
  assert.ok(A.answerFailures({ answer: 'Ok.', sources: [1, 2, 3, 4].map(() => ({ title: 'A', url: 'https://a.example/x' })) }, 'own').some((f) => /4 sources/.test(f)));
  assert.deepEqual(A.answerFailures({ answer: 'Ok.', sources: [{ title: 'A', url: 'https://a.example/x' }] }, 'own', seen), []);
  assert.ok(A.answerFailures({ answer: 'Ok.', sources: [{ title: 'A', url: 'https://c.example/z' }] }, 'own', seen).some((f) => /was not opened or found by a search/.test(f)), 'a link the run never saw is refused');
});

test('research: a second research on an item being researched is a 409, and nothing more is spawned', async () => {
  await seed();
  let release;
  const held = new Promise((r) => { release = r; });
  install(async () => { await held; return { ...answer(GOOD), seen: GOOD.sources[0].url }; });
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await assert.rejects(A.startResearch('sam', 'R1.1', { kind: 'deeper', question: 'Where from?' }, { vaultPath: vault }), (e) => e.refused && /already being researched/.test(e.message));
  assert.ok(A.researching('sam', 'R1.1'));
  release();
  await A.researchJob('sam', 'R1.1');
  assert.equal(asks.length, 1, 'the second never spawned');
  assert.equal((await item('R1.1')).status, 'answered');
});

test('research: bad requests, an unknown item, a running weave', async () => {
  await seed();
  const go = (body) => A.startResearch('sam', 'R1.1', body, { vaultPath: vault });
  await assert.rejects(go({ kind: 'maybe', question: 'Why?' }), (e) => e.badRequest);
  await assert.rejects(go({ kind: 'own', question: '   ' }), (e) => e.badRequest);
  await assert.rejects(go({ kind: 'own', question: 'x'.repeat(301) }), (e) => e.badRequest && /301 characters/.test(e.message));
  await assert.rejects(A.startResearch('sam', 'R9.9', { kind: 'own', question: 'Why?' }, { vaultPath: vault }), (e) => e.notFound);
  W._setActiveForTests('sam');
  await assert.rejects(go({ kind: 'own', question: 'Why?' }), (e) => e.refused && /weave for this person is running/.test(e.message));
  W._resetWeaveForTests();
  assert.equal(asks.length, 0);
});

test('research: usage over a ceiling is a 409 with the reason and reset time, and nothing is spawned or saved', async () => {
  await seed();
  Q._setQueueDepsForTest({ now: () => NOW, readClaudeUsage: async () => ({ at: 'x', session: { percent: 61, resetsAt: '2026-11-25T05:00:00Z' }, week: { percent: 20, resetsAt: null } }) });
  const before = page();
  await assert.rejects(Q.researchRaised('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault }),
    (e) => e.refused && e.message === 'his Claude usage is over a ceiling: the session is at 61% (his ceiling 60%); it resets 2026-11-25T05:00:00Z');
  assert.equal(asks.length, 0);
  assert.equal((await item('R1.1')).status, 'new');
  assert.equal(page(), before);
});

test('research: a restart with an item left in research puts it back to new and says why', async () => {
  await seed();
  assert.equal((await item('R1.3')).status, 'research');
  const n = await A.recoverResearch(['sam'], { vaultPath: vault });
  assert.equal(n, 1);
  const it = await item('R1.3');
  assert.equal(it.status, 'new');
  assert.deepEqual(it.researchError, { why: 'the server restarted while this was being researched', at: new Date(NOW).toISOString() });
  assert.doesNotMatch(page(), /\[research\]/);
  assert.equal(await A.recoverResearch(['sam'], { vaultPath: vault }), 0, 'nothing left to put back');
});

test('"Ask more" is status new: the last question and answer stay on the item', async () => {
  await seed();
  install(() => ({ ...answer(GOOD), seen: GOOD.sources[0].url }));
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await A.researchJob('sam', 'R1.1');
  await W.setRaisedStatus('sam', 'R1.1', 'new', { vaultPath: vault });
  const it = await item('R1.1');
  assert.equal(it.status, 'new');
  assert.equal(it.answer.text, GOOD.answer);
  assert.equal(it.asked.kind, 'true');
  assert.match(page(), /Does the interval change the effect\?\n {2}- Asked: /, 'the answer stays on the page under the item');
});

/* -------------------------------- 3 the page ------------------------------- */

test('the page: a book with no answers renders byte for byte as it did before this build', () => {
  assert.equal(W.mentorPage(fixtureBook(), '2026-11-25', '2026-11-22'), GOLDEN);
});

test('the page: the identity round trip with an answered item, and a one-line change changes one line', async () => {
  const b = fixtureBook();
  Object.assign(b.raised[0], {
    status: 'answered',
    asked: { kind: 'own', text: 'Who ran the study [and when]?', at: '2026-11-24T00:00:00.000Z' },
    answer: { text: 'Lyubomirsky and colleagues, in 2005.', sources: [{ title: 'A [bracketed] title', url: 'https://example.org/a b(1)' }, { title: 'Second', url: 'https://example.org/2' }], at: '2026-11-24T00:00:00.000Z', model: 'sonnet', costUsd: 0.05 },
  });
  await seed({ book: b });
  const first = page();
  assert.ok(first.includes('[answered]\n  - Asked: Who ran the study [and when]?\n  - Answer: Lyubomirsky and colleagues, in 2005.\n  - Sources: [A \\[bracketed\\] title](https://example.org/a%20b%281%29); [Second](https://example.org/2)\n- Kept one'), first);
  // rewriting every record with exactly what it already holds changes no byte and writes nothing
  const backups = path.join(vault, 'Wiki', 'Mentors', '.nova-backups');
  await W.changeRaised('sam', 'R1.1', () => {}, { vaultPath: vault });
  await W.changeRaised('sam', 'R1.2', () => {}, { vaultPath: vault });
  assert.equal(page(), first, 'byte identical');
  assert.ok(!fs.existsSync(backups) || fs.readdirSync(backups).length === 0, 'no write happened');
  // a genuine one-line edit changes exactly one line
  await W.setRaisedStatus('sam', 'R1.2', 'new', { vaultPath: vault });
  const a = first.split('\n');
  const c = page().split('\n');
  assert.equal(a.length, c.length);
  const diff = a.map((l, i) => (l === c[i] ? null : [l, c[i]])).filter(Boolean);
  assert.deepEqual(diff, [['- Kept one (S1 01:00): Text two. Why: Worth a look for the reason given here. [kept]', '- Kept one (S1 01:00): Text two. Why: Worth a look for the reason given here.']]);
});

/* --------------------------------- 4 brief --------------------------------- */

test('brief: three chosen by the model with a line each, the name, speaker and time from the read, new carried; the summary and pages from other sources only in the prompt', async () => {
  const b = fixtureBook();
  b.sources.push({ ...b.sources[0], n: 2, key: K2, title: 'Two' });
  b.concepts = [
    { title: 'Only This Video', page: 'Wiki/Concepts/Only This Video.md', gist: 'x', sources: [1] },
    { title: 'Shared Page', page: 'Wiki/Concepts/Shared Page.md', gist: 'x', sources: [1, 2] },
  ];
  b.chapters = [{ title: 'Other Chapter', sources: [2] }, { title: 'Own Chapter', sources: [1] }];
  await seed({ book: b, withPage: false });
  install(() => answer({ top: [{ n: 3, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 5, new: false, line: 'The idea said plainly in one short sentence here.' }, { n: 2, new: true, line: 'The idea said plainly in one short sentence here.' }] }));
  const brief = await A.writeBrief(K1);
  assert.equal(asks[0].lane, 'mentor-brief');
  assert.match(asks[0].prompt, /^1\. Ask about intent: A question about intent makes them double back\. They hear themselves\.$/m);
  assert.match(asks[0].prompt, /^5\. Did you mean: Someone is rude to you\. It works at work too\.$/m);
  assert.match(asks[0].prompt, /PAGES ALREADY IN HIS PLAYBOOK\n- Shared Page\n- Other Chapter$/);
  assert.equal(brief.costUsd, 0.0123);
  assert.equal(brief.model, 'claude-sonnet-4-5');
  assert.equal(brief.ideas.length, 3);
  const [x, y, z] = brief.ideas;
  assert.deepEqual([x.name, x.by, x.at, x.ts, x.new], ['No goes first', 'Sam Host', '1:01:30', 3690, true]);
  assert.equal(x.text, 'The idea said plainly in one short sentence here.');
  assert.deepEqual(y, { name: 'Did you mean', text: 'The idea said plainly in one short sentence here.', by: 'Sam Host', at: '00:30', ts: 30, new: false });
  assert.deepEqual(z, { name: 'Silence answers', text: 'The idea said plainly in one short sentence here.', by: 'Gail Rowan', at: '01:00', ts: 60, new: true });
  assert.match(asks[0].prompt, /key takeaways/);
  const src = await R.getSource(K1);
  assert.deepEqual(src.brief, brief);
  assert.equal(src.briefError, null);
});

test('brief: an n out of range is retried, then the brief fails with the cause and nothing is saved', async () => {
  await seed();
  install(() => answer({ top: [{ n: 1, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 9, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 1, new: false, line: 'The idea said plainly in one short sentence here.' }] }));
  await assert.rejects(A.writeBrief(K1), /^Error: the brief failed its checks twice: entry 2 has n 9, which is not a number from the list \(1 to 5\); n 1 is given twice$/);
  assert.equal(asks.length, 2);
  assert.match(asks[1].prompt, /YOUR LAST REPLY FAILED THESE CHECKS/);
  assert.equal((await R.getSource(K1)).brief, undefined);
});

test('brief: fewer than three only when the read has fewer, and no notes is a plain refusal', async () => {
  await seed();
  assert.deepEqual(A.briefFailures({ top: [{ n: 1, new: true, line: 'The idea said plainly in one short sentence here.' }] }, 1), []);
  assert.ok(A.briefFailures({ top: [{ n: 1, new: true, line: 'The idea said plainly in one short sentence here.' }] }, 5).some((f) => /exactly 3/.test(f)));
  assert.ok(A.briefFailures({ top: [{ n: 1, line: 'The idea said plainly in one short sentence here.' }, { n: 2, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 3, new: true, line: 'The idea said plainly in one short sentence here.' }] }, 5).some((f) => /"new"/.test(f)));
  await R.upsertSources([{ key: K2, kind: 'video', tier: 1, title: 'Two', people: [{ id: 'sam', role: 'host' }] }]);
  await assert.rejects(A.writeBrief(K2), /Two has no reading notes yet/);
  assert.equal(asks.length, 0);
});

test('lineFailures: one plain sentence of 6 to 24 words, a full stop, no quote marks, no dashes', () => {
  assert.deepEqual(A.lineFailures('The idea said plainly in one short sentence here.'), []);
  assert.deepEqual(A.lineFailures('Dr. Rowan says four seconds of silence says enough.'), []);
  assert.ok(A.lineFailures(undefined).some((f) => /no "line"/.test(f)));
  assert.ok(A.lineFailures('Too short.').some((f) => /6 to 24/.test(f)));
  assert.ok(A.lineFailures('This one has no full stop at the end of it').some((f) => /full stop/.test(f)));
  assert.ok(A.lineFailures('This is the first sentence here. And this is a second one.').some((f) => /more than one sentence/.test(f)));
  assert.ok(A.lineFailures('He says "go" and then he leaves the room at once.').some((f) => /quote marks/.test(f)));
  assert.ok(A.lineFailures('He stays calm \u2014 and then he leaves the room at once.').some((f) => /dash/.test(f)));
  assert.ok(A.briefFailures({ top: [{ n: 1, new: true }] }, 1).some((f) => /entry 1: it has no "line"/.test(f)));
});

test('firstSentence', () => {
  assert.equal(A.firstSentence('One. Two.'), 'One.');
  assert.equal(A.firstSentence('No full stop here'), 'No full stop here');
  assert.equal(A.firstSentence('He said "go." Then left.'), 'He said "go."');
  assert.equal(A.firstSentence('Use e.g. a pause. Then talk.'), 'Use e.g. a pause.');
});

/* ------------------------------- 7 never Fable ----------------------------- */

test('NEVER FABLE: both new lanes swap a Fable pick for Sonnet, and a Fable answer stops the call', async () => {
  for (const lane of ['mentor-brief', 'mentor-research']) {
    await MP.setLanePref(lane, { model: 'fable' });
    assert.equal(MP.modelFor(lane), 'fable', 'the board really says Fable');
    const c = Rd.mentorModelChoice(lane);
    assert.equal(c.model, 'sonnet');
    assert.match(c.why, /never runs on Fable/);
  }
  await seed();
  install(() => answer({ items: [] }));
  await A.ensureQuestions('sam');
  install(() => answer({ top: [{ n: 1, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 2, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 3, new: true, line: 'The idea said plainly in one short sentence here.' }] }));
  await A.writeBrief(K1);
  install(() => ({ ...answer(GOOD), seen: GOOD.sources[0].url }));
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await A.researchJob('sam', 'R1.1');
  assert.equal(asks[0].model, 'sonnet');
  assert.equal((await item('R1.1')).status, 'answered');
  // an answer that says Fable answered fails
  install(() => ({ ...answer({ top: [{ n: 1, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 2, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 3, new: true, line: 'The idea said plainly in one short sentence here.' }] }), answeredBy: 'claude-fable-5' }));
  await assert.rejects(A.writeBrief(K1), /never runs on Fable/);
  // and the spawn itself refuses a Fable model whatever it is handed
  await assert.rejects(Rd.runMentorClaude('x', 'claude-fable-5', { lane: 'mentor-research', allowed: 'WebSearch WebFetch' }), /never runs on Fable/);
});

test('runMentorClaude with tools: boundaryArgs allows only them, streams, and hands back what the run saw', async () => {
  const { EventEmitter } = await import('node:events');
  let argv = null;
  Rd._setReadDepsForTest({
    spawn: (bin, args) => {
      argv = args;
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdin = { on() {}, end() {
        const lines = [
          { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'gratitude weekly' } }] } },
          { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: 'Links: https://doi.org/10.1037/x' }] }] } },
          { type: 'result', result: '{"answer":"Yes.","sources":[]}', total_cost_usd: 0.02, modelUsage: { 'claude-sonnet-4-5': { outputTokens: 10 } } },
        ];
        setImmediate(() => { child.stdout.emit('data', lines.map((l) => JSON.stringify(l)).join('\n')); child.emit('close', 0); });
      } };
      return child;
    },
  });
  try {
    const r = await Rd.runMentorClaude('p', 'sonnet', { lane: 'mentor-research', allowed: 'WebSearch WebFetch', what: 'the research' });
    assert.equal(r.text, '{"answer":"Yes.","sources":[]}');
    assert.equal(r.usd, 0.02);
    assert.match(r.seen, /gratitude weekly/);
    assert.match(r.seen, /https:\/\/doi\.org\/10\.1037\/x/);
    assert.equal(argv[argv.indexOf('--allowedTools') + 1], 'WebSearch WebFetch');
    const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',');
    assert.ok(!denied.includes('WebSearch') && !denied.includes('WebFetch') && denied.includes('Bash') && denied.includes('Write'));
    assert.deepEqual(argv.slice(argv.indexOf('--output-format'), argv.indexOf('--output-format') + 3), ['--output-format', 'stream-json', '--verbose']);
    assert.ok(argv.includes('--effort') && argv[argv.indexOf('--effort') + 1] === 'medium', 'the research lane thinks at medium');
  } finally { Rd._setReadDepsForTest(null); }
});

test('research: the model recorded is the one asked for when the run used it, not the page-reading model that wrote more; a Fable model anywhere in the run fails it', async () => {
  await seed();
  install(() => ({ ...answer(GOOD), answeredBy: 'claude-haiku-5-5', models: ['claude-sonnet-5-5', 'claude-haiku-5-5'], seen: GOOD.sources[0].url }));
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await A.researchJob('sam', 'R1.1');
  assert.equal((await item('R1.1')).answer.model, 'claude-sonnet-5-5');
  install(() => ({ ...answer(GOOD), answeredBy: 'claude-sonnet-5-5', models: ['claude-sonnet-5-5', 'claude-fable-5'], seen: GOOD.sources[0].url }));
  await W.setRaisedStatus('sam', 'R1.1', 'new', { vaultPath: vault });
  await A.startResearch('sam', 'R1.1', { kind: 'true', question: 'Does the interval change the effect?' }, { vaultPath: vault });
  await A.researchJob('sam', 'R1.1');
  const it = await item('R1.1');
  assert.equal(it.status, 'new');
  assert.match(it.researchError.why, /was answered by claude-fable-5; a mentor lane never runs on Fable/);
});
