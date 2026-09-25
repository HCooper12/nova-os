// THE PLANNED WEEK, SHAPED FOR THE SHEET (25 Sep 2026). Pure: the overview's
// `week` (server/lib/plannedWeek.js) in, everything the sheet draws out, so
// the sentence and every set's state are tested without a browser
// (server/test/weekSets.test.js).
//
// A SET IS THE UNIT. Every planned set is one pip in one of four states,
// and a set he did that the plan never asked for is a fifth, drawn as a
// different SHAPE, because it is a different kind of fact:
//   done   filled in the muscle's hue
//   live   ticked in the session he is in right now (gold, as on the bars)
//   due    still to come this week (an outline in the hue)
//   missed its day has passed and it was not done (a dashed hole)
//   extra  done, but not in the plan (a diamond)

const SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const FULL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

const lower = (m) => String(m || '').toLowerCase();
const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// one exercise's pips: its planned sets in order, done ones first; sets done
// beyond the plan are still done sets and still drawn
export function slotPips(slot, day) {
  const n = Math.max(slot.planned || 0, slot.done || 0);
  const liveFrom = (slot.done || 0) - (slot.live || 0);
  return Array.from({ length: n }, (_, i) => {
    if (i < (slot.done || 0)) return i >= liveFrom ? 'live' : 'done';
    return day?.isPast ? 'missed' : 'due';
  });
}

function prescription(slot) {
  const { low, high } = slot.reps || {};
  const timed = /time/.test(slot.trackingType || '');
  const reps = low == null ? '' : high != null && high !== low ? `${low}–${high}` : `${low}`;
  return reps ? `${slot.planned} × ${reps}${timed ? ' s' : ''}` : `${slot.planned} sets`;
}

// what a row says about itself, beside its pips; silent when the pips say it
function slotStatus(slot, day) {
  const short = slot.planned - slot.done;
  if (slot.live > 0) return { text: 'in progress', tone: 'gold' };
  if (slot.done > slot.planned) return { text: `+${slot.done - slot.planned} over`, tone: 'good' };
  if (short <= 0) {
    const elsewhere = (slot.doneOn || []).filter((d) => d !== slot.day);
    return elsewhere.length && !(slot.doneOn || []).includes(slot.day)
      ? { text: `done ${elsewhere.map((d) => SHORT[d]).join(', ')}`, tone: 'quiet' }
      : null;
  }
  if (day?.isPast) return { text: slot.done ? `${short} not done` : 'not done', tone: 'faint' };
  if (day?.isToday) return { text: 'today', tone: 'cyan' };
  return null;
}

// "Upper Body today and Leg Day tomorrow" — the sessions still to come that
// still hold planned sets, named the way he would say them
function comingUp(days, slotsByDay) {
  const ahead = days.filter((d) => !d.isPast && !d.rest && (slotsByDay[d.day] || []).some((s) => s.planned > s.done));
  const todayIdx = days.findIndex((d) => d.isToday);
  const when = (d) => {
    const i = days.indexOf(d);
    if (d.isToday) return 'today';
    if (todayIdx >= 0 && i === todayIdx + 1) return 'tomorrow';
    return FULL[d.day];
  };
  return ahead.map((d) => `${d.routineName} ${when(d)}`);
}

export function weekSetsView(week) {
  if (!week?.days?.length || !week?.muscles?.length) return null;
  const days = week.days;
  const dayOf = Object.fromEntries(days.map((d) => [d.day, d]));
  const slotsByDay = {};
  for (const m of week.muscles) for (const s of m.exercises) (slotsByDay[s.day] ||= []).push(s);

  const muscles = week.muscles.map((m) => {
    // still to come: planned sets not yet done on today or a later day
    const due = m.exercises.reduce((n, s) => n + (dayOf[s.day]?.isPast ? 0 : Math.max(0, s.planned - s.done)), 0);
    const projected = m.done + due;
    const rows = [
      ...m.exercises.map((s) => ({
        key: `${s.day}:${s.exerciseId}`,
        day: SHORT[s.day], isToday: !!dayOf[s.day]?.isToday,
        name: s.name, routine: s.routineName,
        detail: `${s.routineName} · ${prescription(s)}`,
        pips: slotPips(s, dayOf[s.day]),
        status: slotStatus(s, dayOf[s.day]),
      })),
      ...m.extras.map((e) => ({
        key: `extra:${e.exerciseId}`,
        day: (e.doneOn || []).map((d) => SHORT[d]).join(' '), isToday: false,
        name: e.name, routine: null,
        detail: 'Not in the plan',
        pips: Array.from({ length: e.done }, (_, i) => (i >= e.done - (e.live || 0) ? 'live' : 'extra')),
        status: null,
        extra: true,
      })),
    ];
    // the grid: each day's pips for this muscle, one LINE per exercise so a
    // day's stack reads as its lifts (four to a row blurred three lifts into
    // one clump at 375px); planned slots on their own day, off-plan sets on
    // the day they happened
    const cells = days.map((d) => [
      ...m.exercises.filter((s) => s.day === d.day).map((s) => slotPips(s, d)),
      ...m.extras.filter((e) => e.byDay?.[d.day]).map((e) => Array.from({ length: e.byDay[d.day] }, () => 'extra')),
    ]);
    return {
      muscle: m.muscle,
      id: `wk-${lower(m.muscle).replace(/[^a-z]+/g, '-')}`,
      goal: !!m.goalMuscle, target: m.target,
      done: m.done, planned: m.planned, live: m.live || 0, due, projected,
      // the verdict lives in the number, as on the bars: a goal muscle that
      // cannot reach its target on the plan as written says so
      short: !!m.goalMuscle && projected < m.target,
      unplanned: m.planned === 0,
      pct: m.target ? Math.min(1, m.done / m.target) : 0,
      projectedPct: m.target ? Math.min(1, projected / m.target) : 0,
      rows, cells,
    };
  });

  const done = muscles.reduce((n, m) => n + m.done, 0);
  const planned = muscles.reduce((n, m) => n + m.planned, 0);
  const due = muscles.reduce((n, m) => n + m.due, 0);
  const ahead = comingUp(days, slotsByDay);

  // the news in two parts, so the sheet can set the count as a figure and
  // the rest as the serif line; `headline` joins them for Coach and the reader
  let aheadLine = null;
  if (planned && due && ahead.length) aheadLine = `${listOf(ahead)} ${ahead.length === 1 ? 'holds' : 'hold'} ${due} more.`;
  else if (planned && !due) aheadLine = 'Nothing left on the plan this week.';
  let headline;
  if (!planned) headline = done ? `${done} hard sets logged this week, and no program scheduled to measure them against.` : 'No program is scheduled this week.';
  else headline = `${done} hard ${done === 1 ? 'set' : 'sets'} done this week, against ${planned} planned.${aheadLine ? ` ${aheadLine}` : ''}`;

  // the one loud line: goal muscles the plan cannot carry to target
  const short = muscles.filter((m) => m.short);
  const warn = short.length
    ? short.map((m) => (m.unplanned
      ? `${m.muscle} has nothing planned this week`
      : `${m.muscle} can reach ${m.projected} of ${m.target} this week on the plan as written`)).join('. ') + '.'
    : null;

  // THE CARD'S OWN VERDICT, from the same projection. On a Friday morning
  // the bars called every goal muscle "under target" while Upper Body and
  // Leg Day were still to come, and Coach, asked about it, said it could not
  // see the app's target and counted for itself (his chat, 25 Sep 10:13).
  // Short means short by Sunday on the plan as written, and the question
  // carries the numbers, so the card, the sheet and Coach argue from one set.
  const cta = short.length ? {
    muscles: short.map((m) => m.muscle),
    text: short.length === 1
      ? `${short[0].muscle} can reach ${short[0].projected} of ${short[0].target} by Sunday on the plan as written. Ask Coach how to add sets →`
      : `${listOf(short.map((m) => `${m.muscle} (${m.projected} of ${m.target})`))} fall short by Sunday on the plan as written. Ask Coach how to add sets →`,
    question: `On my plan as written, ${listOf(short.map((m) => lower(m.muscle)))} ${short.length === 1 ? 'finishes' : 'finish'} this week short of target for my goal: ${short.map((m) => `${m.muscle} ${m.done} done + ${m.due} still scheduled = ${m.projected} of ${m.target}`).join('; ')}. How should I add volume?`,
  } : null;

  return {
    cta,
    days: days.map((d) => ({
      key: d.day, short: SHORT[d.day],
      routine: d.rest ? 'Rest' : String(d.routineName || '').split(/\s+/)[0],
      routineFull: d.routineName, rest: d.rest, isToday: d.isToday, isPast: d.isPast,
    })),
    muscles, headline, aheadLine, warn, done, planned, due,
    // talking back is the action (§2b r8): the question arrives with the
    // sheet's own figures, so Coach argues from what he is looking at
    coachQuestion: `Look at my planned week, muscle by muscle. ${headline}${warn ? ` ${warn}` : ''} ${muscles.filter((m) => m.planned || m.goal).map((m) => `${m.muscle}: ${m.done} done, ${m.due} still scheduled, target ${m.target}`).join('; ')}. Is the split right for my goal, and what would you change?`,
  };
}
