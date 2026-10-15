// WHAT ELSE A LIFT TRAINS (15 Oct 2026). His ask: every exercise should say
// which muscles it also works, and those should add up into each muscle's
// weekly load. An incline bench is a chest lift that also loads the triceps
// and the front delts; a hack squat is a quad lift that also loads the glutes.
//
// THE COUNTING RULE is fractional: a working set credits 1 to its primary
// muscle and ½ to each secondary one. That is the counting method that best
// predicted hypertrophy in Pelland et al. 2024 (the set-volume
// meta-regression), so it is the rule, not a guess at one.
//
// Deterministic, no model: a name-pattern table, first matching rule wins,
// and an exercise's own `secondary: [...]` in the library (validated when the
// library is read, server/lib/exercises.js) wins over the table. Shared by
// the server and the client, because every per-muscle count on both sides
// goes through creditsFor and two copies of a rule are two rules.

export const INDIRECT_CREDIT = 0.5;

// muscles that never take or give secondary credit: Mobility is adherence,
// not hypertrophy volume; Full Body is already "everything"
const NO_SECONDARY = new Set(['Mobility', 'Full Body', 'Other']);

// [pattern, secondaries | (primary) => secondaries]. Order matters: the
// isolation lifts and the "looks like a press but is not" names come first,
// so a leg-press calf raise or an incline curl never reads as a press.
const RULES = [
  // isolation: the named muscle and nothing else worth counting
  [/calf raise|calf press|calves/, []],
  // a dip is a press whatever it is filed under ("Tricep Dip" included)
  [/\bdips?\b/, (p) => (p === 'Triceps' ? ['Chest', 'Shoulders'] : ['Triceps', 'Shoulders'])],
  [/sissy squat/, []],
  [/leg curl|nordic|wrist curl/, []],
  [/leg extension/, []],
  [/adductor|abductor/, []],
  [/lateral raise|front raise/, []],
  [/shrug/, []],
  [/tricep|skull ?crusher|carter extension|kickback|pushdown|push-down/, []],
  [/dead ?hang/, []],
  [/plank|crunch|sit-?up|ab wheel|leg raise|hollow|pallof|\babs?\b/, []],
  // rear delts and the upper back move together: mid traps and rhomboids
  [/reverse pec deck|reverse fly|rear delt|face pull/, ['Back']],
  // chest isolation
  [/\bfl(y|ys|ye|yes|ies)\b|pec deck|crossover/, []],
  // curls: a hammer grip loads the brachioradialis; a reverse curl is the
  // forearm lift that also loads the biceps
  [/hammer curl/, ['Forearms']],
  [/reverse curl/, ['Biceps']],
  [/curl/, []],
  // pulling: a row also loads the elbow flexors and the rear delts; a
  // vertical pull, the elbow flexors. A straight-arm pull keeps the elbow
  // locked, so the biceps barely work.
  [/upright row/, []],
  [/\brows?\b/, ['Biceps', 'Shoulders']],
  [/straight[- ]arm|pullover/, []],
  [/pull[- ]?ups?\b|chin[- ]?ups?\b|pull[- ]?downs?\b/, ['Biceps']],
  // pressing
  [/shoulder press|overhead press|military press|arnold press|push press/, ['Triceps']],
  [/bench|chest press|push[- ]?ups?\b|(incline|decline).*press/, (p) => (p === 'Triceps' ? ['Chest', 'Shoulders'] : ['Triceps', 'Shoulders'])],
  // lower body
  [/squat|leg press|lunge|step[- ]?ups?\b/, ['Glutes']],
  [/hip thrust|glute bridge/, ['Hamstrings']],
  [/romanian|\brdl\b|stiff[- ]leg|good ?morning/, ['Glutes', 'Back']],
  [/deadlift/, ['Glutes', 'Hamstrings', 'Back']],
];

const uniq = (xs) => [...new Set(xs)];

/** The table's answer for a name and primary muscle (ignores any override). */
export function tableSecondary(name, primary) {
  const p = String(primary || '').trim();
  if (!p || NO_SECONDARY.has(p)) return [];
  const n = String(name || '').toLowerCase();
  for (const [re, out] of RULES) {
    if (!re.test(n)) continue;
    const list = typeof out === 'function' ? out(p) : out;
    return uniq(list).filter((m) => m !== p && !NO_SECONDARY.has(m));
  }
  return [];
}

/**
 * The muscles an exercise trains secondarily, never including its primary.
 * An explicit array on the exercise (his library override, already validated
 * on read) wins over the table; an empty array means "none".
 */
export function secondaryFor(exercise) {
  const primary = String(exercise?.muscleGroup || '').trim();
  if (!primary || NO_SECONDARY.has(primary)) return [];
  if (Array.isArray(exercise?.secondary)) {
    return uniq(exercise.secondary.map((m) => String(m || '').trim())).filter((m) => m && m !== primary && !NO_SECONDARY.has(m));
  }
  return tableSecondary(exercise?.name, primary);
}

/**
 * Where one working set of this exercise lands: [{ muscle, credit }], the
 * primary at 1 first, then each secondary at ½. An unfiled exercise is
 * 'Other' at 1 and nothing else, exactly as it counted before.
 */
export function creditsFor(exercise) {
  const primary = String(exercise?.muscleGroup || '').trim() || 'Other';
  return [
    { muscle: primary, credit: 1 },
    ...secondaryFor(exercise).map((muscle) => ({ muscle, credit: INDIRECT_CREDIT })),
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

/** "Triceps ½, Shoulders ½" for an exercise's secondary list. */
export const alsoWorksLine = (secondary) => (secondary || []).map((m) => `${m} ½`).join(', ');
