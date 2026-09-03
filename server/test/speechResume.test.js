// The morning brief that vanished when he walked away.
//
// He pressed BRIEF ME, left the app while Nova was still reading, came back,
// and the rest of the brief was gone — no audio, no bar, no way to hear what
// he had missed. The replay bar existed but only armed when the browser
// REFUSED to start (autoplay blocked); speech that started and was then
// killed by the OS left nothing behind at all.
//
// The rule pinned here is the one that makes the fix honest: NOTHING assumes
// whether iOS keeps audio alive in the background. The queue is measured on
// the way out and again on the way back, and only a queue that did not move
// AT ALL counts as owed. A brief still happily talking must never be
// interrupted by a bar offering to replay it — that would be worse than the
// silence it fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unspokenTexts, resumeVerdict } from '../../src/speechResume.js';

const q = (...said) => said.map((s) => ({ said: s, done: true }));

test('what is unspoken is the sentence in the air plus the queue behind it', () => {
  assert.deepEqual(unspokenTexts('line one', q('line two', 'line three')),
    ['line one', 'line two', 'line three']);
});

test('nothing in the air still counts the queue', () => {
  assert.deepEqual(unspokenTexts(null, q('line two')), ['line two']);
  assert.deepEqual(unspokenTexts(null, []), []);
  assert.deepEqual(unspokenTexts(null, undefined), []);
});

test('a finalize barrier is not speech and is never replayed', () => {
  // these carry a reply's commit (panel, proposal, streaming:false) — putting
  // one in a replay would re-fire it
  const queue = [{ said: 'a real sentence', done: true }, { done: true, finalize: () => {} }];
  assert.deepEqual(unspokenTexts(null, queue), ['a real sentence']);
});

test('a queue that did not move at all is a stall — those words are owed', () => {
  const before = ['one', 'two', 'three'];
  assert.equal(resumeVerdict(before, ['one', 'two', 'three']), 'stalled');
});

test('a queue that advanced is still speaking and must be left alone', () => {
  assert.equal(resumeVerdict(['one', 'two', 'three'], ['three']), 'progressing');
});

test('a queue that drained completely owes nothing', () => {
  assert.equal(resumeVerdict(['one', 'two'], []), 'none');
  assert.equal(resumeVerdict([], ['anything']), 'none', 'he was not mid-speech when he left');
});

test('speech that finished and was replaced by NEW speech is not a stall', () => {
  // the brief played out while he was away and a fresh reply queued exactly
  // as many lines — same depth, different words. Interrupting that with a
  // replay bar for the old brief would be a lie about what is unheard.
  assert.equal(resumeVerdict(['one', 'two'], ['a new reply', 'its second line']), 'progressing');
  assert.equal(resumeVerdict(['one', 'two'], ['one', 'two', 'three']), 'progressing', 'more queued than before');
});

test('the real case: iOS killed a six-line brief mid-sentence', () => {
  const brief = ['Good morning, sir.', 'You are running on about four hours sleep.',
    'The debrief from last night is filed.', 'HRV is 72.',
    "Today it is Nanna and Pa's wedding anniversary.", 'Next is Get ready at 4:30 am.'];
  // he left on sentence two; nothing advanced while the app was backgrounded
  const left = unspokenTexts(brief[1], q(...brief.slice(2)));
  assert.equal(resumeVerdict(left, left.slice()), 'stalled');
  assert.equal(left.length, 5, 'the sentence he half-heard is replayed whole, not from its middle');
});
