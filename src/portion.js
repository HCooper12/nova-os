// PORTIONS — logging part of a recipe you already have.
//
// His ask: a recipe stored as "1 full bag" should be loggable as a third or
// a half without re-entering it as a brand-new food. So a logged entry is a
// recipe PLUS a factor, and the macros scale.
//
// Rounding is the whole risk here. Rounding each macro independently makes
// the numbers stop agreeing with each other (0.5 × 7g protein = 3.5 → 4,
// three of those read as 12g where the recipe says 10.5), and the kcal line
// stops matching its own P/C/F. So: round each macro to the nearest gram for
// display, but keep kcal as ITS OWN scaled value rather than recomputing it
// from the rounded grams — the recipe's kcal is the measured truth, and
// 4/4/9 arithmetic over rounded grams would quietly invent a different one.

export const PORTIONS = [
  { factor: 1 / 4, label: '¼' },
  { factor: 1 / 3, label: '⅓' },
  { factor: 1 / 2, label: '½' },
  { factor: 2 / 3, label: '⅔' },
  { factor: 3 / 4, label: '¾' },
  { factor: 1, label: '1' },
  { factor: 1.5, label: '1½' },
  { factor: 2, label: '2' },
];

// A clean label for the factor — the stored fractions get their glyph, and
// anything else reads as a plain multiplier rather than an ugly decimal.
export function portionLabel(factor) {
  const known = PORTIONS.find((p) => Math.abs(p.factor - factor) < 0.001);
  if (known) return known.label;
  const rounded = Math.round(factor * 100) / 100;
  return `${rounded}×`;
}

// What the entry is called in the log — "Chilli bag (⅓ serving)". A full
// serving carries no suffix: "(1 serving)" on every ordinary entry is noise.
export function portionName(name, factor) {
  const base = String(name || 'Recipe');
  if (Math.abs(factor - 1) < 0.001) return base;
  return `${base} (${portionLabel(factor)} serving)`;
}

export function scaleMacros(macros, factor) {
  const f = Number(factor);
  const m = macros || {};
  const g = (v) => Math.round((Number(v) || 0) * f);
  return {
    p: g(m.p),
    c: g(m.c),
    f: g(m.f),
    // kcal keeps its own scaling — never recomputed from the rounded grams
    kcal: Math.round((Number(m.kcal) || 0) * f),
  };
}

// Guard for the custom field: a portion must be a positive, sane number.
// Zero would log a phantom entry; a stray "100" would poison the day's
// totals with 100 servings of something.
export function validPortion(factor) {
  const f = Number(factor);
  return Number.isFinite(f) && f > 0 && f <= 20;
}
