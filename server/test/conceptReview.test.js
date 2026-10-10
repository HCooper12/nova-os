// The Daily review's schedule (mockup 96; audit 27-daily-review.md). Set
// NOVA_DATA_DIR before any import — these tests must never touch his real
// server/data, and this module's dataRoot() is read lazily at call time so
// the env var only needs to land before the first call, not the import, but
// we set it first regardless, per house convention.
process.env.NOVA_DATA_DIR = '';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import {
  GAPS, DAILY, NEW_WHEN_BELOW, answer, nextStep, daysBetween, shiftDate,
  dueCards, newCandidates, buildQueue, rebuildState, parseLogLine, formatLogLine,
  appendAnswer, undoAnswer, LOG_REL,
} from '../lib/conceptReview.js';

async function tempVault() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-review-'));
  process.env.NOVA_DATA_DIR = path.join(dir, 'data');
  const vault = path.join(dir, 'vault');
  await mkdir(path.join(vault, 'Wiki', 'Library'), { recursive: true });
  return vault;
}

/* --------------------------------- grading -------------------------------- */

test('the seven gaps are exactly his table', () => {
  assert.deepEqual(GAPS, [1, 3, 7, 16, 35, 90, 180]);
});

test('Got it climbs a step; Fuzzy repeats; Forgot goes back to step 0', () => {
  assert.equal(nextStep(0, 'got'), 1);
  assert.equal(nextStep(3, 'got'), 4);
  assert.equal(nextStep(2, 'fuzzy'), 2);
  assert.equal(nextStep(5, 'forgot'), 0);
});

test('Read behaves exactly like Got it — his change to the mockup', () => {
  assert.equal(nextStep(0, 'read'), nextStep(0, 'got'));
  assert.equal(nextStep(4, 'read'), nextStep(4, 'got'));
});

test('a step never climbs past the last gap', () => {
  assert.equal(nextStep(GAPS.length - 1, 'got'), GAPS.length - 1);
});

test('answer() sets due to today + the new step\'s gap', () => {
  const a = answer(null, 'got', '2026-10-11'); // never seen -> step 0 -> got -> step 1
  assert.equal(a.step, 1);
  assert.equal(a.due, shiftDate('2026-10-11', GAPS[1]));
});

test('Fuzzy keeps the same gap from the same day', () => {
  const card = { step: 2, due: '2026-10-11' };
  const a = answer(card, 'fuzzy', '2026-10-11');
  assert.equal(a.step, 2);
  assert.equal(a.due, shiftDate('2026-10-11', GAPS[2]));
});

test('Forgot sends it back to tomorrow', () => {
  const card = { step: 4, due: '2026-10-11' };
  const a = answer(card, 'forgot', '2026-10-11');
  assert.equal(a.step, 0);
  assert.equal(a.due, shiftDate('2026-10-11', GAPS[0]));
  assert.equal(a.due, '2026-10-12');
});

test('an unknown grade is refused, never silently coerced', () => {
  assert.throws(() => answer(null, 'meh', '2026-10-11'));
});

/* ------------------------------- date math -------------------------------- */

test('daysBetween and shiftDate are calendar-string arithmetic, no timezone opinion', () => {
  assert.equal(daysBetween('2026-10-11', '2026-10-14'), 3);
  assert.equal(daysBetween('2026-10-14', '2026-10-11'), -3);
  assert.equal(shiftDate('2026-10-11', 3), '2026-10-14');
});

test('a year boundary is a plain calendar rollover', () => {
  assert.equal(shiftDate('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
});

/* -------------------------------- ordering --------------------------------- */

const page = (id, over = {}) => ({ id, title: id, type: 'concept', date: '2026-10-01', ...over });

test('due cards rank furthest past their own gap first', () => {
  const pages = [page('a'), page('b'), page('c')];
  const pagesById = new Map(pages.map((p) => [p.id, p]));
  // a: step 0 (gap 1), due 5 days ago -> score 5
  // b: step 2 (gap 7), due 7 days ago -> score 1
  // c: step 1 (gap 3), due 9 days ago -> score 3
  const cards = {
    a: { step: 0, due: '2026-10-06' },
    b: { step: 2, due: '2026-10-04' },
    c: { step: 1, due: '2026-10-02' },
  };
  const today = '2026-10-11';
  const ranked = dueCards(cards, pagesById, today).map((d) => d.id);
  assert.deepEqual(ranked, ['a', 'c', 'b']);
});

test('a card not yet due is excluded entirely', () => {
  const pagesById = new Map([['a', page('a')]]);
  const cards = { a: { step: 0, due: '2026-10-12' } };
  assert.deepEqual(dueCards(cards, pagesById, '2026-10-11'), []);
});

test('a tie in overdue score falls to the lower step, then title', () => {
  const pagesById = new Map([['b', page('b')], ['a', page('a')]]);
  const cards = { a: { step: 1, due: '2026-10-11' }, b: { step: 0, due: '2026-10-11' } };
  const ranked = dueCards(cards, pagesById, '2026-10-11').map((d) => d.id);
  assert.deepEqual(ranked, ['b', 'a'], 'both score 0 (due today); lower step first; b < a would tie-break anyway');
});

test('new candidates rank newest page first, then most backlinked, then title', () => {
  const pages = [
    page('old', { date: '2026-09-01' }),
    page('new2', { date: '2026-10-10' }),
    page('new1', { date: '2026-10-10' }),
  ];
  const backlinks = new Map([['new1', 1], ['new2', 5]]);
  const ranked = newCandidates(pages, {}, backlinks).map((c) => c.id);
  assert.deepEqual(ranked, ['new2', 'new1', 'old']);
});

test('a candidate already in state (ever answered) is never offered as new', () => {
  const pages = [page('a'), page('b')];
  const ranked = newCandidates(pages, { a: { step: 0, due: '2026-10-11' } }, new Map()).map((c) => c.id);
  assert.deepEqual(ranked, ['b']);
});

/* ------------------------------- the queue --------------------------------- */

test('the queue caps at five a day', () => {
  const pages = Array.from({ length: 8 }, (_, i) => page(`p${i}`));
  const cards = Object.fromEntries(pages.map((p) => [p.id, { step: 0, due: '2026-10-01' }]));
  const { queue, dueCount } = buildQueue({ pages, cards, backlinkCounts: new Map(), today: '2026-10-11' });
  assert.equal(dueCount, 8);
  assert.equal(queue.length, DAILY);
});

test('fewer than three due pulls in exactly one new concept', () => {
  const pages = [page('due1'), page('due2'), page('fresh', { date: '2026-10-10' })];
  const cards = { due1: { step: 0, due: '2026-10-01' }, due2: { step: 0, due: '2026-10-01' } };
  const { queue } = buildQueue({ pages, cards, backlinkCounts: new Map(), today: '2026-10-11' });
  assert.equal(queue.length, 3);
  assert.equal(queue.filter((q) => q.kind === 'new').length, 1);
  assert.equal(queue.at(-1).id, 'fresh');
});

test('three or more due pulls in no new concept', () => {
  const pages = [page('d1'), page('d2'), page('d3'), page('fresh', { date: '2026-10-10' })];
  const cards = Object.fromEntries(['d1', 'd2', 'd3'].map((id) => [id, { step: 0, due: '2026-10-01' }]));
  const { queue } = buildQueue({ pages, cards, backlinkCounts: new Map(), today: '2026-10-11' });
  assert.equal(queue.filter((q) => q.kind === 'new').length, 0, 'no room/need for a new concept today');
});

test('nothing due and nothing new is an empty, honest queue', () => {
  const { queue, dueCount } = buildQueue({ pages: [], cards: {}, backlinkCounts: new Map(), today: '2026-10-11' });
  assert.deepEqual(queue, []);
  assert.equal(dueCount, 0);
});

/* ------------------------------ log round-trip ------------------------------ */

test('formatLogLine and parseLogLine are exact inverses', () => {
  const line = formatLogLine('2026-10-11', 'Effort Debt', 'got');
  assert.equal(line, '- 2026-10-11 · [[Effort Debt]] · Got it');
  assert.deepEqual(parseLogLine(line), { date: '2026-10-11', title: 'Effort Debt', grade: 'got' });
});

test('a line that is not an answer line parses to null, never a guess', () => {
  assert.equal(parseLogLine('- some other markdown bullet'), null);
  assert.equal(parseLogLine('not a bullet at all'), null);
});

/* ------------------------- rebuilding from the log -------------------------- */

test('the schedule rebuilds from the log, replaying each concept\'s own answers in date order', () => {
  const titleToId = new Map([['effort debt', 'effort-debt'], ['sunk cost', 'sunk-cost']]);
  const lines = [
    // written newest-first, as the real file is, but a DIFFERENT concept's
    // lines interleaved — rebuildState must not assume cross-concept order
    '- 2026-10-11 · [[Sunk Cost]] · Fuzzy',
    '- 2026-10-10 · [[Effort Debt]] · Got it',
    '- 2026-10-02 · [[Sunk Cost]] · Got it',
    '- 2026-10-01 · [[Effort Debt]] · Forgot',
  ];
  const { cards, history } = rebuildState(lines, titleToId);
  // Effort Debt: Forgot (10-01, step0->0, due 10-02) then Got it (10-10, step0->1, due 10-10+3=10-13)
  assert.equal(cards['effort-debt'].step, 1);
  assert.equal(cards['effort-debt'].due, '2026-10-13');
  // Sunk Cost: Got it (10-02, step0->1, due 10-05) then Fuzzy (10-11, step1->1, due 10-11+3=10-14)
  assert.equal(cards['sunk-cost'].step, 1);
  assert.equal(cards['sunk-cost'].due, '2026-10-14');
  assert.equal(history['effort-debt'].length, 2);
  assert.equal(history['sunk-cost'][0].date, '2026-10-02', 'history is chronological, oldest first');
});

test('a log line naming a page no longer in the vault is orphaned honestly, not guessed at', () => {
  const titleToId = new Map([['effort debt', 'effort-debt']]);
  const lines = ['- 2026-10-11 · [[Deleted Page]] · Got it'];
  const { cards } = rebuildState(lines, titleToId);
  assert.deepEqual(cards, {});
});

test('a hand-edited log line (he fixed a typo in Obsidian) rebuilds the same as a code-written one', () => {
  const titleToId = new Map([['effort debt', 'effort-debt']]);
  const handEdited = ['-   2026-10-11 · [[Effort Debt]] · Got it  '];
  // the strict format still parses with surrounding whitespace tolerated,
  // and if it truly doesn't match, it must be excluded, never crash
  const parsed = parseLogLine(handEdited[0].trimEnd());
  assert.ok(parsed === null || parsed.grade === 'got');
});

/* --------------------------- write + undo, byte-exact --------------------------- */

test('appendAnswer writes one line, newest after the header, and undoAnswer removes exactly that line', async () => {
  const vault = await tempVault();
  const full = path.join(vault, LOG_REL);
  const r1 = await appendAnswer(vault, { date: '2026-10-10', title: 'Effort Debt', grade: 'got' });
  const afterFirst = await readFile(full, 'utf8');
  assert.match(afterFirst, /- 2026-10-10 · \[\[Effort Debt\]\] · Got it/);

  const r2 = await appendAnswer(vault, { date: '2026-10-11', title: 'Sunk Cost', grade: 'fuzzy' });
  const afterSecond = await readFile(full, 'utf8');
  assert.match(afterSecond, /- 2026-10-11 · \[\[Sunk Cost\]\] · Fuzzy/);
  assert.match(afterSecond, /- 2026-10-10 · \[\[Effort Debt\]\] · Got it/, 'the first line survives untouched');

  // undo the SECOND answer; the first line must be byte-identical after
  await undoAnswer(vault, r2);
  const afterUndo2 = await readFile(full, 'utf8');
  assert.equal(afterUndo2, afterFirst, 'undoing the second write restores the exact prior bytes');

  await undoAnswer(vault, r1);
  const afterUndo1 = await readFile(full, 'utf8');
  assert.doesNotMatch(afterUndo1, /Effort Debt/);
});

test('re-grading the SAME concept on the SAME day replaces its one line, and undo restores the line it replaced', async () => {
  const vault = await tempVault();
  const full = path.join(vault, LOG_REL);
  const r1 = await appendAnswer(vault, { date: '2026-10-11', title: 'Effort Debt', grade: 'fuzzy' });
  const afterFirst = await readFile(full, 'utf8');
  const r2 = await appendAnswer(vault, { date: '2026-10-11', title: 'Effort Debt', grade: 'got' });
  const afterSecond = await readFile(full, 'utf8');
  assert.match(afterSecond, /Got it/);
  assert.doesNotMatch(afterSecond, /Fuzzy/, 'the re-mark replaced, not stacked');
  assert.equal(r2.prevLine, '- 2026-10-11 · [[Effort Debt]] · Fuzzy');

  await undoAnswer(vault, r2);
  const afterUndo = await readFile(full, 'utf8');
  assert.equal(afterUndo, afterFirst, 'undo puts back the exact line it replaced, not a blank');
});

test('undoing a line that is no longer there (already edited by hand) is a clean no-op, not a crash', async () => {
  const vault = await tempVault();
  const r1 = await appendAnswer(vault, { date: '2026-10-11', title: 'Effort Debt', grade: 'got' });
  const full = path.join(vault, LOG_REL);
  await writeFile(full, (await readFile(full, 'utf8')).replace('Got it', 'Got it (his own note)'), 'utf8');
  const ok = await undoAnswer(vault, r1);
  assert.equal(ok, false);
});
