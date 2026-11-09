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

// THE LIVING STAGE (10 Nov 2026): the placement rule of approved mockup 114.
test('the stage: panels land nearest the core, touch nothing, keep off the core and the caption, and balance the sides', async () => {
  const { stageLayout, stageKeep, STAGE } = await import('../../src/wallFacts.js');
  const core = [720, 340];
  const panels = [0, 0, 1, 1, 2, 3].map((sent, i) => ({ key: `p${i}`, w: [300, 260, 320, 240, 280, 300][i], h: [180, 150, 200, 140, 170, 160][i], sent }));
  const lay = stageLayout(panels, { width: 1440, height: 900, core });
  assert.equal(lay.length, 6);
  assert.ok(lay.every((l) => !l.folded && !l.forced), 'six panels fit a 1440 stage with none folded');
  const rect = (l) => [l.x, l.y, l.x + l.w, l.y + l.h];
  const hit = (a, b, g) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
  for (let i = 0; i < lay.length; i++) for (let j = i + 1; j < lay.length; j++) assert.equal(hit(rect(lay[i]), rect(lay[j]), STAGE.gap), false, `${lay[i].key} and ${lay[j].key} touch`);
  for (const l of lay) for (const k of stageKeep(core)) assert.equal(hit(rect(l), k, 0), false, `${l.key} sits on the core or the caption`);
  assert.ok(lay.every((l) => l.x >= STAGE.left && l.x + l.w <= 1440 - STAGE.right && l.y >= STAGE.top && l.y + l.h <= 900 - STAGE.bottomGap));
  const left = lay.filter((l) => l.side === 'left').length;
  assert.ok(Math.abs(left - (lay.length - left)) <= 2, `sides out of balance: ${left} left of ${lay.length}`);
  // the first panel is nearer the core than the last: nearest free spot first
  const dist = (l) => Math.hypot(l.x + l.w / 2 - core[0], l.y + l.h / 2 - core[1]);
  assert.ok(dist(lay[0]) < dist(lay[5]));
  assert.deepEqual(stageLayout(panels, { width: 1440, height: 900, core }), lay, 'seeded: the same every time');
});

test('the stage has no cap: when room runs out the oldest panel of an EARLIER sentence folds, never one of the sentence being spoken', async () => {
  const { stageLayout } = await import('../../src/wallFacts.js');
  const panels = Array.from({ length: 30 }, (_, i) => ({ key: `p${i}`, w: 300, h: 190, sent: Math.floor(i / 2) }));
  const lay = stageLayout(panels, { width: 1440, height: 900 });
  assert.equal(lay.length, 30, 'every panel has an entry; none is dropped');
  const folded = lay.filter((l) => l.folded);
  assert.ok(folded.length > 0, 'thirty panels cannot all stay up at 1440');
  assert.equal(lay[lay.length - 1].folded, false, 'the newest panel is up');
  // folds go oldest first, and a panel is folded by a later sentence's panel
  const idx = (k) => Number(k.slice(1));
  for (const f of folded) assert.ok(panels[idx(f.foldedBy)].sent > panels[idx(f.key)].sent, `${f.key} was folded by its own sentence`);
  const firstUp = lay.findIndex((l) => !l.folded);
  assert.ok(folded.every((f) => idx(f.key) < 30 - 2), 'the last sentence keeps both its panels');
  assert.ok(firstUp > 0 && lay.slice(0, firstUp).every((l) => l.folded), 'the oldest fold first');
  // what is up touches nothing
  const up = lay.filter((l) => !l.folded && !l.forced);
  const hit = (a, b) => a.x < b.x + b.w + 20 && a.x + a.w > b.x - 20 && a.y < b.y + b.h + 20 && a.y + a.h > b.y - 20;
  for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) assert.equal(hit(up[i], up[j]), false, `${up[i].key} and ${up[j].key} touch`);
});

test('the stage: an agent\'s panel lands by its agent, and a page with the rail keeps the rail clear', async () => {
  const { stageLayout, STAGE } = await import('../../src/wallFacts.js');
  const ring = [[490, 100, 950, 720]];
  const lay = stageLayout([{ key: 'coach', w: 300, h: 150, sent: 0, anchor: [520, 220] }, { key: 'cfo', w: 300, h: 150, sent: 1, anchor: [930, 520] }], { core: [720, 400], keep: ring });
  assert.equal(lay[0].side, 'left');
  assert.equal(lay[1].side, 'right');
  assert.ok(lay[0].x + lay[0].w <= 490 && lay[1].x >= 950, 'the ring of agents is kept clear');
  const page = stageLayout([{ key: 'a', w: 300, h: 150, sent: 0 }, { key: 'b', w: 300, h: 150, sent: 0 }], { rail: true });
  assert.ok(page.every((l) => l.x >= STAGE.railLeft));
});

test('the Mac stage (phase 2): the core at the mockup\'s spot less the title bar, the chip beside the composer', async () => {
  const { stageFrame, stageChip, stageWidth, STAGE_TITLE } = await import('../../src/wallFacts.js');
  const f = stageFrame(1440, 900 - STAGE_TITLE);
  assert.deepEqual([f.cx, f.cy, f.s], [720, 318 - STAGE_TITLE, 0.5], 'mockup 114 sc.core 720, 318 at half size');
  assert.equal(f.cy + f.off * f.s, 424 - STAGE_TITLE, 'the words start where the mockup\'s do (318 + 204 x 0.5 + 4)');
  const c = stageChip(1440, 872);
  assert.equal(c.left, 1076, 'mockup .earlier left 1076');
  assert.deepEqual([c.cx, c.cy], [1126, 846 - STAGE_TITLE], 'mockup CHIP 1126, 846');
  assert.equal(stageWidth({ kind: 'metric' }), 250);
  assert.equal(stageWidth({ kind: 'list', macKind: 'calendar' }), 360, 'a code panel goes by its macKind');
  assert.equal(stageWidth({ kind: 'something-new' }), 300);
});

test('the Mac stage: arrival keeps every panel\'s place and beat; only new keys join, at the end', async () => {
  const { stageArrive } = await import('../../src/wallFacts.js');
  const a = stageArrive([], ['x', 'y'], 0);
  assert.deepEqual(a, [{ key: 'x', sent: 0 }, { key: 'y', sent: 0 }]);
  const b = stageArrive(a, ['y', 'x', 'z'], 2);
  assert.deepEqual(b, [{ key: 'x', sent: 0 }, { key: 'y', sent: 0 }, { key: 'z', sent: 2 }]);
  assert.equal(stageArrive(b, ['x', 'z'], 3), b, 'nothing new: the same array, so React keeps it');
  assert.equal(stageArrive(b, [], 4), b, 'a panel put away keeps its spot, so nothing after it moves');
});

test('the Mac stage plan: no cap, nothing on the core or the caption, each panel arrives from the core and folds to the chip', async () => {
  const { stagePlan, stageFrame, stageChip, stageKeep, STAGE_RIM } = await import('../../src/wallFacts.js');
  const entries = Array.from({ length: 24 }, (_, i) => ({ key: `p${i}`, w: [250, 340, 320, 360][i % 4], sent: i }));
  const heights = Object.fromEntries(entries.map((e, i) => [e.key, [150, 200, 170, 230][i % 4]]));
  const plan = stagePlan(entries, { width: 1440, height: 872, heights });
  assert.equal(plan.length, 24, 'every panel has a place; none is dropped by a cap');
  assert.ok(plan.some((p) => p.folded), 'twenty-four cannot all stay up');
  assert.equal(plan[23].folded, false, 'the newest is up');
  const f = stageFrame(1440, 872);
  const chip = stageChip(1440, 872);
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  for (const p of plan.filter((q) => !q.folded && !q.forced)) {
    for (const k of stageKeep([f.cx, f.cy])) assert.equal(hit([p.x, p.y, p.x + p.w, p.y + p.h], k), false, `${p.key} sits on the core or the caption`);
    assert.ok(p.y >= 16 && p.y + p.h <= 872 - 108, `${p.key} is off the stage`);
    const mx = p.x + p.w / 2; const my = p.y + p.h / 2;
    // it arrives from the core's side, 28 px out, and folds to the chip
    assert.ok(Math.abs(Math.hypot(p.ex, p.ey) - 28) < 0.2);
    assert.equal(p.fx, Math.round(chip.cx - mx));
    assert.equal(p.fy, Math.round(chip.cy - my));
    // the tether leaves the core's rim, or hangs from the caption's foot
    const [sx, sy] = p.tether.slice(1).split(' Q')[0].split(' ').map(Number);
    const r = Math.hypot(sx - f.cx, sy - f.cy);
    assert.ok(Math.abs(r - STAGE_RIM) < 0.5 || sy > f.cy + 200, `${p.key}'s tether starts ${r.toFixed(1)} from the core`);
  }
});

test('the Mac stage tether: a panel under the caption hangs from the caption\'s foot, never through the words', async () => {
  const { stageTether, stageKeep } = await import('../../src/wallFacts.js');
  const core = [720, 290];
  const cap = stageKeep(core)[1];
  const under = stageTether(core, 85, [600, 560, 900, 700], cap);
  assert.ok(under.startsWith(`M720.0 ${(cap[3] + 2).toFixed(1)} Q720.0 `), under);
  const side = stageTether(core, 85, [900, 200, 1200, 360], cap);
  assert.ok(side.startsWith('M805.0 290.0 Q'), side);
});
