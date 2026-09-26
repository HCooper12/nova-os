// Correcting an estimate in words (lib/foodRefine.js, scanFood.startFoodRefine).
// His report, 26 Sep: the photo was read as a beef rissole, it was vegetarian,
// and there was no way to say so after the first answer. Temp data dir
// before any import; the model is always a stand-in.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-food-refine-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { applyRefine, previousPlate, freshLine, buildRefinePrompt } = await import('../lib/foodRefine.js');
const { startFoodRefine, getFoodScanJob } = await import('../lib/scanFood.js');

// his plate, as the scan described it
const PLATE = previousPlate({ name: 'Chicken schnitzel', lines: [
  { name: 'creamy pasta salad with ham and egg', grams: 150, macros: { p: 12, c: 40, f: 20, kcal: 390 } },
  { name: 'crumbed chicken schnitzel', grams: 150, macros: { p: 33, c: 15, f: 17, kcal: 327 } },
  { name: '2 thin sausages', grams: 110, macros: { p: 14, c: 3, f: 24, kcal: 270 } },
  { name: 'tomato-base rissole', grams: 80, macros: { p: 12, c: 6, f: 10, kcal: 162 } },
] });

test('THE REPORT: the rissole changes, every other line keeps its exact numbers', () => {
  const r = applyRefine(PLATE, {
    name: 'Chicken schnitzel plate',
    lines: [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { name: 'vegetable rissole', grams: 80, p: 6, c: 12, f: 8 }],
    changes: 'Swapped the beef rissole for a vegetable one.',
  });
  assert.deepEqual(r.lines.slice(0, 3).map((l) => l.macros.kcal), [390, 327, 270], 'lines he did not mention do not drift');
  assert.equal(r.lines[3].name, 'vegetable rissole');
  assert.equal(r.lines[3].macros.kcal, 6 * 4 + 12 * 4 + 8 * 9, 'kcal is derived from the macros, never the model');
  assert.equal(r.macros.kcal, 390 + 327 + 270 + 144, 'the total is the sum of the lines');
  assert.deepEqual(r.diff.removed, ['tomato-base rissole']);
  assert.deepEqual(r.diff.added, ['vegetable rissole']);
  assert.equal(r.diff.kcalDelta, 144 - 162);
  assert.equal(r.name, 'Chicken schnitzel plate');
});

test('"I didn\'t eat the sausages" drops a line; "and a can of coke" adds one', () => {
  const r = applyRefine(PLATE, { lines: [{ keep: 0 }, { keep: 1 }, { keep: 3 }, { name: 'can of Coca-Cola', grams: 375, p: 0, c: 40, f: 0 }] });
  assert.deepEqual(r.diff.removed, ['2 thin sausages']);
  assert.equal(r.lines.length, 4);
  assert.equal(r.lines[3].macros.kcal, 160);
});

test('a line kept twice is kept once; an unknown keep index is not invented', () => {
  const r = applyRefine(PLATE, { lines: [{ keep: 1 }, { keep: 1 }, { keep: 9 }] });
  assert.equal(r.lines.length, 1);
  assert.equal(r.diff.kept, 1);
});

test('an impossible line is refused: macros heavier than the portion, negatives, no name', () => {
  assert.equal(freshLine({ name: 'x', grams: 50, p: 40, c: 20, f: 10 }), null);
  assert.equal(freshLine({ name: 'x', p: -1, c: 0, f: 0 }), null);
  assert.equal(freshLine({ name: '', p: 1, c: 1, f: 1 }), null);
  assert.equal(freshLine({ name: 'water', p: 0, c: 0, f: 0 }), null, 'zero calories is not a food line');
});

test('an answer with no usable lines is an error, not an empty plate', () => {
  assert.throws(() => applyRefine(PLATE, { lines: [] }), /nothing on the plate/);
  assert.throws(() => applyRefine(PLATE, {}), /without a plate/);
});

test('a single-line estimate (a label, a bar) still refines as one line', () => {
  const p = previousPlate({ name: 'Protein bar', macros: { p: 20, c: 25, f: 8, kcal: 252 } });
  assert.deepEqual(p.lines.map((l) => l.name), ['Protein bar']);
});

test('the prompt carries the numbered plate, what he said before, and never asks for calories', () => {
  const prompt = buildRefinePrompt({ name: PLATE.name, lines: PLATE.lines, correction: 'the rissole was vegetarian', history: ['it was a small plate'] });
  assert.match(prompt, /3\. tomato-base rissole \(80 g\)/);
  assert.match(prompt, /"it was a small plate"/);
  assert.match(prompt, /His correction now: "the rissole was vegetarian"/);
  assert.match(prompt, /Never output calories/);
});

test('startFoodRefine runs the model with no tools and lands a scan-shaped result on the same job map', async () => {
  let args = null;
  const run = async (a) => {
    args = a;
    return JSON.stringify({ is_error: false, result: JSON.stringify({ name: 'Chicken schnitzel plate', lines: [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { name: 'vegetable rissole', grams: 80, p: 6, c: 12, f: 8 }], changes: 'Swapped the rissole.', question: '' }) });
  };
  const id = startFoodRefine({ name: PLATE.name, lines: PLATE.lines, correction: 'the rissole was vegetarian' }, { run });
  let job;
  for (let i = 0; i < 100 && (!job || job.status === 'running'); i++) { await new Promise((r) => setTimeout(r, 10)); job = getFoodScanJob(id); }
  assert.equal(job.status, 'ready', job.error || '');
  assert.equal(job.result.components.length, 4);
  assert.equal(job.result.changes, 'Swapped the rissole.');
  assert.equal(job.result.confidence, 'high');
  assert.equal(args[args.indexOf('--allowedTools') + 1], '', 'words in, words out');
  assert.ok(args.includes('--model'));
});

test('a correction with nothing to refine, or no words, is refused up front', () => {
  assert.throws(() => startFoodRefine({ name: 'x', lines: PLATE.lines, correction: ' ' }, { run: async () => '' }), /say what is different/);
});
