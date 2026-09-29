// SCALING A RECIPE TO THE SERVINGS HE IS COOKING (29 Sep 2026).
//
// His ask came with a reel for a recipe app: share a reel, get a clean
// recipe page, then "scale the servings". Nova's recipes are hand-written
// lines ("240 g oats", "1 1/2 cups milk", "2 x 400g cans chickpeas"), so
// scaling is a reading job: find the leading amount, multiply it, write it
// back the way a cook would say it, and leave every other character of the
// line exactly as he wrote it.
//
// Shared by both sides on purpose, like src/visualBeats.js: the server reads
// a recipe's servings with the same function the Fuel screen scales with, so
// "how many does this make" can never mean two different things. Pure, no
// imports: it is bundled into the PWA and imported by server/lib/recipes.js.
//
// The rounding is the part that makes it feel right:
//   g / ml / mg   whole numbers; 100 and over, the nearest 5 (nobody weighs 363 g)
//   kg / l        two decimals, trailing zeros trimmed
//   cups, spoons,
//   and counts    the nearest quarter, written ¼ ½ ¾ and 1½ — never 1.5 cups
//   2 x 400g cans the COUNT scales, the can stays a 400 g can
//   no amount     left alone ("salt", "juice of a lime")
//   factor 1      the exact original line, byte for byte

const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const NUM_SRC = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s?[¼½¾⅓⅔⅛]|\\d+\\/\\d+|[¼½¾⅓⅔⅛]|\\d+(?:\\.\\d+)?)';

// Units, longest first so "tbsp" is never read as "t" and "kg" never as "g".
// An egg is NOT a unit: in "2 eggs" the egg is the thing being counted.
const UNIT_SRC = [
  'tablespoons?', 'teaspoons?', 'tbsp', 'tbs', 'tsp',
  'cups?', 'scoops?', 'slices?', 'cans?', 'tins?', 'cloves?',
  'kg', 'mg', 'ml', 'g', 'l', 'oz', 'lbs?',
].join('|');

const LEAD_RE = new RegExp(
  `^(\\s*)(${NUM_SRC})(?:(\\s*[-–]\\s*)(${NUM_SRC}))?(?:(\\s*[x×]\\s*)(?=\\d)|(\\s*)(${UNIT_SRC})(?![A-Za-z]))?`,
  'i',
);

function toNumber(text) {
  const s = String(text).trim();
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\s?([¼½¾⅓⅔⅛])$/.exec(s);
  if (m) return Number(m[1]) + FRAC[m[2]];
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  if (FRAC[s] != null) return FRAC[s];
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * The leading amount of an ingredient line.
 *   parseAmount('240g oats') → { qty: 240, unit: 'g', rest: 'oats', raw: '240g oats' }
 *   parseAmount('salt')      → { qty: null, unit: null, rest: 'salt', raw: 'salt' }
 * `times` is true for "2 x 400g cans" (qty is the count of cans, rest is
 * "400g cans"); `qtyTo` is the top of a range ("2-3 tbsp").
 */
export function parseAmount(line) {
  const raw = String(line ?? '');
  const m = LEAD_RE.exec(raw);
  const qty = m ? toNumber(m[2]) : null;
  // "2% milk" and "0% yoghurt" name a product, not an amount
  const percent = m && !m[5] && !m[7] && /^\s*%/.test(raw.slice(m[0].length));
  if (!m || qty == null || qty <= 0 || percent) return { qty: null, unit: null, rest: raw.trim(), raw };
  const qtyTo = m[4] ? toNumber(m[4]) : null;
  const times = !!m[5];
  const unit = m[7] ? m[7] : null;
  const rest = raw.slice(m[0].length).trim();
  const out = { qty, unit, rest, raw, times, ...(qtyTo != null ? { qtyTo } : {}) };
  // the verbatim pieces, so a scaled line differs only in its numbers
  // (not enumerable: callers and JSON see only the documented fields)
  Object.defineProperty(out, '_m', { value: m, enumerable: false });
  return out;
}

const QUARTER_GLYPH = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };

// the nearest quarter, as a cook writes it: ¼, 1½, 4½, 2 — never 1.5
export function formatQuarter(x) {
  if (!(x > 0)) return '0';
  const q = Math.max(0.25, Math.round(x * 4) / 4);
  const whole = Math.floor(q);
  const frac = QUARTER_GLYPH[q - whole] ?? '';
  return `${whole || ''}${frac}` || '0';
}

function unitClass(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'g' || u === 'ml' || u === 'mg') return 'metric';
  if (u === 'kg' || u === 'l') return 'metricLarge';
  return 'quarter';
}

function formatQty(x, unit) {
  const cls = unitClass(unit);
  if (cls === 'metric') {
    if (x >= 100) return String(Math.round(x / 5) * 5);
    return String(Math.max(1, Math.round(x)));
  }
  if (cls === 'metricLarge') return String(Number(x.toFixed(2)));
  return formatQuarter(x);
}

// "1 cup" doubled is "2 cups"; "2 slices" halved is "1 slice". Only the
// UNIT is inflected — the item text is his and stays verbatim.
const PLURAL_UNITS = /^(cup|scoop|slice|can|tin|clove|tablespoon|teaspoon|lb)s?$/i;
function inflect(unit, value) {
  if (!unit || !PLURAL_UNITS.test(unit)) return unit;
  const base = unit.replace(/s$/i, '');
  const plural = value > 1;
  if (!plural) return base;
  if (/s$/i.test(unit)) return unit;
  return base + (unit === unit.toUpperCase() && unit.length > 1 ? 'S' : 's');
}

/** One ingredient line multiplied by `factor`, everything but the amount verbatim. */
export function scaleLine(line, factor) {
  const raw = String(line ?? '');
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0 || f === 1) return raw;
  const a = parseAmount(raw);
  if (a.qty == null) return raw;
  const m = a._m;
  const lead = m[1];
  const after = raw.slice(m[0].length);
  const scaledQty = a.qty * f;
  // "2 x 400g cans": the count is a count; the can is still a 400 g can
  if (a.times) return `${lead}${formatQuarter(scaledQty)}${m[5]}${after}`;
  const unit = a.unit;
  const num = formatQty(scaledQty, unit);
  const range = a.qtyTo != null ? `${m[3]}${formatQty(a.qtyTo * f, unit)}` : '';
  const top = a.qtyTo != null ? a.qtyTo * f : scaledQty;
  const unitText = unit ? `${m[6]}${inflect(unit, top)}` : '';
  return `${lead}${num}${range}${unitText}${after}`;
}

/**
 * How many portions a recipe makes: the explicit `servings` (from a
 * `**Serves:**` line) first, else a number at the start of `makes`
 * ("6 jars" → 6, "14 sliders = 7 meals" → 14, "serves 4" → 4). A batch is
 * not a portion count ("1 batch of brownies" → null). Pure.
 */
export function servingsOf(recipe) {
  if (!recipe) return null;
  const s = Number(recipe.servings);
  if (recipe.servings != null && Number.isInteger(s) && s > 0) return s;
  const makes = String(recipe.makes || '').replace(/\*+/g, '').trim();
  const m = /^(?:makes|serves|servings?)?\s*:?\s*(\d+)(?:\s*[-–]\s*\d+)?\s*([A-Za-z]*)/i.exec(makes);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  if (/^batch(?:es)?$/i.test(m[2])) return null;
  return n;
}

/**
 * The recipe's ingredient lines for `servings` portions.
 * factor = servings / servingsOf(recipe); a recipe that does not say how
 * many it makes cannot be scaled honestly, so its lines come back unchanged
 * with factor 1. Group labels ("— Salsa —") are never scaled.
 *
 * Per-serving macros are NOT scaled: they describe ONE portion (a jar is a
 * jar), and cooking eight instead of six changes how many jars, not what is
 * in each. Only the batch's ingredient amounts move.
 */
export function scaleRecipe(recipe, servings) {
  const lines = (recipe?.ingredients || []).map((i) => (typeof i === 'string' ? i : (i.qty ? `${i.qty} ${i.name}` : i.name)));
  const base = servingsOf(recipe);
  const want = Number(servings);
  if (!base || !(want > 0)) return { factor: 1, lines };
  const factor = want / base;
  const groups = (recipe?.ingredients || []).map((i) => typeof i !== 'string' && !!i.group);
  return { factor, lines: lines.map((l, idx) => (groups[idx] ? l : scaleLine(l, factor))) };
}

// A SOURCE LABEL THAT FITS (30 Sep 2026). Instagram hands over the creator's
// full display name ("Sean Graham | Online Fitness & Nutrition Coach"), which
// ran off the edge of the meta row at 375. The part before the first
// separator is the name; the rest is their tagline.
export function shortSourceLabel(label, max = 28) {
  const s = String(label || '').split(/\s+[|·—–-]\s+/)[0].replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
