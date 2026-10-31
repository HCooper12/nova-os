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
  assert.equal(plainCause(new Error('the toaster exploded.')), 'The toaster exploded');
  assert.equal(plainCause(null), 'It failed without saying why');
  assert.equal(keptBecause(new Error('boom'), 'Nova kept the link.'), 'Boom. Nova kept the link.');
});

test('yt-dlp reasons are said in plain words (31 Oct: an Instagram photo post said only a temp path)', () => {
  assert.match(plainCause(new Error('No video formats found!; please report this issue on https://github.com/yt-dlp')), /no video/i);
  assert.match(plainCause(new Error('yt-dlp did not produce a video file in /private/var/x (exit 1)')), /no video/i);
  assert.match(plainCause(new Error('login required to view this post')), /needs a login/);
});
