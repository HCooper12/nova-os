// The Train TODAY pane's single source — everything the redesigned hero
// needs in one deterministic read: readiness, block week, today's card,
// the focus-for-today line, momentum (PRs / plateaus / streak), and weekly
// muscle volume against goal-aware targets. One endpoint so the pane can
// never show a half-loaded mix of fresh and stale numbers.

import { loadSessions } from './workoutSessions.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { loadRecentDays } from './healthData.js';
import { computeDeloadSignal } from './coach.js';
import { personalRecords, prsInSession, detectPlateaus, weeklyMuscleVolume } from './trainingAnalytics.js';

const WEEKDAY = () => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

// Weekly hard-set targets per muscle. 10 is the evidence-based floor for
// growth in most trained lifters; muscles named by his GOAL get 12 — the
// point (his ask) is that under-volumed goal muscles get flagged loudly.
const BASE_TARGET = 10;
const GOAL_TARGET = 12;
const GOAL_WORDS = {
  arm: ['Triceps', 'Biceps', 'Shoulders'], arms: ['Triceps', 'Biceps', 'Shoulders'],
  chest: ['Chest'], back: ['Back'], leg: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'], shoulder: ['Shoulders'], shoulders: ['Shoulders'],
  glutes: ['Glutes'], abs: ['Abs'], core: ['Abs'],
};

// exported so the Coach's program review reasons from the SAME muscles the
// volume bars call "goal muscles" — two parsers would drift apart
export function goalMuscles(goals) {
  const text = `${goals?.goal || ''} ${goals?.focus || ''}`.toLowerCase();
  const out = new Set();
  for (const [word, muscles] of Object.entries(GOAL_WORDS)) {
    if (text.includes(word)) muscles.forEach((m) => out.add(m));
  }
  return out;
}

// Readiness: a 0-100 blend of HRV-vs-baseline and last night's sleep, with
// honest degradation — missing inputs shrink the basis instead of faking a
// score, and `basis` says what the number is built from.
export function computeReadiness(days) {
  const dayAge = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d.date}T12:00:00`)) / 86400000);
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
    if (outgrown) {
      const ex = routine.exercises.find((e) => e.exerciseId === outgrown[0].split(':')[1]);
      bits.push(`${ex?.name} has OUTGROWN its prescription — ${outgrown[1].evidence}`);
    }
    if (earned && !outgrown) {
      const ex = routine.exercises.find((e) => e.exerciseId === earned[0].split(':')[1]);
      bits.push(`${ex?.name}: +${earned[1].delta}${earned[1].kind === 'weight' ? 'kg' : ' rep'} earned — take it (${earned[1].evidence}).`);
    }
    if (tuned) bits.push(`${tuned.name}: ${tuned.focus}.`);
    if (!bits.length && stalled) bits.push(`${stalled.name} has been flat ${stalled.spanDays} days — today is quality over load: slower lowering, full range, honest reps.`);
    if (bits.length) return { kind: 'session', text: bits.slice(0, 2).join(' ') };
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
  const routine = todayId && todayId !== 'ACTIVE_REST' ? routines.find((r) => r.id === todayId) || null : null;
  const deload = computeDeloadSignal(days);
  const readiness = computeReadiness(days);
  const plateaus = detectPlateaus(sessions);
  const focus = await composeFocus(vaultPath, { routine, block, deload, progressions, tunes, plateaus, injuries });

  // momentum: last session's PRs (if within 3 days), top plateau, streak
  const last = sessions[0] || null;
  const recentPRs = last && (Date.now() - new Date(`${last.date}T12:00:00`)) < 3 * 86400000
    ? prsInSession(sessions, last).slice(0, 2) : [];

  // volume vs goal-aware targets
  const focused = goalMuscles(goals);
  const vol = weeklyMuscleVolume(sessions, exercises, { weeks: 1 })[0] || { groups: {} };
  const volume = Object.entries(vol.groups || {}).map(([muscle, sets]) => ({
    muscle, sets,
    target: focused.has(muscle) ? GOAL_TARGET : BASE_TARGET,
    goalMuscle: focused.has(muscle),
  }));
  // goal muscles with ZERO sets this week must still appear — absence is the finding
  for (const m of focused) {
    if (!volume.some((v) => v.muscle === m)) volume.push({ muscle: m, sets: 0, target: GOAL_TARGET, goalMuscle: true });
  }
  // THE SESSION HE IS IN RIGHT NOW counts too. Filed sessions only update
  // when he finishes, so mid-workout the bars sat behind by exactly what he
  // had just ticked — he noticed 9 ticked sets missing from the totals. The
  // live draft is mirrored to the server on every tick, so read it and add
  // the ticked, non-warm-up sets. `live` is kept separate as well as folded
  // into the total, so the bar can show which part is happening now.
  const muscleOf = new Map(exercises.map((e) => [e.id, e.muscleGroup || 'Other']));
  try {
    const { getSessionDraft } = await import('./sessionDraft.js');
    const draft = await getSessionDraft();
    const ws = draft?.workoutSession;
    for (const ex of ws?.exercises || []) {
      const g = muscleOf.get(ex.exerciseId) || 'Other';
      if (g === 'Mobility') continue;
      const ticked = (ex.sets || []).filter((x) => x.done && x.setType !== 'warmup'
        && (Number(x.weight) > 0 || Number(x.reps) > 0));
      if (!ticked.length) continue;
      const row = volume.find((v) => v.muscle === g);
      if (row) { row.sets += ticked.length; row.live = (row.live || 0) + ticked.length; }
      else {
        volume.push({ muscle: g, sets: ticked.length, live: ticked.length,
          target: focused.has(g) ? GOAL_TARGET : BASE_TARGET, goalMuscle: focused.has(g) });
      }
    }
  } catch { /* no draft, or it failed to read — the filed totals stand alone */ }

  volume.sort((a, b) => b.sets - a.sets);

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
        applies: !!(r.fix && r.fix.action === 'remap'),
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
      prs: recentPRs.map((p) => ({ name: p.name, kind: p.kind, value: p.value, reps: p.reps ?? null, previous: p.previous, date: last?.date })),
      plateau: plateaus[0] ? { name: plateaus[0].name, spanDays: plateaus[0].spanDays } : null,
      streak: streaks?.workoutStreak ?? null,
    },
    volume,
  };
}
