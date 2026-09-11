// WHAT IS ON THE GLASS RIGHT NOW — the client's half.
//
// His 9-Sep ask, and the two constraints he added when I asked: the panels
// must land WITH the words ("simultaneously with the discussion"), and none
// may be dropped. So the frame is raised on time and the picture fills in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeBeat, railOf, stepsRevealed, mergeVisual, glassOf } from '../../src/glassBeats.js';

const beats = [{ at: 0 }, { at: 40 }, { at: 120 }, { at: 200 }];

test('the hero is the last panel whose prose has begun', () => {
  assert.equal(activeBeat(beats, 1), 0);
  assert.equal(activeBeat(beats, 41), 1);
  assert.equal(activeBeat(beats, 121), 2);
  assert.equal(activeBeat(beats, 9999), 3);
});

test('nothing is up before the first word is spoken', () => {
  assert.equal(activeBeat(beats, 0), -1);
  assert.equal(activeBeat([], 500), -1);
});

test('a panel introduced inside the sentence now playing is already the subject', () => {
  // the span 30-60 is being spoken and beat 1 begins at 40 — he is hearing it
  assert.equal(activeBeat(beats, 60), 1);
});

test('spent panels stack into the rail, newest first', () => {
  assert.deepEqual(railOf(beats, 3).map((b) => b.at), [120, 40, 0]);
  assert.deepEqual(railOf(beats, 3, 2).map((b) => b.at), [120, 40]);
  assert.deepEqual(railOf(beats, 0), []);
  assert.deepEqual(railOf(beats, -1), []);
});

// ---- his most specific request ----

const ITEMS = [{ name: 'Write two sentences on paper' }, { name: 'Say both before the meeting' }, { name: 'Ask which they are' }];

test('THE ASK: the list builds as he is read it', () => {
  assert.equal(stepsRevealed(ITEMS, ''), 0);
  assert.equal(stepsRevealed(ITEMS, 'First, write two sentences on a scrap of paper.'), 1);
  assert.equal(stepsRevealed(ITEMS, 'First, write two sentences on paper. Then say both of them before the meeting.'), 2);
  assert.equal(stepsRevealed(ITEMS, 'Write two sentences on paper. Say both before the meeting. Then ask me which they are.'), 3);
});

test('a list never un-writes itself', () => {
  // item 2 recognised before item 1's words happen to appear: the count still
  // covers everything up to it, because a vanishing line is worse than an
  // early one
  assert.equal(stepsRevealed(ITEMS, 'Say both before the meeting.'), 2);
});

test('unrelated speech reveals nothing', () => {
  assert.equal(stepsRevealed(ITEMS, 'The weather is quite good today.'), 0);
  assert.equal(stepsRevealed([], 'anything'), 0);
});

// ---- nothing dropped, nothing out of context ----

test('THE RULE: a panel is drawable the instant it is named, before its picture exists', () => {
  const spec = { kind: 'media', label: 'THE LEVERAGE IDEA', caption: 'do less, worth more', title: 'Hormozi' };
  const v = mergeVisual(spec, undefined);
  assert.equal(v.label, 'THE LEVERAGE IDEA');
  assert.equal(v.caption, 'do less, worth more');
  assert.equal(v.pending, true, 'the frame is up and honestly marked as still filling');
});

test('a typographic panel is never pending — it is whole on arrival', () => {
  assert.equal(mergeVisual({ kind: 'key', label: 'X', caption: 'c' }, undefined).pending, false);
});

test('the picture fills into the frame that is already up', () => {
  const spec = { kind: 'media', label: 'X', caption: 'c', title: 'Hormozi' };
  const v = mergeVisual(spec, { kind: 'media', src: '/api/briefing/media/k.jpg', stamp: '14:32', state: 'ready' });
  assert.equal(v.src, '/api/briefing/media/k.jpg');
  assert.equal(v.stamp, '14:32');
  assert.equal(v.pending, false);
});

test('a resolver that downgraded the kind wins over what the model asked for', () => {
  // resolveVisual turns an unfindable image into `key` so the glass shows the
  // words rather than a broken frame; the client must honour that
  const v = mergeVisual({ kind: 'image', label: 'X', caption: 'c', query: 'nothing' }, { kind: 'key', state: 'no-media' });
  assert.equal(v.kind, 'key');
});

test('no spec, no panel', () => {
  assert.equal(mergeVisual(null, { src: 'x' }), null);
});

// ---- the whole path, on the shape of a real Leader turn ----
//
// 11 Sep 2026. He was on the current build and still saw nothing, which ruled
// out the two bugs already fixed and left the layer nobody had tested: the
// view model that turns beats into what is actually drawn. This runs a turn
// shaped exactly like the one from his transcript — `title` instead of
// `label`, `items` on a `key` — from raw model output to hero and rail.
import { parseVisualStream } from '../../src/visualBeats.js';

const TURN = [
  'VIS {"kind":"key","title":"The read","items":["Your goal is set to convince him","For him this is about standing"]}',
  'The word convince is the problem. You asked how to persuade him otherwise.',
  'VIS {"kind":"steps","title":"The sequence","items":["Ask for advice, do not pitch","Name the best of his idea as his","Bring yours as a trial"]}',
  'Before the room, get ten minutes alone. Then take the best piece of his idea and say it is his. Then offer yours as something to try.',
  'VIS {"kind":"list","title":"The honest check","items":["Have you steelmanned his version?"]}',
  'One question worth sitting with before any of it.',
].join('\n');

test('THE WHOLE PATH: a real-shaped turn raises its panels in order', () => {
  const { text, beats } = parseVisualStream(TURN);
  assert.equal(beats.length, 3, 'all three parsed despite title/items');
  const st = { glassBeats: beats, glassVisuals: {}, voiceChat: [{ who: 'leader', text }] };

  assert.equal(glassOf({ ...st, glassSpokenTo: 0 }), null, 'nothing before the first word is spoken');

  const first = glassOf({ ...st, glassSpokenTo: 40 });
  assert.equal(first.hero.label, 'THE READ');
  assert.equal(first.hero.kind, 'list', 'a key carrying items is drawn as a list');
  assert.equal(first.rail.length, 0);

  const second = glassOf({ ...st, glassSpokenTo: beats[1].at + 60 });
  assert.equal(second.hero.label, 'THE SEQUENCE');
  assert.equal(second.rail.length, 1, 'the spent panel moved into the rail');

  const last = glassOf({ ...st, glassSpokenTo: text.length });
  assert.equal(last.hero.label, 'THE HONEST CHECK');
  assert.equal(last.rail.length, 2);
});

test('THE WHOLE PATH: the sequence builds as it is read to him', () => {
  const { text, beats } = parseVisualStream(TURN);
  const st = { glassBeats: beats, glassVisuals: {}, voiceChat: [{ who: 'leader', text }] };
  const at = (n) => glassOf({ ...st, glassSpokenTo: beats[1].at + n }).hero.revealed;
  // his words: "number one on its own while it was written to me, which would
  // then dynamically adjust to also display number two and number one
  // together when it began reading number 2 to me"
  assert.equal(at(20), 1, 'one on its own, as the passage opens');
  assert.equal(at(45), 2, 'two joins it as he is read further');
  assert.equal(at(130), 3, 'and all three by the end of its own passage');
  assert.ok(at(20) < at(45) && at(45) < at(130), 'it only ever grows');
});

test('THE WHOLE PATH: a panel is drawable before its picture exists', () => {
  const { text, beats } = parseVisualStream('VIS {"kind":"media","title":"Alex Hormozi on leverage","caption":"the bit worth hearing"}\nThere is an episode on exactly this.');
  const g = glassOf({ glassBeats: beats, glassVisuals: {}, glassSpokenTo: 999, voiceChat: [{ who: 'nova', text }] });
  assert.equal(g.hero.kind, 'media');
  assert.equal(g.hero.pending, true, 'the frame is up in context while the cover is still coming');
});
