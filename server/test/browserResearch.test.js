// Which tool reads which URL. Pure routing, so it is testable without a
// browser, a network call, or a cent — and this is the decision that
// matters: yt-dlp for video (the transcript is where the ideas are), his
// signed-in browser only for platforms that refuse an anonymous fetch.
import test from 'node:test';
import assert from 'node:assert/strict';

const { toolFor, classifyUrl, gatheredContext } = await import('../lib/browserResearch.js');

test('video always goes to the transcript, never the browser', () => {
  assert.equal(toolFor('https://www.youtube.com/watch?v=abc123'), 'transcript');
  assert.equal(toolFor('https://youtu.be/abc123'), 'transcript');
  assert.equal(toolFor('https://www.youtube.com/@hubermanlab'), 'transcript');
});

test('the walled platforms go to his signed-in browser', () => {
  for (const u of [
    'https://www.instagram.com/conversationalfreedom',
    'https://www.tiktok.com/@someone',
    'https://x.com/naval',
    'https://twitter.com/naval',
    'https://www.linkedin.com/in/someone',
  ]) assert.equal(toolFor(u), 'browser', u);
});

test('an ordinary page is left to the agent — no browser spun up for a blog', () => {
  assert.equal(toolFor('https://someones-blog.com/post'), 'fetch');
  assert.equal(toolFor('not a url at all'), 'fetch');
});

test('classification is host-exact, so a lookalike domain cannot impersonate', () => {
  assert.equal(classifyUrl('https://www.instagram.com/x'), 'instagram');
  assert.equal(classifyUrl('https://instagram.com.evil.co/x'), 'other', 'suffix must not match');
  assert.equal(classifyUrl('https://notyoutube.com/x'), 'other');
});

test('a refusal reaches the model as a refusal — never papered over', () => {
  const ctx = gatheredContext([
    { tool: 'transcript', url: 'https://youtu.be/a', ok: true, title: 'A talk', text: 'the actual words' },
    { tool: 'browser', url: 'https://instagram.com/b', ok: false, reason: 'the platform showed a login wall — this Nova browser profile is not signed in to it' },
  ]);
  assert.ok(ctx.includes('the actual words'), 'what it got is handed over');
  assert.ok(ctx.includes('COULD NOT GET'), 'what it missed is stated');
  assert.ok(ctx.includes('login wall'), 'and stated with the real reason');
});

test('nothing gathered means nothing added — no empty scaffolding', () => {
  assert.equal(gatheredContext([]), '');
  assert.equal(gatheredContext([{ tool: 'fetch', url: 'https://a.com', ok: false, reason: 'left for the agent' }]), '');
});
