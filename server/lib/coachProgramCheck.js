// THE WEEKLY PROGRAM CHECK (31 Oct 2026) — Coach proposing the changes, not
// reminding him of his own notes.
//
// His words that day: "It is making suggestions and keeps on bringing up past
// notes that I have written for things like 'you have flagged your form on
// the exercise twice' etc but it doesn't seem to be focussing on what really
// matters most and proactively suggesting changes to make to the program …
// If I'm not hitting the optimal sets for maximising muscle growth … coach
// should be proactively pointing this out to me and making suggestions on
// what needs to change but without adding lots of extra time to my workouts.
// This could be cutting some workouts and adding others or it could be
// changing exercises etc."
//
// What the record showed (his Inbox, 15–29 Oct): 18 program-review cards, 12
// of them his own pain/form notes read back to him; the three volume cards
// (19 Oct: Side Delts, Upper Back, Rear Delts short) were OBSERVATIONS with
// a fix of {action:'add-sets'} that opsFromFix maps to nothing, so a yes
// changed nothing and two were declined. The review ranked his notes above
// volume, and its two open slots were full of them.
//
// THE SHAPE (models decide, code acts):
//   CODE finds what matters, from his real program and log, against his
//   ranges (approved, or the ones Coach just proposed, or the default — and
//   every card says which): a goal muscle his PLAN cannot get into range, a
//   goal muscle the plan reaches but his weeks keep landing short of, a goal
//   muscle with no lift of its own, a muscle the plan pushes past its top
//   (minutes to win back). Ranked by goal impact.
//   THE MODEL (coach-program-check lane, read-only in the vault) proposes at
//   most three concrete changes as operations on his real routine and
//   exercise ids, fewest added minutes first, citing the notes it used.
//   CODE checks every change against the plan's own op vocabulary and real
//   ids, then COMPUTES what it does — the sets each muscle gains or loses on
//   his weekly template, and the minutes a week it adds or saves at HIS
//   measured minutes per set — and refuses one that moves none of the
//   muscles it claims to fix, drops a goal muscle under its floor, adds more
//   than MAX_ADDED_MINUTES a week, or swaps in a lift he turned down. The
//   numbers on the card are code's, never the model's.
//   THE CARD is the same coach-program record the study lane files
//   ({action:'ops'}), so his yes applies it through applyOps, undoably.
//
// THE GUARDS IT KEEPS (read, not bypassed): one exercise swap a week across
// every lane (the stall restraint's rule); a replacement he declined in the
// last 60 days is never offered again; one change is one card; at most three
// cards a run, and none while last run's cards still wait on him.

import { randomUUID, createHash } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { laneEnabled } from './modelPrefs.js';
import { rangeFor, VOLUME_RANGE, NON_VOLUME, canonicalGroup } from '../../src/muscleTaxonomy.js';
import { creditsById } from './muscleSecondary.js';
import { formatSets } from '../../src/muscleCredit.js';
import { mondayIso } from './cadence.js';

export const CHECK_LANE = 'coach-program-check';
export const CHECK_KIND = 'program-check';
export const MAX_CHANGES = 3;
export const MAX_ADDED_MINUTES = 15; // a week; "without adding lots of extra time"
export const DEFAULT_SET_MINUTES = 3.5;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const half = (n) => Math.round(n * 2) / 2;

/* --------------------------- his weekly template -------------------------- */

/**
 * What his weekly template credits each muscle, by the house rules (1 to the
 * primary, ½ to each audited secondary). A routine on two days counts twice.
 * Pure. Returns { perMuscle: {m: credit}, sets, days: [{day, routineId, name, sets}] }.
 */
export function templateWeek(routines = [], schedule = {}, exercises = []) {
  const credits = creditsById(exercises);
  const perMuscle = {};
  let sets = 0;
  const days = [];
  for (const day of DAYS) {
    const r = routines.find((x) => x.id === schedule?.[day]);
    if (!r) continue;
    let n = 0;
    for (const e of r.exercises || []) {
      const s = Number(e.targetSets) || 0;
      const c = credits.get(e.exerciseId) || [];
      if (!c.length) continue; // mobility, grip, unaudited: no volume
      n += s;
      for (const { muscle, credit } of c) perMuscle[muscle] = (perMuscle[muscle] || 0) + credit * s;
    }
    sets += n;
    days.push({ day, routineId: r.id, name: r.name, sets: n });
  }
  for (const k of Object.keys(perMuscle)) perMuscle[k] = half(perMuscle[k]);
  return { perMuscle, sets, days };
}

/**
 * The last `n` COMPLETED weeks (never the one in progress). A week counts as
 * one he actually trained only with `minSessions` sessions in it: a week of
 * one session is a week away, not a programming pattern (his 19 Oct week).
 */
export function completedWeeks(weekly = [], { now = new Date(), n = 3, sessions = null, minSessions = 3 } = {}) {
  const thisMonday = mondayIso(now);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const d = new Date(`${thisMonday}T12:00:00`);
    d.setDate(d.getDate() - 7 * k);
    const week = mondayIso(d);
    const w = weekly.find((x) => x.week === week);
    const count = sessions ? sessions.filter((s) => mondayIso(new Date(`${s.date}T12:00:00`)) === week).length : null;
    out.push({ week, groups: w?.groups || {}, sessions: count, trained: !!w && (count == null || count >= minSessions) });
  }
  return out;
}

/** This week by Sunday (lib/muscleWeek.js), planned the way the week sheet plans it. */
export async function thisWeekModel({ routines, schedule, sessions, exercises, goalMuscles, ranges }) {
  try {
    const { muscleWeek } = await import('./muscleWeek.js');
    const { listCarryovers } = await import('./workoutCarryover.js');
    const { listDayPlans } = await import('./extraWorkouts.js');
    const { todayIso } = await import('./makeupDay.js');
    const start = mondayIso(new Date());
    const sunday = (() => { const d = new Date(`${start}T12:00:00`); d.setDate(d.getDate() + 6); return todayIso(d); })();
    const liveIds = new Set(routines.map((r) => r.id));
    const dayPlans = (await listDayPlans({ from: start, to: sunday }).catch(() => []))
      .map((p) => ({ date: p.date, routineIds: p.routineIds.filter((id) => liveIds.has(id)) }))
      .filter((p) => p.routineIds.length >= 2);
    const w = muscleWeek({ routines, schedule, sessions, exercises, goalMuscles, ranges, carryovers: await listCarryovers().catch(() => []), dayPlans });
    return w?.muscles || null;
  } catch { return null; }
}

/**
 * HIS minutes per working set, measured: on a day with one strength session
 * and one strength workout on his watch, the watch minutes over the logged
 * sets; the median across days. The fallback is said to be an estimate.
 */
export function perSetMinutes(pairs = []) {
  const xs = pairs.filter((p) => p.minutes > 10 && p.sets >= 6).map((p) => p.minutes / p.sets).sort((a, b) => a - b);
  if (xs.length < 3) return { minutes: DEFAULT_SET_MINUTES, measured: false, days: xs.length };
  const mid = Math.floor(xs.length / 2);
  const med = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { minutes: Math.round(med * 10) / 10, measured: true, days: xs.length };
}

/* -------------------------------- detection ------------------------------- */

/**
 * What matters this week, ranked by goal impact. Pure.
 *   plan-short     a goal muscle his template cannot get to its floor
 *   landing-short  the template reaches the floor, his weeks keep missing it
 *   no-direct      a goal muscle with no lift of its own in the program
 *   plan-over      a muscle the template pushes past its top (time to win back)
 */
export function detectGaps({ template, completed = [], thisWeek = null, ranges = null, goalMuscles = [], routines = [], exercises = [], schedule = {} } = {}) {
  const out = [];
  const credits = creditsById(exercises);
  const scheduled = new Set(Object.values(schedule || {}));
  const primaries = new Set();
  for (const r of routines) {
    if (!scheduled.has(r.id)) continue;
    for (const e of r.exercises || []) {
      const c = credits.get(e.exerciseId) || [];
      if (c[0]?.credit === 1) primaries.add(c[0].muscle);
    }
  }
  for (const m of goalMuscles) {
    const [low, high] = rangeFor(m, ranges);
    const planned = template.perMuscle[m] || 0;
    const weeks = completed.map((w) => half(w.groups[m] || 0));
    const landed = completed.filter((w) => w.trained);
    const shortWeeks = landed.filter((w) => (w.groups[m] || 0) < low).length;
    const bySunday = thisWeek?.find?.((x) => x.muscle === m)?.bySunday ?? null;
    const base = { muscle: m, goal: true, low, high, planned, weeks, bySunday };
    if (planned < low) {
      const extra = bySunday != null && bySunday >= low ? ` (this week reaches ${formatSets(bySunday)} only because of a session added on top of the template)` : '';
      out.push({ ...base, kind: 'plan-short', gap: half(low - planned), line: `${m}: your weekly plan credits ${formatSets(planned)} sets against a floor of ${low} — the plan itself cannot get there${extra}.` });
    } else if (landed.length >= 2 && shortWeeks >= 2 && (bySunday == null || bySunday < low)) {
      const avg = half(landed.reduce((n, w) => n + (w.groups[m] || 0), 0) / landed.length);
      out.push({ ...base, kind: 'landing-short', gap: half(low - avg), line: `${m}: the plan reaches ${formatSets(planned)}, but ${shortWeeks} of your last ${landed.length} weeks landed under ${low} (averaging ${formatSets(avg)}) — the sets sit on a day you do not reliably train.` });
    }
    if (!primaries.has(m)) {
      out.push({ ...base, kind: 'no-direct', gap: 0, line: `${m}: no lift in your scheduled program trains it first; it only collects ½ credits from other lifts.` });
    }
  }
  for (const [m, planned] of Object.entries(template.perMuscle)) {
    if (NON_VOLUME.has(m) || m === 'Other') continue;
    const [low, high] = rangeFor(m, ranges);
    if (planned > high) out.push({ muscle: m, goal: goalMuscles.includes(m), low, high, planned, kind: 'plan-over', excess: half(planned - high), gap: 0, line: `${m}: your weekly plan credits ${formatSets(planned)} sets, past the top of its range (${high}) — those sets cost time and recovery and buy no growth.` });
  }
  const RANK = { 'plan-short': 0, 'landing-short': 1, 'no-direct': 2, 'plan-over': 3 };
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.gap || b.excess || 0) - (a.gap || a.excess || 0));
}

/* ------------------------------ the template ops -------------------------- */

const ALLOWED = new Set(['prescribe', 'swap', 'add', 'remove']);

/** The ops applied to a COPY of his routines. Pure; throws a plain reason. */
export function applyToTemplate(routines, ops, exercises = []) {
  const ids = new Set(exercises.map((e) => e.id));
  const copy = routines.map((r) => ({ ...r, exercises: (r.exercises || []).map((e) => ({ ...e })) }));
  const routineOf = (id) => {
    const r = copy.find((x) => x.id === id);
    if (!r) throw new Error(`routine ${id} is not in his plan`);
    return r;
  };
  const okSets = (n) => Number.isInteger(n) && n >= 1 && n <= 8;
  for (const op of ops) {
    if (!op || !ALLOWED.has(op.op)) throw new Error(`"${op?.op}" is not an operation this check may use`);
    const r = routineOf(op.routineId);
    const at = r.exercises.findIndex((e) => e.exerciseId === op.exerciseId);
    if (op.op === 'prescribe') {
      if (at < 0) throw new Error(`${op.exerciseId} is not in ${r.name}`);
      if (op.targetSets != null) {
        const n = Number(op.targetSets);
        if (!okSets(n)) throw new Error(`${n} sets is not 1-8`);
        r.exercises[at].targetSets = n;
      }
      for (const k of ['targetRepsLow', 'targetRepsHigh']) if (op[k] != null) r.exercises[at][k] = Number(op[k]);
    } else if (op.op === 'remove') {
      if (at < 0) throw new Error(`${op.exerciseId} is not in ${r.name}`);
      r.exercises.splice(at, 1);
    } else if (op.op === 'add') {
      if (!ids.has(op.exerciseId)) throw new Error(`${op.exerciseId} is not in his library`);
      if (at >= 0) throw new Error(`${op.exerciseId} is already in ${r.name}`);
      const n = Number(op.targetSets) || 3;
      if (!okSets(n)) throw new Error(`${n} sets is not 1-8`);
      r.exercises.push({ exerciseId: op.exerciseId, targetSets: n, targetRepsLow: Number(op.targetRepsLow) || 8, targetRepsHigh: Number(op.targetRepsHigh) || 12 });
    } else if (op.op === 'swap') {
      if (at < 0) throw new Error(`${op.exerciseId} is not in ${r.name}`);
      if (!ids.has(op.replaceWith)) throw new Error(`${op.replaceWith} is not in his library`);
      if (r.exercises.some((e) => e.exerciseId === op.replaceWith)) throw new Error(`${op.replaceWith} is already in ${r.name}`);
      r.exercises[at] = { ...r.exercises[at], exerciseId: op.replaceWith };
    }
  }
  return copy;
}

/**
 * What a change does to his weekly template: per muscle before → after, the
 * sets a week added or saved, and the minutes at his per-set time. Pure.
 */
export function effectOf({ routines, schedule, exercises, ops, ranges = null, minutesPerSet = DEFAULT_SET_MINUTES }) {
  const before = templateWeek(routines, schedule, exercises);
  const after = templateWeek(applyToTemplate(routines, ops, exercises), schedule, exercises);
  const muscles = new Set([...Object.keys(before.perMuscle), ...Object.keys(after.perMuscle)]);
  const moves = [];
  for (const m of muscles) {
    const b = before.perMuscle[m] || 0;
    const a = after.perMuscle[m] || 0;
    const delta = half(a - b);
    if (!delta) continue;
    const [low, high] = rangeFor(m, ranges);
    moves.push({ muscle: m, before: b, after: a, delta, low, high });
  }
  moves.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const setsDelta = after.sets - before.sets;
  // a number or nothing: a NaN here slipped past the minutes guard once
  const perSet = Number(typeof minutesPerSet === 'object' ? minutesPerSet?.minutes : minutesPerSet);
  if (!Number.isFinite(perSet) || perSet <= 0) throw new Error('minutes per set is not a number');
  return { moves, setsDelta, minutes: Math.round(setsDelta * perSet) };
}

/* -------------------------------- the ask --------------------------------- */

export function renderProgram(routines, schedule, exercises) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const credits = creditsById(exercises);
  const days = (id) => DAYS.filter((d) => schedule?.[d] === id).join(', ') || 'not on the weekly schedule';
  return routines.map((r) => `${r.id} — ${r.name} (${days(r.id)}):\n${(r.exercises || []).map((e) => {
    const c = credits.get(e.exerciseId) || [];
    const what = c.length ? c.map((x) => `${x.muscle}${x.credit < 1 ? ' ½' : ''}`).join(', ') : 'no volume credit';
    return `  ${e.exerciseId} (${byId.get(e.exerciseId)?.name || e.exerciseId}) ${e.targetSets}×${e.targetRepsLow}-${e.targetRepsHigh} → ${what}`;
  }).join('\n')}`).join('\n');
}

export function renderLibrary(exercises) {
  const credits = creditsById(exercises);
  return exercises.map((e) => {
    const c = credits.get(e.id) || [];
    if (!c.length) return null; // unaudited or non-volume: never offered
    return `${e.id} — ${e.name} (${c.map((x) => `${x.muscle}${x.credit < 1 ? ' ½' : ''}`).join(', ')})`;
  }).filter(Boolean).join('\n');
}

export function buildCheckPrompt({ goal, goalMuscles, rangesLabel, rangesLine, gaps, program, library, minutesPerSet, sessionMinutes, evidence, declined = [], swapAllowed = true, today, him = '' }) {
  return `${NOVA_LENS}

You are Nova's strength Coach, running Hayden's weekly program check (${today}). Code has already measured his week; your job is the part only a coach can do: the FEWEST, SMALLEST changes to his program that get his goal muscles into their growth range, without adding lots of time to his workouts. His words: "This could be cutting some workouts and adding others or it could be changing exercises."

${him ? `${him}

` : ''}HIS GOAL: ${goal || '(none written)'}
GOAL MUSCLES: ${goalMuscles.join(', ')}
THE RANGES HE IS JUDGED AGAINST (${rangesLabel}): ${rangesLine}
SET COUNTING: 1 per set to a lift's primary muscle, ½ to each audited secondary.

WHAT CODE FOUND, MOST IMPORTANT FIRST:
${gaps.map((g, i) => `${i + 1}. ${g.line}`).join('\n')}

HIS PROGRAM (routineId — name (days): exerciseId (name) sets×reps → muscles it credits):
${program}

TIME: his measured ${minutesPerSet.minutes} min per working set${minutesPerSet.measured ? ` (median of ${minutesPerSet.days} watch-timed sessions)` : ' (an estimate: too few watch-timed sessions)'}. ${sessionMinutes || ''}

EVIDENCE IN HIS VAULT YOU MAY CITE (Read any in full):
${evidence.map((e) => `- ${e.path} — "${e.title}" (${e.kind})`).join('\n') || '(none)'}

${declined.length ? `REPLACEMENTS HE TURNED DOWN IN THE LAST 60 DAYS (never offer these): ${declined.join(', ')}\n` : ''}LIBRARY (only these may be added or swapped in; id — name (muscles)):
${library}

Rules:
- At most ${MAX_CHANGES} changes, the biggest gap first. Each change is ONE card he answers with yes or no, so each must stand on its own.
- Least time first: add a set or two to a lift that already trains the short muscle, move sets from a muscle past its top to one under its floor, swap a lift for one that trains the short muscle first, or cut or merge a day that costs time and buys little. Adding a brand-new exercise is the last resort.
- Never push a goal muscle under its floor or past its top. A change may add at most ${MAX_ADDED_MINUTES} minutes a week; cutting time is welcome.
- ${swapAllowed ? 'At most ONE change may swap an exercise (his standing rule: one exercise change a week).' : 'NO swaps this week: an exercise change was already raised in the last seven days (his standing rule).'}
- Use only the ids above. Code computes the sets and minutes each change moves; do not state numbers in "why" that you have not read in his program or the evidence.
- Allowed operations, nothing else:
  {"op":"prescribe","routineId":"…","exerciseId":"…","targetSets":N}
  {"op":"add","routineId":"…","exerciseId":"…","targetSets":N,"targetRepsLow":N,"targetRepsHigh":N}
  {"op":"remove","routineId":"…","exerciseId":"…"}
  {"op":"swap","routineId":"…","exerciseId":"…","replaceWith":"…"}

Return ONLY a JSON object, no code fences:
{
  "changes": [
    { "title": "<what changes, in one line, to him: e.g. 'Machine Lateral Raise: 4 → 6 sets on Upper'>", "fixes": ["<the muscle(s) from the list above this closes>"], "ops": [ … ], "why": "<one or two sentences to him (you/your): why this change, from the evidence>", "evidence": ["<exact path from the evidence list>"] }
  ],
  "discuss": ["<anything worth a conversation that is not a clean change, with why>"]
}`;
}

/* ------------------------------ the validation ---------------------------- */

const opsKey = (ops) => createHash('sha1').update(JSON.stringify(ops)).digest('hex').slice(0, 10);

/**
 * The model's answer, checked by code, with every number on the card computed
 * here. Returns { accepted: [change], refused: [{title, why}], discuss }.
 */
export function validateChanges(raw, ctx) {
  const { routines, schedule, exercises, ranges = null, gaps = [], goalMuscles = [], minutesPerSet = DEFAULT_SET_MINUTES,
    evidence = [], declined = new Set(), swapAllowed = true, pendingKeys = new Set(), parse } = ctx;
  let o;
  try { o = parse(raw); } catch { return { accepted: [], refused: [{ title: '(the whole answer)', why: 'not readable JSON' }], discuss: [] }; }
  if (!o) return { accepted: [], refused: [{ title: '(the whole answer)', why: 'held no JSON object' }], discuss: [] };
  const credits = creditsById(exercises);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const known = new Map(evidence.map((e) => [e.path, e]));
  const shortOnes = new Set(gaps.filter((g) => g.kind !== 'plan-over').map((g) => g.muscle));
  const overOnes = new Set(gaps.filter((g) => g.kind === 'plan-over').map((g) => g.muscle));
  const accepted = [];
  const refused = [];
  let swaps = swapAllowed ? 1 : 0;
  for (const c of (Array.isArray(o.changes) ? o.changes : []).slice(0, MAX_CHANGES + 2)) {
    const title = String(c?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const no = (why) => refused.push({ title: title || '(untitled)', why });
    if (!title) { no('no title'); continue; }
    const ops = Array.isArray(c?.ops) ? c.ops.map((op) => ({ ...op })) : [];
    if (!ops.length || ops.length > 6) { no('needs 1-6 operations'); continue; }
    const hasSwap = ops.some((op) => op.op === 'swap');
    let effect;
    try {
      for (const op of ops) {
        const into = op.op === 'swap' ? op.replaceWith : op.op === 'add' ? op.exerciseId : null;
        if (!into) continue;
        if (!(credits.get(into) || []).length) throw new Error(`${byId.get(into)?.name || into} is not audited, so its sets would count for nothing`);
        if (declined.has(into)) throw new Error(`he turned ${byId.get(into)?.name || into} down as a replacement in the last 60 days`);
      }
      effect = effectOf({ routines, schedule, exercises, ops, ranges, minutesPerSet });
    } catch (e) { no(e.message); continue; }
    if (hasSwap && swaps <= 0) { no('one exercise change a week (his standing rule) — already used'); continue; }
    const key = opsKey(ops);
    if (pendingKeys.has(key)) { no('the same change is already waiting on him'); continue; }
    const fixes = [...new Set((Array.isArray(c?.fixes) ? c.fixes : []).map(canonicalGroup).filter(Boolean))];
    const moved = new Map(effect.moves.map((m) => [m.muscle, m]));
    const closes = fixes.filter((m) => (shortOnes.has(m) && (moved.get(m)?.delta || 0) >= 1) || (overOnes.has(m) && (moved.get(m)?.delta || 0) <= -1));
    if (!closes.length) { no(`moves none of the muscles it claims to fix (${fixes.join(', ') || 'none named'}) by a whole set`); continue; }
    const hurt = effect.moves.find((m) => goalMuscles.includes(m.muscle) && m.before >= m.low && m.after < m.low);
    if (hurt) { no(`drops ${hurt.muscle} under its floor (${formatSets(hurt.before)} → ${formatSets(hurt.after)} of ${hurt.low})`); continue; }
    const over = effect.moves.find((m) => goalMuscles.includes(m.muscle) && m.before <= m.high && m.after > m.high);
    if (over) { no(`pushes ${over.muscle} past its top (${formatSets(over.after)} of ${over.high})`); continue; }
    if (effect.minutes > MAX_ADDED_MINUTES) { no(`adds ~${effect.minutes} min a week, more than ${MAX_ADDED_MINUTES}`); continue; }
    if (hasSwap) swaps -= 1;
    const cited = (Array.isArray(c?.evidence) ? c.evidence : []).map(String).filter((p) => known.has(p));
    // goal impact: closing a short muscle's gap always outranks winning time
    // back ("the biggest gaps first"); among those, the sets that close the
    // gap; then sets cut from past the top; fewer minutes breaks a tie
    const gapOf = new Map(gaps.map((g) => [g.muscle, g]));
    const impact = closes.reduce((n, m) => {
      const g = gapOf.get(m);
      const d = moved.get(m)?.delta || 0;
      return n + (g && g.kind !== 'plan-over' ? 100 * Math.min(d, g.gap || d) : Math.abs(d));
    }, 0);
    accepted.push({
      title, fixes: closes, ops, key, impact,
      why: String(c?.why || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      evidence: cited.map((p) => ({ path: p, title: known.get(p).title })),
      moves: effect.moves, setsDelta: effect.setsDelta, minutes: effect.minutes, hasSwap,
    });
  }
  accepted.sort((a, b) => b.impact - a.impact || a.minutes - b.minutes);
  return {
    accepted: accepted.slice(0, MAX_CHANGES),
    refused: [...refused, ...accepted.slice(MAX_CHANGES).map((a) => ({ title: a.title, why: `more than ${MAX_CHANGES} changes` }))],
    discuss: (Array.isArray(o.discuss) ? o.discuss : []).map((d) => String(d).replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean).slice(0, 4),
  };
}

/* -------------------------------- the card -------------------------------- */

const signed = (n) => `${n > 0 ? '+' : '−'}${formatSets(Math.abs(n))}`;

/** "Side Delts +2, Rear Delts +1 sets a week; adds ~7 min a week." Code's sentence. */
export function movesLine(change, minutesPerSet) {
  const shown = change.moves.filter((m) => change.fixes.includes(m.muscle) || Math.abs(m.delta) >= 1).slice(0, 4);
  const sets = shown.map((m) => `${m.muscle} ${signed(m.delta)} (${formatSets(m.before)} → ${formatSets(m.after)} of ${m.low}–${m.high})`).join(', ');
  const time = change.minutes === 0 ? 'no change in time' : change.minutes > 0 ? `adds ~${change.minutes} min a week` : `saves ~${-change.minutes} min a week`;
  return `${sets} sets a week; ${time}${minutesPerSet?.measured ? '' : ' (estimated)'}.`;
}

export function programCardRecord(change, { week, rank = 0, rangesLabel, minutesPerSet, now = new Date() }) {
  const line = `${change.title}. ${movesLine(change, minutesPerSet)}${change.why ? ` ${change.why}` : ''}${change.evidence.length ? ` (From: ${change.evidence.map((e) => e.title).join('; ')}.)` : ''}`;
  return {
    id: randomUUID().slice(0, 8),
    kind: 'coach-program',
    findingKey: `${CHECK_KIND}:${week}:${change.key}`,
    findingKind: CHECK_KIND,
    finding: {
      kind: CHECK_KIND, title: change.title, rank, week,
      fixes: change.fixes, moves: change.moves, setsDelta: change.setsDelta, minutesPerWeek: change.minutes,
      perSetMinutes: minutesPerSet?.minutes ?? null, measured: !!minutesPerSet?.measured,
      against: rangesLabel, evidence: change.evidence, opsKey: change.key, why: change.why,
      ...(change.hasSwap ? { exerciseChange: true } : {}),
    },
    fix: { action: 'ops', ops: change.ops },
    text: `Coach: ${line}`,
    originalText: `Coach: ${line}`,
    source: 'coach',
    mode: 'draft',
    status: 'pending',
    nudges: 0,
    lastRaisedAt: now.toISOString(),
    // ranked: the deck orders a run's cards by createdAt, so the biggest gap is first
    createdAt: new Date(now.getTime() + rank).toISOString(),
  };
}

/* -------------------------- which ranges, and why ------------------------- */

/**
 * The ranges a check judges against, and the words that say which: a ranges
 * card still waiting on him (Coach's proposal), else his approved ranges,
 * else the default. Pure.
 */
export function effectiveRanges(goals, records = [], { pendingKeyPrefix = 'coach-ranges:' } = {}) {
  const pending = records.find((r) => r.status === 'pending' && String(r.key || '').startsWith(pendingKeyPrefix));
  const proposed = pending?.decision?.payload?.settings?.volumeRanges;
  if (proposed) return { ranges: proposed, label: `the ranges Coach proposed from your research on ${String(pending.key).slice(pendingKeyPrefix.length)}, waiting on your yes`, source: 'proposed' };
  if (goals?.volumeRanges) {
    const src = goals.volumeRangesSource;
    return { ranges: goals.volumeRanges, label: src?.date ? `your ranges, from your research (${src.date})` : 'your ranges', source: 'his' };
  }
  return { ranges: null, label: `the ${VOLUME_RANGE[0]}-${VOLUME_RANGE[1]} default (no ranges of your own yet)`, source: 'default' };
}

export function rangesLineOf(ranges, muscles) {
  return muscles.map((m) => { const [lo, hi] = rangeFor(m, ranges); return `${m} ${lo}-${hi}`; }).join(', ');
}

/* --------------------------------- the run -------------------------------- */

const SWAP_KINDS = new Set(['stale', 'tenure']);

/** Was an exercise change raised by ANY lane in the last 7 days? (the stall restraint's rule) */
export function exerciseChangeThisWeek(records = [], now = Date.now()) {
  return records.some((r) => r.kind === 'coach-program'
    && (SWAP_KINDS.has(r.findingKind) || r.finding?.exerciseChange)
    && now - new Date(r.createdAt || 0).getTime() < 7 * 86_400_000);
}

export function declinedReplacements(records = [], now = Date.now()) {
  const out = new Set();
  for (const r of records) {
    if (r.kind !== 'coach-program' || r.status !== 'discarded') continue;
    if (now - new Date(r.discardedAt || r.createdAt || 0).getTime() > 60 * 86_400_000) continue;
    if (r.fix?.action === 'swap' && r.fix.replaceWith) out.add(r.fix.replaceWith);
    for (const op of r.fix?.action === 'ops' ? r.fix.ops || [] : []) if (op.op === 'swap' && op.replaceWith) out.add(op.replaceWith);
  }
  return out;
}

/**
 * One weekly check. Code gathers and detects; the model proposes; code
 * validates, computes and files (or hands the records to `file`).
 */
export async function runProgramCheck(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  if (!(deps.laneEnabled || laneEnabled)(CHECK_LANE)) return { status: 'off', why: 'the coach-program-check lane is switched off' };
  const listRecords = deps.listRecords || (await import('./inboxStore.js')).listRecords;
  const records = [...(await listRecords()), ...(deps.extraRecords || [])];
  const week = mondayIso(now);
  const waiting = records.filter((r) => r.kind === 'coach-program' && r.findingKind === CHECK_KIND && r.status === 'pending');
  if (waiting.length && !deps.force) return { status: 'skipped', why: `${waiting.length} program-check card(s) still wait on him` };

  const { loadExerciseLibrary } = await import('./exercises.js');
  const { loadRoutines } = await import('./workouts.js');
  const { exercises } = deps.exercises ? { exercises: deps.exercises } : await loadExerciseLibrary(vaultPath);
  const { routines, schedule } = deps.plan || await loadRoutines(vaultPath, exercises);
  const sessions = deps.sessions || await (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 60 });
  const g = await (deps.goals || (async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath)))().catch(() => null);
  const goalMuscles = deps.goalMuscles || [...(await import('./trainOverview.js')).goalMuscles(g)];
  const eff = effectiveRanges(g, records);
  const weekly = (await import('./trainingAnalytics.js')).weeklyMuscleVolume(sessions, exercises, { weeks: 6 });
  const template = templateWeek(routines, schedule, exercises);
  const completed = completedWeeks(weekly, { now, sessions });
  const thisWeek = deps.thisWeek !== undefined ? deps.thisWeek : await thisWeekModel({ routines, schedule, sessions, exercises, goalMuscles, ranges: eff.ranges });
  const gaps = detectGaps({ template, completed, thisWeek, ranges: eff.ranges, goalMuscles, routines, exercises, schedule });
  if (!gaps.length) return { status: 'clean', why: `every goal muscle reaches ${eff.label} on the plan, and nothing runs past its top`, gaps };

  const timing = deps.timing || await sessionTiming(sessions, exercises);
  const minutesPerSet = perSetMinutes(timing);
  const sessionMinutes = sessionMinutesLine(timing);
  const evidence = deps.evidence || await gatherEvidence(vaultPath, { goalMuscles: gaps.map((x) => x.muscle) });
  const declined = declinedReplacements(records, now.getTime());
  const swapAllowed = !exerciseChangeThisWeek(records, now.getTime());
  const him = await (deps.profileContext || (async () => (await import('./profile.js')).profileContext(vaultPath)))().catch(() => '');
  const prompt = buildCheckPrompt({
    him,
    goal: g?.goal, goalMuscles, rangesLabel: eff.label, rangesLine: rangesLineOf(eff.ranges, [...new Set([...goalMuscles, ...gaps.map((x) => x.muscle)])]),
    gaps, program: renderProgram(routines, schedule, exercises), library: renderLibrary(exercises), minutesPerSet, sessionMinutes,
    evidence, declined: [...declined].map((id) => exercises.find((e) => e.id === id)?.name || id), swapAllowed, today: now.toISOString().slice(0, 10),
  });
  const ask = deps.ask || (async (p) => (await import('./coachRanges.js')).askVault(p, { lane: CHECK_LANE, vaultPath }));
  let answer;
  try { answer = await ask(prompt); } catch (e) { return { status: 'error', why: e.message, gaps }; }
  const text = typeof answer === 'string' ? answer : answer?.text;
  const { parseModelJson, firstBalancedObjectMatch } = await import('./jsonSalvage.js');
  const parse = (raw) => { const m = firstBalancedObjectMatch(String(raw || '')); return m ? parseModelJson(m[0]) : null; };
  const pendingKeys = new Set(records.filter((r) => r.status === 'pending' && r.finding?.opsKey).map((r) => r.finding.opsKey));
  const v = validateChanges(text, { routines, schedule, exercises, ranges: eff.ranges, gaps, goalMuscles, minutesPerSet: minutesPerSet.minutes, evidence, declined, swapAllowed, pendingKeys, parse });
  const file = deps.file || (async (r) => (await import('./inboxStore.js')).createRecord(r));
  const filed = [];
  for (const [i, c] of v.accepted.entries()) {
    const rec = programCardRecord(c, { week, rank: i, rangesLabel: eff.label, minutesPerSet, now });
    await file(rec);
    filed.push(rec);
  }
  return { status: filed.length ? 'filed' : 'refused', gaps, filed, refused: v.refused, discuss: v.discuss, minutesPerSet, ranges: eff, cost: answer?.costUsd ?? null };
}

// His watch-timed strength sessions: watch minutes beside the sets he logged
// that day, only where both are one-of (a two-a-day cannot be split honestly).
async function sessionTiming(sessions, exercises) {
  try {
    const { workoutsForDay } = await import('./healthWorkouts.js');
    const { isWorkingSet } = await import('./trainingAnalytics.js');
    const credits = creditsById(exercises);
    const byDay = new Map();
    for (const s of sessions.slice(0, 30)) byDay.set(s.date, [...(byDay.get(s.date) || []), s]);
    const out = [];
    for (const [date, list] of byDay) {
      if (list.length !== 1) continue;
      const strength = (await workoutsForDay(date).catch(() => [])).filter((w) => /strength|functional/i.test(w.type || ''));
      if (strength.length !== 1) continue;
      const sets = (list[0].exercises || []).filter((e) => (credits.get(e.exerciseId) || []).length).reduce((n, e) => n + (e.sets || []).filter(isWorkingSet).length, 0);
      out.push({ date, routine: list[0].routineName || '', minutes: strength[0].minutesExact || strength[0].minutes, sets });
    }
    return out;
  } catch { return []; }
}

/** "Measured session lengths: Upper ~78 min (2), Push ~74 min (3)." Pure. */
export function sessionMinutesLine(timing = []) {
  const by = new Map();
  for (const t of timing) {
    if (!t.routine || !(t.minutes > 10)) continue;
    by.set(t.routine, [...(by.get(t.routine) || []), t.minutes]);
  }
  if (!by.size) return '';
  return `Measured session lengths on his watch: ${[...by].map(([r, xs]) => `${r} ~${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)} min (${xs.length})`).join(', ')}.`;
}

// The notes a change may cite: his ranges research plus the notes named for
// a muscle in question (a side-delt brief for a side-delt gap).
const MUSCLE_WORDS = {
  'Side Delts': /side[- ]?delt|lateral raise/i, 'Rear Delts': /rear[- ]?delt|reverse (pec|fly)/i, 'Front Delts': /front[- ]?delt|shoulder press/i,
  Lats: /\blats?\b|pulldown|pull-?up/i, 'Upper Back': /upper back|\brows?\b/i, Biceps: /bicep|curl|\barms?\b/i, Triceps: /tricep|\barms?\b/i,
  Chest: /chest|bench|press/i, Quads: /quad|squat/i, Hamstrings: /hamstring/i, Glutes: /glute/i, Calves: /calf|calves/i,
};
export async function gatherEvidence(vaultPath, { goalMuscles = [], limit = 14 } = {}) {
  const { gatherVolumeResearch } = await import('./coachRanges.js');
  const base = await gatherVolumeResearch(vaultPath, { limit: 8 });
  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const extra = [];
  const words = goalMuscles.map((m) => MUSCLE_WORDS[m]).filter(Boolean);
  for (const dir of ['Wiki/Inbox', 'Wiki/Sources', 'Wiki/Concepts', 'Wiki/Health']) {
    let names = [];
    try { names = await readdir(path.join(vaultPath, dir)); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.md')) continue;
      const rel = `${dir}/${n}`;
      if (base.some((b) => b.path === rel) || extra.some((b) => b.path === rel)) continue;
      if (words.some((w) => w.test(n))) extra.push({ path: rel, title: n.replace(/\.md$/, ''), kind: dir === 'Wiki/Sources' ? 'video/podcast note' : dir === 'Wiki/Health' ? 'his own training page' : 'note' });
    }
  }
  return [...base.map(({ path: p, title, kind }) => ({ path: p, title, kind })), ...extra].slice(0, limit);
}

/* ------------------------------ when it runs ------------------------------ */
//
// Code's call: once each ISO week, and again whenever the ranges he is judged
// against change (he approved Coach's ranges, or Coach proposed new ones) —
// never while a program-check card still waits on him. The ranges lane runs
// first, so a check always reads the newest ranges. One run at a time.

const checkStatePath = async () => {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dir, 'coach-program-check.json');
};
export async function readCheckState() {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(await checkStatePath(), 'utf8')); } catch { return {}; }
}
export async function writeCheckState(patch) {
  const { writeFile, mkdir, rename } = await import('node:fs/promises');
  const path = await import('node:path');
  const file = await checkStatePath();
  const next = { ...(await readCheckState()), ...patch };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + '.tmp', JSON.stringify(next, null, 2));
  await rename(file + '.tmp', file);
  return next;
}

export const rangesKeyOf = (eff) => createHash('sha1').update(JSON.stringify([eff?.source, eff?.ranges || null])).digest('hex').slice(0, 10);

/** Pure: is this week's check due? */
export function checkDue({ state = {}, week, rangesKey }) {
  if (state.week !== week) return { due: true, why: state.week ? 'a new week' : 'never run' };
  if (state.rangesKey !== rangesKey) return { due: true, why: 'the ranges changed' };
  return { due: false, why: 'already checked this week against these ranges' };
}

let inFlight = null;
export function maybeRunCoachChecks(vaultPath, deps = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const out = {};
    try {
      const { runRangesLane } = await import('./coachRanges.js');
      out.ranges = await (deps.runRanges || runRangesLane)(vaultPath, deps.rangesDeps || {});
    } catch (e) { out.ranges = { status: 'error', why: e.message }; }
    try {
      const listRecords = deps.listRecords || (await import('./inboxStore.js')).listRecords;
      const g = await (deps.goals || (async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath)))().catch(() => null);
      const eff = effectiveRanges(g, await listRecords());
      const week = mondayIso(deps.now || new Date());
      const rangesKey = rangesKeyOf(eff);
      const due = checkDue({ state: await readCheckState(), week, rangesKey });
      if (!due.due) out.check = { status: 'skipped', why: due.why };
      else {
        out.check = await (deps.runCheck || runProgramCheck)(vaultPath, deps.checkDeps || {});
        // a skipped run (cards still waiting) is not a checked week
        if (!['skipped', 'off', 'error'].includes(out.check.status)) await writeCheckState({ week, rangesKey, lastRunAt: new Date().toISOString(), lastStatus: out.check.status, lastRefused: out.check.refused || [] });
      }
    } catch (e) { out.check = { status: 'error', why: e.message }; }
    return out;
  })().finally(() => { inFlight = null; });
  return inFlight;
}
