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
- Gail Rowan | guest | introduced [00:00]

## Ideas
### Labels name what you sense
Say what you sense, and they correct you.
By: Gail Rowan | [00:30]

### People love to correct
A wrong guess gets the truth.
By: Gail Rowan | [01:00]

## Frameworks
### Label it
Use when: someone hides what they mean
Steps:
1. Notice
2. Say it sounds like
3. Take the correction
Shape: steps
By: Gail Rowan | [00:30]

## Scripts
- Situation: probing | Say: "it sounds like there is more to that" | Instead of: none | By: Gail Rowan | [00:30]

## Lines
- "people love to correct you so they will tell you the truth" | By: Gail Rowan | [01:00]
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

// What a careful sort does under weave-v3: the followed person's ideas and methods
// earn pages, an idea that joins an existing page earns its place there, and a
// guest's one-off goes to "notes".
function sortReply(prompt) {
  const who = prompt.match(/by or with (.+?) into a personal/)[1];
  const ideas = [...prompt.matchAll(/^(I\d+\.\d+) \| (.+?) \| by: (.+?)(?: \| maybe the same as: .*)?$/gm)].map((m) => ({ id: m[1], name: m[2], by: m[3] }));
  const fws = [...prompt.matchAll(/^(F\d+\.\d+) \| (.+?) \| by: (.+?) \| use when:/gm)].map((m) => ({ id: m[1], name: m[2], by: m[3] }));
  const concepts = [];
  const notes = [];
  for (const i of ideas) {
    // the existing page is joined only when the prompt really offers it
    const existing = /silence|correct/i.test(i.name) && (prompt.includes('| Strategic Silence |') || prompt.includes('- Strategic Silence'));
    if (!existing && i.by !== who) { notes.push(i.id); continue; }
    const title = existing ? 'Strategic Silence' : titleCase(i.name);
    const c = concepts.find((x) => x.title === title);
    if (c) c.ideas.push(i.id); else concepts.push({ title, existing, ideas: [i.id] });
  }
  for (const f of fws) if (f.by !== who) notes.push(f.id);
  const chapters = fws.filter((f) => f.by === who).map((f) => ({ title: titleCase(f.name), existing: false, frameworks: [f.id], ideas: ideas.filter((i) => i.id.split('.')[0].slice(1) === f.id.split('.')[0].slice(1)).slice(0, 1).map((i) => i.id) }));
  return { concepts, chapters, notes, raise: [] };
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
  const guest = ideaLines.find((m) => m[3] === 'Gail Rowan');
  return {
    glance: 'He hosts a show. He teaches short answers. He listens.',
    principles,
    chapterOrder: [],
    cards: Array.from({ length: 20 }, (_, i) => ({ q: `Question ${batchNs[0]}.${i}?`, a: 'An answer.', s: at.s, t: at.t })),
    fromGuests: guest ? [{ guest: 'Gail Rowan', idea: 'Labels', response: 'He agreed.', s: Number(guest[1]), t: guest[2] }] : [],
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
  assert.deepEqual(g.batch.map((b) => b.speakers), [['Sam Host'], ['Sam Host', 'Gail Rowan']]);
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
  assert.equal(rec.version, 'weave-v3');
  assert.equal(rec.model, 'sonnet');
  // sort, one chapter (the guest's method is a note), one concepts call, the book
  assert.deepEqual(rec.calls.map((c) => c.step).sort(), ['book', 'chapter', 'concepts', 'sort']);
  assert.ok(rec.calls.every((c) => !c.retried));
  assert.equal(rec.costUsd, 0.04);
  assert.deepEqual(rec.counts, { sources: 2, concepts: 2, conceptsEdited: 1, chapters: 1, scripts: 1, cards: 15, held: 2, notes: 2, raised: 0 });
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
    'Wiki/Concepts/Ask About Intent.md', 'Wiki/Concepts/No Goes First.md',
    'Wiki/Entities/Gail Rowan.md', 'Wiki/Entities/Sam Host.md', 'Wiki/Mentors/Sam Host.md',
    'Wiki/Playbooks/Did You Mean.md',
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
  for (const rel of ['Wiki/Playbooks/Did You Mean.md']) {
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
  assert.deepEqual(book.scripts.map((s) => [s.id, s.say]), [['P1.1', 'did you mean for that to sound rude']]);
  assert.deepEqual(book.held.map((h) => h.kind), ['script', 'line']);
  assert.equal(book.fromGuests[0].guest, 'Gail Rowan');
  assert.equal(book.concepts.find((c) => c.title === 'Strategic Silence').mine, false);
  assert.equal(book.concepts.find((c) => c.title === 'Ask About Intent').mine, true);
  const mentor = read('Wiki/Mentors/Sam Host.md');
  assert.match(mentor, /- \*\*Kind Not Nice\.\*\* Kind Not Nice is the idea\. \(in 2 of 2; S1 00:30\)/);
  assert.match(mentor, /Playbook: \[\[Playbooks\/Did You Mean\]\]/);
  assert.ok(!/kindness is a strength/.test(mentor));

  // pages a person reads carry his own day, the Raw page the Watcher's header
  assert.match(read('Wiki/Sources/Rude Comments Talk.md'), new RegExp(`^updated: ${day}$`, 'm'));
  assert.match(read('Wiki/Sources/Rude Comments Talk.md'), /^woven_by: mentors$/m);
  assert.ok(read('Raw/Rude Comments Talk (Transcript).md').startsWith(`Verbatim video transcript, received ${day}.\nSource URL: https://www.youtube.com/watch?v=aaaaaaaaaa1\nSource page: [[Rude Comments Talk]]\n\n---\n\n[00:00]`));
  // index and log: lines inserted, the rest byte for byte
  const idx = read('Wiki/index.md');
  assert.ok(idx.includes(`## Sources\n- [[Rude Comments Talk]] ${EM} `));
  assert.ok(idx.includes(`- [[Old Source]] ${EM} old (updated 2026-01-01)`));
  assert.match(idx, /## Playbooks\n- \[\[Playbooks\/Did You Mean\]\]/);
  const log = read('Wiki/log.md');
  assert.ok(log.startsWith(before['Wiki/log.md']));
  assert.match(log, /## \[\d{4}-\d{2}-\d{2}\] ingest \| Mentors weave: Sam Host \(2 sources\)/);
  // the entity pages: created with the vault's entity frontmatter and a block
  assert.match(read('Wiki/Entities/Gail Rowan.md'), /^type: entity$/m);
  assert.match(read('Wiki/Entities/Gail Rowan.md'), /Also said:\n- \[\[Labels With Gail\]\] 00:30: Labels name what you sense\n- \[\[Labels With Gail\]\] 00:30: Label it/);
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
  // the second batch is a v3 batch with notes and a raised item, so the undo has to take those out too
  breakers.sort = (r) => ({ ...r, notes: r.notes.filter((id) => id !== 'I2.1'), raise: [{ id: 'I2.1', why: 'A claim about wrong guesses that is worth a check.', question: 'Do people correct wrong guesses faster?' }] });
  const r2 = await W.weaveBatch('sam', [K2], { vaultPath: vault });
  assert.deepEqual([r2.counts.notes, r2.counts.raised], [1, 1]);
  assert.equal((await W.getBook('sam')).raised.length, 1);
  assert.match(read('Wiki/Mentors/Sam Host.md'), /## For your review/);
  await assert.rejects(W.undoWeave(r1.batchId, { vaultPath: vault }), (e) => e.refused && /undo the newest first/.test(e.message));
  const u2 = await W.undoWeave(r2.batchId, { vaultPath: vault });
  assert.deepEqual(u2.left, []);
  assert.deepEqual(snapshot(), snapA, 'byte for byte as after the first batch');
  assert.deepEqual(await W.getBook('sam'), bookA);
  assert.equal(JSON.stringify(await W.getBook('sam')), JSON.stringify(bookA), 'the book as it was, key for key');
  assert.deepEqual((await W.getBook('sam')).raised, [], 'no raised item survives the undo');
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
  'B: a title with a colon': ['sort', (r) => ({ ...r, concepts: r.concepts.map((c, i) => (i ? c : { ...c, title: 'Bad: Title' })) }), /contains one of/],
  'C: a cite at a time the notes do not have': ['concepts', (r) => ({ concepts: r.concepts.map((c) => ({ ...c, points: [{ text: 'x', cites: [{ s: 1, t: '09:59' }] }] })) }), /does not appear in that source's notes/],
  'C: a cite to a source nowhere': ['concepts', (r) => ({ concepts: r.concepts.map((c) => ({ ...c, points: [{ text: 'x', cites: [{ s: 7, t: '00:30' }] }] })) }), /not a source in this batch or the book/],
  'D: a phrase id not shown': ['chapter', (r) => ({ ...r, phraseIds: ['P9.1'] }), /phraseIds names P9\.1/],
  'D: a matrix with three nodes': ['chapter', (r) => ({ ...r, diagram: { shape: 'matrix', title: 'm', nodes: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] } }), /exactly four cells/],
  'D: a rule cite out of the notes': ['chapter', (r) => ({ ...r, rules: [{ text: 'r', kind: 'stated', s: 1, t: '08:00' }] }), /does not appear/],
  'D: two takeaways': ['chapter', (r) => ({ ...r, takeaways: ['a', 'b'] }), /exactly three/],
  'E: four principles': ['book', (r) => ({ ...r, principles: r.principles.slice(0, 4) }), /it must hold 5 to 8/],
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

// A sort reply that is still wrong after the retry in a way code can settle
// by rule (a stray id, an item placed nowhere or twice) no longer stops the
// batch: the item becomes a note, or keeps its first place, and the record
// counts the mends.
const MENDS = {
  'an idea in no concept becomes a note': [(r) => ({ ...r, concepts: r.concepts.slice(1) }), (rec, clean) => rec.counts.notes === clean.counts.notes + 1 && rec.counts.concepts === clean.counts.concepts - 1],
  'a framework in two chapters keeps its first': [(r) => ({ ...r, chapters: [...r.chapters, { ...r.chapters[0], title: 'Again' }] }), (rec, clean) => rec.counts.chapters === clean.counts.chapters],
  'an id never shown is dropped': [(r) => ({ ...r, concepts: [...r.concepts, { title: 'Ghost', ideas: ['I9.9'] }] }), (rec, clean) => rec.counts.concepts === clean.counts.concepts],
};
for (const [name, [brk, ok]] of Object.entries(MENDS)) {
  test(`a sort fault code can settle by rule does not stop the batch: ${name}`, async () => {
    const clean = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
    assert.equal(clean.mended, 0);
    await W.undoWeave(clean.batchId, { vaultPath: vault });
    breakers.sort = (r) => brk(r);
    const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
    assert.deepEqual(rec.calls.filter((c) => c.step === 'sort').map((c) => c.retried), [false, true], 'the model had its retry first');
    assert.ok(rec.mended >= 1);
    assert.ok(ok(rec, clean), JSON.stringify([rec.counts, clean.counts]));
    assert.match(read('Wiki/log.md'), /placings? in the sort settled by code/);
  });
}

// The book step has one fault code settles: more principles than the book
// may hold. The surplus new ones are left out and the batch lands.
test('a book reply with more principles than the book may hold does not stop the batch: the surplus is left out by code', async () => {
  breakers.book = (r) => ({ ...r, principles: [...r.principles, ...r.principles.slice(0, 4).map((p, i) => ({ ...p, name: `${p.name} ${i}`, sources: p.sources.slice(0, 1) }))] });
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.step === 'book').map((c) => c.retried), [false, true], 'the model had its retry first');
  assert.ok(rec.mendedBy.book >= 1);
  assert.equal(rec.mended, rec.mendedBy.book);
  const book = await W.getBook('sam');
  assert.ok(book.principles.length >= W.PRINCIPLES_MIN && book.principles.length <= W.PRINCIPLES_MAX, String(book.principles.length));
  assert.match(read('Wiki/log.md'), /principles? beyond the 8 left out by code/);
  assert.doesNotMatch(read('Wiki/log.md'), /in the sort settled by code/);
});

test('repairBook: the book keeps what it holds, the new one with the fewest sources goes first, and a reply within the limit is left alone', () => {
  const P = (name, sources, extra = {}) => ({ name, sentence: 's', sources, at: { s: 1, t: '00:30' }, ...extra });
  const held = Array.from({ length: 7 }, (_, i) => ({ id: `pr${i + 1}`, name: `Held ${i + 1}`, sentence: 's', sources: [1] }));
  const ctx = { book: { principles: held } };
  const fine = { principles: [P('Held 1', [1, 2], { existing: true }), P('A new one', [1])] };
  assert.equal(W.repairBook(fine, ctx), 0);
  assert.equal(fine.principles.length, 2);
  const over = { principles: [P('Held 2', [2], { existing: true }), P('Thin', [1]), P('Reworded', [1], { existing: true, was: 'Held 3' }), P('Strong', [1, 2, 3]), P('Thin too', [2])] };
  assert.equal(W.repairBook(over, ctx), 2);
  assert.deepEqual(over.principles.map((p) => p.name), ['Held 2', 'Reworded', 'Strong']);
  const full = { book: { principles: [...held, { id: 'pr8', name: 'Held 8', sentence: 's', sources: [1] }] } };
  const all = { principles: [P('Brand new', [1, 2, 3])] };
  assert.equal(W.repairBook(all, full), 1);
  assert.deepEqual(all.principles, []);
  assert.equal(W.repairBook({ principles: 'no' }, full), 0);
});

test('repairSort: every mend moves toward a note, nothing is promoted, and a clean reply is left alone', () => {
  const idea = (id, s, by) => ({ id, s, by, name: id, text: '', t: '00:30', candidates: [] });
  const fw = (id, s, by) => ({ id, s, by, name: id, useWhen: '', steps: [], t: '00:30' });
  const ctx = {
    person: { name: 'Sam Host' }, book: { concepts: [], chapters: [], principles: [] }, quoteWords: [],
    g: { candidates: [], items: { ideas: [idea('I1.1', 1, 'Sam Host'), idea('I1.2', 1, 'Gail Rowan'), idea('I1.3', 1, 'Gail Rowan'), idea('I1.4', 1, 'Gail Rowan'), idea('I1.5', 1, 'Gail Rowan'), idea('I1.6', 1, 'Gail Rowan'), idea('I1.7', 1, 'Sam Host')], frameworks: [fw('F1.1', 1, 'Gail Rowan')] } },
  };
  const why = 'a claim that is worth checking';
  const clean = { concepts: [{ title: 'His Idea', existing: false, ideas: ['I1.1', 'I1.7'] }], chapters: [], notes: ['I1.2', 'I1.3', 'I1.4', 'I1.5', 'F1.1'], raise: [{ id: 'I1.6', why }] };
  assert.deepEqual(W.checkSort(clean, ctx), []);
  const copy = JSON.parse(JSON.stringify(clean));
  assert.equal(W.repairSort(copy, ctx), 0);
  assert.deepEqual(copy, clean);
  const bad = {
    concepts: [{ title: 'His Idea', existing: false, ideas: ['I1.1'] }, { title: 'Empty One', existing: false, ideas: [] }, { title: 'Guest One Off', existing: false, ideas: ['I1.2'] }],
    chapters: [{ title: 'Her Method', existing: false, frameworks: ['F1.1'] }],
    notes: ['I1.1'],
    raise: [{ id: 'I1.3', why }, { id: 'I1.4', why }, { id: 'I1.5', why }, { id: 'I1.6', why }],
  };
  assert.ok(W.checkSort(bad, ctx).length >= 5);
  assert.ok(W.repairSort(bad, ctx) >= 5);
  assert.deepEqual(W.checkSort(bad, ctx), []);
  assert.deepEqual(bad.concepts.map((c) => c.title), ['His Idea']);
  assert.deepEqual(bad.chapters, []);
  assert.deepEqual(bad.raise.map((r) => r.id), ['I1.3', 'I1.4', 'I1.5']);
  assert.deepEqual([...bad.notes].sort(), ['F1.1', 'I1.2', 'I1.6', 'I1.7']);
  // a bad title is the model's to fix: code does not rename a page
  const titled = { ...clean, concepts: [{ title: 'Bad: Title', existing: false, ideas: ['I1.1', 'I1.7'] }] };
  assert.equal(W.repairSort(titled, ctx), 0);
  assert.equal(W.checkSort(titled, ctx).length, 1);
});

test('the one retry: a reply that fails once is asked again with the failures listed, and the batch goes on', async () => {
  breakers.sort = (r, attempt) => (attempt === 1 ? { ...r, concepts: r.concepts.slice(1) } : r);
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const sorts = rec.calls.filter((c) => c.step === 'sort');
  assert.deepEqual(sorts.map((c) => c.retried), [false, true]);
  const retry = asks.filter((a) => a.step === 'sort')[1].prompt;
  assert.match(retry, /YOUR LAST REPLY FAILED THESE CHECKS/);
  assert.match(retry, /idea I1\.1 appears 0 times/);
});

test('a point that repeats the existing page with a guessed S number: the prompt forbids it, and the retry says why', async () => {
  // 23 Nov 2026: the fourth real batch died here. The existing page shows its
  // cites as page links, the model repeated a point of it and guessed "S32".
  breakers.concepts = (r, attempt) => (attempt === 1
    ? { concepts: r.concepts.map((c) => (c.title === 'Strategic Silence' ? { ...c, points: [...c.points, { text: 'A point the page already makes.', cites: [{ s: 1, t: '59:59' }] }] } : c)) }
    : r);
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const prompts = asks.filter((a) => a.step === 'concepts').map((a) => a.prompt);
  assert.ok(prompts.every((x) => /Write points ONLY from the ideas listed under each concept/.test(x)), 'every concepts prompt carries the rule');
  const retry = prompts.find((x) => /YOUR LAST REPLY FAILED THESE CHECKS/.test(x));
  assert.ok(retry, 'the bad cite was sent back once');
  assert.match(retry, /a point of "Strategic Silence" cites S1 59:59, a time that does not appear in that source's notes \(cite only the ideas listed for this concept; the existing page's points are kept by code, so do not repeat them\)/);
  assert.ok(rec.calls.some((c) => c.step === 'concepts' && c.retried));
  assert.doesNotMatch(read('Wiki/Concepts/Strategic Silence.md'), /A point the page already makes/);
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

/* ----------------------------- review fixes, 22 Nov ----------------------------- */

const weavesPath = () => path.join(dir, 'mentors', 'weaves');

test('1: vaultWriteAllowed judges the path against the vault root, not against Wiki', () => {
  const v = '/tmp/some vault';
  for (const ok of ['Wiki/Concepts/A.md', 'Raw/X (Transcript).md', 'Wiki/index.md']) assert.equal(W.vaultWriteAllowed(v, ok), true, ok);
  for (const no of ['Journal/x.md', 'CLAUDE.md', 'Wiki/CLAUDE.md', 'Raw/claude.md', '../x.md', 'Wiki/../CLAUDE.md', 'Wiki/../../x.md', '/etc/passwd', 'Wikipedia/x.md', 'Wiki', '']) {
    assert.equal(W.vaultWriteAllowed(v, no), false, no);
  }
});

test('2a/2b/2c: a chapter page that comes out different is put back with everything else, and no pending record is left', async () => {
  const before = snapshot();
  const page = PB.formatPlaybook(PB.mergePlaybook(null, {
    type: 'playbook', title: 'Did You Mean', summary: 'A page another writer made while the weave ran', triggers: ['one thing', 'two things', 'three things'], agents: ['all'],
    sources: [], when: [], method: ['His own step'], rules: [], phrases: [], mistakes: [], stops: [], disagreements: [],
  }, { now: new Date(Date.parse('2026-11-22T01:00:00Z')) }));
  let armed = 0;
  // the call to now() just before the first vault write is where the page appears
  install({
    now: () => {
      clock += 1000;
      if (armed === 2) { armed = 3; fs.mkdirSync(path.join(vault, 'Wiki/Playbooks'), { recursive: true }); fs.writeFileSync(path.join(vault, 'Wiki/Playbooks/Did You Mean.md'), page); }
      else if (armed === 1) armed = 2;
      return clock;
    },
  });
  breakers.book = (r) => { armed = 1; return r; };
  await assert.rejects(W.weaveBatch('sam', [K1, K2], { vaultPath: vault }), (e) => /came out different from the text checked/.test(e.message) && /every file it had written was put back/.test(e.message));
  assert.equal(armed, 3, 'the page did appear at the planned moment');
  assert.deepEqual(snapshot(), { ...before, 'Wiki/Playbooks/Did You Mean.md': page }, 'every file as it was, and the page that appeared left exactly as it was');
  assert.deepEqual(fs.existsSync(weavesPath()) ? fs.readdirSync(weavesPath()) : [], [], 'no record of a weave that wrote nothing');
  assert.equal(await W.getBook('sam'), null);
  assert.equal((await R.getSource(K1)).stage, 'read');
});

test('2b/2d: a weave cut off after the vault was written leaves a pending record that start-up recovery undoes, byte for byte', async () => {
  const before = snapshot();
  // the register fails after the vault and the book are written
  breakers.book = (r) => {
    R._resetRegisterForTests();
    fs.writeFileSync(path.join(dir, 'mentors', 'register.json'), JSON.stringify({ version: 1, sources: {} }));
    return r;
  };
  await assert.rejects(W.weaveBatch('sam', [K1, K2], { vaultPath: vault }), /no source with key/);
  assert.notDeepEqual(snapshot(), before, 'the vault was written');
  const [w] = await W.listWeaves('sam');
  assert.equal(w.pending, true);
  assert.equal(w.undoneAt, null);
  const rec = await W.getWeave(w.batchId);
  assert.ok(rec.files.length >= 10, 'the record lists every file the weave wrote');
  const out = await W.recoverPendingWeaves({ vaultPath: vault });
  assert.deepEqual(out.map((o) => o.batchId), [rec.batchId]);
  assert.deepEqual(snapshot(), before, 'the vault is byte for byte as before the weave');
  assert.equal(await W.getBook('sam'), null);
  const after = await W.getWeave(rec.batchId);
  assert.equal(after.recovered, true);
  assert.ok(after.undoneAt);
  assert.deepEqual(await W.recoverPendingWeaves({ vaultPath: vault }), [], 'a recovered batch is not recovered twice');
});

test('2d: a hand-made pending record, with only some of its files written, is undone to the byte', async () => {
  const before = snapshot();
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  // as if the process died part way: the mentor page and the log were never written
  fs.rmSync(path.join(vault, 'Wiki/Mentors'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'Wiki/log.md'), before['Wiki/log.md']);
  const file = path.join(weavesPath(), `${rec.batchId}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), pending: true }));
  assert.equal((await W.listWeaves('sam'))[0].pending, true);
  const out = await W.recoverPendingWeaves({ vaultPath: vault });
  assert.deepEqual(out[0].left, []);
  assert.ok(out[0].restored.includes('Wiki/log.md'), 'a file already as it was counts as put back');
  assert.deepEqual(snapshot(), before);
  assert.equal((await R.getSource(K1)).stage, 'read');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).recovered, true);
});

test('2b: a weave that succeeds ends with no pending on its record', async () => {
  const rec = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  assert.equal(rec.pending, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(weavesPath(), `${rec.batchId}.json`), 'utf8')).pending, undefined);
  assert.equal((await W.listWeaves('sam'))[0].pending, false);
  assert.deepEqual(await W.recoverPendingWeaves({ vaultPath: vault }), []);
});

test('3: an index summary is cut at the last whole word that fits, with no comma left hanging', async () => {
  const long = `${Array.from({ length: 60 }, (_, i) => `word${i}`).join(', ')}.`;
  assert.ok(long.length > 200);
  breakers.concepts = (r) => ({ concepts: r.concepts.map((c) => ({ ...c, gist: `${long} Second sentence.` })) });
  await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const line = read('Wiki/index.md').split('\n').find((l) => l.startsWith('- [[Ask About Intent]]'));
  const summary = line.slice(`- [[Ask About Intent]] ${EM} `.length).replace(/ \(updated [\d-]+\)$/, '');
  assert.ok(summary.length <= 200, `${summary.length} characters`);
  assert.ok(!/[,;:]$/.test(summary), 'no trailing comma');
  assert.ok(/^word0/.test(summary) && /word\d+$/.test(summary), 'ends on a whole word');
  assert.ok(long.startsWith(summary) && /^,\s/.test(long.slice(summary.length)), 'the next word starts after it');
  assert.ok(long.slice(0, 200).length - summary.length < 14, 'and it is the last word that fit');
});

test('4: undo takes the weave\'s own lines out of index.md and log.md when other writers have added to them since', async () => {
  const before = snapshot();
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.ok(rec.indexLines.length >= 8 && rec.indexLines.every((l) => l.startsWith('- ')));
  assert.match(rec.logEntry, /^## \[\d{4}-\d{2}-\d{2}\] ingest \| Mentors weave: Sam Host/);
  const theirLine = `- [[Other Feature Page]] ${EM} added by something else (updated 2026-11-23)`;
  const theirLog = '\n## [2026-11-23] other | something else\n- did a thing\n';
  fs.writeFileSync(path.join(vault, 'Wiki/index.md'), read('Wiki/index.md').replace('## Concepts\n', `## Concepts\n${theirLine}\n`));
  fs.appendFileSync(path.join(vault, 'Wiki/log.md'), theirLog);
  const out = await W.undoWeave(rec.batchId, { vaultPath: vault });
  assert.deepEqual(out.left, []);
  assert.ok(out.restored.includes('Wiki/index.md') && out.restored.includes('Wiki/log.md'));
  assert.deepEqual(snapshot(), {
    ...before,
    'Wiki/index.md': before['Wiki/index.md'].replace('## Concepts\n', `## Concepts\n${theirLine}\n`),
    'Wiki/log.md': before['Wiki/log.md'] + theirLog,
  }, 'the rest of both files is as before the weave, and the other writer\'s lines survive');
});

test('4: a recorded index line that cannot be found leaves the file alone and says why', async () => {
  const rec = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const edited = read('Wiki/index.md').split('\n').map((l) => (l.startsWith('- [[Rude Comments Talk]]') ? `${l} (he reworded it)` : l)).join('\n');
  fs.writeFileSync(path.join(vault, 'Wiki/index.md'), edited);
  const out = await W.undoWeave(rec.batchId, { vaultPath: vault });
  assert.deepEqual(out.left.map((l) => l.relPath), ['Wiki/index.md']);
  assert.match(out.left[0].why, /edited after the weave.*no longer in it exactly/);
  assert.equal(read('Wiki/index.md'), edited);
  assert.ok(out.restored.includes('Wiki/log.md'));
});

test('5: a quote mark in model-written text must hold words that are in a transcript', async () => {
  // asked twice and still quoting words that are in no transcript: code takes the marks off and the batch carries on
  breakers.chapter = (r) => ({ ...r, method: ['Hold the comeback', 'Say "I never said any of this out loud" and wait', 'Wait'] });
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.ok(rec.unquoted >= 1, 'the record counts the marks it removed');
  assert.ok(rec.calls.some((c) => c.step.startsWith('chapter') && c.retried), 'the model was asked again first');
  const retry = asks.filter((a) => a.step.startsWith('chapter')).at(-1).prompt;
  assert.match(retry, /a method step of "(Did You Mean|Label It)" quotes "I never said any of this out loud", which is not word for word in a transcript; say it in your own words without quote marks/);
  const pages = read('Wiki/Playbooks/Did You Mean.md');
  assert.match(pages, /Say I never said any of this out loud and wait/);
  assert.doesNotMatch(pages, /["\u201c]I never said any of this out loud/);
  await W.undoWeave(rec.batchId, { vaultPath: vault });
  // the same step with words that are in the transcript keeps its marks, as does a single quoted word
  breakers.chapter = (r) => ({ ...r, method: ['Hold the comeback', 'Ask "did you mean for that to sound rude" and then wait', 'Say "no" first'] });
  const rec2 = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.equal(rec2.unquoted, 0);
  assert.match(read('Wiki/Playbooks/Did You Mean.md'), /did you mean for that to sound rude/);
});

test('5: a failure that is not a quote still stops the batch after two tries', async () => {
  const before = snapshot();
  breakers.chapter = (r) => ({ ...r, method: [] });
  await assert.rejects(W.weaveBatch('sam', [K1, K2], { vaultPath: vault }), /failed its checks twice/);
  assert.deepEqual(snapshot(), before);
});

test('5: the same check reaches the concepts and the book, curly quotes included, and a retry can mend it', async () => {
  breakers.concepts = (r, attempt) => (attempt === 1 ? { concepts: r.concepts.map((c) => ({ ...c, gist: 'He told them “you are never going to make it” once.' })) } : r);
  breakers.book = (r, attempt) => (attempt === 1 ? { ...r, glance: 'He says "this is a made up sentence" a lot.' } : r);
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.retried).map((c) => c.step).sort(), ['book', 'concepts']);
  const retry = asks.filter((a) => a.step === 'concepts').at(-1).prompt;
  assert.match(retry, /the gist of "[^"]+" quotes "you are never going to make it", which is not word for word/);
  assert.match(asks.filter((a) => a.step === 'book').at(-1).prompt, /the glance quotes "this is a made up sentence"/);
});

test('5: words from an earlier source of the book count as a transcript', async () => {
  await W.weaveBatch('sam', [K1], { vaultPath: vault });
  breakers.book = (r) => ({ ...r, glance: 'Early on he put it as "hold it for four full seconds" and kept to it.' });
  const rec = await W.weaveBatch('sam', [K2], { vaultPath: vault });
  assert.ok(rec.calls.every((c) => !c.retried), 'a quote from S1 passes while weaving S2');
});

test('6: looksLikeAName', () => {
  for (const yes of ['Chris Voss', 'Amy Grant', "Jean-Luc O'Neil", 'Dr. Jane Smith', 'Zoë Étienne']) assert.equal(W.looksLikeAName(yes), true, yes);
  for (const no of ['Guest', 'Speaker 2', 'unclear', 'Mel', '', null, 'Gail Guest', 'Unknown Speaker', 'Dan Co-Host', 'Audience Member', 'Host', 'Sam 2nd', 'Pat O_Brien']) assert.equal(W.looksLikeAName(no), false, String(no));
});

test('6: a speaker whose name is not a name gets no Entity page, no block and no link; the people who are named do', async () => {
  await seedSource(K2, 'Labels With Gail', TRANSCRIPT_2, NOTES_2.replace('- Gail Rowan | guest | introduced [00:00]', '- Gail Rowan | guest | introduced [00:00]\n- Speaker 2 | guest | cuts in [00:10]\n- Unknown | host | off mic [00:20]'), '2026-02-05T00:00:00Z');
  const g = await W.gather({ id: 'sam', name: 'Sam Host' }, [K2], W.emptyBook('sam', 'Sam Host'), vault);
  assert.deepEqual(g.batch[0].speakers, ['Sam Host', 'Gail Rowan']);
  await W.weaveBatch('sam', [K2], { vaultPath: vault });
  assert.ok(fs.existsSync(path.join(vault, 'Wiki/Entities/Gail Rowan.md')));
  assert.equal(fs.existsSync(path.join(vault, 'Wiki/Entities/Speaker 2.md')), false);
  assert.equal(fs.existsSync(path.join(vault, 'Wiki/Entities/Unknown.md')), false);
  for (const [k, v] of Object.entries(snapshot())) assert.ok(!/\[\[(Speaker 2|Unknown)\]\]/.test(v), `${k} links a non-name`);
  const book = await W.getBook('sam');
  assert.deepEqual(book.sources[0].people, ['Sam Host', 'Gail Rowan']);
});

test('6: a source whose only speakers are not names has the followed person stand in', async () => {
  await seedSource(K2, 'Labels With Gail', TRANSCRIPT_2, NOTES_2.replace('- Sam Host | host | hosts [00:00]\n- Gail Rowan | guest | introduced [00:00]', '- Speaker 1 | host | hosts [00:00]\n- Guest | guest | introduced [00:00]'), '2026-02-05T00:00:00Z');
  const g = await W.gather({ id: 'sam', name: 'Sam Host' }, [K2], W.emptyBook('sam', 'Sam Host'), vault);
  assert.deepEqual(g.batch[0].speakers, ['Sam Host']);
});

test('7: the Raw transcript says how the words were made, and keeps the first three words', async () => {
  await R.setStage(K1, 'read', { transcript: { source: 'youtube-audio' } });
  await R.setStage(K2, 'read', { transcript: { source: 'youtube-captions' } });
  await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const day = await today();
  const url = (k) => `Source URL: https://www.youtube.com/watch?v=${k.slice(3)}`;
  assert.ok(read('Raw/Rude Comments Talk (Transcript).md').startsWith(`Verbatim video transcript made by Nova on this Mac from the episode's audio, received ${day}.\n${url(K1)}\nSource page: [[Rude Comments Talk]]\n\n---\n\n[00:00]`));
  assert.ok(read('Raw/Labels With Gail (Transcript).md').startsWith(`Verbatim video transcript from the video's captions, received ${day}.\n${url(K2)}\n`));
});

test('7: a podcast-audio source says the audio line, and an unknown source says neither method', async () => {
  await R.setStage(K1, 'read', { transcript: { source: 'podcast-audio' } });
  await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const day = await today();
  assert.ok(read('Raw/Rude Comments Talk (Transcript).md').startsWith(`Verbatim video transcript made by Nova on this Mac from the episode's audio, received ${day}.\n`));
  assert.ok(read('Raw/Labels With Gail (Transcript).md').startsWith(`Verbatim video transcript, received ${day}.\n`));
  for (const rel of ['Raw/Rude Comments Talk (Transcript).md', 'Raw/Labels With Gail (Transcript).md']) assert.ok(/^\s*Verbatim video transcript\b/i.test(read(rel)), 'lineHarvest still recognises it');
});

test('10: a script or line the read held for a reason carries that reason into the held list', async () => {
  const notes = `${NOTES_1}- "today we talk about how to answer a rude comment... hold it for four full seconds and then move on with your day" | By: Sam Host | [00:00]\n`;
  await seedSource(K1, 'Rude Comments Talk', TRANSCRIPT_1, notes, '2026-01-05T00:00:00Z');
  const g = await W.gather({ id: 'sam', name: 'Sam Host' }, [K1], W.emptyBook('sam', 'Sam Host'), vault);
  const joined = g.held.find((h) => h.text.includes('rude comment...'));
  assert.equal(joined.why, 'it joins two separate moments of the transcript');
  assert.ok(g.held.some((h) => h.why === 'not found word for word in the transcript'), 'the others keep the plain reason');
});

/* ------------------------- weave-v3: what earns a page ------------------------- */

const K3 = 'yt:cccccccccc3';
const TRANSCRIPT_3 = `[00:00] welcome back gail guest and we go over labels again today
[00:30] say what you sense and let them correct you every single time
`;
const NOTES_3 = `## Summary
Gail again.

## People
- Sam Host | host | hosts [00:00]
- Gail Rowan | guest | introduced [00:00]

## Ideas
### Labels name what you sense again
Name what you sense and let them correct you.
By: Gail Rowan | [00:30]
`;
const GUEST_CONCEPT = { title: 'Labels Name What You Sense', existing: false, ideas: ['I2.1'] };
const withoutId = (list, ...ids) => list.filter((id) => !ids.includes(id));
const WHY = 'A claim about wrong guesses that is worth a check.';
const QUESTION = 'Do people correct a wrong guess faster than a right one?';

test('v3 1: a guest one-off offered as a new concept fails the earning rule; kept as a note it has no page and shows as Also said', async () => {
  breakers.sort = (r, attempt) => (attempt === 1 ? { ...r, concepts: [...r.concepts, GUEST_CONCEPT], notes: withoutId(r.notes, 'I2.1') } : r);
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.step === 'sort').map((c) => c.retried), [false, true]);
  const retry = asks.filter((a) => a.step === 'sort')[1].prompt;
  assert.match(retry, /concept "Labels Name What You Sense" is a guest's one-off idea: put its ideas in "notes", or in "raise" if it is noteworthy/);
  assert.equal(fs.existsSync(path.join(vault, 'Wiki/Concepts/Labels Name What You Sense.md')), false, 'no Concept page for a note');
  const src = read('Wiki/Sources/Labels With Gail.md');
  assert.match(src, /## Also said\n- Labels name what you sense \(Gail Rowan, 00:30\): Say what you sense, and they correct you\.\n- Label it \(Gail Rowan, 00:30\): someone hides what they mean\n/);
  assert.ok(src.indexOf('## Also said') < src.indexOf('## Linked pages'));
  assert.match(read('Wiki/Entities/Gail Rowan.md'), /Also said:\n- \[\[Labels With Gail\]\] 00:30: Labels name what you sense\n/);
  assert.ok(!read('Wiki/Entities/Sam Host.md').includes('Also said:'), 'the followed person has no such list');
  const book = await W.getBook('sam');
  assert.deepEqual(book.sources[1].notes.map((n) => [n.kind, n.name, n.by, n.t]), [['idea', 'Labels name what you sense', 'Gail Rowan', '00:30'], ['framework', 'Label it', 'Gail Rowan', '00:30']]);
  assert.deepEqual(book.sources[0].notes, []);
  assert.ok(!book.concepts.some((c) => c.title === 'Labels Name What You Sense'));
});

test('v3 2: the same guest idea from two sources earns its page', async () => {
  await seedSource(K3, 'Gail Again', TRANSCRIPT_3, NOTES_3, '2026-03-05T00:00:00Z');
  breakers.sort = (r) => ({ ...r, concepts: [...r.concepts, { title: 'Labels Name What You Sense', existing: false, ideas: ['I1.1', 'I2.1'] }], notes: withoutId(r.notes, 'I1.1', 'I2.1') });
  const rec = await W.weaveBatch('sam', [K2, K3], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.step === 'sort').map((c) => c.retried), [false], 'passed the check the first time');
  const page = read('Wiki/Concepts/Labels Name What You Sense.md');
  assert.match(page, /^sources: \["\[\[Labels With Gail\]\]", "\[\[Gail Again\]\]"\]$/m);
  assert.deepEqual((await W.getBook('sam')).concepts.find((c) => c.title === 'Labels Name What You Sense').sources, [1, 2]);
});

test('v3 3: a new concept by the followed person from one source earns its page', async () => {
  const rec = await W.weaveBatch('sam', [K1], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.step === 'sort').map((c) => c.retried), [false]);
  assert.ok(fs.existsSync(path.join(vault, 'Wiki/Concepts/Ask About Intent.md')));
  assert.ok(fs.existsSync(path.join(vault, 'Wiki/Playbooks/Did You Mean.md')), 'and his method earns its chapter');
  assert.equal(rec.counts.notes, 0);
});

test('v3 3b: the check also refuses a guest chapter that earns nothing, and a chapter already in the book earns', () => {
  const idea = (id, s, by) => ({ id, s, by, name: id, text: '', t: '00:30', candidates: [] });
  const fw = (id, s, by) => ({ id, s, by, name: id, useWhen: '', steps: [], t: '00:30' });
  const ctx = {
    person: { name: 'Sam Host' }, book: { concepts: [], chapters: [{ title: 'Known Method' }], principles: [] }, quoteWords: [],
    g: { candidates: [], items: { ideas: [idea('I1.1', 1, 'Sam Host')], frameworks: [fw('F1.1', 1, 'Gail Rowan'), fw('F2.1', 2, 'Gail Rowan')] } },
  };
  const base = { concepts: [{ title: 'His Idea', existing: false, ideas: ['I1.1'] }], raise: [] };
  const guestOnly = W.checkSort({ ...base, chapters: [{ title: 'Her Method', existing: false, frameworks: ['F1.1'] }], notes: ['F2.1'] }, ctx);
  assert.deepEqual(guestOnly, ['chapter "Her Method" is a guest\'s one-off method: put its frameworks in "notes", or in "raise" if it is noteworthy']);
  const twoSources = W.checkSort({ ...base, chapters: [{ title: 'Her Method', existing: false, frameworks: ['F1.1', 'F2.1'] }], notes: [] }, ctx);
  assert.deepEqual(twoSources, []);
  const inBook = W.checkSort({ ...base, chapters: [{ title: 'Known Method', existing: true, frameworks: ['F1.1'] }], notes: ['F2.1'] }, ctx);
  assert.deepEqual(inBook, []);
  // existing: true for a title nobody offered does not earn a page
  const faked = W.checkSort({ concepts: [{ title: 'Made Up', existing: true, ideas: ['I1.1'] }, { title: 'Guest Idea', existing: true, ideas: [] }], chapters: [], notes: ['F1.1', 'F2.1'], raise: [] }, ctx);
  assert.deepEqual(faked.filter((x) => /one-off/.test(x)), []);
});

test('v3 4: a raised item needs a why of five words, at most three per source, and lands in the book, on the mentor page and on its source page', async () => {
  const before = snapshot();
  // Each fault is put to the model once more in its own words; when the retry
  // still has it, code settles it toward a note and the batch goes on.
  const settled = async (brk, re) => {
    asks = [];
    breakers.sort = brk;
    const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
    assert.match(asks.filter((a) => a.step === 'sort')[1].prompt, re);
    assert.ok(rec.mended >= 1);
    await W.undoWeave(rec.batchId, { vaultPath: vault });
    return rec;
  };
  // a why of four words: the item becomes a note
  const short = await settled((r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: 'Worth a look today' }] }), /the raised item I2\.1 needs a "why" of at least 5 words/);
  assert.deepEqual([short.counts.raised, short.counts.notes], [0, 2]);
  // four raised items for one source: the fourth becomes a note
  const four = await settled(() => ({ concepts: [], chapters: [], notes: ['I2.1', 'I2.2', 'F2.1'], raise: ['I1.1', 'I1.2', 'I1.3', 'F1.1'].map((id) => ({ id, why: 'This one is worth his time to follow up.' })) }), /source S1 has 4 raised items; the most is 3: move the rest to "notes"/);
  assert.equal(four.counts.raised, 3);
  // a question that is not a string: the item is raised with no question
  const noq = await settled((r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: WHY, question: 7 }] }), /the "question" of the raised item I2\.1 is not a string/);
  assert.equal(noq.counts.raised, 1);
  assert.deepEqual(snapshot(), before, 'three weaves, each undone, left the vault as it was');
  // three raised for one source is allowed; one of them here, with a question
  breakers.sort = (r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: WHY, question: QUESTION }] });
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  const book = await W.getBook('sam');
  assert.deepEqual(book.raised, [{
    rid: 'R2.1', kind: 'idea', name: 'Labels name what you sense', text: 'Say what you sense, and they correct you.', by: 'Gail Rowan', s: 2, t: '00:30',
    why: WHY, question: QUESTION, status: 'new', at: rec.at, batchId: rec.batchId,
  }]);
  const mentor = read('Wiki/Mentors/Sam Host.md');
  assert.match(mentor, new RegExp(`### Core principles\\n(?:- .*\\n)+\\n## For your review\\n- Labels name what you sense \\(Gail Rowan; S2 00:30\\): Say what you sense, and they correct you\\. Why: ${WHY.replace('.', '\\.')} Question: ${QUESTION.replace('?', '\\?')}\\n\\n## Chapters`));
  assert.match(read('Wiki/Sources/Labels With Gail.md'), new RegExp(`## Raised for your review\\n- Labels name what you sense \\(Gail Rowan, 00:30\\): Say what you sense, and they correct you\\. Why: ${WHY.replace('.', '\\.')}\\n`));
  assert.doesNotMatch(read('Wiki/Sources/Labels With Gail.md'), /## Also said\n- Labels name/, 'a raised item is not also a note');
  assert.match(read('Wiki/Entities/Gail Rowan.md'), /Also said:\n(?:- .*\n)*- \[\[Labels With Gail\]\] 00:30: Labels name what you sense\n/, 'a raised item is listed in the guest\'s Also said too');
  assert.equal(rec.counts.notes, 1, 'the guest method stays a note');
  assert.equal(rec.counts.raised, 1);
  assert.match(rec.logEntry, /none resolved; 1 idea kept as notes on their source pages; 1 raised for his review\./);
  assert.deepEqual((await W.listWeaves('sam'))[0].counts, rec.counts);
  const week = await W.weekSummary('sam');
  assert.deepEqual([week.totals.notes, week.totals.raised], [1, 1]);
  assert.deepEqual((await W.listRaised('sam')).map((r) => r.rid), ['R2.1']);
});

test('v3 5: an idea or framework missing from all three places, or in two, is put to the model again, then settled by code', async () => {
  const before = snapshot();
  const cases = [
    ['an idea in no place', (r) => ({ ...r, notes: withoutId(r.notes, 'I2.1') }), /idea I2\.1 appears 0 times across the concepts, notes and raise/],
    ['an idea in a concept and in notes', (r) => ({ ...r, notes: [...r.notes, 'I1.1'] }), /idea I1\.1 appears 2 times across the concepts, notes and raise/],
    ['an idea in notes and in raise', (r) => ({ ...r, raise: [{ id: 'I2.1', why: WHY }] }), /idea I2\.1 appears 2 times/],
    ['a framework in no place', (r) => ({ ...r, notes: withoutId(r.notes, 'F2.1') }), /framework F2\.1 appears 0 times across the chapters, notes and raise/],
    ['a framework in a chapter and in notes', (r) => ({ ...r, notes: [...r.notes, 'F1.1'] }), /framework F1\.1 appears 2 times across the chapters, notes and raise/],
    ['an id that was never shown in notes', (r) => ({ ...r, notes: [...r.notes, 'I9.9'] }), /"notes" lists I9\.9, which is not an idea or framework id shown/],
    ['an id that was never shown in raise', (r) => ({ ...r, raise: [{ id: 'F9.9', why: WHY }] }), /"raise" lists F9\.9, which is not an idea or framework id shown/],
  ];
  for (const [name, brk, re] of cases) {
    asks = [];
    breakers.sort = (r) => brk(r);
    const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
    assert.match(asks.filter((a) => a.step === 'sort')[1].prompt, re, name);
    assert.ok(rec.mended >= 1, name);
    await W.undoWeave(rec.batchId, { vaultPath: vault });
    assert.deepEqual(snapshot(), before, name);
  }
  // a chapter's supporting idea must also be placed once: dropped from every place, it becomes a note
  breakers.sort = (r) => ({ ...r, chapters: r.chapters.map((c) => ({ ...c, ideas: ['I1.1'] })), concepts: r.concepts.map((c) => ({ ...c, ideas: withoutId(c.ideas, 'I1.1') })).filter((c) => c.ideas.length) });
  asks = [];
  await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.match(asks.filter((a) => a.step === 'sort')[1].prompt, /idea I1\.1 appears 0 times/);
  assert.ok((await W.getBook('sam')).sources[0].notes.some((x) => x.t && /./.test(x.name)), 'the idea is a note on its source');
});

test('v3 6: quote marks around words that are in no transcript lose their marks in a note, and a quote that is in the transcript keeps them', async () => {
  const notes = NOTES_2.replace('Say what you sense, and they correct you.', 'Say "I never said any of this out loud" and then "it sounds like there is more to that" to them.');
  await seedSource(K2, 'Labels With Gail', TRANSCRIPT_2, notes, '2026-02-05T00:00:00Z');
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.equal(rec.unquoted, 1);
  const note = (await W.getBook('sam')).sources[1].notes[0];
  assert.equal(note.text, 'Say I never said any of this out loud and then "it sounds like there is more to that" to them.');
  assert.match(read('Wiki/Sources/Labels With Gail.md'), /Say I never said any of this out loud and then "it sounds like there is more to that" to them\./);
  assert.doesNotMatch(read('Wiki/Sources/Labels With Gail.md'), /"I never said any of this out loud"/);
});

test('v3 6b: the raised why and question go through the same quote check', async () => {
  breakers.sort = (r, attempt) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: attempt === 1 ? 'He says "this is a made up sentence" and that is odd.' : WHY, question: QUESTION }] });
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  assert.deepEqual(rec.calls.filter((c) => c.step === 'sort').map((c) => c.retried), [false, true]);
  assert.match(asks.filter((a) => a.step === 'sort')[1].prompt, /the "why" of the raised item I2\.1 quotes "this is a made up sentence"/);
});

test('v3 7: the sort prompt states the three places, and lists the topics he keeps notes on, alphabetical and at most 60', async () => {
  fs.mkdirSync(path.join(vault, 'Wiki/Topics'), { recursive: true });
  for (const n of ['Zeta Topic', 'Alpha Topic', 'Mid Topic']) fs.writeFileSync(path.join(vault, `Wiki/Topics/${n}.md`), '# t\n');
  fs.writeFileSync(path.join(vault, 'Wiki/Topics/notes.txt'), 'not a page');
  await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const prompt = asks.find((a) => a.step === 'sort').prompt;
  assert.match(prompt, /TOPICS HE ALREADY KEEPS NOTES ON\n- Alpha Topic\n- Mid Topic\n- Zeta Topic\n\n/);
  assert.match(prompt, /exactly ONE of three places/);
  assert.match(prompt, /most sources add 3 to 8 concepts and 0 to 3 chapters/i);
  assert.doesNotMatch(prompt, /One idea, one page|one chapter per distinct framework/);
  // no Topics folder: none; and a faked list longer than 60 is cut
  fs.rmSync(path.join(vault, 'Wiki/Topics'), { recursive: true });
  const g = await W.gather({ id: 'sam', name: 'Sam Host' }, [K2], W.emptyBook('sam', 'Sam Host'), vault);
  assert.deepEqual(g.topics, []);
  install({ topics: async () => Array.from({ length: 70 }, (_, i) => `Topic ${String(70 - i).padStart(2, '0')}`) });
  const g2 = await W.gather({ id: 'sam', name: 'Sam Host' }, [K2], W.emptyBook('sam', 'Sam Host'), vault);
  assert.equal(g2.topics.length, 60);
  assert.equal(g2.topics[0], 'Topic 01');
});

test('v3 9: a book written by weave-v2, with no raised and no notes, weaves and renders without error', async () => {
  await W.weaveBatch('sam', [K1], { vaultPath: vault });
  const file = path.join(dir, 'mentors', 'books', 'sam.json');
  const v2 = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete v2.raised;
  for (const s of v2.sources) delete s.notes;
  fs.writeFileSync(file, JSON.stringify(v2, null, 2));
  assert.deepEqual(await W.listRaised('sam'), []);
  assert.ok(W.mentorPage(v2, '2026-11-22', null).includes('## Chapters'), 'the mentor page renders');
  assert.ok(!W.mentorPage(v2, '2026-11-22', null).includes('## For your review'));
  breakers.sort = (r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: WHY }] });
  const rec = await W.weaveBatch('sam', [K2], { vaultPath: vault });
  const book = await W.getBook('sam');
  assert.equal(book.raised.length, 1);
  assert.deepEqual(book.sources[0].notes, undefined, 'the older source is left as the v2 book had it');
  assert.equal(book.sources[1].notes.length, 1);
  assert.match(read('Wiki/Mentors/Sam Host.md'), /## For your review/);
  await W.undoWeave(rec.batchId, { vaultPath: vault });
  assert.deepEqual(await W.getBook('sam'), v2, 'undo puts the v2 book back as it was');
});

test('v3: setRaisedStatus sets the status, renders the mentor page again, refuses while a weave runs, and an undo still restores the page', async () => {
  const snap0 = snapshot();
  breakers.sort = (r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: WHY, question: QUESTION }] });
  const rec = await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  await assert.rejects(W.setRaisedStatus('sam', 'R2.1', 'banana', { vaultPath: vault }), (e) => e.badRequest);
  await assert.rejects(W.setRaisedStatus('sam', 'R9.9', 'kept', { vaultPath: vault }), (e) => e.notFound);
  W._setActiveForTests('sam');
  await assert.rejects(W.setRaisedStatus('sam', 'R2.1', 'kept', { vaultPath: vault }), (e) => e.refused && /weave for this person is running/.test(e.message));
  W._resetWeaveForTests();
  await W.setRaisedStatus('sam', 'R2.1', 'kept', { vaultPath: vault });
  assert.match(read('Wiki/Mentors/Sam Host.md'), /Question: Do people correct a wrong guess faster than a right one\? \[kept\]\n/);
  assert.equal((await W.getBook('sam')).raised[0].status, 'kept');
  await W.setRaisedStatus('sam', 'R2.1', 'research', { vaultPath: vault });
  assert.match(read('Wiki/Mentors/Sam Host.md'), /\[research\]\n/);
  await W.setRaisedStatus('sam', 'R2.1', 'dismissed', { vaultPath: vault });
  assert.doesNotMatch(read('Wiki/Mentors/Sam Host.md'), /For your review|Labels name what you sense \(/);
  assert.equal((await W.listRaised('sam'))[0].status, 'dismissed', 'the list keeps every status');
  await W.setRaisedStatus('sam', 'R2.1', 'new', { vaultPath: vault });
  assert.doesNotMatch(read('Wiki/Mentors/Sam Host.md'), /\[kept\]/);
  const out = await W.undoWeave(rec.batchId, { vaultPath: vault });
  assert.deepEqual(out.left, []);
  assert.deepEqual(snapshot(), snap0, 'the undo still puts the vault back after his calls on a raised item');
});

test('v3: a mentor page he wrote is never replaced by a status change', async () => {
  breakers.sort = (r) => ({ ...r, notes: withoutId(r.notes, 'I2.1'), raise: [{ id: 'I2.1', why: WHY }] });
  await W.weaveBatch('sam', [K1, K2], { vaultPath: vault });
  fs.writeFileSync(path.join(vault, 'Wiki/Mentors/Sam Host.md'), '# Sam Host\n\nHis own page.\n');
  await assert.rejects(W.setRaisedStatus('sam', 'R2.1', 'kept', { vaultPath: vault }), /was not written by Mentors/);
  assert.equal((await W.getBook('sam')).raised[0].status, 'new');
  assert.equal(read('Wiki/Mentors/Sam Host.md'), '# Sam Host\n\nHis own page.\n');
});

test('v3: byPerson knows the followed person under the loose names the read uses, and no one else', () => {
  const yes = ['Jefferson Fisher', 'Jefferson', 'Fisher', 'Jefferson (reading the book)', 'Jefferson Fisher (leading), George Stern agrees', 'Vin and Jefferson', 'Crow, Fisher', 'Jefferson Fisher; interviewer', 'Sabrina Zohar, Jefferson Fisher'];
  const no = ['Guest', 'Adam', 'Martha Beck', 'unclear', 'unclear (female guest)', 'Guest (quoting the book)', 'Jeff Fisherman', '', null];
  for (const by of yes) assert.equal(W.byPerson(by, 'Jefferson Fisher'), true, String(by));
  for (const by of no) assert.equal(W.byPerson(by, 'Jefferson Fisher'), false, String(by));
  assert.equal(W.byPerson('Crow', 'Sheryl Crow'), true);
  assert.equal(W.byPerson('Madonna', 'Madonna'), true);
});
