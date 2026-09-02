// THE TWINS SWEEP — shared contracts that used to be kept by discipline alone
// are pinned here, so a change to one copy is a decision and never a drift.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mondayOf, mondayIso } from '../lib/cadence.js';
import { mondayOf as auditMonday } from '../lib/coachProgramAudit.js';
import { mondayOf as analyticsMonday } from '../lib/trainingAnalytics.js';
import { WORKOUT_RE } from '../lib/calendar.js';
import { AISLE, aisleFor } from '../lib/mealPrep.js';
import { SHOPPING_CATEGORIES } from '../lib/shoppingList.js';
import { dateHashIndex } from '../lib/dispatch.js';
import { yesterdayStepsShape } from '../lib/healthData.js';
import { tableSchedule, doublingSchedule, nextDueAt } from '../lib/spacing.js';
import { SCHEDULE as librarySchedule, INTERVALS } from '../lib/librarySpacing.js';
import { SCHEDULE as leaderSchedule } from '../lib/leader.js';
import { MODEL_CHOICES } from '../lib/modelPrefs.js';

test('ONE Monday: local midnight, every weekday of a week, weeksBack, a date string, and the ISO flavour', () => {
  const tue = new Date('2026-08-25T09:00:00'); // local Tuesday
  const mon = mondayOf(tue);
  assert.equal(mon.getDay(), 1);
  assert.deepEqual([mon.getHours(), mon.getMinutes(), mon.getDate()], [0, 0, 24]);
  assert.equal(mondayOf(new Date('2026-08-30T23:59:00')).getTime(), mon.getTime(), 'Sunday night belongs to the same week');
  assert.equal(mondayOf(new Date('2026-08-24T00:00:00')).getTime(), mon.getTime(), 'Monday itself');
  assert.equal(mondayOf(tue, { weeksBack: 1 }).getDate(), 17);
  assert.equal(mondayOf(tue, { weeksBack: -1 }).getDate(), 31);
  assert.equal(mondayIso('2026-08-30'), '2026-08-24', 'a date string is read as that local day');
  assert.equal(mondayIso(tue), '2026-08-24');
  // the re-exports the audit and the analytics keep for their callers are the same function's answers
  assert.equal(auditMonday(tue).getTime(), mon.getTime());
  assert.equal(analyticsMonday('2026-08-30'), '2026-08-24');
  assert.equal(analyticsMonday(tue), '2026-08-24');
});

test('WORKOUT_RE lives once, on the calendar, and still reads a session the way both surfaces did', () => {
  for (const label of ['Gym', 'Push day', 'Leg session', 'Upper body', 'cardio 6am']) assert.ok(WORKOUT_RE.test(label), label);
  for (const label of ['Dinner with Sam', 'Dentist', 'Pushkin lecture']) assert.ok(!WORKOUT_RE.test(label), label);
  // his REAL calendar, replayed 2026-09-02 (736 events / 120 days): the two
  // labels that train, and the dog walk that must not
  for (const label of ['Workout', 'Workout / Steps 👟']) assert.ok(WORKOUT_RE.test(label), label);
  assert.ok(!WORKOUT_RE.test('Walk Tank 🐶🐾'), 'a dog walk is not a session');
});

test('every aisle the meal-prep list files into is a heading the shopping list renders', () => {
  const known = new Set(SHOPPING_CATEGORIES);
  for (const [category] of AISLE) assert.ok(known.has(category), `aisle "${category}" is not a shopping category`);
  assert.ok(known.has(aisleFor('a thing no keyword matches')), 'the fallback aisle is a real heading too');
  assert.equal(aisleFor('chicken breast'), 'Meat & Protein');
});

test('the review pick hash is pinned — the client twin (App.jsx dailyReviewIndex) must produce these', () => {
  assert.equal(dateHashIndex('2026-09-02', 7), 1);
  assert.equal(dateHashIndex('2026-01-01', 5), 0);
  assert.equal(dateHashIndex('2026-12-31', 13), 2);
  assert.equal(dateHashIndex('2026-09-02', 0), 0, 'an empty pool is index 0, never NaN');
});

test("yesterday's steps have one shape: missing, partial (received on its own day before the evening), complete", () => {
  const now = new Date('2026-09-02T08:00:00');
  assert.equal(yesterdayStepsShape([], now).kind, 'missing');
  assert.equal(yesterdayStepsShape([{ date: '2026-09-01', steps: null }], now).kind, 'missing');
  const partial = yesterdayStepsShape([{ date: '2026-09-01', steps: 294, receivedAt: '2026-09-01T09:04:00' }], now);
  assert.equal(partial.kind, 'partial');
  assert.equal(partial.receivedAt.getHours(), 9);
  assert.equal(yesterdayStepsShape([{ date: '2026-09-01', steps: 7908, receivedAt: '2026-09-01T21:30:00' }], now).kind, 'complete', 'an evening push on the day is the day landing');
  assert.equal(yesterdayStepsShape([{ date: '2026-09-01', steps: 7908, receivedAt: '2026-09-02T07:47:00' }], now).kind, 'complete', 'the morning-after push is complete');
  assert.equal(yesterdayStepsShape([{ date: '2026-09-01', steps: 7908 }], now).kind, 'complete', 'no receipt time → not called partial');
  assert.equal(yesterdayStepsShape([{ date: '2026-09-01', steps: 100, receivedAt: '2026-09-01T19:59:00' }], now, { eveningHour: 20 }).kind, 'partial');
});

test('the two spacing schedules are pinned side by side, and the due arithmetic is one function', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(librarySchedule), [1, 3, 7, 16, 35, 35, 35], 'Library: the table, last interval repeats');
  assert.deepEqual(INTERVALS, [1, 3, 7, 16, 35]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(leaderSchedule), [3, 6, 12, 24, 35, 35], 'Leader: doubling from 3, capped at 35');
  assert.deepEqual([0, 2].map(tableSchedule([2, 4, 8])), [2, 8]);
  assert.equal(doublingSchedule(1, 10)(10), 10);
  const DAY = 86_400_000;
  assert.equal(nextDueAt(1000, 0, librarySchedule), 1000 + 1 * DAY);
  assert.equal(nextDueAt(1000, 1, leaderSchedule), 1000 + 6 * DAY);
  assert.equal(nextDueAt(undefined, 0, leaderSchedule), 3 * DAY, 'never seen counts from the epoch — due at once');
});

test('the Code tab reads its model list off the board: exactly the four moving aliases are flagged', () => {
  const aliases = MODEL_CHOICES.filter((m) => m.alias).map((m) => m.value).sort();
  assert.deepEqual(aliases, ['fable', 'haiku', 'opus', 'sonnet']);
  assert.ok(MODEL_CHOICES.filter((m) => !m.alias).every((m) => /pinned/.test(m.label)), 'everything else is a pinned version');
});
