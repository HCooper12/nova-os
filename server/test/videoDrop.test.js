import test from 'node:test';
import assert from 'node:assert/strict';
import { readVideoLink, sentLine } from '../../src/videoDrop.js';

test('a copied video link is found, whatever surrounds it, and tracking tails are no problem', () => {
  assert.deepEqual(readVideoLink('https://www.youtube.com/watch?v=abc123&si=xyz'), { ok: true, url: 'https://www.youtube.com/watch?v=abc123&si=xyz', host: 'youtube.com' });
  assert.equal(readVideoLink('look at this https://youtu.be/abc123?si=q thanks').url, 'https://youtu.be/abc123?si=q');
  assert.equal(readVideoLink('https://www.instagram.com/reel/Cxyz/?igsh=1').ok, true);
  assert.equal(readVideoLink('https://vt.tiktok.com/ZSabc/').ok, true);
  assert.equal(readVideoLink('https://example.com/blog https://youtu.be/abc').url, 'https://youtu.be/abc', 'the video among several links');
});

test('nothing, a channel and a page each get their own plain reason, never a silent send', () => {
  assert.equal(readVideoLink('').ok, false);
  assert.match(readVideoLink('no link here').reason, /Paste a video link/);
  assert.match(readVideoLink('https://www.youtube.com/@somechannel').reason, /channel or profile/);
  assert.match(readVideoLink('https://www.instagram.com/someprofile/').reason, /channel or profile/);
  assert.match(readVideoLink('https://www.bbcgoodfood.com/recipes/x').reason, /page, not a video/);
});

test('what was sent is described by the lane and promises only that it is running and where it lands', () => {
  const look = sentLine({ mode: 'look', host: 'youtube.com' });
  const deep = sentLine({ mode: 'deep', host: 'instagram.com' });
  assert.equal(look.title, 'Quick look · youtube.com');
  assert.match(look.sub, /lands in Waiting/);
  assert.equal(deep.title, 'Full read · instagram.com');
  assert.match(deep.sub, /review/);
  assert.doesNotMatch(look.sub + deep.sub, /done|complete|finished|\$/i, 'no claim of completion and no cost it cannot back');
});
