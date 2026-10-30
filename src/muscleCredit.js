// WHAT A LIFT TRAINS, AND WHAT IT COUNTS FOR (15 Oct 2026). His ask: every
// exercise says which muscles it truly works, and those add up into each
// muscle's weekly load, so over- and under-training is visible.
//
// THE COUNTING RULE is fractional: a working set credits 1 to its primary
// muscle and ½ to each substantial secondary (Pelland et al. 2024, the
// set-volume meta-regression). Stabilisers are not secondaries: a wrong
// secondary inflates a total, which is the harm being fixed.
//
// WHERE AN EXERCISE'S MUSCLES COME FROM, in order (his standing rule):
//   1. his own approved mapping in the library (`primary` / `secondary` on
//      the entry: an audit card he said yes to, or a re-file he made);
//   2. the AUDITED table (src/muscleAudit.js), researched and reviewed;
//   3. nothing. An exercise in neither is UNAUDITED and its sets credit no
//      muscle until he approves a mapping; every surface that counts says
//      how many sets that left out instead of hiding them.
// The name patterns below are only a SUGGESTION engine: they draft the
// mapping an audit card proposes, and never credit a set on their own.
//
// Deterministic, no model, shared by the server and the client: every
// per-muscle count on both sides goes through creditsFor.

import { AUDITED } from './muscleAudit.js';
import { MUSCLE_GROUPS, NON_VOLUME, canonicalGroup, legacyGroup, LEGACY_GROUPS } from './muscleTaxonomy.js';

export const INDIRECT_CREDIT = 0.5;

// filings that never take or give secondary credit (Other: an unfiled lift)
export const NO_SECONDARY = new Set([...NON_VOLUME, 'Other']);

const uniq = (xs) => [...new Set(xs)];
const validSecondary = (list, primary) => uniq((list || []).map((m) => canonicalGroup(m)).filter(Boolean))
  .filter((m) => m !== primary && !NO_SECONDARY.has(m));

/** The audited row for an exercise id, or null. */
export const auditedRow = (id) => (id && Object.hasOwn(AUDITED, id) ? AUDITED[id] : null);

/**
 * Which muscles an exercise trains, resolved: { muscleGroup, secondary,
 * audit, primarySource, secondarySource, filedAs }.
 *   audit: 'approved' (his own mapping) | 'audited' (the table) | 'pending'
 * `strict` is the library loader's mode: an exercise with neither is
 * 'pending' and credits nothing. Without it (an object that never went
 * through the loader, such as a deleted lift's routine entry or a test
 * fixture) the object is taken at its own word, as before the audit.
 * Pure and idempotent: a resolved copy resolves to itself.
 */
export function resolveMuscles(e, { strict = false } = {}) {
  if (e?.audit === 'approved' || e?.audit === 'audited' || e?.audit === 'pending') return e;
  const filedAs = e?.muscleGroup;
  const own = canonicalGroup(e?.primary);
  const row = auditedRow(e?.id);
  let muscleGroup;
  let audit;
  let primarySource;
  // FILED AS MOBILITY, NO WORKING SETS (his call, 31 Oct 2026: "only stop them
  // counting if they aren't actual working sets ... it's just mobility work").
  // His Huberman stretches carried a primary (Quads, Glutes) and were counted
  // as volume; a lift filed under a non-volume group trains nothing countable.
  if (NON_VOLUME.has(canonicalGroup(filedAs))) { muscleGroup = canonicalGroup(filedAs); audit = row ? 'audited' : 'approved'; primarySource = 'filed'; }
  else if (own) { muscleGroup = own; audit = 'approved'; primarySource = 'override'; }
  else if (row) { muscleGroup = row.primary; audit = 'audited'; primarySource = 'audit'; }
  else {
    muscleGroup = canonicalGroup(filedAs) || (legacyGroup(filedAs) ? suggestPrimary(e?.name, filedAs) : String(filedAs || '').trim());
    audit = strict ? 'pending' : 'filed';
    primarySource = 'filed';
  }
  let secondary;
  let secondarySource;
  if (NON_VOLUME.has(muscleGroup)) { secondary = []; secondarySource = 'none'; }
  else if (Array.isArray(e?.secondary)) { secondary = validSecondary(e.secondary, muscleGroup); secondarySource = 'override'; }
  else if (row && !own) { secondary = row.secondary.filter((m) => m !== muscleGroup); secondarySource = 'audit'; }
  else { secondary = []; secondarySource = audit === 'filed' ? 'filed' : 'none'; }
  if (NO_SECONDARY.has(muscleGroup)) secondary = [];
  const out = { ...e, muscleGroup, secondary, primarySource, secondarySource };
  if (filedAs !== undefined && filedAs !== muscleGroup) out.filedAs = filedAs;
  // 'filed' is the lenient reading's word; only the loader stamps a status
  if (audit !== 'filed') out.audit = audit;
  return out;
}

/** True when this exercise's sets are being left out: not audited yet. */
export const isUnaudited = (e) => e?.audit === 'pending';

/** The muscles an exercise trains secondarily, never including its primary. */
export function secondaryFor(exercise) {
  if (isUnaudited(exercise)) return [];
  return resolveMuscles(exercise).secondary;
}

/**
 * Where one working set of this exercise lands: [{ muscle, credit }], the
 * primary at 1 first, then each secondary at ½. EMPTY when the set counts
 * for no muscle: an unaudited lift (isUnaudited says which) or a non-volume
 * filing (Mobility, Full Body, Grip). An unfiled lift is 'Other' at 1.
 */
export function creditsFor(exercise) {
  if (isUnaudited(exercise)) return [];
  const r = resolveMuscles(exercise);
  const primary = String(r.muscleGroup || '').trim() || 'Other';
  if (NON_VOLUME.has(primary)) return [];
  return [
    { muscle: primary, credit: 1 },
    ...(r.secondary || []).map((muscle) => ({ muscle, credit: INDIRECT_CREDIT })),
  ];
}

/** id → creditsFor(exercise), for counting sessions against a library. */
export function creditsById(exercises) {
  return new Map((exercises || []).map((e) => [e.id, creditsFor(e)]));
}

/**
 * One muscle's tally: direct and indirect are SETS (an indirect set is still
 * one set he did), total is what the muscle is credited, direct + ½ indirect.
 */
export const emptyTally = () => ({ total: 0, direct: 0, indirect: 0 });
export function addSets(tally, credit, n) {
  if (credit >= 1) tally.direct += n; else tally.indirect += n;
  tally.total += credit * n;
  return tally;
}

/**
 * A credited count as it is shown: whole numbers plain, halves as "½"
 * ("13½", "½"). House style everywhere a weekly count is drawn or spoken,
 * so the card, the sheet and Coach print the same figure.
 */
export function formatSets(n) {
  const v = Math.round((Number(n) || 0) * 2) / 2;
  const whole = Math.trunc(v);
  if (v === whole) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

/** "Triceps ½, Front Delts ½" for an exercise's secondary list. */
export const alsoWorksLine = (secondary) => (secondary || []).map((m) => `${m} ½`).join(', ');

/** "4 sets on unaudited lifts not counted": the line every counting surface
 *  says when sets were left out, never silence. Null when nothing was. */
export function uncountedLine(sets) {
  const n = Number(sets) || 0;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'set' : 'sets'} on unaudited lifts not counted`;
}

/* ---------------- the suggestion engine (never credits) ---------------- */

// THE PRIMARY A NAME SUGGESTS. Specific before general: "leg curl" before
// "curl", "reverse fly" before "fly", "romanian deadlift" before
// "deadlift", "glute kickback" before the triceps kickback.
export const PRIMARY_RULES = [
  [/\b(calf|calves)\b/i, 'Calves'],
  [/\b(leg curls?|lying curls?|seated curls?|nordic|romanian|rdl|stiff[- ]leg|good ?morning|hamstrings?|glute[- ]ham)\b/i, 'Hamstrings'],
  [/\bdead ?hang\b/i, 'Grip'],
  [/\b(wrist curl|reverse wrist|forearm|plate pinch)\b/i, 'Forearms'],
  [/\b(abduction|abductor)\b/i, 'Abductors'],
  [/\b(adduction|adductor|copenhagen)\b/i, 'Adductors'],
  [/\b(glute kickback|kickback machine|hip thrust|glute bridge|pull[- ]?through|glute)\b/i, 'Glutes'],
  [/\b(deadlift|rack pull)\b/i, 'Glutes'],
  [/\b(leg press|leg extension|hack squat|split squat|squat|lunge|step[- ]?ups?)\b/i, 'Quads'],
  [/\b(face pull|rear delt|reverse (pec ?deck|fly|flye|flyes))\b/i, 'Rear Delts'],
  [/\b(lateral raise|side raise|upright row|y[- ]raise)\b/i, 'Side Delts'],
  [/\b(front raise|overhead press|shoulder press|military press|arnold press|push press|landmine press)\b/i, 'Front Delts'],
  [/\bshrugs?\b/i, 'Traps'],
  [/\b(back extension|hyperextension|superman)\b/i, 'Lower Back'],
  [/\b(pull-?downs?|pull-?ups?|chin-?ups?|pullover|straight[- ]arm)\b/i, 'Lats'],
  [/\b(one|single)[- ]arm\b.*\brows?\b|\bchest[- ]supported\b.*\brows?\b/i, 'Lats'],
  [/\brows?\b/i, 'Upper Back'],
  [/\b(triceps?|push-?down|press-?down|skull ?crushers?|overhead extension|kickback|close[- ]grip bench|jm press|diamond push|bench dip)\b/i, 'Triceps'],
  [/\b(bench|chest press|push-?ups?|dips?|pec ?deck|fly|flys|flye|flyes|crossover|(incline|decline|flat)\b.*\bpress)\b/i, 'Chest'],
  [/\b(biceps?|curls?)\b/i, 'Biceps'],
  [/\bmountain climbers?\b/i, 'Full Body'],
  [/\b(crunch|sit-?ups?|plank|leg raise|knee raise|ab wheel|rollout|hollow|pallof|russian twist|dead bug|woodchop)\b/i, 'Abs'],
  [/\b(burpee|clean|snatch|thruster|kettlebell swing|carry|farmer|rowing machine|assault bike|jump rope|battle ropes?|sled)\b/i, 'Full Body'],
  [/\b(stretch|mobility|spider-?man|opener|thoracic|cat[- ]cow|90\/90)\b/i, 'Mobility'],
];

/** The primary a name suggests, else the filed group (an old name narrowed
 *  to its family when the name says which head), else null. */
export function suggestPrimary(name, filed) {
  const n = String(name || '');
  let fromName = null;
  for (const [re, g] of PRIMARY_RULES) if (re.test(n)) { fromName = g; break; }
  const old = legacyGroup(filed);
  if (old) return fromName && LEGACY_GROUPS[old].includes(fromName) ? fromName : (fromName || LEGACY_GROUPS[old][0]);
  return fromName || canonicalGroup(filed) || null;
}

// words that say how a lift is loaded, not what it trains
const GENERIC = new Set(['cable', 'cables', 'dumbbell', 'dumbbells', 'barbell', 'machine', 'single', 'arm', 'one', 'seated', 'standing',
  'the', 'with', 'and', 'per', 'weight', 'position', 'attachment', 'bar', 'grip', 'ez', 'smith', 'plate', 'loaded', 'band', 'banded',
  'kettlebell', 'alternate', 'alternating', 'weighted', 'assisted', 'high', 'low', 'wide', 'close', 'neutral']);
const tokens = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/)
  .map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 3 && !GENERIC.has(w));

/** The audited lift whose name is nearest this one (shared words), among
 *  those with the given primary when one is given. Null when none shares a word. */
export function nearestAudited(name, primary) {
  const mine = new Set(tokens(name));
  if (!mine.size) return null;
  let best = null;
  for (const [id, row] of Object.entries(AUDITED)) {
    if (primary && row.primary !== primary) continue;
    const score = tokens(row.name).filter((w) => mine.has(w)).length;
    if (!score) continue;
    if (!best || score > best.score || (score === best.score && row.name.length < best.row.name.length)) best = { id, row, score };
  }
  return best ? { id: best.id, ...best.row } : null;
}

/**
 * A DRAFT mapping for an unaudited lift, for his audit card: the primary its
 * name suggests, and the secondaries of the nearest audited lift with that
 * primary. `basis` says where each part came from, because the card must say
 * this is a suggestion to check, never an audit.
 */
export function suggestMapping(name, filed) {
  const named = PRIMARY_RULES.some(([re]) => re.test(String(name || '')));
  const primary = suggestPrimary(name, filed) || nearestAudited(name)?.primary || null;
  if (!primary || !MUSCLE_GROUPS.includes(primary)) return { primary: null, secondary: [], like: null, basis: 'none' };
  const basis = named ? 'name' : 'filed';
  if (NO_SECONDARY.has(primary)) return { primary, secondary: [], like: null, basis };
  const like = nearestAudited(name, primary);
  return {
    primary,
    secondary: like ? like.secondary.filter((m) => m !== primary) : [],
    like: like ? like.name : null,
    basis,
  };
}
