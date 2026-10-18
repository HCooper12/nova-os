import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetsOn, withTargetChange, cleanTargetHistory, EARLIEST } from '../../src/targetHistory.js';

// his real history, 18 Oct 2026: 2,100 / 150 until he set 2,153 / 166 that morning
const his = [{ from: EARLIEST, kcal: 2100, protein: 150 }, { from: '2026-10-18', kcal: 2153, protein: 166 }];

test('a past day keeps the target it had; the change governs from its own day on', () => {
  assert.deepEqual(targetsOn(his, '2026-10-12'), { kcal: 2100, protein: 150 });
  assert.deepEqual(targetsOn(his, '2026-10-17'), { kcal: 2100, protein: 150 });
  assert.deepEqual(targetsOn(his, '2026-10-18'), { kcal: 2153, protein: 166 });
  assert.deepEqual(targetsOn(his, '2026-11-02'), { kcal: 2153, protein: 166 });
});

test('no history: every day reads today\'s numbers, as before', () => {
  assert.deepEqual(targetsOn([], '2026-10-01', { kcal: 2000, protein: 140 }), { kcal: 2000, protein: 140 });
});

test('the first change records the old numbers for every earlier day', () => {
  const h = withTargetChange([], '2026-10-18', { kcal: 2153, protein: 166 }, { kcal: 2100, protein: 150 });
  assert.deepEqual(h, his);
});

test('an unchanged save adds nothing; two changes in a day leave one entry; a same-day revert removes it', () => {
  assert.deepEqual(withTargetChange(his, '2026-10-20', { kcal: 2153, protein: 166 }), his);
  const twice = withTargetChange(his, '2026-10-18', { kcal: 2200, protein: 166 });
  assert.equal(twice.filter((e) => e.from === '2026-10-18').length, 1);
  assert.equal(targetsOn(twice, '2026-10-18').kcal, 2200);
  assert.deepEqual(withTargetChange(his, '2026-10-18', { kcal: 2100, protein: 150 }), [his[0]]);
});

test('one number changed: the other carries forward', () => {
  const h = withTargetChange(his, '2026-10-25', { kcal: 2000 });
  assert.deepEqual(targetsOn(h, '2026-10-26'), { kcal: 2000, protein: 166 });
  assert.deepEqual(targetsOn(h, '2026-10-20'), { kcal: 2153, protein: 166 });
});

test('junk entries are dropped, order is restored', () => {
  assert.deepEqual(cleanTargetHistory([{ from: 'x', kcal: 1 }, { from: '2026-10-18', kcal: 2153 }, { from: '2026-01-01', protein: 150 }]),
    [{ from: '2026-01-01', kcal: null, protein: 150 }, { from: '2026-10-18', kcal: 2153, protein: null }]);
});

test('the goals page writer dates a change and keeps the earlier numbers for past days', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  process.env.NOVA_DATA_DIR ||= await mkdtemp(path.join(tmpdir(), 'nova-th-data-'));
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-th-'));
  const { setFitnessGoals, loadTargetHistory } = await import('../lib/fitnessGoals.js');
  const { localDateISO } = await import('../lib/localDate.js');
  await setFitnessGoals(vault, { goal: 'V-taper', kcalTarget: 2100, proteinTarget: 150 });
  // the first save has nothing before it: it governs every day
  assert.deepEqual(await loadTargetHistory(vault), [{ from: EARLIEST, kcal: 2100, protein: 150 }]);
  await setFitnessGoals(vault, { goal: 'V-taper', kcalTarget: 2153, proteinTarget: 166 });
  const h = await loadTargetHistory(vault);
  assert.deepEqual(targetsOn(h, '2026-01-05'), { kcal: 2100, protein: 150 });
  assert.deepEqual(targetsOn(h, localDateISO()), { kcal: 2153, protein: 166 });
  // a save that only edits the notes leaves the history alone
  await setFitnessGoals(vault, { goal: 'V-taper', notes: 'x', kcalTarget: 2153, proteinTarget: 166 });
  assert.deepEqual(await loadTargetHistory(vault), h);
});

test('the goal board judges yesterday by yesterday\'s target, today by today\'s', async () => {
  const { composeBoard } = await import('../lib/goalBoard.js');
  const now = new Date('2026-10-18T21:30:00');
  const targets = { steps: { value: 10000 }, protein: { value: 166, source: 'goals' }, kcal: { value: 2153, source: 'goals' } };
  const b = composeBoard({ targets, now, targetHistory: his, nutritionDays: [{ date: '2026-10-17', p: 155, kcal: 2100 }] });
  const protein = b.metrics?.find?.((m) => m.key === 'protein') || b.protein;
  const sat = (protein.days || protein.week).find((d) => d.date === '2026-10-17');
  assert.equal(sat.met, true, '155g cleared the 150g floor that day; the new 166g must not re-judge it');
});
