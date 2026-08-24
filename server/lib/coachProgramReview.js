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

/* ------------------- (d) IS IT ENOUGH, OR TOO MUCH? ----------------------- */
//
// His ask: Coach should judge whether a session is "enough" or "too much" —
// too many exercises, movements that aren't paying their way, and lifts he
// has simply been doing too long. Three detectors, all held to the same bar
// as everything above: CODE finds the problem in his real history, the model
// only phrases it. Every threshold here is deliberately conservative, because
// a coach who calls a good session bloated once is never believed again.
//
// A note on the numbers: these are the widely-taught natural-lifter
// landmarks, not precision science, so each detector requires the pattern to
// PERSIST (multiple weeks, multiple sessions) before it says anything. A
// single big day is training, not a programming error.

// Above this many hard sets in a week, added volume is generally not buying
// growth for a natural lifter — it is buying fatigue. Set well clear of the
// 10-12 targets so an ordinary hard week never trips it.
export const JUNK_VOLUME_CEILING = 22;
// A session past this many exercises tends to mean the last ones are done
// tired, fast and half-loaded. His Push day sits at 10, which is exactly the
// conversation he wants Coach to start.
export const SESSION_EXERCISE_CEILING = 9;
// How long a lift can stay in the program before a coach would rotate it for
// variation — even if it is still creeping upward.
export const TENURE_WEEKS = 16;

// TOO MUCH: a muscle carrying junk volume for consecutive weeks. The mirror
// image of findChronicUnderVolume, and it reads the same weeklyVolume input
// so the two can never disagree about what a week contained.
export function findJunkVolume(weeklyVolume = [], { ceiling = JUNK_VOLUME_CEILING, weeks = 2 } = {}) {
  const out = [];
  const recent = weeklyVolume.slice(0, weeks);
  if (recent.length < weeks) return out;
  const muscles = new Set(recent.flatMap((w) => Object.keys(w.groups || {})));
  for (const muscle of muscles) {
    const counts = recent.map((w) => (w.groups || {})[muscle] || 0);
    if (counts.some((c) => c < ceiling)) continue; // must be over it EVERY week
    const avg = Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10;
    out.push({
      kind: 'junk-volume',
      key: `junk:${muscle}:${recent[0].week}`,
      muscle,
      avg,
      ceiling,
      weeks: recent.length,
      line: `${muscle} has run at ${avg} hard sets a week for ${recent.length} weeks — past the point where more sets buy more growth. Those last few sets are costing you recovery you could spend elsewhere. Worth trimming the least productive movement.`,
      // no one-tap fix: WHICH set to cut is his call, and a coach who
      // silently deletes work is not one you keep
      fix: null,
    });
  }
  return out;
}

// TOO MANY EXERCISES: not "this session ran long" — measured against what he
// ACTUALLY finishes. Checked on his real history first, and the generic
// session-length ceiling was the wrong frame entirely: his sessions log 3-6
// exercises, because he already splits a big routine across days. The real
// signal was sitting in the same data — routines DEFINING 9-10 exercises
// that he completes about half of, generating 12 makeup sessions in six
// weeks. A plan you can never finish isn't an ambitious plan, it's a plan
// that hands you a backlog, and that is exactly the "too many exercises than
// what is needed" he asked Coach to notice.
export function findOversizedRoutines(sessions = [], routines = [], { minSessions = 3, ratio = 0.7, minDefined = 6, now = new Date(), justAdded = new Set() } = {}) {
  const out = [];
  const cut = new Date(now.getTime() - 42 * 86_400_000).toISOString().slice(0, 10);
  const workedCount = (s) => (s.exercises || []).filter((ex) => (ex.sets || []).some((x) => x.setType !== 'warmup' && ((Number(x.weight) || 0) > 0 || (Number(x.reps) || 0) > 0))).length;

  for (const routine of routines) {
    const defined = (routine.exercises || []).length;
    if (defined < minDefined) continue;
    const mine = sessions.filter((s) => s.routineId === routine.id && s.date >= cut);
    if (mine.length < minSessions) continue;
    const counts = mine.map(workedCount).filter((n) => n > 0);
    if (counts.length < minSessions) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg / defined >= ratio) continue; // he finishes most of it — leave it alone

    // WHICH exercise to cut is answered by his own behaviour: the one he
    // reaches least often. Named as evidence, and offered as the one tap.
    const seen = new Map();
    for (const s of mine) {
      for (const ex of s.exercises || []) {
        const worked = (ex.sets || []).some((x) => x.setType !== 'warmup' && ((Number(x.weight) || 0) > 0 || (Number(x.reps) || 0) > 0));
        if (worked) seen.set(ex.exerciseId, (seen.get(ex.exerciseId) || 0) + 1);
      }
    }
    // An exercise Coach itself added days ago has not had a CHANCE to be
    // reached — proposing he cut it is the "change for the sake of it" he
    // called out, and it happened for real: the review offered to drop
    // Weighted Pull-Up half an hour after Coach put it there.
    const leastDone = (routine.exercises || [])
      .filter((e) => !justAdded.has(`${routine.id}:${e.exerciseId}`))
      .map((e) => ({ e, n: seen.get(e.exerciseId) || 0 }))
      .sort((a, b) => a.n - b.n)[0];

    out.push({
      kind: 'routine-oversized',
      key: `oversized:${routine.id}:${mine[0].date}`,
      routineId: routine.id,
      routineName: routine.name,
      defined,
      avg: Math.round(avg * 10) / 10,
      sessions: counts.length,
      line: `${routine.name} lists ${defined} exercises but you finish about ${Math.round(avg * 10) / 10} of them across your last ${counts.length} — the rest keeps rolling into makeup sessions. That's a plan bigger than the session you actually train, and the tail end is the part that never gets your best work.${leastDone && leastDone.n === 0 ? ` ${leastDone.e.name} hasn't been touched once.` : leastDone ? ` ${leastDone.e.name} is the one you reach least (${leastDone.n} of ${counts.length}).` : ''} Trimming it to what you genuinely do would make every session count.`,
      // one tap cuts the movement his own history says he never reaches;
      // anything more surgical is a conversation, which DISCUSS IT opens
      fix: leastDone ? { action: 'drop', routineId: routine.id, exerciseId: leastDone.e.exerciseId } : null,
    });
  }
  return out.sort((a, b) => (a.avg / a.defined) - (b.avg / b.defined));
}

// LEAST PRODUCTIVE MOVEMENT: within one routine, when a muscle is getting
// several movements AND at least one of them has gone nowhere while its
// stablemates climbed, that one is the honest candidate to cut or change.
// This is the "not as effective as the others" judgement he asked for, made
// by comparison against his OWN lifts rather than an opinion about exercises.
export function findLowValueExercises(sessions = [], exercises = [], routines = [], { minMovements = 3, minSessions = 3 } = {}) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const trend = new Map(); // exerciseId -> gain ratio across its history
  const hist = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue;
      const best = bestSet(ex.sets);
      if (!best) continue;
      const arr = hist.get(ex.exerciseId) || [];
      arr.push({ date: s.date, best, name: ex.name });
      hist.set(ex.exerciseId, arr);
    }
  }
  for (const [id, arr] of hist) {
    if (arr.length < minSessions) continue;
    const d = arr.sort((a, b) => a.date.localeCompare(b.date));
    trend.set(id, { gain: d[d.length - 1].best / (d[0].best || 1), n: d.length, name: d[0].name });
  }

  const out = [];
  for (const routine of routines) {
    const groups = new Map();
    for (const e of routine.exercises || []) {
      const g = byId.get(e.exerciseId)?.muscleGroup || e.muscleGroup || 'Other';
      if (g === 'Other' || g === 'Mobility') continue;
      groups.set(g, [...(groups.get(g) || []), e]);
    }
    for (const [group, entries] of groups) {
      if (entries.length < minMovements) continue;
      const scored = entries.map((e) => ({ e, t: trend.get(e.exerciseId) })).filter((x) => x.t);
      if (scored.length < minMovements) continue; // not enough history to judge fairly
      scored.sort((a, b) => a.t.gain - b.t.gain);
      const worst = scored[0];
      const best = scored[scored.length - 1];
      // only speak when the gap is REAL: the worst went nowhere while another
      // in the same group genuinely moved
      if (worst.t.gain > 1.01) continue;
      if (best.t.gain < 1.05) continue;
      const worstPct = Math.round((worst.t.gain - 1) * 100);
      const bestPct = Math.round((best.t.gain - 1) * 100);
      out.push({
        kind: 'low-value',
        key: `lowvalue:${routine.id}:${worst.e.exerciseId}`,
        routineId: routine.id,
        routineName: routine.name,
        exerciseId: worst.e.exerciseId,
        name: worst.t.name,
        group,
        line: `You're running ${entries.length} ${group.toLowerCase()} movements in ${routine.name}, and ${worst.t.name} is the one not paying for its place — ${worstPct <= 0 ? 'flat' : `up only ${worstPct}%`} across ${worst.t.n} sessions while ${best.t.name} went up ${bestPct}%. Cutting it or changing it would buy back time and recovery without costing you ${group.toLowerCase()}.`,
        fix: { action: 'drop', routineId: routine.id, exerciseId: worst.e.exerciseId },
      });
    }
  }
  return out;
}

// TOO LONG ON THE SAME THING: distinct from `stale`, which is about a lift
// that stopped progressing. This is the variation argument — he has been
// doing it for months, and a block on something else is worth taking even
// while it still creeps.
export function findLongTenure(sessions = [], exercises = [], { weeks = TENURE_WEEKS, minSessions = 10, now = new Date() } = {}) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const hist = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      const arr = hist.get(ex.exerciseId) || [];
      arr.push({ date: s.date, name: ex.name });
      hist.set(ex.exerciseId, arr);
    }
  }
  const recentCut = new Date(now.getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
  const out = [];
  for (const [id, arr] of hist) {
    if (arr.length < minSessions) continue;
    const d = arr.sort((a, b) => a.date.localeCompare(b.date));
    // it has to still be IN the program — a lift he already dropped is history
    if (d[d.length - 1].date < recentCut) continue;
    const spanWeeks = Math.round((new Date(`${d[d.length - 1].date}T12:00:00`) - new Date(`${d[0].date}T12:00:00`)) / (7 * 86_400_000));
    if (spanWeeks < weeks) continue;
    const group = byId.get(id)?.muscleGroup || 'Other';
    if (group === 'Other' || group === 'Mobility') continue;
    const alternatives = exercises.filter((e) => e.id !== id && (e.muscleGroup || 'Other') === group).slice(0, 2);
    out.push({
      kind: 'tenure',
      key: `tenure:${id}:${Math.floor(spanWeeks / 4)}`, // re-raisable at most monthly
      exerciseId: id,
      name: d[0].name,
      group,
      weeks: spanWeeks,
      sessions: d.length,
      line: `You've been doing ${d[0].name} for ${spanWeeks} weeks straight — ${d.length} sessions. Even when a lift is still creeping, a block on something else for the same muscle tends to come back stronger${alternatives.length ? `; ${alternatives[0].name} would do it` : ''}.`,
      fix: alternatives.length ? { action: 'swap', exerciseId: id, replaceWith: alternatives[0].id, group } : null,
    });
  }
  return out;
}

// THE EFFORT CEILING — the finding that explains the others.
//
// Found in his real log while fixing the progression engine: 227 working
// sets, every one carrying an RPE, and 94% of them at 9 or 10. Training
// everything at the edge is why so many lifts read "stale" at once — there
// is no headroom left to progress INTO, and recovery is spent before the
// next session. A coach would say this once, plainly, rather than issue
// fourteen identical "hold and control" notes exercise by exercise.
//
// Needs a real body of evidence (100+ sets, most carrying RPE) before it
// speaks, because on a thin log this would just be describing a hard week.
export const EFFORT_CEILING_SHARE = 0.85;

export function findEffortCeiling(sessions = [], { minSets = 100, share = EFFORT_CEILING_SHARE, now = new Date() } = {}) {
  const cut = new Date(now.getTime() - 42 * 86_400_000).toISOString().slice(0, 10);
  let total = 0;
  let hard = 0;
  let rated = 0;
  for (const s of sessions) {
    if (s.date < cut) continue;
    for (const ex of s.exercises || []) {
      if (ex.anomaly) continue;
      for (const st of ex.sets || []) {
        if (st.setType === 'warmup') continue;
        if (!((Number(st.weight) || 0) > 0 || (Number(st.reps) || 0) > 0)) continue;
        total++;
        if (st.rpe == null) continue;
        rated++;
        if (Number(st.rpe) >= 9) hard++;
      }
    }
  }
  if (total < minSets) return [];
  if (rated < total * 0.6) return []; // not enough effort data to judge honestly
  const pct = hard / rated;
  if (pct < share) return [];
  return [{
    kind: 'effort-ceiling',
    key: `effort:${Math.round(pct * 100)}:${sessions[0]?.date || ''}`,
    pct: Math.round(pct * 100),
    sets: rated,
    line: `${Math.round(pct * 100)}% of your last ${rated} working sets were RPE 9 or 10. Training every set at the edge leaves nothing to progress into — it's the most likely reason several lifts have gone flat at once. Taking the first set or two of each exercise to an honest 7-8 and saving the 9s for the last set would let the numbers start moving again.`,
    fix: null, // this is a habit to change on the floor, not a plan edit
  }];
}

/* ------------------------------ the review -------------------------------- */

// Priority: a wrong mapping first (it corrupts every other number), then a
// muscle short for weeks, then too much of one thing, then a bloated
// session, then a movement not paying its way, then a lift that has stopped
// paying, and last the "you've done this a long time" nudge — which is real
// but never urgent.
const RANK = { mapping: 0, 'effort-ceiling': 1, 'under-volume': 2, 'junk-volume': 3, 'routine-oversized': 4, 'low-value': 5, stale: 6, tenure: 7 };

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
    // routines are needed to judge "too many exercises" and "which movement
    // isn't paying" — both are questions about the PROGRAM, not just history
    loadRoutinesFor = async (exercises) => (await import('./workouts.js')).loadRoutines(vaultPath, exercises).then((r) => r.routines),
    now = new Date(),
  } = deps;

  const [sessions, exercises, g] = await Promise.all([loadSessions(), loadExercises(), goals().catch(() => null)]);
  const goalMuscles = await focusOf(g).catch(() => []);
  const weekly = await volume(sessions, exercises);
  const routines = await loadRoutinesFor(exercises).catch(() => []);
  // anything Coach placed in the plan recently is off the chopping block
  const justAdded = await (async () => {
    try {
      const { readMarkers } = await import('./coachPlan.js');
      const markers = await readMarkers();
      const cut = now.getTime() - 21 * 86_400_000;
      return new Set(Object.entries(markers).filter(([, m]) => new Date(m.at || 0).getTime() > cut).map(([k]) => k));
    } catch { return new Set(); }
  })();

  const findings = [
    ...findMappingSuspects(exercises),
    ...findChronicUnderVolume(weekly, { goalMuscles }),
    ...findEffortCeiling(sessions, { now }),
    ...findJunkVolume(weekly),
    ...findOversizedRoutines(sessions, routines, { now, justAdded }),
    ...findLowValueExercises(sessions, exercises, routines),
    ...findStaleLifts(sessions, exercises, { now }),
    ...findLongTenure(sessions, exercises, { now }),
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
