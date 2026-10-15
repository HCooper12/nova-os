// THE WEEK IN MUSCLE SETS (16 Oct 2026). His approved "weekly muscle sets"
// sheet (round 4 mockup): for every muscle, what this week has already done
// and where the rest of the week's plan lands it by Sunday, against the
// growth range, with every exercise behind the number.
//
// One pure model, read by the sheet and Coach. Per muscle:
//   focusDone / accDone        SETS logged this ISO week where the muscle is
//                              the lift's focus (counts 1) or an accessory (½)
//   focusPlanned / accPlanned  SETS the rest of this week's plan still holds
//   done, bySunday             the credited totals (focus + ½ accessory)
//   low, high, goal            its growth range and whether his goal names it
//   lines                      every (day, exercise) that adds to it, done and
//                              planned; their `value`s sum EXACTLY to bySunday
// and per day: the routine, its status, and the focus / accessory sets each
// muscle gets from it.
//
// The rules, each one a promise the tests pin (server/test/muscleWeek.test.js):
//   * Credit comes ONLY from creditsFor (src/muscleCredit.js): 1 to the
//     lift's primary, ½ to each audited secondary, nothing for an unaudited
//     lift (its sets are gathered in `uncounted`, said, never hidden) or a
//     non-volume filing (Mobility, Full Body, Grip never appear).
//   * Done is logged working sets (isWorkingSet) in this ISO week, plus the
//     ticked sets of the session in progress. A session filed twice (same
//     day, same routine, same sets) counts once and says so (`dup`).
//   * Planned is what is left: today's routine minus what is already logged
//     today, then each later day's routine in full. Nothing counts twice:
//     a routine already filed today plans nothing more, and a routine pulled
//     forward earlier in the week is not planned again on its own day.
//   * A make-up he planned for a day (a 'day' carry-over) is that day's plan,
//     as everywhere else (lib/makeupDay.js); other carried work waiting on a
//     day still ahead is added to it.

import { mondayIso } from './cadence.js';
import { todayIso } from './makeupDay.js';
import { isWorkingSet } from './trainingAnalytics.js';
import { creditsById, isUnaudited, MUSCLE_GROUPS } from './muscleSecondary.js';
import { rangeFor } from '../../src/muscleTaxonomy.js';

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const ACTIVE_REST = 'active-rest';
const PLANNED_AS_DAY = 'day';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return todayIso(d);
};

// a make-up session names the routine it finished
const makeupName = (s) => {
  const src = s.sourceRoutineName || String(s.routineName || '').replace(/\s*[—-]\s*make-?up$/i, '');
  return `${src || 'Session'} make-up`;
};
const isMakeupSession = (s) => s.routineId === 'carryover' || !!s.sourceRoutineName || /make-?up$/i.test(String(s.routineName || ''));

// two filings of the same workout: same day, same routine, the same sets
const sessionSig = (s) => JSON.stringify([s.date, s.routineId || s.routineName || '',
  (s.exercises || []).map((e) => [e.exerciseId, (e.sets || []).filter(isWorkingSet).map((x) => [Number(x.weight) || 0, Number(x.reps) || 0])])]);

/**
 * @param routines    loadRoutines(...).routines
 * @param schedule    weekday → routine id ('active-rest' or absent = rest)
 * @param sessions    filed sessions (any span; only this ISO week's are read)
 * @param live        the in-progress workoutSession from the draft, or null
 * @param exercises   the exercise library (resolved: audit status, muscles)
 * @param goalMuscles the muscles his goal names (any order; drawn in the body's order)
 * @param ranges      his goal's per-muscle overrides { muscle: [low, high] }
 * @param carryovers  carry-over rows (lib/workoutCarryover.js)
 * @param now         the clock
 */
export function muscleWeek({ routines = [], schedule = {}, sessions = [], live = null, exercises = [], goalMuscles = [], ranges = null, carryovers = [], now = new Date() } = {}) {
  const today = todayIso(now);
  const start = mondayIso(now);
  const dates = WEEK_DAYS.map((_, i) => addDays(start, i));
  const sunday = dates[6];
  const dayOf = (iso) => WEEK_DAYS[dates.indexOf(iso)];

  const creditsOf = creditsById(exercises);
  const known = new Map(exercises.map((e) => [e.id, e]));
  const routineById = new Map(routines.map((r) => [r.id, r]));
  const uncounted = { sets: 0, planned: 0, lifts: [] };
  const leaveOut = (exerciseId, name, sets, kind) => {
    uncounted[kind === 'done' ? 'sets' : 'planned'] += sets;
    let l = uncounted.lifts.find((x) => x.exerciseId === exerciseId);
    if (!l) uncounted.lifts.push(l = { exerciseId, name, sets: 0, planned: 0 });
    l[kind === 'done' ? 'sets' : 'planned'] += sets;
  };
  // where one exercise's sets land, or null when they count for no muscle
  // because nobody has audited it (said in `uncounted`); [] for a lift that
  // is not volume at all (Mobility, Full Body, Grip), which is simply silent
  const creditsFor = (exerciseId) => {
    const e = known.get(exerciseId);
    if (!e || isUnaudited(e)) return null; // not in the library: nobody audited it either
    return creditsOf.get(exerciseId) || [];
  };

  // ---------------------------------------------------------------- done --
  const entries = []; // one per (date, workout): { date, routineId, routine, status, makeup, dup, exercises: [{ exerciseId, name, done, planned }] }
  const entryFor = (date, key, init) => {
    let e = entries.find((x) => x.date === date && x.key === key);
    if (!e) entries.push(e = { date, key, dup: false, exercises: [], ...init });
    return e;
  };
  const addEx = (entry, exerciseId, name, field, n) => {
    if (!n) return;
    let x = entry.exercises.find((y) => y.exerciseId === exerciseId);
    if (!x) entry.exercises.push(x = { exerciseId, name, done: 0, planned: 0 });
    x[field] += n;
  };

  const seen = new Map();
  const filed = sessions
    .filter((s) => s?.date && s.date >= start && s.date <= sunday)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
  const loggedToday = new Map(); // exerciseId → working sets logged today (the pool today's plan is net of)
  const filedRoutine = new Map(); // routineId → dates it was filed this week (not make-ups)
  for (const s of filed) {
    const sig = sessionSig(s);
    if (seen.has(sig)) { seen.get(sig).dup = true; continue; }
    const makeup = isMakeupSession(s);
    const key = makeup ? `makeup:${s.sourceRoutineId || s.sourceRoutineName || s.routineName}` : `r:${s.routineId || s.routineName}`;
    const entry = entryFor(s.date, key, {
      routineId: makeup ? null : s.routineId || null,
      routine: makeup ? makeupName(s) : s.routineName || 'Session',
      makeup,
    });
    seen.set(sig, entry);
    if (!makeup && s.routineId) filedRoutine.set(s.routineId, [...(filedRoutine.get(s.routineId) || []), s.date]);
    for (const ex of s.exercises || []) {
      const n = (ex.sets || []).filter(isWorkingSet).length;
      addEx(entry, ex.exerciseId, ex.name || known.get(ex.exerciseId)?.name || ex.exerciseId, 'done', n);
      if (s.date === today) loggedToday.set(ex.exerciseId, (loggedToday.get(ex.exerciseId) || 0) + n);
    }
  }
  // the session he is in right now: its ticked working sets, dated today
  if (live?.exercises?.length) {
    const r = routineById.get(live.routineId);
    const entry = entryFor(today, r ? `r:${r.id}` : `live:${live.routineName || 'Session'}`, {
      routineId: r?.id || null, routine: r?.name || live.routineName || 'Session', makeup: false,
    });
    entry.live = true;
    for (const ex of live.exercises) {
      const n = (ex.sets || []).filter((x) => x.done && isWorkingSet(x)).length;
      addEx(entry, ex.exerciseId, ex.name || known.get(ex.exerciseId)?.name || ex.exerciseId, 'done', n);
      if (n) loggedToday.set(ex.exerciseId, (loggedToday.get(ex.exerciseId) || 0) + n);
    }
  }

  // ------------------------------------------------------------- planned --
  // a 'day' make-up replaces that day's routine; other carried work for a
  // day still ahead is added to it
  const ahead = (carryovers || []).filter((c) => c?.forDate && c.forDate >= today && c.forDate <= sunday);
  const dayMakeup = new Map(ahead.filter((c) => c.plannedAs === PLANNED_AS_DAY).map((c) => [c.forDate, c]));
  // how many scheduled occurrences of a routine are left to plan this week:
  // a routine filed on a day it was not scheduled was pulled forward, and
  // takes one later occurrence with it
  const scheduledOn = (id) => dates.filter((d) => schedule?.[dayOf(d)] === id);
  const pulledForward = new Map();
  for (const [id, filedDates] of filedRoutine) {
    const own = new Set(scheduledOn(id));
    pulledForward.set(id, filedDates.filter((d) => !own.has(d)).length);
  }

  // a past day whose routine was neither filed on it, nor anywhere else this
  // week, nor made up, is a day missed: drawn, quiet, adding nothing
  const madeUp = new Set(entries.filter((e) => e.makeup).map((e) => e.key));
  for (const date of dates) {
    if (date >= today) break;
    const id = schedule?.[dayOf(date)];
    const r = id && id !== ACTIVE_REST ? routineById.get(id) : null;
    if (!r || filedRoutine.has(r.id) || madeUp.has(`makeup:${r.id}`) || madeUp.has(`makeup:${r.name}`)) continue;
    entryFor(date, `r:${r.id}`, { routineId: r.id, routine: r.name, makeup: false, missed: true });
  }

  for (const date of dates) {
    if (date < today) continue;
    const day = dayOf(date);
    const plans = [];
    const mk = dayMakeup.get(date);
    if (mk) plans.push({ key: `makeup:${mk.sourceRoutineId || mk.sourceRoutineName}`, routine: `${mk.sourceRoutineName || 'Session'} make-up`, routineId: null, makeup: true, exercises: mk.exercises || [] });
    else {
      const id = schedule?.[day];
      const r = id && id !== ACTIVE_REST ? routineById.get(id) : null;
      if (r) {
        const doneToday = date === today && (filedRoutine.get(r.id) || []).includes(today);
        const pulled = pulledForward.get(r.id) || 0;
        if (pulled > 0 && !doneToday) pulledForward.set(r.id, pulled - 1); // already done earlier this week
        else if (!doneToday) plans.push({ key: `r:${r.id}`, routine: r.name, routineId: r.id, makeup: false, exercises: r.exercises || [] });
        else entryFor(date, `r:${r.id}`, { routineId: r.id, routine: r.name, makeup: false }); // filed today: done, nothing more planned
      }
    }
    for (const c of ahead.filter((x) => x.forDate === date && x.plannedAs !== PLANNED_AS_DAY)) {
      plans.push({ key: `makeup:${c.sourceRoutineId || c.sourceRoutineName}`, routine: `${c.sourceRoutineName || 'Session'} make-up`, routineId: null, makeup: true, exercises: c.exercises || [] });
    }
    for (const p of plans) {
      const entry = entryFor(date, p.key, { routineId: p.routineId, routine: p.routine, makeup: p.makeup });
      for (const ex of p.exercises) {
        let want = Number(ex.targetSets) || 0;
        if (date === today) {
          // net of what is already logged today, so nothing counts twice
          const have = loggedToday.get(ex.exerciseId) || 0;
          const used = Math.min(have, want);
          loggedToday.set(ex.exerciseId, have - used);
          want -= used;
        }
        addEx(entry, ex.exerciseId, ex.name || known.get(ex.exerciseId)?.name || ex.exerciseId, 'planned', want);
      }
    }
  }

  // ---------------------------------------------------------- the muscles --
  const muscles = new Map();
  const rowFor = (m) => {
    if (!muscles.has(m)) {
      const [low, high] = rangeFor(m, ranges);
      muscles.set(m, { muscle: m, goal: false, low, high, focusDone: 0, accDone: 0, focusPlanned: 0, accPlanned: 0, done: 0, bySunday: 0, lines: [] });
    }
    return muscles.get(m);
  };
  const order = (iso) => dates.indexOf(iso);
  entries.sort((a, b) => order(a.date) - order(b.date));
  const days = [];
  for (const e of entries) {
    const status = e.missed ? 'missed' : e.date < today ? 'done' : e.date > today ? 'planned'
      : e.exercises.some((x) => x.planned > 0) || e.live ? 'today' : 'done';
    const card = {
      date: e.date, day: dayOf(e.date), short: SHORT[dayOf(e.date)], routine: e.routine, routineId: e.routineId,
      makeup: !!e.makeup, dup: !!e.dup, status, isToday: e.date === today, focus: {}, accessory: {},
    };
    for (const x of e.exercises) {
      const credits = creditsFor(x.exerciseId);
      if (credits === null) {
        if (x.done) leaveOut(x.exerciseId, x.name, x.done, 'done');
        if (x.planned) leaveOut(x.exerciseId, x.name, x.planned, 'planned');
        continue;
      }
      for (const { muscle, credit } of credits) {
        const r = rowFor(muscle);
        const focus = credit >= 1;
        const base = { day: card.day, short: card.short, date: e.date, routine: e.routine, exercise: x.name, exerciseId: x.exerciseId, credit };
        if (x.done) {
          r.lines.push({ ...base, sets: x.done, value: x.done * credit, status: 'done' });
          if (focus) r.focusDone += x.done; else r.accDone += x.done;
        }
        if (x.planned) {
          r.lines.push({ ...base, sets: x.planned, value: x.planned * credit, status: e.date === today ? 'today' : 'planned' });
          if (focus) r.focusPlanned += x.planned; else r.accPlanned += x.planned;
        }
        const bucket = focus ? card.focus : card.accessory;
        bucket[muscle] = (bucket[muscle] || 0) + x.done + x.planned;
      }
    }
    // a scheduled day with nothing that counts (a grip-only make-up) still
    // happened; a past day is only drawn when something was filed on it
    days.push(card);
  }

  const goals = new Set((goalMuscles || []).filter((m) => MUSCLE_GROUPS.includes(m)));
  for (const m of goals) rowFor(m).goal = true; // a goal muscle the week never trains still shows: absence is the finding
  const body = (m) => { const i = MUSCLE_GROUPS.indexOf(m); return i < 0 ? 99 : i; };
  for (const r of muscles.values()) {
    r.done = r.focusDone + r.accDone / 2;
    r.bySunday = r.done + r.focusPlanned + r.accPlanned / 2;
  }
  const list = [...muscles.values()];
  const goalRows = list.filter((r) => r.goal).sort((a, b) => body(a.muscle) - body(b.muscle));
  const rest = list.filter((r) => !r.goal).sort((a, b) => b.bySunday - a.bySunday || body(a.muscle) - body(b.muscle));

  return {
    start, end: sunday, today,
    goalMuscles: goalRows.map((r) => r.muscle),
    muscles: [...goalRows, ...rest],
    days,
    uncounted,
  };
}
