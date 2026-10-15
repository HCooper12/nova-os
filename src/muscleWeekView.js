// THE WEEKLY MUSCLE SETS SHEET, AS WORDS AND SHAPES (16 Oct 2026). Pure: the
// overview's `muscleWeek` (server/lib/muscleWeek.js) in, everything the sheet
// draws out, so the headline, every bar segment and every card line are
// tested without a browser (server/test/muscleWeekView.test.js).
//
// The bar is one shared 0 to 25 scale for every muscle, with the growth
// range shaded: solid is focus sets done (each counts 1), striped is
// accessory sets done (each counts ½, so drawn at half their count), and the
// outlined tail is what the rest of this week's plan adds. The number beside
// it is done, then where the plan lands it by Sunday; amber when that is
// short of the range, red when it is past it.

import { formatSets as fmt } from './muscleCredit.js';
import { VOLUME_RANGE, V_TAPER_MUSCLES } from './muscleTaxonomy.js';

export const BAR_MAX = 25;
const pct = (v) => Math.max(0, Math.min(100, (v / BAR_MAX) * 100));
const round = (n) => Math.round(n * 100) / 100;
const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return { d, m: MONTH[m - 1] }; };

// HIS V-TAPER (16 Oct 2026): "shoulders, arms and back for building a
// V-taper physique". The sheet names the group by his goal only when his
// goal muscles are exactly these; otherwise they are his goal muscles.
export const V_TAPER = V_TAPER_MUSCLES;
const isVTaper = (goal) => goal.length === V_TAPER.length && V_TAPER.every((m) => goal.includes(m));

/** The bar's geometry, in % of the shared 0 to 25 scale. */
export function barOf(m) {
  const low = m.low ?? VOLUME_RANGE[0];
  const high = m.high ?? VOLUME_RANGE[1];
  const focus = pct(m.focusDone);
  const acc = pct(m.focusDone + m.accDone / 2) - focus;
  const doneAt = pct(m.done);
  return {
    range: { left: round(pct(low)), width: round(pct(high) - pct(low)) },
    focus: round(focus),
    acc: { left: round(focus), width: round(acc) },
    plan: { left: round(doneAt), width: round(pct(m.bySunday) - doneAt) },
  };
}

/** 'low' when Sunday lands short of the range, 'high' past it, else null. */
export const toneOf = (m) => (m.bySunday < m.low ? 'low' : m.bySunday > m.high ? 'high' : null);

function rowOf(m) {
  return {
    muscle: m.muscle, goal: m.goal, low: m.low, high: m.high,
    done: fmt(m.done), bySunday: fmt(m.bySunday), tone: toneOf(m),
    bar: barOf(m),
    aria: `${m.muscle}: ${fmt(m.done)} sets done, ${fmt(m.bySunday)} by Sunday, range ${m.low} to ${m.high}. Open the exercises.`,
  };
}

/** One muscle's card: its summary, and every line grouped by day, in order. */
export function cardOf(m) {
  const groups = [];
  for (const l of m.lines || []) {
    let g = groups.find((x) => x.date === l.date && x.routine === l.routine);
    if (!g) groups.push(g = { key: `${l.date}:${l.routine}`, date: l.date, short: l.short, routine: l.routine, status: l.status, dup: !!l.dup, items: [] });
    if (l.status !== 'done') g.status = l.status; // a group with anything still to come reads as today / planned
    g.items.push({
      key: `${l.exerciseId}:${l.status}`,
      exercise: l.exercise,
      focus: l.credit >= 1,
      come: l.status !== 'done',
      sets: `${l.sets} ${l.sets === 1 ? 'set' : 'sets'} × ${l.credit >= 1 ? '1' : '½'}`,
      value: fmt(l.value),
    });
  }
  const total = (m.lines || []).reduce((n, l) => n + l.value, 0);
  return {
    muscle: m.muscle,
    done: fmt(m.done), bySunday: fmt(m.bySunday), range: `${m.low}–${m.high}`,
    bar: barOf(m), tone: toneOf(m),
    groups: groups.map((g) => ({ ...g, tag: g.status === 'today' ? 'today' : g.status === 'planned' ? 'planned' : null })),
    total: fmt(total),
    empty: !groups.length,
  };
}

const chipsOf = (o, acc) => Object.entries(o || {})
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([muscle, sets]) => ({ muscle, sets: acc ? fmt(sets / 2) : String(sets), acc }));

export function muscleWeekView(w) {
  if (!w?.muscles) return null;
  const goal = w.goalMuscles || [];
  const vt = isVTaper(goal);
  const group = vt ? 'V-taper muscles' : 'Goal muscles';
  const goalRows = w.muscles.filter((m) => m.goal);
  const short = goalRows.filter((m) => m.bySunday < m.low);
  const lows = [...new Set(short.map((m) => m.low))];
  const s = dm(w.start), e = dm(w.end);
  const span = s.m === e.m ? `Mon ${s.d} – Sun ${e.d} ${e.m}` : `Mon ${s.d} ${s.m} – Sun ${e.d} ${e.m}`;
  const ranges = [...new Set(w.muscles.map((m) => `${m.low}–${m.high}`))];
  return {
    eyebrow: `This week · ${span} · tap a muscle`,
    // the news in one sentence, before a single bar is read
    headline: goalRows.length ? {
      count: `${goalRows.length - short.length} of ${goalRows.length}`,
      rest: `${vt ? 'V-taper' : 'goal'} muscles reach the growth range by Sunday`,
    } : null,
    sub: !goalRows.length ? 'No goal muscles are set, so every muscle is listed by where Sunday lands it.'
      : short.length ? `${listOf(short.map((m) => m.muscle))} ${short.length === 1 ? 'finishes' : 'finish'} short of ${lows.length === 1 ? lows[0] : 'their range'} on this plan.`
        : `Every ${vt ? 'V-taper' : 'goal'} muscle lands in range on this plan.`,
    // the key's range swatch names the shared range; a muscle with its own
    // band (his goal's override) draws it on its own bar
    rangeKey: ranges.length === 1 ? ranges[0] : `${VOLUME_RANGE[0]}–${VOLUME_RANGE[1]}`,
    scale: [0, VOLUME_RANGE[0], VOLUME_RANGE[1]].map((n) => ({ n, at: round(pct(n)) })),
    group,
    goal: goalRows.map(rowOf),
    rest: w.muscles.filter((m) => !m.goal).map(rowOf),
    days: (w.days || []).map((d) => ({
      key: `${d.date}:${d.routine}`,
      short: d.short, routine: d.routine, status: d.status, isToday: !!d.isToday, dup: !!d.dup,
      label: d.status === 'done' ? 'Done' : d.status === 'today' ? 'Today' : d.status === 'missed' ? 'Not logged' : '',
      focus: chipsOf(d.focus, false),
      accessory: chipsOf(d.accessory, true),
    })),
    card: (muscle) => { const m = w.muscles.find((x) => x.muscle === muscle); return m ? cardOf(m) : null; },
    // talking back is the action (§2b r8): the question carries the sheet's own figures
    coachQuestion: `Look at my week in muscle sets. ${goalRows.length ? `${goalRows.length - short.length} of ${goalRows.length} ${vt ? 'V-taper' : 'goal'} muscles reach the growth range by Sunday on my plan.` : ''} ${w.muscles.map((m) => `${m.muscle}: ${fmt(m.done)} done, ${fmt(m.bySunday)} by Sunday (range ${m.low}–${m.high})`).join('; ')}. What would you change?`.replace(/\s+/g, ' ').trim(),
  };
}
