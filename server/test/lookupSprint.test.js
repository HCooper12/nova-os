// LOOK IT UP WHILE WE TALK (7 Nov 2026, design/ROSE-STUDY.md phase 1) and
// the honesty gate on the glass. Every seam injected: no network, no
// yt-dlp, no Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupWanted, lookupQuery, runLookupSprint, lookupBlock, lookupSummary, readSources, firstLines, pickClips, sprintLine } from '../lib/lookupSprint.js';
import { verifyClaim, figureToken, pageHasNumber, pageHasQuote, pageHasFact, CLAIM_KINDS } from '../lib/glassClaims.js';
import { lookupPanels, publishLookup } from '../lib/visualStream.js';
import { resolveVisual, needsFetch } from '../lib/visualResolve.js';
import { normaliseSpec, VISUAL_KINDS } from '../../src/visualBeats.js';

// ---------------------------------------------------------------- deciding
test('his own words for a lookup, including the reel\'s "why don\'t you look it up? It\'s called the Busy Bar"', () => {
  const w = lookupWanted("Well, why don't you look it up? It's called the Busy Bar.");
  assert.ok(w);
  assert.equal(w.query, 'the Busy Bar');
  assert.equal(w.why, 'he asked for a lookup');
  // the qualifier rides along: a name alone found a dictionary (8 Nov)
  const w2 = lookupWanted("Why don't you look it up? It's called the Busy Bar, by Flipper Devices.");
  assert.equal(w2.query, 'the Busy Bar Flipper Devices');
  assert.equal(w2.name, 'the Busy Bar', 'the ack says the thing, not the whole search');
});

test('"look it up" with the thing named the turn before takes that name', () => {
  const w = lookupWanted('Can you look it up for me?', { previous: 'So this thing started off as a Pomodoro timer, Nova, but now developers can write code for it' });
  assert.ok(w);
  assert.match(w.query, /pomodoro|timer|developers/);
  const named = lookupWanted('look it up', { previous: "This is the Busy Bar, it's called the Busy Bar" });
  assert.equal(named.query, 'the Busy Bar');
});

test('a question about the outside world is a lookup without the words "look up"', () => {
  const w = lookupWanted('What is the price of the Meta Quest 3S right now?');
  assert.ok(w);
  assert.equal(w.why, 'a question about the outside world');
});

test('never his own world, never a judgement, never a correction', () => {
  assert.equal(lookupWanted('look up my sets this week'), null);
  assert.equal(lookupWanted('what should I do about my shoulder'), null);
  assert.equal(lookupWanted("no, that's wrong, it was Thursday"), null);
  assert.equal(lookupWanted(''), null);
});

test('the on-screen block the client prepends never becomes the query', () => {
  const w = lookupWanted('[On his screen right now — a card about protein]\n\nlook up the Flipper Zero');
  assert.equal(w.query, 'the Flipper Zero');
  assert.equal(lookupQuery('[a block] look up the Flipper Zero please'), 'the Flipper Zero');
});

// ---------------------------------------------------------------- the sprint
const PAGE_TEXT = 'The Busy Bar is a $249 focus timer built by Flipper Devices, the Flipper Zero team founded in 2020. The front is a 72 by 16 RGB LED matrix. Its HTTP API documents 81 endpoints across the OpenAPI 3.1 reference.';
const deps = (over = {}) => ({
  search: async () => ({ host: 'api.search.brave.com', results: [
    { title: 'Busy Bar: a $249 focus timer', url: 'https://www.theverge.com/busy-bar', snippet: 'A focus timer that talks to your apps.' },
    { title: 'Busy Bar – YouTube', url: 'https://www.youtube.com/watch?v=abc', snippet: '' },
    { title: 'Busy Bar docs', url: 'https://busy.app/docs', snippet: 'Developer documentation.' },
    { title: 'A fourth page', url: 'https://example.com/four', snippet: '' },
  ] }),
  read: async (url) => (url.includes('theverge') ? { ok: true, host: 'theverge.com', title: 'Busy Bar: a $249 focus timer that is also a dev kit', text: PAGE_TEXT, image: 'https://www.theverge.com/og.jpg' }
    : url.includes('busy.app') ? { ok: true, host: 'busy.app', title: 'Docs', text: 'The Busy Bar HTTP API lists 81 endpoints. Wi-Fi 6, Bluetooth, USB-C.' }
      : { ok: false, host: 'example.com', reason: 'the site refused the read (403)' }),
  clips: async () => [{ id: 'vid1', title: 'Busy Bar review: a better gadget', channel: 'Reviewer', durationS: 400, url: 'https://www.youtube.com/watch?v=vid1', poster: null, portrait: false }],
  picture: async (u) => `/api/briefing/media/${u.includes('ytimg') ? 'poster1' : 'og1'}.jpg`,
  ...over,
});

test('the sprint: the pages and clips land as they come, the video watch page is never read as a page', async () => {
  const seen = [];
  const lk = await runLookupSprint('the Busy Bar', { deps: deps(), onSearched: (l) => seen.push(`searched:${l.sources.length}`), onPage: (l, n) => seen.push(`page:${n}`), onClips: (l) => seen.push(`clips:${l.clips.length}`) });
  assert.equal(lk.done, true);
  assert.equal(lk.sources.length, 3);
  assert.deepEqual(lk.sources.map((s) => s.host), ['theverge.com', 'busy.app', 'example.com']);
  assert.equal(seen[0], 'searched:3');
  assert.ok(seen.includes('page:1') && seen.includes('clips:1'));
  const read = readSources(lk);
  assert.equal(read.length, 2);
  assert.equal(read[0].title, 'Busy Bar: a $249 focus timer that is also a dev kit');
  assert.equal(read[0].image, '/api/briefing/media/og1.jpg');
  assert.ok(read[0].lines.length >= 1 && read[0].lines[0].startsWith('The Busy Bar is a $249'));
  assert.equal(lk.misses.length, 1);
  assert.equal(lk.clips[0].poster, '/api/briefing/media/poster1.jpg');
  assert.deepEqual(lk.hostsRead.slice(0, 1), ['api.search.brave.com']);
});

test('the budget: a page that is slow lands on the glass later, never in the prompt', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const lk = await runLookupSprint('x', { budgetMs: 60, deps: deps({ read: async (url) => (url.includes('theverge') ? slow.then(() => ({ ok: true, host: 'theverge.com', title: 'late', text: PAGE_TEXT })) : url.includes('busy.app') ? { ok: true, host: 'busy.app', title: 'Docs', text: 'quick page with enough words to count as read.' } : { ok: false, host: 'example.com', reason: 'refused' }), clips: async () => [] }) });
  assert.equal(lk.done, true);
  assert.equal(readSources(lk).map((s) => s.host).join(','), 'busy.app');
  release();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(lk.sources[0].read, true);   // the straggler still filled its card
});

test('a search that fails is an honest line in the prompt, not a throw', async () => {
  const lk = await runLookupSprint('x', { deps: deps({ search: async () => { throw new Error('api.search.brave.com asked for a human check'); }, clips: async () => [] }) });
  assert.equal(lk.sources.length, 0);
  assert.match(lk.searchError, /human check/);
  assert.match(lookupBlock(lk), /the search failed: api.search.brave.com asked for a human check/);
});

test('the block the model reads: numbered pages read in time, the clips, and the rule', async () => {
  const lk = await runLookupSprint('the Busy Bar', { deps: deps() });
  const b = lookupBlock(lk);
  assert.match(b, /LOOKED UP JUST NOW by Nova's browser, for "the Busy Bar"/);
  assert.match(b, /\[1\] Busy Bar: a \$249 focus timer that is also a dev kit\nhttps:\/\/www\.theverge\.com\/busy-bar/);
  assert.match(b, /\[2\] Docs/);
  assert.doesNotMatch(b, /example\.com/);
  assert.match(b, /CLIPS: \(1\) Busy Bar review: a better gadget — Reviewer/);
  assert.match(b, /code checks it against that page/);
  const sum = lookupSummary(lk);
  assert.deepEqual(sum.pages.map((p) => p.read), [true, true, false]);
  assert.equal(JSON.stringify(sum).includes(PAGE_TEXT.slice(0, 30)), false, 'the client never gets page bodies');
});

test('the lookup\'s own panels: a page card per source and a video card per clip, built from the search\'s strings', async () => {
  const lk = await runLookupSprint('the Busy Bar', { deps: deps() });
  const panels = lookupPanels(lk);
  assert.deepEqual(Object.keys(panels), ['lk:p1', 'lk:p2', 'lk:p3', 'lk:v1']);
  assert.equal(panels['lk:p1'].kind, 'page');
  assert.equal(panels['lk:p1'].label, 'THEVERGE.COM');
  assert.equal(panels['lk:p1'].image, '/api/briefing/media/og1.jpg');
  assert.equal(panels['lk:p3'].read, false);
  assert.equal(panels['lk:v1'].kind, 'video');
  assert.equal(panels['lk:v1'].videoId, 'vid1');
  const job = { visuals: { v0_x: { kind: 'key' } } };
  publishLookup(job, lk);
  assert.equal(job.lookup, lk);
  assert.ok(job.visuals.v0_x && job.visuals['lk:p1']);
});

test('sprintLine, firstLines and pickClips are plain', () => {
  assert.equal(sprintLine({ query: 'the Busy Bar', sources: [] }), null, 'the ack already said what is being looked up');
  assert.equal(sprintLine({ query: 'the Busy Bar Flipper Devices', name: 'the Busy Bar', sources: [1, 2, 3] }), 'Reading 3 pages on the Busy Bar.');
  assert.deepEqual(firstLines('Short. This sentence is long enough to be a first line of a page card. And so is this one, which is also long enough.'), ['This sentence is long enough to be a first line of a page card.', 'And so is this one, which is also long enough.']);
  const rows = [{ id: 'a', channel: 'c', durationS: 20, title: 'Busy Bar short' }, { id: 'b', channel: 'c', durationS: 300, title: 'Busy Bar review' }, { id: 'c', channel: 'c', durationS: 500, title: 'unrelated' }];
  assert.deepEqual(pickClips(rows, 'busy bar').map((c) => c.id), ['b', 'c']);
});

// ---------------------------------------------------------------- the gate
const LOOKUP = { query: 'the Busy Bar', sources: [
  { n: 1, title: 'Busy Bar: a $249 focus timer', url: 'https://www.theverge.com/busy-bar', host: 'theverge.com', text: PAGE_TEXT, read: true },
  { n: 2, title: 'Docs', url: 'https://busy.app/docs', host: 'busy.app', text: 'Wi-Fi 6 and Bluetooth. 1,000 units shipped.', read: true },
], clips: [{ id: 'vid1', title: 'Review', channel: 'R', url: 'https://www.youtube.com/watch?v=vid1', poster: '/api/briefing/media/p.jpg' }] };

test('a figure is drawn only when its number is printed on the page it cites', () => {
  assert.equal(figureToken('≈20m'), '20');
  assert.equal(figureToken('$199 USD'), '199');
  assert.equal(figureToken('63.77%'), '63.77');
  assert.equal(pageHasNumber('Its HTTP API documents 81 endpoints', '81'), true);
  assert.equal(pageHasNumber('in 1810 there were', '81'), false, 'a whole token, never a substring');
  assert.equal(pageHasNumber('1,000 units', '1000'), true);
  const ok = verifyClaim(normaliseSpec({ kind: 'figure', label: 'ENDPOINTS', value: '81', unit: 'endpoints', source: 1 }), LOOKUP);
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.host, 'theverge.com');
  const bad = verifyClaim(normaliseSpec({ kind: 'figure', label: 'ENDPOINTS', value: '95', unit: 'endpoints', source: 1 }), LOOKUP);
  assert.equal(bad.ok, false);
  assert.match(bad.why, /theverge\.com does not print 95/);
  const none = verifyClaim(normaliseSpec({ kind: 'figure', label: 'X', value: '81' }), LOOKUP);
  assert.equal(none.ok, false);
  assert.match(none.why, /no source number/);
});

test('a quote must be the page\'s own words; a paraphrase is dropped', () => {
  assert.equal(pageHasQuote(PAGE_TEXT, 'a 72 by 16 RGB LED matrix'), true);
  assert.equal(pageHasQuote(PAGE_TEXT, 'the front has a big LED display panel'), false);
  const q = verifyClaim(normaliseSpec({ kind: 'quote', label: 'THE VERGE', text: 'The front is a 72 by 16 RGB LED matrix.', source: 1 }), LOOKUP);
  assert.equal(q.ok, true);
  assert.equal(verifyClaim(normaliseSpec({ kind: 'quote', text: 'it is a lovely gadget indeed', source: 1 }), LOOKUP).ok, false);
});

test('an entity keeps the facts its page carries and drops the rest; none left, no card', () => {
  assert.equal(pageHasFact(PAGE_TEXT, '2020'), true);
  assert.equal(pageHasFact(PAGE_TEXT, 'Lisbon, Portugal'), false);
  const e = verifyClaim(normaliseSpec({ kind: 'entity', name: 'Flipper Devices', source: 1, facts: [['Founded', '2020'], ['Based', 'Lisbon'], ['Known for', 'Flipper Zero']] }), LOOKUP);
  assert.equal(e.ok, true);
  assert.deepEqual(e.spec.facts.map((f) => f.k), ['Founded', 'Known for']);
  assert.equal(e.spec.droppedFacts, 1);
  const gone = verifyClaim(normaliseSpec({ kind: 'entity', name: 'Flipper Devices', source: 2, facts: [['Based', 'Lisbon']] }), LOOKUP);
  assert.equal(gone.ok, false);
  const wrongName = verifyClaim(normaliseSpec({ kind: 'entity', name: 'Acme Corp', source: 1, facts: [['Founded', '2020']] }), LOOKUP);
  assert.equal(wrongName.ok, false);
});

test('page and video lines light the cards code already put up, by number', () => {
  const p = verifyClaim(normaliseSpec({ kind: 'page', source: 2 }), LOOKUP);
  assert.equal(p.ok, true);
  assert.equal(p.spec.host, 'busy.app');
  assert.equal(verifyClaim(normaliseSpec({ kind: 'page', source: 9 }), LOOKUP).ok, false);
  const v = verifyClaim(normaliseSpec({ kind: 'video', clip: 1 }), LOOKUP);
  assert.equal(v.ok, true);
  assert.equal(v.spec.videoId, 'vid1');
});

test('the resolver runs the gate: a failed claim is `dropped` with its reason and never ready', async () => {
  for (const k of CLAIM_KINDS) assert.equal(needsFetch({ kind: k }), true);
  const logs = [];
  const ok = await resolveVisual(normaliseSpec({ kind: 'figure', label: 'ENDPOINTS', value: '81', source: 1 }), { lookup: () => LOOKUP, log: (m) => logs.push(m) });
  assert.equal(ok.state, 'ready');
  const bad = await resolveVisual(normaliseSpec({ kind: 'figure', label: 'ENDPOINTS', value: '95', source: 1 }), { lookup: () => LOOKUP, log: (m) => logs.push(m) });
  assert.equal(bad.state, 'dropped');
  assert.match(bad.reason, /does not print 95/);
  assert.equal(logs.length, 1);
  // no lookup this turn: every claim is dropped, with the reason
  const none = await resolveVisual(normaliseSpec({ kind: 'quote', text: 'some words here now', source: 1 }), { lookup: () => null, log: () => {} });
  assert.equal(none.state, 'dropped');
});

test('a note is Nova\'s own words, up to three lines, and needs nothing fetched', () => {
  const n = normaliseSpec({ kind: 'note', label: 'Consumer product or dev kit?', lines: ['It is a finished product.', 'Returns and a warranty.', 'Filings.', 'a fourth'] });
  assert.equal(n.lines.length, 3);
  assert.equal(n.caption, 'It is a finished product.');
  assert.equal(needsFetch(n), false);
  assert.ok(VISUAL_KINDS.includes('note'));
});

test('a full query that misses is searched again by its first two words, and the miss never rests the engine', async () => {
  const { shorterQuery } = await import('../lib/lookupSprint.js');
  assert.equal(shorterQuery('the Busy Bar Flipper Devices'), 'Busy Bar');
  assert.equal(shorterQuery('Busy Bar'), null);
  const asked = [];
  const lk = await runLookupSprint('the Busy Bar Flipper Devices', { deps: deps({
    search: async (q) => { asked.push(q); if (asked.length === 1) throw new Error('www.bing.com showed 10 results, none of them about the question'); return { host: 'www.bing.com', results: [{ title: 'Busy Bar', url: 'https://busy.app/', snippet: '' }] }; },
    read: async () => ({ ok: true, host: 'busy.app', title: 'Busy Bar', text: 'A focus timer with an open HTTP API and many endpoints documented.' }),
    clips: async () => [],
  }) });
  assert.deepEqual(asked, ['the Busy Bar Flipper Devices', 'Busy Bar']);
  assert.equal(lk.searchedAs, 'Busy Bar');
  assert.equal(readSources(lk).length, 1);
});
