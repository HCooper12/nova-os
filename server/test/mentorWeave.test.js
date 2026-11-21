import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The weave with no model, no network and no real vault: a temp vault built
// here, and the model calls answered by `deps.ask` from what each prompt
// shows. The data dir is set BEFORE any lib is imported.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-weave-'));
process.env.NOVA_DATA_DIR = dir;
const vault = path.join(dir, 'vault');

let W; let R; let P; let Rd; let MP; let PB; let T;
before(async () => {
  W = await import('../lib/mentorWeave.js');
  R = await import('../lib/mentorRegister.js');
  P = await import('../lib/mentorPeople.js');
  Rd = await import('../lib/mentorRead.js');
  MP = await import('../lib/modelPrefs.js');
  PB = await import('../lib/playbooks.js');
  T = await import('../lib/mentorTranscripts.js');
  (await import('../lib/spawnBoundary.js'))._setEffortSupportedForTest(true);
});
after(async () => {
  W._setWeaveDepsForTest(null);
  Rd._setReadDepsForTest(null);
  await (await import('../lib/modelSpend.js'))._flushSpend();
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------- the fixtures ------------------------------ */

const EM = '\u2014'; // the vault index's own separator
const K1 = 'yt:aaaaaaaaaa1';
const K2 = 'yt:bbbbbbbbbb2';

const TRANSCRIPT_1 = `[00:00] today we talk about how to answer a rude comment without losing your cool at all
[00:30] start with the words did you mean for that to sound rude and then wait for the answer
[01:00] the second tool is silence hold it for four full seconds and then move on with your day
[01:30] when you say no say no first and leave out the long excuse because nobody needs it
`;
const NOTES_1 = `## Summary
Three tools for a rude comment. A question, silence, and a no that goes first.

## People
- Sam Host | host | opens the show [00:00]

## Ideas
### Ask about intent
A question about intent makes them double back.
By: Sam Host | [00:30]

### Silence answers
Four seconds of silence says enough.
By: Sam Host | [01:00]

### No goes first
Decline first, without the excuse.
By: Sam Host | [01:30]

## Frameworks
### Did you mean
Use when: someone is rude
Steps:
1. Hold the comeback
2. Ask did you mean
3. Wait
Shape: steps
By: Sam Host | [00:30]

## Scripts
- Situation: a rude comment | Say: "did you mean for that to sound rude" | Instead of: none | By: Sam Host | [00:30]
- Situation: a rude comment | Say: "I really wish you had not said that to me" | Instead of: none | By: Sam Host | [00:45]

## Lines
- "hold it for four full seconds and then move on with your day" | By: Sam Host | [01:00]
- "kindness is a strength that never runs out at all" | By: Sam Host | [01:10]
`;
const TRANSCRIPT_2 = `[00:00] welcome my guest today is gail guest and we talk about labels and calm
[00:30] a label starts with it sounds like there is more to that and then you name what you sense
[01:00] and people love to correct you so they will tell you the truth right away
`;
const NOTES_2 = `## Summary
A guest on labels.

## People
- Sam Host | host | hosts [00:00]
- Gail Guest | guest | introduced [00:00]

## Ideas
### Labels name what you sense
Say what you sense, and they correct you.
By: Gail Guest | [00:30]

### People love to correct
A wrong guess gets the truth.
By: Gail Guest | [01:00]

## Frameworks
### Label it
Use when: someone hides what they mean
Steps:
1. Notice
2. Say it sounds like
3. Take the correction
Shape: steps
By: Gail Guest | [00:30]

## Scripts
- Situation: probing | Say: "it sounds like there is more to that" | Instead of: none | By: Gail Guest | [00:30]

## Lines
- "people love to correct you so they will tell you the truth" | By: Gail Guest | [01:00]
`;

const SILENCE_PAGE = `---
type: concept
tags: [communication]
created: 2026-01-01
updated: '2026-01-02'
sources: ["[[Old Source]]"]
---

# Strategic Silence

**Silence** is a tool: a calm pause of a few seconds of silence.
The line above ends in three spaces.

---

| a | b |
|---|---|
| 1 | 2 |
`;

function buildVault() {
  fs.rmSync(vault, { recursive: true, force: true });
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true }); fs.writeFileSync(path.join(vault, rel), text); };
  w('CLAUDE.md', '# Schema\nThe weave never writes this file.\n');
  w('Wiki/index.md', `# Wiki Index\n\n## Sources\n- [[Old Source]] ${EM} old (updated 2026-01-01)\n\n## Entities\n\n## Concepts\n- [[Strategic Silence]] ${EM} silence (updated 2026-01-01)\n`);
  w('Wiki/log.md', '# Log\n\n## [2026-01-01] ingest | Old Source\n- Created: [[Old Source]]\n');
  w('Wiki/Concepts/Strategic Silence.md', SILENCE_PAGE);
  w('Wiki/Concepts/Gardening Basics.md', '---\ntype: concept\n---\n\n# Gardening Basics\n\nSoil and water.\n');
  w('Wiki/Sources/Old Source.md', '---\ntype: source\n---\n\n# Old Source\n\nAn old page.\n');
}

function snapshot(root = vault) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.nova-backups') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out[path.relative(root, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return out;
}

async function seedSource(key, title, transcript, notes, publishedAt) {
  await R.upsertSources([{ key, kind: 'video', tier: 1, title, url: `https://www.youtube.com/watch?v=${key.slice(3)}`, publishedAt, durationSec: 120, show: 'Test Show', people: [{ id: 'sam', role: 'host' }] }]);
  await R.setStage(key, 'read', { read: { version: 'read-v1' } });
  const tp = T.transcriptPathFor(key);
  fs.mkdirSync(path.dirname(tp), { recursive: true });
  fs.writeFileSync(tp, transcript);
  const parsed = Rd.parseNotes(notes);
  Rd.verifyNotes(parsed, transcript);
  const base = path.join(dir, 'mentors', 'notes', `${key.replace(/:/g, '_')}.read-v1`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.md`, notes);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ version: 'read-v1', key, at: '2026-11-20T00:00:00Z', model: 'sonnet', costUsd: 0.1, parsed }));
}

/* ------------------------------- the fake model ---------------------------- */

const titleCase = (s) => s.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function sortReply(prompt) {
  const ideas = [...prompt.matchAll(/^(I\d+\.\d+) \| (.+?) \| by:/gm)].map((m) => ({ id: m[1], name: m[2] }));
  const fws = [...prompt.matchAll(/^(F\d+\.\d+) \| (.+?) \| by:/gm)].map((m) => ({ id: m[1], name: m[2] }));
  const concepts = [];
  for (const i of ideas) {
    const existing = /silence|correct/i.test(i.name);
    const title = existing ? 'Strategic Silence' : titleCase(i.name);
    const c = concepts.find((x) => x.title === title);
    if (c) c.ideas.push(i.id); else concepts.push({ title, existing, ideas: [i.id] });
  }
  const chapters = fws.map((f) => ({ title: titleCase(f.name), existing: false, frameworks: [f.id], ideas: ideas.filter((i) => i.id.split('.')[0].slice(1) === f.id.split('.')[0].slice(1)).slice(0, 1).map((i) => i.id) }));
  return { concepts, chapters };
}

function conceptReply(prompt) {
  const secs = prompt.split(/\nCONCEPT \d+: /).slice(1);
  return {
    concepts: secs.map((sec) => {
      const title = sec.split('\n')[0].trim();
      const m = sec.match(/- S(\d+) (\d+:\d+), by ([^.]+)\./);
      return {
        title, by: [m[3]], gist: `About ${title}. Second sentence.`,
        points: [{ text: `The point of ${title} from S${m[1]}.`, cites: [{ s: Number(m[1]), t: m[2] }] }],
        adds: [{ s: Number(m[1]), text: 'what this source adds' }],
        tensions: title === 'Strategic Silence' ? [`The page calls it a tool; S${m[1]} calls it an answer.`] : [],
      };
    }),
  };
}

function chapterReply(prompt) {
  const title = prompt.match(/\nCHAPTER: (.+?)(?: \(in the book already.*)?\n/)[1];
  const m = prompt.split('FRAMEWORKS')[1].match(/\n- S(\d+) (\d+:\d+), by /);
  const ids = [...prompt.matchAll(/^([PL]\d+\.\d+) \(/gm)].map((x) => x[1]);
  return {
    title, purpose: `Use ${title} when it fits.`,
    triggers: ['someone is rude', 'a rude comment', 'answer rudeness'],
    when: ['someone is rude'], method: ['Hold the comeback', 'Ask the question', 'Wait'],
    rules: [{ text: `Ask before you answer in ${title}`, kind: 'stated', s: Number(m[1]), t: m[2] }],
    phraseIds: ids, scriptIds: ids.filter((i) => i.startsWith('P')),
    phrases: ['RETYPED words the model invented'],
    mistakes: ['Snapping back'], stops: ['When there is danger'],
    summary: 'Two sentences. Here.', takeaways: ['One.', 'Two.', 'Three.'],
    diagram: { shape: 'steps', title: 'Three steps', nodes: [{ label: 'Hold', detail: 'a' }, { label: 'Ask', detail: 'b' }, { label: 'Wait', detail: 'c' }] },
    clip: { s: Number(m[1]), t: m[2], what: 'He says it.' },
  };
}

function bookReply(prompt) {
  const batchNs = [...prompt.split('THIS BATCH:')[1].split('\n')[0].matchAll(/S(\d+) "/g)].map((m) => Number(m[1]));
  const ideaLines = [...prompt.split('IDEAS WITH THEIR TIMES')[1].matchAll(/\n- S(\d+) (\d+:\d+), by ([^.]+)\./g)];
  const at = { s: Number(ideaLines[0][1]), t: ideaLines[0][2] };
  const existing = [...prompt.matchAll(/^Principle: (.+?): /gm)].map((m) => m[1]);
  const principles = existing.length
    ? existing.map((name) => ({ name, sentence: `${name} holds.`, existing: true, sources: batchNs, at }))
    : ['Kind Not Nice', 'No First', 'Check Intent', 'Their Feelings', 'Let Silence Work'].map((name) => ({ name, sentence: `${name} is the idea.`, existing: false, sources: batchNs, at }));
  const guest = ideaLines.find((m) => m[3] === 'Gail Guest');
  return {
    glance: 'He hosts a show. He teaches short answers. He listens.',
    principles,
    chapterOrder: [],
    cards: Array.from({ length: 20 }, (_, i) => ({ q: `Question ${batchNs[0]}.${i}?`, a: 'An answer.', s: at.s, t: at.t })),
    fromGuests: guest ? [{ guest: 'Gail Guest', idea: 'Labels', response: 'He agreed.', s: Number(guest[1]), t: guest[2] }] : [],
  };
}

let asks;
let breakers; // step -> (reply, attempt) => reply
function fakeAsk(step, prompt, { model }) {
  asks.push({ step, prompt, model });
  const attempt = asks.filter((a) => a.step === step && a.prompt.startsWith(prompt.split('\n\nYOUR LAST REPLY FAILED')[0])).length;
  let reply = step === 'sort' ? sortReply(prompt) : step === 'concepts' ? conceptReply(prompt) : step === 'chapter' ? chapterReply(prompt) : bookReply(prompt);
  if (breakers[step]) reply = breakers[step](reply, attempt, prompt);
  return { text: `Here it is:\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``, usd: 0.01, answeredBy: 'claude-sonnet-5' };
}

let clock;
function install(extra = {}) {
  W._setWeaveDepsForTest({ now: () => (clock += 1000), ask: fakeAsk, ...extra });
}

beforeEach(async () => {
  R._resetRegisterForTests();
  P._resetPeopleForTests();
  W._resetWeaveForTests();
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  buildVault();
  asks = [];
  breakers = {};
  clock = Date.parse('2026-11-22T02:00:00Z');
  install();
  await MP.resetLanePref('mentor-weave');
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', scope: 'everything' });
  await seedSource(K1, 'Rude Comments Talk', TRANSCRIPT_1, NOTES_1, '2026-01-05T00:00:00Z');
  await seedSource(K2, 'Labels With Gail', TRANSCRIPT_2, NOTES_2, '2026-02-05T00:00:00Z');
});

const read = (rel) => fs.readFileSync(path.join(vault, rel), 'utf8');
const today = () => (async () => (await import('../lib/localDate.js')).localDateISO(new Date(Date.parse('2026-11-22T02:00:00Z'))))();

/* ---------------------------------- tests ---------------------------------- */

test('A: the id scheme; unverified scripts and lines go to held and to no prompt', async () => {
  const book = W.emptyBook('sam', 'Sam Host');
  const g = await W.gather({ id: 'sam', name: 'Sam Host' }, [K1, K2], book, vault);
  assert.deepEqual(g.items.ideas.map((i) => i.id), ['I1.1', 'I1.2', 'I1.3', 'I2.1', 'I2.2']);
  assert.deepEqual(g.items.frameworks.map((i) => i.id), ['F1.1', 'F2.1']);
  assert.deepEqual(g.items.scripts.map((i) => i.id), ['P1.1', 'P2.1'], 'P1.2 failed the word for word check');
  assert.deepEqual(g.items.lines.map((i) => i.id), ['L1.1', 'L2.1'], 'L1.2 failed the word for word check');
  assert.deepEqual(g.held.map((h) => [h.kind, h.s]), [['script', 1], ['line', 1]]);
  assert.equal(g.items.ideas[0].t, '00:30');
  assert.deepEqual(g.batch.map((b) => b.speakers), [['Sam Host'], ['Sam Host', 'Gail Guest']]);
  // the candidate concepts come from the vault search, Concepts only
  const silence = g.items.ideas.find((i) => i.name === 'Silence answers');
  assert.ok(silence.candidates.length, 'the silence idea finds the existing Strategic Silence page');
  assert.ok(g.candidates.every((c) => c.rel.startsWith('Wiki/Concepts/')));
  assert.ok(g.candidates.find((c) => c.title === 'Strategic Silence').head.length <= 240);
});

test('a whole weave: pages written by code, his words verified, held words nowhere, the existing page untouched outside its block', async () => {
  const before = snapshot();
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const day = await today();
  assert.equal(rec.version, 'weave-v2');
  assert.equal(rec.model, 'sonnet');
  // sort, two chapters, one concepts call (five concepts), the book
  assert.deepEqual(rec.calls.map((c) => c.step).sort(), ['book', 'chapter', 'chapter', 'concepts', 'sort']);
  assert.ok(rec.calls.every((c) => !c.retried));
  assert.equal(rec.costUsd, 0.05);
  assert.deepEqual(rec.counts, { sources: 2, concepts: 3, conceptsEdited: 1, chapters: 2, scripts: 2, cards: 15, held: 2 });
  // no prompt ever saw a held word
  for (const a of asks) {
    assert.ok(!a.prompt.includes('I really wish you had not said that'), `${a.step} saw a held script`);
    assert.ok(!a.prompt.includes('kindness is a strength'), `${a.step} saw a held line`);
  }
  const after = snapshot();
  assert.equal(after['CLAUDE.md'], before['CLAUDE.md'], 'CLAUDE.md is never written');
  const created = Object.keys(after).filter((k) => !(k in before)).sort();
  assert.deepEqual(created, [
    'Raw/Labels With Gail (Transcript).md', 'Raw/Rude Comments Talk (Transcript).md',
    'Wiki/Concepts/Ask About Intent.md', 'Wiki/Concepts/Labels Name What You Sense.md', 'Wiki/Concepts/No Goes First.md',
    'Wiki/Entities/Gail Guest.md', 'Wiki/Entities/Sam Host.md', 'Wiki/Mentors/Sam Host.md',
    'Wiki/Playbooks/Did You Mean.md', 'Wiki/Playbooks/Label It.md',
    'Wiki/Sources/Labels With Gail.md', 'Wiki/Sources/Rude Comments Talk.md',
  ]);
  assert.deepEqual(Object.keys(before).filter((k) => !(k in after)), [], 'nothing deleted');
  const edited = Object.keys(before).filter((k) => k in after && before[k] !== after[k]).sort();
  assert.deepEqual(edited, ['Wiki/Concepts/Strategic Silence.md', 'Wiki/index.md', 'Wiki/log.md']);

  // phrases on the page are the transcript's words, never the reply's
  const pb = PB.parsePlaybook(read('Wiki/Playbooks/Did You Mean.md'));
  assert.deepEqual(pb.phrases, ['did you mean for that to sound rude', 'hold it for four full seconds and then move on with your day']);
  for (const p of pb.phrases) assert.ok(TRANSCRIPT_1.includes(p), `"${p}" is word for word`);
  for (const [k, v] of Object.entries(after)) {
    assert.ok(!v.includes('RETYPED'), `${k} carries re-typed words`);
    assert.ok(!v.includes('I really wish you had not said that'), `${k} carries a held script`);
  }
  // the chapter parses and survives a format round trip byte for byte
  for (const rel of ['Wiki/Playbooks/Did You Mean.md', 'Wiki/Playbooks/Label It.md']) {
    const raw = read(rel);
    assert.equal(PB.formatPlaybook(PB.parsePlaybook(raw)), raw);
  }
  assert.deepEqual(pb.rules, [{ text: 'Ask before you answer in Did You Mean', kind: 'stated', source: 1, at: '00:30' }]);
  assert.equal(pb.sources[0].title, 'Rude Comments Talk');

  // the existing page: only its sources list, its updated date and one block changed
  const sil = read('Wiki/Concepts/Strategic Silence.md');
  assert.equal(sil.split('<!-- nova:mentors sam -->').length, 2, 'exactly one block');
  assert.match(sil, /^sources: \["\[\[Old Source\]\]", "\[\[Rude Comments Talk\]\]", "\[\[Labels With Gail\]\]"\]$/m);
  assert.match(sil, new RegExp(`^updated: '${day}'$`, 'm'), 'the quote style of updated is kept');
  const strip = (t) => t.replace(/\n<!-- nova:mentors sam -->[\s\S]*?<!-- \/nova:mentors -->\n$/, '').replace(/^sources:.*$/m, 'S').replace(/^updated:.*$/m, 'U');
  assert.equal(strip(sil), strip(SILENCE_PAGE), 'every other byte, bold, trailing spaces, the rule and the table, is identical');
  assert.ok(sil.startsWith(SILENCE_PAGE.replace(/^sources:.*$/m, sil.match(/^sources:.*$/m)[0]).replace(/^updated:.*$/m, sil.match(/^updated:.*$/m)[0])));

  // the book: data first, principle counts as structure
  const book = await W.getBook('sam');
  assert.deepEqual(book.sources.map((s) => [s.n, s.key]), [[1, K1], [2, K2]]);
  assert.equal(book.principles.length, 5);
  assert.deepEqual(book.principles[0].sources, [1, 2]);
  assert.equal(book.cards.length, 15, 'up to 15 cards on the first batch');
  assert.deepEqual(book.scripts.map((s) => [s.id, s.say]), [['P1.1', 'did you mean for that to sound rude'], ['P2.1', 'it sounds like there is more to that']]);
  assert.deepEqual(book.held.map((h) => h.kind), ['script', 'line']);
  assert.equal(book.fromGuests[0].guest, 'Gail Guest');
  assert.equal(book.concepts.find((c) => c.title === 'Strategic Silence').mine, false);
  assert.equal(book.concepts.find((c) => c.title === 'Ask About Intent').mine, true);
  const mentor = read('Wiki/Mentors/Sam Host.md');
  assert.match(mentor, /- \*\*Kind Not Nice\.\*\* Kind Not Nice is the idea\. \(in 2 of 2; S1 00:30\)/);
  assert.match(mentor, /Playbook: \[\[Playbooks\/Did You Mean\]\]/);
  assert.ok(!/kindness is a strength/.test(mentor));

  // pages a person reads carry his own day, the Raw page the Watcher's header
  assert.match(read('Wiki/Sources/Rude Comments Talk.md'), new RegExp(`^updated: ${day}$`, 'm'));
  assert.match(read('Wiki/Sources/Rude Comments Talk.md'), /^woven_by: mentors$/m);
  assert.ok(read('Raw/Rude Comments Talk (Transcript).md').startsWith(`Verbatim video transcript fetched by Nova's Watcher, received ${day}.\nSource URL: https://www.youtube.com/watch?v=aaaaaaaaaa1\nSource page: [[Rude Comments Talk]]\n\n---\n\n[00:00]`));
  // index and log: lines inserted, the rest byte for byte
  const idx = read('Wiki/index.md');
  assert.ok(idx.includes(`## Sources\n- [[Rude Comments Talk]] ${EM} `));
  assert.ok(idx.includes(`- [[Old Source]] ${EM} old (updated 2026-01-01)`));
  assert.match(idx, /## Playbooks\n- \[\[Playbooks\/(Did You Mean|Label It)\]\]/);
  const log = read('Wiki/log.md');
  assert.ok(log.startsWith(before['Wiki/log.md']));
  assert.match(log, /## \[\d{4}-\d{2}-\d{2}\] ingest \| Mentors weave: Sam Host \(2 sources\)/);
  // the entity pages: created with the vault's entity frontmatter and a block
  assert.match(read('Wiki/Entities/Gail Guest.md'), /^type: entity$/m);
  assert.match(read('Wiki/Entities/Gail Guest.md'), /\[\[Labels Name What You Sense\]\]/);
  // the register
  const s1 = await R.getSource(K1);
  assert.equal(s1.stage, 'woven');
  assert.equal(s1.woven.batchId, rec.batchId);
  assert.deepEqual(s1.vault, { sourcePage: 'Wiki/Sources/Rude Comments Talk.md', rawPage: 'Raw/Rude Comments Talk (Transcript).md' });
});

test('a second batch extends the book: numbering stable, principle sources unioned, cards capped, the block replaced', async () => {
  const r1 = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const b1 = await W.getBook('sam');
  assert.deepEqual(b1.principles[0].sources, [1]);
  assert.equal(b1.cards.length, 15);
  const r2 = await W.weaveBatch('sam', [K2], { vaultPath: vault });
  const b2 = await W.getBook('sam');
  assert.deepEqual(b2.sources.map((s) => [s.n, s.key]), [[1, K1], [2, K2]]);
  assert.equal(b2.principles.length, 5, 'existing principles kept, none added');
  assert.deepEqual(b2.principles[0].sources, [1, 2]);
  assert.equal(b2.cards.length, 20, 'five more on a later batch');
  assert.equal(r2.counts.cards, 5);
  const sil = read('Wiki/Concepts/Strategic Silence.md');
  assert.equal(sil.split('<!-- nova:mentors sam -->').length, 2, 'the second weave replaced the block');
  assert.match(sil, /The point of Strategic Silence from S1/);
  assert.match(sil, /The point of Strategic Silence from S2/);
  assert.match(read('Wiki/Mentors/Sam Host.md'), /\(in 2 of 2; S1 00:30\)/);
  assert.notEqual(r1.batchId, r2.batchId);
  const weaves = await W.listWeaves('sam');
  assert.deepEqual(weaves.map((w) => [w.batchId, w.undoable]), [[r2.batchId, true], [r1.batchId, false]]);
  const week = await W.weekSummary('sam');
  assert.equal(week.totals.batches, 2);
  assert.equal(week.totals.sources, 2);
});

test('undo: refused out of order, then exact, newest first, back to the vault as it was', async () => {
  const snap0 = snapshot();
  const r1 = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const snapA = snapshot();
  const bookA = await W.getBook('sam');
  const r2 = await W.weaveBatch('sam', [K2], { vaultPath: vault });
  await assert.rejects(W.undoWeave(r1.batchId, { vaultPath: vault }), (e) => e.refused && /undo the newest first/.test(e.message));
  const u2 = await W.undoWeave(r2.batchId, { vaultPath: vault });
  assert.deepEqual(u2.left, []);
  assert.deepEqual(snapshot(), snapA, 'byte for byte as after the first batch');
  assert.deepEqual(await W.getBook('sam'), bookA);
  assert.equal((await R.getSource(K2)).stage, 'read');
  await assert.rejects(W.undoWeave(r2.batchId, { vaultPath: vault }), (e) => e.refused);
  await W.undoWeave(r1.batchId, { vaultPath: vault });
  assert.deepEqual(snapshot(), snap0, 'byte for byte as before any weave');
  assert.equal(await W.getBook('sam'), null);
  assert.equal(fs.existsSync(path.join(vault, 'Wiki/Playbooks')), false, 'a folder the weave made is gone again');
  const s1 = await R.getSource(K1);
  assert.equal(s1.stage, 'read');
  assert.equal(s1.woven, null);
  await assert.rejects(W.undoWeave('no-such-batch', { vaultPath: vault }), (e) => e.notFound);
});

test('undo leaves a file he edited since and says so', async () => {
  const r1 = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  fs.appendFileSync(path.join(vault, 'Wiki/Playbooks/Did You Mean.md'), '- his own note\n');
  const out = await W.undoWeave(r1.batchId, { vaultPath: vault });
  assert.deepEqual(out.left.map((l) => l.relPath), ['Wiki/Playbooks/Did You Mean.md']);
  assert.match(out.left[0].why, /edited after the weave/);
  assert.ok(fs.readFileSync(path.join(vault, 'Wiki/Playbooks/Did You Mean.md'), 'utf8').endsWith('- his own note\n'));
  assert.ok(out.restored.includes('Wiki/Concepts/Strategic Silence.md'));
  assert.equal(read('Wiki/Concepts/Strategic Silence.md'), SILENCE_PAGE);
});

// Each breaker breaks the reply on every attempt (twice: the batch fails) or
// on the first only (the one retry mends it).
const BREAKS = {
  'B: an idea in no concept': ['sort', (r) => ({ ...r, concepts: r.concepts.slice(1) }), /appears 0 times across the concepts/],
  'B: a framework in two chapters': ['sort', (r) => ({ ...r, chapters: [...r.chapters, { ...r.chapters[0], title: 'Again' }] }), /appears 2 times across the chapters/],
  'B: an id never shown': ['sort', (r) => ({ ...r, concepts: [...r.concepts, { title: 'Ghost', ideas: ['I9.9'] }] }), /not an idea id shown/],
  'B: a title with a colon': ['sort', (r) => ({ ...r, concepts: r.concepts.map((c, i) => (i ? c : { ...c, title: 'Bad: Title' })) }), /contains one of/],
  'C: a cite at a time the notes do not have': ['concepts', (r) => ({ concepts: r.concepts.map((c) => ({ ...c, points: [{ text: 'x', cites: [{ s: 1, t: '09:59' }] }] })) }), /does not appear in that source's notes/],
  'C: a cite to a source nowhere': ['concepts', (r) => ({ concepts: r.concepts.map((c) => ({ ...c, points: [{ text: 'x', cites: [{ s: 7, t: '00:30' }] }] })) }), /not a source in this batch or the book/],
  'D: a phrase id not shown': ['chapter', (r) => ({ ...r, phraseIds: ['P9.1'] }), /phraseIds names P9\.1/],
  'D: a matrix with three nodes': ['chapter', (r) => ({ ...r, diagram: { shape: 'matrix', title: 'm', nodes: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] } }), /exactly four cells/],
  'D: a rule cite out of the notes': ['chapter', (r) => ({ ...r, rules: [{ text: 'r', kind: 'stated', s: 1, t: '08:00' }] }), /does not appear/],
  'D: two takeaways': ['chapter', (r) => ({ ...r, takeaways: ['a', 'b'] }), /exactly three/],
  'E: nine principles': ['book', (r) => ({ ...r, principles: [...r.principles, ...r.principles.slice(0, 4).map((p, i) => ({ ...p, name: `${p.name} ${i}` }))] }), /it must hold 5 to 8/],
  'E: a count in a sentence': ['book', (r) => ({ ...r, principles: r.principles.map((p, i) => (i ? p : { ...p, sentence: 'Said in 2 of 2 videos.' })) }), /count in its sentence/],
  'E: a guest who does not speak': ['book', (r) => ({ ...r, fromGuests: [{ guest: 'Nobody Known', idea: 'x', response: 'y', s: 1, t: '00:30' }] }), /not a guest who speaks/],
};

for (const [name, [step, brk, re]] of Object.entries(BREAKS)) {
  test(`a check that fails twice fails the batch and leaves the vault byte for byte: ${name}`, async () => {
    const before = snapshot();
    breakers[step] = (r) => brk(r);
    await assert.rejects(W.weaveBatch('sam', [K1, K2], { vaultPath: vault }), (e) => re.test(e.message) && /failed its checks twice/.test(e.message));
    assert.deepEqual(snapshot(), before);
    assert.equal(await W.getBook('sam'), null);
    assert.equal((await R.getSource(K1)).stage, 'read');
    assert.deepEqual(await W.listWeaves('sam'), []);
  });
}

test('the one retry: a reply that fails once is asked again with the failures listed, and the batch goes on', async () => {
  breakers.sort = (r, attempt) => (attempt === 1 ? { ...r, concepts: r.concepts.slice(1) } : r);
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const sorts = rec.calls.filter((c) => c.step === 'sort');
  assert.deepEqual(sorts.map((c) => c.retried), [false, true]);
  const retry = asks.filter((a) => a.step === 'sort')[1].prompt;
  assert.match(retry, /YOUR LAST REPLY FAILED THESE CHECKS/);
  assert.match(retry, /idea I1\.1 appears 0 times/);
});

test('a reply that is not JSON at all counts as a failed check', async () => {
  W._setWeaveDepsForTest({ now: () => (clock += 1000), ask: async () => ({ text: 'I cannot do that.', usd: 0.01 }) });
  const before = snapshot();
  await assert.rejects(W.weaveBatch('sam', [K1], { vaultPath: vault }), /not a JSON object/);
  assert.deepEqual(snapshot(), before);
});

test('only read sources with no hold are woven, ten at most, one weave at a time', async () => {
  await R.setHold(K2, { state: 'held', why: 'test' });
  await assert.rejects(W.weaveBatch('sam', [K2], { vaultPath: vault }), /is held/);
  await assert.rejects(W.weaveBatch('sam', Array.from({ length: 11 }, (_, i) => `yt:x${i}`), { vaultPath: vault }), /at most 10/);
  await R.upsertSources([{ key: 'yt:cccccccccc3', title: 'Not Read', people: [{ id: 'sam' }] }]);
  await assert.rejects(W.weaveBatch('sam', ['yt:cccccccccc3'], { vaultPath: vault }), /at stage found/);
  let release;
  const gate = new Promise((r) => { release = r; });
  install({ ask: async (...a) => { await gate; return fakeAsk(...a); } });
  const first = W.weaveBatch('sam', [K1], { vaultPath: vault });
  await assert.rejects(W.weaveBatch('sam', [K1], { vaultPath: vault }), /already running/);
  release();
  await first;
});

test('NEVER FABLE: the board set to Fable, the weave still asks Sonnet; a Fable answer stops it', async () => {
  await MP.setLanePref('mentor-weave', { model: 'fable' });
  assert.equal(MP.modelFor('mentor-weave'), 'fable', 'the board really says Fable');
  const choice = Rd.mentorModelChoice('mentor-weave');
  assert.equal(choice.model, 'sonnet');
  assert.match(choice.why, /never runs on Fable/);
  const rec = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  assert.equal(rec.model, 'sonnet');
  assert.ok(asks.length && asks.every((a) => a.model === 'sonnet'), `every call asked ${[...new Set(asks.map((a) => a.model))]}`);
  await W.undoWeave(rec.batchId, { vaultPath: vault });
  // the answer itself is checked: a reply that says Fable answered fails the batch
  install({ ask: async (...a) => ({ ...(await fakeAsk(...a)), answeredBy: 'claude-fable-5' }) });
  const before = snapshot();
  await assert.rejects(W.weaveBatch('sam', [K1], { vaultPath: vault }), /never runs on Fable/);
  assert.deepEqual(snapshot(), before);
  // and the spawn refuses a Fable model outright
  await assert.rejects(Rd.runMentorClaude('x', 'claude-fable-5', { lane: 'mentor-weave' }), /never runs on Fable/);
  await MP.resetLanePref('mentor-weave');
});

test('NEVER FABLE through the real spawn path: the CLI is never handed a Fable model, and carries the lane effort', async () => {
  await MP.setLanePref('mentor-weave', { model: 'claude-fable-5' });
  const spawns = [];
  Rd._setReadDepsForTest({
    spawn: (bin, args) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const call = { args };
      spawns.push(call);
      child.stdin = {
        on() {},
        end(input) {
          const prompt = String(input);
          const step = /^You are sorting/.test(prompt) ? 'sort' : /^Write the concept/.test(prompt) ? 'concepts' : /^Write one playbook/.test(prompt) ? 'chapter' : 'book';
          const text = fakeAsk(step, prompt, { model: args[args.indexOf('--model') + 1] }).text;
          setImmediate(() => {
            child.stdout.emit('data', JSON.stringify({ type: 'result', is_error: false, result: text, total_cost_usd: 0.02, duration_ms: 5, modelUsage: { 'claude-sonnet-5': { outputTokens: 10 } } }));
            child.emit('close', 0);
          });
        },
      };
      return child;
    },
  });
  W._setWeaveDepsForTest({ now: () => (clock += 1000) }); // the real ask
  const rec = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  assert.ok(spawns.length >= 4);
  for (const s of spawns) {
    assert.ok(!s.args.some((a) => /fable|mythos/i.test(a)), `no Fable in ${s.args.join(' ')}`);
    assert.equal(s.args[s.args.indexOf('--model') + 1], 'sonnet');
    assert.equal(s.args[s.args.indexOf('--effort') + 1], 'medium');
  }
  assert.equal(rec.answeredBy, 'claude-sonnet-5');
  assert.equal(rec.costUsd, Math.round(spawns.length * 0.02 * 10000) / 10000);
  Rd._setReadDepsForTest(null);
  await MP.resetLanePref('mentor-weave');
});

test('editFrontmatter: flow and block lists, quote styles kept, no frontmatter left alone', () => {
  const flow = '---\ntype: concept\nsources: ["[[A]]"]   \nupdated: 2026-01-01\n---\nbody\n';
  assert.equal(W.editFrontmatter(flow, { addSources: ['A', 'B'], updated: '2026-11-22' }), '---\ntype: concept\nsources: ["[[A]]", "[[B]]"]   \nupdated: 2026-11-22\n---\nbody\n');
  const block = '---\nsources:\n    - "[[A]]"\nupdated: "2026-01-01"\n---\n';
  assert.equal(W.editFrontmatter(block, { addSources: ['B'], updated: '2026-11-22' }), '---\nsources:\n    - "[[A]]"\n    - "[[B]]"\nupdated: "2026-11-22"\n---\n');
  assert.equal(W.editFrontmatter('---\ntype: x\n---\n', { addSources: ['B'] }), '---\ntype: x\nsources: ["[[B]]"]\n---\n');
  assert.equal(W.editFrontmatter('# no frontmatter\n', { addSources: ['B'], updated: '2026-11-22' }), '# no frontmatter\n');
  assert.equal(W.editFrontmatter('---\nsources: ["[[A|alias]]"]\n---\n', { addSources: ['A'] }), '---\nsources: ["[[A|alias]]"]\n---\n');
});

test('putBlock: appended once, replaced after, another person\'s block untouched', () => {
  const a = W.putBlock('text', 'p1', 'one');
  assert.equal(a, 'text\n\n<!-- nova:mentors p1 -->\none\n<!-- /nova:mentors -->\n');
  const b = W.putBlock(W.putBlock(a, 'p2', 'theirs'), 'p1', 'two $& $1');
  assert.equal(b, 'text\n\n<!-- nova:mentors p1 -->\ntwo $& $1\n<!-- /nova:mentors -->\n\n<!-- nova:mentors p2 -->\ntheirs\n<!-- /nova:mentors -->\n');
});

test('diagram shapes are checked by code', () => {
  const n = (k) => Array.from({ length: k }, (_, i) => ({ label: `n${i}` }));
  assert.deepEqual(W.diagramFailures({ shape: 'steps', nodes: n(3) }), []);
  assert.match(W.diagramFailures({ shape: 'cycle', nodes: n(7) })[0], /3 to 6/);
  assert.deepEqual(W.diagramFailures({ shape: 'matrix', nodes: n(6) }), []);
  assert.deepEqual(W.diagramFailures({ shape: 'versus', nodes: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }, { left: 'e', right: 'f' }] }), []);
  assert.match(W.diagramFailures({ shape: 'versus', nodes: [{ left: 'a', right: 'b' }, { label: 'c' }, { left: 'e', right: 'f' }] })[0], /both "left" and "right"/);
  assert.deepEqual(W.diagramFailures({ shape: 'single', nodes: n(1) }), []);
  assert.match(W.diagramFailures({ shape: 'spiral', nodes: n(3) })[0], /not one of/);
});

test('a hand-written playbook page with the same title is never regenerated: the chapter takes its own page', async () => {
  const hand = '---\ntype: playbook\n---\n# Did You Mean\n\nHis own words, his own layout.\n\n## The method\n1. his step\n';
  fs.mkdirSync(path.join(vault, 'Wiki/Playbooks'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'Wiki/Playbooks/Did You Mean.md'), hand);
  await W.weaveBatch('sam', [K1], { vaultPath: vault });
  assert.equal(read('Wiki/Playbooks/Did You Mean.md'), hand);
  assert.ok(fs.existsSync(path.join(vault, 'Wiki/Playbooks/Did You Mean (Sam Host).md')));
});
