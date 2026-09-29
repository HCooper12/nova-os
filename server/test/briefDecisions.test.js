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

// THE CUT (audit 05-voice finding 10). His real morning: the program audit's
// line is one list joined by semicolons with no full stop inside 150
// characters, and the question was built from character 150 on — mid-list,
// two words into an item, the question glued on with no punctuation.
import { summarise } from '../lib/coachProgramAudit.js';

const spoken = (q, ending) => {
  assert.ok(q.endsWith(ending), `ends with its question: ${q}`);
  return q.slice(0, -ending.length).trimEnd();
};

test('the program audit line is cut on a clause, says so, and the question is its own sentence', () => {
  const L = (label, detail) => ({ label, detail });
  const summary = summarise({
    fired: [L('A goal muscle chronically short'), L('Training too close to failure, too often'), L('A lift flat for three weeks or more')],
    clear: [L('a'), L('b'), L('c'), L('d')],
    notYet: [L('A muscle past the point more sets help', 'needs three weeks of rated sets')],
  });
  assert.ok(summary.length > 150 && !/[.!?]\s/.test(summary.slice(0, 151)), 'the shape that broke: no full stop inside 150');
  const q = questionFor(rec({ kind: 'coach-audit', text: `Coach: ${summary}` }));
  const said = spoken(q, ' Happy for me to file that, sir?');
  assert.ok(said.endsWith('…'), `a cut says it was cut: ${said}`);
  const kept = said.slice(0, -1);
  assert.ok(summary.startsWith(kept), 'the kept text is the start of the real line, unaltered');
  assert.match(summary.slice(kept.length), /^(?:[,;:]\s|\sand\s)/, 'it ends where a clause ends');
  assert.ok(kept.length >= 20 && kept.length <= 150);
  assert.doesNotMatch(q, /[a-z] Happy/, 'never glued straight onto a half-phrase');
  // the old helper's output, for the record: mid-item, no punctuation
  assert.notEqual(said, summary.slice(0, 150).trim());
});

test('with no clause to cut on, the cut lands between words and never parts a number from its unit', () => {
  // build a line whose 150th-character word boundary falls between "84" and "g"
  let head = 'You ran short on protein';
  while (head.length < 144) head += ' again';
  const text = `${head} by 84 g most days this block while the plan asked for more`;
  const at = text.indexOf(' g most');
  assert.ok(at >= 140 && at <= 150, `the trap sits at the limit (${at})`);
  const said = spoken(questionFor(rec({ kind: 'fuel-cross', text })), ' Worth acting on, or shall I drop it?');
  assert.ok(said.endsWith('…'));
  const kept = said.slice(0, -1);
  assert.ok(text.startsWith(kept) && text[kept.length] === ' ', 'a whole-word cut, never mid-word');
  assert.doesNotMatch(kept, /\d$/, '"…by 84" with its unit cut away is not a quantity');
});

test('" and " between two numbers is not a clause', () => {
  let text = 'Your working sets sit between 6';
  const tail = ' and 8 reps';
  while ((text + tail).length < 150) text = text.replace('Your', 'Your heavy');
  text = `${text}${tail} on every lift in the block which leaves little room to push the top end`;
  const said = spoken(questionFor(rec({ kind: 'read-next', text })), ' Shall I keep that as your next read?');
  assert.doesNotMatch(said, /\d…$/, `not cut inside "6 and 8": ${said}`);
});

test('a short line with no full stop still ends before its question starts', () => {
  assert.equal(questionFor(rec({ kind: 'fuel-cross', text: 'Fuel × training: protein short on 10 of 13 days' })),
    'protein short on 10 of 13 days. Worth acting on, or shall I drop it?');
  // and a full first sentence inside 150 is untouched
  assert.equal(questionFor(rec({ fix: { action: 'drop' } })),
    'Upper Body lists 9 exercises but you finish about 4.4 of them. Shall I make that change, sir?');
});
