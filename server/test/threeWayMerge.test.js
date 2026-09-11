// The merge's whole job is to tell a real collision from an imaginary one.
// The cases below are the shapes his vault actually produces: a weave adding
// bullets to index.md's sections while journal.js upserts one bullet in
// `## Journal`, and both sides appending a dated block to log.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeText } from '../lib/threeWayMerge.js';

const INDEX = `# Index

## Journal
- [[2026-09-10]] — 2 entries, latest: went for a walk (updated 2026-09-10)

## Sources
- [[We Ranked the BEST Exercises]] — three picks per muscle group (updated 2026-09-03)

## Entities
- [[Andy Galpin]] — human performance scientist (updated 2026-08-14)
`;

test('the real case: a weave adds bullets while the journal upserts its own', () => {
  // journal.js: the `## Journal` bullet is rewritten for a new entry
  const live = INDEX.replace(
    '- [[2026-09-10]] — 2 entries, latest: went for a walk (updated 2026-09-10)',
    '- [[2026-09-10]] — 3 entries, latest: finished the upper body session (updated 2026-09-10)');
  // the weave: one new Source, one new Entity — nowhere near the journal
  const staged = INDEX
    .replace('## Entities\n', '- [[Disarming Disrespect]] — a trial lawyer\'s method (updated 2026-09-11)\n\n## Entities\n')
    .replace('- [[Andy Galpin]] — human performance scientist (updated 2026-08-14)\n',
      '- [[Andy Galpin]] — human performance scientist (updated 2026-08-14)\n- [[Jefferson Fisher]] — trial attorney (updated 2026-09-11)\n');

  const r = mergeText(INDEX, live, staged);
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /3 entries, latest: finished the upper body session/, "his newer journal bullet survived");
  assert.match(r.text, /Disarming Disrespect/, 'and the weave landed its Source');
  assert.match(r.text, /Jefferson Fisher/, 'and its Entity');
  assert.equal(r.text.endsWith('\n'), true, 'trailing newline preserved');
});

test('both appending to log.md keeps both blocks — an append can never overwrite', () => {
  const base = '- Notes: yesterday\n';
  const live = '- Notes: yesterday\n\n## [2026-09-11] journal | an entry Nova filed\n- Notes: via Nova.\n';
  const staged = '- Notes: yesterday\n\n## [2026-09-11] ingest | Jefferson Fisher\n- Created: six concepts.\n';
  const r = mergeText(base, live, staged);
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /journal \| an entry Nova filed/);
  assert.match(r.text, /ingest \| Jefferson Fisher/);
  assert.ok(r.text.indexOf('journal | an entry') < r.text.indexOf('ingest | Jefferson'),
    'what already landed stays put; the staged block follows');
});

test('a genuine collision still refuses, and says where', () => {
  const base = 'a\nb\nc\n';
  const r = mergeText(base, 'a\nHIS EDIT\nc\n', 'a\nTHE WEAVE\nc\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /same passage/);
  assert.match(r.reason, /line 2/);
});

test('an insertion inside a passage the other side rewrote is a collision', () => {
  const base = 'one\ntwo\nthree\nfour\n';
  const live = 'one\nREWRITTEN\nfour\n';              // replaced two..three
  const staged = 'one\ntwo\ninserted\nthree\nfour\n';  // inserted between them
  assert.equal(mergeText(base, live, staged).ok, false);
});

test('the same edit made by both sides is applied once', () => {
  const base = 'a\nc\n';
  const both = 'a\nb\nc\n';
  const r = mergeText(base, both, both);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'a\nb\nc\n', 'not a duplicated b');
  assert.equal(r.merges, 0, 'nothing had to be reconciled');
});

test('no drift at all is a clean pass-through', () => {
  const r = mergeText('a\n', 'a\n', 'a\nb\n');
  assert.equal(r.ok, true);
  assert.equal(r.text, 'a\nb\n');
  assert.equal(r.merges, 0);
});

test('a side that only deleted, and a side that only added elsewhere, both hold', () => {
  const base = 'keep\ndrop\nkeep2\n';
  const r = mergeText(base, 'keep\nkeep2\n', 'keep\ndrop\nkeep2\nadded\n');
  assert.equal(r.ok, true);
  assert.equal(r.text, 'keep\nkeep2\nadded\n');
});

test('no common version to merge from refuses rather than guessing', () => {
  assert.equal(mergeText(null, 'a\n', 'b\n').ok, false);
});

test('a file too large to align line by line refuses instead of stalling', () => {
  const big = Array.from({ length: 6100 }, (_, i) => `line ${i}`).join('\n');
  const r = mergeText(big, big + '\nlive', big + '\nstaged');
  assert.equal(r.ok, false);
  assert.match(r.reason, /too large/);
});
