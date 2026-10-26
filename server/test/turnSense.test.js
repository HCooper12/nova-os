// STILL TALKING? KEEP GOING. NOT WHAT I SAID. (27 Oct 2026)
//
// His report: the turn ended whenever he paused mid-thought, there was no way
// to add to a turn once it had gone, and a misheard answer could not be put
// right. src/turnSense.js reads his words for all three; this pins it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  soundsUnfinished, isContinuation, continueWindowClosed, continueWindowEnd, CONTINUE_MS,
  isCorrection, fixOffered, FIX_MS, stripEcho,
} from '../../src/turnSense.js';

// ---- soundsUnfinished: real-shaped turns, as the Mac and the browser write them ----

const UNFINISHED = [
  'I trained legs this morning and',
  'I trained legs this morning and the squat felt heavy, so I think I want to',
  'so I think I',                                       // the measured partial clip
  'I trained legs this morning and the squat felt heavy, so I think I want to drop the weight next week because...',
  'the thing I struggle with most is',
  'my biggest priority right now is the',
  'I want to get better at',
  'work has been busy, and',
  'I usually train in the morning but',
  'I think that',
  'what I want from this year is, um',
  'I eat pretty well, I think',
  'honestly I mean',
  "it's hard to explain, you know",
  'I was going to say that the',
  'mostly with',
  'the plan was to finish by Friday or',
  'and then',
  'the problem is that',
  'I would like to talk about my',
  'I have been sleeping badly because.',                 // a full stop on a dangling word
  'I went to the gym with a.',
];

const FINISHED = [
  'I trained legs this morning.',
  'I trained legs this morning and the squat felt heavy, so I think I want to drop the weight next week because of my knee.',
  'What is my protein today?',
  'That is great!',
  'I love that',
  'see you then',
  'I train in the morning',
  'my priority is my family',
  'yes',
  'no',
  'not really',
  'I did that',
  'I usually sleep about seven hours',
  'leadership is the hard part',
  'that is what it is',
  '',
];

for (const t of UNFINISHED) {
  test(`unfinished: "${t}"`, () => assert.equal(soundsUnfinished(t), true));
}
for (const t of FINISHED) {
  test(`finished: "${t}"`, () => assert.equal(soundsUnfinished(t), false));
}

test('a question asked, and two words of filler so far, is not an answer yet', () => {
  assert.equal(soundsUnfinished('well yeah', { asked: 'What matters most to you this year?' }), true);
  assert.equal(soundsUnfinished('my family', { asked: 'What matters most to you this year?' }), false);
});

test('a bare number is a finished answer, even when a number was asked (his call, 27 Oct)', () => {
  const asked = 'How much do you weigh?';
  assert.equal(soundsUnfinished('about 80', { asked }), false);
  assert.equal(soundsUnfinished('80', { asked }), false);
  assert.equal(soundsUnfinished('about 80 kilos', { asked }), false);
  assert.equal(soundsUnfinished('7 hours', { asked: 'How long do you sleep?' }), false);
  // no question asked: a bare number is his business
  assert.equal(soundsUnfinished('80'), false);
});

// ---- the continuation window ----

test('speech inside 3 s of the send continues the same turn', () => {
  assert.equal(isContinuation({ sentAt: 1000, now: 3500 }), true);
  assert.equal(isContinuation({ sentAt: 1000, now: 1000 + CONTINUE_MS }), true);
});

test('after 3 s, it still continues until the reply starts speaking', () => {
  assert.equal(isContinuation({ sentAt: 0, replySpeakingAt: null, now: 6000 }), true);
  assert.equal(isContinuation({ sentAt: 0, replySpeakingAt: 5000, now: 6000 }), false);
});

test('a reply that spoke early does not shorten the 3 s', () => {
  assert.equal(isContinuation({ sentAt: 0, replySpeakingAt: 800, now: 2500 }), true);
  assert.equal(continueWindowEnd({ sentAt: 0, replySpeakingAt: 800 }), CONTINUE_MS);
  assert.equal(continueWindowEnd({ sentAt: 0, replySpeakingAt: 5000 }), 5000);
});

test('sound heard while Nova is making one is the speaker, not him', () => {
  assert.equal(isContinuation({ sentAt: 0, now: 1500, novaSpeaking: true }), false);
});

test('nothing before the send, nothing without a send', () => {
  assert.equal(isContinuation({ sentAt: 5000, now: 4000 }), false);
  assert.equal(isContinuation({ sentAt: undefined, now: 4000 }), false);
});

test('the window closes only once 3 s are gone AND the reply has spoken', () => {
  assert.equal(continueWindowClosed({ sentAt: 0, replySpeakingAt: 500, now: 2000 }), false);
  assert.equal(continueWindowClosed({ sentAt: 0, replySpeakingAt: null, now: 9000 }), false);
  assert.equal(continueWindowClosed({ sentAt: 0, replySpeakingAt: 500, now: 3100 }), true);
});

// ---- spoken corrections ----

const CORRECTIONS = [
  'no no, I said eighty kilos',
  'No, I said Tuesdays',
  "no, that's wrong, it's my sister",
  "that's not what I said",
  "that's wrong",
  'I said eighty not eighteen',
  'I meant my manager',
  'correction, it was three years',
  'sorry, I meant Friday',
  'not Tom, I said Tim',
  "not eighteen, it's eighty",
];
const NOT_CORRECTIONS = [
  'no',                                   // a plain answer to a yes/no question
  'No, I train in the evenings',           // a plain answer that starts with no
  'not really',
  'not bad, thanks',
  'I think so',
  'my boss said no to it',
  'yes',
  'nobody really knows',
];
for (const t of CORRECTIONS) test(`correction: "${t}"`, () => assert.equal(isCorrection(t), true));
for (const t of NOT_CORRECTIONS) test(`not a correction: "${t}"`, () => assert.equal(isCorrection(t), false));

// ---- "Not what I said" stays for a minute ----

test('the fix is offered for 60 s, then goes', () => {
  assert.equal(fixOffered({ at: 0, now: 1000 }), true);
  assert.equal(fixOffered({ at: 0, now: FIX_MS - 1 }), true);
  assert.equal(fixOffered({ at: 0, now: FIX_MS }), false);
  assert.equal(fixOffered({ at: undefined, now: 10 }), false);
});

// ---- the speaker in the mic ----

test("Nova's ack at the head of a continuation is taken off", () => {
  assert.equal(stripEcho('Your squat, one moment. And also my knee hurts', 'Your squat, one moment.'), 'And also my knee hurts');
});
test('his own words are left alone when they only share a word or two', () => {
  assert.equal(stripEcho('your plan looks fine', 'Your squat, one moment.'), 'your plan looks fine');
  assert.equal(stripEcho('and also my knee', ''), 'and also my knee');
});
