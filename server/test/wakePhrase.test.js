// BARE "NOVA, …" (src/wakePhrase.js; design/EVIE-STUDY.md §4B). "Hey Nova"
// always wakes; the bare name wakes only when he opted in AND it is clearly
// an address (sentence-initial, with a comma or a request word after it).
// A mention of Nova mid-sentence, or the name alone, never does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchWake } from '../../src/wakePhrase.js';

test('"Hey Nova" wakes with or without the bare form, and carries the rest', () => {
  assert.deepEqual(matchWake("hey nova what's my protein"), { rest: "what's my protein", bare: false });
  assert.deepEqual(matchWake('Hey, Nova, take five', { bare: true }), { rest: 'take five', bare: false });
});

test('the bare form is opt-in', () => {
  assert.equal(matchWake('Nova, check my sleep'), null);
  assert.equal(matchWake('nova check my sleep', { bare: false }), null);
});

test('bare: sentence-initial address wakes', () => {
  const on = { bare: true };
  assert.deepEqual(matchWake('Nova, how did I sleep', on), { rest: 'how did I sleep', bare: true });
  assert.deepEqual(matchWake('Nova: pull up my calendar', on), { rest: 'pull up my calendar', bare: true });
  assert.deepEqual(matchWake('nova check my bench', on), { rest: 'check my bench', bare: true });
  assert.deepEqual(matchWake("Nova I'm back", on), { rest: "I'm back", bare: true });
  assert.deepEqual(matchWake('Okay. Nova, take five', on), { rest: 'take five', bare: true });
});

test('bare: a mention, or the name alone, is not a wake', () => {
  const on = { bare: true };
  for (const heard of ['I asked Nova about it', 'Nova', 'Nova,', 'nova is great', 'tell nova to stop', 'the nova core', 'Nova the app crashed']) {
    assert.equal(matchWake(heard, on), null, heard);
  }
});
