// TALK LIKE A PERSON.
//
// His 10 Sep report, with the turn on screen: "when conversing nova should
// sound and act like a normal human not reading things in parentheses and
// stuff like that." The Leader writes markdown; its answers now land in a
// spoken log. A prompt asking it to stop is a request — this is the
// guarantee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toSpokenProse } from '../../src/spokenProse.js';

// verbatim from the transcript of the turn he screenshotted
const REAL = `## The word "convince" is the problem

You asked how to persuade and convince him otherwise. Heen's move on your [[Purpose Shift in Difficult Conversations]] page: change your objective before you change your opening line. *"If I shift my purpose from getting them to change... to just understanding better what's going on — that conversation is much more likely to be fruitful."* And her tell for why something feels disproportionately hard: **there's usually something about identity in it.**`;

test('THE REPORT: nothing from that turn is left for a voice to trip over', () => {
  const out = toSpokenProse(REAL);
  for (const junk of ['##', '**', '[[', ']]', '*"']) {
    assert.ok(!out.includes(junk), `${junk} survived: ${JSON.stringify(out.slice(0, 120))}`);
  }
  assert.ok(out.startsWith('The word "convince" is the problem'), out.slice(0, 60));
  assert.ok(out.includes('Purpose Shift in Difficult Conversations'), 'the page is still named, just not as a link');
  assert.ok(out.includes("there's usually something about identity in it."));
});

test('a vault link reads as what he would say, not as a link', () => {
  assert.equal(toSpokenProse('see [[Frame of the Veteran]] for this'), 'see Frame of the Veteran for this');
  assert.equal(toSpokenProse('see [[Long Page Name|the frame]] here'), 'see the frame here');
});

test('links, code and fences do not get read out', () => {
  assert.equal(toSpokenProse('read [the study](https://x.example/y) first'), 'read the study first');
  assert.equal(toSpokenProse('use `npm test` now'), 'use npm test now');
  assert.equal(toSpokenProse('before\n```js\nconst a = 1;\n```\nafter'), 'before\n\nafter');
});

test('headings, bullets, quotes and rules become plain lines', () => {
  assert.equal(toSpokenProse('### Heading here'), 'Heading here');
  assert.equal(toSpokenProse('- first\n- second'), 'first\nsecond');
  assert.equal(toSpokenProse('> he said this'), 'he said this');
  assert.equal(toSpokenProse('one\n\n---\n\ntwo'), 'one\n\ntwo');
});

test('a numbered list keeps its numbers — those are meaning, not markup', () => {
  assert.equal(toSpokenProse('1. do this\n2. then this'), '1. do this\n2. then this');
});

test('plain speech is returned untouched', () => {
  const plain = 'Book ten minutes with him alone, before the group meeting. Open by asking him to break your plan.';
  assert.equal(toSpokenProse(plain), plain);
});

test('arithmetic and stray symbols are not mistaken for emphasis', () => {
  assert.equal(toSpokenProse('3 * 4 sets, roughly'), '3 * 4 sets, roughly');
  assert.equal(toSpokenProse('nothing here'), 'nothing here');
  assert.equal(toSpokenProse(''), '');
  assert.equal(toSpokenProse(null), '');
});
