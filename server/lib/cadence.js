// WHEN A WEEKLY AGENT MAY RUN — the slept-Mac fix.
//
// Weekly and monthly agents used to fire on their exact day and no other:
// meal prep on Thursday, the program audit and read-next on Monday, the
// distiller on Saturday, the CFO on the 1st. The Mac is a laptop that sleeps,
// so missing that one window cost the whole cycle — a slept 1st cost a
// month's money report, and nothing anywhere said a run had been missed.
//
// The fix is not a cleverer clock. Every one of these agents ALREADY refuses
// to run twice in a cycle — recordExistsThisWeek, auditedThisWeek,
// reportExistsThisMonth, the weekly model-choice card, read-next's
// single-open-proposal rule — so the target day never needed to be the only
// day. The window opens at the target moment and stays open for the rest of
// the cycle; the agent's own guard makes every extra attempt a no-op. This is
// how Compost has always worked ("run when older than the cadence, tick
// daily"), and why it is the one weekly loop a sleeping Mac cannot skip.
//
// NOT applied to the week plan: it composes for `nextMonday(now)`, so running
// it on Monday would draft the FOLLOWING week and silently skip the current
// one. Widening that needs its week semantics changed first — a deliberate
// change, not a scheduling tweak.

// Monday-first position (Mon=0 … Sun=6), matching the mondayOf week keys the
// rest of the platform files records under. A window that opens on Thursday
// therefore stays open Friday, Saturday and Sunday — and closes when the
// week the guard keys on rolls over, which is exactly the intent.
const weekPos = (d) => (d.getDay() + 6) % 7;

// `day` is a JS getDay() value (0 = Sunday) so call sites read like the code
// they replace.
export function weeklyWindowOpen(now, { day, hour = 0 }) {
  const target = weekPos({ getDay: () => day });
  const pos = weekPos(now);
  if (pos > target) return true;   // later in the same week — catching up
  if (pos < target) return false;  // not due yet
  return now.getHours() >= hour;   // the day itself, once the hour arrives
}

// The monthly equivalent. The CFO reports on the month that just closed, so a
// run on the 3rd produces exactly the report the 1st would have.
export function monthlyWindowOpen(now, { dayOfMonth = 1, hour = 0 } = {}) {
  if (now.getDate() > dayOfMonth) return true;
  if (now.getDate() < dayOfMonth) return false;
  return now.getHours() >= hour;
}
