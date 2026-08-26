// Findings as pictures. The rule that keeps them honest: every number on a
// card comes off the finding object the spoken line was written from, so the
// picture and the sentence can never disagree — and a finding without the
// numbers gets NO card rather than an invented one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findingCard, auditCard, proteinWeekCard } from '../lib/findingCards.js';

test('the oversized-routine finding becomes the gap it describes', () => {
  // his real one: Upper Body lists 9, he finishes about 4.4
  const c = findingCard({ kind: 'routine-oversized', routineName: 'Upper Body', defined: 9, avg: 4.4, sessions: 8 });
  assert.equal(c.kind, 'bars');
  assert.deepEqual(c.bars.map((b) => [b.name, b.value]), [['Listed', 9], ['You finish', 4.4]]);
  assert.match(c.foot, /last 8 sessions/);
});

test('the effort ceiling becomes one figure, with the sample size on it', () => {
  const c = findingCard({ kind: 'effort-ceiling', pct: 88, sets: 323 });
  assert.equal(c.kind, 'metric');
  assert.equal(c.value, '88');
  assert.equal(c.unit, '%');
  assert.match(c.caption, /323/, 'the share is meaningless without what it is a share of');
});

test('volume findings chart him against the line, whichever side he is on', () => {
  const under = findingCard({ kind: 'under-volume', muscle: 'Chest', avg: 6, target: 12, weeks: 3 });
  assert.deepEqual(under.bars.map((b) => b.name), ['You', 'Target']);
  assert.equal(under.bars[1].value, 12);

  const junk = findingCard({ kind: 'junk-volume', muscle: 'Back', avg: 25, ceiling: 22, weeks: 2 });
  assert.deepEqual(junk.bars.map((b) => b.name), ['You', 'Ceiling']);
  assert.equal(junk.bars[1].value, 22);
});

test('a finding missing its numbers gets no card rather than a fabricated one', () => {
  assert.equal(findingCard({ kind: 'routine-oversized', routineName: 'X' }), null);
  assert.equal(findingCard({ kind: 'effort-ceiling' }), null);
  assert.equal(findingCard({ kind: 'stale', name: 'Bench' }), null);
  assert.equal(findingCard({ kind: 'under-volume', muscle: 'Chest', avg: 6 }), null, 'no target, no comparison');
  assert.equal(findingCard(null), null);
  assert.equal(findingCard({ kind: 'something-new' }), null, 'an unknown kind is not guessed at');
});

test('the audit draws all three states, so the clean ones are visible too', () => {
  const c = auditCard({ weekOf: '2026-08-24', checks: [
    { status: 'fired', label: 'A lift flat for three weeks' },
    { status: 'clear', label: 'x' }, { status: 'clear', label: 'y' },
    { status: 'not-yet', label: 'z' },
  ] });
  assert.deepEqual(c.bars.map((b) => [b.name, b.value]), [['Decide', 1], ['Clean', 2], ['Not yet', 1]]);
  assert.match(c.foot, /A lift flat for three weeks/);
});

test('a clean audit says so rather than drawing an empty chart', () => {
  const c = auditCard({ weekOf: '2026-08-24', checks: [{ status: 'clear', label: 'a' }] });
  assert.match(c.foot, /nothing needs a decision/);
  assert.equal(auditCard({ checks: [] }), null);
});

test('protein is charted per day against his floor, and colours the misses', () => {
  const c = proteinWeekCard({ floor: 150, days: [
    { label: 'Mon', p: 120 }, { label: 'Tue', p: 160 }, { label: 'Wed', p: 100 }, { label: 'Thu', p: 155 },
  ] });
  assert.equal(c.kind, 'bars');
  assert.deepEqual(c.bars.map((b) => b.tone), ['warn', 'good', 'warn', 'good']);
  assert.match(c.label, /150G FLOOR/i, 'barsCard uppercases labels — the floor still has to be in there');
  assert.match(c.foot, /2 of 4 days cleared it/);
});

test('protein needs at least two days to be a chart rather than a number', () => {
  assert.equal(proteinWeekCard({ floor: 150, days: [{ label: 'Mon', p: 120 }] }), null);
  assert.equal(proteinWeekCard(null), null);
  assert.equal(proteinWeekCard({ days: [] }), null);
});
