// About you, 27 Oct 2026: the phrases that resume or pause the interview,
// code's closing line, and the coverage sentence the hero shows.
//
//   node --test src/profileResume.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isProfileResumeVoice, isProfileStopVoice, isProfileTalkVoice, profilePauseLine } from './profileSections.js';
import { profileCoverage, coverageLine } from '../server/lib/profileCoverage.js';

test('resume phrases resume, and are not the fresh interview', () => {
  for (const q of ['carry on the interview', 'Resume the interview', 'keep going with the interview', 'can we continue the interview?', 'pick the interview back up']) {
    assert.ok(isProfileResumeVoice(q), q);
  }
  for (const q of ['interview me', 'resume my workout', 'carry on']) assert.ok(!isProfileResumeVoice(q), q);
  assert.ok(!isProfileTalkVoice('resume the interview'));
});

test('stop and pause words close the talk; an answer that mentions them does not', () => {
  for (const q of ['stop', 'pause', "let's pause", "I'll come back to this", 'Okay, let\'s pause here.', "that's enough for now", "I'll come back to this later"]) {
    assert.ok(isProfileStopVoice(q), q);
  }
  for (const q of ['I never pause between sets', 'I stop eating at eight', 'I paused my degree in 2015']) assert.ok(!isProfileStopVoice(q), q);
});

test('the closing line counts, names the next part, and says how to come back', () => {
  assert.equal(profilePauseLine(3, 'My story'), "Saved. 3 things from today are in your profile. Next time I'd like to hear about My story. Say resume the interview any time.");
  assert.equal(profilePauseLine(1), 'Saved. One thing from today is in your profile. Say resume the interview any time.');
  assert.match(profilePauseLine(0, 'Taste'), /^Saved\. Nothing new from today went into your profile\. Next time I'd like to hear about Taste\./);
});

test('the hero sentence has no finish line', () => {
  const c = profileCoverage({ sections: [{ key: 'about', title: 'About me', text: 'Hayden.', drafted: false }] });
  assert.match(coverageLine(c), /There is no finish line; Nova keeps learning as you talk\.$/);
});
