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
//
// WHAT ELSE A LIFT TRAINS (15 Oct 2026). A muscle's figures are TOTALS:
// its own sets plus ½ for each set of a lift that also trains it
// (src/muscleCredit.js). The lifts behind the indirect part are listed after
// its own as quieter `also` rows, so the number can always be traced to the
// sets that made it. The week's headline counts SETS (each set once, under
// its own muscle): a bench set is one set he did, not two.

import { formatSets as fmt, INDIRECT_CREDIT, uncountedLine } from './muscleCredit.js';

// UNAUDITED LIFTS, SAID NOT HIDDEN (15 Oct 2026, his standing rule). A lift
// nobody has audited credits no muscle, so its sets are missing from every
// figure above; this is the one line that says how many and on which lifts.
// `u` is the server's { sets, planned?, lifts: [{ name, sets }] }; null when
// nothing was left out.
export function uncountedView(u) {
  const sets = Number(u?.sets) || 0;
  const planned = Number(u?.planned) || 0;
  const lifts = (u?.lifts || []).filter((l) => l?.name);
  if (!sets && !planned) return null;
  const line = sets
    ? uncountedLine(sets)
    : `${planned} planned ${planned === 1 ? 'set' : 'sets'} on unaudited lifts not counted`;
  const names = lifts.map((l) => l.name);
  const listed = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return {
    line,
    lifts: names,
    hint: names.length ? `${listed} ${names.length === 1 ? 'counts' : 'count'} once you approve ${names.length === 1 ? 'its' : 'their'} muscles in your Inbox.` : null,
  };
}

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
    // carried to a make-up still ahead: still to come, never missed
    return day?.isPast && !slot.carriedTo ? 'missed' : 'due';
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
  if (day?.isPast && slot.carriedTo) return { text: `carried to ${SHORT[slot.carriedTo]}`, tone: 'cyan' };
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

// " (6 direct + 6 indirect at ½ so far)": how a total was made, said only
// when some of it came from lifts that also train the muscle
export function breakdown(m) {
  const d = m.direct?.done ?? m.done;
  const i = m.indirect?.done || 0;
  return i ? ` (${fmt(d)} direct + ${fmt(i)} indirect at ½ so far)` : '';
}

export function weekSetsView(week) {
  if (!week?.days?.length || !week?.muscles?.length) return null;
  const days = week.days;
  const dayOf = Object.fromEntries(days.map((d) => [d.day, d]));
  const slotsByDay = {};
  for (const m of week.muscles) for (const s of m.exercises) (slotsByDay[s.day] ||= []).push(s);
  // still to come: planned sets not yet done on today or a later day
  const dueOf = (slots) => slots.reduce((n, s) => n + (s.extra || (dayOf[s.day]?.isPast && !s.carriedTo) ? 0 : Math.max(0, (s.planned || 0) - (s.done || 0))), 0);

  const muscles = week.muscles.map((m) => {
    const also = m.alsoFrom || [];
    const directDue = dueOf(m.exercises);
    const indirectDue = dueOf(also);
    const due = directDue + INDIRECT_CREDIT * indirectDue;
    const projected = m.done + due;
    // a week built before indirect credit has no breakdown: all of it is direct
    const direct = m.direct || { planned: m.planned, done: m.done, live: m.live || 0 };
    const indirect = m.indirect || { planned: 0, done: 0, live: 0 };
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
      // the lifts that also train it, after its own: each set counts ½ here
      ...also.map((a) => ({
        key: `also:${a.extra ? 'extra' : a.day}:${a.exerciseId}`,
        day: a.extra ? (a.doneOn || []).map((d) => SHORT[d]).join(' ') : SHORT[a.day],
        isToday: !a.extra && !!dayOf[a.day]?.isToday,
        name: a.name, routine: a.routineName || null,
        detail: `${a.primary} lift, each set counts ½ here`,
        pips: a.extra
          ? Array.from({ length: a.done }, (_, i) => (i >= a.done - (a.live || 0) ? 'live' : 'extra'))
          : slotPips(a, dayOf[a.day]),
        status: null,
        also: true,
        ...(a.extra ? { extra: true } : {}),
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
      // SETS of each kind behind the totals, for the two-part bar and Coach
      direct: { ...direct, due: directDue }, indirect: { ...indirect, due: indirectDue },
      directPct: m.target ? Math.min(1, direct.done / m.target) : 0,
      // the verdict lives in the number, as on the bars: a goal muscle that
      // cannot reach its target on the plan as written says so
      short: !!m.goalMuscle && projected < m.target,
      unplanned: m.planned === 0,
      pct: m.target ? Math.min(1, m.done / m.target) : 0,
      projectedPct: m.target ? Math.min(1, projected / m.target) : 0,
      rows, cells,
    };
  });

  // the week in SETS: each set once, under its own muscle
  const done = muscles.reduce((n, m) => n + m.direct.done, 0);
  const planned = muscles.reduce((n, m) => n + m.direct.planned, 0);
  const due = muscles.reduce((n, m) => n + m.direct.due, 0);
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
      : `${m.muscle} can reach ${fmt(m.projected)} of ${m.target} this week on the plan as written`)).join('. ') + '.'
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
      ? `${short[0].muscle} can reach ${fmt(short[0].projected)} of ${short[0].target} by Sunday on the plan as written. Ask Coach how to add sets →`
      : `${listOf(short.map((m) => `${m.muscle} (${fmt(m.projected)} of ${m.target})`))} fall short by Sunday on the plan as written. Ask Coach how to add sets →`,
    question: `On my plan as written, ${listOf(short.map((m) => lower(m.muscle)))} ${short.length === 1 ? 'finishes' : 'finish'} this week short of target for my goal: ${short.map((m) => `${m.muscle} ${fmt(m.done)} done + ${fmt(m.due)} still scheduled = ${fmt(m.projected)} of ${m.target}${breakdown(m)}`).join('; ')}. How should I add volume?`,
  } : null;

  return {
    cta,
    days: days.map((d) => ({
      key: d.day, short: SHORT[d.day],
      routine: d.rest ? 'Rest' : String(d.routineName || '').split(/\s+/)[0],
      routineFull: d.routineName, rest: d.rest, isToday: d.isToday, isPast: d.isPast,
    })),
    muscles, headline, aheadLine, warn, done, planned, due,
    uncounted: uncountedView(week.uncounted),
    // said once, under the grid, whenever a past day was read from history:
    // the rows on that day are what he was asked to do then, not now
    historyNote: days.some((d) => d.planAsOf)
      ? `${listOf(days.filter((d) => d.planAsOf).map((d) => FULL[d.day]))} ${days.filter((d) => d.planAsOf).length === 1 ? 'shows' : 'show'} your plan as it stood that day.`
      : null,
    // talking back is the action (§2b r8): the question arrives with the
    // sheet's own figures, so Coach argues from what he is looking at
    coachQuestion: `Look at my planned week, muscle by muscle. ${headline}${warn ? ` ${warn}` : ''} ${muscles.filter((m) => m.planned || m.goal).map((m) => `${m.muscle}: ${fmt(m.done)} done, ${fmt(m.due)} still scheduled, target ${m.target}${breakdown(m)}`).join('; ')}. Is the split right for my goal, and what would you change?`,
  };
}
