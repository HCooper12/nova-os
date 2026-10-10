// A LINE IN PARTS (his call 10 Oct 2026, "Yes, split across categories"),
// one module the server and the page both read (as src/moneyParse.js is).
//
// THE SHAPE. A ledger line may carry `parts`: exactly two
// { category, amount } pieces whose amounts carry the line's own sign and
// add up to the line's amount to the cent. The line's `category` is the
// first part's, so anything that reads only `category` still reads the
// line sensibly. A line with no `parts` (every line written before this) is
// ONE part, itself: old ledgers read exactly as they did.
//
// Every place that counts money BY CATEGORY (totals, budgets, the donut,
// the export, the over-budget signal) reads lines through explodeParts, so
// each part counts in its own category. Places that count LINES or the
// month's total (spent, daily, subscriptions, dedupe) read the line whole.

const cents = (n) => Math.round(Math.abs(Number(n) || 0) * 100);

export const isSplit = (t) => Array.isArray(t?.parts) && t.parts.length > 1;

// The parts a line counts as: its own when they are sound, else the line
// itself. "Sound" is checked, not assumed: a hand-edited month whose parts
// no longer add up reads as one line in its first category, never as money
// that appears or vanishes.
export function partsOf(t) {
  if (isSplit(t)) {
    const total = cents(t.amount);
    const sign = Number(t.amount) < 0 ? -1 : 1;
    const ok = t.parts.every((p) => p && typeof p.category === 'string' && cents(p.amount) > 0 && Math.sign(Number(p.amount)) === sign)
      && t.parts.reduce((s, p) => s + cents(p.amount), 0) === total;
    if (ok) return t.parts.map((p) => ({ category: p.category, amount: Number(p.amount) }));
  }
  return [{ category: t.category, amount: Number(t.amount) }];
}

// Each line as one entry per part: the line's own fields, with the part's
// category and amount. A list in, a longer (or equal) list out.
export function explodeParts(list) {
  const out = [];
  for (const t of list || []) {
    if (!isSplit(t)) { out.push(t); continue; }
    for (const p of partsOf(t)) out.push({ ...t, category: p.category, amount: p.amount });
  }
  return out;
}

// A split as he asked for it, made sound or refused: two different known
// categories, each at least a cent, adding up to the line to the cent, in
// the line's sign (amounts may come as magnitudes). Income only splits money
// in. Throws in plain words; returns the parts to store.
export function normalizeSplit(amount, parts, categories) {
  if (!Array.isArray(parts) || parts.length !== 2) throw new Error('a split is two parts');
  const sign = Number(amount) < 0 ? -1 : 1;
  const total = cents(amount);
  const out = parts.map((p) => ({ category: p?.category, c: cents(p?.amount) }));
  for (const p of out) {
    if (!categories.includes(p.category)) throw new Error('unknown category in the split');
    if (p.category === 'Income' && sign < 0) throw new Error('a spend cannot be split into Income');
    if (p.c < 1) throw new Error('each part of a split is at least a cent');
  }
  if (out[0].category === out[1].category) throw new Error('a split is two different categories');
  if (out[0].c + out[1].c !== total) throw new Error(`the parts add up to $${((out[0].c + out[1].c) / 100).toFixed(2)}, not the line's $${(total / 100).toFixed(2)}`);
  return out.map((p) => ({ category: p.category, amount: (sign * p.c) / 100 }));
}
