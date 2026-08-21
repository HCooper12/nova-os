// "Pull up the latest Diary of a CEO video" — the one lane that reaches out
// of the app and into his Mac, so its edges matter more than most.
import test from 'node:test';
import assert from 'node:assert/strict';

const { channelQuery, resolveLatestVideo, openInBrowser, parsePlayDirective } = await import('../lib/mediaLane.js');
const { routeIntent } = await import('../lib/intentRouter.js');

test('the ask is stripped to the thing he named, keeping the name intact', () => {
  assert.equal(channelQuery('pull up the latest Diary of a CEO video'), 'Diary of a CEO');
  assert.equal(channelQuery('Nova, open the latest video from Jeff Nippard please'), 'Jeff Nippard');
  assert.equal(channelQuery('play the newest Huberman Lab episode'), 'Huberman Lab');
});

test('"latest" means latest: it takes the channel\'s newest upload, not the top search hit', async () => {
  const calls = [];
  const runner = async (bin, args) => {
    calls.push(args.find((a) => String(a).startsWith('ytsearch')) || args.find((a) => String(a).includes('/videos')));
    if (args.some((a) => String(a).startsWith('ytsearch'))) {
      return JSON.stringify({ entries: [
        { id: 'old1', title: 'A 2019 episode', channel: 'The Diary Of A CEO', channel_url: 'https://youtube.com/@doac' },
        { id: 'old2', title: 'Another old one', channel: 'The Diary Of A CEO', channel_url: 'https://youtube.com/@doac' },
        { id: 'x', title: 'Someone else', channel: 'Other', channel_url: 'https://youtube.com/@other' },
      ] });
    }
    return JSON.stringify({ entries: [{ id: 'NEW123', title: 'Today\'s episode', duration: 5640 }] });
  };
  const out = await resolveLatestVideo('latest Diary of a CEO video', { runner });
  assert.equal(out.url, 'https://www.youtube.com/watch?v=NEW123');
  assert.equal(out.exact, true, 'it went to the uploads tab, so it can claim newest');
  assert.equal(out.durationMin, 94);
  assert.match(calls[1], /@doac\/videos$/, 'the most-represented channel is the one it opens');
});

test('a channel whose uploads tab refuses degrades to the search hit — and SAYS it is not certain', async () => {
  const runner = async (bin, args) => {
    if (args.some((a) => String(a).startsWith('ytsearch'))) {
      return JSON.stringify({ entries: [{ id: 'S1', title: 'A search hit', channel: 'Chan', channel_url: 'https://youtube.com/@c' }] });
    }
    throw new Error('403');
  };
  const out = await resolveLatestVideo('something', { runner });
  assert.equal(out.url, 'https://www.youtube.com/watch?v=S1');
  assert.equal(out.exact, false, 'honest: this is a match, not provably the newest');
});

test('nothing found is an error, never a guessed URL', async () => {
  const runner = async () => JSON.stringify({ entries: [] });
  await assert.rejects(() => resolveLatestVideo('asdkjhasd', { runner }), /nothing on YouTube/);
  await assert.rejects(() => resolveLatestVideo('play the video', { runner: async () => '{}' }), /nothing named/);
});

test('it will only ever open a resolved YouTube watch URL', async () => {
  const opened = [];
  const opener = async (bin, args) => { opened.push([bin, ...args]); };
  await openInBrowser('https://www.youtube.com/watch?v=NEW123', { opener });
  assert.deepEqual(opened[0], ['/usr/bin/open', 'https://www.youtube.com/watch?v=NEW123']);
  // anything else — a file, a shell attempt, another host — is refused
  for (const bad of ['file:///etc/passwd', 'https://evil.example.com/watch?v=x', 'https://www.youtube.com/watch?v=x; rm -rf ~', '']) {
    await assert.rejects(() => openInBrowser(bad, { opener }), /refusing to open/);
  }
  assert.equal(opened.length, 1, 'nothing else ever reached the opener');
});

test('the PLAY directive is parsed off the reply and validated', () => {
  const ok = parsePlayDirective('Here it is, sir.\nPLAY {"query":"latest Diary of a CEO video"}');
  assert.equal(ok.cleanText, 'Here it is, sir.');
  assert.equal(ok.play.query, 'latest Diary of a CEO video');
  assert.equal(parsePlayDirective('x\nPLAY {"query":""}').play, null, 'a directive naming nothing is dropped');
  assert.equal(parsePlayDirective('x\nPLAY {broken').play, null);
  assert.equal(parsePlayDirective('no directive here').cleanText, 'no directive here');
});

test('the front door routes a spoken "pull up" without the model', () => {
  assert.equal(routeIntent('pull up the latest Diary of a CEO video').lane, 'play');
  assert.equal(routeIntent('play the newest Huberman episode').lane, 'play');
  assert.equal(routeIntent('what did that video say about protein').lane, 'ask', 'talking about a video is not a request to play one');
});
