import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No claude CLI: the spawn is a stand-in that records its arguments and
// answers with a canned envelope. The data dir is set BEFORE any import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-read-'));
process.env.NOVA_DATA_DIR = dir;
const PILOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'mentors-pilot', 'output', 'Reading notes - Chris Voss episode.md');

let Rd;
let MP;
let spawns;
let reply;
before(async () => {
  Rd = await import('../lib/mentorRead.js');
  MP = await import('../lib/modelPrefs.js');
  (await import('../lib/spawnBoundary.js'))._setEffortSupportedForTest(true);
});
after(async () => {
  Rd._setReadDepsForTest(null);
  await (await import('../lib/modelSpend.js'))._flushSpend();
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeSpawn(bin, args, opts) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const call = { bin, args, opts, input: '' };
  spawns.push(call);
  child.stdin = {
    on() {},
    end(input) {
      call.input = String(input || '');
      setImmediate(() => {
        const text = typeof reply === 'function' ? reply(call) : reply;
        child.stdout.emit('data', JSON.stringify({ type: 'result', is_error: false, result: text, total_cost_usd: 0.0412, duration_ms: 900, modelUsage: { 'claude-sonnet-5': { outputTokens: 10 } } }));
        child.emit('close', 0);
      });
    },
  };
  return child;
}

const NOTES = `## Summary
He explains why no feels safe. Then labels. Then voice.

## People
- Chris Voss | guest | introduced at the start

## Ideas
### No feels safe
People relax when they can say no.
By: Chris Voss | [00:10]

## Frameworks
### Labeling
Use when: you sense an emotion.
Steps:
1. Notice it.
2. Say it.
Shape: steps
By: Chris Voss | [00:40]

## Scripts
- Situation: a call | Say: "is now a bad time to talk" | Instead of: "got a minute" | By: Chris Voss | [00:20]
- Situation: invented | Say: "this sentence was never said by anyone at all" | Instead of: none | By: unclear | [00:50]

## Stories and examples
- The hospital nurse said no. [00:30]

## Lines
- "people feel safe when they say no" | By: Chris Voss | [00:15]
- "a line the model made up out of thin air entirely" | By: unclear | [00:45]

## References
- Never Split the Difference | Voss | [00:05]

## Applications
- A hard call: ask a no question.

## Open questions
none
`;
const TRANSCRIPT = `[00:00] Welcome back. Today, Chris Voss.
[00:12] Here's the thing: People feel safe when they say no.
[00:31] So I texted her, "Is now a bad time to talk?" And she called at three.`;

beforeEach(() => {
  spawns = [];
  reply = NOTES;
  Rd._setReadDepsForTest({ spawn: fakeSpawn, now: () => Date.parse('2026-11-21T10:00:00Z') });
});

test('parseNotes on the real pilot notes: people, ideas, frameworks, scripts with words, lines', () => {
  const p = Rd.parseNotes(fs.readFileSync(PILOT, 'utf8'));
  assert.ok(p.summary.startsWith('Jefferson Fisher interviews'));
  assert.ok(p.people.some((x) => x.name === 'Chris Voss' && x.role === 'guest'));
  assert.ok(p.ideas.length >= 5, `${p.ideas.length} ideas`);
  assert.equal(p.ideas[0].name, 'Fear voice versus gut');
  assert.equal(p.ideas[0].by, 'Chris Voss');
  assert.equal(p.ideas[0].at, '02:46');
  assert.equal(p.frameworks.length, 4);
  assert.equal(p.frameworks[0].shape, 'steps');
  assert.equal(p.frameworks[0].steps.length, 4);
  assert.ok(p.frameworks[0].useWhen.startsWith('opening a negotiation'));
  assert.ok(p.scripts.length >= 10);
  assert.ok(p.scripts.every((s) => s.say && !s.say.startsWith('"')));
  assert.equal(p.scripts[0].say, 'is now a bad time to talk');
  assert.equal(p.scripts[0].insteadOf, 'have you got a few minutes to talk');
  assert.equal(p.scripts[1].insteadOf, null, '"none" is no alternative');
  assert.equal(p.lines.length, 11);
  assert.equal(p.lines[1].quote, 'what is behind what somebody said is always more important than what they said');
  assert.ok(p.stories.length >= 5 && p.stories[0].at === '08:57');
  assert.ok(p.references.length >= 10);
});

test('parseNotes is tolerant: missing headings are empty lists, never a throw', () => {
  const p = Rd.parseNotes('## Summary\nJust this.\n');
  assert.equal(p.summary, 'Just this.');
  for (const k of ['people', 'ideas', 'frameworks', 'scripts', 'stories', 'lines', 'references']) assert.deepEqual(p[k], [], k);
  assert.doesNotThrow(() => Rd.parseNotes(''));
  assert.doesNotThrow(() => Rd.parseNotes(null));
});

test('verifyNotes keeps the transcript\'s own words and minute, and marks an invented line unverified', () => {
  const p = Rd.parseNotes(NOTES);
  const c = Rd.verifyNotes(p, TRANSCRIPT);
  assert.deepEqual(c, { lines: 2, verifiedLines: 1, scripts: 2, verifiedScripts: 1 });
  assert.equal(p.lines[0].verified, true);
  assert.equal(p.lines[0].quote, 'People feel safe when they say no.', 'the source\'s spelling, not the model\'s');
  assert.equal(p.lines[0].at, '0:12');
  assert.equal(p.lines[1].verified, false);
  assert.equal(p.lines[1].quote, 'a line the model made up out of thin air entirely');
  assert.equal(p.scripts[0].say, 'Is now a bad time to talk?');
  assert.equal(p.scripts[0].at, '0:31');
  assert.equal(p.scripts[1].verified, false);
});

test('a long transcript is read in parts cut on lines, each told its part, joined by code under each heading', () => {
  const line = (i) => `[${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}] ${'word '.repeat(190)}${i}`;
  const big = Array.from({ length: 160 }, (_, i) => line(i)).join('\n');
  assert.ok(big.length > 150_000);
  const parts = Rd.splitTranscript(big);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 120_000));
  assert.equal(parts.join('\n'), big, 'cut on line boundaries, nothing lost');
  assert.deepEqual(Rd.splitTranscript('short'), ['short']);
  const meta = { title: 'T', channel: 'C', uploadDate: '20261101', durationSec: 600, url: 'u', description: '' };
  const one = Rd.readPrompt(meta, 'X');
  const two = Rd.readPrompt(meta, 'X', { i: 2, n: 3 });
  assert.equal(two, one.replace('\nSOURCE\n', '\nSOURCE\nThis is part 2 of 3 of the transcript.\n'), 'one extra line, nothing else changed');
  const joined = Rd.joinNotes([
    '## Summary\nOne. Two.\n\n## Ideas\n### A\ntext a\nBy: x | [00:01]\n\n## Lines\n- "a" | By: x | [00:01]',
    '## Summary\nThree.\n\n## Ideas\n### B\ntext b\nBy: y | [40:00]\n\n## Lines\n- "b" | By: y | [40:00]',
  ]);
  const p = Rd.parseNotes(joined);
  assert.equal(p.summary, 'One. Two. Three.');
  assert.deepEqual(p.ideas.map((i) => i.name), ['A', 'B']);
  assert.deepEqual(p.lines.map((l) => l.quote), ['a', 'b']);
});

test('readSource: parts read in turn, each prompt the measured one with its part line', async () => {
  const line = (i) => `[${String(i).padStart(2, '0')}:00] ${'word '.repeat(190)}${i}`;
  const big = Array.from({ length: 160 }, (_, i) => line(i % 99)).join('\n');
  const r = await Rd.readSource({ key: 'yt:big', title: 'Big one', show: 'Show', publishedAt: '2026-10-01T00:00:00Z', durationSec: 9000, url: 'https://www.youtube.com/watch?v=big' }, big);
  assert.equal(r.parts, 2);
  assert.equal(spawns.length, 2);
  assert.match(spawns[0].input, /\nSOURCE\nThis is part 1 of 2 of the transcript\.\nTitle: Big one\nChannel: Show\nPublished: 20261001\nLength: 150 minutes\n/);
  assert.match(spawns[1].input, /This is part 2 of 2 of the transcript\./);
  assert.equal(r.costUsd, 0.0824);
});

test('NEVER FABLE: with the board set to Fable for this lane, the model passed to the CLI is not Fable', async () => {
  await MP.setLanePref('mentor-read', { model: 'fable' });
  assert.equal(MP.modelFor('mentor-read'), 'fable', 'the board really says Fable');
  const choice = Rd.mentorModelChoice();
  assert.equal(choice.model, 'sonnet');
  assert.match(choice.why, /never runs on Fable/);
  const r = await Rd.readSource({ key: 'yt:abc', title: 'A', durationSec: 60 }, TRANSCRIPT);
  const args = spawns[0].args;
  const model = args[args.indexOf('--model') + 1];
  assert.equal(model, 'sonnet');
  assert.ok(!args.some((a) => /fable|mythos/i.test(a)), `no Fable anywhere in ${args.join(' ')}`);
  assert.equal(r.model, 'sonnet');
  assert.match(r.modelWhy, /fable/);
  const saved = JSON.parse(fs.readFileSync(r.jsonPath, 'utf8'));
  assert.match(saved.modelWhy, /never runs on Fable/, 'the run records why');
  // a pinned Fable id and the Mythos name are refused the same way; another model is honoured
  await MP.setLanePref('mentor-read', { model: 'claude-fable-5' });
  assert.equal(Rd.mentorModel(), 'sonnet');
  await MP.setLanePref('mentor-read', { model: 'opus' });
  assert.equal(Rd.mentorModel(), 'opus');
  await MP.setLanePref('mentor-read', { model: 'sonnet' });
  // the pilot's flags: zero tools, the lane's effort, prompt on stdin
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(args[args.indexOf('--effort') + 1], 'low');
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'You are a careful reader who writes complete, faithful notes from a transcript. You follow the requested format exactly.');
  assert.ok(spawns[0].input.startsWith('You are reading one source for a personal knowledge vault.'));
});

test('a reply without its Ideas section is a failure', async () => {
  reply = '## Summary\nSomething.\n\n## People\n- x | host | y';
  await assert.rejects(Rd.readSource({ key: 'yt:noideas', title: 'N' }, TRANSCRIPT), /the read came back without its Ideas section/);
  assert.equal(fs.existsSync(path.join(dir, 'mentors', 'notes', 'yt_noideas.read-v1.md')), false);
});

test('notes and JSON are written where stated, with counts, cost and model', async () => {
  reply = `Here are the notes.\n${NOTES}`;
  const r = await Rd.readSource({ key: 'pod:ab12cd34:0123456789ab', title: 'Episode', durationSec: 600 }, TRANSCRIPT);
  assert.equal(r.notesPath, path.join(dir, 'mentors', 'notes', 'pod_ab12cd34_0123456789ab.read-v1.md'));
  assert.equal(r.jsonPath, path.join(dir, 'mentors', 'notes', 'pod_ab12cd34_0123456789ab.read-v1.json'));
  assert.ok(fs.readFileSync(r.notesPath, 'utf8').startsWith('## Summary'), 'anything before the Summary is dropped');
  const j = JSON.parse(fs.readFileSync(r.jsonPath, 'utf8'));
  assert.equal(j.version, 'read-v1');
  assert.equal(j.key, 'pod:ab12cd34:0123456789ab');
  assert.equal(j.costUsd, 0.0412);
  assert.equal(j.model, 'sonnet');
  assert.equal(j.parsed.lines[0].quote, 'People feel safe when they say no.');
  assert.deepEqual(r.counts, { ideas: 1, frameworks: 1, scripts: 2, lines: 2, verifiedLines: 1, verifiedScripts: 1 });
  assert.equal(r.costUsd, 0.0412);
  assert.equal(r.parts, 1);
});

/* ------------------------- short lines, ellipses, split says ------------------------- */

const SHORT_T = `[00:10] we opened with some small talk about the weather and the trip
[05:00] when she asks you to join you can just say no thank you and mean it
[15:30] at the very end he warned that no thank you can sound cold if you rush it
`;
const shortNotes = (say, at) => `## Scripts\n- Situation: invited | Say: "${say}" | Instead of: none | By: Sam | [${at}]\n\n## Lines\n- "${say}" | By: Sam | [${at}]\n`;

test('verifyNotes: a 2 or 3 word script verifies only near its cited minute, and takes the transcript\'s own words', () => {
  const near = Rd.parseNotes(shortNotes('No, thank you.', '05:05'));
  Rd.verifyNotes(near, SHORT_T);
  assert.equal(near.scripts[0].verified, true);
  assert.equal(near.scripts[0].say, 'no thank you');
  assert.equal(near.scripts[0].at, '5:00');
  const far = Rd.parseNotes(shortNotes('No, thank you.', '10:00'));
  Rd.verifyNotes(far, SHORT_T);
  assert.equal(far.scripts[0].verified, false, 'five minutes from both places it appears');
  assert.equal(far.scripts[0].say, 'No, thank you.');
});

test('verifyNotes: a one word quote is never verified', () => {
  const p = Rd.parseNotes(shortNotes('Regardless.', '00:10'));
  const c = Rd.verifyNotes(p, '[00:10] regardless of that we went on to the next thing for a while\n');
  assert.equal(p.scripts[0].verified, false);
  assert.equal(p.lines[0].verified, false);
  assert.equal(c.verifiedScripts + c.verifiedLines, 0);
});

const ELL_T = `[00:20] and the reason he gave was that I've thought about it for a long time
[01:20] later on a different subject came up and we moved to something else entirely
[02:20] then at the end he finally said we should all just go home and rest
`;
test('verifyNotes: an ellipsis never survives; one stretch of speech keeps the transcript\'s own words, two moments are held with the reason', () => {
  const p = Rd.parseNotes(`## Lines\n- "to... I've thought about it for a long time" | By: Sam | [00:20]\n- "and the reason he gave... we should all just go home and rest" | By: Sam | [00:20]\n- "I've thought about it... go home and rest" | By: Sam | [00:20]\n`);
  Rd.verifyNotes(p, ELL_T);
  const [one, two, three] = p.lines;
  assert.equal(one.verified, true);
  assert.equal(one.quote, "I've thought about it for a long time");
  assert.ok(!/\.{3}|…/.test(one.quote));
  assert.equal(two.verified, false);
  assert.equal(two.heldWhy, 'it joins two separate moments of the transcript');
  assert.equal(three.verified, false);
  assert.equal(three.heldWhy, 'it joins two separate moments of the transcript');
});

test('verifyNotes: an ellipsis quote over a transcript whose tokens do not line up one for one is held with the reason', () => {
  // "foo' 'bar" normalises to two words in the line but three raw tokens drift, so no alignment
  const odd = "[00:20] the reason foo' 'bar was that I thought about it for a long time\n";
  const p = Rd.parseNotes("## Lines\n- \"the reason foo' 'bar... thought about it for a long time\" | By: Sam | [00:20]\n- \"the reason foo' 'bar was that I thought about it\" | By: Sam | [00:20]\n");
  Rd.verifyNotes(p, odd);
  assert.equal(p.lines[0].verified, false);
  assert.equal(p.lines[0].heldWhy, 'its words could not be matched to the transcript one for one');
  assert.equal(p.lines[1].verified, true, 'without an ellipsis the model\'s words are still checked as before');
});

test('parseNotes: a Say with two quoted spans is two scripts with the same situation, by and time; one span or none is as before', () => {
  const p = Rd.parseNotes(`## Scripts
- Situation: pushback | Say: "No." or "Thank you for asking, and no." | Instead of: "Maybe later" | By: Sam | [04:10]
- Situation: calm | Say: "Let me think about it." | Instead of: none | By: Sam | [05:10]
- Situation: bare | Say: just stay quiet | Instead of: none | By: Sam | [06:10]
- Situation: nested | Say: "He said "hi" there" | Instead of: none | By: Sam | [07:10]
`);
  assert.deepEqual(p.scripts.map((s) => s.say), ['No.', 'Thank you for asking, and no.', 'Let me think about it.', 'just stay quiet', 'He said "hi" there']);
  assert.deepEqual(p.scripts.slice(0, 2).map((s) => [s.situation, s.insteadOf, s.by, s.at]), [['pushback', 'Maybe later', 'Sam', '04:10'], ['pushback', 'Maybe later', 'Sam', '04:10']]);
});
