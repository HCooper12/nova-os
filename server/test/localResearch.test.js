// The Claude-free research lane (lib/localResearch.js, 1 Nov 2026): the
// search results read from the page's HTML (a hand-written fixture in Bing's
// shape), a page read over a local http stub, and the one summary call with a
// stubbed model, including the citation check and every honest failure.
// Nothing here launches Chrome (every browser is a seam) or reaches the
// network beyond 127.0.0.1; NOVA_DATA_DIR is a temp dir set before import.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-localresearch-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  parseSearchResults, resultTarget, webSearch, readPage, researchLocally, gatherWeb,
  checkSummary, withSources, searchQuery, summaryPrompt, webCanRun, searchResting,
} = await import('../lib/localResearch.js');

const b64 = (u) => `a1${Buffer.from(u).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
const ck = (u) => `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;ptn=3&amp;ver=2&amp;u=${b64(u)}&amp;ntb=1`;

// Bing's shape as measured 1 Nov 2026: li.b_algo, an h2 > a through the
// click tracker, the snippet in .b_caption p with a date span in front
const FIXTURE = `<!doctype html><html><head><title>protein per kg - Search</title></head><body>
<ol id="b_results">
<li class="b_algo" data-id="" iid="SERP.1"><link rel="stylesheet" href="x.css"><div class="b_tpcn"><a class="tilk" href="${ck('https://www.healthline.com/nutrition/protein-per-day')}">healthline.com</a></div>
<h2><a target="_blank" href="${ck('https://www.healthline.com/nutrition/protein-per-day')}" h="ID=SERP,1">How Much <strong>Protein</strong> Per Day? - Healthline</a></h2>
<div class="b_caption"><p class="b_lineclamp2"><span class="news_dt">15 Jul 2026</span>&nbsp;· Most people need 1.6&ndash;2.2 g per kg for muscle gain &amp; strength …</p></div></li>
<li class="b_ans"><h2><a href="https://www.bing.com/videos/search?q=protein">Videos</a></h2></li>
<li class="b_algo"><h2><a href="${ck('https://pubmed.ncbi.nlm.nih.gov/28698222/')}">Protein supplementation meta-analysis</a></h2><div class="b_caption"><p>A systematic review found gains plateau near 1.62 g/kg/day.</p></div></li>
<li class="b_algo"><h2><a href="${ck('https://www.healthline.com/nutrition/protein-per-day/')}">Duplicate of the first</a></h2><div class="b_caption"><p>same page</p></div></li>
<li class="b_algo"><h2><a href="https://www.microsoft.com/en-us/bing">Bing's own link</a></h2></li>
<li class="b_algo"><h2><a href="https://www.youtube.com/watch?v=abc">A protein video</a></h2><div class="b_caption"><p>video</p></div></li>
<li class="b_algo"><h2><a href="https://direct.example.org/page">A direct link</a></h2><div class="b_caption"><p>Direct &quot;quoted&quot; snippet.</p></div></li>
</ol></body></html>`;

test('the result list is read from the page: titles, real URLs out of the click tracker, snippets; duplicates and Bing\'s own links left out', () => {
  const r = parseSearchResults(FIXTURE, { max: 10 });
  assert.deepEqual(r.map((x) => x.url), [
    'https://www.healthline.com/nutrition/protein-per-day',
    'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    'https://www.youtube.com/watch?v=abc',
    'https://direct.example.org/page',
  ]);
  assert.equal(r[0].title, 'How Much Protein Per Day? - Healthline');
  assert.match(r[0].snippet, /^Most people need 1\.6.2\.2 g per kg for muscle gain & strength …$/, 'the date is taken off, entities decoded');
  assert.equal(r[3].snippet, 'Direct "quoted" snippet.');
  assert.equal(parseSearchResults(FIXTURE, { max: 2 }).length, 2, 'capped');
  assert.deepEqual(parseSearchResults('<html><body>no results</body></html>'), []);
});

test('the click tracker decodes to the real address; anything else is refused', () => {
  assert.equal(resultTarget(ck('https://example.com/a?b=1')), 'https://example.com/a?b=1');
  assert.equal(resultTarget('https://www.bing.com/ck/a?u=zzz'), null);
  assert.equal(resultTarget(`https://www.bing.com/ck/a?u=${b64('javascript:alert(1)')}`), null);
  assert.equal(resultTarget('javascript:alert(1)'), null);
});

// a fake Chrome page: goto/content/evaluate, never a browser
const fakeWithPage = (html, text = '') => async (fn) => fn({
  goto: async () => {},
  content: async () => html,
  evaluate: async () => text,
});

test('webSearch reads the results through the browser seam, and says a human check is one', async () => {
  const got = await webSearch('protein per kg', { deps: { withPage: fakeWithPage(FIXTURE) } });
  assert.equal(got.host, 'www.bing.com');
  assert.equal(got.results[0].url, 'https://www.healthline.com/nutrition/protein-per-day');
  await assert.rejects(
    webSearch('x', { deps: { withPage: fakeWithPage('<html><body>Our systems have detected unusual traffic</body></html>', 'Our systems have detected unusual traffic') } }),
    /asked for a human check/,
  );
  await assert.rejects(webSearch('x', { deps: { withPage: fakeWithPage('<html><body>nothing</body></html>') } }), /no results Nova could read/);
  await assert.rejects(webSearch('', { deps: { withPage: fakeWithPage(FIXTURE) } }), /nothing to search for/);
  await assert.rejects(webSearch('x', { deps: { withPage: async () => { throw new Error('boom'); } } }), /could not be opened \(boom\)/);
  assert.equal(searchResting(), null, 'a seam never rests the real search');
});

test('under the test runner Nova\'s browser is never launched', async () => {
  assert.equal(webCanRun(), false);
  await assert.rejects(webSearch('protein per kg'), /Chrome|profile|test runner/);
});

// the local page server
const LONG = `<html><head><title>Protein guide</title><script>var x = "never read";</script></head><body><nav>menu menu</nav><p>${'Aim for 1.6 to 2.2 grams of protein per kilogram of body weight each day. '.repeat(20)}</p></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/long') { res.setHeader('Content-Type', 'text/html'); return res.end(LONG); }
  if (req.url === '/thin') { res.setHeader('Content-Type', 'text/html'); return res.end('<html><body><div id="app"></div><script>app()</script></body></html>'); }
  if (req.url === '/check') { res.setHeader('Content-Type', 'text/html'); return res.end('<html><head><title>Just a moment...</title></head><body><p>Performing security verification. This website uses a security service to protect against malicious bots and needs to check your browser before continuing to the page you asked for.</p></body></html>'); }
  if (req.url === '/broken') { res.statusCode = 500; return res.end('oops'); }
  if (req.url === '/pdf') { res.setHeader('Content-Type', 'application/pdf'); return res.end('%PDF'); }
  res.statusCode = 403; res.end('no bots');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await rm(root, { recursive: true, force: true }).catch(() => {});
});

test('readPage: a fetch first, the readable words only, clipped with a marker', async () => {
  const p = await readPage(`${base}/long`, { maxChars: 300, deps: { chromeRead: async () => { throw new Error('Chrome must not be used for a readable page'); } } });
  assert.equal(p.ok, true);
  assert.equal(p.via, 'fetch');
  assert.equal(p.title, 'Protein guide');
  assert.equal(p.host, '127.0.0.1');
  assert.match(p.text, /^Aim for 1\.6 to 2\.2 grams/);
  assert.doesNotMatch(p.text, /never read|menu/);
  assert.match(p.text, /\[… cut at 300 characters\]$/);
});

test('readPage: a refused or empty fetch gets one look in Chrome; a walled platform goes straight to Chrome; a video and a PDF are refused plainly', async () => {
  const chromeAsked = [];
  const chromeRead = async (url) => { chromeAsked.push(url); return { url, ok: true, title: 'Rendered', text: 'rendered words' }; };
  const thin = await readPage(`${base}/thin`, { deps: { chromeRead } });
  assert.equal(thin.via, 'chrome');
  assert.equal(thin.text, 'rendered words');
  // a refusal is taken at its word: not retried in Chrome
  const refused = await readPage(`${base}/blocked`, { deps: { chromeRead } });
  assert.equal(refused.ok, false);
  assert.equal(refused.via, 'fetch');
  assert.match(refused.reason, /refused the read \(403\)/);
  const broken = await readPage(`${base}/broken`, { deps: { chromeRead } });
  assert.equal(broken.via, 'chrome', 'a server error gets one look in Chrome');
  const insta = await readPage('https://www.instagram.com/someone', { deps: { chromeRead, fetchImpl: async () => { throw new Error('a walled page must not be fetched'); } } });
  assert.equal(insta.via, 'chrome');
  assert.equal(chromeAsked.length, 3);
  const checked = await readPage(`${base}/check`, { deps: { chromeRead } });
  assert.equal(checked.ok, false);
  assert.match(checked.reason, /human check/);
  assert.equal(chromeAsked.length, 3, 'a human check is never retried in Chrome');
  const cfChrome = await readPage('https://x.com/someone', { deps: { chromeRead: async (url) => ({ url, ok: true, title: 'Just a moment...', text: 'Performing security verification' }) } });
  assert.equal(cfChrome.ok, false);
  assert.match(cfChrome.reason, /human check/);
  const video = await readPage('https://www.youtube.com/watch?v=abc', { deps: { chromeRead } });
  assert.equal(video.ok, false);
  assert.match(video.reason, /video/);
  const pdf = await readPage(`${base}/pdf`, { deps: { chromeRead } });
  assert.equal(pdf.ok, false);
  assert.match(pdf.reason, /not a web page \(application\/pdf\)/);
  const walled = await readPage('https://www.linkedin.com/in/x', { deps: { chromeRead: async (url) => ({ url, ok: false, reason: 'the platform showed a login wall' }) } });
  assert.equal(walled.ok, false);
  assert.match(walled.reason, /login wall/);
});

// a whole research run on seams: search, reads, the model
const RESULTS = [
  { title: 'Healthline', url: 'https://www.healthline.com/p', snippet: '' },
  { title: 'A video', url: 'https://youtu.be/x', snippet: '' },
  { title: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/1/', snippet: '' },
  { title: 'Broken', url: 'https://broken.example/x', snippet: '' },
];
const PAGES = {
  'https://www.healthline.com/p': { ok: true, via: 'fetch', host: 'www.healthline.com', title: 'How much protein', text: '1.6 to 2.2 g/kg a day for muscle gain.' },
  'https://pubmed.ncbi.nlm.nih.gov/1/': { ok: true, via: 'fetch', host: 'pubmed.ncbi.nlm.nih.gov', title: 'Meta-analysis', text: 'Gains plateau near 1.62 g/kg/day.' },
  'https://broken.example/x': { ok: false, via: 'fetch', host: 'broken.example', reason: 'the page answered 500' },
};
const seams = (reply, calls = []) => ({
  search: async () => ({ results: RESULTS, ms: 900, host: 'www.bing.com' }),
  read: async (url) => ({ url, ms: 50, ...PAGES[url] }),
  complete: async (prompt, opts) => { calls.push({ prompt, opts }); return { text: typeof reply === 'function' ? reply(prompt) : reply }; },
});

test('researchLocally: search, read, one summary; the answer cites real pages; every host is receipted', async () => {
  const calls = [];
  const r = await researchLocally('look up the recommended protein intake per kg for muscle gain', { deps: seams('About 1.6 to 2.2 g per kg a day [1], with gains levelling off near 1.62 [2].', calls) });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.sources, [
    { n: 1, url: 'https://www.healthline.com/p', title: 'How much protein' },
    { n: 2, url: 'https://pubmed.ncbi.nlm.nih.gov/1/', title: 'Meta-analysis' },
  ]);
  assert.equal(r.pagesRead, 2);
  assert.deepEqual(r.hostsRead, ['www.bing.com', 'www.healthline.com', 'pubmed.ncbi.nlm.nih.gov', 'broken.example']);
  assert.equal(r.misses.length, 1, 'the broken page is a miss, said as one');
  assert.equal(r.timings.search, 900);
  assert.ok(Number.isFinite(r.ms) && Number.isFinite(r.timings.summary));
  // one model call, the question and the numbered pages, the rules
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.maxTokens, 700);
  assert.match(calls[0].prompt, /QUESTION: look up the recommended/);
  assert.match(calls[0].prompt, /\[1\] How much protein\nhttps:\/\/www\.healthline\.com\/p\n1\.6 to 2\.2/);
  assert.match(calls[0].prompt, /\[2\] Meta-analysis/);
  assert.doesNotMatch(calls[0].prompt, /youtu\.be/, 'a video is not read as a page');
  assert.match(calls[0].prompt, /Answer only from the sources/);
});

test('researchLocally: a citation that was never a source, an empty answer, no citation, or "the sources do not say" are honest failures', async () => {
  const fake = await researchLocally('q', { deps: seams('It is 3 g per kg [3].') });
  assert.equal(fake.ok, false);
  assert.match(fake.reason, /cited a source it was never given \(\[3\]\)/);
  assert.equal(fake.text, undefined, 'no text to speak');
  const empty = await researchLocally('q', { deps: seams('   ') });
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /empty answer/);
  const uncited = await researchLocally('q', { deps: seams('About 1.6 g per kg.') });
  assert.match(uncited.reason, /without citing/);
  const none = await researchLocally('q', { deps: seams('The sources I read do not answer that.') });
  assert.match(none.reason, /do not answer it/);
  const thinkOnly = await researchLocally('q', { deps: seams('<think>hmm</think>') });
  assert.match(thinkOnly.reason, /empty answer/);
});

test('researchLocally: a failed search, no readable page, or a model that cannot run fail plainly, before or instead of a guess', async () => {
  const noSearch = await researchLocally('q', { deps: { ...seams('x [1]'), search: async () => { throw new Error('bing.com asked for a human check instead of showing results'); } } });
  assert.equal(noSearch.ok, false);
  assert.match(noSearch.reason, /the web search failed: bing\.com asked for a human check/);
  let asked = false;
  const unread = await researchLocally('q', { deps: { ...seams('x [1]'), read: async (url) => ({ url, ok: false, via: 'fetch', host: 'h', reason: 'refused' }), complete: async () => { asked = true; return { text: 'x [1]' }; } } });
  assert.match(unread.reason, /none of the pages/);
  assert.equal(asked, false, 'the model is never asked with nothing to read');
  const dead = await researchLocally('q', { deps: { ...seams(''), complete: async () => { throw new Error('Ollama is not running'); } } });
  assert.match(dead.reason, /could not summarise: Ollama is not running/);
});

test('gatherWeb numbers the pages it could read, in result order', async () => {
  const g = await gatherWeb('q', { deps: seams('') });
  assert.deepEqual(g.sources.map((s) => [s.n, s.url]), [[1, 'https://www.healthline.com/p'], [2, 'https://pubmed.ncbi.nlm.nih.gov/1/']]);
  assert.equal(g.searchError, null);
});

test('checkSummary and withSources: code writes the sources; a number that was never a page is taken out; the model\'s own source lines are replaced', () => {
  const sources = [{ n: 1, url: 'https://a.example/x', title: 'A' }, { n: 2, url: 'https://www.b.example/y', title: 'B' }];
  assert.equal(checkSummary('Yes [1][2].', sources), null);
  assert.equal(withSources('It is 1.6 g [1] or more [7].', sources), 'It is 1.6 g [1] or more.\n\nSources:\n[1] https://a.example/x');
  assert.equal(withSources('No citation here.', sources), 'No citation here.\n\nSources:\n[1] https://a.example/x\n[2] https://www.b.example/y');
  assert.equal(withSources('See [2].\nSources: [2] https://invented.example', sources), 'See [2].\n\nSources:\n[2] https://www.b.example/y');
  assert.equal(withSources('See [2].', sources, { short: true }), 'See [2].\n\nSources: [2] b.example');
  assert.equal(withSources('Nothing.', []), 'Nothing.');
});

test('his lead-in is taken off the search; the prompt carries the rules', () => {
  assert.equal(searchQuery('Nova, look up creatine side effects for me'), 'creatine side effects');
  assert.equal(searchQuery('can you search for the best sourdough recipe'), 'the best sourdough recipe');
  assert.equal(searchQuery('what is HRV?'), 'what is HRV?');
  const p = summaryPrompt('q', [{ n: 1, url: 'https://a', title: 'A', text: 'x'.repeat(50_000) }]);
  assert.ok(p.length < 16_000, 'one page cannot blow the context');
  assert.match(p, /Two to four sentences/);
});

test('a parseable list of the wrong thing is not results: only pages about the question are kept (Bing\'s junk, 1 Nov)', async () => {
  const { relevantResults, queryWords } = await import('../lib/localResearch.js');
  assert.deepEqual(queryWords('what is the current recommended protein intake per kg for muscle gain'), ['protein', 'intake', 'muscle', 'gain']);
  const junk = [
    { title: 'Electric current - Wikipedia', url: 'https://en.wikipedia.org/wiki/Electric_current', snippet: 'An electric current is a flow of charged particles.' },
    { title: '烘焙 jobs', url: 'https://www.parttime.hk/jobs', snippet: '' },
  ];
  const good = { title: 'How Much Protein Per Day? - Healthline', url: 'https://www.healthline.com/nutrition/protein-per-day', snippet: 'For muscle gain, 1.6 to 2.2 g per kg.' };
  assert.deepEqual(relevantResults([...junk, good], 'what is the current recommended protein intake per kg for muscle gain'), [good]);
  const junkPage = FIXTURE.replace(/protein/gi, 'saxophone').replace(/muscle|gain|strength|meta-analysis|supplementation/gi, 'tune');
  await assert.rejects(webSearch('protein intake for muscle gain', { deps: { withPage: fakeWithPage(junkPage) } }), /none of them about the question/);
  const ok = await webSearch('protein intake for muscle gain', { deps: { withPage: fakeWithPage(FIXTURE) } });
  assert.ok(ok.results.every((r) => /protein/i.test(`${r.title} ${r.snippet} ${r.url}`)));
});
