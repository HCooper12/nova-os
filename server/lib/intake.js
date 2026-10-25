// THE INTAKE — the interview that ends in numbers he approved.
//
// The sweep of 7 Sep 2026 found what every calorie target in Nova rests on:
// nothing. About You had never been filled, and the 2200 kcal / 150 g floor
// in the recipe collection were typed once and never derived. This is the
// reel's flow (design/ATHLETE-AI-PLAN.md #1) on Nova's rails: a short
// interview, one question at a time, resumable; CODE computes every number
// from printed formulas; the result lands as a pending card with the
// arithmetic shown; his yes writes the targets every reader already uses.
//
// Doctrine: models decide, code acts — here there is no model at all. The
// formulas are textbook (Katch-McArdle from lean mass when his body fat is
// known, Mifflin-St Jeor when it is not; activity multipliers; a deficit or
// surplus by pace; protein by bodyweight), every step is a line he can read,
// and a number he disagrees with is one he can re-answer.
//
// 26 Oct 2026 (his ask): Katch-McArdle is the formula he wants; the answers
// that never change (sex, height) are kept, so a change of pace is one tap,
// not the interview; and a weekly review (fuelReview.js) may calibrate the
// daily burn from what his weight and food log actually did — `tdeeAdjust`,
// a fact like any other, so this function stays the only arithmetic.

export const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'sedentary — desk job, little training' },
  light: { factor: 1.375, label: 'light — 1-3 sessions a week' },
  moderate: { factor: 1.55, label: 'moderate — 3-5 sessions a week' },
  very: { factor: 1.725, label: 'very active — 6-7 hard sessions a week' },
  athlete: { factor: 1.9, label: 'athlete — twice-a-day training or a physical job on top' },
};
export const GOALS = ['lose', 'maintain', 'gain'];
export const PACE = {
  gentle: { kcal: 250, label: 'gentle — about 0.25 kg a week' },
  steady: { kcal: 500, label: 'steady — about 0.5 kg a week' },
  aggressive: { kcal: 750, label: 'aggressive — about 0.75 kg a week; hard to hold' },
};

// The interview. Order matters: it is the order the arithmetic needs them,
// and each `ask` is one spoken sentence. `prefill` names where Nova already
// has an answer so the question is a confirmation, not a blank.
export const QUESTIONS = [
  { key: 'sex', ask: 'First — the formula needs it: are you male or female?', choices: ['male', 'female'] },
  { key: 'age', ask: 'How old are you?', unit: 'years', min: 14, max: 90 },
  { key: 'heightCm', ask: 'How tall are you? Centimetres, or feet and inches.', unit: 'cm', min: 120, max: 230, prefill: 'recipes.heightCm' },
  { key: 'weightKg', ask: 'What do you weigh right now? I have your last weigh-in if you want to use it.', unit: 'kg', min: 35, max: 250, prefill: 'health.weightKg' },
  { key: 'bodyFatPct', ask: 'Do you know your body fat percentage? It makes the resting burn more exact. Say "skip" if not.', unit: '%', min: 3, max: 60, optional: true, prefill: 'health.bodyFatPct' },
  { key: 'activity', ask: 'How active is a normal week — sedentary, light, moderate, very active, or athlete?', choices: Object.keys(ACTIVITY) },
  { key: 'goal', ask: 'Are you trying to lose, maintain, or gain?', choices: GOALS },
  { key: 'pace', ask: 'How fast — gentle, steady, or aggressive?', choices: Object.keys(PACE), skipIf: (f) => f.goal === 'maintain' },
  { key: 'eating', ask: 'Anything about how you like to eat that the plan should respect? Say "nothing" if not.', free: true, optional: true },
];

// the words he actually uses for each choice
const SYNONYMS = {
  sex: { man: 'male', guy: 'male', bloke: 'male', woman: 'female', lady: 'female' },
  activity: { desk: 'sedentary', 'not much': 'sedentary', 'very active': 'very', athletic: 'athlete' },
  goal: { cut: 'lose', drop: 'lose', shed: 'lose', 'fat loss': 'lose', lean: 'lose', bulk: 'gain', build: 'gain', muscle: 'gain', hold: 'maintain', keep: 'maintain', stay: 'maintain' },
  pace: { slow: 'gentle', easy: 'gentle', fast: 'aggressive', hard: 'aggressive', quick: 'aggressive', normal: 'steady', medium: 'steady', moderate: 'steady' },
};

// One spoken or typed answer → a value, or an honest "say it again" reason.
export function parseAnswer(key, text) {
  const raw = String(text || '').trim().toLowerCase();
  const q = QUESTIONS.find((x) => x.key === key);
  if (!q) return { error: 'that is not a question I asked' };
  if (q.optional && !q.free && /^(skip|no|nope|don'?t know|not sure|no idea|pass)\b/.test(raw)) return { value: null };
  if (q.free) return { value: /^(nothing|no|none|nope|skip)\.?$/.test(raw) ? '' : String(text || '').trim().slice(0, 300) };
  if (q.choices) {
    // the EARLIEST word he said wins: "slow and steady" is gentle, "steady,
    // not slow" is steady — a tie broken by list order would guess
    const words = { ...SYNONYMS[key] };
    for (const c of q.choices) words[c] = c;
    let best = null;
    for (const [w, v] of Object.entries(words)) {
      const i = raw.search(new RegExp(`\\b${w}\\b`));
      if (i >= 0 && (best == null || i < best.i)) best = { i, v };
    }
    return best ? { value: best.v } : { error: `one of: ${q.choices.join(', ')}` };
  }
  // numbers, with the units he actually says
  let n = null;
  const ftIn = raw.match(/(\d)\s*(?:ft|foot|feet|')\s*(\d{1,2})?/);
  if (key === 'heightCm' && ftIn) n = Math.round(Number(ftIn[1]) * 30.48 + Number(ftIn[2] || 0) * 2.54);
  else if (key === 'heightCm' && /\bm\b/.test(raw) && /^\s*1\.\d/.test(raw)) n = Math.round(parseFloat(raw) * 100);
  else {
    const m = raw.match(/(\d{1,3}(?:\.\d+)?)/);
    if (m) {
      n = parseFloat(m[1]);
      if (key === 'weightKg' && /\b(lb|lbs|pounds?)\b/.test(raw)) n = Math.round(n * 0.4536 * 10) / 10;
      if (key === 'heightCm' && /\b(in|inch|inches)\b/.test(raw) && n < 100) n = Math.round(n * 2.54);
    }
  }
  if (n == null || !Number.isFinite(n)) return { error: `a number of ${q.unit}` };
  if (n < q.min || n > q.max) return { error: `that does not look right for ${q.unit} (${q.min}–${q.max})` };
  return { value: key === 'age' ? Math.round(n) : Math.round(n * 10) / 10 };
}

// THE ARITHMETIC. Every line is one he can read back, and nothing here is
// tuned to please: the protein floor is the lean-mass-preserving band the
// literature supports, the fat floor is the hormonal one, carbs are whatever
// is left. A maintain goal has no deficit and says so.
export function compute(f) {
  const w = Number(f.weightKg), h = Number(f.heightCm), a = Number(f.age);
  if (![w, h, a].every(Number.isFinite)) throw new Error('weight, height and age are needed');
  if (!ACTIVITY[f.activity]) throw new Error('an activity level is needed');
  if (!GOALS.includes(f.goal)) throw new Error('a goal is needed');
  const pace = f.goal === 'maintain' ? null : (PACE[f.pace] || PACE.steady);
  const lines = [];
  const bf = bodyFat(f.bodyFatPct);
  let bmr, bmrFormula, leanKg = null;
  if (bf != null) {
    // Katch-McArdle: resting burn from lean mass, so it does not over-count
    // fat as tissue that burns energy — his chosen formula (26 Oct 2026)
    leanKg = Math.round(w * (1 - bf / 100) * 10) / 10;
    bmr = Math.round(370 + 21.6 * leanKg);
    bmrFormula = 'katch-mcardle';
    lines.push(`Resting burn (BMR, Katch-McArdle): 370 + 21.6 × ${leanKg} kg lean mass (${w} kg at ${bf}% fat) = ${bmr} kcal`);
  } else {
    // Mifflin-St Jeor (1990): the best of the formulas that need no body fat
    bmr = Math.round(10 * w + 6.25 * h - 5 * a + (f.sex === 'female' ? -161 : 5));
    bmrFormula = 'mifflin-st-jeor';
    lines.push(`Resting burn (BMR, Mifflin-St Jeor, because Katch-McArdle needs a body fat %): 10×${w} + 6.25×${h} − 5×${a} ${f.sex === 'female' ? '− 161' : '+ 5'} = ${bmr} kcal`);
  }
  const formulaTdee = Math.round(bmr * ACTIVITY[f.activity].factor);
  lines.push(`Daily burn (TDEE): ${bmr} × ${ACTIVITY[f.activity].factor} (${ACTIVITY[f.activity].label}) = ${formulaTdee} kcal`);
  // the weekly review's calibration: what his weight and food log say he
  // really burns, held to ±500 so one odd fortnight cannot run away with it
  const adj = Number.isFinite(Number(f.tdeeAdjust)) ? Math.max(-500, Math.min(500, Math.round(Number(f.tdeeAdjust)))) : 0;
  const tdee = formulaTdee + adj;
  if (adj) lines.push(`Calibrated from your own record: ${formulaTdee} ${adj < 0 ? '−' : '+'} ${Math.abs(adj)}${f.tdeeAdjustOn ? ` (weekly review, ${f.tdeeAdjustOn})` : ''} = ${tdee} kcal`);
  const delta = pace ? (f.goal === 'lose' ? -pace.kcal : pace.kcal) : 0;
  const targetKcal = Math.max(1200, tdee + delta);
  lines.push(pace
    ? `Target: ${tdee} ${delta < 0 ? '−' : '+'} ${Math.abs(delta)} (${f.goal}, ${pace.label}) = ${targetKcal} kcal a day`
    : `Target: maintain — ${targetKcal} kcal a day`);
  // protein: 2.0 g/kg on a cut (holds muscle in a deficit), 1.8 otherwise
  const pPerKg = f.goal === 'lose' ? 2.0 : 1.8;
  const proteinG = Math.round(w * pPerKg);
  lines.push(`Protein floor: ${w} kg × ${pPerKg} g/kg = ${proteinG} g`);
  const fatG = Math.round(w * 0.8);
  lines.push(`Fat floor: ${w} kg × 0.8 g/kg = ${fatG} g`);
  const carbsG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));
  lines.push(`Carbs, the remainder: (${targetKcal} − ${proteinG}×4 − ${fatG}×9) ÷ 4 = ${carbsG} g`);
  const waterL = Math.round(w * 0.035 * 10) / 10;
  lines.push(`Water: ${w} kg × 35 ml = ${waterL} L a day, more on training days`);
  const weeksTo = null; // no target weight is asked; the pace line already says the rate
  return { bmr, bmrFormula, leanKg, formulaTdee, tdeeAdjust: adj, tdee, targetKcal, proteinG, fatG, carbsG, waterL, deltaKcal: delta, pacePerWeekKg: pace ? pace.kcal / 1000 : 0, lines, weeksTo };
}

// a body fat % is a fact only inside a believable band; anything else is absent
export function bodyFat(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 3 && n <= 60 ? Math.round(n * 10) / 10 : null;
}

// The facts that do not change week to week. An edit keeps them unless he
// names a new value, so changing his pace never asks his height again.
export const STABLE_FACTS = ['sex', 'heightCm'];

// An edit: the stored facts, with only what he changed laid over them. A key
// he did not send keeps its stored value; a null clears an optional one.
export function mergeFacts(stored, change) {
  const out = { ...(stored || {}) };
  for (const [k, v] of Object.entries(change || {})) {
    if (!QUESTIONS.some((q) => q.key === k) && k !== 'tdeeAdjust' && k !== 'tdeeAdjustOn') continue;
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = v;
  }
  if (out.goal === 'maintain') delete out.pace;
  else if (out.goal && !out.pace) out.pace = 'steady';
  return out;
}

// The card he approves: the numbers, and every step that made them.
export function describe(f, plan) {
  const head = `${plan.targetKcal} kcal a day · ${plan.proteinG} g protein · ${plan.fatG} g fat · ${plan.carbsG} g carbs`;
  const who = `${f.sex}, ${f.age}, ${f.heightCm} cm, ${f.weightKg} kg${bodyFat(f.bodyFatPct) != null ? ` at ${bodyFat(f.bodyFatPct)}% fat` : ''}, ${ACTIVITY[f.activity].label}; goal: ${f.goal}${f.pace && f.goal !== 'maintain' ? ` (${f.pace})` : ''}`;
  const body = [`**${head}**`, '', `From: ${who}.`, '', ...plan.lines.map((l) => `- ${l}`), f.eating ? `\nEating style he asked the plan to respect: ${f.eating}` : ''].join('\n');
  return { title: `Your numbers: ${head}`, body };
}
