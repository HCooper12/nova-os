import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// REAL NUMBERS, NOT REMEMBERED ONES.
//
// He asked the same pizza twice and got 1050 kcal / 50g protein, then 940 /
// 36g. Neither was a calculation: the describe prompt told the model that
// for most foods it "already knows these well enough — answer immediately
// from your own knowledge". Language models are not reliable at numeric
// recall, so that instruction guarantees a different plausible-looking
// number every time you ask. The discrepancy was not a bug in the estimate;
// estimating was the bug.
//
// This module is the other half of the fix, and it follows the platform's
// own rule — models interpret, CODE computes:
//
//   the model  decomposes "a large pepperoni pizza" into components with
//              gram weights. That is a language judgement, which it is good at.
//   this code  looks each component up in USDA FoodData Central, multiplies
//              by the real weight, sums, and derives kcal from the Atwater
//              factors. That is arithmetic, which it is bad at.
//
// Same description in, same numbers out — every time, and every number
// traceable to a source he can check.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CACHE_DIR = () => path.join(dataRoot(), 'nutrition-cache');

// DEMO_KEY is rate-limited (about 30/hour) but needs no signup, so this
// works out of the box and gets better with a free key in server/.env.
const FDC_KEY = () => process.env.USDA_FDC_API_KEY || 'DEMO_KEY';
const FDC_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const LOOKUP_TIMEOUT_MS = 12_000;

/* ------------------------------- arithmetic ------------------------------- */

// The Atwater factors. Energy is DERIVED, never taken from the model: a
// stated kcal that disagrees with its own macros is the most common way an
// estimate is quietly self-contradictory, and there is no reason to accept
// one when the macros are right there.
export const ATWATER = { p: 4, c: 4, f: 9 };
export function kcalFrom({ p = 0, c = 0, f = 0 }) {
  return Math.round(p * ATWATER.p + c * ATWATER.c + f * ATWATER.f);
}

/** Scale a per-100g fact to a real weight. */
export function scaleTo(per100g, grams) {
  const k = (Number(grams) || 0) / 100;
  return {
    p: +(per100g.p * k).toFixed(1),
    c: +(per100g.c * k).toFixed(1),
    f: +(per100g.f * k).toFixed(1),
  };
}

/* --------------------------------- cache ---------------------------------- */
// Reproducibility is the whole point: asking twice must not roll the dice
// again. Keyed on the normalised food name, so "Pepperoni Pizza" and
// "pepperoni pizza" are one entry.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cachePath = (name) => path.join(CACHE_DIR(), `${createHash('sha1').update(norm(name)).digest('hex').slice(0, 16)}.json`);

async function readCache(name) {
  const p = cachePath(name);
  if (!existsSync(p)) return null;
  try {
    const d = JSON.parse(await readFile(p, 'utf8'));
    // a fact about a food does not go stale, but a bad early entry should be
    // replaceable — version it so the cache can be invalidated deliberately
    return d?.v === 1 ? d : null;
  } catch { return null; }
}

async function writeCache(name, entry) {
  try {
    await mkdir(CACHE_DIR(), { recursive: true });
    const tmp = cachePath(name) + '.tmp';
    await writeFile(tmp, JSON.stringify({ v: 1, ...entry }, null, 2), 'utf8');
    await rename(tmp, cachePath(name));
  } catch { /* a cache miss next time is the only cost */ }
}

/* ------------------------------ the lookup -------------------------------- */

function pickNutrients(food) {
  const out = { p: null, c: null, f: null, kcal: null };
  for (const n of food.foodNutrients || []) {
    const name = n.nutrientName || n.nutrient?.name || '';
    const val = Number(n.value ?? n.amount);
    if (!Number.isFinite(val)) continue;
    if (name === 'Protein') out.p = val;
    else if (name === 'Total lipid (fat)') out.f = val;
    else if (name === 'Carbohydrate, by difference') out.c = val;
    else if (name === 'Energy' && (n.unitName === 'KCAL' || n.nutrient?.unitName === 'kcal')) out.kcal = val;
  }
  return out;
}

/**
 * Per-100g facts for one component, from USDA. Returns null rather than a
 * guess — an honest miss lets the caller fall back to the model's own figure
 * and SAY it did, which is worth more than a confident wrong number.
 */
export async function lookupPer100g(name) {
  const cached = await readCache(name);
  if (cached) return cached.fact;

  try {
    const url = `${FDC_SEARCH}?query=${encodeURIComponent(name)}&pageSize=5&api_key=${FDC_KEY()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    // Prefer the data types that are actually measured in a lab, in order:
    // Foundation and SR Legacy are USDA's own analyses; Branded is
    // manufacturer-declared; Survey is modelled.
    const rank = { Foundation: 0, SR_Legacy: 1, 'SR Legacy': 1, Survey: 2, 'Survey (FNDDS)': 2, Branded: 3 };
    const foods = (data.foods || [])
      .map((f) => ({ f, n: pickNutrients(f) }))
      .filter((x) => x.n.p != null && x.n.c != null && x.n.f != null)
      .sort((a, b) => (rank[a.f.dataType] ?? 9) - (rank[b.f.dataType] ?? 9));
    if (!foods.length) return null;
    const best = foods[0];
    const fact = {
      source: 'USDA FoodData Central',
      dataType: best.f.dataType || 'unknown',
      matched: best.f.description || name,
      fdcId: best.f.fdcId || null,
      per100g: { p: best.n.p, c: best.n.c, f: best.n.f },
    };
    await writeCache(name, { fact, at: new Date().toISOString() });
    return fact;
  } catch {
    return null; // offline or rate-limited — the caller degrades honestly
  }
}

/* ------------------------------- the total -------------------------------- */

/**
 * Turn the model's component breakdown into ONE audited total.
 * @param {{name:string, grams:number, per100g?:{p,c,f}}[]} components
 * @returns {{macros, components, sourced, unsourced, note}}
 */
export async function computeFromComponents(components, { lookup = true } = {}) {
  const rows = [];
  for (const c of (components || []).slice(0, 12)) {
    const grams = Number(c.grams) || 0;
    if (!c?.name || grams <= 0) continue;
    // `lookup:false` keeps the arithmetic tests hermetic — a unit test of
    // multiplication must not fail because a rate-limited public API had a
    // bad minute, which is exactly what happened on the first run of these.
    const fact = lookup ? await lookupPer100g(c.name) : null;
    // The model's own per-100g figure is the fallback, and it is LABELLED as
    // such. A number whose provenance he can see is a number he can correct.
    const per100g = fact?.per100g
      || (c.per100g && Number.isFinite(Number(c.per100g.p)) ? {
        p: Number(c.per100g.p) || 0, c: Number(c.per100g.c) || 0, f: Number(c.per100g.f) || 0,
      } : null);
    if (!per100g) continue;
    const scaled = scaleTo(per100g, grams);
    rows.push({
      name: c.name,
      grams,
      per100g,
      macros: { ...scaled, kcal: kcalFrom(scaled) },
      source: fact ? `${fact.source} — ${fact.matched}${fact.dataType ? ` (${fact.dataType})` : ''}` : 'estimated, not matched to a database',
      sourced: !!fact,
    });
  }
  const total = rows.reduce((a, r) => ({
    p: a.p + r.macros.p, c: a.c + r.macros.c, f: a.f + r.macros.f,
  }), { p: 0, c: 0, f: 0 });
  const macros = {
    p: Math.round(total.p), c: Math.round(total.c), f: Math.round(total.f),
    kcal: kcalFrom(total), // derived, always
  };
  const sourced = rows.filter((r) => r.sourced).length;
  return {
    macros,
    components: rows,
    sourced,
    unsourced: rows.length - sourced,
    note: rows.length
      ? `${sourced} of ${rows.length} components matched to USDA data; energy computed from the macros.`
      : 'no components could be resolved',
  };
}
