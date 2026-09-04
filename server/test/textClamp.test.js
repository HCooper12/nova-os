// Clamping prose without cutting a word in half.
//
// His report, 4 Sep: an inbox title read "…something new or actionable s ▸".
// A bare slice(0, 60) applied to prose lands wherever it lands, leaves a
// stray letter, and — worse — leaves no ellipsis, so nothing tells the reader
// the text was cut. The row simply looked corrupt.
//
// Cosmetic failures are the easiest kind to reintroduce, because nothing
// breaks when they come back. Hence a test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampWords } from '../../src/textClamp.js';

test('the real case no longer cuts mid-word', () => {
  const t = 'Standing: Compose a dispatch only when it contains something new or actionable so it earns the interruption';
  const out = clampWords(t, 60);
  assert.ok(out.endsWith('…'), 'a clamped string must say it was clamped');
  assert.ok(!/\bs…$/.test(out), 'must not end on a stray letter');
  assert.ok(t.startsWith(out.slice(0, -1)), 'the kept text must be a real prefix of the original');
  assert.ok(out.length <= 61);
});

test('text within budget is returned untouched, with no ellipsis', () => {
  assert.equal(clampWords('Short title', 60), 'Short title');
  assert.equal(clampWords('Backfill the step count for 2026-09-03', 60), 'Backfill the step count for 2026-09-03');
});

test('a single over-long word is cut rather than dropped', () => {
  // honouring the word boundary here would return almost nothing
  const out = clampWords('Supercalifragilisticexpialidocious', 20);
  assert.equal(out, 'Supercalifragilistic…');
});

test('trailing punctuation does not strand before the ellipsis', () => {
  const out = clampWords('Review the plan, then send it to the team about the thing', 20);
  assert.ok(!/[,\s]…$/.test(out), `got ${out}`);
});

test('whitespace is normalised, so a wrapped title measures honestly', () => {
  assert.equal(clampWords('  Review   the\n  plan  ', 60), 'Review the plan');
});

test('empty and nullish inputs are safe', () => {
  assert.equal(clampWords(''), '');
  assert.equal(clampWords(null), '');
  assert.equal(clampWords(undefined), '');
});
