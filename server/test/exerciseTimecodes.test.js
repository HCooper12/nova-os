// The link has to land ON the demonstration.
//
// "There's no point in me watching a 20 minute video for the 3 minutes where I
// actually need to see an exercise." A form video that opens at 0:00 of a
// ten-minute ATHLEAN-X upload is a link, not an answer. Chapters are how
// YouTube itself marks where the exercise is shown, so the chapter whose title
// names the exercise is the honest way in — and when there is none, a long
// video is never linked as-is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchChapter, deepLink, SHORT_SECONDS } from '../lib/exerciseVideos.js';

const REAL = [
  { start_time: 0, end_time: 9, title: '<Untitled Chapter 1>' },
  { start_time: 9, end_time: 410, title: 'The Barbell Row' },
  { start_time: 410, end_time: 519, title: 'Pull Too Much with the Bicep' },
  { start_time: 519, end_time: 638, title: 'Barbell of Dead Row' },
];

test('the real ATHLEAN-X chapters: the row starts at 9s, not 0', () => {
  const hit = matchChapter(REAL, 'Barbell Row');
  assert.equal(hit.start, 9);
  assert.equal(hit.title, 'The Barbell Row');
});

test('an untitled chapter is never chosen, even at 0', () => {
  const hit = matchChapter([{ start_time: 0, title: '<Untitled Chapter 1>' }], 'Barbell Row');
  assert.equal(hit, null);
});

test('a "how to" chapter earns a point when the name does not appear', () => {
  const hit = matchChapter([
    { start_time: 0, title: 'Intro' },
    { start_time: 45, title: 'How To Set Up' },
    { start_time: 200, title: 'Common Mistakes' },
  ], 'Hip Thrust');
  assert.equal(hit.start, 45);
});

test('word overlap outranks the generic how-to', () => {
  const hit = matchChapter([
    { start_time: 30, title: 'How to warm up' },
    { start_time: 120, title: 'The Hip Thrust' },
  ], 'Hip Thrust');
  assert.equal(hit.start, 120, 'the chapter that names the lift wins');
});

test('no chapters, or chapters that match nothing, is null — not a guess', () => {
  assert.equal(matchChapter([], 'Squat'), null);
  assert.equal(matchChapter([{ start_time: 10, title: 'Sponsor' }, { start_time: 60, title: 'Outro' }], 'Squat'), null);
});

test('a deep link carries the seconds; a zero start is the plain url', () => {
  assert.equal(deepLink('https://www.youtube.com/watch?v=abc', 9), 'https://www.youtube.com/watch?v=abc&t=9s');
  assert.equal(deepLink('https://www.youtube.com/watch?v=abc', 9.8), 'https://www.youtube.com/watch?v=abc&t=9s', 'whole seconds');
  assert.equal(deepLink('https://www.youtube.com/watch?v=abc', 0), 'https://www.youtube.com/watch?v=abc');
  assert.equal(deepLink('https://www.youtube.com/watch?v=abc', undefined), 'https://www.youtube.com/watch?v=abc');
});

test('the short-video threshold is four minutes', () => {
  // under this, the whole video is the demonstration and needs no timecode
  assert.equal(SHORT_SECONDS, 240);
});
