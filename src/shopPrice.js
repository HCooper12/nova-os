// HOW MANY TO BUY, AND WHERE IT IS CHEAPEST (10 Oct 2026, mockup 92).
//
// His rule, 9 Oct: every line shows the cheapest current price and where to
// buy it, and a pack only when it will not go to waste ("half a brown onion
// for one meal means no bag; several onions and a cheaper bag means the
// bag"). The amount needed comes from the recipes behind the line.
//
// Code decides all of it; no model picks a product or a count. Shared by
// both sides on purpose, like src/recipeScale.js: the server's price reader
// keeps only the products this module can size, and the Shopping screen
// prices a line with the same functions, so "cheapest" means one thing.
// Pure, no imports beyond recipeScale.
//
// The rule, as the mockup prints it:
//   need     = the sum of every recipe amount behind the line, × its qty
//   for each way to buy it (single, bag, pack, 1 kg …) at every shop read:
//     count  = ceil(need / size)           you cannot buy half a bag
//     total  = count × price
//     spare  = count × size − need
//   cheapest = lowest total (ties: less spare)
//   exact    = least spare  (ties: lower total)
//   the waste guard: if the cheapest leaves more spare than the exact buy,
//   the line goes off inside SPOIL_DAYS and does not freeze, and the exact
//   buy costs less than MARGIN more, the pick is the exact buy.

import { parseAmount } from './recipeScale.js';

export const MARGIN = 0.5;
export const SPOIL_DAYS = 14;
export const CHAINS = ['w', 'c', 'a'];
export const CHAIN_NAME = { w: 'Woolworths', c: 'Coles', a: 'Aldi' };

// CODE'S SHELF-LIFE TABLE: kind → days it keeps in a Melbourne kitchen,
// whether it freezes, and what one weighs (so "1 kg bag" can be "about 5").
// Estimates, stored as code with the list (the mockup's table, extended).
export const KEEPS = [
  { k: 'onion', n: 'Brown onions', re: /\b(onions?|shallots?)\b/, d: 30, each: 180 },
  { k: 'garlic', n: 'Garlic', re: /\bgarlic\b/, d: 60, each: 50 },
  { k: 'citrus', n: 'Limes, lemons', re: /\b(limes?|lemons?|oranges?|mandarins?)\b/, d: 14, each: 70 },
  { k: 'avocado', n: 'Avocados, ripe', re: /\bavocados?\b/, d: 3, each: 200 },
  { k: 'spinach', n: 'Baby spinach', re: /\b(spinach|rocket|lettuce|salad leaves|mixed leaves|kale)\b/, d: 5 },
  { k: 'herbs', n: 'Fresh herbs', re: /\b(coriander|parsley|basil|mint|dill|chives|cilantro)\b/, d: 5 },
  { k: 'banana', n: 'Bananas', re: /\bbananas?\b/, d: 5, each: 120 },
  { k: 'berries', n: 'Fresh berries', re: /\b(strawberr|blueberr|raspberr)/, d: 4 },
  { k: 'tomato', n: 'Tomatoes', re: /\btomato(es)?\b(?!.*\b(tin|tinned|can|canned|diced|paste|passata|sauce))/, d: 7, each: 120 },
  { k: 'veg', n: 'Fresh vegetables', re: /\b(carrots?|capsicums?|zucchini|broccoli|cucumbers?|mushrooms?|celery|cauliflower|beans? sprouts?)\b/, d: 10, each: 150 },
  { k: 'potato', n: 'Potatoes', re: /\b(potato(es)?|sweet potato)\b/, d: 30, each: 200 },
  { k: 'apple', n: 'Apples', re: /\bapples?\b/, d: 30, each: 160 },
  { k: 'mince', n: 'Mince, fresh', re: /\bmince\b/, d: 2, fz: true },
  { k: 'chicken', n: 'Chicken, fresh', re: /\bchicken\b/, d: 2, fz: true },
  { k: 'meat', n: 'Meat and fish, fresh', re: /\b(beef|steak|lamb|pork|salmon|fish|sausages?|bacon|prawns?)\b/, d: 3, fz: true },
  { k: 'yoghurt', n: 'Yoghurt, opened', re: /\b(yoghurt|yogurt)\b/, d: 7 },
  { k: 'milk', n: 'Milk', re: /\bmilk\b/, d: 7 },
  { k: 'cheese', n: 'Cheese', re: /\b(cheese|feta|parmesan|mozzarella|cheddar)\b/, d: 21 },
  { k: 'eggs', n: 'Eggs', re: /\beggs?\b/, d: 35, each: 60 },
  { k: 'bread', n: 'Bread', re: /\b(bread|loaf|sourdough|wraps?|rolls?|bagels?|tortillas?)\b/, d: 4, fz: true },
  { k: 'frozen', n: 'Frozen', re: /\bfrozen\b/, d: 180 },
  { k: 'tin', n: 'Tins', re: /\b(beans|chickpeas|lentils|tinned|canned|tuna|passata|diced tomato)/, d: 730 },
  { k: 'dry', n: 'Rice, pasta, dry goods', re: /\b(rice|pasta|oats|flour|sugar|noodles|quinoa|paprika|cumin|spice|salt|pepper|oil|vinegar|sauce|stock|honey)\b/, d: 365 },
  { k: 'drink', n: 'Bottled drinks', re: /\b(water|soda|juice|cola|kombucha|coffee|tea)\b/, d: 270 },
  { k: 'house', n: 'Household', re: /\b(sponges?|liners?|bags?|detergent|soap|paper|tissues?|foil|wrap|batteries|cleaner|toothpaste|shampoo)\b/, d: null },
];

export function keepFor(name) {
  const s = String(name || '').toLowerCase();
  return KEEPS.find((k) => k.re.test(s)) || null;
}
export const perishable = (keep) => !!keep && keep.d != null && keep.d < SPOIL_DAYS && !keep.fz;
export function keepsWord(keep) {
  if (!keep) return '';
  if (keep.d == null) return 'keeps';
  if (keep.fz) return 'freezes';
  if (keep.d >= 60) return 'keeps months';
  if (keep.d >= SPOIL_DAYS) return `keeps ${Math.round(keep.d / 7)} weeks`;
  return `goes off in ${keep.d} days`;
}

/* ---------------------------------------------------------- the need -- */

// The unit families a need and a product can share. Counts ("2", "½") are
// 'n'; tsp, cloves and slices cannot be compared with a packet, so a line
// asking for "1 tsp" is priced as one product ('any').
const WEIGHT = { mg: 0.001, g: 1, kg: 1000, oz: 28.35, lb: 453.6, lbs: 453.6 };
const VOLUME = { ml: 1, l: 1000 };
function baseOf(qty, unit) {
  if (qty == null) return null;
  const u = String(unit || '').toLowerCase();
  if (!u) return { fam: 'n', q: qty };
  if (WEIGHT[u] != null) return { fam: 'g', q: qty * WEIGHT[u] };
  if (VOLUME[u] != null) return { fam: 'ml', q: qty * VOLUME[u] };
  if (/^(cans?|tins?)$/.test(u)) return { fam: 'n', q: qty };
  return null; // tsp, tbsp, cups, cloves, slices: not a shop quantity
}

// One list item's need: "1kg" × qty 1 → 1000 g; "2 x 400g" → 800 g;
// "½" → 0.5; no amount → null (priced as written).
export function itemNeed(item) {
  const qty = Math.max(1, Number(item?.qty) || 1);
  const amount = item?.amount ? String(item.amount).trim() : '';
  if (!amount) return null;
  const p = parseAmount(`${amount} x`); // the trailing word lets "500g" parse alone
  if (p.qty == null) return null;
  if (p.times) {
    const inner = parseAmount(p.rest.replace(/\s*x$/, ''));
    const b = inner.qty != null ? baseOf(inner.qty, inner.unit) : null;
    if (b && b.fam !== 'n') return { fam: b.fam, q: p.qty * b.q * qty };
    return { fam: 'n', q: p.qty * qty };
  }
  const b = baseOf(p.qty, p.unit);
  return b ? { fam: b.fam, q: b.q * qty } : { fam: 'any', q: qty, say: amount };
}

// The need of a whole line: every item of that name, summed when they share
// a family. Anything unmeasurable or mixed makes the line 'any' (one product
// per item), and the sheet says why.
export function lineNeed(items) {
  const parts = (items || []).map((it) => ({ item: it, need: itemNeed(it) }));
  const fams = new Set(parts.map((p) => (p.need ? p.need.fam : 'any')));
  if (fams.size === 1 && !fams.has('any')) {
    const fam = [...fams][0];
    return { fam, q: parts.reduce((s, p) => s + p.need.q, 0), parts };
  }
  const q = (items || []).reduce((s, it) => s + Math.max(1, Number(it?.qty) || 1), 0);
  return { fam: 'any', q, parts };
}

/* ------------------------------------------------------- the products -- */

// what a product's own words say it holds: "1kg", "500g", "1.25L",
// "12 pack", "pk 6", "bag of 5", "3 x 400g", "each", "approx. 180g"
export function packOf(text) {
  const s = String(text || '').toLowerCase().replace(/,/g, '');
  const out = { each: /\b(each|loose|ea)\b/.test(s) || /\bper each\b/.test(s), count: null, g: null, ml: null, approx: /\b(approx|about|approximately|avg)\b/.test(s) };
  let m = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (m) {
    out.count = Number(m[1]);
    const v = Number(m[2]) * ({ kg: 1000, g: 1, l: 1000, ml: 1 })[m[3]];
    if (m[3] === 'kg' || m[3] === 'g') out.g = v * out.count; else out.ml = v * out.count;
    return out;
  }
  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litres?|liters?)\b/);
  if (m) {
    const u = m[2].startsWith('lit') ? 'l' : m[2];
    const v = Number(m[1]) * ({ kg: 1000, g: 1, l: 1000, ml: 1 })[u];
    if (u === 'kg' || u === 'g') out.g = v; else out.ml = v;
  }
  m = s.match(/(?:\b(?:pk|pack|bag) of\s*|\bpk\s*)(\d+)\b|\b(\d+)\s*(?:pk|pack|piece|pieces|count|ct)\b|\bbag of (\d+)\b|\babout (\d+)\b/);
  if (m) out.count = Number(m[1] || m[2] || m[3] || m[4]);
  if (/\bdozen\b/.test(s) && !out.count) out.count = 12;
  return out;
}

// A product's size in the line's terms, or null when they cannot be compared.
//   need 'n'  : each → 1; a counted pack → its count; a weighed bag → about
//               weight ÷ what one weighs
//   need 'g'  : weight; each → what one weighs (about)
//   need 'ml' : volume
//   need 'any': 1 (one product)
export function sizeFor(product, need, keep) {
  if (!need || need.fam === 'any') return { size: 1, approx: false };
  const pk = packOf(`${product.size || ''} ${product.name || ''}`);
  if (need.fam === 'n') {
    if (pk.count && (!pk.g || !keep?.each || /pack|pk|bag of|dozen/.test(String(product.name).toLowerCase()))) return { size: pk.count, approx: false };
    if (pk.each && !pk.count) return { size: 1, approx: false };
    if (pk.g && keep?.each) return { size: Math.max(1, Math.round(pk.g / keep.each)), approx: true };
    if (!pk.g && !pk.ml && !pk.count) return { size: 1, approx: false };
    return null;
  }
  if (need.fam === 'g') {
    if (pk.g) return { size: pk.g, approx: pk.approx };
    if ((pk.each || pk.count) && keep?.each) return { size: (pk.count || 1) * keep.each, approx: true };
    return null;
  }
  if (need.fam === 'ml') return pk.ml ? { size: pk.ml, approx: false } : null;
  return null;
}

// Does a product answer this line at all? Every word of the line must be in
// its name (plurals folded), and a prepared food never stands in for the raw
// one unless the line asks for it ("lime cordial" is not limes).
// (the words added on 10 Oct came from the live check: "brown onion" found
// a gravy pouch and shallots, "lime" a jelly, a soda and a vodka crush)
const PREPARED = /\b(juice|cordial|powder|sauce|soup|pie|lasagne|chips|crisps|flavou?red|seasoning|paste|dip|dressing|marinade|marinated|cracker|biscuits?|cake|bar|drink|frozen|tinned|canned|dried|pickled|smoked|kit|mix|gravy|pouch|jelly|soda|vodka|crush|burger|tuna|rings|shallots?|cordial|lollies|chutney|relish|noodles|ready)\b/;
const STOP = new Set(['fresh', 'free', 'range', 'large', 'small', 'the', 'a', 'of', 'and', 'raw', 'whole', 'organic']);
const fold = (w) => w.replace(/(ies)$/, 'y').replace(/(oes|ches|shes|sses|xes)$/, (x) => x.slice(0, -2)).replace(/s$/, '');
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(fold);
export function productMatches(lineName, productName) {
  const want = words(lineName);
  if (!want.length) return false;
  const have = new Set(words(productName));
  if (!want.every((w) => have.has(w))) return false;
  const pre = String(productName || '').toLowerCase().match(PREPARED);
  if (pre && !String(lineName || '').toLowerCase().includes(pre[1].replace(/s$/, ''))) return false;
  return true;
}

// a stable key for a line's name ("Brown Onions " → "brown onion")
export const lineKey = (name) => words(name).join(' ');

/* -------------------------------------------------------- the decision -- */

const EPS = 1e-9;
// products: [{ chain, id, name, size, price, … }]. Returns null when nothing
// is priced; otherwise the pick and every way to buy, sorted cheapest first.
export function decide({ need, products, keep }) {
  if (!need || !(need.q > 0)) return null;
  const cand = [];
  for (const raw of products || []) {
    if (!(Number(raw.price) > 0)) continue; // a $0.00 read is unreadable, never free
    // sold by the kilo: weighed out to the need, or by the piece at what one
    // weighs; either way an "about" price, and it says so
    let p = raw;
    if (raw.perKg) {
      if (need.fam === 'g') p = { ...raw, price: Math.round(raw.price * need.q / 10) / 100, size: `${need.q}g`, kgSized: need.q };
      else if (need.fam === 'n' && keep?.each) p = { ...raw, price: Math.max(0.01, Math.round(raw.price * keep.each / 10) / 100), size: 'each', perEachApprox: true };
      else continue;
      if (!(p.price > 0)) continue;
    }
    const sz = p.kgSized ? { size: p.kgSized, approx: true } : sizeFor(p, need, keep);
    if (!sz || !(sz.size > 0)) continue;
    const count = need.fam === 'any' ? Math.max(1, Math.round(need.q)) : Math.max(1, Math.ceil(need.q / sz.size - EPS));
    const total = Math.round(count * p.price * 100) / 100;
    const spare = need.fam === 'any' ? 0 : count * sz.size - need.q;
    cand.push({ ...p, size: sz.size, approx: sz.approx || !!raw.perKg, sizeText: raw.size, perKgPrice: raw.perKg ? raw.price : null, count, total, spare });
  }
  if (!cand.length) return null;
  const byTotal = [...cand].sort((a, b) => a.total - b.total || a.spare - b.spare);
  const exact = [...cand].sort((a, b) => a.spare - b.spare || a.total - b.total)[0];
  let pick = byTotal[0];
  let why = 'cheapest';
  if (pick.spare > exact.spare + EPS && perishable(keep) && exact.total - pick.total < MARGIN) { pick = exact; why = 'waste'; }
  const other = byTotal.find((c) => c.chain !== pick.chain) || null;
  const single = byTotal.find((c) => c.size === 1) || null;
  const pack = byTotal.find((c) => c.size > 1) || null;
  const tie = !!(other && Math.abs(other.total - pick.total) < 0.005);
  return { need: need.q, fam: need.fam, pick, why, cand: byTotal, exact, cheapest: byTotal[0], other, single, pack, tie };
}

/* ------------------------------------------------------- the words ---- */

const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
export function frac(n) {
  const w = Math.floor(n + EPS);
  const f = Math.round((n - w) * 4) / 4;
  if (f === 1) return String(w + 1);
  return `${w || ''}${FRAC[f] || ''}` || '0';
}
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const word = (n) => WORD[n] || String(n);
const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const money = (n) => (Math.abs(n) < 1 ? `${Math.round(Math.abs(n) * 100)}c` : `$${Math.abs(n).toFixed(2)}`);
export const dollars = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// a candidate's kind in a few words: "single", "bag of 5", "1 kg", "12 pack"
export function packWords(c, fam) {
  if (fam === 'n') return c.size === 1 ? 'single' : `${/bag/i.test(c.name) ? 'bag' : 'pack'} of ${c.size}`;
  if (fam === 'g') return c.size >= 1000 ? `${+(c.size / 1000).toFixed(2)} kg` : `${Math.round(c.size)} g`;
  if (fam === 'ml') return c.size >= 1000 ? `${+(c.size / 1000).toFixed(2)} L` : `${Math.round(c.size)} ml`;
  return c.sizeText || 'one';
}
const spareWords = (c, fam) => (fam === 'g' ? `${Math.round(c.spare)} g` : fam === 'ml' ? `${Math.round(c.spare)} ml` : frac(c.spare));

// the line under the name: what code decided, in one sentence (or nothing)
export function advice(d, keep) {
  if (!d || d.fam !== 'n') return null;
  const p = d.pick;
  if (d.why === 'waste') {
    return { tone: 'waste', text: `${up(word(p.count))} single${p.count === 1 ? '' : 's'}: a ${packWords(d.cheapest, 'n')} saves ${money(p.total - d.cheapest.total)}, `, warn: `but ${spareWords(d.cheapest, 'n')} would go off in ${keep?.d} days` };
  }
  if (p.size > 1 && d.single && d.need > 1) {
    return { tone: 'save', text: `${up(packWords(p, 'n'))} at ${dollars(p.total / p.count)}: `, save: `${money(d.single.total - p.total)} under ${frac(d.need)} singles`, rest: `, ${spareWords(p, 'n')} spare · ${keepsWord(keep)}` };
  }
  if (p.size === 1 && d.need < 1 && d.pack) return { tone: 'plain', text: `One single. A ${packWords(d.pack, 'n')} would leave ${frac(d.pack.spare)} over.` };
  if (p.size === 1 && d.pack && d.pack.total > p.total) return { tone: 'plain', text: `Singles: ${money(d.pack.total - p.total)} under a ${packWords(d.pack, 'n')}.` };
  return null;
}

// the sheet's verdict, in the serif
export function verdict(d, keep) {
  const p = d.pick;
  const at = CHAIN_NAME[p.chain];
  if (d.why === 'waste') return `${up(word(p.count))} single${p.count === 1 ? '' : 's'} at ${at}. The ${packWords(d.cheapest, d.fam)} is ${money(p.total - d.cheapest.total)} cheaper, and ${spareWords(d.cheapest, d.fam)} would go off before you used ${d.cheapest.spare === 1 ? 'it' : 'them'}.`;
  if (d.fam === 'n' && p.size > 1 && d.single && d.need > 1) return `The ${packWords(p, 'n')} at ${at}: ${money(d.single.total - p.total)} under ${frac(d.need)} singles, and the ${frac(p.spare)} spare ${keepsWord(keep).replace('keeps', 'keep')}.`;
  if (d.fam === 'n' && d.need < 1 && d.pack) return `One single at ${at}. You need ${frac(d.need)}; a ${packWords(d.pack, 'n')} would cost ${money(d.pack.total - p.total)} more and leave ${frac(d.pack.spare)} over.`;
  if (d.other && d.other.total - p.total > 0.004) return `${at}, ${money(d.other.total - p.total)} less than ${CHAIN_NAME[d.other.chain]}.`;
  if (d.other) return `The same price at ${at} and ${CHAIN_NAME[d.other.chain]}.`;
  return `${at} is the only price read.`;
}

// with no prices at all, the need and how long it keeps still decide
export function verdictNoPrice(need, keep) {
  if (!need || need.fam === 'any') return 'Buy it as written; nothing to compare without prices.';
  if (need.fam !== 'n') return 'Buy what the recipe says; nothing to compare without prices.';
  if (need.q < 1) return `You need ${frac(need.q)}: buy one single. A bag would leave the rest over.`;
  return `You need ${frac(need.q)}. ${perishable(keep) ? 'These go off fast, so buy just that.' : `A bag is fine if it is cheaper; spares ${keepsWord(keep).replace('keeps', 'keep')}.`}`;
}

// points: both programmes redeem 2,000 points for $10
export const PT_RATE = 10 / 2000;
export const ptsWorth = (p) => p * PT_RATE;
