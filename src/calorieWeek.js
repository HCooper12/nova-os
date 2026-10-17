// HIS CALORIES, THE WEEK ALONGSIDE THE DAY (17 Oct 2026). "I want to be able
// to view and track my weekly calories alongside the daily ones." The week is
// Monday to Sunday (his week), the budget is seven days of his daily target,
// and every number is arithmetic over the days he actually logged: a day with
// no log is a gap, said as a gap, never counted as zero eaten (that would
// flatter the total). `days` is loadCalendarDays's shape, oldest first, and
// must reach back at least to this week's Monday (the last seven days do).
//
// Pure: no I/O, no clock. The server builds it for the nutrition-week panel
// and the Fuel page reads it from there.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function weekStartOf(today) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export function calorieWeek(days, { targetKcal = null, today } = {}) {
  if (!today) return null;
  const start = weekStartOf(today);
  const byDate = new Map((days || []).map((d) => [d.date, d]));
  const target = Number(targetKcal) > 0 ? Math.round(Number(targetKcal)) : null;
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + i);
    const date = iso(d);
    const raw = byDate.get(date)?.kcal;
    const kcal = Number.isFinite(Number(raw)) && raw != null ? Math.round(Number(raw)) : null;
    const state = date > today ? 'future' : date === today ? 'today' : kcal != null ? 'logged' : 'gap';
    out.push({ date, letter: LETTERS[i], kcal, state });
  }
  const counted = out.filter((d) => d.state !== 'future' && d.kcal != null);
  const eaten = counted.reduce((s, d) => s + d.kcal, 0);
  const before = out.filter((d) => d.state === 'logged').reduce((s, d) => s + d.kcal, 0);
  const remainingDays = out.filter((d) => d.state === 'future' || d.state === 'today').length;
  const budget = target ? target * 7 : null;
  // what the rest of the week allows per day, today included, from what had
  // been eaten BEFORE today (today's own log is what the day card is for)
  const perDay = budget != null && remainingDays > 0 ? Math.max(0, Math.round((budget - before) / remainingDays)) : null;
  return {
    start, days: out, target, budget, eaten,
    left: budget != null ? Math.max(0, budget - eaten) : null,
    over: budget != null ? Math.max(0, eaten - budget) : null,
    pct: budget != null ? Math.round(Math.min(1, eaten / budget) * 100) : null,
    loggedDays: counted.length,
    gaps: out.filter((d) => d.state === 'gap').length,
    remainingDays,
    perDay,
    avg: counted.length ? Math.round(eaten / counted.length) : null,
  };
}
