// THE VERDICT AND ITS SENTENCE MUST AGREE.
//
// Train's focus card draws the thing he earned as a figure (`verdict`) and
// keeps the composed sentence (`text`) for the spoken turn and for any model
// handed this payload. Two renderings of one finding is exactly the shape
// that drifts: a card saying "+1 rep" beside a sentence saying "+2.5kg" is
// worse than either alone, so the numbers are pinned to each other here.
//
// It also pins the honest half: a recovery or rest day has no number, and
// must not invent one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFocus } from '../lib/trainOverview.js';

const routine = {
  id: 'push',
  name: 'Push',
  exercises: [
    { exerciseId: 'db-shoulder-press', name: 'Dumbbell Shoulder Press (Single Arm)' },
    { exerciseId: 'bench', name: 'Barbell Bench Press' },
  ],
};

test('an earned rep arrives as a figure AND as the sentence, with the same number', async () => {
  const focus = await composeFocus('/nonexistent-vault', {
    routine,
    block: null,
    deload: null,
    progressions: { 'push:db-shoulder-press': { kind: 'reps', delta: 1, evidence: 'target reps twice running' } },
    tunes: null,
    plateaus: [],
    injuries: [],
  });
  assert.equal(focus.kind, 'session');
  assert.ok(focus.verdict, 'an earned day must carry a verdict');
  assert.equal(focus.verdict.lift, 'Dumbbell Shoulder Press (Single Arm)');
  assert.equal(focus.verdict.delta, 1);
  assert.equal(focus.verdict.unit, 'rep');
  assert.equal(focus.verdict.why, 'target reps twice running');
  // the card and the sentence say the same thing
  assert.ok(focus.text.includes('+1 rep'), `sentence lost the number: ${focus.text}`);
  assert.ok(focus.text.includes(focus.verdict.lift), 'sentence lost the lift');
  assert.ok(focus.text.includes(focus.verdict.why), 'sentence lost the evidence');
});

test('an earned kilo says kg in both places', async () => {
  const focus = await composeFocus('/nonexistent-vault', {
    routine,
    block: null,
    deload: null,
    progressions: { 'push:bench': { kind: 'weight', delta: 2.5, evidence: 'top set at RPE 8 twice' } },
    tunes: null,
    plateaus: [],
    injuries: [],
  });
  assert.equal(focus.verdict.unit, 'kg');
  assert.equal(focus.verdict.delta, 2.5);
  assert.ok(focus.text.includes('+2.5kg'), focus.text);
});

test('an outgrown lift has a verdict with no number, and keeps its fix', async () => {
  const focus = await composeFocus('/nonexistent-vault', {
    routine,
    block: null,
    deload: null,
    progressions: { 'push:bench': { kind: 'outgrown', evidence: 'three sessions at the top of the range' } },
    tunes: null,
    plateaus: [],
    injuries: [],
  });
  assert.equal(focus.verdict.lift, 'Barbell Bench Press');
  assert.equal(focus.verdict.delta, undefined, 'outgrown is not a quantity');
  assert.equal(focus.verdict.label, 'outgrown');
  assert.equal(focus.fix?.action, 'weighted-variant', 'the fix must survive the verdict being added');
});

test('a recovery day invents no number', async () => {
  const focus = await composeFocus('/nonexistent-vault', {
    routine,
    block: null,
    deload: { advise: true, reason: 'resting heart rate is up 9% on your baseline' },
    progressions: null,
    tunes: null,
    plateaus: [],
    injuries: [],
  });
  assert.equal(focus.kind, 'recovery');
  assert.equal(focus.verdict, undefined, 'advice has no figure');
  assert.match(focus.text, /resting heart rate/);
});
