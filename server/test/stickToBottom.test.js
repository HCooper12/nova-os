// A CHAT LOG THAT STAYS AT THE FOOT WHILE THE ANSWER IS STILL BEING WRITTEN.
//
// His report, 9 Sep: "I have to keep scrolling down to see all of the new
// text so I am technically not able to just sit here and read the sentence by
// sentence formation as I listen to Nova also speak it."
//
// Two things were wrong. The effect was keyed on the MESSAGE COUNT, and a
// streaming reply does not add a message — applyStreamPartial rewrites the
// last one — so it never fired while the words arrived. And the "is he at the
// bottom" test measured distance AFTER the content had grown, which cannot
// tell "he scrolled up to read back" from "the answer got longer".
//
// The DOM half (MutationObserver on characterData) needs a browser. This is
// the half that does not: the rule deciding whether he is still reading live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStuck, NEAR } from '../../src/useStickToBottom.js';

// a log 400 tall showing 400 of `content` px, scrolled to `top`
const at = (top, content, lastTop = top) => ({ top, lastTop, scrollHeight: content, clientHeight: 400 });

test('THE BUG: the answer getting longer does not unstick him', () => {
  // he has not touched anything; the reply grew 600px under him. The scroll
  // event that follows our own catch-up must leave him stuck.
  assert.equal(nextStuck(true, at(600, 1000)), true);
});

test('THE BUG: even a huge burst of new text does not unstick him', () => {
  // The check this replaces measured distance after the growth: a reply that
  // added more than 120px in one go read as "he has scrolled up", and the log
  // stopped following for the rest of the answer. Only he can unstick it now,
  // so no amount of arriving text can stop it following.
  assert.equal(nextStuck(true, at(600, 4000)), true);
  assert.equal(nextStuck(true, at(600, 40000)), true);
});

test('scrolling up to read back leaves him alone', () => {
  assert.equal(nextStuck(true, { top: 200, lastTop: 600, scrollHeight: 1000, clientHeight: 400 }), false);
});

test('a one-pixel jitter is not a decision', () => {
  assert.equal(nextStuck(true, { top: 599, lastTop: 600, scrollHeight: 4000, clientHeight: 400 }), true);
});

test('coming back to the foot picks him up again', () => {
  assert.equal(nextStuck(false, at(600, 1000)), true);
});

test('an overscroll bounce at the foot does not strand him', () => {
  // iOS rubber-band: scrollTop dips back as the bounce settles, which reads
  // as upward movement while he is still sitting at the bottom
  assert.equal(nextStuck(true, { top: 596, lastTop: 604, scrollHeight: 1000, clientHeight: 400 }), true);
});

test('being near the foot counts as the foot', () => {
  assert.equal(nextStuck(false, at(600 - NEAR, 1000)), true);
  assert.equal(nextStuck(false, at(600 - NEAR - 1, 1000)), false);
});

test('reading back stays reading back while the reply keeps growing', () => {
  let stuck = true;
  stuck = nextStuck(stuck, { top: 100, lastTop: 600, scrollHeight: 1000, clientHeight: 400 });  // he pulls up
  assert.equal(stuck, false);
  stuck = nextStuck(stuck, { top: 100, lastTop: 100, scrollHeight: 3000, clientHeight: 400 });  // it grows
  assert.equal(stuck, false, 'growth must not drag him back down while he reads');
});
