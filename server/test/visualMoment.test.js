// THE EXACT MOMENT — 14:32, or nothing.
//
// His 9-Sep ask: when Nova names a podcast, put its cover up and mark the
// point where the idea is actually discussed, so he can go and hear it. His
// instruction when asked how far to go: real, or go and find it — never an
// estimate. A wrong timecode sends him to the wrong minute of an hour-long
// episode, which wastes more of his time than no timecode at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVtt, pickMoment, momentInNote, mmss, secondsOf } from '../../server/lib/visualMoment.js';

const VTT = `WEBVTT

00:00:10.000 --> 00:00:13.000
welcome back everyone to the show

00:00:13.000 --> 00:00:16.000
<00:00:13.500><c>a bit</c> of housekeeping first

00:14:30.000 --> 00:14:33.000
the idea of leverage is that

00:14:33.000 --> 00:14:36.000
you do less work for more output
`;

test('captions parse to plain cues, with the timing tags stripped', () => {
  const cues = parseVtt(VTT);
  assert.equal(cues.length, 4);
  assert.equal(cues[1].text, 'a bit of housekeeping first');
  assert.equal(cues[2].at, 14 * 60 + 30);
});

test('a rolling repeat is not counted twice', () => {
  const cues = parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nsame line\n\n00:00:02.000 --> 00:00:03.000\nsame line\n');
  assert.equal(cues.length, 1);
});

test('THE BUG: the playhead lands where the idea starts, not where its window does', () => {
  // The best-scoring six-cue window began at 0:10 — half a minute of
  // throat-clearing before the passage. It must narrow to the first cue that
  // actually carries the idea.
  const m = pickMoment(parseVtt(VTT), 'leverage doing less work for more output');
  assert.equal(m.stamp, '14:30');
  assert.equal(m.source, 'captions');
});

test('a phrase that is not in the episode gets no timecode at all', () => {
  assert.equal(pickMoment(parseVtt(VTT), 'protein synthesis in older adults'), null);
});

test('one word in common is a coincidence, not a citation', () => {
  assert.equal(pickMoment(parseVtt(VTT), 'leverage in commercial property financing arrangements'), null);
});

test('his own vault beats the captions — the Watcher already wrote the stamp', () => {
  const note = '- 14:32 — Leverage: doing less work for more output.\n- 22:10 — Something else entirely.';
  const m = momentInNote(note, 'leverage output');
  assert.equal(m.stamp, '14:32');
  assert.equal(m.source, 'vault');
});

test('THE BUG: one bullet cannot vouch for its neighbour\'s stamp', () => {
  const note = '- 14:32 — Leverage: doing less.\n- 22:10 — Output and margins.';
  assert.equal(momentInNote(note, 'output margins').stamp, '22:10');
});

test('a note with no matching idea yields nothing', () => {
  assert.equal(momentInNote('- 14:32 — Leverage.', 'protein synthesis in older adults'), null);
  assert.equal(momentInNote('', 'anything'), null);
});

test('stamps read the way he would say them', () => {
  assert.equal(mmss(872), '14:32');
  assert.equal(mmss(9), '0:09');
  assert.equal(mmss(3725), '1:02:05');
  assert.equal(secondsOf('14:32'), 872);
  assert.equal(secondsOf('1:02:05'), 3725);
  assert.equal(secondsOf('nonsense'), null);
});
