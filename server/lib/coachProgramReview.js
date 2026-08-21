// THE COACH'S PROGRAM REVIEW — the things a real coach notices between
// sessions and raises unprompted.
//
// His 21-Aug ask: Coach should be expert enough to (a) catch a mis-classified
// exercise and fix it, and (b) look across days and weeks and say "swap this
// for that, it will move you further" — then keep asking until he answers.
//
// Doctrine: every finding below is DETECTED BY CODE from his real history.
// The model gets to phrase the coaching, never to decide there is a problem,
// and never to write. Each finding carries a stable key so it can be raised
// once, nudged on a schedule, and closed when he acts or argues back.

/* ------------------------- (a) mis-classified lifts ----------------------- */

// What the NAME of a lift implies about the muscle it should count toward.
// Deliberately conservative — these are the patterns a coach would call
// obvious, and anything ambiguous is left alone rather than guessed at. Order
// matters: the first match wins, so the most specific patterns come first.
const NAME_RULES = [
  // SPECIFIC BEFORE GENERAL — the first draft had "curl" above "leg curl",
  // so Coach confidently announced that a Seated Leg Curl trains biceps.
  // A coach who says that once is never believed again, so the compound
  // names that contain a generic word are all matched first.
  [/\b(calf|calves|calf raise)\b/i, 'Calves'],
  [/\b(leg curl|lying curl|seated curl|nordic|romanian|rdl|good morning|hamstring curl)\b/i, 'Hamstrings'],
  // "grip" alone matched Wide-Grip Pull-Up and Close-Grip Bench Press — a
  // grip is a MODIFIER on another lift, never the muscle being trained.
  [/\b(wrist curl|reverse wrist|forearm|farmer'?s? (walk|carry)|grip trainer|dead ?hang)\b/i, 'Forearms'],
  [/\b(glute kickback|kickback machine|hip thrust|glute bridge|abduction|glute)\b/i, 'Glutes'],
  [/\b(leg press|leg extension|hack squat|split squat|squat|lunge)\b/i, 'Quads'],
  [/\b(face pull|rear delt|reverse (pec ?deck|fly|flye))\b/i, 'Shoulders'],
  [/\b(lateral raise|side raise|upright row|overhead press|shoulder press|military press|arnold press)\b/i, 'Shoulders'],
  [/\b(pulldown|pull-?up|chin-?up|row|pullover|shrug|deadlift|rack pull)\b/i, 'Back'],
  [/\b(bench|chest press|push-?up|dip|pec ?deck|chest fly|chest flye|cable (cross|fly))\b/i, 'Chest'],
  [/\b(tricep|pushdown|press-?down|skull ?crusher|overhead extension|kickback)\b/i, 'Triceps'],
  [/\b(bicep|curl)\b/i, 'Biceps'],
  [/\b(crunch|sit-?up|plank|leg raise|ab wheel|hanging knee)\b/i, 'Abs'],
];

// Names an expert would NOT read from the word alone. A Jefferson curl is
// spinal flexion, not a biceps curl; a sled or a carry depends entirely on
// how it is loaded. Saying nothing beats saying something wrong — Coach only
// gets to correct him when it is certain.
const NO_GUESS = /\b(jefferson|sled|carry|complex|circuit|superset|emom|amrap|flow|warm-?up)\b/i;

// A curl is a curl. Exported so the test can hold the expert's line.
export function expectedGroupFromName(name) {
  const n = String(name || '');
  if (!n.trim() || NO_GUESS.test(n)) return null;
  for (const [re, group] of NAME_RULES) if (re.test(n)) return group;
  return null;
}

// Exercises whose assigned group contradicts what the name plainly says.
// A miss here is silent and expensive: every set logged against it lands on
// the wrong muscle in his weekly volume, so the bars lie and the Coach
// reasons from the lie.
export function findMappingSuspects(exercises = []) {
  const out = [];
  for (const e of exercises) {
    const expected = expectedGroupFromName(e.name);
    if (!expected) continue;
    const actual = e.muscleGroup || 'Other';
    if (actual === expected) continue;
    // A compound can legitimately be filed under either head — a bench press
    // counted as Chest or Triceps is a choice, not an error. Only call it
    // when the two are not plausible partners.
    if (PLAUSIBLE_PAIRS.some((p) => p.includes(actual) && p.includes(expected))) continue;
    out.push({
      kind: 'mapping',
      key: `mapping:${e.id}:${expected}`,
      exerciseId: e.id,
      name: e.name,
      actual,
      expected,
      line: `“${e.name}” is filed under ${actual}, but it trains ${expected} — every set you log on it is landing on the wrong muscle in your weekly volume.`,
      fix: { action: 'remap', exerciseId: e.id, muscleGroup: expected },
    });
  }
  return out;
}
// Pairs a coach would accept either way round on a compound lift.
const PLAUSIBLE_PAIRS = [
  ['Chest', 'Triceps'], ['Chest', 'Shoulders'], ['Back', 'Biceps'],
  ['Shoulders', 'Triceps'], ['Quads', 'Glutes'], ['Hamstrings', 'Glutes'],
  // a deadlift is legitimately filed under any of its three prime movers
  ['Back', 'Hamstrings'], ['Back', 'Glutes'], ['Glutes', 'Hamstrings'],
  ['Quads', 'Hamstrings'], ['Calves', 'Quads'],
  ['Full Body', 'Back'], ['Full Body', 'Quads'], ['Full Body', 'Chest'],
];

/* ---------------------- (b) a lift that has stopped paying ---------------- */

const bestSet = (sets = []) => {
  let best = 0;
  for (const s of sets) {
    if (s.setType === 'warmup') continue;
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (!r) continue;
    const e1 = w > 0 ? w * (1 + r / 30) : r; // bodyweight ranks on reps
    if (e1 > best) best = e1;
  }
  return best;
};

// A lift is STALE when its best set has not improved across its last N
// outings spanning at least `minDays`. That is the moment a coach changes
// the stimulus rather than repeating it — and the swap should hit the SAME
// muscle, which is why the candidate list is filtered by group.
export function findStaleLifts(sessions = [], exercises = [], { minSessions = 4, minDays = 21, now = new Date() } = {}) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const history = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue; // an off day is not evidence
      const best = bestSet(ex.sets);
      if (!best) continue;
      const arr = history.get(ex.exerciseId) || [];
      arr.push({ date: s.date, best, name: ex.name });
      history.set(ex.exerciseId, arr);
    }
  }
  // what he has trained lately, so a "fresh" suggestion really is fresh
  const recent = new Set();
  const recentCut = new Date(now.getTime() - 42 * 86_400_000).toISOString().slice(0, 10);
  for (const s of sessions) {
    if (s.date < recentCut) continue;
    for (const ex of s.exercises || []) recent.add(ex.exerciseId);
  }

  const out = [];
  for (const [exerciseId, arr] of history) {
    const dated = arr.sort((a, b) => a.date.localeCompare(b.date));
    if (dated.length < minSessions) continue;
    const window = dated.slice(-minSessions);
    const spanDays = Math.round((new Date(`${window[window.length - 1].date}T12:00:00`) - new Date(`${window[0].date}T12:00:00`)) / 86_400_000);
    if (spanDays < minDays) continue;
    const first = window[0].best;
    const peak = Math.max(...window.map((x) => x.best));
    if (peak > first * 1.02) continue; // still climbing — leave it alone

    const group = byId.get(exerciseId)?.muscleGroup || 'Other';
    const alternatives = exercises
      .filter((e) => e.id !== exerciseId && (e.muscleGroup || 'Other') === group && group !== 'Other' && group !== 'Mobility')
      .sort((a, b) => Number(recent.has(a.id)) - Number(recent.has(b.id))) // unused first
      .slice(0, 3);
    if (!alternatives.length) continue; // nothing honest to offer instead

    out.push({
      kind: 'stale',
      key: `stale:${exerciseId}:${window[window.length - 1].date}`,
      exerciseId,
      name: window[0].name,
      group,
      weeks: Math.round(spanDays / 7),
      alternatives: alternatives.map((a) => ({ id: a.id, name: a.name, fresh: !recent.has(a.id) })),
      line: `${window[0].name} hasn't moved in ${Math.round(spanDays / 7)} weeks across ${window.length} sessions. Same stimulus, same result — swap it for ${alternatives[0].name} for a block and let ${group.toLowerCase()} see a different angle.`,
      fix: { action: 'swap', exerciseId, replaceWith: alternatives[0].id, group },
    });
  }
  return out;
}

/* -------------------- (c) a muscle chronically short ---------------------- */

// Under its target for several weeks running is a PROGRAMMING problem, not a
// bad week — and it is the kind of thing that only shows up when someone
// looks across weeks, which is exactly what he asked Coach to do.
export function findChronicUnderVolume(weeklyVolume = [], { goalMuscles = [], target = 12, weeks = 3 } = {}) {
  const out = [];
  const recent = weeklyVolume.slice(0, weeks);
  if (recent.length < weeks) return out;
  for (const muscle of goalMuscles) {
    const counts = recent.map((w) => (w.groups || {})[muscle] || 0);
    if (counts.some((c) => c >= target)) continue;
    const avg = Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10;
    out.push({
      kind: 'under-volume',
      key: `under:${muscle}:${recent[0].week}`,
      muscle,
      avg,
      target,
      weeks: recent.length,
      line: `${muscle} has been under target ${recent.length} weeks running — averaging ${avg} hard sets against ${target}. That is the gap between training it and growing it.`,
      fix: { action: 'add-sets', muscle, target },
    });
  }
  return out;
}

/* ------------------------------ the review -------------------------------- */

// Priority: a wrong mapping first (it corrupts every other number), then a
// muscle short for weeks, then a lift that has stopped paying.
const RANK = { mapping: 0, 'under-volume': 1, stale: 2 };

export function rankFindings(findings) {
  return [...findings].sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9));
}

export async function reviewProgram(vaultPath, deps = {}) {
  const {
    loadSessions = async () => (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 60 }),
    loadExercises = async () => (await import('./exercises.js')).loadExerciseLibrary(vaultPath).then((r) => r.exercises),
    goals = async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath),
    // the same parser the volume bars use — one definition of "goal muscle"
    focusOf = async (g) => [...(await import('./trainOverview.js')).goalMuscles(g)],
    volume = async (sessions, exercises) => (await import('./trainingAnalytics.js')).weeklyMuscleVolume(sessions, exercises, { weeks: 4 }),
    now = new Date(),
  } = deps;

  const [sessions, exercises, g] = await Promise.all([loadSessions(), loadExercises(), goals().catch(() => null)]);
  const goalMuscles = await focusOf(g).catch(() => []);
  const weekly = await volume(sessions, exercises);

  const findings = [
    ...findMappingSuspects(exercises),
    ...findChronicUnderVolume(weekly, { goalMuscles }),
    ...findStaleLifts(sessions, exercises, { now }),
  ];
  return { findings: rankFindings(findings), counts: { sessions: sessions.length, exercises: exercises.length } };
}

/* -------------------------- raising and nudging --------------------------- */
//
// A real coach doesn't mention something once and drop it. These rails:
//   · raise a finding ONCE (keyed), never stacking duplicates;
//   · NUDGE it if he hasn't answered — at 3 days, then 7, then stop;
//   · go quiet the moment he acts on it OR argues it down (a discarded
//     finding is answered, and re-raising something he has rejected is how
//     an assistant becomes nagging rather than expert).
export const NUDGE_DAYS = [3, 7];
const MAX_OPEN = 2; // never more than two open asks at once — a list is noise

// Pure: given an open record and the clock, should it be nudged, and what is
// the escalation number? Exported because the escalation is the part most
// likely to need his ear.
export function nudgeDue(record, now = Date.now()) {
  const raisedAt = new Date(record.lastRaisedAt || record.createdAt || 0).getTime();
  if (!raisedAt) return null;
  const done = Number(record.nudges || 0);
  if (done >= NUDGE_DAYS.length) return null;
  const dueAfter = NUDGE_DAYS[done] * 86_400_000;
  if (now - raisedAt < dueAfter) return null;
  return { nudge: done + 1, final: done + 1 === NUDGE_DAYS.length };
}

export function nudgeLine(record, nudge) {
  const what = String(record.text || 'that change').replace(/^Coach:\s*/, '');
  return nudge >= NUDGE_DAYS.length
    ? `Last time I'll raise it, sir: ${what} Tell me to drop it and I will.`
    : `Still open, sir: ${what} Worth a decision before the next block.`;
}

export async function raiseProgramFindings(vaultPath, deps = {}) {
  const { createRecord, listRecords, updateRecord } = deps.store || await import('./inboxStore.js');
  const now = deps.now || Date.now();
  const records = await listRecords();
  const open = records.filter((r) => r.kind === 'coach-program' && r.status === 'pending');

  // 1) NUDGE what is already open and unanswered
  const nudged = [];
  for (const r of open) {
    const due = nudgeDue(r, now);
    if (!due) continue;
    await updateRecord(r.id, {
      nudges: due.nudge,
      lastRaisedAt: new Date(now).toISOString(),
      text: nudgeLine(r, due.nudge),
    });
    nudged.push({ id: r.id, nudge: due.nudge, final: due.final });
  }

  // 2) raise anything NEW, up to the cap
  const room = Math.max(0, MAX_OPEN - open.length);
  const raisedOut = [];
  if (room > 0) {
    const { findings } = deps.review ? await deps.review() : await reviewProgram(vaultPath);
    // anything he has already seen — pending, acted on, or argued down —
    // is never raised again
    const seen = new Set(records.filter((r) => r.kind === 'coach-program').map((r) => r.findingKey));
    const { randomUUID } = await import('node:crypto');
    for (const f of findings) {
      if (seen.has(f.key)) continue;
      if (raisedOut.length >= room) break;
      raisedOut.push(await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'coach-program',
        findingKey: f.key,
        findingKind: f.kind,
        fix: f.fix || null,
        text: `Coach: ${f.line}`,
        source: 'coach',
        mode: 'draft',
        status: 'pending',
        nudges: 0,
        lastRaisedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      }));
    }
  }
  return { raised: raisedOut, nudged };
}

// What Coach should have in front of it when he asks about any of this — so
// the conversation and the Inbox can never disagree about what is open.
export async function programReviewContext(deps = {}) {
  try {
    const { listRecords } = deps.store || await import('./inboxStore.js');
    const open = (await listRecords()).filter((r) => r.kind === 'coach-program' && r.status === 'pending');
    if (!open.length) return null;
    const lines = open.map((r) => `- ${r.text}${r.nudges ? ` (raised ${r.nudges + 1}×, still unanswered)` : ''}`);
    return `PROGRAM CHANGES YOU HAVE PROPOSED AND HE HAS NOT ANSWERED (${open.length}). Bring the most important one up naturally if the conversation touches training, argue your case with the evidence, and take his no gracefully — but do not let it quietly disappear:\n${lines.join('\n')}`;
  } catch {
    return null;
  }
}
