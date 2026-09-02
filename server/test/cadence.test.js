// The slept-Mac fix: a weekly agent's window opens on its day and stays open
// for the rest of the cycle, because every one of them already refuses to run
// twice. These tests are the arithmetic — Monday-first weeks are easy to get
// off by one, and the failure would be silent (a cycle simply skipped).
import test from 'node:test';
import assert from 'node:assert/strict';

const { weeklyWindowOpen, monthlyWindowOpen } = await import('../lib/cadence.js');

// 2026-08-31 is a Monday, so this week runs Mon 31 Aug → Sun 6 Sep.
const at = (day, hour = 12) => new Date(2026, 7, 30 + day, hour); // day 1 = Mon 31 Aug

test('the window opens on the day, at the hour — not before', () => {
  const thursday = { day: 4, hour: 17 };
  assert.equal(weeklyWindowOpen(at(4, 16), thursday), false, 'Thursday 16:00 is too early');
  assert.equal(weeklyWindowOpen(at(4, 17), thursday), true, 'Thursday 17:00 opens it');
  assert.equal(weeklyWindowOpen(at(3, 23), thursday), false, 'Wednesday night is not Thursday');
});

test('a slept Mac catches up for the rest of the week', () => {
  const thursday = { day: 4, hour: 17 };
  for (const [day, name] of [[5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']]) {
    assert.equal(weeklyWindowOpen(at(day, 9), thursday), true, `${name} still catches the missed Thursday`);
  }
});

test('the window closes when the week rolls over — never the next week', () => {
  // the following Monday: a new week, whose own guard has not been satisfied
  assert.equal(weeklyWindowOpen(at(8, 9), { day: 4, hour: 17 }), false,
    'next Monday is a new week, not a late Thursday');
});

test('Sunday is the END of a Monday-first week, not the start', () => {
  // read-next and the program audit open on Monday and stay open all week
  const monday = { day: 1 };
  assert.equal(weeklyWindowOpen(at(1, 0), monday), true, 'Monday 00:00 opens it');
  assert.equal(weeklyWindowOpen(at(7, 23), monday), true, 'Sunday night is still the same week');
  // the distiller opens Saturday, so only Saturday and Sunday qualify
  const saturday = { day: 6, hour: 9 };
  assert.equal(weeklyWindowOpen(at(5, 23), saturday), false, 'Friday is before Saturday');
  assert.equal(weeklyWindowOpen(at(7, 1), saturday), true, 'Sunday catches a slept Saturday');
});

test('the monthly window opens on the 1st and stays open all month', () => {
  assert.equal(monthlyWindowOpen(new Date(2026, 8, 1, 0)), true, 'the 1st itself');
  assert.equal(monthlyWindowOpen(new Date(2026, 8, 3)), true, 'a slept 1st no longer costs the month');
  assert.equal(monthlyWindowOpen(new Date(2026, 8, 28)), true);
  assert.equal(monthlyWindowOpen(new Date(2026, 8, 2), { dayOfMonth: 5 }), false, 'not due yet');
});

// ---- the Sunday-evening lanes catch up on Monday morning, keyed to the week that ended ----
test('sundayCatchUpOpen: Sunday from the hour, Monday before noon, nothing else; weekOfSundayRun keys a Monday run to LAST week', async () => {
  const { sundayCatchUpOpen, weekOfSundayRun } = await import('../lib/cadence.js');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(sundayCatchUpOpen(new Date('2026-09-06T17:59:00'), { hour: 18 }), false, 'Sunday before the hour');
  assert.equal(sundayCatchUpOpen(new Date('2026-09-06T18:00:00'), { hour: 18 }), true);
  assert.equal(sundayCatchUpOpen(new Date('2026-09-07T09:00:00'), { hour: 18 }), true, 'Monday morning catches up');
  assert.equal(sundayCatchUpOpen(new Date('2026-09-07T12:00:00'), { hour: 18 }), false, 'by Monday noon the moment has passed');
  assert.equal(sundayCatchUpOpen(new Date('2026-09-05T20:00:00'), { hour: 18 }), false, 'Saturday is not Sunday');
  assert.equal(iso(weekOfSundayRun(new Date('2026-09-06T18:30:00'))), '2026-08-31', 'a Sunday run is for its own week');
  assert.equal(iso(weekOfSundayRun(new Date('2026-09-07T09:00:00'))), '2026-08-31', 'a Monday catch-up is for the week that ended last night');
  assert.equal(iso(weekOfSundayRun(new Date('2026-09-09T09:00:00'))), '2026-09-07', 'any other day is its own week');
});
