import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-harvest-'));
process.env.NOVA_DATA_DIR = dir;

let H;
let L;
before(async () => { H = await import('../lib/lineHarvest.js'); L = await import('../lib/lineWidget.js'); });

// caption style: each line repeats the tail of the one before
const CAPTIONS = [
  '[00:01] Welcome back. Do more hard things',
  '[00:03] Do more hard things every day is a great mantra but it',
  '[00:06] every day is a great mantra but it should be less about ice baths and more',
  '[00:09] should be less about ice baths and more about making that decision you have been',
  '[00:12] about making that decision you have been putting off for three months.',
  '[00:15] &gt;&gt; Yeah. Um, I think the thing that matters most is that',
  '[00:18] the thing that matters most is that you keep showing up when nobody is watching you at all.',
  ...Array.from({ length: 24 }, (_, i) => `[01:${String(i).padStart(2, '0')}] filler talk number ${i} goes here`),
].join('\n');
const raw = `Verbatim video transcript fetched by Nova's Watcher, received 2026-08-11.\nSource URL: https://x\n\n---\n\n${CAPTIONS}\n`;

test('tokenize: repeated caption text counts once, turns are marked, brackets dropped', () => {
  const t = H.tokenize(raw.replace('Welcome back.', 'Welcome back. [laughter]'));
  const text = t.map((x) => x.raw).join(' ');
  assert.equal((text.match(/ice baths/g) || []).length, 1);
  assert.ok(!text.includes('laughter'));
  assert.ok(t.some((x) => x.turn));
  assert.equal(t.find((x) => x.raw === 'mantra').t, 3);
});

test('acceptLine: a line spanning caption rows is found and stored in the SOURCE words', () => {
  const toks = H.tokenize(raw);
  const got = H.acceptLine('do more hard things every day is a great mantra, but it should be less about ice baths', toks);
  assert.equal(got.quote, 'Do more hard things every day is a great mantra but it should be less about ice baths');
  assert.equal(got.at, '0:01');
});

test('acceptLine: refuses what the source does not say, ellipses, wrong length, and a span across two speakers', () => {
  const toks = H.tokenize(raw);
  assert.equal(H.acceptLine('Do more easy things every day is a great mantra but it should be less about ice baths', toks), null);
  assert.equal(H.acceptLine('Do more hard things every day ... less about ice baths and more about making that decision', toks), null);
  assert.equal(H.acceptLine('Do more hard things every day', toks), null); // under 8 words
  // across the speaker change
  assert.equal(H.acceptLine('making that decision you have been putting off for three months. Yeah. I think the thing that matters', toks), null);
  assert.equal(H.acceptLine('', toks), null);
});

test('acceptLine: a filler at the edge is not part of the line', () => {
  const toks = H.tokenize(raw);
  const got = H.acceptLine('Um, I think the thing that matters most is that you keep showing up when nobody is watching', toks);
  assert.ok(got.quote.startsWith('I think the thing'));
});

test('chunkTokens: whole tokens, nothing lost, small chunks split', () => {
  const toks = H.tokenize(raw);
  const chunks = H.chunkTokens(toks, 300);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.reduce((n, c) => n + c.tokens.length, 0), toks.length);
});

const sourcePage = (over = {}) => ({ id: 'Wiki/Sources/Ep', title: 'Ep (Show)', type: 'source', rawLink: 'Raw/Ep (Transcript)', raw: '**Source:** [Big Ideas - Alex Hormozi — Chris Williamson — 4:08:55](https://y)', ...over });
const rawPage = (text) => ({ id: 'Raw/Ep (Transcript)', title: 'Ep (Transcript)', type: 'raw', raw: text });
const ctxOf = (pages) => ({
  byTitle: new Map(pages.map((p) => [p.title.toLowerCase(), p])),
  people: new Map([['alex hormozi', 'Alex Hormozi'], ['chris williamson', 'Chris Williamson'], ['steven bartlett', 'Steven Bartlett']]),
});

test('discoverSources: named show, guest from the title, host named; paraphrased notes skipped', () => {
  const pages = [sourcePage(), rawPage(raw)];
  const found = H.discoverSources(pages, ctxOf(pages), L.SHOWS);
  assert.equal(found.length, 1);
  assert.equal(found[0].byLong, 'Heard on Modern Wisdom, Alex Hormozi and Chris Williamson');
  assert.equal(found[0].byShort, 'Heard on Modern Wisdom');
  assert.equal(found[0].idea, 'Ep (Show)');
  assert.equal(found[0].pageId, 'Wiki/Sources/Ep');
  const para = [sourcePage(), rawPage(raw.replace('Verbatim video transcript', 'This is a paraphrased notes capture, not a verbatim transcript'))];
  assert.equal(H.discoverSources(para, ctxOf(para), L.SHOWS).length, 0);
  const para2 = [sourcePage(), rawPage(`Verbatim video transcript fetched by Nova's Watcher\nThis is a paraphrased notes capture, not a verbatim transcript\n${CAPTIONS}`)];
  assert.equal(H.discoverSources(para2, ctxOf(para2), L.SHOWS).length, 0);
});

test('discoverSources: guest unreadable means the show only; unnamed shows are not harvested', () => {
  const noGuest = [sourcePage({ raw: '**Source:** [Big Ideas — Chris Williamson — 4:08:55](https://y)' }), rawPage(raw)];
  const f = H.discoverSources(noGuest, ctxOf(noGuest), L.SHOWS);
  assert.equal(f[0].byLong, 'Heard on Modern Wisdom');
  const other = [sourcePage({ raw: '**Source:** [Big Ideas — Some Other Channel — 4:08:55](https://y)' }), rawPage(raw)];
  assert.equal(H.discoverSources(other, ctxOf(other), L.SHOWS).length, 0);
});

test('discoverSources: the show from the Raw note title line, and a book is its author’s', () => {
  const titled = [sourcePage({ raw: '# Ep\nno source line here' }), rawPage(raw.replace('---', 'Big Ideas | Alex Hormozi — The Diary Of A CEO (2:12:19)\n---'))];
  const f = H.discoverSources(titled, ctxOf(titled), L.SHOWS);
  assert.equal(f[0].byLong, 'Heard on The Diary Of A CEO, Alex Hormozi and Steven Bartlett');
  const bookRaw = { id: 'Raw/Book', title: 'Book', type: 'raw', raw: `Text/notes of a book supplied by Hayden\n\n---\n\n${'A habit is a routine you repeat. '.repeat(50)}` };
  const book = { id: 'Wiki/Sources/Atomic Habits (Clear)', title: 'Atomic Habits', type: 'book', rawLink: 'Raw/Book', raw: '# Atomic Habits (James Clear, 2018)\n' };
  const b = H.discoverSources([book, bookRaw], ctxOf([book, bookRaw]), L.SHOWS);
  assert.equal(b.length, 1);
  assert.deepEqual([b[0].who, b[0].byLong, b[0].idea], ['James Clear', ', Atomic Habits', 'Atomic Habits']);
  const other = { ...book, raw: '# Some Book (Someone Else, 2018)\n', title: 'Some Book' };
  assert.equal(H.discoverSources([other, bookRaw], ctxOf([other, bookRaw]), L.SHOWS).length, 0);
});

test('harvestSweep: asks each chunk once, stores the source words, then never asks again', async () => {
  const pages = [sourcePage(), rawPage(raw)];
  const ctx = ctxOf(pages);
  let calls = 0;
  const runner = async () => {
    calls += 1;
    return '- do more hard things every day is a great mantra but it should be less about ice baths\n- something the model invented that nobody said in this transcript at all today\n-';
  };
  await H.harvestSweep({ pages, ctx, shows: L.SHOWS, runner });
  const asked = calls;
  assert.ok(asked >= 1);
  const store = await H.readHarvest();
  const pool = H.harvestPool(store);
  assert.ok(pool.length >= 1);
  assert.equal(pool[0].quote, 'Do more hard things every day is a great mantra but it should be less about ice baths');
  assert.equal(pool[0].id, 'Wiki/Sources/Ep');
  assert.match(pool[0].key, /^h:/);
  assert.equal(pool[0].idea, 'Ep (Show)');
  assert.equal(pool[0].sent, null);
  assert.ok(!pool.some((p) => /invented/.test(p.quote)));
  await H.harvestSweep({ pages, ctx, shows: L.SHOWS, runner });
  assert.equal(calls, asked);
});

test('harvestSweep: a runner that throws ends the pass and stores nothing for that chunk', async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-harvest-b-'));
  const prev = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = d2;
  try {
    const pages = [sourcePage(), rawPage(raw)];
    await H.harvestSweep({ pages, ctx: ctxOf(pages), shows: L.SHOWS, runner: async () => { throw new Error('offline'); } });
    const store = await H.readHarvest();
    assert.deepEqual(H.harvestPool(store), []);
  } finally { process.env.NOVA_DATA_DIR = prev; }
});

test('one line per wording inside the pool and the day pick leans on voices', () => {
  const item = (key, voice) => ({ id: `p-${key}`, key, quote: `Line ${key} is long enough to be read out loud on a card.`, podcast: 'S', byLong: 'x', byShort: 'x', at: null, idea: 'i', sent: null, voice });
  const pool = [...Array.from({ length: 6 }, (_, i) => item(`o${i}`, false)), ...Array.from({ length: 6 }, (_, i) => item(`v${i}`, true))];
  let voices = 0;
  let days = [];
  for (let d = 1; d <= 6; d += 1) {
    const r = L.composeLine({ now: new Date(2026, 10, d, 12, 0), pool, days });
    days = r.days;
    if (L.prefersVoices(`2026-11-${String(d).padStart(2, '0')}`)) assert.match(r.key, /^v/);
    if (/^v/.test(r.key)) voices += 1;
  }
  assert.ok(voices >= 4);
  // no voices: the whole pool is used
  const plain = L.composeLine({ now: new Date(2026, 10, 7, 12, 0), pool: pool.filter((p) => !p.voice), days: [] });
  assert.match(plain.key, /^o/);
});

test('a harvested line is served with the page id the app opens, not its key', () => {
  const p = { id: 'Wiki/Sources/Ep', key: 'h:abc', quote: 'Do more hard things every day is a great mantra', podcast: 'Modern Wisdom', byLong: 'Heard on Modern Wisdom', byShort: 'Heard on Modern Wisdom', at: '0:03', idea: 'Ep', sent: null, voice: true };
  const r = L.composeLine({ now: new Date(2026, 10, 4, 12, 0), pool: [p], days: [] });
  assert.equal(r.payload.line.id, 'Wiki/Sources/Ep');
  assert.equal(r.days[0].id, 'h:abc');
  assert.equal(r.key, 'h:abc');
});

test('the stands-alone check is kept per key, so two lines of one page are judged apart', async () => {
  const a = { id: 'pg', key: 'h:1', quote: 'First line of the page, whole thought here.' };
  const b = { id: 'pg', key: 'h:2', quote: 'Second line of the page, a piece of' };
  await L.judgePool([a, b], { runner: async (q) => (q.startsWith('First') ? 'YES' : 'NO') });
  const kept = L.standing([a, b], await L.readStands());
  assert.deepEqual(kept.map((p) => p.key), ['h:1']);
});

test('garbled: a letter-spaced or ligature line from a badly extracted book is refused', () => {
  assert.equal(H.garbled('e purpose of setting go als is to win the g a me'), true);
  assert.equal(H.garbled('Desire is the diﬀerence between where you are now and where you want to be'), true);
  assert.equal(H.garbled('Missing once is a n a ccident. Missing twice is the st art of a new h b a it.'), true);
  assert.equal(H.garbled('You do not rise to the level of your goals. You fall to the level of your systems.'), false);
  assert.equal(H.garbled('I think a habit is a vote for the type of person you wish to become, a small one.'), false);
  const toks = H.tokenize(`Text/notes of a book\n\n---\n\nThe purpose of setting go als is to win the g a me every single day.`);
  assert.equal(H.acceptLine('The purpose of setting go als is to win the g a me every single day.', toks), null);
});
