// THE BROWSER HAND, LIVE — what he sees on the glass while Nova works.
//
// The stream from the CLI is turned into human steps: a navigation becomes
// "Opening youtube.com", a screenshot becomes a window, the model's own
// narration becomes the caption. The hand's bookkeeping (snapshots, script
// evaluations) is not a step — he does not need to watch Nova think.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepFromEvent, lastUrlOf, openInNovaBrowser, VIEW_PROFILE_DIR, parseBrowseResult } from '../lib/browse.js';
import { PROFILE_DIR } from '../lib/browserResearch.js';

const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: `mcp__chrome-devtools__${name}`, input }] } });
const text = (t) => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });

test('a navigation is a step he can read, with the host not the whole URL', () => {
  const s = stepFromEvent(tool('navigate_page', { url: 'https://www.youtube.com/@TheDiaryOfACEO/videos' }));
  assert.equal(s.kind, 'navigate');
  assert.equal(s.text, 'Opening youtube.com/@TheDiaryOfACEO/videos', 'the path says where, not just which site');
  assert.equal(s.url, 'https://www.youtube.com/@TheDiaryOfACEO/videos');
  assert.equal(stepFromEvent(tool('new_page', { url: 'https://example.org' })).text, 'Opening example.org');
});

test('a screenshot is a window — the file name rides so the glass can fetch it', () => {
  const s = stepFromEvent(tool('take_screenshot', { filePath: '/data/browse/ab12/shot-3.jpg' }));
  assert.equal(s.kind, 'shot');
  assert.equal(s.shot, 'shot-3.jpg');
  assert.equal(stepFromEvent(tool('take_screenshot', {})), null, 'no path means no file on disk — no window, no step');
});

test('clicks, typing and waits are steps; snapshots and evaluations are not', () => {
  assert.equal(stepFromEvent(tool('click', { uid: 'x' })).kind, 'click');
  assert.equal(stepFromEvent(tool('fill', { uid: 'x', value: 'y' })).kind, 'type');
  assert.equal(stepFromEvent(tool('wait_for', { text: 'Videos' })).kind, 'wait');
  assert.equal(stepFromEvent(tool('take_snapshot', {})), null);
  assert.equal(stepFromEvent(tool('evaluate_script', { function: '() => 1' })), null);
});

test('the model\'s narration is the caption, minus its final BROWSE block', () => {
  const s = stepFromEvent(text('Opening the channel\'s Videos tab now.\n\nBROWSE {"done":true,"summary":"x"}'));
  assert.equal(s.kind, 'say');
  assert.equal(s.text, 'Opening the channel\'s Videos tab now.');
  assert.equal(stepFromEvent(text('BROWSE {"done":true}')), null, 'a block with no narration is not a step');
  assert.equal(stepFromEvent({ type: 'user', message: {} }), null);
  assert.equal(stepFromEvent({ type: 'result', result: 'x' }), null, 'the result is handled elsewhere');
});

// THE ROUTER: things he wants to SEE go to the browser hand, live on the
// glass; "play"/"put on" keeps opening the Mac's browser directly; research
// and links keep their own lanes.
test('media-shaped asks route to the browser hand; play, research and links do not', async () => {
  const { routeIntent } = await import('../lib/intentRouter.js');
  const lane = (q) => routeIntent(q).lane;
  assert.equal(lane('open the diary of a ceo youtube channel'), 'browse');
  assert.equal(lane('show me the latest diary of a ceo video'), 'browse');
  assert.equal(lane('find me the most popular video that has both chris williamson and alex hormozi in it'), 'browse');
  assert.equal(lane('open up youtube and find the diary of a ceo channel'), 'browse');
  assert.equal(lane('play the latest huberman episode'), 'play', '"play" still opens the Mac browser directly');
  assert.equal(lane('what does the evidence say about fasted training'), 'research');
  assert.equal(lane('research zone 2 and write me a report'), 'brief');
  assert.equal(lane('https://youtu.be/abc'), 'watch', 'a bare link is still the Watcher');
  assert.equal(lane('should i deload today'), 'coach');
});

// OPEN IT FOR REAL (8 Sep 2026): the visible window must never share the
// hand's profile — a visible window holds Chrome's lock and the next headless
// run cannot start (seen live). And only a web address is ever opened.
test('the visible browser has its own profile, and refuses anything but http(s)', async () => {
  assert.notEqual(VIEW_PROFILE_DIR, PROFILE_DIR);
  assert.ok(VIEW_PROFILE_DIR.startsWith(PROFILE_DIR), 'a sibling of the hand\'s profile, easy to find');
  await assert.rejects(openInNovaBrowser('file:///etc/passwd'), /not a web address/);
  await assert.rejects(openInNovaBrowser('javascript:alert(1)'), /not a web address/);
  await assert.rejects(openInNovaBrowser(''), /not a web address/);
});

test('the page the hand is on is the last place it navigated', () => {
  const feed = { steps: [{ kind: 'navigate', url: 'https://a.example/' }, { kind: 'shot', shot: 'shot-1.png' }, { kind: 'navigate', url: 'https://b.example/x' }, { kind: 'say', text: 'done' }] };
  assert.equal(lastUrlOf(feed), 'https://b.example/x');
  assert.equal(lastUrlOf({ steps: [] }), null);
  assert.equal(lastUrlOf(null), null);
});

test('the hand states the page it finished on; anything but a web address is dropped', () => {
  const ok = parseBrowseResult('BROWSE {"done":true,"url":"https://www.youtube.com/watch?v=abc123","summary":"x","steps":[]}');
  assert.equal(ok.url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(parseBrowseResult('BROWSE {"done":true,"url":"javascript:alert(1)","summary":"x"}').url, null);
  assert.equal(parseBrowseResult('BROWSE {"done":true,"summary":"x"}').url, null);
});
