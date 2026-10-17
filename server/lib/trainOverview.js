// The Train TODAY pane's single source — everything the redesigned hero
// needs in one deterministic read: readiness, block week, today's card,
// the focus-for-today line, momentum (PRs / plateaus / streak), and weekly
// muscle volume against goal-aware targets. One endpoint so the pane can
// never show a half-loaded mix of fresh and stale numbers.

import { loadSessions } from './workoutSessions.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, ACTIVE_REST } from './workouts.js';
import { loadRecentDays } from './healthData.js';
import { computeDeloadSignal } from './coach.js';
import { personalRecords, prsInSession, detectPlateaus, weeklyMuscleVolume, mondayOf, isWorkingSet, creditsById } from './trainingAnalytics.js';
import { isUnaudited } from './muscleSecondary.js';
import { plannedWeek } from './plannedWeek.js';
import { muscleWeek as buildMuscleWeek } from './muscleWeek.js';
import { rangeFor, cleanGoalMuscles, V_TAPER_MUSCLES } from '../../src/muscleTaxonomy.js';

const WEEKDAY = () => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

// Weekly hard-set targets per muscle: THE GROWTH RANGE (16 Oct 2026, his
// decision), 10 to 20 working sets for every muscle (VOLUME_RANGE), or the
// range his goal sets one muscle (goals.volumeRanges). The bars' target is
// the range's low end; a goal muscle is flagged loudly when short of it,
// and every row carries the whole range so a surface can say "past it".
// (Before this, goal muscles were held to 12 and the rest to 10.)
// THE OLD WORDS IN HIS GOAL, CARRIED INTO THE NEW GROUPS (15 Oct 2026). His
// goal text says "grow the arms (triceps, biceps, shoulders)", written when
// Shoulders was one group with one target. Read now: "shoulders" means the
// side and rear delts, the heads that need direct work to grow (the front
// delts already take a pressing day's sets and half of every bench), and
// "back" means the lats and the upper back, the muscles rows and pulls build
// (traps and erectors grow from shrugs and hinges, not from a back goal).
// Nothing in his goal page is rewritten; this is how the old words read.
const SHOULDER_GOAL = ['Side Delts', 'Rear Delts'];
const BACK_GOAL = ['Lats', 'Upper Back'];
const GOAL_WORDS = {
  arm: ['Triceps', 'Biceps', ...SHOULDER_GOAL], arms: ['Triceps', 'Biceps', ...SHOULDER_GOAL],
  chest: ['Chest'], back: BACK_GOAL,
  leg: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'], shoulder: SHOULDER_GOAL, shoulders: SHOULDER_GOAL, delts: SHOULDER_GOAL,
  glutes: ['Glutes'], abs: ['Abs'], core: ['Abs'],
};

// exported so the Coach's program review reasons from the SAME muscles the
// volume bars call "goal muscles" — two parsers would drift apart.
// HIS OWN LIST FIRST (16 Oct 2026): `goalMuscles` on his goals page, when
// present and valid, IS the answer; the words below are the fallback. A goal
// that says V-taper means exactly his V-taper muscles, nothing added.
export function goalMuscles(goals) {
  const own = cleanGoalMuscles(goals?.goalMuscles);
  if (own) return new Set(own);
  const text = `${goals?.goal || ''} ${goals?.focus || ''}`.toLowerCase();
  if (/\bv[\s-]?taper\b/.test(text)) return new Set(V_TAPER_MUSCLES);
  const out = new Set();
  for (const [word, muscles] of Object.entries(GOAL_WORDS)) {
    if (text.includes(word)) muscles.forEach((m) => out.add(m));
  }
  return out;
}

// Readiness: a 0-100 blend of HRV-vs-baseline and last night's sleep, with
// honest degradation — missing inputs shrink the basis instead of faking a
// score, and `basis` says what the number is built from.
// `now` (18 Oct 2026): the check verbs pass their own clock, so "how recent"
// is judged against the moment asked about, not the wall clock; every other
// caller keeps the default and is unchanged.
export function computeReadiness(days, now = new Date()) {
  const dayAge = (d) => Math.round((new Date(new Date(now).toDateString()) - new Date(`${d.date}T12:00:00`)) / 86400000);
  const withHrv = (days || []).filter((d) => d.hrv != null && dayAge(d) <= 10);
  const recent = withHrv.filter((d) => dayAge(d) <= 2);
  const baseline = withHrv.filter((d) => dayAge(d) > 2);
  const parts = [];
  if (recent.length && baseline.length >= 3) {
    const avg = (l) => l.reduce((s, d) => s + d.hrv, 0) / l.length;
    const ratio = avg(recent) / avg(baseline);
    parts.push({ k: 'hrv', score: Math.max(0, Math.min(100, 50 + (ratio - 1) * 250)), label: `HRV ${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}% vs baseline` });
  }
  const lastSleep = [...(days || [])].reverse().find((d) => d.sleepAsleepMinutes != null && dayAge(d) <= 1);
  if (lastSleep) {
    const h = lastSleep.sleepAsleepMinutes / 60;
    parts.push({ k: 'sleep', score: Math.max(0, Math.min(100, ((h - 4.5) / 3.5) * 100)), label: `${h.toFixed(1)}h sleep` });
  }
  if (!parts.length) return { score: null, basis: 'no recent recovery data' };
  return {
    score: Math.round(parts.reduce((s, p) => s + p.score, 0) / parts.length),
    basis: parts.map((p) => p.label).join(' · '),
  };
}

// Focus for today — deterministic, meaningful, or ABSENT. Priority order is
// a coaching order: a deload week beats everything; recovery advisories
// beat progressions; then the day's earned step, a tune focus, a plateau
// prescription. A rest day only speaks when an active injury gives it
// something real to say. Never filler (the spec's rule).
export async function composeFocus(vaultPath, { routine, block, deload, progressions, tunes, plateaus, injuries }) {
  if (block?.isDeloadWeek) {
    return { kind: 'deload-week', text: `Deload week — every lift −10-20%, stop 3-4 reps short. Backing off IS the block working; hard sessions this week defeat it.` };
  }
  if (deload?.advise && routine) {
    return { kind: 'recovery', text: `Recovery says lighter today: ${deload.reason}.` };
  }
  if (routine) {
    const inRoutine = new Set(routine.exercises.map((e) => e.exerciseId));
    const entries = Object.entries(progressions || {}).filter(([key]) => key.startsWith(`${routine.id}:`));
    // an outgrown prescription outranks an ordinary earned step — it's the
    // "stop adding reps to pull-ups" conversation, and it opens ITSELF
    const outgrown = entries.find(([, p]) => p.kind === 'outgrown');
    const earned = entries.find(([, p]) => p.kind !== 'outgrown');
    const tuned = (tunes || []).find((t) => inRoutine.has(t.exerciseId) && t.focus);
    const stalled = (plateaus || []).find((p) => inRoutine.has(p.exerciseId));
    const bits = [];
    let focusFix = null;
    // THE VERDICT, SEPARATE FROM ITS REASONING (23 Sep 2026). `text` is
    // unchanged — it is what the spoken turn reads and what a model is handed.
    // `verdict` is the same finding unjoined, so the card can set the thing he
    // earned as a figure and demote the evidence beneath it, instead of
    // burying "+1 rep" in the fourth line of a paragraph (review finding 12).
    // Only an EARNED or OUTGROWN day has one; recovery and rest are advice,
    // and advice has no number.
    let verdict = null;
    if (outgrown) {
      const outgrownId = outgrown[0].split(':')[1];
      const ex = routine.exercises.find((e) => e.exerciseId === outgrownId);
      bits.push(`${ex?.name} has OUTGROWN its prescription — ${outgrown[1].evidence}`);
      verdict = { lift: ex?.name || outgrownId, label: 'outgrown', why: outgrown[1].evidence };
      // his ask: a focus that implies a plan change must be appliable on the
      // spot — the weighted-variant op mints "Weighted X", swaps it in with
      // the same prescription, and carries a low starting load on the marker
      focusFix = { action: 'weighted-variant', exerciseId: outgrownId, name: ex?.name || outgrownId };
    }
    if (earned && !outgrown) {
      const ex = routine.exercises.find((e) => e.exerciseId === earned[0].split(':')[1]);
      bits.push(`${ex?.name}: +${earned[1].delta}${earned[1].kind === 'weight' ? 'kg' : ' rep'} earned — take it (${earned[1].evidence}).`);
      verdict = { lift: ex?.name || earned[0], delta: earned[1].delta, unit: earned[1].kind === 'weight' ? 'kg' : 'rep', why: earned[1].evidence };
    }
    if (tuned) bits.push(`${tuned.name}: ${tuned.focus}.`);
    if (!bits.length && stalled) bits.push(`${stalled.name} has been flat ${stalled.spanDays} days — today is quality over load: slower lowering, full range, honest reps.`);
    if (bits.length) return { kind: 'session', text: bits.slice(0, 2).join(' '), ...(verdict ? { verdict } : {}), ...(focusFix ? { fix: focusFix } : {}) };
    return null; // an ordinary day with nothing earned says nothing
  }
  const active = (injuries || []).filter((i) => !i.resolvedAt);
  if (active.length) {
    return { kind: 'rest', text: `Rest day — 10-15 min of mobility for the ${active[0].area.toLowerCase()} pays double while it's healing.` };
  }
  return null;
}

export async function buildTrainOverview(vaultPath) {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const [{ routines, schedule }, sessions, days] = await Promise.all([
    loadRoutines(vaultPath, exercises),
    loadSessions(vaultPath, { limit: 40 }),
    loadRecentDays(7).catch(() => []),
  ]);
  const { getBlock } = await import('./trainingBlocks.js');
  const { getTunes } = await import('./progressionTunes.js');
  const { computeProgressions } = await import('./coach.js');
  const { computeStreaks } = await import('./streaks.js');
  const { getFitnessGoals } = await import('./fitnessGoals.js');
  const { listInjuries } = await import('./injuryLog.js');

  const [block, tunes, progressions, streaks, goals, injuries] = await Promise.all([
    getBlock(vaultPath).catch(() => null),
    getTunes(vaultPath).catch(() => []),
    computeProgressions(vaultPath, routines).catch(() => ({})),
    computeStreaks(vaultPath).catch(() => null),
    getFitnessGoals(vaultPath).catch(() => null),
    listInjuries(vaultPath).catch(() => []),
  ]);

  const todayId = schedule?.[WEEKDAY()];
  const routine = todayId && todayId !== ACTIVE_REST ? routines.find((r) => r.id === todayId) || null : null;
  const deload = computeDeloadSignal(days);
  const readiness = computeReadiness(days);
  const plateaus = detectPlateaus(sessions);
  const focus = await composeFocus(vaultPath, { routine, block, deload, progressions, tunes, plateaus, injuries });

  // momentum: last session's PRs (if within 3 days), top plateau, streak
  const byId = new Map((exercises || []).map((e) => [e.id, e]));
  const groupOf = (id) => byId.get(id)?.muscleGroup || null;
  const last = sessions[0] || null;
  const recentPRs = last && (Date.now() - new Date(`${last.date}T12:00:00`)) < 3 * 86400000
    ? prsInSession(sessions, last).slice(0, 2) : [];

  // volume vs goal-aware targets
  const focused = goalMuscles(goals);
  // THIS week, not "the newest week that happens to have data". weeklyMuscleVolume
  // only returns weeks that CONTAIN sessions, so [0] was last week's numbers
  // every Monday until the first session landed — under a header reading
  // "HARD SETS THIS WEEK". He caught it on a Monday morning showing a full
  // week's volume. An empty week must read as zeros; that IS the finding.
  const thisWeek = mondayOf(new Date());
  const vol = weeklyMuscleVolume(sessions, exercises, { weeks: 6 }).find((w) => w.week === thisWeek) || { groups: {} };
  // WHAT ELSE EACH LIFT TRAINS COUNTS (15 Oct 2026, his ask): `sets` is the
  // muscle's TOTAL, direct sets plus half for each set of a lift that also
  // trains it (lib/muscleSecondary.js); `direct` and `indirect` are the SETS
  // of each kind, so the bar can draw the solid part and the lighter part.
  const ranges = goals?.volumeRanges || null;
  const rowOf = (muscle) => ({
    muscle, sets: 0, direct: 0, indirect: 0,
    target: rangeFor(muscle, ranges)[0],
    range: rangeFor(muscle, ranges),
    goalMuscle: focused.has(muscle),
  });
  const volume = Object.entries(vol.groups || {}).map(([muscle, sets]) => ({
    ...rowOf(muscle), sets,
    direct: vol.direct?.[muscle] ?? sets,
    indirect: vol.indirect?.[muscle] || 0,
  }));
  // goal muscles with ZERO sets this week must still appear — absence is the finding
  for (const m of focused) {
    if (!volume.some((v) => v.muscle === m)) volume.push(rowOf(m));
  }
  // THE SESSION HE IS IN RIGHT NOW counts too. Filed sessions only update
  // when he finishes, so mid-workout the bars sat behind by exactly what he
  // had just ticked — he noticed 9 ticked sets missing from the totals. The
  // live draft is mirrored to the server on every tick, so read it and add
  // the ticked, non-warm-up sets. `live` is kept separate as well as folded
  // into the total, so the bar can show which part is happening now: `live`
  // is the credited amount (half per indirect set), `liveDirect` the sets he
  // ticked on lifts filed under this muscle (the "N live" count).
  const creditsOf = creditsById(exercises);
  const unauditedIds = new Map((exercises || []).filter(isUnaudited).map((e) => [e.id, e.name]));
  // the week's sets on unaudited lifts, filed and live: never counted, never hidden
  const uncounted = { sets: vol.uncounted?.sets || 0, lifts: (vol.uncounted?.lifts || []).map((l) => ({ ...l })) };
  let liveSession = null; // read once: the bars and the planned week fold in the same draft
  try {
    const { getSessionDraft } = await import('./sessionDraft.js');
    const draft = await getSessionDraft();
    const ws = draft?.workoutSession;
    liveSession = ws || null;
    for (const ex of ws?.exercises || []) {
      const ticked = (ex.sets || []).filter((x) => x.done && isWorkingSet(x)).length;
      if (!ticked) continue;
      // an unaudited lift's ticked sets are left out, and said to be
      if (unauditedIds.has(ex.exerciseId)) {
        uncounted.sets += ticked;
        const name = unauditedIds.get(ex.exerciseId);
        const l = uncounted.lifts.find((x) => x.name === name);
        if (l) l.sets += ticked; else uncounted.lifts.push({ name, sets: ticked });
        continue;
      }
      const credits = creditsOf.get(ex.exerciseId) || [{ muscle: 'Other', credit: 1 }];
      if (!credits.length) continue; // Mobility, Full Body, Grip: never volume
      for (const { muscle, credit } of credits) {
        let row = volume.find((v) => v.muscle === muscle);
        if (!row) { row = rowOf(muscle); volume.push(row); }
        row.sets += credit * ticked;
        row.live = (row.live || 0) + credit * ticked;
        if (credit >= 1) { row.direct += ticked; row.liveDirect = (row.liveDirect || 0) + ticked; } else row.indirect += ticked;
      }
    }
  } catch { /* no draft, or it failed to read — the filed totals stand alone */ }

  volume.sort((a, b) => b.sets - a.sets);

  // THE PLANNED WEEK behind the bars — every exercise the schedule puts in
  // this week, per muscle, per day, with what is done (lib/plannedWeek.js).
  // Same sessions, same draft, same targets as the bars, so they agree.
  // Null on failure: the card keeps its bars and simply opens nothing.
  // Past days are judged by the plan as it stood (lib/planHistory.js), and a
  // lift carried to a make-up still ahead is still to come. Either source
  // failing leaves today's plan and no carry-overs: the week still renders.
  let week = null;
  try {
    const { refreshPlanHistory, planAt } = await import('./planHistory.js');
    const history = await refreshPlanHistory(vaultPath).catch(() => null);
    const { listCarryovers } = await import('./workoutCarryover.js');
    const carryovers = await listCarryovers().catch(() => []);
    week = plannedWeek({
      routines, schedule, sessions, live: liveSession, exercises, carryovers,
      routinesAt: history?.versions?.length ? (iso) => planAt(history.versions, iso)?.routines || null : null,
      targetOf: (m) => ({ target: rangeFor(m, ranges)[0], range: rangeFor(m, ranges), goalMuscle: focused.has(m) }),
    });
  } catch { /* honest absence */ }

  // THE WEEK IN MUSCLE SETS (16 Oct 2026): the weekly muscle sets sheet's
  // model (lib/muscleWeek.js). Same sessions, same draft, same library as the
  // bars; null on failure, and the card simply opens nothing.
  let muscleWeek = null;
  try {
    const { listCarryovers } = await import('./workoutCarryover.js');
    muscleWeek = buildMuscleWeek({
      routines, schedule, sessions, live: liveSession, exercises,
      carryovers: await listCarryovers().catch(() => []),
      goalMuscles: [...focused],
      ranges,
    });
  } catch { /* honest absence */ }

  // the Coach's open program ask — shown on Train, because that is where a
  // change to his program is actually decided
  const coachAsk = await (async () => {
    try {
      const { listRecords } = await import('./inboxStore.js');
      const open = (await listRecords())
        .filter((r) => r.kind === 'coach-program' && r.status === 'pending')
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      if (!open.length) return null;
      const r = open[0];
      return {
        recordId: r.id,
        text: String(r.text || '').replace(/^Coach:\s*/, ''),
        nudges: r.nudges || 0,
        daysOpen: Math.floor((Date.now() - new Date(r.createdAt || Date.now())) / 86_400_000),
        applies: !!(r.fix && ['remap', 'swap', 'weighted-variant', 'drop'].includes(r.fix.action)),
        fix: r.fix || null,
      };
    } catch { return null; }
  })();

  const latest = [...days].reverse().find((d) => d.hrv != null || d.sleepAsleepMinutes != null || d.restingHeartRate != null) || {};

  return {
    readiness,
    recovery: {
      hrv: latest.hrv != null ? Math.round(latest.hrv) : null,
      sleepMin: latest.sleepAsleepMinutes ?? null,
      restingHr: latest.restingHeartRate ?? null,
    },
    deload: { advise: deload.advise, reason: deload.reason },
    coachAsk,
    block: block ? { phase: block.phase, week: block.week, lengthWeeks: block.lengthWeeks, isDeloadWeek: block.isDeloadWeek, ended: block.ended } : null,
    // MAKE-UP DAY — his own plan for THIS DATE beats the weekday template.
    // Before this, moving a session forward to finish it still had every
    // surface recommending a standard day (his report, 8 Sep 2026).
    makeup: await (async () => {
      try {
        const { makeupFor, todayIso, makeupLine } = await import('./makeupDay.js');
        const m = await makeupFor(todayIso());
        return m ? { id: m.id, sourceRoutineName: m.sourceRoutineName, sourceRoutineId: m.sourceRoutineId || null, sourceDate: m.sourceDate || null, exercises: m.exercises, line: makeupLine(m, { scheduledName: routine?.name || null }) } : null;
      } catch { return null; }
    })(),
    // WHAT IS ALREADY DONE TODAY (26 Sep): the sessions filed today, and for a
    // make-up, which routine it finished. The make-up row is gone once the
    // session is filed, so without this the surfaces fell back to the weekday
    // template as if nothing had happened.
    doneToday: await (async () => {
      try {
        const { doneTodayOf, todayIso } = await import('./makeupDay.js');
        const { listCarryovers } = await import('./workoutCarryover.js');
        const carryovers = await listCarryovers().catch(() => []);
        // 3 Oct: every session filed today, in the order done, each saying
        // what it was (a make-up names its routine and what he left off),
        // the totals once, and whether the scheduled routine is among them
        return doneTodayOf(todayIso(), sessions, routines, { scheduledRoutine: routine, carryovers });
      } catch { return null; }
    })(),
    today: routine ? {
      routineId: routine.id, name: routine.name, exerciseCount: routine.exercises.length,
      lastVolume: (() => {
        const prev = sessions.find((s) => s.routineId === routine.id);
        return prev ? Math.round(prev.exercises.reduce((v, e) => v + e.sets.reduce((x, s) => x + s.weight * s.reps, 0), 0)) : null;
      })(),
    } : null,
    restDay: !routine,
    // the watch's account of TODAY — walks, cardio, anything tracked on
    // his wrist. Absent when nothing was pushed (honest, never zeros).
    watch: await (async () => {
      try {
        const { workoutsForDay } = await import('./healthWorkouts.js');
        const pad2 = (n) => String(n).padStart(2, '0');
        const now2 = new Date();
        const todayISO = `${now2.getFullYear()}-${pad2(now2.getMonth() + 1)}-${pad2(now2.getDate())}`;
        const ws = await workoutsForDay(todayISO);
        return ws.length ? ws.map((w) => ({ type: w.type, minutes: w.minutes, kcal: w.kcal })) : null;
      } catch { return null; }
    })(),
    focus,
    momentum: {
      // weight+reps ride along so the card can name the SET he did, not only
      // the estimate derived from it (trainingAnalytics.js: `shown`)
      // THE MUSCLE RIDES ALONG (23 Sep 2026). The momentum cards all wore the
      // same gold border, which §2b rule 8 reserves for "not yet decided" — a
      // personal record is decided. The group is what the card is ABOUT, and
      // the palette already has a hue for it, so the card can be that hue
      // instead. Absent rather than guessed when the library has no entry.
      prs: recentPRs.map((p) => ({ name: p.name, kind: p.kind, value: p.value, weight: p.weight ?? null, reps: p.reps ?? null, previous: p.previous, date: last?.date, muscleGroup: groupOf(p.exerciseId) })),
      plateau: plateaus[0] ? { name: plateaus[0].name, spanDays: plateaus[0].spanDays, muscleGroup: groupOf(plateaus[0].exerciseId) } : null,
      streak: streaks?.workoutStreak ?? null,
    },
    volume,
    // "N sets on unaudited lifts not counted" (src/muscleCredit.js
    // uncountedLine): the bars and the week sheet say it under the figures
    uncounted,
    week,
    muscleWeek,
  };
}
