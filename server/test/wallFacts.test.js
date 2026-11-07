// THE WALL AND THE WORDS THAT MOVE IT (7 Nov 2026, design/ROSE-STUDY.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WALL, WALL_MAX, wallColumns, wallColWidth, wallLayout, wallWanted, wallOpenRect, eyebrowOf, railCardWidth } from '../../src/wallFacts.js';
import { glassCommand, matchPanel, glassReceipt } from '../../src/glassVoice.js';
import { MAX_DOCKED } from '../../src/novaMacFacts.js';

test('a wall opens for a lookup or for more panels than the column docks', () => {
  assert.equal(wallWanted({ panels: MAX_DOCKED, lookup: 0 }), false);
  assert.equal(wallWanted({ panels: MAX_DOCKED + 1, lookup: 0 }), true);
  assert.equal(wallWanted({ panels: 1, lookup: 2 }), true);
});

test('the grid: three columns at 1440, two on a small window, four on a wide one', () => {
  assert.equal(wallColumns(1440), 3);
  assert.equal(wallColumns(900), 2);
  assert.equal(wallColumns(1920), 4);
  assert.ok(wallColWidth(1440) >= WALL.minCol && wallColWidth(1440) <= WALL.maxCol);
});

test('panels fill the grid in arrival order, the core\'s column left clear for two rows, each with a seeded tilt', () => {
  const keys = Array.from({ length: 13 }, (_, i) => `p${i}`);
  const lay = wallLayout(keys, { width: 1440 });
  assert.equal(lay.length, 13);
  assert.deepEqual(lay.slice(0, 2).map((l) => l.col), [1, 2]);
  assert.deepEqual(lay.slice(2, 4).map((l) => l.col), [1, 2]);
  assert.equal(lay[4].col, 0, 'the third row takes the core\'s column');
  assert.ok(lay.every((l) => Math.abs(l.tilt) <= WALL.tilt && Math.abs(l.dx) <= WALL.drift));
  assert.ok(lay.some((l) => l.tilt !== 0), 'the scatter is real');
  const again = wallLayout(keys, { width: 1440 });
  assert.deepEqual(again, lay, 'seeded: the same every time');
  const tidy = wallLayout(keys, { width: 1440, tidy: true });
  assert.ok(tidy.every((l) => l.tilt === 0 && l.dx === 0 && l.dy === 0));
  // heights stack a column
  const stacked = wallLayout(['a', 'b', 'c', 'd'], { width: 1440, heights: { a: 300 } });
  assert.equal(stacked[2].y, WALL.top + 300 + WALL.gap, 'the third panel sits under the first in its column');
  assert.equal(wallLayout(Array.from({ length: 30 }, (_, i) => `k${i}`), {}).length, WALL_MAX);
});

test('the open slot is centred inside the wall', () => {
  const r = wallOpenRect(1440, 900);
  assert.ok(r.w <= 880 && r.x >= WALL.left && r.x + r.w <= 1440 - WALL.right);
});

test('the eyebrow reads KIND // SOURCE in Nova\'s words', () => {
  assert.deepEqual(eyebrowOf({ kind: 'page', host: 'www.theverge.com' }), { kind: 'Page', source: 'theverge.com' });
  assert.deepEqual(eyebrowOf({ kind: 'video', channel: 'Reviewer' }), { kind: 'Video', source: 'Reviewer' });
  assert.deepEqual(eyebrowOf({ kind: 'key' }), { kind: 'Key', source: 'Nova’s own' });
  assert.deepEqual(eyebrowOf({ kind: 'figure', host: 'busy.app' }), { kind: 'Figure', source: 'busy.app' });
});

test('the phone rail shows a third of the next card', () => {
  const w = railCardWidth(402);
  assert.ok(w > 240 && w < 300);
  assert.ok(w * 1.3 <= 402 - 28 * 2);
});

const PANELS = [
  { key: 'lk:p1', kind: 'page', title: 'Busy Bar: a $249 focus timer', label: 'THEVERGE.COM', host: 'theverge.com' },
  { key: 'v3', kind: 'bars', title: 'Endpoints by namespace', label: 'ENDPOINTS BY NAMESPACE' },
  { key: 'lk:v1', kind: 'video', title: 'Busy Bar review: a better gadget', label: 'REVIEWER', channel: 'Reviewer' },
  { key: 'v5', kind: 'figure', title: 'Price', label: 'PRICE' },
];

test('his words move the glass: maximise, put away, bring back, tidy, clear, that one', () => {
  assert.deepEqual(glassCommand('maximise the endpoints chart', { panels: PANELS }), { cmd: 'maximise', key: 'v3', title: 'Endpoints by namespace' });
  assert.deepEqual(glassCommand('Nova, can you maximize that for me?', { panels: PANELS, hero: PANELS[0] }), { cmd: 'maximise', key: 'lk:p1', title: 'Busy Bar: a $249 focus timer' });
  assert.deepEqual(glassCommand('put the video away', { panels: PANELS }), { cmd: 'away', key: 'lk:v1', title: 'Busy Bar review: a better gadget' });
  assert.deepEqual(glassCommand('tidy up', {}), { cmd: 'tidy' });
  assert.deepEqual(glassCommand('clear the screen', {}), { cmd: 'clear' });
  assert.deepEqual(glassCommand('put them all away', {}), { cmd: 'clear' });
  assert.deepEqual(glassCommand('clear them, everything other than the price', { panels: PANELS }), { cmd: 'clear-except', key: 'v5', title: 'Price' });
  assert.deepEqual(glassCommand('bring back the review video', { panels: [], history: [PANELS[2]] }), { cmd: 'bring', key: 'lk:v1', title: 'Busy Bar review: a better gadget' });
  assert.deepEqual(glassCommand('put it back', {}), { cmd: 'restore' });
});

test('a miss sends the words on: a question, a name that fits nothing, a long sentence', () => {
  assert.equal(glassCommand('what does the chart say', { panels: PANELS }), null);
  assert.equal(glassCommand('maximise the protein chart', { panels: PANELS }), null);
  assert.equal(glassCommand('open the garage door and then clear the screen and also tell me about my day tomorrow please', {}), null);
  assert.equal(glassCommand('', {}), null);
  // "the chart" is ambiguous when two charts are up
  const two = [...PANELS, { key: 'v9', kind: 'bars', title: 'Sets this week', label: 'SETS' }];
  assert.equal(matchPanel('the chart', two), null);
  assert.equal(matchPanel('the video', PANELS)?.key, 'lk:v1');
});

test('the receipt is a word, in code\'s voice', () => {
  assert.equal(glassReceipt({ cmd: 'tidy' }), 'Tidied.');
  assert.equal(glassReceipt({ cmd: 'maximise', title: 'Price' }), 'Price, larger.');
  assert.equal(glassReceipt({ cmd: 'clear-except', title: 'Price' }), 'Just Price now.');
});
