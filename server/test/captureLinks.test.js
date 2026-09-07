// A LINK IS NOT A NOTE.
//
// His report, 7 Sep 2026: he pasted a YouTube link with "Research and analyse
// this video" into the Inbox and nothing watched it — it filed as an
// unclassified note. The lane router already knew what a video link was; the
// capture path never asked it. This pins the decision so no front door can
// quietly go back to treating a link as prose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureLane } from '../lib/inbox.js';

test('a captured video link routes to the Watcher, carrying his instruction', () => {
  const d = captureLane('https://youtu.be/MGxcosNuC8k?si=ViCNnsot-cpYEZ8Y Research and analyse this video');
  assert.equal(d.lane, 'watch');
  assert.equal(d.url, 'https://youtu.be/MGxcosNuC8k?si=ViCNnsot-cpYEZ8Y');
  assert.equal(d.prose, 'Research and analyse this video', 'what he asked for travels with the link');
});

test('a bare link is enough — he should never have to say "watch this"', () => {
  for (const url of [
    'https://youtu.be/abc123',
    'https://www.youtube.com/watch?v=abc123',
    'https://www.instagram.com/reel/Dc8lIAARmmS/',
    'https://vimeo.com/123456789',
  ]) {
    const d = captureLane(url);
    assert.equal(d?.lane, 'watch', `${url} should watch itself`);
    assert.equal(d.prose, '');
  }
});

test('a channel is a body of work, not one video — it studies', () => {
  const d = captureLane('https://www.youtube.com/@hubermanlab analyse everything he says about sleep');
  assert.equal(d?.lane, 'study');
});

test('prose still classifies as prose — the divert is only for links', () => {
  for (const text of [
    'milk',
    'remind me to call mum at 5',
    'note: the leadership conversation went better than expected',
    'buy protein powder',
    'I had lunch',
  ]) {
    assert.equal(captureLane(text), null, `"${text}" must stay an ordinary capture`);
  }
});

test('a non-media link is still an ordinary capture — the Watcher is not a URL bin', () => {
  assert.equal(captureLane('https://www.smh.com.au/some-article'), null);
});
