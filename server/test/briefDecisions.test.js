// The brief's question-by-question close. His ask: stop handing him a wall of
// analysis to remember and act on later — ask the decisions one at a time,
// take the answer, move on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-briefdecisions-'));
const { buildQueue: queueAt, questionFor, cardFor, briefDecisions } = await import('../lib/briefDecisions.js');
// 13 Nov 2026 ("old data" complaint): a coach card is asked only while its
// evidence is fresh, so the queue is read at a pinned clock near the fixtures
const NOW = new Date('2026-08-22T12:00:00Z');
const buildQueue = (records, opts = {}) => queueAt(records, { now: NOW, ...opts });

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

// 13 Nov 2026 ("old data" complaint): coach cards were oldest first, which put
// weeks-old gym numbers at the top of his morning; now the newest evidence leads
test('within the coach cards the newest evidence is asked first', () => {
  const { decisions } = buildQueue([
    rec({ id: 'old', createdAt: '2026-08-05T09:00:00Z' }),
    rec({ id: 'new', createdAt: '2026-08-21T09:00:00Z' }),
    rec({ id: 'dated', createdAt: '2026-08-02T09:00:00Z', finding: { kind: 'reported-form', dates: ['2026-08-10', '2026-08-18'] } }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['new', 'dated', 'old'], 'a finding\'s own dates beat when the card was raised');
});

test('a coach card whose evidence is stale is not asked; the other kinds are unchanged', () => {
  const { decisions, total } = buildQueue([
    rec({ id: 'stale', createdAt: '2026-08-21T09:00:00Z', finding: { kind: 'reported-form', dates: ['2026-07-01', '2026-07-20'] } }),
    rec({ id: 'raisedLongAgo', createdAt: '2026-07-01T09:00:00Z' }),
    rec({ id: 'fresh', createdAt: '2026-08-20T09:00:00Z' }),
    rec({ id: 'fuel', kind: 'fuel-cross', createdAt: '2026-06-01T09:00:00Z', text: 'Fuel × training: protein late.' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['fresh', 'fuel']);
  assert.equal(total, 2);
});

test('within the other kinds the one that has waited longest is still asked first', () => {
  const { decisions } = buildQueue([
    rec({ id: 'fuelNew', kind: 'fuel-cross', createdAt: '2026-08-25T09:00:00Z', text: 'Fuel × training: protein late.' }),
    rec({ id: 'fuelOld', kind: 'fuel-cross', createdAt: '2026-08-01T09:00:00Z', text: 'Fuel × training: protein early.' }),
    rec({ id: 'readNew', kind: 'read-next', createdAt: '2026-08-24T09:00:00Z', text: 'Librarian: 3 sources reach for Deliberate Practice.' }),
    rec({ id: 'readOld', kind: 'read-next', createdAt: '2026-08-02T09:00:00Z', text: 'Librarian: 2 sources reach for Spacing.' }),
  ]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['fuelOld', 'fuelNew', 'readOld', 'readNew']);
});

test('a coach card is worded "from <day>" off its evidence date, never off today', () => {
  // cardFor reads the real clock for the label, so the dates sit in 2020: the wording is the same on any day after
  const raised = cardFor(rec({ createdAt: '2020-03-04T02:00:00Z' }));
  assert.equal(raised.items[0].note, 'from Wed 4 Mar 2020', 'no finding dates: the day it was raised');
  const dated = cardFor(rec({ createdAt: '2026-08-20T09:00:00Z', finding: { dates: ['2020-02-10', '2020-03-04'] } }));
  assert.equal(dated.items[0].note, 'from Wed 4 Mar 2020', 'the newest finding date wins over the raised day');
  const nowCard = cardFor(rec({ createdAt: new Date().toISOString() }));
  assert.equal(nowCard.items[0].note, 'from today');
});

test('the spoken question for a coach card is its own sentence and carries no date', () => {
  const { decisions } = buildQueue([rec({ id: 'c', createdAt: '2026-08-20T09:00:00Z' })]);
  assert.equal(decisions.length, 1);
  assert.doesNotMatch(decisions[0].question, /\bfrom \w{3} \d/);
  assert.match(decisions[0].question, /Do you want me to keep that on your list, or let it go\?$/);
  assert.match(questionFor(rec({ fix: { action: 'ops' } })), /Shall I make that change, sir\?$/);
});

test('a pain check is asked first, in its own words, once', () => {
  const pain = rec({ id: 'pain', kind: 'pain-check', text: 'You logged pain on Bench Press yesterday. Is it still going on?', exerciseName: 'Bench Press', area: 'Shoulder (left)' });
  const { decisions } = buildQueue([rec({ id: 'coach' }), rec({ id: 'fuel', kind: 'fuel-cross', text: 'Fuel × training: x.' }), pain]);
  assert.deepEqual(decisions.map((d) => d.recordId), ['pain', 'coach', 'fuel']);
  assert.equal(decisions[0].question, 'You logged pain on Bench Press yesterday. Is it still going on?');
  assert.equal(decisions[0].label, 'PAIN CHECK');
  assert.equal(decisions[0].card.foot, 'yes or no is all it needs');
  // spoken in one brief already: it waits in the Inbox, not in the next brief
  const again = buildQueue([{ ...pain, spokenAt: '2026-08-22T06:00:00Z' }, rec({ id: 'coach' })]);
  assert.deepEqual(again.decisions.map((d) => d.recordId), ['coach']);
});

test('briefDecisions stamps spokenAt on the pain checks it hands out, and only on those', async () => {
  const rows = [
    rec({ id: 'pain', kind: 'pain-check', text: 'Your Injury Log still has Left knee open, since Mon 3 Aug. Has it cleared up?', injuryId: 'k', area: 'Left knee' }),
    rec({ id: 'coach' }),
  ];
  const store = { listRecords: async () => rows, updateRecord: async (id, patch) => Object.assign(rows.find((r) => r.id === id), patch) };
  const first = await briefDecisions({ store, now: NOW });
  assert.equal(first.decisions[0].recordId, 'pain');
  assert.ok(rows[0].spokenAt);
  assert.equal(rows[1].spokenAt, undefined);
  const second = await briefDecisions({ store, now: NOW });
  assert.deepEqual(second.decisions.map((d) => d.recordId), ['coach']);
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

test('a coach card says when its evidence is from; the other kinds carry no such note', async () => {
  // cardFor reads the real clock for the label, so the fixture dates are relative to now
  const { datedLabel, localDayISO } = await import('../lib/freshness.js');
  const ago = (n) => new Date(Date.now() - n * 86_400_000);
  const card = cardFor(rec({ createdAt: ago(30).toISOString() }));
  assert.equal(card.items[0].note, `from ${datedLabel(localDayISO(ago(30)), new Date(), { on: false })}`);
  assert.match(card.items[0].note, /^from \w{3} \d{1,2} \w{3}( \d{4})?$/);
  const fuel = cardFor(rec({ kind: 'fuel-cross', text: 'Fuel x training: protein late.' }));
  assert.equal(fuel.items[0].note, null, 'a note the card does not carry is null');
});
