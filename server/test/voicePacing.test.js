// How soon Nova starts talking, and that he never goes quiet (18 Oct 2026):
// the pure helpers behind the streamed voice (src/voicePacing.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstClauseCut, artifactOpenerLine, ttsFetchesToStart, ttsFailureAction } from '../../src/voicePacing.js';

test('a long first sentence starts on its first clause', () => {
  const t = 'Your sleep was short this week, averaging six hours and ten minutes a night.';
  const cut = firstClauseCut(t);
  assert.equal(t.slice(0, cut), 'Your sleep was short this week, ');
  assert.equal(t.slice(cut), 'averaging six hours and ten minutes a night.');
});

test('it cuts while the sentence is still arriving, once it passes eight words', () => {
  assert.equal(firstClauseCut('Your sleep was short this week, averaging'), 0, 'seven words so far: wait');
  const t = 'Your sleep was short this week, averaging six hours and';
  assert.equal(t.slice(0, firstClauseCut(t)), 'Your sleep was short this week, ');
});

test('short sentences and short clauses are never cut', () => {
  assert.equal(firstClauseCut('Yes, sir.'), 0);
  assert.equal(firstClauseCut('Right, so the plan for tomorrow is a pull day with rows.'), 0, '"Right," is one word');
  assert.equal(firstClauseCut('Two sets of eight at sixty kilos then three of ten.'), 0, 'no clause mark');
});

test('numbers and times are not clause marks', () => {
  assert.equal(firstClauseCut('You walked 12,000 steps and slept until 6:30 this morning, which is good.'), 'You walked 12,000 steps and slept until 6:30 this morning, '.length);
});

test('a cut that would leave one word behind is not worth it', () => {
  assert.equal(firstClauseCut('The session went well overall and the bar moved fast, mostly.'), 0);
});

test('a reply that opens with a document says so at once, by name', () => {
  const p = '<<<ARTIFACT {"title":"Four-day upper/lower plan","kind":"doc"}\n# Four-day plan\nDay 1';
  assert.deepEqual(artifactOpenerLine(p), { line: "I've put that in a document: Four-day upper/lower plan.", titled: true, settled: true });
});

test('a header still arriving gives the untitled line, not yet settled', () => {
  const r = artifactOpenerLine('<<<ARTIFACT {"kind":"do');
  assert.equal(r.line, "I'm writing that up as a document.");
  assert.equal(r.titled, false);
  assert.equal(r.settled, false);
});

test('a finished header with no title has settled: the untitled line may go', () => {
  const r = artifactOpenerLine('<<<ARTIFACT {"kind":"doc"}\n');
  assert.equal(r.line, "I'm writing that up as a document.");
  assert.equal(r.settled, true);
});

test('prose before the document is spoken first, as today', () => {
  assert.equal(artifactOpenerLine('Here is the plan.\n<<<ARTIFACT {"title":"Plan"}\n# Plan'), null);
  assert.equal(artifactOpenerLine('Just an answer, no document.'), null);
});

test('a VIS line ahead of the document is not prose', () => {
  const p = 'VIS {"kind":"metric","label":"Sleep"}\n<<<ARTIFACT {"title":"Sleep review"}\n# Sleep';
  assert.equal(artifactOpenerLine(p)?.titled, true);
});

test('the title loses its own end punctuation before the line adds one', () => {
  assert.equal(artifactOpenerLine('<<<ARTIFACT {"title":"What to eat tonight?"}\n').line, "I've put that in a document: What to eat tonight.");
});

test('at most two fetches in flight, started in queue order', () => {
  const q = Array.from({ length: 6 }, (_, i) => ({ id: i, fetchState: 'waiting' }));
  assert.deepEqual(ttsFetchesToStart(q).map((e) => e.id), [0, 1]);
  assert.deepEqual(ttsFetchesToStart(q, { inFlight: 1 }).map((e) => e.id), [0]);
  q[0].fetchState = 'ok'; q[1].fetchState = 'fetching';
  assert.deepEqual(ttsFetchesToStart(q, { inFlight: 1 }).map((e) => e.id), [2]);
});

test('a refused sentence retries only at the head, after the one before has played', () => {
  const q = [{ id: 0, fetchState: 'ok' }, { id: 1, fetchState: 'retry', retryAt: 0 }, { id: 2, fetchState: 'waiting' }];
  assert.deepEqual(ttsFetchesToStart(q).map((e) => e.id), [2], 'not yet at the head');
  q.shift();
  assert.deepEqual(ttsFetchesToStart(q, { playing: true }).map((e) => e.id), [2], 'the sentence before is still playing');
  assert.deepEqual(ttsFetchesToStart(q, { playing: false }).map((e) => e.id), [1, 2]);
  q[0].retryAt = 5000;
  assert.deepEqual(ttsFetchesToStart(q, { now: 4000 }).map((e) => e.id), [2], 'not before its retry time');
});

test('what a failed fetch does next', () => {
  assert.equal(ttsFailureAction({ status: 503 }, 1), 'retry-later');
  assert.equal(ttsFailureAction({ status: 400 }, 1), 'retry-later');
  assert.equal(ttsFailureAction(new TypeError('Load failed'), 1), 'retry-now');
  assert.equal(ttsFailureAction({ status: 409 }, 1), 'give-up');
  assert.equal(ttsFailureAction({ status: 503 }, 2), 'give-up', 'one retry only');
});
