// THE TRAIN PAGE'S FACTS (redesign round 1, variation A — his pick, 27 Sep
// 2026, design/mockups/58-redesign-train.html). Under the `summary` style
// Train is one page: the hero, the week as seven dots, a Coach row, the
// routines, Quick session and Hard sets, then Momentum. These are the pure
// halves of three of those objects, so what they say is code's, tested in
// server/test/trainSummary.test.js, and never a model's:
//
//   weekDots      the week strip as seven dots and the one line under it
//                 ("Legs Thursday, then rest")
//   coachWaiting  the Coach row: how many changes wait on him, and the first
//   hardSetsRing  the Hard sets half card: one ring of muscle segments, each
//                 owning its share of the week's target in its own hue
//
// Nothing here reads the clock unless it is handed one, and nothing reads
// the DOM: muscleVar only names a token.

import { muscleVar } from './muscleHue.js';

export const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const LETTER = { monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S', sunday: 'S' };
const LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

// 'monday', a Date, or an ISO date → 'monday'. Anything else → null.
export function weekdayOf(x) {
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : WEEK[(x.getDay() + 6) % 7];
  const s = String(x ?? '').trim().toLowerCase();
  if (WEEK.includes(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : WEEK[(d.getDay() + 6) % 7];
}

const nameOf = (v) => {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : v.name;
  return s && String(s).trim() ? String(s).trim() : null;
};

/**
 * The week as seven dots, Monday first.
 *
 * @param schedule         { monday: 'Pull day' | { name } | null, … } — a
 *                         name is a session; null, '' or absent is rest
 * @param sessionsThisWeek the days this week that hold logged work, as
 *                         weekday names or ISO dates
 * @param today            a Date, an ISO date or a weekday name
 * @returns { dots: [{ day, letter, label, state, routine, isToday }], line }
 *
 * state: 'done' (work was logged), 'today' (today's session, not yet done),
 * 'planned' (a session still ahead), 'missed' (a past session day with
 * nothing logged: said plainly rather than drawn as if it were still to
 * come), 'rest'.
 */
export function weekDots(schedule = {}, sessionsThisWeek = [], today = new Date()) {
  const ti = WEEK.indexOf(weekdayOf(today));
  const logged = new Set((sessionsThisWeek || []).map(weekdayOf).filter(Boolean));
  const dots = WEEK.map((day, i) => {
    const routine = nameOf(schedule?.[day]);
    const isToday = i === ti;
    // a day still ahead cannot hold logged work, whatever the input says
    const done = logged.has(day) && (ti < 0 || i <= ti);
    let state;
    if (done) state = 'done';
    else if (!routine) state = 'rest';
    else if (isToday) state = 'today';
    else if (ti >= 0 && i < ti) state = 'missed';
    else state = 'planned';
    return { day, letter: LETTER[day], label: LABEL[day], state, routine, isToday };
  });
  return { dots, line: weekLine(dots, ti) };
}

// What comes next, after today: the next session and what follows it.
function weekLine(dots, ti) {
  if (ti < 0) return null;
  const ahead = dots.slice(ti + 1);
  if (!ahead.length) return 'The week ends today';
  const k = ahead.findIndex((d) => d.routine);
  if (k < 0) return 'Rest for the rest of the week';
  const next = ahead[k];
  const after = ahead[k + 1];
  const tail = !after ? '' : after.routine ? `, then ${after.routine} ${after.label}` : ', then rest';
  return `${next.routine} ${next.label}${tail}`;
}

/**
 * The days this week that hold logged work, read off the planned week the
 * overview already carries (server/lib/plannedWeek.js: every slot and every
 * off-plan lift records the weekdays it was done on). Today counts only once
 * a session is FILED today — the draft of one in progress also folds into
 * the week, and a parked session is not a done day.
 */
export function trainedDays(week, doneToday = null, today = new Date()) {
  const todayKey = weekdayOf(today);
  const out = new Set();
  for (const m of week?.muscles || []) {
    for (const s of m.exercises || []) for (const d of s.doneOn || []) out.add(d);
    for (const e of m.extras || []) for (const d of e.doneOn || []) out.add(d);
  }
  out.delete(todayKey);
  if (doneToday?.sessions?.length && todayKey) out.add(todayKey);
  return WEEK.filter((d) => out.has(d));
}

/**
 * The Coach row: how many of the deck's cards are still waiting on him, and
 * the first one's headline. A card being answered, or folding away, is not
 * waiting.
 */
export function coachWaiting(cards = []) {
  const waiting = (cards || []).filter((c) => c && (!c.state || c.state === 'open' || c.state === 'discussing' || c.state === 'error'));
  return { count: waiting.length, headline: waiting[0]?.headline || null };
}

/**
 * The week's hard sets as one ring: a segment per muscle, sized by its share
 * of the summed target, filled as far as it is done (never past its own
 * share, so an over-served muscle cannot paint over its neighbour).
 *
 * @param volume  overview.volume — [{ muscle, sets, target, goalMuscle }]
 * @param opts.shortMuscles  when the planned week exists, the muscles it
 *                 says cannot reach target by Sunday; a goal muscle under
 *                 target today but covered by the plan is not "short"
 * @returns null when there is nothing to draw
 */
export function hardSetsRing(volume, { shortMuscles = null } = {}) {
  const rows = (Array.isArray(volume) ? volume : [])
    .filter((v) => v && v.muscle && Number(v.target) > 0)
    .map((v) => ({ muscle: String(v.muscle), sets: Math.max(0, Number(v.sets) || 0), target: Number(v.target), goal: !!v.goalMuscle }));
  if (!rows.length) return null;
  const target = rows.reduce((n, r) => n + r.target, 0);
  const done = rows.reduce((n, r) => n + r.sets, 0);
  const met = rows.reduce((n, r) => n + Math.min(r.sets, r.target), 0);
  const shortSet = shortMuscles ? new Set(shortMuscles) : null;
  const short = rows.filter((r) => r.goal && r.sets < r.target && (!shortSet || shortSet.has(r.muscle))).map((r) => r.muscle);
  return {
    done,
    target,
    pct: Math.min(100, Math.round((met / target) * 100)),
    segments: rows.map((r) => ({
      muscle: r.muscle, hue: muscleVar(r.muscle), sets: r.sets, target: r.target, goal: r.goal,
      share: r.target / target,
      fill: Math.min(1, r.sets / r.target),
    })),
    short,
  };
}

/**
 * The reason a ✕ on a Coach card carries to the record (the Inbox's own
 * discard-with-reason path): the chip he picked, a line of his own, or both.
 * Undefined when he gave neither — a no without a reason is still his to
 * give, and an empty string is not a reason.
 */
export function declineReason(picked, text) {
  const p = String(picked || '').trim();
  const t = String(text || '').trim();
  if (p && t) return `${p}: ${t}`;
  return p || t || undefined;
}
