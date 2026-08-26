import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// THE WEEKLY PROGRAM AUDIT — proof that Coach actually looked.
//
// The detectors in coachProgramReview.js already run daily and raise what
// they find. The gap this closes is the opposite case: SILENCE. Three of
// them (junk-volume, low-value, long-tenure) had never fired on his real
// data, and from the outside there is no way to tell "checked, nothing
// wrong" apart from "quietly broken and never ran". He asked for these to
// be real, actionable, and audited across the week — an audit is exactly
// the thing that makes a negative result trustworthy.
//
// The rule this module exists to enforce: A DETECTOR THAT CANNOT RUN MUST
// SAY SO. Never lower a threshold to manufacture a finding. Measured
// against his real log on 2026-08-25, all three silences were honest:
//
//   junk-volume  — ceiling is 22 hard sets/muscle/week; his peak was 18
//                  (Back, w/c 10 Aug). His volume sits in the productive
//                  band. Firing would mean telling him to cut work that is
//                  paying, which is the "changes for the sake of them" he
//                  objected to in the first place.
//   long-tenure  — needs 16 weeks of history; his log spans 5.4. Not
//                  mis-set, just early. It becomes answerable in November.
//   low-value    — needs 3 movements of one muscle in a routine, each with
//                  3+ sessions. Three groups qualified; none fired because
//                  every group's WORST movement was still gaining (+9%,
//                  +8%, +2% e1RM). A true negative.
//
// So the audit reports three states, and the middle one is the point:
//   fired   — findings raised, already on the inbox rails
//   clear   — ran, found nothing, HERE IS THE NUMBER that makes it clear
//   not-yet — cannot answer yet, here is what it still needs

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const AUDIT_PATH = () => path.join(dataRoot(), 'coach-audit.json');
const KEEP = 26; // half a year of weekly receipts

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function mondayOf(d) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

/* ------------------------------ the checks -------------------------------- */

// Each check declares what it needs BEFORE it runs, so "not-yet" carries a
// real gap ("5.4 of 16 weeks") rather than a shrug. `gate` returns null when
// the check is answerable, or the reason it is not.
export function buildChecks({ sessions, exercises, routines, weekly, goalMuscles, spanWeeks, ratedSets, maxWeeklySet, longestRun, ceiling, tenureWeeks }) {
  return [
    {
      id: 'mapping',
      label: 'Lifts filed under the wrong muscle',
      gate: () => (exercises.length ? null : 'no exercise library yet'),
      clear: () => `${exercises.length} lifts in the library, every name consistent with its filed muscle`,
    },
    {
      id: 'effort-ceiling',
      label: 'Training too close to failure, too often',
      gate: () => (ratedSets >= 100 ? null : `needs 100 RPE-rated sets, you have ${ratedSets}`),
      clear: () => `${ratedSets} rated sets, share at RPE 9-10 below the ceiling`,
    },
    {
      id: 'under-volume',
      label: 'A goal muscle chronically short',
      gate: () => (goalMuscles.length ? (weekly.length >= 3 ? null : `needs 3 logged weeks, you have ${weekly.length}`) : 'no goal muscles set'),
      clear: () => `${goalMuscles.length} goal muscle${goalMuscles.length === 1 ? '' : 's'} all at or above target for the last 3 weeks`,
    },
    {
      id: 'junk-volume',
      label: 'A muscle past the point more sets help',
      gate: () => (weekly.length >= 2 ? null : `needs 2 logged weeks, you have ${weekly.length}`),
      // The headroom IS the reassurance — it says how far from the edge he is.
      clear: () => `peak was ${maxWeeklySet} hard sets in a week against a ceiling of ${ceiling} — ${Math.max(0, ceiling - maxWeeklySet)} sets of headroom`,
    },
    {
      id: 'routine-oversized',
      label: 'A routine bigger than the session you finish',
      gate: () => (sessions.length >= 3 ? null : `needs 3 logged sessions, you have ${sessions.length}`),
      clear: () => `every routine gets finished at the rate it was written for`,
    },
    {
      id: 'low-value',
      label: 'A movement not paying for its place',
      gate: () => (routines.length ? null : 'no routines defined'),
      clear: () => 'in every muscle group with enough movements to compare, the weakest is still gaining',
    },
    {
      id: 'reported-form',
      label: 'Something you flagged yourself',
      gate: () => (sessions.length ? null : 'no sessions logged yet'),
      clear: () => 'nothing you have written about form or pain is repeating',
    },
    {
      id: 'stale',
      label: 'A lift flat for three weeks or more',
      gate: () => (sessions.length >= 4 ? null : `needs 4 logged sessions, you have ${sessions.length}`),
      clear: () => 'no lift has gone three weeks without moving',
    },
    {
      id: 'tenure',
      label: 'Same lift long enough to be worth rotating',
      gate: () => (spanWeeks >= tenureWeeks
        ? (longestRun >= 10 ? null : `needs one lift logged 10+ times, your most-logged is ${longestRun}`)
        : `needs ${tenureWeeks} weeks of history, you have ${spanWeeks.toFixed(1)}`),
      clear: () => `nothing has been in the program longer than ${tenureWeeks} weeks`,
    },
  ];
}

/* ------------------------------- the audit -------------------------------- */

export async function auditProgram(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  const {
    review = async () => (await import('./coachProgramReview.js')).reviewProgram(vaultPath, { now }),
    loadSessions = async () => (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 60 }),
    loadExercises = async () => (await import('./exercises.js')).loadExerciseLibrary(vaultPath).then((r) => r.exercises),
    goals = async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath),
    focusOf = async (g) => [...(await import('./trainOverview.js')).goalMuscles(g)],
    volume = async (s, e) => (await import('./trainingAnalytics.js')).weeklyMuscleVolume(s, e, { weeks: 4 }),
    loadRoutinesFor = async (e) => (await import('./workouts.js')).loadRoutines(vaultPath, e).then((r) => r.routines),
  } = deps;

  const { JUNK_VOLUME_CEILING, TENURE_WEEKS } = await import('./coachProgramReview.js');
  const [sessions, exercises] = await Promise.all([loadSessions(), loadExercises()]);
  const g = await goals().catch(() => null);
  const goalMuscles = await focusOf(g).catch(() => []);
  const weekly = await volume(sessions, exercises).catch(() => []);
  const routines = await loadRoutinesFor(exercises).catch(() => []);
  const { findings } = await review();

  // the shared measurements every check reasons from — computed once so the
  // audit can never disagree with itself about what the week contained
  const dates = sessions.map((s) => s.date).filter(Boolean).sort();
  const spanWeeks = dates.length > 1
    ? (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (7 * 86_400_000) : 0;
  let ratedSets = 0;
  const runs = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue;
      runs.set(ex.exerciseId, (runs.get(ex.exerciseId) || 0) + 1);
      for (const set of ex.sets || []) if (set.rpe != null) ratedSets++;
    }
  }
  const longestRun = runs.size ? Math.max(...runs.values()) : 0;
  const maxWeeklySet = weekly.length
    ? Math.max(0, ...weekly.flatMap((w) => Object.values(w.groups || {}))) : 0;

  const byKind = new Map();
  for (const f of findings) {
    // pain and form are one CHECK from his side — "something you flagged"
    const k = f.kind === 'reported-pain' ? 'reported-form' : f.kind;
    byKind.set(k, [...(byKind.get(k) || []), f]);
  }

  const checks = buildChecks({
    sessions, exercises, routines, weekly, goalMuscles, spanWeeks, ratedSets,
    maxWeeklySet, longestRun, ceiling: JUNK_VOLUME_CEILING, tenureWeeks: TENURE_WEEKS,
  }).map((c) => {
    const hits = byKind.get(c.id) || [];
    if (hits.length) {
      return { id: c.id, label: c.label, status: 'fired', count: hits.length, detail: hits[0].line };
    }
    const blocked = c.gate();
    if (blocked) return { id: c.id, label: c.label, status: 'not-yet', count: 0, detail: blocked };
    return { id: c.id, label: c.label, status: 'clear', count: 0, detail: c.clear() };
  });

  const fired = checks.filter((c) => c.status === 'fired');
  const clear = checks.filter((c) => c.status === 'clear');
  const notYet = checks.filter((c) => c.status === 'not-yet');

  return {
    at: now.toISOString(),
    weekOf: iso(mondayOf(now)),
    checks,
    findings,
    counts: { sessions: sessions.length, exercises: exercises.length, routines: routines.length, ratedSets },
    summary: summarise({ fired, clear, notYet }),
  };
}

// The spoken/written line. Says all three states in one breath, because "I
// checked eight things, six are clean" is the reassurance; naming only the
// problems is what makes an assistant feel like it is inventing work.
export function summarise({ fired, clear, notYet }) {
  const total = fired.length + clear.length + notYet.length;
  const bits = [`I ran ${total} checks over your program this week`];
  if (fired.length) {
    bits.push(`${fired.length} need${fired.length === 1 ? 's' : ''} a decision: ${fired.map((f) => f.label.toLowerCase()).join(', ')}`);
  } else {
    bits.push('nothing needs a decision');
  }
  if (clear.length) bits.push(`${clear.length} came back clean`);
  if (notYet.length) {
    bits.push(`${notYet.length} can't be answered yet (${notYet.map((n) => `${n.label.toLowerCase()} — ${n.detail}`).join('; ')})`);
  }
  return `${bits.join('; ')}.`;
}

/* ------------------------------- receipts --------------------------------- */

export async function readAuditLog() {
  if (!existsSync(AUDIT_PATH())) return [];
  try {
    const raw = JSON.parse(await readFile(AUDIT_PATH(), 'utf8'));
    return Array.isArray(raw.audits) ? raw.audits : [];
  } catch { return []; }
}

export async function writeAudit(entry) {
  const audits = await readAuditLog();
  // one receipt per week — a re-run replaces rather than stacks
  const next = [entry, ...audits.filter((a) => a.weekOf !== entry.weekOf)].slice(0, KEEP);
  await mkdir(path.dirname(AUDIT_PATH()), { recursive: true });
  await writeFile(AUDIT_PATH(), JSON.stringify({ audits: next }, null, 2), 'utf8');
  return next;
}

// Has this week already been audited? Keeps the weekly cadence weekly even
// though the scheduler ticks every half hour.
export async function auditedThisWeek(now = new Date()) {
  const week = iso(mondayOf(now));
  return (await readAuditLog()).some((a) => a.weekOf === week);
}

/* ------------------------- the weekly run + raise -------------------------- */

export async function runWeeklyAudit(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  const audit = await auditProgram(vaultPath, { ...deps, now });
  await writeAudit({
    at: audit.at, weekOf: audit.weekOf, counts: audit.counts, summary: audit.summary,
    checks: audit.checks.map(({ id, status, count, detail }) => ({ id, status, count, detail })),
  });

  // ONE record a week, never one per detector — the findings themselves are
  // already raised individually by raiseProgramFindings. This record is the
  // receipt that the sweep happened, which is the thing he could not see.
  const { createRecord } = deps.store || await import('./inboxStore.js');
  const { randomUUID } = await import('node:crypto');
  // createRecord stores the record VERBATIM — it does not mint an id or a
  // timestamp. Omitting them writes an unaddressable record that no route can
  // discard and no list can sort. Caught on the first live run.
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'coach-audit',
    findingKey: `audit:${audit.weekOf}`,
    source: 'coach',
    mode: 'draft',
    status: 'pending',
    text: `Coach: ${audit.summary}`,
    nudges: 0,
    createdAt: now.toISOString(),
    lastRaisedAt: now.toISOString(),
    meta: {
      weekOf: audit.weekOf,
      checks: audit.checks,
      fired: audit.checks.filter((c) => c.status === 'fired').map((c) => c.id),
    },
  });
  return { audit, record };
}
