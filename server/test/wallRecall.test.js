// BRING BACK WHAT I SHOWED YOU (lib/wallRecall.js, 8 Nov 2026): the record
// of every lookup's cards, the words that ask for one back, the match by
// words and days, and the line. The file is a temp folder, never his.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordLookup, readHistory, entryFor, recallWanted, recall, recallLine, agoLine, nothingLine, localDay, KEEP } from '../lib/wallRecall.js';

const TZ = 'Australia/Melbourne';
// 8 Nov 2026 14:00 Melbourne (UTC+11) = 03:00Z
const NOW = Date.parse('2026-11-08T03:00:00Z');
const YESTERDAY = Date.parse('2026-11-07T05:00:00Z');   // 7 Nov 16:00 Melbourne
const lookup = (query, { name = null, pages = 2, clips = 1, depth = 'quick' } = {}) => ({
  query, name, depth, done: true,
  sources: Array.from({ length: pages }, (_, i) => ({ n: i + 1, title: `${query} page ${i + 1}`, url: `https://site${i}.com/a`, host: `site${i}.com`, read: true, lines: [], image: null, snippet: null })),
  clips: Array.from({ length: clips }, (_, i) => ({ id: `v${i}`, title: `${query} clip`, channel: 'c', url: `https://www.youtube.com/watch?v=v${i}`, poster: null, portrait: false })),
});

test('a lookup becomes an entry with the wall\'s own cards and counts; one that put nothing up is no entry', () => {
  const e = entryFor(lookup('"Busy Bar" Flipper Devices', { name: 'the Busy Bar', pages: 6, clips: 3 }), { now: NOW });
  assert.equal(e.query, '"Busy Bar" Flipper Devices');
  assert.equal(e.name, 'the Busy Bar');
  assert.deepEqual(e.counts, { pages: 6, clips: 3 });
  assert.deepEqual(Object.keys(e.cards).slice(0, 2), ['lk:p1', 'lk:p2']);
  assert.equal(e.cards['lk:v1'].kind, 'video');
  assert.equal(entryFor({ query: 'x', sources: [], clips: [] }), null);
});

test('the record: appended, the same query inside fifteen minutes replaced, the last KEEP kept', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wall-recall-')), 'wall-history.json');
  assert.deepEqual(readHistory(file), []);
  recordLookup(lookup('the Busy Bar'), { now: NOW - 60_000, file });
  recordLookup(lookup('the Busy Bar', { pages: 4 }), { now: NOW, file });
  let h = readHistory(file);
  assert.equal(h.length, 1, 'the same lookup a minute later replaced itself');
  assert.equal(h[0].counts.pages, 4);
  recordLookup(lookup('the Meta Quest 3S price'), { now: NOW + 1000, file });
  assert.equal(readHistory(file).length, 2);
  for (let i = 0; i < KEEP + 5; i++) recordLookup(lookup(`thing ${i}`), { now: NOW + 2000 + i * 1000, file });
  h = readHistory(file);
  assert.equal(h.length, KEEP);
  assert.equal(h[h.length - 1].query, `thing ${KEEP + 4}`);
});

test('his words for a recall: a thing with a time or the noun; the wall\'s own "bring up the chart" is not one', () => {
  assert.deepEqual(recallWanted('bring back the Busy Bar lookup from yesterday'), { what: 'Busy Bar', when: 'yesterday' });
  assert.deepEqual(recallWanted('Nova, bring up that VR report you gave me earlier'), { what: 'VR', when: 'earlier' });
  assert.deepEqual(recallWanted('pull up the Flipper Zero references'), { what: 'Flipper Zero', when: null });
  assert.deepEqual(recallWanted('can you bring back what you found on the Meta Quest yesterday?'), { what: 'Meta Quest', when: 'yesterday' });
  assert.deepEqual(recallWanted('show me the Busy Bar pages again'), { what: 'Busy Bar', when: null });
  assert.equal(recallWanted('bring up the chart'), null);
  assert.equal(recallWanted('maximise the video'), null);
  assert.equal(recallWanted('what is the Busy Bar'), null);
});

test('the match: by words, narrowed by the day he names; the newest wins a tie; nothing matches nothing', () => {
  const entries = [
    { ...entryFor(lookup('"Busy Bar" Flipper Devices', { name: 'the Busy Bar', pages: 6, clips: 3 }), { now: YESTERDAY }) },
    { ...entryFor(lookup('the Meta Quest 3S price', { pages: 4 }), { now: NOW - 3_600_000 }) },
    { ...entryFor(lookup('the Busy Bar', { pages: 8, clips: 4 }), { now: NOW - 1_800_000 }) },
  ];
  assert.equal(recall(entries, { what: 'Busy Bar', when: 'yesterday', now: NOW, tz: TZ }).counts.pages, 6);
  assert.equal(recall(entries, { what: 'Busy Bar', when: null, now: NOW, tz: TZ }).counts.pages, 8, 'no day named: the newest');
  assert.equal(recall(entries, { what: 'Busy Bar', when: 'earlier today', now: NOW, tz: TZ }).counts.pages, 8);
  assert.equal(recall(entries, { what: 'meta quest', when: 'today', now: NOW, tz: TZ }).query, 'the Meta Quest 3S price');
  assert.equal(recall(entries, { what: 'meta quest', when: 'yesterday', now: NOW, tz: TZ }), null);
  assert.equal(recall(entries, { what: 'pumpkin', when: null, now: NOW, tz: TZ }), null);
  assert.equal(recall(entries, { what: '', when: 'yesterday', now: NOW, tz: TZ }).counts.pages, 6, 'a day alone brings that day\'s newest');
});

test('the line names the thing, the day and the count; days are his, in Melbourne', () => {
  const e = entryFor(lookup('"Busy Bar" Flipper Devices', { name: 'the Busy Bar', pages: 6, clips: 3 }), { now: YESTERDAY });
  assert.equal(recallLine(e, { now: NOW, tz: TZ }), 'Back up, sir: the Busy Bar lookup from yesterday, 9 references.');
  assert.equal(agoLine(new Date(NOW - 60_000).toISOString(), { now: NOW, tz: TZ }), 'a little earlier');
  assert.equal(agoLine(new Date(NOW - 5 * 3_600_000).toISOString(), { now: NOW, tz: TZ }), 'earlier today');
  assert.equal(agoLine(new Date(NOW - 3 * 86_400_000).toISOString(), { now: NOW, tz: TZ }), '3 days ago');
  assert.equal(localDay(Date.parse('2026-11-07T14:30:00Z'), TZ), '2026-11-08', '01:30 Melbourne on the 8th');
  assert.equal(nothingLine('the Busy Bar'), 'I have nothing on the Busy Bar from before, sir.');
});
