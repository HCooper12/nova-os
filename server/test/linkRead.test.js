// READ HIS LINK BEFORE ANSWERING (3 Nov 2026): the reel he pasted into Start a
// project got "I can't open Instagram reels from here". Code now reads every
// link before the intake model's turn; nothing here fetches or spawns.
import { mkdtempSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-linkread-'));
const dataDir = path.join(base, 'data');
mkdirSync(dataDir, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { linksIn, readLinks, linkBlock, readLinksIn } = await import('../lib/linkRead.js');
const { toNetscape, signedIn, platformOf, ytdlpAuthFor, signInHint, _setWatchAuthDepsForTest, authDir } = await import('../lib/watchAuth.js');
const { startIntake } = await import('../lib/projectIntake.js');

const REEL = 'https://www.instagram.com/reel/DflPU2ahi4c/?rpxt=MTVyOTRnN3hnOTRlcQ==';
const HIS = `${REEL}\n\nWatch this to understand the idea. I want to become insanely articulate and intelligent with my speech and communication`;

test('linksIn finds his reel with its query string, trims trailing punctuation, de-duplicates, caps at three', () => {
  assert.deepEqual(linksIn(HIS), [REEL]);
  assert.deepEqual(linksIn('see https://a.com/x). and https://a.com/x, https://b.com https://c.com https://d.com'), ['https://a.com/x', 'https://b.com', 'https://c.com']);
  assert.deepEqual(linksIn('no links here'), []);
});

const readers = (over = {}) => ({
  isVideo: (u) => /instagram|youtube/.test(u),
  transcript: async () => ({ ok: true, title: 'Speak better', text: 'Pause before the point. Use one idea per sentence.', note: 'transcript via whisper' }),
  page: async () => ({ ok: true, title: 'A page', text: 'page text' }),
  hasCaption: (u) => /instagram/.test(u),
  ...over,
});

test('a reel is watched, and the block hands the model what was said', async () => {
  const r = await readLinks([REEL], { workDir: base, readers: readers() });
  assert.equal(r[0].ok, true);
  assert.match(r[0].how, /watched/);
  const b = linkBlock(r);
  assert.match(b, /Pause before the point/);
  assert.match(b, /Never say you cannot open links/);
});

test('a reel whose video is refused falls back to the post page, and says the video failed', async () => {
  const r = await readLinks([REEL], { workDir: base, readers: readers({
    transcript: async () => ({ ok: false, reason: 'Instagram only shows this post to a signed-in account' }),
    page: async () => ({ ok: true, title: 'Reel', text: 'caption: 3 habits of articulate people' }),
  }) });
  assert.equal(r[0].ok, true);
  const b = linkBlock(r);
  assert.match(b, /3 habits/);
  assert.match(b, /The video itself failed: Instagram only shows/);
});

test('nothing readable: the exact reason reaches the model, never a guess', async () => {
  const r = await readLinks([REEL], { workDir: base, readers: readers({
    transcript: async () => ({ ok: false, reason: 'Instagram only shows this post to a signed-in account' }),
    page: async () => ({ ok: false, reason: 'the platform showed a login wall' }),
  }) });
  assert.equal(r[0].ok, false);
  assert.match(linkBlock(r), /COULD NOT BE READ: Instagram only shows this post/);
});

test('a reader that throws is a result, not a crash', async () => {
  const r = await readLinks(['https://example.com'], { workDir: base, readers: readers({ page: async () => { throw new Error('boom'); } }) });
  assert.deepEqual([r[0].ok, r[0].reason], [false, 'boom']);
  assert.deepEqual(await readLinksIn('no link'), { results: [], block: '' });
});

test('startIntake: words with a link hand the runner a function that reads first and puts the block before his words', async () => {
  let got = null;
  const runTurn = async (vp, opts) => { got = opts; return { jobId: 'j', sessionId: 's' }; };
  const readLinks = async (words) => { assert.equal(words, HIS); return { block: 'WHAT NOVA READ FROM HIS LINK(S): pause before the point' }; };
  await startIntake(base, { text: HIS }, { runTurn, readLinks });
  assert.equal(typeof got.text, 'function');
  const prompt = await got.text();
  assert.ok(prompt.indexOf('pause before the point') < prompt.indexOf('HIS WORDS:'));
  assert.match(prompt, /Never tell him you cannot open links/);
  // a later turn in the same session: block, then his words alone
  await startIntake(base, { text: `also ${REEL}`, sessionId: '00000000-0000-0000-0000-000000000000' }, { runTurn, readLinks: async () => ({ block: 'READ: x' }) });
  assert.equal(await got.text(), `READ: x\n\nHIS WORDS:\nalso ${REEL}`);
  // no link: a plain string as before
  await startIntake(base, { text: 'a room redesign' }, { runTurn, readLinks: () => { throw new Error('must not read'); } });
  assert.equal(typeof got.text, 'string');
});

test('the runner says "reading your link" while code reads, then runs the turn', async () => {
  const { readFileSync: rf } = await import('node:fs');
  const src = rf(new URL('../lib/claudeCode.js', import.meta.url), 'utf8');
  assert.match(src, /typeof text === 'function'[\s\S]{0,200}job\.stage = 'reading your link'/);
});

// ---- the Watcher's borrowed sign-in --------------------------------------

const COOKIES = [
  { name: 'sessionid', value: 'abc', domain: '.instagram.com', path: '/', secure: true, expires: 1900000000 },
  { name: 'csrftoken', value: 'x\ty', domain: '.instagram.com', path: '/', secure: true, session: true },
  { name: 'SID', value: 'google', domain: '.google.com', path: '/', secure: true, expires: 1900000000 },
];

test('platformOf and signedIn', () => {
  assert.equal(platformOf(REEL), 'instagram');
  assert.equal(platformOf('https://twitter.com/a/status/1'), 'x');
  assert.equal(platformOf('https://youtube.com/watch?v=1'), null);
  assert.equal(signedIn(COOKIES, 'instagram'), true);
  assert.equal(signedIn(COOKIES.slice(1), 'instagram'), false);
});

test('toNetscape writes only the platform\'s own cookies, never another site\'s, and keeps rows whole', () => {
  const { text, count } = toNetscape(COOKIES, 'instagram.com');
  assert.equal(count, 2);
  assert.doesNotMatch(text, /google/);
  const rows = text.split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.split('\t').length, 7);
  assert.match(rows[1], /\t0\tcsrftoken\txy$/);
});

test('ytdlpAuthFor lends a 0600 cookie file through yt-dlp\'s own config, and nothing when not signed in', async () => {
  _setWatchAuthDepsForTest({ profileCookies: async () => COOKIES.slice(1) });
  const none = await ytdlpAuthFor(REEL);
  assert.equal(none.env, null);
  assert.match(none.reason, /not signed in to Instagram/);
  assert.deepEqual(await ytdlpAuthFor('https://youtube.com/watch?v=1'), { env: null, platform: null });

  _setWatchAuthDepsForTest({ profileCookies: async () => COOKIES });
  const lent = await ytdlpAuthFor(REEL);
  const dir = path.join(authDir(), 'instagram');
  assert.deepEqual(lent.env, { XDG_CONFIG_HOME: dir });
  assert.equal(statSync(path.join(dir, 'cookies.txt')).mode & 0o777, 0o600);
  assert.match(readFileSync(path.join(dir, 'yt-dlp', 'config'), 'utf8'), /^--cookies ".*cookies\.txt"\n$/);
  // fresh: the profile is not opened again within 30 minutes
  _setWatchAuthDepsForTest({ profileCookies: async () => { throw new Error('must not reopen'); } });
  assert.deepEqual((await ytdlpAuthFor(REEL)).env, { XDG_CONFIG_HOME: dir });
  _setWatchAuthDepsForTest();
});

test('signInHint turns yt-dlp\'s login refusal into the real cause, and leaves other errors alone', () => {
  const raw = 'DflPU2ahi4c: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in.';
  assert.match(signInHint(REEL, raw), /only shows this post to a signed-in account/);
  assert.match(signInHint(REEL, raw, { lent: true }), /refused this post even with Nova's sign-in/);
  assert.equal(signInHint(REEL, 'ffmpeg not found'), null);
  assert.equal(signInHint('https://youtube.com/watch?v=1', raw), null);
});

// ---- Instagram: watching only (his condition, 4 Nov 2026) ------------------

const wa = await import('../lib/watchAuth.js');

test('Instagram: only a post, reel or IGTV page may be opened; his inbox, profile data and settings never', () => {
  for (const ok of [REEL, 'https://instagram.com/p/Abc_123/', 'https://www.instagram.com/someone/reel/Abc-1/', 'https://www.instagram.com/tv/Abc1/'])
    assert.equal(wa.instagramAllowed(ok), true, ok);
  for (const no of ['https://www.instagram.com/direct/inbox/', 'https://www.instagram.com/direct/t/123/', 'https://www.instagram.com/accounts/edit/',
    'https://www.instagram.com/', 'https://www.instagram.com/someone/', 'https://www.instagram.com/stories/someone/1/', 'https://www.instagram.com/explore/',
    'https://evil.com/?u=instagram.com/reel/x/', 'https://instagram.com.evil.com/reel/x/', 'javascript:alert(1)'])
    assert.equal(wa.instagramAllowed(no), false, no);
});

test('Instagram requests: inbox, account and every write are aborted; a page\'s own reads pass; other sites untouched', () => {
  const B = wa.instagramRequestBlocked;
  assert.equal(B('https://www.instagram.com/api/v1/direct_v2/inbox/'), true);
  assert.equal(B('https://www.instagram.com/direct/inbox/'), true);
  assert.equal(B('https://www.instagram.com/api/v1/web/likes/123/like/', 'POST'), true);
  assert.equal(B('https://www.instagram.com/api/v1/media/123/comment/', 'POST'), true);
  assert.equal(B('https://www.instagram.com/api/v1/friendships/create/9/', 'POST'), true);
  assert.equal(B('https://www.instagram.com/some/new/write', 'POST'), true);
  assert.equal(B('https://www.instagram.com/graphql/query', 'POST'), false);
  assert.equal(B('https://www.instagram.com/reel/Abc/', 'GET'), false);
  assert.equal(B('https://scontent.cdninstagram.com/v/x.mp4', 'GET'), false);
  assert.equal(B('https://example.com/direct/inbox', 'POST'), false);
});

test('the browser hand cannot reach Instagram at all, and the yt-dlp cookies are lent only for a reel', async () => {
  assert.deepEqual(wa.HAND_BLOCKED_URL_PATTERNS, ['*://instagram.com/*', '*://*.instagram.com/*']);
  const src = readFileSync(new URL('../lib/browse.js', import.meta.url), 'utf8');
  assert.match(src, /HAND_BLOCKED_URL_PATTERNS\.flatMap\(\(p\) => \['--blockedUrlPattern', p\]\)/);
  _setWatchAuthDepsForTest({ profileCookies: async () => { throw new Error('must not open'); } });
  const r = await ytdlpAuthFor('https://www.instagram.com/direct/inbox/');
  assert.equal(r.env, null);
  assert.match(r.reason, /only watches Instagram posts and reels/);
  _setWatchAuthDepsForTest();
});

test('readWithBrowser refuses a non-post Instagram address before any browser opens', async () => {
  const { readWithBrowser } = await import('../lib/browserResearch.js');
  const r = await readWithBrowser('https://www.instagram.com/direct/inbox/');
  assert.equal(r.ok, false);
  assert.match(r.reason, /only watches Instagram posts and reels|not installed/);
});

test('the Instagram page read takes the post caption only, never the page body (his sidebar and message counts)', () => {
  const src = readFileSync(new URL('../lib/browserResearch.js', import.meta.url), 'utf8');
  const ig = src.slice(src.indexOf('if (isInstagram(url)) {\n        const meta'), src.indexOf('const out = await page.evaluate'));
  assert.match(ig, /og:description/);
  assert.doesNotMatch(ig, /innerText|textContent/);
});
