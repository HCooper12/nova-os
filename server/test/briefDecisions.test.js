// The brief's question-by-question close. His ask: stop handing him a wall of
// analysis to remember and act on later — ask the decisions one at a time,
// take the answer, move on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, questionFor, cardFor } from '../lib/briefDecisions.js';

const rec = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2, 8),
  kind: 'coach-program', status: 'pending', createdAt: '2026-08-20T09:00:00Z',
  text: 'Coach: Upper Body lists 9 exercises but you finish about 4.4 of them. Trimming it would make every session count.',
  ...over,
});

test('the consequential decisions are asked before the receipts', () => {
  const { decisions } = buildQueue([
    rec({ id: 'audit', kind: 'coach-audit', text: 'Coach: I ran 8 checks this week.' }),
    rec({ id: 'read', kind: 'read-next', text: 'Librarian: 3 sources reach for Deliberate Practice.' }),
    rec({ id: 'coach', kind: 'coach-program' }),
    rec({ id: 'fuel', kind: 'fuel-cross', text: 'Fuel × training: the 150g floor was missed on 10 of 13 days.' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['coach', 'fuel', 'read', 'audit']);
});

test('within a kind the one that has waited longest is asked first', () => {
  const { decisions } = buildQueue([
    rec({ id: 'new', createdAt: '2026-08-25T09:00:00Z' }),
    rec({ id: 'old', createdAt: '2026-08-01T09:00:00Z' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['old', 'new']);
});

test('only answerable records are queued — admin is not a decision', () => {
  const { decisions } = buildQueue([
    rec({ id: 'a' }),
    rec({ id: 'b', kind: 'capture', text: 'buy milk' }),
    rec({ id: 'c', kind: 'todo', text: 'call the bank' }),
    rec({ id: 'd', kind: 'research', text: 'creatine timing' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['a'], 'a capture waiting to be filed is not a question');
});

test('answered and empty records never come back', () => {
  const { decisions } = buildQueue([
    rec({ id: 'filed', status: 'filed' }),
    rec({ id: 'dismissed', status: 'dismissed' }),
    rec({ id: 'blank', text: '   ' }),
    rec({ id: 'live' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['live']);
});

test('the queue is capped, and says how many it did not ask', () => {
  const many = Array.from({ length: 9 }, (_, i) => rec({ id: `r${i}`, createdAt: `2026-08-0${i + 1}T09:00:00Z` }));
  const q = buildQueue(many, { cap: 5 });
  assert.equal(q.decisions.length, 5, 'nine questions is an interrogation, not a morning');
  assert.equal(q.total, 9);
  assert.equal(q.remaining, 4, 'the rest wait in the Inbox exactly as before');
});

test('each question restates its own subject — it cannot be a memory test', () => {
  const q = questionFor(rec());
  assert.match(q, /Upper Body/, 'the subject is in the question, not four beats back');
  assert.match(q, /\?$/);
});

test('a finding with a one-tap fix is asked as an action; one without is not', () => {
  assert.match(questionFor(rec({ fix: { action: 'drop' } })), /Shall I make that change/);
  assert.match(questionFor(rec({ fix: null })), /keep that on your list, or let it go/);
});

test('every decision carries a card, drawn from the finding where there is one', () => {
  const withFinding = rec({ finding: { kind: 'routine-oversized', routineName: 'Upper Body', defined: 9, avg: 4.4, sessions: 8 } });
  const c = cardFor(withFinding);
  assert.equal(c.kind, 'bars');
  assert.deepEqual(c.bars.map((b) => b.value), [9, 4.4], 'the real numbers, not a placeholder');

  // and a record with no finding still gets something honest to look at
  const plain = cardFor(rec({ finding: undefined }));
  assert.ok(plain && plain.label, 'a decision he cannot see is one he cannot make');
});

test('the audit decision shows what actually needs deciding', () => {
  const c = cardFor(rec({
    kind: 'coach-audit', text: 'Coach: I ran 8 checks.',
    meta: { checks: [{ status: 'fired' }, { status: 'clear' }, { status: 'clear' }, { status: 'not-yet' }] },
  }));
  assert.equal(c.value, '1');
  assert.match(c.foot, /2 clean/);
});

test('an empty inbox produces an empty queue, not a fabricated question', () => {
  assert.deepEqual(buildQueue([]), { decisions: [], total: 0, remaining: 0 });
  assert.deepEqual(buildQueue(null), { decisions: [], total: 0, remaining: 0 });
});
