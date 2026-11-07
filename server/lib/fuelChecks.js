// DAILY FUEL CHECKS (Athlete AI round two, phase 3, 7 Nov 2026).
//
// The food log stops being a diary and becomes an input to training advice.
// Code decides, a model only words it: this file is pure arithmetic over
// records he already keeps, and returns ranked findings with a ready sentence.
// Nothing here writes, pushes or nudges. The findings ride lines that already
// exist: Coach's fuel context, the morning brief, the weekly review, and (for
// the hard-day check only) the running total after a food log.
//
// Honest by construction: a check that lacks the data it needs stays silent.
// It never guesses a number and never fires on a thin picture.
//
// Every threshold is in FUEL_CHECK_DEFAULTS and his profile can override any of
// them (intake.fuelChecks in Profile.md), so tuning is one place, not a hunt.
// These are NOT the numbers of the 70.3 athlete in the source lesson. Each one
// below was set against Hayden's own records and says why.

/**
 * The tunable numbers, with the reason for each.
 *  - A usual strength session of his is 15 to 20 working sets and about 60 min
 *    on the watch (316 kcal on 6 Nov). So "hard" starts above the usual.
 */
export const FUEL_CHECK_DEFAULTS = Object.freeze({
  // what counts as a hard or long session
  hardMinutes: 75,        // longer than his ~60 min lifting session, and the line for fuelling a session
  hardCardioMinutes: 45,  // a run, ride, swim or hike this long is hard on its own (a walk never is)
  hardKcal: 600,          // watch energy; his usual strength session burns about 320
  hardSets: 22,           // working sets; his usual session is 15 to 20
  // how late is late enough to judge the day's food
  lateHour: 15,           // before 3 pm a low total is just a day not yet eaten
  lateFraction: 0.45,     // from 3 pm, under this share of the target is far under
  veryLateHour: 19,
  veryLateFraction: 0.65, // from 7 pm the bar rises
  // losing too fast (his call, 7 Nov: about 1 kg a week, and not an alarm alone)
  fastKgPerWeek: 1.0,
  fastWindowDays: 21,     // weigh-ins looked at
  fastMinWeighIns: 4,     // the weekly review's own guards
  fastMinSpanDays: 14,
  fastLiftDropShare: 0.05,   // a lift's best estimated 1RM down 5% or more on the 3 weeks before
  fastLiftDropLifts: 2,      // and at least this many lifts, so one off day is not a trend
  fastUnderShare: 0.85,      // a day under 85% of its own target ...
  fastUnderDayShare: 0.6,    // ... on 60% of fully logged days is "eating far under"
  fastMinLoggedDays: 7,
  // fuel for a long session
  sessionFuelMinutes: 75, // only a planned session longer than this
  carbsPerHour: 60,       // grams an hour, from the first half hour on
  carbsFromMinute: 30,
  // a paused deficit
  pauseMaxDays: 7,
});

import { weightSlope, MIN_WEIGHINS, MIN_SPAN_DAYS } from './fuelReview.js';
import { bestE1rm } from './trainingAnalytics.js';

const NUM_KEYS = new Set(Object.keys(FUEL_CHECK_DEFAULTS));

/** The defaults with his own numbers laid over them. Only known, positive numbers are taken. */
export function resolveThresholds(overrides) {
  const out = { ...FUEL_CHECK_DEFAULTS };
  if (overrides && typeof overrides === 'object') {
    for (const [k, v] of Object.entries(overrides)) {
      if (NUM_KEYS.has(k) && Number.isFinite(Number(v)) && Number(v) > 0) out[k] = Number(v);
    }
  }
  return out;
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');
const clock = (h) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);

// ------------------------------------------------------------ 9. hard day --

/**
 * Pure. What about today's training is hard or long, from what Nova really
 * holds: the Apple Watch's minutes and energy, a Nova session's working sets,
 * and the planned routine's sets. Planned minutes are only used when known;
 * a routine has no duration, so none is invented.
 * @returns {{hard:boolean, why:string[]}}
 */
export function hardSession({ planned = null, workouts = [], sessions = [] } = {}, t = FUEL_CHECK_DEFAULTS) {
  const why = [];
  for (const w of workouts || []) {
    const m = Math.round(Number(w.minutes) || 0);
    const kcal = Math.round(Number(w.kcal) || 0);
    if (m >= t.hardMinutes) why.push(`a ${m} minute ${String(w.type || 'workout').toLowerCase()} on the watch`);
    else if (w.cardio && w.cardio !== 'walk' && m >= t.hardCardioMinutes) why.push(`a ${m} minute ${String(w.type || 'cardio').toLowerCase()}`);
    else if (kcal >= t.hardKcal) why.push(`a ${String(w.type || 'workout').toLowerCase()} that burned ${fmt(kcal)} kcal on the watch`);
  }
  for (const s of sessions || []) {
    const sets = Number(s.workingSets) || 0;
    if (sets >= t.hardSets) why.push(`${sets} working sets in ${s.routineName || 'a session'}`);
  }
  if (planned) {
    const m = Number(planned.minutes) || 0;
    const sets = Number(planned.sets) || 0;
    if (m >= t.hardMinutes) why.push(`a planned ${Math.round(m)} minute session`);
    else if (sets >= t.hardSets) why.push(`${sets} planned sets in ${planned.name || 'today\'s session'}`);
  }
  return { hard: why.length > 0, why };
}

/** Pure. Is today's food far enough under the target, this late in the day, to say so? */
export function foodFarUnder({ kcal, targetKcal, hour }, t = FUEL_CHECK_DEFAULTS) {
  const target = Number(targetKcal);
  if (!(target > 0) || !Number.isFinite(hour)) return null; // no target, no judgement
  const bar = hour >= t.veryLateHour ? t.veryLateFraction : hour >= t.lateHour ? t.lateFraction : null;
  if (bar == null) return null; // too early to mean anything
  const eaten = Number(kcal) || 0;
  return eaten < bar * target ? { eaten: Math.round(eaten), target: Math.round(target), bar } : null;
}

function hardDayFinding({ now, planned, workouts, sessions, food, targets }, t) {
  const hard = hardSession({ planned, workouts, sessions }, t);
  if (!hard.hard) return null;
  const under = foodFarUnder({ kcal: food?.totals?.kcal, targetKcal: targets?.kcal, hour: now.getHours() }, t);
  if (!under) return null;
  const hasLogged = (food?.entryCount ?? 1) > 0;
  const proteinBit = Number(targets?.protein) > 0 && Number(food?.totals?.p) >= 0
    ? ` Protein is ${fmt(food.totals.p)} of ${fmt(targets.protein)} g.` : '';
  return {
    key: 'hard-day-underfuelled',
    rank: 1,
    severity: 'high',
    data: { kind: 'hard-day', why: hard.why, eaten: under.eaten, target: under.target, hour: now.getHours() },
    line: `Hard day, and the food is behind: ${hard.why[0]}${hard.why.length > 1 ? ' and more' : ''}, with ${hasLogged ? `${fmt(under.eaten)} of ${fmt(under.target)} kcal logged` : `nothing logged against ${fmt(under.target)} kcal`} by ${clock(now.getHours())}.${proteinBit} A proper meal with carbs and protein soon protects the next session.`,
  };
}

// ------------------------------------------------- 10. losing too fast --

const dayNum = (iso) => Math.round(new Date(`${iso}T12:00:00Z`).getTime() / 86400000);
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Pure. Lifts whose best estimated 1RM over the last three weeks is down on the
 * three weeks before it, from the same e1RM the Coach's analytics use. Two
 * outings in each window, so a single off day is not a trend.
 */
export function liftsDropping(sessions = [], { now = new Date(), dropShare = FUEL_CHECK_DEFAULTS.fastLiftDropShare } = {}) {
  const today = dayNum(isoOf(now));
  const byLift = new Map();
  for (const s of sessions) {
    const age = today - dayNum(s.date);
    if (!(age >= 0 && age < 42)) continue;
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue; // "off day, don't learn from this"
      const best = bestE1rm((ex.sets || []).filter((x) => Number(x.weight) > 0));
      if (!best) continue;
      const rec = byLift.get(ex.exerciseId) || { name: ex.name, recent: [], prior: [] };
      (age < 21 ? rec.recent : rec.prior).push(best);
      byLift.set(ex.exerciseId, rec);
    }
  }
  const out = [];
  for (const rec of byLift.values()) {
    if (rec.recent.length < 2 || rec.prior.length < 2) continue;
    const drop = 1 - Math.max(...rec.recent) / Math.max(...rec.prior);
    if (drop >= dropShare) out.push({ name: rec.name, dropPct: Math.round(drop * 100) });
  }
  return out.sort((a, b) => b.dropPct - a.dropPct);
}

/**
 * Pure. His call, 7 Nov: about 1 kg a week is the line, and it is not an alarm
 * by itself. Speaks only when the trend is at or past it AND a sign of harm
 * comes with it. Thin weigh-ins or no sign of harm: silent.
 */
function losingFastFinding({ now, weighIns, sessionsAll, deload, foodDays }, t) {
  const today = dayNum(isoOf(now));
  const recent = (weighIns || []).filter((w) => today - dayNum(w.on) <= t.fastWindowDays && today >= dayNum(w.on));
  const span = recent.length >= 2 ? dayNum(recent[recent.length - 1].on) - dayNum(recent[0].on) : 0;
  // the weekly review's own guards: enough weigh-ins, across enough days
  if (recent.length < Math.max(MIN_WEIGHINS, t.fastMinWeighIns) || span < Math.max(MIN_SPAN_DAYS, t.fastMinSpanDays)) return null;
  const perWeek = weightSlope(recent) * 7;
  if (!Number.isFinite(perWeek) || perWeek > -t.fastKgPerWeek) return null;

  const signs = [];
  const dropping = liftsDropping(sessionsAll, { now, dropShare: t.fastLiftDropShare });
  if (dropping.length >= t.fastLiftDropLifts) {
    signs.push(`lifts are going backwards (${dropping.slice(0, 3).map((d) => `${d.name} down ${d.dropPct}%`).join(', ')})`);
  }
  if (deload?.advise) signs.push('his recovery signal says go lighter');
  const complete = (foodDays || []).filter((d) => Number.isFinite(d.kcal) && d.targetKcal > 0 && d.kcal >= Math.max(1000, 0.5 * d.targetKcal));
  if (complete.length >= t.fastMinLoggedDays) {
    const under = complete.filter((d) => d.kcal < t.fastUnderShare * d.targetKcal);
    if (under.length / complete.length >= t.fastUnderDayShare) {
      signs.push(`he has eaten well under target on ${under.length} of ${complete.length} fully logged days`);
    }
  }
  if (!signs.length) return null; // fast, but nothing says it is costing him: not worth a word

  const rate = Math.abs(perWeek).toFixed(1);
  return {
    key: 'losing-too-fast',
    rank: 2,
    severity: 'medium',
    data: { kind: 'losing-fast', perWeek: Math.round(perWeek * 100) / 100, weighIns: recent.length, spanDays: span, signs },
    line: `Weight is falling about ${rate} kg a week across ${recent.length} weigh-ins in ${span} days, at or past the ${t.fastKgPerWeek} kg line, and ${signs.join('; and ')}. Eating a little more would slow the loss and protect the muscle.`,
  };
}

// ------------------------------------------------------------ the engine --

/**
 * Pure. Everything is handed in, so a test can hand in his exact situation.
 *   now         Date (local hour decides "late enough")
 *   thresholds  resolveThresholds(...) output
 *   planned     { name, sets, minutes } of today's routine, or null
 *   workouts    today's watch workouts [{ type, minutes, kcal, cardio }]
 *   sessions    Nova sessions finished today [{ routineName, workingSets }]
 *   food        { totals:{kcal,p}, entryCount } today's log
 *   targets     { kcal, protein } today's, earned and paused room already in kcal
 *   weighIns    [{ on, kg }] oldest first; sessionsAll: every finished session (lift trends)
 *   deload      computeDeloadSignal over days with his unconfirmed sleep held back
 *   foodDays    [{ date, kcal, targetKcal }] finished days only, today excluded
 * @returns {Array<{key, rank, line, ...}>} ranked, rank 1 first
 */
export function fuelChecks(input = {}) {
  const t = input.thresholds || FUEL_CHECK_DEFAULTS;
  const now = input.now instanceof Date ? input.now : new Date();
  const ctx = { ...input, now };
  const findings = [];
  for (const f of [hardDayFinding(ctx, t), losingFastFinding(ctx, t)]) if (f) findings.push(f);
  return findings.sort((a, b) => a.rank - b.rank);
}

// ------------------------------------------------------------- the loader --

/**
 * The thin async half: gathers the real records and calls fuelChecks().
 * Never throws. A source that cannot be read leaves its input empty, and a
 * check that needs it then stays silent. `deps` swaps a source (tests).
 * @returns {Promise<{findings:Array, thresholds:object}>}
 */
export async function loadFuelChecks(vaultPath, { now = new Date(), deps = {} } = {}) {
  const { localDateISO } = await import('./localDate.js');
  const date = localDateISO(now);
  const swallow = (fn, fallback) => Promise.resolve().then(fn).catch(() => fallback);

  const thresholds = resolveThresholds(await swallow(async () => {
    const profile = deps.profile !== undefined ? deps.profile : await (await import('./profile.js')).getProfile(vaultPath);
    return profile?.intake?.fuelChecks;
  }, null));

  const [sessionsAll, watch, day, targets, planned, health, foodDays] = await Promise.all([
    swallow(deps.sessions || (async () => (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 60 })), []),
    swallow(deps.workouts || (async () => {
      const { workoutsForDay, cardioKind } = await import('./healthWorkouts.js');
      return (await workoutsForDay(date)).map((w) => ({ ...w, cardio: cardioKind(w.type) }));
    }), []),
    swallow(deps.day || (async () => (await import('./foodLog.js')).getDay(date)), { entries: [] }),
    swallow(deps.targets || (async () => (await import('./runningTotal.js')).targetsForDay(vaultPath, date)), null),
    swallow(deps.planned || (async () => {
      const { loadExerciseLibrary } = await import('./exercises.js');
      const { loadRoutines, WEEKDAYS } = await import('./workouts.js');
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const { routines, schedule } = await loadRoutines(vaultPath, exercises);
      const routine = routines.find((r) => r.id === schedule?.[WEEKDAYS[(now.getDay() + 6) % 7]]);
      if (!routine) return null;
      return { name: routine.name, sets: routine.exercises.reduce((n, e) => n + (Number(e.targetSets) || 0), 0), minutes: null };
    }), null),
    // sleep is read through the loader's gate: a night he has not confirmed is held back
    swallow(deps.health || (async () => (await import('./healthData.js')).loadRecentDays(28)), []),
    swallow(deps.foodDays || (async () => (await import('./nutritionLog.js')).loadCalendarDays(28)), []),
  ]);

  const { isWorkingSet } = await import('./trainingAnalytics.js');
  const sessions = (sessionsAll || []).filter((s) => s.date === date).map((s) => ({
    routineName: s.routineName,
    workingSets: (s.exercises || []).reduce((n, e) => n + (e.sets || []).filter(isWorkingSet).length, 0),
  }));
  const { totalsOf } = await import('./foodLog.js');
  const entries = day?.entries || [];
  const { weighInsOf } = await import('./healthData.js');
  const { computeDeloadSignal } = await import('./coach.js');
  const findings = fuelChecks({
    now, thresholds, planned, workouts: watch || [], sessions,
    weighIns: weighInsOf(health || []),
    sessionsAll: sessionsAll || [],
    deload: (health || []).length ? computeDeloadSignal(health.slice(-14), { now }) : null,
    foodDays: (foodDays || []).filter((d) => d.date < date).map((d) => ({ date: d.date, kcal: d.kcal, targetKcal: d.targetKcal })),
    food: { totals: totalsOf(entries), entryCount: entries.length },
    targets,
  });
  return { findings, thresholds };
}
