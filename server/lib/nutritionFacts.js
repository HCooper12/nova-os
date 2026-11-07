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

/**
 * The optional extras (fibre, sugars, sodium) scaled to a weight. Only the
 * ones the database actually gave: an absent value is absent, never zero,
 * because "no fibre figure" and "0 g of fibre" are different statements.
 */
export function scaleExtras(per100g, grams) {
  const k = (Number(grams) || 0) / 100;
  const out = {};
  if (per100g?.fibre != null) out.fibreG = +(per100g.fibre * k).toFixed(1);
  if (per100g?.sugar != null) out.sugarG = +(per100g.sugar * k).toFixed(1);
  if (per100g?.sodium != null) out.sodiumMg = Math.round(per100g.sodium * k);
  return out;
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

// v2 (Nov 2026) adds fibre, sugars and sodium to the fact. A v1 entry has
// none of them, so it is NOT served as current: the lookup refetches once and
// rewrites it as v2. If that refetch fails (offline, rate-limited) the v1 fact
// is still returned, since its protein, carbs and fat are as good as ever.
const CACHE_VERSION = 3; // v3: picked by candidateFoods + the food-pick lane, misses kept
async function readCache(name) {
  const p = cachePath(name);
  if (!existsSync(p)) return null;
  try {
    const d = JSON.parse(await readFile(p, 'utf8'));
    // a fact about a food does not go stale, but a bad early entry should be
    // replaceable — version it so the cache can be invalidated deliberately
    if (d?.v === CACHE_VERSION) return d;
    if (d?.v < CACHE_VERSION && d.fact) return { ...d, stale: true };
    return null;
  } catch { return null; }
}

async function writeCache(name, entry) {
  try {
    await mkdir(CACHE_DIR(), { recursive: true });
    const tmp = cachePath(name) + '.tmp';
    await writeFile(tmp, JSON.stringify({ v: CACHE_VERSION, ...entry }, null, 2), 'utf8');
    await rename(tmp, cachePath(name));
  } catch { /* a cache miss next time is the only cost */ }
}

/* ------------------------------ the lookup -------------------------------- */

export function pickNutrients(food) {
  const out = { p: null, c: null, f: null, kcal: null, fibre: null, sugar: null, sodium: null };
  for (const n of food.foodNutrients || []) {
    const name = n.nutrientName || n.nutrient?.name || '';
    const val = Number(n.value ?? n.amount);
    if (!Number.isFinite(val)) continue;
    if (name === 'Protein') out.p = val;
    else if (name === 'Total lipid (fat)') out.f = val;
    else if (name === 'Carbohydrate, by difference') out.c = val;
    else if (name === 'Energy' && (n.unitName === 'KCAL' || n.nutrient?.unitName === 'kcal')) out.kcal = val;
    else if (name === 'Fiber, total dietary') out.fibre = val;
    else if (/^(total sugars|sugars, total)/i.test(name)) out.sugar = val;
    else if (name === 'Sodium, Na') out.sodium = val; // USDA reports sodium in mg
  }
  return out;
}

// THE RIGHT FOOD, NOT THE MOST RESPECTABLE ONE (7 Nov 2026). Sorting by data
// type alone let a near-miss beat the food he named: "butter chicken" became
// ghee, "salmon" fish oil, "egg" egg white, "basmati rice" dry grain. Word rules
// kept leaking ("egg" then Eggs Benedict, "steak" steak sauce). So code narrows
// USDA's list to honest candidates, a small model picks one or says none fits,
// code checks the id came from the list, and the numbers are USDA's. Each food
// name is picked once and cached, the answer "none" included.
const NAME_FILLER = new Set(['a', 'an', 'and', 'the', 'of', 'with', 'in', 'on', 'or', 'raw', 'cooked', 'plain', 'fresh', 'grilled', 'baked', 'boiled', 'roasted']);
const DIFFERENT_FOOD = new Set(['oil', 'ghee', 'powder', 'powdered', 'dried', 'dry', 'uncooked', 'flour', 'lunchmeat', 'baby', 'babyfood', 'juice', 'substitute', 'imitation', 'infant', 'meatless']);
const WEIGHED_COOKED = /\b(rice|pasta|spaghetti|noodles?|quinoa|couscous|lentils?)\b/;
const SAYS_STATE = /\b(dry|uncooked|raw|cooked)\b/;
// Australian words USDA does not use
const AU_NAMES = [[/\bmince\b/g, 'ground'], [/\bcapsicums?\b/g, 'peppers'], [/\bprawns?\b/g, 'shrimp'], [/\bbeetroot\b/g, 'beets']];
const words = (s) => norm(s).split(' ').filter(Boolean).map((w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w));
export const usdaName = (name) => AU_NAMES.reduce((t, [re, to]) => t.replace(re, to), norm(name));
const MAX_CANDIDATES = 12;

/** Honest candidates for a name, plainest first; `foods` arrive in data-type order. */
export function candidateFoods(name, foods) {
  const said = usdaName(name);
  const saidWords = new Set(words(said));
  const want = [...saidWords].filter((w) => !NAME_FILLER.has(w));
  if (!want.length) return [];
  const needCooked = WEIGHED_COOKED.test(said) && !SAYS_STATE.test(said);
  const scored = [];
  for (const food of foods) {
    const have = new Set(words(food.f.description));
    if (!want.every((w) => have.has(w))) continue;
    if ([...have].some((w) => DIFFERENT_FOOD.has(w) && !saidWords.has(w))) continue;
    if (needCooked && !have.has('cooked') && !have.has('boiled')) continue;
    // the head word says what it is: "Bread, egg" is bread, so it ranks after any real egg
    const head = words(food.f.description)[0];
    const offHead = !saidWords.has(head) && head !== 'fish' && head !== 'nut';
    scored.push({ food, offHead, extra: [...have].filter((w) => !saidWords.has(w) && !NAME_FILLER.has(w)).length });
  }
  return scored.sort((a, b) => a.offHead - b.offHead || a.extra - b.extra).slice(0, MAX_CANDIDATES).map((x) => ({ ...x.food, extra: x.extra }));
}

/** The model's choice as code accepts it: an id from the list, or nothing. */
export function acceptPick(answer, candidates) {
  const raw = typeof answer === 'string' ? answer.replace(/```(json)?/g, '') : '';
  let id = null;
  try { id = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).id; } catch { return undefined; }
  if (id === null) return null;
  return candidates.find((c) => c.f.fdcId === Number(id)) || undefined;
}

async function pickWithModel(name, candidates) {
  const { runTextLane } = await import('./textLane.js');
  const list = candidates.map((c) => `${c.f.fdcId} | ${c.f.description}`).join('\n');
  const prompt = `A person logged the food "${name}", weighed as served. Which USDA entry is that food as normally eaten?\n\n${list}\n\nChoose the plain, typical form. Meat, fish and eggs weighed as served are cooked, so prefer a cooked entry when one is listed. A different food containing that word is wrong (steak sauce is not steak, egg bread is not egg). If none is that food, the id is null.\nOutput ONLY JSON: {"id": <number or null>}`;
  const out = await runTextLane('food-pick', prompt, { maxTokens: 40, json: true });
  return acceptPick(out.text, candidates);
}

/**
 * Per-100g facts for one component, from USDA. Returns null rather than a
 * guess — an honest miss lets the caller fall back to the model's own figure
 * and SAY it did, which is worth more than a confident wrong number.
 */
export async function lookupPer100g(name, { picker = pickWithModel } = {}) {
  const cached = await readCache(name);
  if (cached && !cached.stale) return cached.fact;

  try {
    const said = usdaName(name);
    const q = WEIGHED_COOKED.test(said) && !SAYS_STATE.test(said) ? `${said} cooked` : said;
    // USDA's own analyses and survey foods only. Branded rows are one product
    // under a generic name ("EGG" was a chocolate egg, 58 g carbs per 100 g),
    // so free text never uses them: barcodes do.
    // POST, not GET: the GET form answers a bare 400 at random (seen 4 in 6 on
    // 7 Nov 2026). One retry, then the caller degrades honestly.
    const ask = () => fetch(`${FDC_SEARCH}?api_key=${FDC_KEY()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      body: JSON.stringify({ query: q, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'], pageSize: 50 }),
    });
    let res = await ask();
    if (!res.ok) res = await ask();
    if (!res.ok) return cached?.fact || null;
    const data = await res.json();
    // Prefer the data types that are actually measured in a lab, in order:
    // Foundation and SR Legacy are USDA's own analyses; Branded is
    // manufacturer-declared; Survey is modelled.
    const rank = { Foundation: 0, SR_Legacy: 1, 'SR Legacy': 1, Survey: 2, 'Survey (FNDDS)': 2, Branded: 3 };
    const foods = (data.foods || [])
      .map((f) => ({ f, n: pickNutrients(f) }))
      // Branded rows are one product under a generic name ("EGG" was a chocolate
      // egg, 58 g carbs per 100 g), so free text never uses them: barcodes do.
      .filter((x) => x.f.dataType !== 'Branded' && x.n.p != null && x.n.c != null && x.n.f != null)
      .sort((a, b) => (rank[a.f.dataType] ?? 9) - (rank[b.f.dataType] ?? 9));
    const candidates = candidateFoods(name, foods);
    // USDA answered and nothing fits, or the model says none is this food:
    // a real miss, kept so the same name is not asked again
    if (!candidates.length) { await writeCache(name, { fact: null, at: new Date().toISOString() }); return null; }
    // the plain food by name needs no judgement; anything else does
    const best = candidates[0].extra === 0 ? candidates[0] : await picker(name, candidates);
    if (best === null) { await writeCache(name, { fact: null, at: new Date().toISOString() }); return null; }
    if (!best) return cached?.fact || null; // no usable answer: try again another time
    const fact = {
      source: 'USDA FoodData Central',
      dataType: best.f.dataType || 'unknown',
      matched: best.f.description || name,
      fdcId: best.f.fdcId || null,
      per100g: {
        p: best.n.p, c: best.n.c, f: best.n.f,
        // optional: only what USDA gave for this food
        ...(best.n.fibre != null ? { fibre: best.n.fibre } : {}),
        ...(best.n.sugar != null ? { sugar: best.n.sugar } : {}),
        ...(best.n.sodium != null ? { sodium: best.n.sodium } : {}),
      },
    };
    await writeCache(name, { fact, at: new Date().toISOString() });
    return fact;
  } catch {
    return cached?.fact || null; // offline or rate-limited — the caller degrades honestly
  }
}

/* ------------------------------- the total -------------------------------- */

/**
 * ONE component to ONE audited row: USDA first, the model's own per-100g
 * figure second (labelled estimated), or null when neither exists. Shared by
 * the typed describe path and the photo path so the two cannot drift.
 * `lookupFn` is injectable so tests never touch the network.
 */
async function resolveRow(c, lookupFn) {
  const grams = Number(c?.grams) || 0;
  if (!c?.name || grams <= 0) return null;
  const fact = lookupFn ? await lookupFn(c.name) : null;
  // The model's own per-100g figure is the fallback, and it is LABELLED as
  // such. A number whose provenance he can see is a number he can correct.
  const per100g = fact?.per100g
    || (c.per100g && Number.isFinite(Number(c.per100g.p)) ? {
      p: Number(c.per100g.p) || 0, c: Number(c.per100g.c) || 0, f: Number(c.per100g.f) || 0,
    } : null);
  if (!per100g) return null;
  const scaled = scaleTo(per100g, grams);
  return {
    name: c.name,
    grams,
    per100g,
    fact,
    ...(fact ? { ...scaleExtras(fact.per100g, grams), ...(fact.fdcId ? { fdcId: fact.fdcId } : {}) } : {}),
    macros: { ...scaled, kcal: kcalFrom(scaled) },
    source: fact ? `${fact.source} — ${fact.matched}${fact.dataType ? ` (${fact.dataType})` : ''}` : 'estimated, not matched to a database',
    sourced: !!fact,
  };
}

function totalRows(rows, { sumKcal = false } = {}) {
  const t = rows.reduce((a, r) => ({
    p: a.p + r.macros.p, c: a.c + r.macros.c, f: a.f + r.macros.f, kcal: a.kcal + (r.macros.kcal || 0),
  }), { p: 0, c: 0, f: 0, kcal: 0 });
  const macros = { p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
  macros.kcal = sumKcal ? Math.round(t.kcal) : kcalFrom(t); // derived, always
  return macros;
}

/**
 * Turn the model's component breakdown into ONE audited total.
 * @param {{name:string, grams:number, per100g?:{p,c,f}}[]} components
 * @returns {{macros, components, sourced, unsourced, note}}
 */
export async function computeFromComponents(components, { lookup = true, lookupFn } = {}) {
  const rows = [];
  // `lookup:false` keeps the arithmetic tests hermetic — a unit test of
  // multiplication must not fail because a rate-limited public API had a
  // bad minute, which is exactly what happened on the first run of these.
  const fn = lookup ? (lookupFn || lookupPer100g) : null;
  for (const c of (components || []).slice(0, 12)) {
    const row = await resolveRow(c, fn);
    if (row) { delete row.fact; rows.push(row); }
  }
  const macros = totalRows(rows);
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

/**
 * A PHOTO'S BREAKDOWN, AUDITED BY CODE. The model names each part and says
 * how many grams it sees, plus its own macros as a fallback. Each part is
 * looked up in USDA and scaled to those grams; a part USDA misses keeps the
 * model's figure and says so ("estimated"). A part read straight off a
 * nutrition label (`label: true`) keeps the label's figures, since a printed
 * label beats a database average. The total is the sum of the lines, so the
 * itemised-plate contract (entry macros = sum of items) holds from the start.
 * @param {{name, grams?, label?, macros?:{p,c,f,kcal}}[]} parts
 */
const MATCH_SPREAD = 2;
export async function resolvePhotoParts(parts, { lookupFn = lookupPer100g, lookup = true } = {}) {
  const rows = [];
  for (const c of (parts || []).slice(0, 24)) {
    const name = String(c?.name || '').trim().slice(0, 80);
    if (!name) continue;
    const grams = Number(c.grams) || 0;
    const m = c.macros || {};
    const own = { p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, kcal: Math.round(Number(m.kcal) || 0) };
    const hasOwn = own.kcal > 0 || own.p + own.c + own.f > 0;
    const keep = (source, sourced) => ({
      name, ...(grams > 0 ? { grams: Math.round(grams) } : {}), macros: own, source, sourced,
    });
    if (c.label) { if (hasOwn) rows.push(keep('read from the label', true)); continue; }
    if (grams > 0 && lookup) {
      const row = await resolveRow({ name, grams }, lookupFn);
      // A free-text database search can land on the wrong food (measured on
      // his own log: "butter chicken" matched ghee at 5x the calories, "basmati
      // rice" matched the dry grain at 2.5x). When the model gave its own
      // figure for this part and the match is more than 2x away from it in
      // either direction, the match is the likelier mistake: keep the model's
      // figure, labelled estimated, and say what was rejected.
      const disagrees = hasOwn && own.kcal >= 50 && row && (row.macros.kcal > own.kcal * MATCH_SPREAD || row.macros.kcal < own.kcal / MATCH_SPREAD);
      if (disagrees) {
        rows.push(keep(`estimated, not matched to a database (USDA "${row.fact.matched}" was too far from the estimate to trust)`, false));
        continue;
      }
      if (row) {
        rows.push({
          name, grams: Math.round(grams), macros: row.macros, source: row.source, sourced: true,
          ...scaleExtras(row.fact.per100g, grams),
          ...(row.fact?.fdcId ? { fdcId: row.fact.fdcId } : {}),
        });
        continue;
      }
    }
    // USDA missed (or no weight to scale): the model's figure stays, flagged
    if (hasOwn) rows.push(keep('estimated, not matched to a database', false));
  }
  const macros = totalRows(rows.map((r) => ({ macros: r.macros })), { sumKcal: true });
  const sourced = rows.filter((r) => r.sourced).length;
  return { macros, components: rows, sourced, unsourced: rows.length - sourced };
}
