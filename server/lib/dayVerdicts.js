// TODAY'S VERDICTS, DECIDED BY CODE (3 Nov 2026). The model on this Mac was
// still wrong on the health insight and the daily review in the same way
// every time: handed "178 g eaten, 167 g floor" it wrote "only 178 g … close
// the gap"; handed a duration in minutes it wrote metres. The numbers were
// all grounded, so assertGrounded could not see it. A comparison is code's
// job, not a model's (deterministic first; models decide, code acts), so:
//
//   1. code makes each comparison and says the result as a line the model
//      reads first ("Protein so far: 178 g, ABOVE the 167 g floor by 11 g:
//      the floor is MET"), so there is nothing left for it to compare;
//   2. code reads the reply back and refuses one whose sentence about today's
//      protein, calories, steps or HRV points the other way, or puts one of
//      his numbers in another unit. A refusal is an escalation to Claude
//      (lib/textLane.js), never a reply.
//
// The check is deliberately narrow: it judges a sentence only when that
// sentence is about TODAY (it carries today's own figure, or says today / so
// far / now without naming another day), so "you missed the floor on 5 of
// the last 7 days" is history and passes.
import { loadRecentDays } from './healthData.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { STEP_GOAL } from './streaks.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('en-AU') : String(n));
const num = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

// HRV and resting heart rate are judged against the six days before today;
// inside ±10 % is "about usual", which no sentence may call high or low
export const HRV_BAND = 0.10;

/** The facts the verdicts are made from, read from the same stores the two
 *  lanes read. Every field may be null: a missing reading makes no verdict. */
export async function loadDayFacts(vaultPath, now = new Date()) {
  const t = isoDay(now);
  const facts = { date: t, proteinG: null, proteinFloorG: null, kcal: null, kcalTarget: null, steps: null, stepGoal: STEP_GOAL, hrv: null, hrvWeek: null, rhr: null, rhrWeek: null };
  try {
    const days = await loadRecentDays(7);
    const today = days.find((d) => d.date === t) || null;
    const before = days.filter((d) => d.date < t);
    const mean = (k) => { const xs = before.map((d) => num(d[k])).filter((x) => x != null); return xs.length >= 3 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; };
    if (today) {
      facts.hrv = num(today.hrv);
      facts.rhr = num(today.restingHeartRate);
      facts.steps = num(today.steps);
    }
    facts.hrvWeek = mean('hrv');
    facts.rhrWeek = mean('restingHeartRate');
  } catch { /* no health data, no verdict */ }
  try {
    const { recipes, profile } = await loadRecipeData(vaultPath);
    const rotation = await loadRotation(vaultPath, recipes);
    const log = await getFoodLogToday();
    const extra = log.entries.reduce((a, e) => ({ p: a.p + (Number(e.macros?.p) || 0), kcal: a.kcal + (Number(e.macros?.kcal) || 0) }), { p: 0, kcal: 0 });
    facts.proteinG = Math.round((rotation.consumedTotals?.p || 0) + extra.p);
    facts.kcal = Math.round((rotation.consumedTotals?.kcal || 0) + extra.kcal);
    facts.proteinFloorG = num(profile?.proteinFloorG);
    facts.kcalTarget = num(profile?.targetKcal);
  } catch { /* no food data, no verdict */ }
  return facts;
}

/** Each comparison as { topic, state, line }. state is the direction a
 *  sentence about it must not contradict. */
export function dayVerdicts(f) {
  const out = [];
  if (f.proteinG != null && f.proteinFloorG) {
    const d = f.proteinG - f.proteinFloorG;
    out.push(d >= 0
      ? { topic: 'protein', state: 'met', figure: f.proteinG, line: `Protein so far today: ${fmt(f.proteinG)} g, ABOVE the ${fmt(f.proteinFloorG)} g floor by ${fmt(d)} g. The floor is MET: never call it short, a gap, or something to close.` }
      : { topic: 'protein', state: 'short', figure: f.proteinG, line: `Protein so far today: ${fmt(f.proteinG)} g, BELOW the ${fmt(f.proteinFloorG)} g floor by ${fmt(-d)} g. The floor is NOT met yet.` });
  }
  if (f.kcal != null && f.kcalTarget) {
    const d = f.kcal - f.kcalTarget;
    out.push(d > 0
      ? { topic: 'calories', state: 'over', figure: f.kcal, line: `Energy so far today: ${fmt(f.kcal)} kcal, OVER the ${fmt(f.kcalTarget)} kcal target by ${fmt(d)} kcal.` }
      : { topic: 'calories', state: 'under', figure: f.kcal, line: `Energy so far today: ${fmt(f.kcal)} kcal, UNDER the ${fmt(f.kcalTarget)} kcal target by ${fmt(-d)} kcal.` });
  }
  if (f.steps != null && f.stepGoal) {
    const d = f.steps - f.stepGoal;
    out.push(d >= 0
      ? { topic: 'steps', state: 'met', figure: f.steps, line: `Steps so far today: ${fmt(f.steps)}, the ${fmt(f.stepGoal)} goal is MET.` }
      : { topic: 'steps', state: 'short', figure: f.steps, line: `Steps so far today: ${fmt(f.steps)}, ${fmt(-d)} short of the ${fmt(f.stepGoal)} goal.` });
  }
  if (f.hrv != null && f.hrvWeek) {
    const r = (f.hrv - f.hrvWeek) / f.hrvWeek;
    const pct = Math.round(Math.abs(r) * 100);
    const state = r <= -HRV_BAND ? 'low' : r >= HRV_BAND ? 'high' : 'usual';
    out.push({ topic: 'hrv', state, figure: f.hrv, line: `HRV today: ${fmt(f.hrv)} ms against a ${fmt(f.hrvWeek)} ms average over the days before, ${state === 'usual' ? `within ${Math.round(HRV_BAND * 100)} %: ABOUT USUAL, neither high nor low` : `${pct} % ${state === 'low' ? 'BELOW' : 'ABOVE'} it: ${state === 'low' ? 'LOWER than usual' : 'HIGHER than usual'}`}.` });
  }
  return out;
}

/** The verdict block both compact prompts carry, or '' when there is none. */
export function verdictBlock(verdicts) {
  if (!verdicts.length) return '';
  return ['## VERDICTS (compared by code; state them as written, never compare these numbers yourself)', ...verdicts.map((v) => `- ${v.line}`), ''].join('\n');
}

// ---- the read-back ----------------------------------------------------------
const TOPIC = {
  protein: /\bprotein\b/i,
  calories: /\b(calories|kcal|energy)\b/i,
  steps: /\bsteps?\b/i,
  hrv: /\bhrv\b|heart rate variability|\brecover(y|ed)\b/i,
};
// what a sentence claims, per topic and direction
const SAYS = {
  protein: {
    short: /\b(only|short|shortfall|gap|below|under|miss(ed|ing)?|behind|close (the|that) gap|still need|hit the (daily )?floor|reach the (daily )?floor|catch up|not (yet )?met)\b/i,
    met: /\b(met|hit|above|exceed(ed|s)?|cleared|over the floor|past the floor)\b/i,
  },
  calories: {
    under: /\b(under|deficit|room (left|for)|below (the|your) target|headroom)\b/i,
    over: /\b(over|above (the|your) target|exceed(ed|s)?|surplus|too (much|many))\b/i,
  },
  steps: {
    short: /\b(short|below|under|miss(ed|ing)?|behind|still need|not (yet )?(met|reached|hit))\b/i,
    met: /\b(met|hit|reached|exceed(ed|s|ing)?|beat|above|past)\b/i,
  },
  hrv: {
    low: /\b(low|lower|dropped|drop|fell|down|below|poor|suppressed|recovery (is|was) (low|poor)|under-recovered|not recovered)\b/i,
    high: /\b(high|higher|rose|up|above|well recovered|strong recovery|fully recovered|elevated)\b/i,
  },
};
// the direction that contradicts each state
const CONTRA = { met: 'short', short: 'met', over: 'under', under: 'over', low: 'high', high: 'low', usual: null };
const OTHER_DAY = /\b(yesterday|last (night|week)|days?\b(?! so far)|weekends?|week|average|avg|usually|streak|\d+ of (the )?(last )?\d+)\b/i;
const TODAYISH = /\b(today|so far|now|this (morning|afternoon|evening))\b/i;

const sentences = (text) => String(text || '').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const hasFigure = (s, n) => n != null && new RegExp(`(^|[^\\d.,])${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',?')}(?![\\d]|[.,]\\d)`).test(s);

/** Sentences about today that point the other way from a verdict. */
export function contradictions(text, verdicts) {
  const found = [];
  for (const s of sentences(text)) {
    for (const v of verdicts) {
      if (!TOPIC[v.topic].test(s)) continue;
      const aboutToday = hasFigure(s, v.figure) || (TODAYISH.test(s) && !OTHER_DAY.test(s));
      if (!aboutToday) continue;
      const wrong = CONTRA[v.state];
      if (v.state === 'usual') {
        if (SAYS.hrv.low.test(s) || SAYS.hrv.high.test(s)) found.push({ topic: v.topic, state: v.state, sentence: s });
        continue;
      }
      if (wrong && SAYS[v.topic][wrong].test(s) && !SAYS[v.topic][v.state].test(s)) found.push({ topic: v.topic, state: v.state, sentence: s });
    }
  }
  return found;
}

// ---- units -----------------------------------------------------------------
// one class per kind of quantity; a number the prompt gave in one class must
// not come back in another (the 9B's "74 m" walk that was 74 minutes)
const UNIT_CLASS = [
  [/^(g|grams?)$/i, 'mass-g'], [/^(kg|kilos?|kilograms?)$/i, 'mass-kg'],
  [/^(kcal|cal|calories)$/i, 'energy'], [/^(ms)$/i, 'hrv'], [/^(bpm)$/i, 'rate'],
  [/^(min|mins|minutes?)$/i, 'time-min'], [/^(h|hrs?|hours?)$/i, 'time-h'], [/^(s|secs?|seconds?)$/i, 'time-s'],
  [/^(m|metres?|meters?)$/i, 'dist-m'], [/^(km|kilometres?|kilometers?)$/i, 'dist-km'],
  [/^(steps?)$/i, 'steps'], [/^(%|percent)$/i, 'pct'],
];
const classOf = (u) => (UNIT_CLASS.find(([re]) => re.test(u)) || [null, null])[1];
const QTY_RE = /(\d+(?:[.,]\d+)*)\s?(%|[a-zA-Z]+)/g;
const norm = (n) => n.replace(/,(?=\d{3}\b)/g, '').replace(/\.0+$/, '');
function unitsByNumber(text) {
  const m = new Map();
  for (const [, n, u] of String(text || '').matchAll(QTY_RE)) {
    const c = classOf(u);
    if (!c) continue;
    const k = norm(n);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(c);
  }
  return m;
}
/** Numbers the answer puts in a unit class the prompt never gave them. */
export function unitMismatches(answer, prompt) {
  const given = unitsByNumber(prompt);
  const out = [];
  for (const [n, classes] of unitsByNumber(answer)) {
    const g = given.get(n);
    if (!g) continue; // a bare number in the prompt: nothing to hold it to
    for (const c of classes) if (!g.has(c)) out.push(`${n} as ${c} (shown as ${[...g].join('/')})`);
  }
  return out;
}

/** A validate step for the local model's prose: throws on a contradicted
 *  verdict or a changed unit, naming the sentence. */
export function assertAgrees(answer, verdicts, prompt, what = 'the answer') {
  const c = contradictions(answer, verdicts);
  if (c.length) throw new Error(`${what} says "${c[0].sentence.slice(0, 140)}", but code read today's ${c[0].topic} as ${c[0].state}`);
  const u = unitMismatches(answer, prompt);
  if (u.length) throw new Error(`${what} gives ${u.slice(0, 2).join('; ')}`);
  return true;
}
