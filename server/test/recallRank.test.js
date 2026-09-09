// WHAT SURVIVES INTO THE ANSWER — the sieve and the trust weighting.
//
// Measured on his real vault, 9 Sep 2026, before this existed: 47% of every
// recall slot went to `Raw/` transcript dumps, and 10 of 14 real queries led
// with one — usually a page titled "Original - 0974b9aa". Long text wins a
// term-frequency race against the short note that actually answers.
//
// The two failures pinned here are the ones that would make this worse than
// doing nothing: a query answered ONLY by transcripts coming back empty, and
// a clearly-better transcript being buried by a weak note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sieve, rankRecall, trustedScore, isBulk, BULK_TRUST } from '../lib/recallRank.js';

const raw = (id, score) => ({ id, type: 'raw', title: `Original - ${id}`, score });
const note = (id, score, type = 'topic') => ({ id, type, title: id, score });

// ---- the failures that must never happen ----

test('a query only transcripts can answer still returns them, in full', () => {
  const hits = [raw('a', 500), raw('b', 400), raw('c', 300), raw('d', 200)];
  const out = rankRecall(hits, 4);
  assert.equal(out.length, 4, 'the sieve must cap a majority, never manufacture an empty result');
  assert.deepEqual(out.map((h) => h.id), ['a', 'b', 'c', 'd']);
});

test('a decisively better transcript still outranks a weak note', () => {
  // 500 * 0.75 = 375, comfortably above a note scoring 120.
  const out = rankRecall([note('weak', 120), raw('strong', 500)], 2);
  assert.equal(out[0].id, 'strong');
});

// ---- the sieve ----

test('bulk takes at most half the slots when other things matched', () => {
  const hits = [
    raw('r1', 900), raw('r2', 880), raw('r3', 860), raw('r4', 840),
    note('n1', 300), note('n2', 290), note('n3', 280),
  ];
  const out = sieve(hits, 6);
  assert.equal(out.length, 6);
  assert.equal(out.filter(isBulk).length, 3, 'six slots means at most three transcripts');
  assert.deepEqual(out.map((h) => h.id), ['r1', 'r2', 'r3', 'n1', 'n2', 'n3']);
});

test('an odd limit rounds the cap DOWN, so notes keep the majority', () => {
  const hits = [
    raw('r1', 900), raw('r2', 880), raw('r3', 860),
    note('n1', 100), note('n2', 90), note('n3', 80),
  ];
  const out = sieve(hits, 5);
  assert.equal(out.filter(isBulk).length, 2, 'floor(5/2) = 2');
  assert.deepEqual(out.map((h) => h.id), ['r1', 'r2', 'n1', 'n2', 'n3']);
});

// The rule the first draft of these tests got wrong, written down so the next
// reader does not re-litigate it: the cap exists to stop volume steamrolling
// KNOWLEDGE. Where there is no knowledge competing for the slot, the cap
// protects nothing and would only throw away a real match — so bulk fills what
// nothing else claims. It caps a majority, it does not enforce a quota.
test('the cap binds only as far as alternatives actually exist', () => {
  const plenty = [raw('r1', 900), raw('r2', 880), raw('r3', 860), note('n1', 100), note('n2', 90), note('n3', 80)];
  assert.equal(sieve(plenty, 6).filter(isBulk).length, 3, 'three notes compete, so the cap holds');

  const scarce = [raw('r1', 900), raw('r2', 880), raw('r3', 860), raw('r4', 840), note('n1', 100)];
  const out = sieve(scarce, 6);
  assert.equal(out.length, 5, 'every match is still offered');
  assert.equal(out.filter(isBulk).length, 4, 'one note cannot hold four slots empty');
  assert.equal(out[0].id, 'r1');
});

test('deferred transcripts backfill in order when notes run out', () => {
  const hits = [raw('r1', 900), raw('r2', 880), raw('r3', 860), raw('r4', 840), note('n1', 100)];
  const out = sieve(hits, 4);
  // cap is 2; n1 fills the third slot; r3 backfills the fourth, r4 is cut.
  assert.deepEqual(out.map((h) => h.id), ['r1', 'r2', 'n1', 'r3']);
});

test('the sieve never invents, reorders beyond its rule, or duplicates', () => {
  const hits = [note('n1', 300), raw('r1', 900), note('n2', 200)];
  const out = sieve(hits, 6);
  assert.deepEqual(out.map((h) => h.id), ['n1', 'r1', 'n2']);
  assert.equal(new Set(out.map((h) => h.id)).size, out.length);
});

test('degenerate inputs are answered, not thrown at', () => {
  assert.deepEqual(sieve([], 6), []);
  assert.deepEqual(sieve(null, 6), []);
  assert.deepEqual(sieve([note('n', 1)], 0), []);
  assert.deepEqual(rankRecall(null, 6), []);
});

// ---- trust ----

test('a transcript is discounted; everything he wrote is not', () => {
  assert.equal(trustedScore(raw('r', 100)), 100 * BULK_TRUST);
  for (const type of ['topic', 'concept', 'source', 'journal', 'Health']) {
    assert.equal(trustedScore(note('n', 100, type)), 100, `${type} must not be discounted`);
  }
});

test('trust re-orders a near tie in the notes favour', () => {
  // The real shape of the defect: a long transcript edging out a real note.
  const out = rankRecall([raw('transcript', 320), note('the-answer', 300)], 2);
  assert.equal(out[0].id, 'the-answer', '320 * 0.75 = 240, below 300');
});

test('ranking is stable — equal trusted scores keep lexical order', () => {
  const out = rankRecall([note('first', 200), note('second', 200), note('third', 200)], 3);
  assert.deepEqual(out.map((h) => h.id), ['first', 'second', 'third']);
});

test('the score reported to callers stays the raw lexical one', () => {
  const out = rankRecall([raw('r', 400)], 1);
  assert.equal(out[0].score, 400, 'trust changes ORDER, never the number a caller reads');
});

// ---- the measured case, as a regression ----

test('the shape that produced "10 of 14 led with a transcript" now leads with the note', () => {
  // The real "training" query, as measured: five of six hits were transcripts
  // and the top hit was "Original - 0974b9aa".
  const hits = [
    raw('0974b9aa', 480), raw('d3ff7ec5', 460), raw('acd50085', 440),
    raw('76a3d3fa', 420), raw('2b1c04de', 400),
    note('Training Blocks', 410, 'topic'),
  ];
  const out = rankRecall(hits, 6);
  assert.equal(isBulk(out[0]), false, 'the top hit must not be a transcript dump');
  assert.equal(out[0].id, 'Training Blocks', '410 beats 480 * 0.75 = 360');
});

test('with real pages to compete, transcripts drop to half the answer', () => {
  // The same query once his vault has more than one written page on it —
  // this is the state the sieve is protecting.
  const hits = [
    raw('0974b9aa', 480), raw('d3ff7ec5', 460), raw('acd50085', 440), raw('76a3d3fa', 420),
    note('Training Blocks', 410, 'topic'), note('Deload', 380, 'concept'),
    note('2026-09-01', 300, 'journal'),
  ];
  const out = rankRecall(hits, 6);
  assert.equal(out.filter(isBulk).length, 3, 'at most half of six');
  assert.deepEqual(
    out.map((h) => h.id),
    ['Training Blocks', 'Deload', '0974b9aa', 'd3ff7ec5', 'acd50085', '2026-09-01'],
  );
});
