// TALKING OVER NOVA — the echo filter that makes it possible.
//
// The microphone is open while Nova speaks, so it hears Nova. The only thing
// that separates his voice from the speaker's is that Nova knows exactly what
// it is saying. These tests pin the bias: a MISSED barge-in costs him a tap
// (what he has today), a FALSE one cuts Nova off for nothing — so every
// ambiguous case must resolve to "that was Nova".
import test from 'node:test';
import assert from 'node:assert/strict';
import { bargeInDecision, echoScore, contentWords } from '../../src/bargeIn.js';

// A real Nova sentence, in the register it actually speaks.
const SAYING = 'Two of six days cleared the protein floor, sir. The average was 129 grams, a 21 gram nightly gap.';

test('Nova hearing itself is never an interruption — the whole sentence, and any fragment of it', () => {
  for (const echo of [
    SAYING,
    'two of six days cleared the protein floor',
    'the average was 129 grams',
    'a 21 gram nightly gap',
    'cleared the protein floor sir the average',
  ]) {
    const d = bargeInDecision(echo, SAYING);
    assert.equal(d.barge, false, `should read as echo: "${echo}" (${d.why})`);
  }
});

test('him talking over it cuts it off', () => {
  for (const said of [
    'no that is not what I meant about the site visit',
    'hang on, you are missing the part about Saturday',
    "wait I haven't finished explaining",
    'stop',
    'actually the manager already signed it off',
  ]) {
    const d = bargeInDecision(said, SAYING);
    assert.equal(d.barge, true, `should barge in: "${said}" (${d.why})`);
  }
});

test('the room is not an interruption: filler, a stray word, and silence all stay quiet', () => {
  for (const noise of ['', '   ', 'um', 'uh yeah', 'okay', 'mm the', 'so']) {
    assert.equal(bargeInDecision(noise, SAYING).barge, false, `should stay quiet on: "${noise}"`);
  }
  // ONE new word is not enough — a single mishearing out of the room would
  // otherwise cut Nova off mid-sentence
  assert.equal(bargeInDecision('grams weather', SAYING).barge, false, 'one fresh word is not evidence');
  assert.equal(bargeInDecision('weather tomorrow', SAYING).barge, true, 'two is');
});

test('an interruption word Nova is itself saying does not count', () => {
  // Nova: "...I would stop the block there." — the speaker says "stop", the
  // listener hears "stop", and nothing should happen.
  const d = bargeInDecision('stop', 'Given the fatigue, I would stop the block there, sir.');
  assert.equal(d.barge, false);
  assert.match(d.why, /Nova is saying/);
});

test('echoScore is the evidence, and it ignores the words that prove nothing', () => {
  assert.equal(echoScore('the and of it is', SAYING), 1, 'no content words at all reads as echo');
  assert.equal(echoScore('protein floor', SAYING), 1);
  assert.equal(echoScore('completely different subject', SAYING), 0);
  assert.equal(echoScore('protein subject', SAYING), 0.5);
  // stopwords and short words are dropped before comparing
  assert.deepEqual(contentWords('The average was 129 grams, sir.'), ['average', '129', 'grams']);
});

test('with nothing being said, ordinary speech still needs two words but echo cannot be claimed', () => {
  assert.equal(echoScore('anything at all here', ''), 0, 'nothing to echo');
  assert.equal(bargeInDecision('the site visit moved', '').barge, true);
  assert.equal(bargeInDecision('mm', '').barge, false, 'still not on filler');
});
