import test from 'node:test';
import assert from 'node:assert/strict';
import { calorieWeek, weekStartOf } from '../../src/calorieWeek.js';

// Saturday 17 Oct 2026: the week began Monday the 12th
const day = (date, kcal) => ({ date, kcal });
const week = [day('2026-10-11', 2500), day('2026-10-12', 2000), day('2026-10-13', 2200), day('2026-10-14', 1900), day('2026-10-15', 2300), day('2026-10-16', 2100), day('2026-10-17', 800)];

test('the week is Monday to Sunday, found from any day in it', () => {
  assert.equal(weekStartOf('2026-10-17'), '2026-10-12');
  assert.equal(weekStartOf('2026-10-12'), '2026-10-12', 'a Monday is its own start');
  assert.equal(weekStartOf('2026-10-18'), '2026-10-12', 'Sunday belongs to the week before the next Monday');
  assert.equal(weekStartOf('2026-10-19'), '2026-10-19');
});

test('eaten, budget, left and what each remaining day allows are plain arithmetic over what was logged', () => {
  const w = calorieWeek(week, { targetKcal: 2100, today: '2026-10-17' });
  assert.deepEqual(w.days.map((d) => d.state), ['logged', 'logged', 'logged', 'logged', 'logged', 'today', 'future']);
  assert.equal(w.days[0].date, '2026-10-12', 'Sunday the 11th is last week and is not counted');
  assert.equal(w.eaten, 2000 + 2200 + 1900 + 2300 + 2100 + 800);
  assert.equal(w.budget, 14700);
  assert.equal(w.left, 14700 - 11300);
  assert.equal(w.pct, 77);
  // before today: 10,500 eaten of 14,700 → 4,200 over today and Sunday
  assert.equal(w.remainingDays, 2);
  assert.equal(w.perDay, 2100);
  assert.equal(w.loggedDays, 6);
  assert.equal(w.gaps, 0);
  assert.equal(w.avg, Math.round(11300 / 6));
});

test('an unlogged past day is a gap, said so, and never counted as zero eaten', () => {
  const holey = week.filter((d) => d.date !== '2026-10-14');
  const w = calorieWeek(holey, { targetKcal: 2100, today: '2026-10-17' });
  assert.equal(w.gaps, 1);
  assert.equal(w.days[2].state, 'gap');
  assert.equal(w.days[2].kcal, null);
  assert.equal(w.eaten, 9400, 'the gap adds nothing');
  assert.equal(w.loggedDays, 5);
});

test('over the budget reads as over, left stops at zero, and the allowance never goes negative', () => {
  const heavy = week.map((d) => ({ ...d, kcal: 3000 }));
  const w = calorieWeek(heavy, { targetKcal: 2100, today: '2026-10-17' });
  assert.equal(w.left, 0);
  assert.ok(w.over > 0);
  assert.equal(w.perDay, 0);
  assert.equal(w.pct, 100);
});

test('no target: the days and totals still stand, the budget does not exist', () => {
  const w = calorieWeek(week, { targetKcal: null, today: '2026-10-17' });
  assert.equal(w.budget, null);
  assert.equal(w.left, null);
  assert.equal(w.perDay, null);
  assert.equal(w.eaten, 11300);
});

test('a Monday morning: one open day, six to come, nothing eaten before today', () => {
  const w = calorieWeek([day('2026-10-12', 400)], { targetKcal: 2000, today: '2026-10-12' });
  assert.equal(w.remainingDays, 7);
  assert.equal(w.perDay, 2000);
  assert.equal(w.eaten, 400);
  assert.deepEqual(w.days.map((d) => d.state), ['today', 'future', 'future', 'future', 'future', 'future', 'future']);
});

test('a goal changed mid-week governs only from its own day: the budget is each day\'s own target', () => {
  // his real week, 18 Oct 2026: 2,100 until Saturday, 2,153 from Sunday
  const w = calorieWeek(week, { targetKcal: 2153, today: '2026-10-18', targetOn: (d) => (d >= '2026-10-18' ? 2153 : 2100) });
  assert.equal(w.budget, 2100 * 6 + 2153);
  assert.equal(w.days.find((d) => d.date === '2026-10-13').target, 2100, 'a past day keeps its own target');
  assert.equal(w.days.find((d) => d.date === '2026-10-18').target, 2153);
});
