import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainCause, keptBecause } from '../lib/plainCause.js';

test('the 22 Oct iCloud failure is named as iCloud, never as Claude', () => {
  const m = plainCause(new Error("Unknown system error -11: Unknown system error -11, copyfile '/x/2026-10-20.md'"));
  assert.match(m, /iCloud/);
  assert.doesNotMatch(m, /Claude/);
});

test('known causes read plainly; a lane that is off says so in its own words', () => {
  assert.match(plainCause(new Error('Claude AI usage limit reached')), /usage limit/);
  const off = Object.assign(new Error('Weave is switched off in Settings → Claude models.'), { laneOff: 'ingest' });
  assert.equal(plainCause(off), 'Weave is switched off in Settings → Claude models.');
});

test('an unknown cause passes through as its own words, not a story', () => {
  assert.equal(plainCause(new Error('yt-dlp did not produce a video file.')), 'Yt-dlp did not produce a video file');
  assert.equal(plainCause(null), 'It failed without saying why');
  assert.equal(keptBecause(new Error('boom'), 'Nova kept the link.'), 'Boom. Nova kept the link.');
});
