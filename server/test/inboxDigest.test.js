// A3 — the deterministic triage. Nine items become three decisions, and the
// pattern gets one answer rather than one per symptom. Pinned because the
// rule for each bucket is one line and each is easy to get subtly wrong: a
// model-choice card promoted to "routine" would be filed with no model picked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectOf, digestPending, isCapture } from '../../src/inboxDigest.js';

// a capture: no kind — the classifier routed something he put in
const item = (over) => ({ id: Math.random().toString(36).slice(2), title: 'x', confidence: 'low', kind: undefined, route: { label: 'NOTE' }, ...over });

test('the subject is the title prefix before a colon, else the route', () => {
  assert.equal(subjectOf(item({ title: 'Standing: Compose a dispatch only when…' })), 'standing');
  assert.equal(subjectOf(item({ title: 'Coach: remember — Back volume fell' })), 'coach');
  assert.equal(subjectOf(item({ title: 'Buy tomatoes', route: { label: 'SHOPPING' } })), 'shopping');
  assert.equal(subjectOf(item({ title: 'A very long sentence with no colon at all here', route: null, kind: 'pattern' })), 'pattern');
});

test('a colon deep into a long title is not a subject', () => {
  // "…the plan: three things" — the prefix cap stops prose being read as a label
  assert.equal(subjectOf(item({ title: 'Something rather long before a colon appears here: detail', route: { label: 'NOTE' } })), 'note');
});

test('fewer than two items is not a triage — the deck alone is right', () => {
  assert.equal(digestPending([]), null);
  assert.equal(digestPending([item()]), null);
});

test('an agent\'s product is never routine, however sure the agent is', () => {
  // his real inbox on 5 Sep: two research briefs, two watch-notes, two coach
  // rules and two scout patterns, all "high" — none of them a one-tap filing
  const d = digestPending([
    item({ kind: 'research', confidence: 'high', title: 'Strength vs Hypertrophy Claims — Evidence Check' }),
    item({ kind: 'research', confidence: 'high', title: 'Cold Water Immersion and Recovery — Evidence Review' }),
    item({ kind: 'video', confidence: 'high', title: 'IHA — Strength vs Hypertrophy Explainer' }),
    item({ kind: 'coach', confidence: 'high', title: 'Coach: remember — Back is the only muscle…' }),
    item({ kind: 'pattern', confidence: 'high', title: 'Standing: Compose a dispatch only when new' }),
    item({ confidence: 'high', title: 'Buy tomatoes' }),
  ]);
  assert.equal(d.routine.length, 1, 'only the capture is routine');
  assert.equal(d.routine[0].title, 'Buy tomatoes');
  assert.deepEqual(d.patterns.map((p) => p.subject), ['research'], 'two briefs on the same kind read as one pattern');
  assert.equal(d.decide.length, 3);
  assert.ok(isCapture({}) && isCapture({ kind: 'capture' }) && !isCapture({ kind: 'research' }));
});

test('an agent product\'s subject is its kind, humanised', () => {
  assert.equal(subjectOf(item({ kind: 'model-choice', title: 'Pick a model — this week\'s distillation' })), 'model choice');
  assert.equal(subjectOf(item({ kind: 'research', title: 'No colon here' })), 'research');
});

test('high-confidence filings are routine; a model-choice card never is', () => {
  const d = digestPending([
    item({ title: 'Buy tomatoes', confidence: 'high' }),
    item({ title: 'Protein bar · 21g', confidence: 'high' }),
    item({ title: 'Want Opus for this week?', confidence: 'high', isModelChoice: true }),
    item({ title: 'Something to decide' }),
  ]);
  assert.equal(d.routine.length, 2);
  assert.ok(!d.routine.some((i) => i.isModelChoice), 'a card that needs a model picked cannot be filed in one tap');
});

test('two or more items on one subject are a pattern, and the repeat is the news', () => {
  const d = digestPending([
    item({ title: 'Standing: Compose a dispatch only when new' }),
    item({ title: 'Standing: Drop empty captures' }),
    item({ title: 'Standing: Never file placeholder text' }),
    item({ title: 'Backfill yesterday\'s steps' }),
  ]);
  assert.equal(d.patterns.length, 1);
  assert.equal(d.patterns[0].subject, 'standing');
  assert.equal(d.patterns[0].members.length, 3);
  assert.equal(d.decide.length, 1, 'the one-off stays a single decision');
});

test('patterns are ordered largest first, and every item lands in exactly one bucket', () => {
  const items = [
    item({ title: 'Coach: a' }), item({ title: 'Coach: b' }),
    item({ title: 'Standing: a' }), item({ title: 'Standing: b' }), item({ title: 'Standing: c' }),
    item({ title: 'Buy milk', confidence: 'high' }),
    item({ title: 'Odd one out' }),
  ];
  const d = digestPending(items);
  assert.deepEqual(d.patterns.map((p) => p.subject), ['standing', 'coach']);
  const placed = d.routine.length + d.patterns.reduce((n, p) => n + p.members.length, 0) + d.decide.length;
  assert.equal(placed, items.length, 'no item is lost or counted twice');
});

test('the summary says what the pile actually is', () => {
  const d = digestPending([
    item({ title: 'Buy milk', confidence: 'high' }),
    item({ title: 'Standing: a' }), item({ title: 'Standing: b' }),
    item({ title: 'Decide me' }),
  ]);
  assert.equal(d.summary, '4 waiting — 1 routine, 2 on one repeating subject, 1 to decide.');
});
