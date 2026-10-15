// GLASS FOCUS (15 Oct 2026): the rows under "Tomorrow needs" are askFor's own
// ladder in its own order, and the lens lands where askFor's answer says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askFor, composeWrap } from '../lib/wrapDay.js';
import { wrapLadder, lineWithoutTomorrow, LADDER } from '../../src/wrapLadder.js';

const base = {
  date: '2026-10-15', hour: 19, entries: 3,
  eaten: { kcal: 2240, p: 132, c: 0, f: 0 },
  targets: { kcal: 2600, protein: 180 },
  kcalLeft: 360, proteinShort: 48, floorMet: false,
  dishes: [{ id: 'd', name: 'Chicken bowl', macros: { p: 52, kcal: 610 }, inFridge: true }],
  fridge: [{ id: 'd', name: 'Chicken bowl', portions: 2 }],
  planNames: ['Chicken bowl'], planTicked: false,
  tomorrow: { kind: 'train', name: 'Push A' }, weighStaleDays: 3, missing: [],
};

test('the lens goes to the rung askFor picked, for every rung of the ladder', () => {
  const cases = [
    [{ ...base, fridge: [] }, 'cook'],
    [base, 'protein'],
    [{ ...base, floorMet: true, proteinShort: 0, weighStaleDays: 9 }, 'weigh'],
    [{ ...base, floorMet: true, proteinShort: 0 }, 'train'],
    [{ ...base, floorMet: true, proteinShort: 0, tomorrow: { kind: 'rest', name: null } }, 'hold'],
  ];
  for (const [facts, kind] of cases) {
    const ask = askFor(facts);
    assert.equal(ask.kind, kind);
    const l = wrapLadder(facts, ask);
    assert.equal(l.rows[l.hero].key, kind);
    assert.deepEqual(l.rows.map((r) => r.key), LADDER);
  }
});

test('every row shows the fact it checked, and says so when the fact is missing', () => {
  const l = wrapLadder(base, askFor(base));
  assert.deepEqual(l.rows.map((r) => r.value), ['2 portions cooked', '132 / 180 g', '3 days ago', 'Push A', '2,600 kcal']);
  const bare = wrapLadder({ ...base, fridge: [], targets: null, weighStaleDays: null, tomorrow: null }, { kind: 'hold', text: 'x' });
  assert.deepEqual(bare.rows.map((r) => r.value), ['Empty', '132 g, no floor set', 'No reading', 'Not known', 'No targets set']);
});

test('the reason is askFor\'s own sentence; an unknown answer draws no ladder', () => {
  const ask = askFor(base);
  assert.equal(wrapLadder(base, ask).why, ask.text[0].toUpperCase() + ask.text.slice(1));
  assert.equal(wrapLadder(base, { kind: 'mystery', text: 'x' }), null);
  assert.equal(wrapLadder(null, ask), null);
});

test('the card line drops only its "Tomorrow:" clause, which the ladder now carries', () => {
  const w = composeWrap({ ...base, missing: ['your food log'] });
  const short = lineWithoutTomorrow(w.line, w.ask);
  assert.ok(!short.includes('Tomorrow:'));
  assert.ok(short.includes('(I could not read your food log, so this is partial.)'));
  assert.equal(lineWithoutTomorrow('No tomorrow here.', w.ask), 'No tomorrow here.');
});
