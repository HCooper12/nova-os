// The training analytics engine — computing on what Hayden already logs.
//
// The audit's harshest finding: RPE captured in 23 of 28 sessions and never
// read by any computation; muscleGroup stored on every exercise and never
// aggregated; e1RM deltas printed but never thresholded; no PR has ever
// been detected. This module closes that class: every function is pure over
// the session list (deterministic, testable), and the Coach context, the
// cadence engine, and the panels all read from HERE — one implementation,
// many consumers, per the shared-formats rule.

import { loadSessions } from './workoutSessions.js';
import { mondayIso } from './cadence.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';

const e1rm = (w, reps) => (reps > 0 && reps <= 12 ? w * (1 + reps / 30) : null);
const bestE1rm = (sets) => Math.max(0, ...sets.map((s) => e1rm(s.weight, s.reps) || 0)) || null;

/* ---------------- PRs: best weight, best e1RM, best reps@weight ---------- */

// A PR is computed against ALL prior history for that exercise, per metric.
// Returns the PRs set IN the given session (for celebration) via prsInSession,
// and the all-time bests via personalRecords.
export function personalRecords(sessions) {
  const best = {}; // exerciseId -> { name, weight: {value, date}, e1rm: {...}, repsAtTop: {...} }
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const ex of s.exercises || []) {
      const b = best[ex.exerciseId] || (best[ex.exerciseId] = { name: ex.name });
      for (const set of ex.sets || []) {
        if (set.weight > (b.weight?.value ?? 0)) b.weight = { value: set.weight, reps: set.reps, date: s.date };
        const e = e1rm(set.weight, set.reps);
        if (e && e > (b.e1rm?.value ?? 0)) b.e1rm = { value: Math.round(e * 10) / 10, date: s.date };
      }
    }
  }
  return best;
}

export function prsInSession(sessions, session) {
  const prior = sessions.filter((s) => s.date < session.date || (s.date === session.date && s !== session));
  const before = personalRecords(prior);
  const out = [];
  for (const ex of session.exercises || []) {
    const b = before[ex.exerciseId] || {};
    for (const set of ex.sets || []) {
      if (set.weight > (b.weight?.value ?? 0)) {
        out.push({ exerciseId: ex.exerciseId, name: ex.name, kind: 'weight', value: set.weight, reps: set.reps, previous: b.weight?.value ?? null });
        b.weight = { value: set.weight }; // only the first crossing counts per session
      }
      const e = e1rm(set.weight, set.reps);
      if (e && e > (b.e1rm?.value ?? 0)) {
        out.push({ exerciseId: ex.exerciseId, name: ex.name, kind: 'e1rm', value: Math.round(e * 10) / 10, previous: b.e1rm?.value ?? null });
        b.e1rm = { value: e };
      }
    }
  }
  // e1RM PRs that are just echoes of a weight PR on the same lift add noise —
  // keep the weight PR (the one he felt) and the e1RM only when it stands alone
  const weightLifts = new Set(out.filter((p) => p.kind === 'weight').map((p) => p.exerciseId));
  const filtered = out.filter((p) => p.kind === 'weight' || !weightLifts.has(p.exerciseId));
  // one entry per (exercise, kind): several sets can each nudge the best up —
  // report the day's FINAL best against the PRE-SESSION previous
  const best = new Map();
  for (const p of filtered) {
    const k = `${p.exerciseId}|${p.kind}`;
    const cur = best.get(k);
    if (!cur) best.set(k, { ...p });
    else { cur.value = Math.max(cur.value, p.value); }
  }
  return [...best.values()];
}

/* ---------------- plateau: e1RM flat or falling across sessions ---------- */

// A lift is plateaued when it has ≥minSessions appearances over ≥minDays and
// its best e1RM in the recent half is not above the best in the earlier half.
// Time-based exercises are skipped (no honest e1RM exists for them).
export function detectPlateaus(sessions, { minSessions = 4, minDays = 21 } = {}) {
  const byExercise = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue; // "off day — don't learn from this"
      if (!(ex.sets || []).some((x) => x.weight > 0)) continue;
      const arr = byExercise.get(ex.exerciseId) || [];
      arr.push({ date: s.date, name: ex.name, best: bestE1rm(ex.sets) });
      byExercise.set(ex.exerciseId, arr);
    }
  }
  const out = [];
  for (const [exerciseId, arr] of byExercise) {
    const dated = arr.filter((x) => x.best).sort((a, b) => a.date.localeCompare(b.date));
    if (dated.length < minSessions) continue;
    const spanDays = (new Date(dated[dated.length - 1].date) - new Date(dated[0].date)) / 86400000;
    if (spanDays < minDays) continue;
    const half = Math.floor(dated.length / 2);
    const earlier = Math.max(...dated.slice(0, half).map((x) => x.best));
    const recent = Math.max(...dated.slice(half).map((x) => x.best));
    if (recent <= earlier * 1.005) { // ≤0.5% gain across the window = flat
      out.push({
        exerciseId, name: dated[0].name, sessions: dated.length,
        spanDays: Math.round(spanDays),
        earlierBest: Math.round(earlier * 10) / 10, recentBest: Math.round(recent * 10) / 10,
      });
    }
  }
  return out.sort((a, b) => b.spanDays - a.spanDays);
}

/* ---------------- RPE: trend + per-exercise effort picture --------------- */

// Session-average RPE per date (only sessions that carry any RPE), plus a
// drift verdict: rising effort with flat e1RMs is the classic overreach tell.
export function rpeTrend(sessions, { recentN = 4 } = {}) {
  const perSession = sessions
    .map((s) => {
      const rpes = (s.exercises || []).flatMap((ex) => (ex.sets || []).map((x) => x.rpe).filter((r) => r != null));
      return rpes.length ? { date: s.date, avg: rpes.reduce((a, b) => a + b, 0) / rpes.length, n: rpes.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (perSession.length < recentN + 2) return { series: perSession, drift: null };
  const recent = perSession.slice(-recentN);
  const baseline = perSession.slice(0, -recentN);
  const avg = (l) => l.reduce((s, x) => s + x.avg, 0) / l.length;
  const delta = avg(recent) - avg(baseline);
  return {
    series: perSession,
    drift: {
      baselineAvg: Math.round(avg(baseline) * 10) / 10,
      recentAvg: Math.round(avg(recent) * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      rising: delta >= 0.5, // half an RPE point sustained across sessions is real
    },
  };
}

/* ---------------- weekly volume per muscle group ------------------------- */

// Hard sets per muscle group per ISO week — the number every volume landmark
// conversation (MEV/MAV) starts from. A set counts when it was logged with
// load or reps; warm-up flags (when they exist) are excluded.
// The Monday that owns a given date — every weekly number in Nova is keyed
// by this, so "this week" means one thing everywhere. Exported because the
// caller must be able to ask for the CURRENT week specifically rather than
// "the newest week that happens to have data" (see the bug note in
// trainOverview.js).
// the week key as a local 'YYYY-MM-DD' — the fleet's one Monday (cadence.js),
// exported under this name because weeklyMuscleVolume, trainOverview and the
// week-boundary test all key weeks by it
export const mondayOf = (date = new Date()) => mondayIso(date);

export function weeklyMuscleVolume(sessions, exercises, { weeks = 4 } = {}) {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup || 'Other']));
  const weekOf = (dateStr) => mondayOf(dateStr);
  const acc = new Map(); // week -> group -> sets
  for (const s of sessions) {
    const wk = weekOf(s.date);
    for (const ex of s.exercises || []) {
      const g = groupOf.get(ex.exerciseId) || 'Other';
      if (g === 'Mobility') continue; // tracked for adherence, never as hypertrophy volume
      const working = (ex.sets || []).filter((x) => x.setType !== 'warmup' && (x.weight > 0 || x.reps > 0));
      if (!working.length) continue;
      const w = acc.get(wk) || new Map();
      w.set(g, (w.get(g) || 0) + working.length);
      acc.set(wk, w);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, weeks)
    .map(([week, groups]) => ({ week, groups: Object.fromEntries([...groups.entries()].sort((a, b) => b[1] - a[1])) }));
}

/* ---------------- program coherence audit -------------------------------- */

// Deterministic checks a human coach would run in the first five minutes.
// His live program failed two of these invisibly for weeks: Pull-Up opening
// BOTH Pull and Push days, and Push scheduled twice back-to-back.
export function auditProgram({ routines, schedule, goals, exercises }) {
  const findings = [];
  const groupOf = new Map((exercises || []).map((e) => [e.id, e.muscleGroup || 'Other']));

  // duplicate exercises across routines
  const seen = new Map(); // exerciseId -> [routineName]
  for (const r of routines || []) {
    for (const ex of r.exercises || []) {
      const arr = seen.get(ex.exerciseId) || [];
      arr.push(r.name);
      seen.set(ex.exerciseId, arr);
    }
  }
  for (const [exerciseId, names] of seen) {
    if (names.length > 1) {
      const ex = (exercises || []).find((e) => e.id === exerciseId);
      findings.push({ kind: 'duplicate-exercise', detail: `${ex?.name || exerciseId} appears in ${names.join(' AND ')} — the same lift trained on multiple days needs to be deliberate, not accidental` });
    }
  }

  // same routine on consecutive scheduled days
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (let i = 0; i < days.length; i++) {
    const a = schedule?.[days[i]];
    const b = schedule?.[days[(i + 1) % 7]];
    if (a && a === b && a !== 'ACTIVE_REST') {
      const r = (routines || []).find((x) => x.id === a);
      findings.push({ kind: 'consecutive-repeat', detail: `${r?.name || a} is scheduled ${days[i]} AND ${days[(i + 1) % 7]} — the same session back-to-back gives the muscles it hits no recovery window` });
    }
  }

  // stated days/week vs actual scheduled days
  const scheduledDays = days.filter((d) => schedule?.[d] && schedule[d] !== 'ACTIVE_REST').length;
  if (goals?.daysPerWeek && scheduledDays !== goals.daysPerWeek) {
    findings.push({ kind: 'days-mismatch', detail: `his goal says ${goals.daysPerWeek} days/week but the schedule has ${scheduledDays} training days — one of them is wrong` });
  }

  // push/pull balance across the whole program (weekly scheduled sets)
  const PUSHY = new Set(['Chest', 'Shoulders', 'Triceps']);
  const PULLY = new Set(['Back', 'Biceps']);
  let push = 0;
  let pull = 0;
  for (const d of days) {
    const r = (routines || []).find((x) => x.id === schedule?.[d]);
    for (const ex of r?.exercises || []) {
      const g = groupOf.get(ex.exerciseId);
      if (PUSHY.has(g)) push += ex.targetSets || 0;
      if (PULLY.has(g)) pull += ex.targetSets || 0;
    }
  }
  if (push + pull >= 20 && (push > pull * 1.8 || pull > push * 1.8)) {
    findings.push({ kind: 'push-pull-imbalance', detail: `weekly scheduled sets run ${push} push vs ${pull} pull — a sustained ${push > pull ? 'press' : 'pull'}-heavy skew invites shoulder trouble` });
  }

  return findings;
}

/* ---------------- one context block for the Coach ------------------------ */

export async function analyticsContext(vaultPath) {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const sessions = await loadSessions(vaultPath, { limit: 40 });
  const { routines, schedule } = await loadRoutines(vaultPath, exercises);
  const { getFitnessGoals } = await import('./fitnessGoals.js');
  const goals = await getFitnessGoals(vaultPath).catch(() => null);

  const lines = [];
  const prs = personalRecords(sessions);
  const top = Object.values(prs).filter((b) => b.e1rm).sort((a, b) => b.e1rm.value - a.e1rm.value).slice(0, 6);
  if (top.length) lines.push(`ALL-TIME BESTS (e1RM): ${top.map((b) => `${b.name} ${b.e1rm.value}kg (${b.e1rm.date})`).join('; ')}`);

  const plateaus = detectPlateaus(sessions);
  if (plateaus.length) lines.push(`PLATEAUED LIFTS (e1RM flat over the window — a stalled lift needs a changed stimulus, not more of the same): ${plateaus.map((p) => `${p.name} — ${p.sessions} sessions over ${p.spanDays}d, ${p.earlierBest}→${p.recentBest}kg`).join('; ')}`);

  const rpe = rpeTrend(sessions);
  if (rpe.drift) lines.push(`RPE TREND: baseline ${rpe.drift.baselineAvg} → recent ${rpe.drift.recentAvg}${rpe.drift.rising ? ' — effort is RISING; if e1RMs are flat too, that is the overreach pattern and a deload conversation is due' : ' (steady)'}`);

  const vol = weeklyMuscleVolume(sessions, exercises);
  if (vol.length) {
    lines.push(`WEEKLY HARD SETS PER MUSCLE (recent weeks, newest first): ${vol.map((w) => `wk ${w.week.slice(5)}: ${Object.entries(w.groups).map(([g, n]) => `${g} ${n}`).join(', ')}`).join(' | ')}`);
  }

  // the mobility dimension — adherence, not volume: how much mobility work
  // actually happened lately. Silence when he has no mobility exercises yet
  // (the honest state), but if the library HAS them and the count is zero,
  // that IS the signal.
  {
    const mobilityIds = new Set(exercises.filter((e) => e.muscleGroup === 'Mobility').map((e) => e.id));
    if (mobilityIds.size) {
      const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const done = sessions.filter((s) => s.date >= cutoff && s.exercises?.some((ex) => mobilityIds.has(ex.exerciseId) && ex.sets?.length));
      lines.push(`MOBILITY (a dimension you program and watch, like volume — it protects everything else): ${done.length} session${done.length === 1 ? '' : 's'} with mobility work in the last 14 days. Rest days are mobility's home; if this reads 0 for long, raise it.`);
    }
  }

  // his own words from the logger: notes, pain reports, cut-short reasons —
  // the cockpit's feedback channel the Coach digests over time
  const worded = [];
  for (const s2 of sessions.slice(0, 12)) {
    if (s2.cutShort) worded.push(`${s2.date} ${s2.routineName}: CUT SHORT (${s2.cutShort})`);
    for (const ex of s2.exercises || []) {
      if (ex.pain) worded.push(`${s2.date} ${ex.name}: PAIN — ${ex.pain}`);
      if (ex.note) worded.push(`${s2.date} ${ex.name}: "${ex.note}"`);
      if (ex.anomaly) worded.push(`${s2.date} ${ex.name}: flagged off-day (excluded from signals)`);
    }
  }
  if (worded.length) lines.push(`HIS SESSION NOTES (digest these over time — trajectory feedback like "felt easy" repeated should eventually change the PRESCRIPTION, e.g. bodyweight → weighted; repeated cut-shorts should open the restructure conversation): ${worded.slice(0, 10).join(' | ')}`);

  const audit = auditProgram({ routines, schedule, goals, exercises });
  if (audit.length) lines.push(`PROGRAM AUDIT FLAGS (deterministic checks — raise the most important one when program design comes up): ${audit.map((f) => f.detail).join(' • ')}`);

  return lines.length ? `TRAINING ANALYTICS (computed this turn):\n${lines.join('\n')}` : null;
}
