import test from 'node:test';
import assert from 'node:assert/strict';
import { readVideoLink, readLink, sentLine } from '../../src/videoDrop.js';

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

test('the Send box takes any link and names its kind; deciding what it is FOR is the capture rails\' job', () => {
  assert.deepEqual(readLink('https://www.instagram.com/reel/Cxyz/?igsh=1'), { ok: true, url: 'https://www.instagram.com/reel/Cxyz/?igsh=1', host: 'instagram.com', kind: 'video' });
  assert.equal(readLink('https://www.bbcgoodfood.com/recipes/x').kind, 'recipe-page');
  assert.equal(readLink('https://example.com/a-post').kind, 'article');
  assert.equal(readLink('https://www.youtube.com/@somechannel').kind, 'channel');
  assert.match(readLink('no link').reason, /Paste a link/);
  assert.equal(readLink('copied: https://youtu.be/abc and more').url, 'https://youtu.be/abc');
});

test('what was sent is described by the lane Nova chose, and promises only what that lane really does', () => {
  const recipe = sentLine({ mode: 'auto', kind: 'recipe-video', host: 'instagram.com' });
  const look = sentLine({ mode: 'auto', kind: 'video', host: 'youtube.com' });
  const unknown = sentLine({ mode: 'auto', kind: null, host: 'example.com' });
  const deep = sentLine({ mode: 'deep', host: 'instagram.com' });
  assert.equal(recipe.title, 'Recipe · instagram.com');
  assert.match(recipe.sub, /recipe bank.*Undo in Filed/);
  assert.equal(look.title, 'Quick look · youtube.com');
  assert.match(look.sub, /files to your vault by itself.*Undo/, 'the Watcher files itself (his 7 Sep call); it does not wait in Waiting');
  assert.match(unknown.sub, /Waiting or Filed/);
  assert.equal(deep.title, 'Full read · instagram.com');
  assert.match(deep.sub, /review/);
  assert.doesNotMatch([recipe, look, unknown, deep].map((x) => x.sub).join(' '), /\bdone\b|complete|finished|\$/i, 'no claim of completion and no cost it cannot back');
});
