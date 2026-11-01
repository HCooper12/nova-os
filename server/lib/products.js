// HIS PRODUCTS, IN HIS RECIPES (1 Nov 2026; mockup 109, approved).
//
// His ask: "add the specific product being used as the ingredient, so that
// Nova can calculate the macronutrients, calories and everything based off
// the actual brands that I use ... rather than it making assumptions." And
// the failure behind it: a tweak to 500 g of mince left the numbers where a
// model guessed them.
//
// The split, kept strict (the same one labelMacros.js keeps):
//   - a MODEL reads a label (scanFood 'label-per100'), and once per recipe
//     says how many grams each line is ("3 eggs" → 150 g) with a plain food
//     name a database holds;
//   - USDA (nutritionFacts.lookupPer100g) gives the estimate for a line he
//     has not linked, and says so;
//   - HIS PRODUCT, when a line has one, is the truth for that line;
//   - CODE scales, sums, divides by servings and rounds. No model adds up.
//
// Stores (operational, so in data/, never the vault):
//   data/products.json            his pantry: one entry per product
//   data/recipe-lines/<id>.json   a recipe's lines: grams, estimate, product
// The recipe's own **Macros:** line in the vault is rewritten through
// recipes.editRecipe (it backs up first), and the receipt carries the line it
// replaced, so Undo puts it back.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { boundaryArgs } from './spawnBoundary.js';
import { modelFor, effortArgs, laneEnabled, laneOffError } from './modelPrefs.js';
import { parseEnvelope } from './modelSpend.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { lineKey, leadingCount } from '../../src/productKey.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PANTRY = () => path.join(dataRoot(), 'products.json');
const LINES_DIR = () => path.join(dataRoot(), 'recipe-lines');
const CLAUDE_BIN = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

const round1 = (n) => Math.round(n * 10) / 10;
const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['g', 'kg', 'ml', 'l', 'x', 'of', 'the', 'a', 'and', 'or', 'with', 'fresh', 'large', 'small', 'medium', 'tbsp', 'tsp', 'cup', 'cups', 'slices', 'slice', 'raw', 'cooked', 'drained']);
const words = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w) && !/^\d/.test(w));

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

// ---- quantities ------------------------------------------------------------

/** Grams written on the line itself ("400g", "1.5 kg", "300ml"), else null. Pure. */
export function gramsOnLine(line) {
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i.exec(String(line || ''));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  // mL counted as grams: within a few per cent for the liquids recipes use
  return unit === 'kg' || unit === 'l' ? n * 1000 : n;
}

/** A per-100 g block, cleaned; null when any value is missing. Pure. */
export function cleanPer100(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const k of ['p', 'c', 'f', 'kcal']) {
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0 || n > (k === 'kcal' ? 950 : 100)) return null;
    out[k] = k === 'kcal' ? Math.round(n) : round1(n);
  }
  return out;
}

// ---- the pantry ------------------------------------------------------------

export async function listProducts() {
  const d = await readJson(PANTRY(), { products: [] });
  return Array.isArray(d.products) ? d.products : [];
}

/** Save (or update by id) a product. { name, per100, source, servingGrams? } */
export async function saveProduct({ id = null, name, per100, source = 'typed', servingGrams = null } = {}) {
  const clean = cleanPer100(per100);
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!n) throw Object.assign(new Error('a product needs a name'), { code: 'product' });
  if (!clean) throw Object.assign(new Error('protein, carbs, fat and kcal per 100 g are all needed'), { code: 'product' });
  if (!['label', 'search', 'typed'].includes(source)) source = 'typed';
  const all = await listProducts();
  const at = new Date().toISOString();
  const i = id ? all.findIndex((p) => p.id === id) : -1;
  const rec = { id: i >= 0 ? all[i].id : randomUUID().slice(0, 8), name: n, per100: clean, source, servingGrams: Number.isFinite(Number(servingGrams)) && Number(servingGrams) > 0 ? Number(servingGrams) : null, at };
  if (i >= 0) all[i] = rec; else all.push(rec);
  await writeJson(PANTRY(), { products: all });
  return rec;
}

/** His products that fit an ingredient line, best first. Pure over the list. */
export function matchProducts(products, line, max = 3) {
  const want = new Set(words(line));
  if (!want.size) return [];
  return (products || [])
    .map((p) => ({ p, score: words(p.name).filter((w) => want.has(w)).length / want.size }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || (a.p.at < b.p.at ? 1 : -1))
    .slice(0, max)
    .map((x) => x.p);
}

// ---- search: Open Food Facts, Australian products ----------------------------

/** Products named like `q`, with per-100 g values. Empty on a miss or offline. */
export async function searchProducts(q, { fetchImpl = fetch } = {}) {
  const term = String(q || '').trim().slice(0, 80);
  if (!term) return [];
  const url = `https://au.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&json=1&page_size=12&tagtype_0=countries&tag_contains_0=contains&tag_0=australia&fields=code,product_name,brands,nutriments,serving_quantity`;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'NovaOS/1.0 (personal app)' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.products || []).map((p) => {
      const n = p.nutriments || {};
      const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? Number(n.energy_100g) / 4.184 : null);
      const per100 = cleanPer100({ p: n.proteins_100g, c: n.carbohydrates_100g, f: n.fat_100g, kcal });
      const name = [p.brands ? String(p.brands).split(',')[0].trim() : '', p.product_name || ''].filter(Boolean).join(' ').trim();
      return per100 && name ? { code: p.code || null, name: name.slice(0, 120), per100, servingGrams: Number(p.serving_quantity) || null } : null;
    }).filter(Boolean).slice(0, 8);
  } catch { return []; }
}

// ---- a recipe's lines --------------------------------------------------------

const linesFile = (id) => {
  if (!/^[a-z0-9-]{1,120}$/.test(String(id))) throw Object.assign(new Error('not a recipe id'), { code: 'recipe' });
  return path.join(LINES_DIR(), `${id}.json`);
};
export async function readLines(recipeId) {
  const d = await readJson(linesFile(recipeId), { lines: {} });
  return d && typeof d.lines === 'object' ? d : { lines: {} };
}

let deps = null;
export function _setProductDepsForTest(d) { deps = d || null; }

export function breakdownPrompt(recipe, lines) {
  return `A recipe, "${recipe.name}", makes ${recipe.servings || 1} serving${recipe.servings === 1 ? '' : 's'}. For EACH ingredient line below, say how many grams go into the WHOLE recipe, and give a plain food name a nutrition database holds (USDA style: "egg, whole, raw", "english muffin", "cheese, processed slice"). Australian supermarket sizes. Where the line states grams or mL, use that number. Where it is a count ("3 eggs", "6 cheese slices"), use typical Australian weights. A spice or seasoning under 5 g counts as its grams. Also give your own per-100 g estimate for each, which is used ONLY if the database has no match.

Lines:
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Output ONLY a JSON object: {"lines":[{"n":1,"grams":400,"food":"beef, ground, 95% lean","per100":{"p":21,"c":0,"f":5,"kcal":137}}, ...]} with one entry per line, in order. No markdown, no commentary.`;
}

function runBreakdown(prompt) {
  if (deps?.breakdown) return deps.breakdown(prompt);
  if (!laneEnabled('recipe-lines')) throw laneOffError('recipe-lines');
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN(), ['-p', prompt, '--permission-mode', 'bypassPermissions', ...boundaryArgs(''), '--output-format', 'json', '--model', modelFor('recipe-lines'), ...effortArgs('recipe-lines'), '--no-session-persistence'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        if (code !== 0) throw new Error(err.trim() || `claude exited with code ${code}`);
        const outer = parseEnvelope(out, { lane: 'recipe-lines' });
        const m = firstBalancedObjectMatch(String(outer.result || ''));
        if (!m) throw new Error('the breakdown came back without its JSON');
        resolve(parseModelJson(m[0]));
      } catch (e) { reject(e); }
    });
  });
}

const lookup = async (food) => {
  if (deps?.lookup) return deps.lookup(food);
  const { lookupPer100g } = await import('./nutritionFacts.js');
  return lookupPer100g(food);
};

/**
 * Every line of the recipe with its grams and an estimate, breaking down only
 * the lines not seen before. Returns the stored { lines } map.
 */
export async function ensureLines(recipe) {
  const store = await readLines(recipe.id);
  const texts = recipe.ingredients.filter((i) => !i.group).map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name));
  const missing = texts.filter((t) => !store.lines[lineKey(t)]?.estimate);
  if (missing.length) {
    const parsed = await runBreakdown(breakdownPrompt(recipe, missing));
    const got = Array.isArray(parsed?.lines) ? parsed.lines : [];
    for (let i = 0; i < missing.length; i++) {
      const t = missing[i];
      const g = got.find((x) => Number(x.n) === i + 1) || got[i] || {};
      const grams = gramsOnLine(t) ?? (Number(g.grams) > 0 ? Number(g.grams) : null);
      const fact = g.food ? await lookup(String(g.food)) : null;
      const est = fact?.per100g
        ? { per100: { p: round1(fact.per100g.p), c: round1(fact.per100g.c), f: round1(fact.per100g.f), kcal: Math.round(fact.per100g.p * 4 + fact.per100g.c * 4 + fact.per100g.f * 9) }, source: `USDA: ${fact.matched}` }
        : cleanPer100(g.per100) ? { per100: cleanPer100(g.per100), source: 'Nova\'s estimate (no database match)' } : null;
      const prev = store.lines[lineKey(t)] || {};
      store.lines[lineKey(t)] = { ...prev, text: t, grams, count: gramsOnLine(t) == null ? leadingCount(t) : null, food: g.food || null, estimate: est };
    }
    store.at = new Date().toISOString();
  }
  // THE RECIPE'S OWN NUMBERS ARE THE REFERENCE (1 Nov 2026, the first real
  // run: linking one lean mince took the muffin from 421 to 465 kcal, because
  // the other ten lines were re-estimated from US data). Taken once, before
  // any product is linked: the estimates of the lines that are not his are
  // scaled so that, with nothing linked, the recipe says exactly what it said.
  // Linking a product then changes only its own share; all lines his = exact.
  if (!store.calibration && recipe.macros && !Object.values(store.lines).some((l) => l.productId)) {
    const est = computeRecipe(recipe, store, [], { calibration: null });
    if (!est.unresolved.length) {
      const n = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
      store.calibration = {};
      for (const k of ['p', 'c', 'f', 'kcal']) {
        const raw = est.raw[k];
        const want = Number(recipe.macros[k]) * n;
        store.calibration[k] = raw > 0 && Number.isFinite(want) ? want / raw : 1;
      }
    }
  }
  if (missing.length || store.calibration) await writeJson(linesFile(recipe.id), store);
  return store;
}

/**
 * The recipe's macros per serving, from its lines: his product where linked,
 * the estimate otherwise. Pure. → { perServing, linked, total, unresolved:[] }
 */
export function computeRecipe(recipe, store, products, { calibration = store.calibration || null } = {}) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const texts = recipe.ingredients.filter((i) => !i.group).map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name));
  const sum = { p: 0, c: 0, f: 0, kcal: 0 };
  const raw = { p: 0, c: 0, f: 0, kcal: 0 };
  let linked = 0;
  const unresolved = [];
  const rows = texts.map((t) => {
    const s = store.lines[lineKey(t)] || {};
    const product = s.productId ? byId.get(s.productId) : null;
    // the weight: on the line itself, else the breakdown's, moved with the count
    const nowCount = leadingCount(t);
    const grams = gramsOnLine(t) ?? (s.grams > 0 && s.count && nowCount ? s.grams * (nowCount / s.count) : s.grams);
    const per100 = product ? product.per100 : s.estimate?.per100;
    if (!per100 || !(grams > 0)) { unresolved.push(t); return { text: t, product: product?.name || null }; }
    if (product) linked += 1;
    const k = grams / 100;
    for (const key of ['p', 'c', 'f', 'kcal']) {
      const v = per100[key] * k;
      raw[key] += v;
      sum[key] += product ? v : v * (calibration?.[key] ?? 1);
    }
    return { text: t, grams, product: product?.name || null };
  });
  const n = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const perServing = { p: Math.round(sum.p / n), c: Math.round(sum.c / n), f: Math.round(sum.f / n), kcal: Math.round(sum.kcal / n) };
  return { perServing, linked, total: texts.length, unresolved, rows, raw };
}

/** The line state the page draws: which lines carry his product, by line text. */
export async function lineState(recipe) {
  const store = await readLines(recipe.id);
  const products = await listProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = {};
  for (const [k, v] of Object.entries(store.lines)) if (v.productId && byId.has(v.productId)) out[k] = { productId: v.productId, product: byId.get(v.productId).name };
  return out;
}
export { lineKey };

/**
 * Link (or unlink, productId null) his product to one line, recompute, and
 * write the recipe's macros. Returns { macros, was, linked, total, unresolved, undo }.
 * Refuses to write when a line could not be resolved: the number would be short.
 */
export async function linkProduct(vaultPath, recipeId, lineText, productId) {
  const { loadRecipeData, editRecipe } = deps?.recipes || await import('./recipes.js');
  const { recipes } = await loadRecipeData(vaultPath);
  const recipe = recipes.find((r) => r.id === recipeId);
  if (!recipe) throw Object.assign(new Error('recipe not found'), { code: 'recipe' });
  const texts = recipe.ingredients.filter((i) => !i.group).map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name));
  const text = texts.find((t) => lineKey(t) === lineKey(lineText));
  if (!text) throw Object.assign(new Error('that line is not in the recipe'), { code: 'recipe' });
  const products = await listProducts();
  if (productId && !products.some((p) => p.id === productId)) throw Object.assign(new Error('no such product'), { code: 'product' });
  const store = await ensureLines(recipe);
  const before = store.lines[lineKey(text)]?.productId || null;
  store.lines[lineKey(text)] = { ...store.lines[lineKey(text)], productId: productId || null };
  const out = computeRecipe(recipe, store, products);
  if (out.unresolved.length) {
    throw Object.assign(new Error(`Nova could not work out ${out.unresolved.length === 1 ? 'a line' : `${out.unresolved.length} lines`} (${out.unresolved.slice(0, 2).join('; ')}), so the numbers were left as they are`), { code: 'unresolved' });
  }
  await writeJson(linesFile(recipe.id), store);
  const was = recipe.macros || null;
  await editRecipe(vaultPath, recipe.id, { macros: out.perServing });
  return { macros: out.perServing, was, linked: out.linked, total: out.total, undo: { route: 'recipe-products', recipeId: recipe.id, line: text, productId: before, macros: was } };
}

/** The undo: the line's previous product back, and the macros it replaced. */
export async function undoLink(vaultPath, undo) {
  const { editRecipe } = deps?.recipes || await import('./recipes.js');
  const store = await readLines(undo.recipeId);
  const k = lineKey(undo.line);
  if (store.lines[k]) store.lines[k] = { ...store.lines[k], productId: undo.productId || null };
  await writeJson(linesFile(undo.recipeId), store);
  if (undo.macros) await editRecipe(vaultPath, undo.recipeId, { macros: undo.macros });
  return `the recipe's numbers are back to ${undo.macros ? `${undo.macros.p} g protein, ${undo.macros.kcal} kcal` : 'what they were'}`;
}
