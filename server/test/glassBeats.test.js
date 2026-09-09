// WHAT IS ON THE GLASS RIGHT NOW — the client's half.
//
// His 9-Sep ask, and the two constraints he added when I asked: the panels
// must land WITH the words ("simultaneously with the discussion"), and none
// may be dropped. So the frame is raised on time and the picture fills in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeBeat, railOf, stepsRevealed, mergeVisual } from '../../src/glassBeats.js';

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
