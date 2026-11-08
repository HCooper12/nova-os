// THE WALL AND THE WORDS THAT MOVE IT (7 Nov 2026, design/ROSE-STUDY.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WALL, WALL_CORE, WALL_MAX, wallCore, wallColumns, wallColWidth, wallLayout, wallWanted, wallOpenRect, eyebrowOf, railCardWidth } from '../../src/wallFacts.js';
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

test('panels fill a masonry in arrival order, the core\'s column starting under the core, each with a seeded tilt', () => {
  const keys = Array.from({ length: 13 }, (_, i) => `p${i}`);
  const lay = wallLayout(keys, { width: 1440 });
  assert.equal(lay.length, 13);
  assert.deepEqual(lay.slice(0, 2).map((l) => l.col), [1, 2]);
  assert.deepEqual(lay.slice(2, 4).map((l) => l.col), [1, 2]);
  assert.equal(lay[4].col, 0, 'the first column is taken once the others are taller');
  assert.ok(lay.filter((l) => l.col === 0).every((l) => l.y >= WALL_CORE.coreRoom), 'nothing under the core and its words');
  assert.equal(wallCore(1440).cx, WALL.left + Math.round(wallColWidth(1440) / 2));
  assert.ok(lay.every((l) => Math.abs(l.tilt) <= WALL.tilt && Math.abs(l.dx) <= WALL.drift));
  assert.ok(lay.some((l) => l.tilt !== 0), 'the scatter is real');
  const again = wallLayout(keys, { width: 1440 });
  assert.deepEqual(again, lay, 'seeded: the same every time');
  const tidy = wallLayout(keys, { width: 1440, tidy: true });
  assert.ok(tidy.every((l) => l.tilt === 0 && l.dx === 0 && l.dy === 0));
  // heights stack a column
  const stacked = wallLayout(['a', 'b', 'c', 'd'], { width: 1440, heights: { a: 300 } });
  assert.equal(stacked[2].col, 2, 'the third panel takes the shorter stack');
  assert.equal(stacked[3].y, WALL.top + 300 + WALL.gap, 'the fourth sits under the tall first, once that is the shortest');
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

test('the words: "show the transcript" opens them, "hide the words" folds them (8 Nov)', () => {
  assert.deepEqual(glassCommand('show me the transcript', {}), { cmd: 'words' });
  assert.deepEqual(glassCommand('subtitles on', {}), { cmd: 'words' });
  assert.deepEqual(glassCommand('hide the words', {}), { cmd: 'nowords' });
  assert.equal(glassReceipt({ cmd: 'words' }), 'Words on.');
});

test('a plain sentence is never a glass command: nothing throws, nothing runs (8 Nov regression)', () => {
  assert.equal(glassCommand("Why don't you look it up? It's called the Busy Bar, by Flipper Devices.", { panels: PANELS, hero: PANELS[0] }), null);
  assert.equal(glassCommand('what did TechCrunch say about it', { panels: PANELS }), null);
});

test('the scatter (8 Nov, his call): sizes by kind, no two cards touching, the corner kept clear, seeded', async () => {
  const { scatterLayout, scatterWidth, CORNER, SCATTER, cornerFrame } = await import('../../src/wallFacts.js');
  assert.ok(scatterWidth('video') > scatterWidth('page') && scatterWidth('page') > scatterWidth('figure'));
  const cards = [['lk:p1', 'page'], ['lk:p2', 'page'], ['lk:v1', 'video'], ['v3', 'figure'], ['v4', 'quote'], ['v5', 'entity'], ['lk:p3', 'page'], ['v6', 'note'], ['v7', 'bars'], ['v8', 'figure']].map(([key, kind]) => ({ key, kind }));
  const lay = scatterLayout(cards, { width: 1440, height: 900 });
  assert.equal(lay.length, 10);
  const touch = (a, b) => !(a.x + a.w + SCATTER.gap <= b.x || b.x + b.w + SCATTER.gap <= a.x || a.y + 190 + SCATTER.gap <= b.y || b.y + 190 + SCATTER.gap <= a.y);
  for (let i = 0; i < lay.length; i++) for (let j = i + 1; j < lay.length; j++) assert.equal(lay[i].overlap === 0 && lay[j].overlap === 0 ? touch(lay[i], lay[j]) : false, false, `${lay[i].key} and ${lay[j].key} touch`);
  const corner = { x: 0, y: 900 - CORNER.h, w: CORNER.w, h: CORNER.h };
  for (const l of lay) assert.ok(l.x >= corner.w + SCATTER.gap || l.y + 190 + SCATTER.gap <= corner.y, `${l.key} sits on the core's corner`);
  assert.ok(lay.every((l) => l.x >= 36 && l.x + l.w <= 1440 - 36 && l.y >= 72));
  assert.deepEqual(scatterLayout(cards, { width: 1440, height: 900 }), lay, 'seeded: the same every time');
  assert.ok(lay.some((l) => l.tilt !== 0));
  const tidy = scatterLayout(cards, { width: 1440, height: 900, tidy: true });
  assert.ok(tidy.every((l) => l.tilt === 0), 'T squares them');
  const f = cornerFrame(1440, 900);
  assert.equal(f.cy, 900 - CORNER.coreCyFromBottom);
  assert.ok(f.barX > f.cx);
});

// BRING BACK WHAT I SHOWED YOU (8 Nov 2026): a past lookup by name goes to
// the server's record; the wall's own bring, for a card that is up or in this
// session's history, is untouched.
test('a past lookup by name is a recall; a card that is up is still the wall\'s own bring', async () => {
  const { recallCommand } = await import('../../src/glassVoice.js');
  assert.deepEqual(recallCommand('bring back the Busy Bar lookup from yesterday'), { cmd: 'recall', raw: 'bring back the Busy Bar lookup from yesterday' });
  assert.deepEqual(recallCommand('Nova, pull up the Flipper Zero references'), { cmd: 'recall', raw: 'Nova, pull up the Flipper Zero references' });
  assert.equal(recallCommand('bring up the chart'), null);
  assert.equal(recallCommand('what is the Busy Bar'), null);
  assert.deepEqual(glassCommand('bring back the pumpkin lookup from yesterday', { panels: PANELS }), { cmd: 'recall', raw: 'bring back the pumpkin lookup from yesterday' });
  // the Busy Bar page IS up: the wall's bring, not the record
  assert.deepEqual(glassCommand('bring up the busy bar focus timer page', { panels: PANELS }).cmd, 'bring');
  assert.equal(glassReceipt({ cmd: 'recall' }), '');
});

test('a recalled brief wears its own eyebrow, never "looked up"', async () => {
  const { eyebrowOf } = await import('../../src/wallFacts.js');
  assert.deepEqual(eyebrowOf({ kind: 'note', lookup: true, brief: true }), { kind: 'Brief', source: 'Researcher' });
  assert.deepEqual(eyebrowOf({ kind: 'note', lookup: true }), { kind: 'Note', source: 'looked up' });
});
