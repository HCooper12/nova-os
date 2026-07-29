import { randomUUID } from 'node:crypto';
import { loadSessions, setSessionSummary } from './workoutSessions.js';
import { createRecord } from './inboxStore.js';

// Coach's progression engine — pure deterministic rules over logged history,
// per the agents plan: it only ever changes SUGGESTED numbers (session
// prefill + a visible chip); the human logs what actually happened, and
// nothing here writes a file.
//
// Rule: an exercise earns a progression when its last two logged sessions
// both "topped out" — at least the routine's target set count, with every
// set at or above the target-high reps. Weighted movements progress by
// +2.5kg; bodyweight movements progress by +1 rep. Time-based tracking types
// are left alone (no honest deterministic rule for them yet).

export const WEIGHT_STEP_KG = 2.5;
const WEIGHTED_TYPES = new Set(['weight_reps', 'weighted_bodyweight_reps']);
const BODYWEIGHT_TYPES = new Set(['bodyweight_reps']);

function toppedOut(sessionExercise, entry) {
  const sets = sessionExercise.sets || [];
  if (sets.length < entry.targetSets) return false;
  return sets.every((s) => (Number(s.reps) || 0) >= entry.targetRepsHigh);
}

// routines: the resolved routines from loadRoutines (entries carry
// exerciseId/trackingType/targetSets/targetRepsHigh). Returns a map keyed
// `${routineId}:${exerciseId}` → { kind, delta, evidence }.
export async function computeProgressions(vaultPath, routines) {
  const sessions = await loadSessions(vaultPath); // newest first
  const out = {};

  for (const routine of routines) {
    for (const entry of routine.exercises) {
      if (!WEIGHTED_TYPES.has(entry.trackingType) && !BODYWEIGHT_TYPES.has(entry.trackingType)) continue;

      const recent = [];
      for (const s of sessions) {
        const ex = s.exercises.find((e) => e.exerciseId === entry.exerciseId);
        if (ex && ex.sets?.length) recent.push(ex);
        if (recent.length === 2) break;
      }
      if (recent.length < 2) continue;
      if (!recent.every((ex) => toppedOut(ex, entry))) continue;

      const lastWeight = Math.max(...recent[0].sets.map((s) => Number(s.weight) || 0));
      if (WEIGHTED_TYPES.has(entry.trackingType)) {
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'weight',
          delta: WEIGHT_STEP_KG,
          evidence: `hit ${entry.targetRepsHigh}+ reps across all sets twice running${lastWeight ? ` at ${lastWeight}kg` : ''}`,
        };
      } else {
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'reps',
          delta: 1,
          evidence: `topped ${entry.targetRepsHigh} reps on every set twice running`,
        };
      }
    }
  }
  return out;
}

/* ---------------------------- deload advisory ---------------------------- */

// Recovery-aware deload signal — pure arithmetic over recent health days,
// honest about thin data, and ADVISORY only (a line in the brief and the
// Coach's context; nothing changes any plan by itself).
//
// Date-aware, not file-aware: loadRecentDays returns the last N FILES, and
// after automation misses those can span weeks — "the last 3 days" must mean
// the last 3 CALENDAR days or the advisory claims recency the data doesn't
// have (the honest-degradation rule; see the steps incident).
export function computeDeloadSignal(healthDays) {
  const dayAge = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d.date}T12:00:00`)) / 86400000);
  const all = (healthDays || []).filter((d) => d.date);
  const withHrv = all.filter((d) => d.hrv != null && dayAge(d) <= 10);
  const recent = withHrv.filter((d) => dayAge(d) <= 3);
  const baseline = withHrv.filter((d) => dayAge(d) > 3);
  if (recent.length < 2 || baseline.length < 3) {
    return { advise: false, reason: `not enough recent recovery data (${recent.length} of the last 3 days have HRV, ${baseline.length} baseline days)` };
  }
  const avg = (list, key) => list.reduce((s, d) => s + d[key], 0) / list.length;
  const hrvDrop = (avg(baseline, 'hrv') - avg(recent, 'hrv')) / avg(baseline, 'hrv');

  const recentSleep = all.filter((d) => d.sleepAsleepMinutes != null && dayAge(d) <= 3);
  const sleepShort = recentSleep.length >= 3 && avg(recentSleep, 'sleepAsleepMinutes') < 360;

  if (hrvDrop >= 0.1) {
    return { advise: true, reason: `HRV is down ${Math.round(hrvDrop * 100)}% on your baseline across the last ${recent.length} logged day${recent.length === 1 ? '' : 's'} — a lighter session (−15% loads, stop 2-3 reps short) protects the trend` };
  }
  if (sleepShort) {
    return { advise: true, reason: 'under 6h sleep three nights running — cap intensity today and bank an early night' };
  }
  return { advise: false, reason: 'recovery trend looks steady' };
}

/* --------------------------- quick sessions ------------------------------ */

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Turn the Coach's JSON plan into session-editor exercises: map names onto
// the real library (so history and prefills attach), fall back to ad-hoc
// entries for genuinely new movements. Pure and exported for tests.
export function normalizeQuickPlan(plan, libraryExercises, exerciseState = {}) {
  const name = String(plan?.name || '').trim().slice(0, 60);
  const rationale = String(plan?.rationale || '').trim().slice(0, 300);
  const raw = Array.isArray(plan?.exercises) ? plan.exercises : [];
  if (!name || !raw.length) throw new Error('the plan came back incomplete — try again');

  const byName = new Map(libraryExercises.map((e) => [e.name.toLowerCase(), e]));
  const exercises = raw.slice(0, 10).map((x) => {
    const xName = String(x?.name || '').trim().slice(0, 80);
    if (!xName) return null;
    const sets = Math.min(8, Math.max(1, Number(x.sets) || 3));
    const reps = Math.min(50, Math.max(1, Number(x.reps) || 10));
    const tokens = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const want = tokens(xName);
    const lib = byName.get(xName.toLowerCase())
      || libraryExercises.find((e) => e.name.toLowerCase().includes(xName.toLowerCase()) || xName.toLowerCase().includes(e.name.toLowerCase()))
      // token subset: "chest supported row" matches "Chest-Supported Dumbbell Row"
      || libraryExercises.find((e) => {
        const have = tokens(e.name);
        return want.size >= 2 && [...want].every((t) => have.has(t));
      });
    const state = lib ? exerciseState[lib.id] : null;
    const lastWeight = state?.lastSets?.length ? Math.max(...state.lastSets.map((s) => Number(s.weight) || 0)) : 0;
    return {
      exerciseId: lib ? lib.id : `adhoc-${slug(xName)}`,
      name: lib ? lib.name : xName,
      muscleGroup: lib?.muscleGroup || '',
      trackingType: lib?.trackingType || 'weight_reps',
      targetSets: sets,
      targetRepsLow: reps,
      targetRepsHigh: reps,
      coach: null,
      weightHint: String(x.weightHint || '').slice(0, 40) || null,
      adhoc: !lib,
      sets: Array.from({ length: sets }, () => ({ weight: lastWeight, reps, done: false })),
    };
  }).filter(Boolean);
  if (!exercises.length) throw new Error('the plan had no usable exercises');
  return { name, rationale, exercises };
}

/* ------------------------------ e1RM trends ------------------------------ */

// Estimated 1RMs (Epley: w × (1 + reps/30)) from logged history — progress
// read as signal, not noise. Per exercise: current best over the recent
// window vs the best before it, so the Coach sees direction, not just a
// number. Sets above 12 reps are skipped (the formula degrades badly there).
export function estimateE1RMs(sessions, { recentCount = 6 } = {}) {
  const best = (list) => {
    const byExercise = new Map();
    for (const s of list) {
      for (const e of s.exercises) {
        for (const set of e.sets) {
          if (!set.weight || !set.reps || set.reps > 12) continue;
          const e1 = set.weight * (1 + set.reps / 30);
          const cur = byExercise.get(e.exerciseId);
          if (!cur || e1 > cur.e1rm) byExercise.set(e.exerciseId, { name: e.name, e1rm: Math.round(e1 * 2) / 2 });
        }
      }
    }
    return byExercise;
  };
  const recent = best(sessions.slice(0, recentCount));
  const prior = best(sessions.slice(recentCount));
  const out = [];
  for (const [id, cur] of recent) {
    const before = prior.get(id);
    out.push({ exerciseId: id, name: cur.name, e1rm: cur.e1rm, delta: before ? Math.round((cur.e1rm - before.e1rm) * 2) / 2 : null });
  }
  return out.sort((a, b) => b.e1rm - a.e1rm);
}

/* --------------------------- session summary ----------------------------- */

const volumeOf = (session) => Math.round(session.exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0));

// One deterministic line the moment a workout is logged — the receipt a
// good coach hands you on the way out. Drafted to the journal via the rails.
export async function draftSessionSummary(vaultPath, session) {
  const previous = (await loadSessions(vaultPath, { routineId: session.routineId, limit: 3 }))
    .filter((s) => s.id !== session.id)[0] || null;

  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = volumeOf(session);
  const bits = [`${session.routineName} logged — ${session.exercises.length} exercise${session.exercises.length === 1 ? '' : 's'}, ${sets} sets, ${volume.toLocaleString()}kg volume`];

  if (previous) {
    const prevVol = volumeOf(previous);
    if (prevVol > 0) {
      const delta = Math.round(((volume - prevVol) / prevVol) * 100);
      bits[0] += ` (${delta >= 0 ? '+' : ''}${delta}% on ${previous.date})`;
    }
    const prevTop = new Map(previous.exercises.map((e) => [e.exerciseId, Math.max(...e.sets.map((s) => s.weight))]));
    const ups = session.exercises
      .filter((e) => prevTop.has(e.exerciseId) && Math.max(...e.sets.map((s) => s.weight)) > prevTop.get(e.exerciseId))
      .map((e) => `${e.name} ${prevTop.get(e.exerciseId)}→${Math.max(...e.sets.map((s) => s.weight))}kg`);
    if (ups.length) bits.push(`Loads up: ${ups.join(', ')}.`);
  } else {
    bits.push('First logged session for this routine — the baseline is set.');
  }

  // stamp the same one-liner into the session file itself (best-effort)
  setSessionSummary(vaultPath, session.id, bits.join(' ')).catch(() => {});

  const title = `Session — ${session.routineName} ${session.date}`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'coach',
    text: title,
    source: 'coach',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: 'Coach’s deterministic session receipt — approve to journal it.',
      payload: { text: bits.join(' ') + (bits.length === 1 ? '.' : ''), category: 'training', label: 'Session receipt' },
    },
  };
  await createRecord(record);
  return record;
}

/* --------------- Coach program edits (proposed, never direct) ------------ */
// The Coach chat can PROPOSE a routine change: the model appends one
// `PROPOSE {json}` line, this code validates it against the REAL routines
// and exercise library (deterministic — unknown names are an honest error,
// never a guess), and a pending inbox record carries it to Hayden's thumb.
// Approval applies it through updateRoutine; undo restores the exact prior
// exercise list. Models decide, code acts.

export function parseCoachProposal(text) {
  const m = (text || '').match(/^\s*PROPOSE\s+(\{.*\})\s*$/m);
  if (!m) return { cleanText: text, proposal: null };
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    return { cleanText, proposal: JSON.parse(m[1]) };
  } catch {
    return { cleanText, proposal: null, parseError: 'the proposal block was not valid JSON' };
  }
}

const EDIT_ACTIONS = ['swap', 'add', 'remove', 'targets'];

export async function validateCoachEdit(vaultPath, raw) {
  const { loadExerciseLibrary } = await import('./exercises.js');
  const { loadRoutines } = await import('./workouts.js');
  const action = String(raw?.action || '').toLowerCase();
  if (!EDIT_ACTIONS.includes(action)) throw new Error(`unknown action "${raw?.action}"`);

  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines } = await loadRoutines(vaultPath, exercises);
  const ci = (s) => String(s || '').trim().toLowerCase();
  const routine = routines.find((r) => ci(r.name) === ci(raw.routine))
    || routines.find((r) => ci(r.name).includes(ci(raw.routine)) || ci(raw.routine).includes(ci(r.name)));
  if (!routine) throw new Error(`no routine called "${raw.routine}" (have: ${routines.map((r) => r.name).join(', ')})`);

  const findInRoutine = (name) => routine.exercises.find((e) => ci(e.name) === ci(name))
    || routine.exercises.find((e) => ci(e.name).includes(ci(name)) || ci(name).includes(ci(e.name)));
  const findInLibrary = (name) => exercises.find((e) => ci(e.name) === ci(name))
    || exercises.find((e) => ci(e.name).includes(ci(name)) || ci(name).includes(ci(e.name)));

  const payload = { action, routineId: routine.id, routineName: routine.name, reason: String(raw.reason || '').slice(0, 300) };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);

  if (action === 'swap' || action === 'remove' || action === 'targets') {
    const target = findInRoutine(raw.remove || raw.exercise);
    if (!target) throw new Error(`"${raw.remove || raw.exercise}" isn't in ${routine.name} (it has: ${routine.exercises.map((e) => e.name).join(', ')})`);
    payload.removeExerciseId = target.exerciseId;
    payload.removeName = target.name;
  }
  if (action === 'swap' || action === 'add') {
    const addName = String(raw.add || '').trim();
    if (!addName) throw new Error('the proposal names no exercise to add');
    const lib = findInLibrary(addName);
    payload.addExerciseId = lib ? lib.id : null; // null → created at approve time
    payload.addName = lib ? lib.name : addName.slice(0, 80);
    payload.muscleGroup = lib ? lib.muscleGroup : (raw.muscleGroup || null);
    payload.trackingType = lib ? lib.trackingType : (raw.trackingType || null);
  }
  if (action !== 'remove') {
    payload.targetSets = num(raw.targetSets, null);
    payload.targetRepsLow = num(raw.targetRepsLow, null);
    payload.targetRepsHigh = num(raw.targetRepsHigh, null);
  }

  const title = action === 'swap' ? `Coach: swap ${payload.removeName} → ${payload.addName} in ${routine.name}`
    : action === 'add' ? `Coach: add ${payload.addName} to ${routine.name}`
    : action === 'remove' ? `Coach: remove ${payload.removeName} from ${routine.name}`
    : `Coach: retarget ${payload.removeName} in ${routine.name}`;
  return { payload, title };
}

// A pending record the Inbox renders with Approve/Discard — the Coach's
// proposal, on the same rails as every other write. ALWAYS review-gated:
// program changes are confirm-first regardless of autonomy mode.
export async function createCoachEditRecord(vaultPath, { question, proposal, source = 'coach' }) {
  const { payload, title } = await validateCoachEdit(vaultPath, proposal);
  const record = {
    id: randomUUID().slice(0, 8),
    text: question.slice(0, 300),
    source,
    mode: 'review-all',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'routine-edit',
      confidence: 'high',
      title,
      reason: payload.reason || 'proposed in the Coach chat',
      payload,
    },
  };
  await createRecord(record);
  return record;
}

/* ------------------------ repeatedly-skipped work ------------------------ */
// An exercise that keeps NOT happening is a signal, not an accident: no time,
// no machine, a niggle, or it simply doesn't belong in the program any more.
// Deterministic detection here (counts only, from real logged sessions); the
// Coach asks WHY and may PROPOSE a swap or removal through the normal rails.
// A session counts as "attended" for a routine only if something was logged,
// so a rest week doesn't read as skipping.
const SKIP_LOOKBACK = 4;   // most recent sessions of that routine
const SKIP_THRESHOLD = 2;  // missing in this many of them

export function detectSkippedExercises(routines, sessions, { lookback = SKIP_LOOKBACK, threshold = SKIP_THRESHOLD } = {}) {
  const out = [];
  for (const routine of routines) {
    const done = sessions.filter((s) => s.routineId === routine.id).slice(0, lookback);
    if (done.length < threshold) continue; // not enough history to claim a pattern
    for (const entry of routine.exercises) {
      const missed = done.filter((s) => !s.exercises.some((e) => e.exerciseId === entry.exerciseId && e.sets?.length));
      if (missed.length < threshold) continue;
      const lastDone = sessions.find((s) => s.exercises.some((e) => e.exerciseId === entry.exerciseId && e.sets?.length));
      out.push({
        routineId: routine.id,
        routineName: routine.name,
        exerciseId: entry.exerciseId,
        name: entry.name,
        missed: missed.length,
        of: done.length,
        lastDoneDate: lastDone ? lastDone.date : null,
      });
    }
  }
  // A DROP-OFF (used to happen, now doesn't) is unambiguous; a never-logged
  // entry may simply be newly added to the program, so it ranks lower and
  // labels itself. Capped so the Coach sees a signal, not a wall.
  return out
    .sort((a, b) => (a.lastDoneDate ? 0 : 1) - (b.lastDoneDate ? 0 : 1) || b.missed - a.missed || a.name.localeCompare(b.name))
    .slice(0, 4);
}

// Context line for the Coach — facts only; the asking is the Coach's job.
export function skippedContext(skipped) {
  if (!skipped.length) return '';
  const bits = skipped.map((s) => `${s.name} in ${s.routineName} — missing from ${s.missed} of the last ${s.of} sessions${s.lastDoneDate ? ` (last done ${s.lastDoneDate} — a real drop-off)` : ' (never logged at all — it may simply be newly added to the program, so ask rather than assume)'}`);
  return `REPEATEDLY SKIPPED WORK (real counts from his logged sessions — raise the most significant ONE naturally, ask why (time? equipment? a niggle? just dislike it?), and only after hearing the reason offer a swap or removal as a PROPOSE. Never nag about more than one, and never assume the reason):\n- ${bits.join('\n- ')}`;
}
