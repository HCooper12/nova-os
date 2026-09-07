// WRAP THE DAY — one sentence, at the moment it can still be acted on.
//
// design/ATHLETE-AI-PLAN.md #2. The sweep of 7 Sep 2026 made the case: the
// protein floor was hit 0 of 7 days last week at an 88 g average against
// 150 g, and nothing in Nova said so while there was still an evening left
// to fix it. Fuel showed the numbers; nobody read them out.
//
// There is NO MODEL in this file. Every number is counted from his real
// files and every clause is chosen by a rule he can read here — a wrap that
// hedged, flattered, or invented a dish he does not own would be worse than
// silence. When a source is missing the sentence says so and stops.

import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday, totalsOf } from './foodLog.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRecentDays, computeWeightTrend } from './healthData.js';

const g = (n) => Math.round(Number(n) || 0);
const num = (n) => g(n).toLocaleString('en-AU');

// A gap this small is noise — his logging is not accurate to five grams, and
// a wrap that nags about 6 g teaches him to stop listening.
export const PROTEIN_NOISE_G = 10;
// After this hour there is no fixing today; the wrap turns to tomorrow.
export const FIXABLE_UNTIL_HOUR = 21;
// The evening the card is allowed to appear on Home (or once the plan is ticked).
export const CARD_FROM_HOUR = 18;
// A weigh-in older than this is worth asking for; his own rhythm is roughly
// weekly (7 Sep: "I do not measure my weight daily").
export const WEIGH_STALE_DAYS = 7;

// ---------------------------------------------------------------------------
// THE FACTS — everything counted, nothing composed.
// ---------------------------------------------------------------------------

export async function wrapFacts(vaultPath, { now = new Date(), deps = {} } = {}) {
  const load = {
    recipes: deps.loadRecipeData || loadRecipeData,
    rotation: deps.loadRotation || loadRotation,
    today: deps.getToday || getToday,
    routines: deps.loadRoutines || loadRoutines,
    exercises: deps.loadExerciseLibrary || loadExerciseLibrary,
    healthDays: deps.loadRecentDays || loadRecentDays,
  };
  const missing = [];

  let profile = null; let recipes = []; let rotation = null;
  try {
    const data = await load.recipes(vaultPath);
    recipes = data.recipes || [];
    profile = data.profile || null;
  } catch { missing.push('your recipe collection'); }
  try { rotation = await load.rotation(vaultPath, recipes); } catch { missing.push("today's rotation"); }

  let eaten = { p: 0, c: 0, f: 0, kcal: 0 }; let entries = 0;
  try {
    const day = await load.today();
    entries = (day.entries || []).length;
    eaten = totalsOf(day.entries || []);
  } catch { missing.push('your food log'); }

  // tomorrow's training — a schedule value, not a routine, when it is active rest
  let tomorrow = null;
  try {
    // loadExerciseLibrary returns { exercises }, not the array — handing the
    // wrapper straight to loadRoutines threw, and tomorrow silently went blank
    const lib = await load.exercises(vaultPath);
    const { routines, schedule } = await load.routines(vaultPath, lib?.exercises || lib || []);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const key = WEEKDAYS[(d.getDay() + 6) % 7];
    const id = schedule?.[key];
    tomorrow = id === ACTIVE_REST
      ? { kind: 'active-rest', name: 'active rest' }
      : id
        ? { kind: 'train', name: (routines || []).find((r) => r.id === id)?.name || null }
        : { kind: 'rest', name: null };
  } catch { tomorrow = null; }

  let weighStaleDays = null;
  try {
    const trend = computeWeightTrend(await load.healthDays(60));
    if (trend?.staleDays != null) weighStaleDays = trend.staleDays;
  } catch { /* health is optional here — the wrap is about food */ }

  const targetKcal = profile?.targetKcal || null;
  const floorG = profile?.proteinFloorG || null;

  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    hour: now.getHours(),
    entries,
    eaten: { kcal: g(eaten.kcal), p: g(eaten.p), c: g(eaten.c), f: g(eaten.f) },
    targets: targetKcal || floorG ? { kcal: targetKcal, protein: floorG } : null,
    kcalLeft: targetKcal ? targetKcal - g(eaten.kcal) : null,
    proteinShort: floorG ? Math.max(0, floorG - g(eaten.p)) : null,
    floorMet: floorG ? g(eaten.p) >= floorG : null,
    dishes: candidateDishes(rotation, recipes),
    fridge: fridgeStock(rotation, recipes),
    planNames: Object.values(rotation?.slots || {}).filter(Boolean).map((s) => s.name).filter(Boolean),
    planTicked: planFullyTicked(rotation),
    tomorrow,
    weighStaleDays,
    missing,
  };
}

// Everything he could actually eat tonight without cooking: a rotation option
// he has not ticked, and anything counted in the fridge. Nothing invented —
// if it is not in his collection or his rotation, it is not offered.
function candidateDishes(rotation, recipes) {
  const out = [];
  const seen = new Set();
  for (const key of rotation?.order || []) {
    for (const d of rotation.options?.[key] || []) {
      if (d.eaten || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({ id: d.id, name: d.name, macros: d.macros || {}, inFridge: (d.portionsLeft || 0) > 0, slot: rotation.labels?.[key] || key });
    }
  }
  const counts = rotation?.portions?.counts || rotation?.portions || {};
  for (const [id, n] of Object.entries(counts)) {
    if (typeof n !== 'number' || n <= 0 || seen.has(id)) continue;
    const r = (recipes || []).find((x) => x.id === id);
    if (!r) continue;
    seen.add(id);
    out.push({ id, name: r.name, macros: r.macros || {}, inFridge: true, slot: null });
  }
  return out;
}

// What is actually cooked and counted, whatever slot it belongs to. An empty
// fridge is the one thing that blocks tomorrow before it starts.
function fridgeStock(rotation, recipes) {
  const counts = rotation?.portions?.counts || rotation?.portions || {};
  const byId = new Map((recipes || []).map((r) => [r.id, r.name]));
  return Object.entries(counts)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .map(([id, n]) => ({ id, name: byId.get(id) || id, portions: n }));
}

function planFullyTicked(rotation) {
  const slots = Object.values(rotation?.slots || {}).filter(Boolean);
  if (!slots.length) return false;
  return slots.every((s) => s.eaten || (s.eatenCount || 0) > 0);
}

// The one dish that closes tonight's gap. Ranked: from the fridge first (no
// cooking at 8pm), then one that ACTUALLY closes the gap over one that only
// dents it — the first draft preferred the smallest dish and offered a 45 g
// pot against a 51 g gap while a bowl that finished the job sat in the same
// fridge with 790 kcal of room — then the smallest of those. A dish that
// would blow the calorie room by more than a snack's worth is not a fix.
export function closerFor(facts) {
  const short = facts.proteinShort;
  if (!short || short < PROTEIN_NOISE_G) return null;
  if (facts.hour >= FIXABLE_UNTIL_HOUR) return null;
  const room = facts.kcalLeft == null ? Infinity : Math.max(facts.kcalLeft, 0) + 150;
  const fits = (facts.dishes || [])
    .filter((d) => g(d.macros.p) >= Math.min(short * 0.6, 25) && g(d.macros.kcal) <= room)
    .sort((a, b) => (Number(b.inFridge) - Number(a.inFridge))
      || (Number(g(b.macros.p) >= short) - Number(g(a.macros.p) >= short))
      || (g(b.macros.p) >= short ? g(a.macros.kcal) - g(b.macros.kcal) : g(b.macros.p) - g(a.macros.p)));
  const best = fits[0];
  if (!best) return null;
  return {
    name: best.name,
    protein: g(best.macros.p),
    kcal: g(best.macros.kcal),
    inFridge: best.inFridge,
    closes: g(best.macros.p) >= short,
  };
}

// THE ONE THING TOMORROW NEEDS, ranked. Ordered by what actually blocks the
// next day: he cannot eat what is not cooked; a missed floor repeats unless
// the protein moves earlier; the scales answer a question the rest can't.
export function askFor(facts) {
  // nothing cooked and a plan that assumes there is: he cannot eat a rotation
  if (!(facts.fridge || []).length && (facts.planNames || []).length) {
    return { kind: 'cook', text: `a cook-up — the fridge is empty and ${facts.planNames[0]} is on the plan.` };
  }
  if (facts.floorMet === false && facts.proteinShort >= PROTEIN_NOISE_G) {
    const early = [...(facts.dishes || [])].sort((a, b) => g(b.macros.p) - g(a.macros.p))[0];
    return {
      kind: 'protein',
      text: early
        ? `protein earlier — ${early.name} is ${g(early.macros.p)} g and gets you most of the way before lunch.`
        : 'protein earlier — tonight was a catch-up, and catching up rarely works twice.',
    };
  }
  if (facts.weighStaleDays != null && facts.weighStaleDays >= WEIGH_STALE_DAYS) {
    return { kind: 'weigh', text: `the scales — your last weigh-in was ${facts.weighStaleDays} days ago, so the trend has stopped moving.` };
  }
  if (facts.tomorrow?.kind === 'train' && facts.tomorrow.name) {
    return { kind: 'train', text: `${facts.tomorrow.name} — eat like it.` };
  }
  if (facts.tomorrow?.kind === 'active-rest') return { kind: 'train', text: 'active rest — a walk, not a session.' };
  if (facts.targets?.kcal) return { kind: 'hold', text: `the same again — ${num(facts.targets.kcal)} kcal, ${facts.targets.protein || '—'} g.` };
  return { kind: 'hold', text: 'nothing new — hold what you did today.' };
}

// ---------------------------------------------------------------------------
// THE SENTENCE
// ---------------------------------------------------------------------------

export function composeWrap(facts) {
  const ask = askFor(facts);
  const closer = closerFor(facts);

  if (!facts.entries) {
    return {
      line: facts.missing.length
        ? `Nothing is logged today, and I could not read ${facts.missing.join(' or ')} — so there is nothing honest to wrap.`
        : 'Nothing is logged today, so there is nothing to wrap — tell me what you ate and I will square it against your targets.',
      ask, closer, facts,
    };
  }

  if (!facts.targets) {
    return {
      line: `${num(facts.eaten.kcal)} kcal and ${facts.eaten.p} g of protein across ${facts.entries} ${facts.entries === 1 ? 'entry' : 'entries'} today. Whether that landed I cannot say — no targets are set. Say "set my numbers" and I will work them out properly.`,
      ask, closer, facts,
    };
  }

  const parts = [];
  const t = facts.targets;
  parts.push(t.kcal
    ? `${num(facts.eaten.kcal)} of ${num(t.kcal)} kcal`
    : `${num(facts.eaten.kcal)} kcal`);
  parts.push(t.protein
    ? `${facts.eaten.p} of ${t.protein} g protein`
    : `${facts.eaten.p} g protein`);
  let line = `${parts.join(' and ')} today`;

  // what is left, or what it went over by
  if (facts.kcalLeft != null) {
    line += facts.kcalLeft > 0 ? `, ${num(facts.kcalLeft)} kcal to spare` : facts.kcalLeft < 0 ? `, ${num(-facts.kcalLeft)} over` : ', square on target';
  }

  // the floor — the thing the sweep found nobody said
  if (facts.floorMet === true) line += ' — floor cleared.';
  else if (facts.floorMet === false) {
    line += ` — the floor is ${facts.proteinShort} g away`;
    if (closer) {
      line += closer.inFridge
        ? `, and one ${closer.name} from the fridge ${closer.closes ? 'closes it' : `takes ${closer.protein} g off it`} for ${num(closer.kcal)} kcal.`
        : `, and ${closer.name} — on today's plan, not ticked — ${closer.closes ? 'closes it' : `takes ${closer.protein} g off it`} for ${num(closer.kcal)} kcal.`;
    } else line += facts.hour >= FIXABLE_UNTIL_HOUR ? ', too late to fix tonight.' : ', and nothing you have on hand closes it.';
  } else line += '.';

  line += ` Tomorrow: ${ask.text}`;
  if (facts.missing.length) line += ` (I could not read ${facts.missing.join(' or ')}, so this is partial.)`;
  return { line, ask, closer, facts };
}

// The Home card is not a nag: it appears once the day's plan is ticked or the
// evening has started, and only when there is something logged to wrap.
export function shouldShowCard(facts) {
  if (!facts.entries) return false;
  return facts.planTicked || facts.hour >= CARD_FROM_HOUR;
}

export async function wrapDay(vaultPath, opts = {}) {
  const facts = await wrapFacts(vaultPath, opts);
  const out = composeWrap(facts);
  return { ...out, show: shouldShowCard(facts) };
}
