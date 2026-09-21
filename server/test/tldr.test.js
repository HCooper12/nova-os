// THE TL;DR is derived, never invented — pinned on the real shapes his Inbox
// carried on 21 Sep 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tldrFor, opening, numberedItems, firstParagraph } from '../../src/tldr.js';

const report = `You're already on four days. The dossier that said five was stale, so "should I drop to 4 days?" was answering a problem you don't have — and three sets per exercise isn't the problem either. What's actually wrong is that you take almost everything to failure.

Coverage: 3 of 3 steps ran.

## Your split is fine.

Long prose here.

## What I would change

1. **Cap RPE at 8–9 on everything except the final set of an isolation exercise.** On Push, Pull and Upper, compounds stop at 2–3 RIR. Evidence: your own page.
2. **Move priority arm work into positions 1–4 on Pull and Upper Body.** Specifically: Spider Curl from 7 to 3.
3. **Cut Push, Pull and Upper from 9 exercises to 7.** Drop the pulldown from Upper.
4. **Cut EZ-Bar Reverse Curl from Pull entirely.** 45.6 → 38 kg.
5. **Move Leg Day off Friday.** Three logged sets in four weeks.
6. **Hold the slippage line.** Skip, don't make up.
7. **Refresh the program dossier.** It says five days.

**Changes not worth making:** none of these.

Say "make change 2".`;

test('the opening scans to a sentence end, never mid-quote, and clips on a word', () => {
  assert.equal(opening('He said "cut it." Then left. And more.', { sentences: 1 }), 'He said "cut it."');
  assert.equal(opening('First. Second. Third.'), 'First. Second.');
  assert.equal(opening('No full stop at all'), 'No full stop at all');
  const long = opening('word '.repeat(80) + '.', { max: 40 });
  assert.ok(long.length <= 40 && long.endsWith('…'));
});

test('a finished report yields its verdict and its numbered changes, capped, with the rest counted', () => {
  const t = tldrFor({ kind: 'plan', finishedAt: 'x', decision: { payload: { body: report } } });
  assert.match(t.line, /^You're already on four days\. The dossier that said five was stale/);
  assert.equal(t.items.length, 5);
  assert.equal(t.items[0], 'Cap RPE at 8–9 on everything except the final set of an isolation exercise.');
  assert.equal(t.items[3], 'Cut EZ-Bar Reverse Curl from Pull entirely.');
  assert.equal(t.more, 2);
});

test('a research brief yields its leading answer and no items when it has no list', () => {
  const body = '**No — a blanket "3 sets of everything" is not defensible as a hypertrophy prescription, though it is much closer to defensible for strength.** The dose-response evidence is organised around weekly sets. Two of the four angles failed.\n\n## Sources\n1. x';
  const t = tldrFor({ kind: 'research', decision: { payload: { body } } });
  assert.match(t.line, /^No — a blanket "3 sets of everything" is not defensible/);
  assert.deepEqual(t.items, []);
});

test('a Coach recommendations list is read under its own heading', () => {
  const body = '# Coach Review\n\nFirst, a correction.\n\n## Recommendations, in order\n\n1. **Fix training-day fuel before anything else.** Move one bowl.\n2. **Remove Cable Overhead Tricep Extension from Push** (3 sets). Triceps 14 → 11.';
  const t = tldrFor({ kind: 'coach-review', decision: { payload: { body } } });
  assert.equal(t.line, 'First, a correction.');
  assert.deepEqual(t.items, ['Fix training-day fuel before anything else.', 'Remove Cable Overhead Tricep Extension from Push (3 sets).']);
});

test('one-line records use their own line; a bare capture has none', () => {
  assert.equal(tldrFor({ kind: 'coach-program', text: 'Coach: Barbell Bench Press hasn\'t moved in 9 weeks. Swap it.' }).line, 'Coach: Barbell Bench Press hasn\'t moved in 9 weeks. Swap it.');
  assert.equal(tldrFor({ decision: { route: 'routine-edit', title: 'Coach: remove EZ-Bar Reverse Curl from Pull' } }).line, 'Coach: remove EZ-Bar Reverse Curl from Pull');
  assert.equal(tldrFor({ kind: 'plan', plan: { steps: [{}, {}, {}] } }).line, '3 steps, waiting on your yes.');
  assert.equal(tldrFor({ kind: 'capture', text: 'buy eggs', decision: { route: 'shopping', payload: {} } }), null);
});

test('an explicit TL;DR line in a body wins', () => {
  const t = tldrFor({ kind: 'research', decision: { payload: { body: 'Intro.\n\n**TL;DR:** Do the thing. Skip the other.\n\nLong.' } } });
  assert.equal(t.line, 'Do the thing. Skip the other.');
});

test('the first paragraph skips headings, tables and rules', () => {
  assert.equal(firstParagraph('# H\n\n| a | b |\n\n---\n\n> q\n\nReal first.\n\nSecond.'), 'Real first.');
  assert.deepEqual(numberedItems('no list here'), []);
});
