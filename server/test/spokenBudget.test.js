// THE SPOKEN BUDGET (1 Nov 2026). His report, hands-free with the Coach:
// "speaking for way too long", and "asking me questions but then didn't give
// me a chance to respond because then it moved onto the next thing". The
// Coach's spoken replies since 28 Oct ran median 242 words, max 519, and it
// never wrote the MORE line. Code now ends the turn: these pin where, that a
// question always ends it, that code's receipts are always said, and that the
// phone's stream cuts exactly where the server folds.
// NOVA_DATA_DIR is set BEFORE any server import (the 30-fake-greetings lesson).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-budget-'));
const { budgetCut, budgetFold, foldReply, spokenBudget, SPOKEN_WORDS, DEPTH_WORDS } = await import('../../src/turnFold.js');
const { resumeAt } = await import('../../src/voicePacing.js');
const { receiptLines } = await import('../lib/coachProposals.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const words = (t) => t.split(/\s+/).filter(Boolean).length;

// his real Coach reply, 1 Nov 14:36 (the question sat mid-reply, a receipt after it)
const REAL = `I checked how your exercise library files the Machine Shoulder Press first.

Yes, it will work. Campos 2020 found the front delt works harder as the press angle rises, and overhead is the highest. The machine gives a fixed path, so it is easy to progress and easy to keep clean.

I'm adding it as the last lift on Upper C, 3 sets of 8 to 12, with 2 minutes' rest. The chest press card for that slot was turned down at 1:30, so the slot is free and Upper C stays at six lifts. Front delts go from 4½ sets to 6. Chest drops from 9 to 6, which is still in range.

One catch. The library files this lift under Shoulders, not Front Delts. I've put a card up to file it under Front Delts.

Did you turn down the other two Upper C lifts, the pec deck and the chest-supported row, for the same reason as the schedule cards?

Done: Machine Shoulder Press is on Upper now, 3 sets of 8 to 12.`;

test('a short reply is untouched', () => {
  assert.deepEqual(budgetFold('Six sets a week. That is in range.'), { said: 'Six sets a week. That is in range.', held: null });
  assert.equal(budgetCut('Short.'), -1);
});

test('the real reply: spoken turn is short, the receipt is said, the question ends it', () => {
  const f = budgetFold(REAL, SPOKEN_WORDS);
  assert.ok(f.held, 'the detail is held for "go on"');
  assert.ok(words(f.said) < 110, `spoken ${words(f.said)} words`);
  assert.match(f.said, /Done: Machine Shoulder Press is on Upper now/);
  assert.match(f.said.trim(), /schedule cards\?$/, 'the question is the last thing he hears');
  assert.doesNotMatch(f.held, /schedule cards\?/, 'and is not repeated in the rest');
  assert.doesNotMatch(f.held, /^Done:/m);
  assert.match(f.held, /One catch/);
});

test('no question below the cut: the turn offers the rest', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} carries a few words of detail.`).join(' ');
  const f = budgetFold(long);
  assert.match(f.said, /Want the rest\?$/);
  assert.ok(f.held);
});

test('every receipt line code writes is recognised as one', () => {
  const lines = receiptLines({
    filed: [{ status: 'done', title: 'Add Machine Shoulder Press to Upper', route: 'x' }, { instructed: true, error: 'no slot', title: 'Move row' }],
    refused: [{ kind: 'format', proposal: null }],
  });
  assert.ok(lines.length >= 3);
  const body = `${Array.from({ length: 10 }, () => 'A sentence of ten words that only pads the reply out here.').join(' ')}\n\n${lines.join('\n')}`;
  const f = budgetFold(body);
  // said as one counted line; every receipt is kept, in the rest
  assert.match(f.said, /Done: 1 change to your program\. 2 changes did not land/);
  for (const l of lines) assert.ok(f.held.includes(l), `held: ${l}`);
});

test('he asked for depth: a longer budget', () => {
  assert.equal(spokenBudget('Walk me through what the plan found'), DEPTH_WORDS);
  assert.equal(spokenBudget('Add a front delt lift'), SPOKEN_WORDS);
});

test('the model folded it itself: its fold wins, the budget does nothing', () => {
  const t = `Short turn.\nMORE\n${'Detail sentence here. '.repeat(40)}`;
  const f = foldReply(t, { budget: 10 });
  assert.equal(f.said, 'Short turn.');
});

test('the stream cut is the server fold: prefix-stable as the reply grows', () => {
  const full = REAL;
  const cut = budgetCut(full);
  for (let n = 40; n < full.length; n += 17) {
    const c = budgetCut(full.slice(0, n));
    if (c !== -1) assert.equal(c, cut, `partial of ${n} chars`);
  }
  // what the stream speaks is a prefix of what the finished turn says
  assert.ok(budgetFold(full).said.startsWith(full.slice(0, cut).trimEnd()));
});

test('a rewrite that replaced the answer resumes at the first new sentence', () => {
  const said = 'Here is the plan. The press goes on Upper C. It takes the chest slot';
  assert.equal(resumeAt(said.slice(0, 18), said), 18, 'unchanged prefix: carry on');
  const next = 'Here is the plan. One thing needs fixing first. Upper C does not exist yet.';
  assert.equal(resumeAt('Here is the plan. The press goes on Upper C. ', next), 'Here is the plan. '.length);
  assert.equal(resumeAt('Totally different.', 'Another answer.'), 0);
});

test('wired: the server folds at the budget, files a rewrite\'s documents; the phone caps, resumes, and never flushes a document', () => {
  const cc = read('server/lib/claudeCode.js');
  assert.match(cc, /foldReply\(filed\.text, \{ budget: spokenBudget\(question\) \}\)/);
  assert.match(cc, /foldReply\(refold0\.said, \{ budget: spokenBudget\(asked \|\| question\) \}\)/);
  assert.match(cc, /const again = await fileArtifacts\(cwd, t,/);
  const app = read('src/App.jsx');
  assert.match(app, /budgetCut\(shown, spokenBudget\(question\)\)/);
  assert.match(app, /resumeAt\(stream\.saidText, speakable, stream\.spokenUpTo\)/);
  assert.match(app, /sameWidthTokens\(parseArtifactBlocks\(text, \{ final: true \}\)\.text\)/);
  assert.match(read('server/lib/talk.js'), /ONE QUESTION, AND IT ENDS YOUR TURN/);
});

test('his 1 Nov 15:14 turn: three Done lines are said as one, the list is held', async () => {
  const { summariseReceipts } = await import('../../src/turnFold.js');
  const t = `Checking Upper C against the plan first. Two lifts never landed, and the shoulder press went in first, not last.

The earlier cards were refused because Upper C didn't exist yet. It exists now, so I'm putting the row and the pec deck in, and moving the shoulder press to the end. Code will confirm what lands underneath.

Done: Chest-Supported Dumbbell Row is on Upper C now, 3 sets of 12. Done: Reverse Pec Deck is on Upper C now, 5 sets of 12 to 15. Done: Machine Shoulder Press is number 4 on Upper C now.

Want me to set those days on your schedule?`;
  const f = budgetFold(t);
  assert.equal((f.said.match(/Done:/g) || []).length, 1, f.said);
  assert.match(f.said, /Done: 3 changes to your program\./);
  assert.match(f.said.trim(), /schedule\?$/);
  assert.match(f.held, /Reverse Pec Deck is on Upper C now/);
  assert.deepEqual(summariseReceipts(['Done: a.']), { line: 'Done: a.', list: '' });
});

test('the document a reply carries goes on the stage, not only into the history', async () => {
  const { replyDocument } = await import('../../src/novaStageFacts.js');
  assert.equal(replyDocument('Here it is.\n[[artifact:8ad3db95]]\nIt shows Upper A.'), '8ad3db95');
  assert.equal(replyDocument('Writing.\n[[artifact:pending]]', [{ id: 'abcd1234' }]), 'abcd1234');
  assert.equal(replyDocument('No document here.'), null);
  const app = read('src/App.jsx');
  assert.match(app, /const docId = replyDocument\(text, job\.result\.artifacts\);/);
  const stage = read('src/NovaStage.jsx');
  assert.equal((stage.match(/<ArtifactCard key=\{T\.doc\.id\} id=\{T\.doc\.id\} compact \/>/g) || []).length, 2, 'speaking and ready');
  assert.match(read('src/vals/valsNovaThread.js'), /doc: st\.voiceDoc \|\| null/);
});

test('a document carries his local time, and every conversational agent is told to use it', () => {
  assert.match(read('server/lib/artifacts.js'), /created_local: createdLocal/);
  assert.match(read('server/lib/talk.js'), /HIS CLOCK, NOT THE FILE'S/);
});
