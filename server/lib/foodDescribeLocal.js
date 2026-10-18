// Describe food in words WITHOUT a model (18 Oct 2026). When Claude is
// unavailable (usage out, lane switched off, unparseable output) the words he
// typed are still turned into a plate by code alone: split into components,
// parse each amount, and match in order against
//   1. his own past food log (entries, then the lines inside itemised plates)
//   2. his saved recipes
//   3. USDA FoodData Central, only when the amount can be turned into grams
//      (needs network; any failure just leaves the component unmatched).
// Nothing is invented: a component that matches nothing comes back with its
// name and null macros, flagged `unmatched`, so it can be saved name-only and
// filled in later. The result has the same shape the model path produces.
import { loadRecentDays } from './foodLog.js';
import { loadRecipeData } from './recipes.js';
import { scaleTo, kcalFrom } from './nutritionFacts.js';

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25, couple: 2, dozen: 12,
};
// unit word -> { kind, grams } ; grams null means "a count of that unit"
const UNITS = {
  g: { kind: 'g', k: 1 }, gram: { kind: 'g', k: 1 }, grams: { kind: 'g', k: 1 }, gm: { kind: 'g', k: 1 },
  kg: { kind: 'g', k: 1000 }, kilo: { kind: 'g', k: 1000 },
  ml: { kind: 'g', k: 1 }, l: { kind: 'g', k: 1000 },
  oz: { kind: 'g', k: 28.35 }, ounce: { kind: 'g', k: 28.35 }, ounces: { kind: 'g', k: 28.35 },
  cup: { kind: 'n', unit: 'cup', grams: 240 }, cups: { kind: 'n', unit: 'cup', grams: 240 },
  tbsp: { kind: 'n', unit: 'tbsp', grams: 15 }, tablespoon: { kind: 'n', unit: 'tbsp', grams: 15 }, tablespoons: { kind: 'n', unit: 'tbsp', grams: 15 },
  tsp: { kind: 'n', unit: 'tsp', grams: 5 }, teaspoon: { kind: 'n', unit: 'tsp', grams: 5 }, teaspoons: { kind: 'n', unit: 'tsp', grams: 5 },
  scoop: { kind: 'n', unit: 'scoop', grams: 30 }, scoops: { kind: 'n', unit: 'scoop', grams: 30 },
  slice: { kind: 'n', unit: 'slice', grams: 35 }, slices: { kind: 'n', unit: 'slice', grams: 35 },
  serve: { kind: 'n', unit: 'serve', grams: null }, serves: { kind: 'n', unit: 'serve', grams: null },
  serving: { kind: 'n', unit: 'serve', grams: null }, servings: { kind: 'n', unit: 'serve', grams: null },
  bowl: { kind: 'n', unit: 'bowl', grams: null }, bowls: { kind: 'n', unit: 'bowl', grams: null },
  piece: { kind: 'n', unit: 'piece', grams: null }, pieces: { kind: 'n', unit: 'piece', grams: null },
};
// typical weight of one of a countable food, for the USDA step only
const EACH_GRAMS = { egg: 50, banana: 118, toast: 35, bread: 35, apple: 180, avocado: 150, orange: 130, pretzel: 10 };
const STOP = new Set(['of', 'the', 'a', 'an', 'some', 'my', 'with', 'and', 'on', 'in', 'plain', 'to']);

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (d) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(d || ''));
  return m ? `${monthShort[Number(m[1]) - 1]} ${Number(m[2])}` : String(d || '');
};

function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|xes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Split the sentence into components on "and", "+", commas, "with", "&". */
export function splitComponents(text) {
  return String(text || '')
    .split(/\s*(?:,|\+|&|;|\band\b|\bwith\b|\bplus\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * "200g chicken" -> { amount:{kind:'g',v:200}, name:'chicken' }
 * "2 eggs" -> { amount:{kind:'n',v:2,unit:null}, name:'eggs' }
 * "half a cup of rice" -> { amount:{kind:'n',v:0.5,unit:'cup',grams:240}, name:'rice' }
 * No leading amount -> amount null (one of it, as logged).
 */
export function parseComponent(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  const said = s;
  let v = null;
  // "1/2", "1.5", "200", "2x"
  let m = /^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*x?\s*/i.exec(s);
  if (m) {
    v = m[1].includes('/') ? m[1].split('/').reduce((a, b) => Number(a) / Number(b)) : Number(m[1]);
    s = s.slice(m[0].length);
  } else {
    m = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|couple|dozen)\b\s*(?:of\s+)?/i.exec(s);
    if (m) { v = WORD_NUMBERS[m[1].toLowerCase()]; s = s.slice(m[0].length); }
  }
  let amount = null;
  if (v != null) {
    // "half a cup", "a couple of"
    s = s.replace(/^(?:a|an)\s+/i, '').replace(/^of\s+/i, '');
    const um = /^([a-z]+)\b\.?\s*(?:of\s+)?/i.exec(s);
    const unit = um ? UNITS[um[1].toLowerCase()] : null;
    if (unit) {
      s = s.slice(um[0].length);
      amount = unit.kind === 'g' ? { kind: 'g', v: v * unit.k } : { kind: 'n', v, unit: unit.unit, grams: unit.grams };
    } else {
      amount = { kind: 'n', v, unit: null, grams: null };
    }
  }
  const name = s.replace(/^of\s+/i, '').trim() || said;
  return { said, amount, name };
}

export function keyTokens(name) {
  return String(name || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d/.test(w) && !STOP.has(w) && !(UNITS[w]))
    .map(singular);
}

/** token-set similarity: 0 no match; higher is closer. Query must overlap fully one way. */
function similarity(qTok, cTok) {
  if (!qTok.length || !cTok.length) return 0;
  const q = new Set(qTok); const c = new Set(cTok);
  const qInC = qTok.every((t) => c.has(t));
  const cInQ = cTok.every((t) => q.has(t));
  if (qInC && cInQ) return 1;
  if (qInC) return 0.6 * (qTok.length / cTok.length) + 0.2; // asked "whey", logged "whey isolate"
  if (cInQ) return 0.5 * (cTok.length / qTok.length);       // asked "greek yoghurt honey", logged "greek yoghurt"
  return 0;
}

/** How many of what a candidate represents, read from its own name/grams. */
function candidateAmount(name, grams) {
  const p = parseComponent(name);
  if (p.amount) return p.amount;
  if (Number.isFinite(grams) && grams > 0) return { kind: 'g', v: grams };
  return null;
}

function ratioFor(q, e) {
  if (!q) return { r: 1, scaled: false };
  if (q.kind === 'g' && e?.kind === 'g' && e.v > 0) return { r: q.v / e.v, scaled: true };
  if (q.kind === 'n') {
    const base = e?.kind === 'n' && e.v > 0 ? e.v : 1;
    if (e?.kind === 'n' && q.unit && e.unit && q.unit !== e.unit) return { r: q.v, scaled: false };
    return { r: q.v / base, scaled: true };
  }
  return { r: 1, scaled: false }; // grams asked, nothing to scale by: one logged portion
}

const scaleMacros = (m, r) => ({
  p: Math.round((Number(m.p) || 0) * r * 10) / 10,
  c: Math.round((Number(m.c) || 0) * r * 10) / 10,
  f: Math.round((Number(m.f) || 0) * r * 10) / 10,
  kcal: Math.round((Number(m.kcal) || 0) * r),
});

function logCandidates(days) {
  const out = [];
  for (const day of days) { // loadRecentDays is newest day first
    const entries = [...(day.entries || [])].reverse();
    for (const e of entries) {
      if (!e?.name || !e.macros) continue;
      out.push({ kind: 'log', name: e.name, macros: e.macros, date: day.date, amt: candidateAmount(e.name, null), tok: keyTokens(e.name) });
      for (const it of e.items || []) {
        if (!it?.name || !it.macros || !(Number(it.macros.kcal) > 0)) continue;
        out.push({ kind: 'log', name: it.name, macros: it.macros, date: day.date, amt: candidateAmount(it.name, Number(it.grams)), tok: keyTokens(it.name) });
      }
    }
  }
  return out;
}

function best(cands, qTok) {
  let top = null; let topScore = 0;
  for (const c of cands) { // list is already newest first, so ties keep the newest
    const s = similarity(qTok, c.tok);
    if (s > topScore) { top = c; topScore = s; }
  }
  return topScore >= 0.5 ? top : null;
}

function gramsFor(amount, name) {
  if (!amount) return null;
  if (amount.kind === 'g') return amount.v;
  if (amount.unit && amount.grams) return amount.v * amount.grams;
  if (!amount.unit) {
    const each = keyTokens(name).map((t) => EACH_GRAMS[t]).find(Boolean);
    if (each) return amount.v * each;
  }
  return null;
}

/**
 * @param {string} text what he typed
 * @param {{vaultPath?:string, lookup?:(name:string)=>Promise<any>, days?:number}} deps
 */
export async function describeLocal(text, { vaultPath, lookup, days = 90 } = {}) {
  const said = String(text || '').replace(/\s+/g, ' ').trim();
  const parts = splitComponents(said);
  const cands = logCandidates(await loadRecentDays(days).catch(() => []));
  let recipes = [];
  if (vaultPath) {
    try {
      recipes = (await loadRecipeData(vaultPath)).recipes
        .filter((r) => r.macros && Number.isFinite(Number(r.macros.kcal)))
        .map((r) => ({ kind: 'recipe', name: r.name, macros: r.macros, amt: null, tok: keyTokens(r.name) }));
    } catch { /* no vault or no recipe file: skip the step */ }
  }

  const components = [];
  for (const part of parts.length ? parts : [said]) {
    const p = parseComponent(part);
    const qTok = keyTokens(p.name);
    const line = { name: p.name, said: p.said };
    const hit = best(cands, qTok) || best(recipes, qTok);
    if (hit) {
      const { r, scaled } = ratioFor(p.amount, hit.amt);
      line.macros = scaleMacros(hit.macros, r);
      const g = gramsFor(p.amount, p.name);
      if (g) line.grams = Math.round(g);
      line.matched = hit.kind === 'log'
        ? `your log: ${hit.name} (${prettyDate(hit.date)})${scaled || !p.amount ? '' : ', as logged'}`
        : `your recipe: ${hit.name}${p.amount ? '' : ' (1 serving)'}`;
      line.source = line.matched;
      line.sourced = true;
      components.push(line);
      continue;
    }
    const grams = gramsFor(p.amount, p.name);
    let fact = null;
    if (grams && lookup !== null) {
      try { fact = await (lookup || (await import('./nutritionFacts.js')).lookupPer100g)(p.name); } catch { fact = null; }
    }
    if (fact?.per100g) {
      const sc = scaleTo(fact.per100g, grams);
      line.grams = Math.round(grams);
      line.macros = { ...sc, kcal: kcalFrom(sc) };
      line.matched = `USDA FoodData Central: ${fact.matched || p.name}`;
      line.source = line.matched;
      line.sourced = true;
    } else {
      line.macros = null;
      line.unmatched = true;
      line.matched = null;
      line.source = 'not matched: add its macros';
      line.sourced = false;
    }
    components.push(line);
  }

  const have = components.filter((c) => c.macros);
  const sum = have.reduce((a, c) => ({ p: a.p + c.macros.p, c: a.c + c.macros.c, f: a.f + c.macros.f, kcal: a.kcal + c.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
  const missing = components.filter((c) => c.unmatched).map((c) => c.name);
  return {
    name: said,
    macros: { p: Math.round(sum.p), c: Math.round(sum.c), f: Math.round(sum.f), kcal: Math.round(sum.kcal) },
    components,
    sourceNote: `${have.length} of ${components.length} parts matched from your log, recipes or USDA; the rest are name-only.`,
    confidence: 'low',
    question: '',
    source: 'code',
    ...(missing.length ? { unmatched: missing } : {}),
  };
}

/** The sentence the client can show: why code answered, and what is left to fill. */
export function fallbackNote(result, why) {
  const lead = why === 'off'
    ? 'Claude is switched off, so Nova matched these from your own log.'
    : 'Claude was unavailable, so Nova matched these from your own log.';
  const miss = result.unmatched?.length ? ` Not found: ${result.unmatched.join(', ')}. Add the macros below, or save them by name and fill them in later.` : '';
  return lead + miss;
}
