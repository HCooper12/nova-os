// A barcode becomes a product by asking, in order:
//   1. Open Food Facts: a free public database, good on packaged food.
//   2. USDA FoodData Central, Branded foods, matched on the GTIN/UPC itself.
// A miss from both stays a miss (the route answers 404). Nothing is guessed,
// and a source that ERRORED is never reported as "no such product".
//
// Open Food Facts asks API consumers to identify themselves with a UA.
const OFF_URL = (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_size`;
const USDA_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USER_AGENT = 'NovaOS-Personal/1.0 (single-user personal app)';
const TIMEOUT_MS = 12_000;

/**
 * Is this a plausible barcode? 8 to 14 digits AND the GTIN check digit
 * (GS1 mod-10) agrees. Shorter codes are zero-padded to 14, which does not
 * change the sum. A misread digit fails here, before any lookup, so a wrong
 * product can never be logged from a bad read.
 */
export function validateBarcode(code) {
  const digits = String(code ?? '').trim();
  if (!/^\d{8,14}$/.test(digits)) return { ok: false, reason: 'a barcode is 8 to 14 digits' };
  const padded = digits.padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(padded[i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  if (check !== Number(padded[13])) return { ok: false, reason: 'the check digit does not match, so a digit is wrong' };
  return { ok: true, code: digits };
}

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

async function fromOpenFoodFacts(code, fetchFn) {
  const res = await fetchFn(OFF_URL(code), { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // OFF answers 404 for an unknown code; that is a miss, not a failure
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const n = data.product.nutriments || {};
  const hasServing = [n.proteins_serving, n.carbohydrates_serving, n.fat_serving, n['energy-kcal_serving']].every((v) => v != null);
  const basis = hasServing ? (data.product.serving_size ? `per serving, ${data.product.serving_size}` : 'per serving') : 'per 100g';
  const sfx = hasServing ? '_serving' : '_100g';
  const raw = hasServing
    ? { p: n.proteins_serving, c: n.carbohydrates_serving, f: n.fat_serving, kcal: n['energy-kcal_serving'] }
    : { p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, kcal: n['energy-kcal_100g'] || 0 };
  const extras = {};
  if (n[`fiber${sfx}`] != null) extras.fibreG = round1(n[`fiber${sfx}`]);
  if (n[`sugars${sfx}`] != null) extras.sugarG = round1(n[`sugars${sfx}`]);
  if (n[`sodium${sfx}`] != null) extras.sodiumMg = Math.round(Number(n[`sodium${sfx}`]) * 1000); // OFF gives grams

  return {
    name: `${data.product.product_name || 'Unknown product'} (${basis})`,
    macros: { p: round1(raw.p), c: round1(raw.c), f: round1(raw.f), kcal: Math.round(raw.kcal) },
    ...extras,
    source: 'Open Food Facts',
  };
}

const stripZeros = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

async function fromUsdaBranded(code, fetchFn, apiKey) {
  const url = `${USDA_SEARCH}?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=10&api_key=${apiKey}`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`USDA lookup failed: ${res.status}`);
  const data = await res.json();
  // the search is free text: only a food whose own gtinUpc IS this code counts
  const want = stripZeros(code);
  const food = (data.foods || []).find((f) => stripZeros(f.gtinUpc) === want);
  if (!food) return null;
  const per100 = {};
  for (const x of food.foodNutrients || []) {
    const name = x.nutrientName || x.nutrient?.name || '';
    const val = Number(x.value ?? x.amount);
    if (!Number.isFinite(val)) continue;
    if (name === 'Protein') per100.p = val;
    else if (name === 'Total lipid (fat)') per100.f = val;
    else if (name === 'Carbohydrate, by difference') per100.c = val;
    else if (name === 'Energy' && (x.unitName === 'KCAL' || x.nutrient?.unitName === 'kcal')) per100.kcal = val;
    else if (name === 'Fiber, total dietary') per100.fibre = val;
    else if (/^(total sugars|sugars, total)/i.test(name)) per100.sugar = val;
    else if (name === 'Sodium, Na') per100.sodium = val;
  }
  if (per100.p == null || per100.c == null || per100.f == null) return null;
  // per serving when the label gives a serving in grams or mL, scaled by code
  const sz = Number(food.servingSize);
  const unit = String(food.servingSizeUnit || '').toLowerCase();
  const perServing = Number.isFinite(sz) && sz > 0 && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt');
  const k = perServing ? sz / 100 : 1;
  const basis = perServing ? `per serving, ${Math.round(sz)} ${unit.startsWith('m') ? 'mL' : 'g'}` : 'per 100g';
  const kcal = per100.kcal != null ? per100.kcal : per100.p * 4 + per100.c * 4 + per100.f * 9;
  const brand = food.brandName || food.brandOwner || '';
  const title = food.description ? food.description.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : 'Unknown product';
  return {
    name: `${brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ` : ''}${title} (${basis})`,
    macros: { p: round1(per100.p * k), c: round1(per100.c * k), f: round1(per100.f * k), kcal: Math.round(kcal * k) },
    ...(per100.fibre != null ? { fibreG: round1(per100.fibre * k) } : {}),
    ...(per100.sugar != null ? { sugarG: round1(per100.sugar * k) } : {}),
    ...(per100.sodium != null ? { sodiumMg: Math.round(per100.sodium * k) } : {}),
    fdcId: food.fdcId || undefined,
    source: 'USDA FoodData Central (Branded)',
  };
}

/**
 * @returns {Promise<null | {name, macros, source, barcode, ...}>} null is an honest miss
 * @throws when the code is malformed, or when a source failed and none found it
 */
export async function lookupBarcode(code, { fetchFn = globalThis.fetch, apiKey = process.env.USDA_FDC_API_KEY || 'DEMO_KEY' } = {}) {
  const v = validateBarcode(code);
  if (!v.ok) { const e = new Error(v.reason); e.status = 400; throw e; }
  let failure = null;
  for (const source of [() => fromOpenFoodFacts(v.code, fetchFn), () => fromUsdaBranded(v.code, fetchFn, apiKey)]) {
    try {
      const hit = await source();
      if (hit) return { ...hit, barcode: v.code };
    } catch (e) { failure = failure || e; }
  }
  // a source that ERRORED must not read as "no such product"
  if (failure) throw failure;
  return null;
}
