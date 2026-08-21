// How Nova SOUNDS and what it puts on the glass (his 21-Aug notes): written
// shorthand must not be read as punctuation, gratitude must not be met with
// "On it, sir", and a card may only ever restate what was spoken.
import test from 'node:test';
import assert from 'node:assert/strict';

const { rewriteForSpeech } = await import('../lib/ttsLocal.js');
const { smallTalkReply, tryReflex } = await import('../lib/reflex.js');
const { parseCardDirective, cardFromDirective } = await import('../lib/spokenCards.js');

test('written shorthand becomes speech, not punctuation read aloud', () => {
  assert.match(rewriteForSpeech('Fuel × training'), /Fuel and training/);
  assert.match(rewriteForSpeech('Move "Workout" → 11:15'), /to 11:15/);
  assert.match(rewriteForSpeech('Push · 13 sets'), /Push, 13 sets/);
  assert.match(rewriteForSpeech('lifted 75kg'), /75 kilos/);
  assert.match(rewriteForSpeech('HRV is 62 ms'), /H R V is 62 milliseconds/);
  assert.match(rewriteForSpeech('resting 70 bpm'), /70 beats per minute/);
});

test('a title cut mid-word ends as a sentence instead of trailing off', () => {
  assert.equal(rewriteForSpeech('training days ave…'), 'training days ave.');
  assert.equal(rewriteForSpeech('training days ave...'), 'training days ave.');
});

test('thanks, agreement and hellos get a human answer — never an ack, never the model', async () => {
  assert.match(smallTalkReply('Perfect thanks Nova'), /any time|pleasure|of course/i);
  assert.match(smallTalkReply('ok'), /right you are|noted|very good/i);
  assert.match(smallTalkReply('Hey Nova'), /sir/i);
  const hit = await tryReflex('thanks Nova');
  assert.equal(hit.smallTalk, true, 'it is answered by code, so no model is spawned');
});

test('small talk never swallows a real request that merely starts politely', () => {
  assert.equal(smallTalkReply('thanks for that, can you move my workout to 11'), null);
  assert.equal(smallTalkReply('what are my steps today'), null);
  assert.equal(smallTalkReply('ok so what should I eat tonight'), null);
});

test('the CARD directive builds a card and leaves the spoken answer clean', () => {
  const out = parseCardDirective('It is Bloom\'s Taxonomy, sir.\n\nCARD {"label":"BLOOM\'S TAXONOMY","value":"Bloom\'s Taxonomy","caption":"THE PYRAMID YOU MEANT"}');
  assert.equal(out.cleanText, "It is Bloom's Taxonomy, sir.", 'the directive never reaches his eyes or the voice');
  assert.equal(out.card.kind, 'metric');
  assert.equal(out.card.caption, 'THE PYRAMID YOU MEANT');
});

test('a malformed directive costs the card, never the answer', () => {
  const out = parseCardDirective('Here you go.\nCARD {not json');
  assert.equal(out.card, null);
  assert.match(out.cleanText, /Here you go/);
});

test('the model cannot smuggle anything past the builders', () => {
  assert.equal(cardFromDirective({ value: 'x' }), null, 'a card with no label is not a card');
  assert.equal(cardFromDirective({ label: 'X' }), null, 'a label alone shows nothing');
  assert.equal(cardFromDirective({ label: 'X', tone: 'rainbow', value: '3' }).tone, 'cy', 'an unknown tone falls back');
  assert.equal(cardFromDirective({ label: 'X', value: 'y'.repeat(90) }).value.length, 28, 'values are clamped');
  assert.equal(cardFromDirective({ label: 'X', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).items.length, 5, 'lists are clamped');
});

test('list directives accept plain strings as well as named rows', () => {
  const card = cardFromDirective({ label: 'STEPS', items: ['remember', { name: 'apply', note: 'level 3' }] });
  assert.equal(card.kind, 'list');
  assert.equal(card.items[0].name, 'remember');
  assert.equal(card.items[1].note, 'level 3');
});
