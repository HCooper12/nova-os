// About you on the client: twelve parts in order, no two neighbours in either
// grid sharing a hue, chosen options read from the text when an older server
// sends none, and the voice phrases that start the interview (and the ones
// that must not).
//
//   node --test src/profileSections.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_SECTIONS, normaliseSections, knowsOf, isProfileTalkVoice } from './profileSections.js';

test('twelve parts, in the server order', () => {
  assert.deepEqual(PROFILE_SECTIONS.map((s) => s.key),
    ['about', 'story', 'toward', 'values', 'training', 'fuel', 'work', 'mind', 'people', 'life', 'talk', 'taste']);
});

test('no two neighbours share a hue, in two columns or three', () => {
  const h = PROFILE_SECTIONS.map((s) => s.hue);
  for (const cols of [2, 3]) {
    h.forEach((x, i) => {
      if (i % cols && h[i - 1] === x) assert.fail(`${cols} cols: ${PROFILE_SECTIONS[i].key} matches its left neighbour`);
      if (i >= cols && h[i - cols] === x) assert.fail(`${cols} cols: ${PROFILE_SECTIONS[i].key} matches the part above`);
    });
  }
  // training and fuel keep the hues Train and Fuel wear, and nobody else takes them
  assert.equal(h.filter((x) => x === 'var(--nv-or)').length, 1);
  assert.equal(h.filter((x) => x === 'var(--nv-good)').length, 1);
});

test('chosen comes from the server, or from the text when it sends none', () => {
  const list = normaliseSections([
    { key: 'talk', text: 'Mostly brief.\n- Short and direct\n- No small talk' },
    { key: 'values', text: '- Honesty', chosen: ['Honesty'] },
  ]);
  assert.equal(list.length, 12);
  assert.deepEqual(list.find((s) => s.key === 'talk').chosen, ['Short and direct', 'No small talk']);
  assert.deepEqual(list.find((s) => s.key === 'values').chosen, ['Honesty']);
  assert.deepEqual(list.find((s) => s.key === 'people').chosen, []);
  assert.equal(knowsOf(null, []).total, 12);
});

test('the interview phrases start it; a sentence that only mentions him does not', () => {
  for (const q of ['Interview me', 'can you ask me some questions about myself', 'ask me questions about me',
    'I want you to get to know me better', "let's talk about me", 'update my profile']) {
    assert.equal(isProfileTalkVoice(q), true, q);
  }
  for (const q of ['what do you think about me skipping legs', 'ask me questions about the French revolution',
    'tell me about my week', 'how did I sleep', 'what do you know about meal prep']) {
    assert.equal(isProfileTalkVoice(q), false, q);
  }
});
