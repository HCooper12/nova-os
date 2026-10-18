import test from 'node:test';
import assert from 'node:assert/strict';
const { coachDepth } = await import('../lib/intentRouter.js');
const { SPEAK_FIRST_RULE } = await import('../lib/coachTurn.js');

// his call, 18 Oct 2026: depth when the answer needs it; quick only for simple changes and quick facts
test('analytical questions think deeply', () => {
  for (const q of ['should I deload next week given my last three sessions', 'is my bench progressing or stalling', 'why is my squat not moving', 'my shoulder hurts on overhead press, what do I do', 'am I doing enough back volume']) assert.notEqual(coachDepth(q), 'quick', q);
});
test('a request for the whole picture is deep', () => {
  assert.equal(coachDepth('Re evaluate my workout program'), 'deep');
});
test('simple changes and quick facts stay quick', () => {
  for (const q of ['swap the cable flyes for dumbbell flyes', 'add a set to lat pulldowns on Monday', 'move leg day to Thursday', "what's my bench e1RM", 'how many sets did I do on Tuesday']) assert.equal(coachDepth(q), 'quick', q);
});
test('when in doubt, depth', () => {
  assert.equal(coachDepth('talk me through tomorrow'), 'think');
});
test('the spoken rule forbids a guess and never asks for an answer before the facts', () => {
  assert.match(SPEAK_FIRST_RULE, /NEVER GUESS/);
  assert.match(SPEAK_FIRST_RULE, /a guess is a failure/);
  assert.doesNotMatch(SPEAK_FIRST_RULE, /before any tool call/);
});
