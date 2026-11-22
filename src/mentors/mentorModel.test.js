// His page as data (src/mentors/mentorModel.js) and his colours by rule
// (src/mentors/palette.js), pinned in plain node:
//
//   node --test src/mentors/mentorModel.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { pageModel, cumulative, filterCounts, advanced, dateLabel, levels } from './mentorModel.js';
import { paletteFor, rgb2oklch, oklch2hex, hex2rgb } from './palette.js';

const person = { id: 'p', name: 'Jefferson Fisher', colour: '#fb6b2f', status: 'following' };
const counts = (o) => ({ total: 0, found: 0, transcript: 0, read: 0, woven: 0, working: 0, held: { refused: 0, failed: 0, skipped: 0, duplicate: 0, held: 0 }, ...o });
// six videos, newest first: 2 woven, 1 read, 1 transcript, 1 repeat held, 1 refused
const CAT = [['v1', 600, 'w'], ['v2', 600, 'w'], ['v3', 600, 'r'], ['v4', 600, 't'], ['v5', 600, 'd'], ['v6', 600, 'x']];
const C = counts({ total: 6, found: 1, transcript: 2, read: 1, woven: 2, held: { refused: 1, failed: 0, skipped: 0, duplicate: 1, held: 0 } });
const WALL = { order: CAT.map(([id]) => [id, `Title ${id}`, 600, '2026-11-20T15:00:00.000Z', id === 'v6']) };
const detail = (over = {}) => ({ person, counts: C, catalogue: CAT, latest: [{ id: 'v1', title: 'Title v1', durationSec: 600, publishedAt: '2026-11-20T15:00:00.000Z' }], doing: 'idle', ...over });
const queue = (doing, extra = {}) => ({ paused: false, people: [{ id: 'p', doing, item: null, waiting: null, ...extra }] });

test('the four counts are cumulative: found is everything, each later stage counts what got at least that far', () => {
  assert.deepEqual(cumulative(C), [6, 5, 3, 2]);
});

test('paused (the whole queue): the token hangs from the stage that would move next, the numeral is that stage', () => {
  const m = pageModel(detail({ doing: 'paused' }), { ...queue('paused'), paused: true }, WALL);
  assert.equal(m.k, 'paused');
  // transcripts are done but for the refusal; one transcript is waiting to be read (the repeat is held)
  assert.deepEqual(m.tok, ['pause', 'Paused', 2]);
  assert.deepEqual(m.m, ['done', 'dim', 'pause', 'dim']);
  assert.equal(m.col, 2);
  assert.equal(m.act.id, 'v4', 'the newest video waiting to be read');
  assert.equal(m.act.everyone, true);
  assert.equal(m.everyone, true);
});

test('reading now: the working video is lifted on the wall and carries the token', () => {
  const cat = CAT.map((r) => (r[0] === 'v4' ? ['v4', 600, 'k'] : r));
  const m = pageModel(detail({ catalogue: cat }), queue('reading', { item: { key: 'yt:v4', title: 'Title v4' } }), WALL);
  assert.equal(m.k, 'reading');
  assert.deepEqual(m.tok, ['work', 'Reading', 2]);
  assert.equal(m.cells.find((c) => c.id === 'v4').cls, 'r');
  assert.equal(m.act.kind, 'lift');
  assert.deepEqual(m.stageOf('v4'), ['work', 'Reading']);
  assert.equal(m.cells.find((c) => c.id === 'v4').level, 1, 'a video being read has its transcript');
});

test('waiting on his Claude usage: "Resumes" and the reset time, "Claude usage" on the video', () => {
  const m = pageModel(detail(), queue('waiting', { waiting: { on: 'usage', until: '2026-11-22T04:00:00.000Z' } }), WALL);
  assert.equal(m.k, 'waiting');
  assert.equal(m.tok[0], 'wait');
  assert.match(m.tok[1], /^Resumes \d{1,2}:\d{2} (am|pm)$/);
  assert.equal(m.act.word, 'Claude usage');
});

test('a failed video: need token with the count, Try again names the source key', () => {
  const c = counts({ ...C, held: { ...C.held, refused: 0, failed: 1 } });
  const m = pageModel(detail({ counts: c }), queue('idle'), WALL);
  assert.equal(m.k, 'failed');
  assert.deepEqual(m.tok.slice(0, 2), ['need', '1 failed']);
  assert.equal(m.act.key, 'yt:v6');
  assert.equal(m.cells.find((c2) => c2.id === 'v6').cls, 'f');
});

test('all caught up: no token, the numeral is the woven count', () => {
  const cat = CAT.map(([id, s]) => [id, s, 'w']);
  const m = pageModel(detail({ catalogue: cat, counts: counts({ total: 6, woven: 6 }) }), queue('done'), WALL);
  assert.equal(m.k, 'caught');
  assert.equal(m.tok, null);
  assert.equal(m.col, 3);
  assert.deepEqual(m.m, ['done', 'done', 'done', 'done']);
});

test('a new video after everything was done: "1 new", its cell is the new one', () => {
  const cat = [['v0', 60, 'f'], ...CAT.map(([id, s]) => [id, s, 'w'])];
  const m = pageModel(detail({ catalogue: cat, counts: counts({ total: 7, found: 1, woven: 6 }) }), queue('idle'), WALL);
  assert.equal(m.k, 'fresh');
  assert.deepEqual(m.tok, ['dim', '1 new', 1]);
  assert.equal(m.cells[0].cls, 'nw');
  assert.deepEqual(m.m, ['done', 'dim', 'dim', 'dim']);
});

test('just followed: finding, nothing counted yet', () => {
  const m = pageModel(detail({ catalogue: [], counts: counts({}), latest: [] }), queue('finding'), null);
  assert.equal(m.k, 'finding');
  assert.deepEqual(m.tok, ['work', 'Finding', 0]);
});

test('the sheet filters count what got at least that far; a held repeat counts as transcribed', () => {
  const m = pageModel(detail(), queue('idle'), WALL);
  assert.deepEqual(filterCounts(m), [6, 5, 3, 2]);
  assert.deepEqual([...levels(CAT).values()], [3, 3, 2, 1, 1, 0]);
});

test('a frame that moved forward is named, so it can be acted out', () => {
  const a = pageModel(detail(), queue('idle'), WALL);
  const b = pageModel(detail({ catalogue: CAT.map((r) => (r[0] === 'v3' ? ['v3', 600, 'w'] : r)) }), queue('idle'), WALL);
  assert.deepEqual(advanced(a, b), ['v3']);
});

test('dates: the channel date, month and year only when approximate', () => {
  assert.equal(dateLabel('2026-11-20T15:00:23.000Z', false), '20 Nov 2026');
  assert.equal(dateLabel('2025-06-03T00:00:00.000Z', true), 'Jun 2025');
  assert.equal(dateLabel(null), '');
});

test('palette by rule: the mockup\'s values for Fisher, and a second person needs no new code', () => {
  const f = paletteFor('#fb6b2f');
  assert.equal(f.soft, '#d37e5f');
  assert.equal(f.deep, '#96390f');
  assert.equal(f.now.c, '#fb6b2f');
  assert.equal(f.dark.c, f.ink);
  assert.equal(f.now.on, f.ink, 'ink reads better than paper on his orange');
  const c = paletteFor('#3ab2c1');
  assert.equal(c.soft, '#67a5ae');
  assert.equal(c.deep, '#066771');
  assert.equal(paletteFor('nonsense').c0, '#8a8f99');
  const [L, C, H] = rgb2oklch(hex2rgb('#0ccf90'));
  assert.equal(oklch2hex(L, C, H), '#0ccf90');
});
