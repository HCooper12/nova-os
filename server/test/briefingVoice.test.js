// The briefing by voice — what he says while Nova is reading to him.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefingVoice, explainQuestion } from '../../src/briefingVoice.js';

test('the transport words: pause, carry on, next, back, again, close', () => {
  assert.equal(parseBriefingVoice('pause').kind, 'pause');
  assert.equal(parseBriefingVoice('hang on').kind, 'pause');
  assert.equal(parseBriefingVoice('stop reading').kind, 'pause');
  assert.equal(parseBriefingVoice('carry on').kind, 'resume');
  assert.equal(parseBriefingVoice('keep going').kind, 'resume');
  assert.equal(parseBriefingVoice('from the top').kind, 'restart');
  assert.equal(parseBriefingVoice('skip this part').kind, 'next');
  assert.equal(parseBriefingVoice('next section').kind, 'next');
  assert.equal(parseBriefingVoice('go back').kind, 'back');
  assert.equal(parseBriefingVoice('say that again').kind, 'again');
  assert.equal(parseBriefingVoice('sorry, what?').kind, 'again');
  assert.equal(parseBriefingVoice("that's enough").kind, 'close');
});

test('the teaching move: every way he says he did not follow', () => {
  for (const q of ['explain that again', 'explain that more simply', "I don't get it", "I didn't follow", 'what does that mean', 'break that down for me', 'in plain english', 'too fast', 'why does that matter']) {
    const c = parseBriefingVoice(q);
    assert.equal(c?.kind, 'explain', `"${q}" should ask for an explanation`);
  }
});

test('the parser never guesses — ordinary sentences fall through', () => {
  for (const q of ['what is my weight', 'remind me to call mum', 'had lunch', 'what did huberman say about light', 'play the latest diary of a ceo', 'next week is busy']) {
    assert.equal(parseBriefingVoice(q), null, `"${q}" is not a briefing command`);
  }
});

test('the explanation question is grounded in the exact beat, and simpler when he asked for simpler', () => {
  const q = explainQuestion({ say: 'Melanopsin responds most to blue light.', heading: 'Why morning light matters', title: 'Light and You', ask: 'explain that more simply' });
  assert.match(q, /"Light and You"/);
  assert.match(q, /"Why morning light matters"/);
  assert.match(q, /You just said: "Melanopsin responds most to blue light\."/);
  assert.match(q, /simpler words, no jargon/);
  assert.match(explainQuestion({ say: 'x', heading: 'h', title: 't', ask: 'explain that' }), /more fully/);
});
