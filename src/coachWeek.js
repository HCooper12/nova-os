// WHAT THE COACH IS READING THIS WEEK — the week's volume instrument, small,
// for the Coach tab's empty log (finding 8, 22 Sep: "600px of void under the
// composer"). The same rows TrainToday draws (overview.volume: sets against a
// goal-aware target per muscle), goal muscles first, capped so it is a glance
// and not a table. Pure; null when there is no volume to show, so the screen
// says nothing rather than drawing an empty instrument.
export function coachWeekRows(volume, { cap = 5 } = {}) {
  const rows = Array.isArray(volume) ? volume.filter((v) => v && v.muscle && Number.isFinite(Number(v.target)) && Number(v.target) > 0) : [];
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => (b.goalMuscle ? 1 : 0) - (a.goalMuscle ? 1 : 0) || (b.sets / b.target) - (a.sets / a.target) || String(a.muscle).localeCompare(String(b.muscle)));
  const shown = sorted.slice(0, cap).map((v) => ({
    muscle: String(v.muscle),
    sets: Number(v.sets) || 0,
    target: Number(v.target),
    pct: Math.max(0, Math.min(100, Math.round(((Number(v.sets) || 0) / Number(v.target)) * 100))),
    goal: !!v.goalMuscle,
    short: !!v.goalMuscle && (Number(v.sets) || 0) < Number(v.target),
  }));
  const goals = rows.filter((v) => v.goalMuscle);
  const done = goals.reduce((n, v) => n + (Number(v.sets) || 0), 0);
  const want = goals.reduce((n, v) => n + Number(v.target), 0);
  return {
    rows: shown,
    line: goals.length
      ? `${done} of ${want} sets on your goal muscles this week`
      : `${rows.reduce((n, v) => n + (Number(v.sets) || 0), 0)} sets this week`,
    more: Math.max(0, rows.length - shown.length),
  };
}
