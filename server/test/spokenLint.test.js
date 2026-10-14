// FILLER OFF THE FRONT (15 Oct 2026, src/spokenLint.js). A model reply that
// opens on "Sure," or "Great question." spends the first second he hears on
// nothing, in the same words every time. These pin what comes off, what never
// does, and that a sentence is never emptied.
import test from 'node:test';
import assert from 'node:assert/strict';

const { lintSpoken } = await import('../../src/spokenLint.js');

test('a leading opener comes off and the rest starts with a capital', () => {
  const cases = [
    ["Sure, that's a 9-inch pizza.", "That's a 9-inch pizza."],
    ['Of course. Your sleep averaged 7.1 hours.', 'Your sleep averaged 7.1 hours.'],
    ['Great question! You trained four times.', 'You trained four times.'],
    ["I'd be happy to help with that. Your protein is 140 g.", 'Your protein is 140 g.'],
    ['Happy to. Bench is up 5 kg.', 'Bench is up 5 kg.'],
    ['Absolutely, your recovery is fine.', 'Your recovery is fine.'],
    ['Certainly! Squat moved 2.5 kg.', 'Squat moved 2.5 kg.'],
    ['Let me check, you slept 6.8 hours.', 'You slept 6.8 hours.'],
    ['You asked about your sleep. It averaged 7 hours.', 'It averaged 7 hours.'],
    ['Sure, sir, your HRV is 62.', 'Your HRV is 62.'],
    ['Sure! Great question. Your steps were 9,400.', 'Your steps were 9,400.'],
  ];
  for (const [input, want] of cases) assert.equal(lintSpoken(input), want, input);
});

test('a sentence that IS the opener is kept whole: lint never empties one', () => {
  for (const t of ['Sure.', 'Of course!', 'Certainly, sir.', 'Let me look at your sleep.', 'You asked about your sleep.', 'Great question.']) {
    assert.equal(lintSpoken(t), t, t);
  }
});

test('words that only look like filler are left alone', () => {
  for (const t of [
    'Absolutely not, that would wreck your recovery.',
    'Surely the deload helped.',
    'Right now you are at 2,100 kcal.',
    'Of course-correcting the plan is cheap.',
    'Your coach said sure, but the data says no.',
  ]) assert.equal(lintSpoken(t), t, t);
});

test('nothing in, nothing out; leading whitespace is kept for the stream', () => {
  assert.equal(lintSpoken(''), '');
  assert.equal(lintSpoken(null), '');
  assert.equal(lintSpoken('  Sure, it was 7 hours.'), '  It was 7 hours.');
});
