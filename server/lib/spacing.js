// SPACED RESURFACING — the due-date arithmetic, once.
//
// Two engines decide what is due again: the Library's (a fixed widening
// table, 1 · 3 · 7 · 16 · 35 days) and the Leader's (doubling from 3 days,
// capped at 35). The schedules differ on purpose — an idea from a book and a
// leadership concept are not the same cadence — but "when is this next due"
// is one calculation, and it lived twice. Each engine keeps its own picker
// and ranking; both compute the due moment here, and twins.test.js pins both
// schedules so a change to one is a decision, not a drift.

const DAY = 86_400_000;

// nth gap from a fixed table; the last interval repeats forever
export const tableSchedule = (table) => (n) => table[Math.min(Math.max(0, n), table.length - 1)];
// nth gap doubling from a base, capped
export const doublingSchedule = (baseDays, capDays) => (n) => Math.min(baseDays * 2 ** Math.max(0, n), capDays);

// lastAt (ms) + the gap that follows the (timesSeen)th surfacing, in ms
export function nextDueAt(lastAt, timesSeen, schedule) {
  return (lastAt || 0) + schedule(Math.max(0, timesSeen)) * DAY;
}
