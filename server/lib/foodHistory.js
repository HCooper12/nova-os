import { loadRecentDays } from './foodLog.js';

// A normalized key so the same food logged on different days groups together
// despite casing/punctuation differences ("Crumpets w/ Duo Penotti" ≈ "crumpets
// with duo penotti"). Deliberately light — it does NOT strip quantities, because
// "8 pretzels" and "12 pretzels" are genuinely different portions worth keeping
// distinct; the scan tends to produce a stable descriptive name for the same food.
export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Aggregate off-plan food-log entries across recent days into per-item history.
// Days arrive most-recent-first, so the first time a key is seen is its newest
// logging — that entry supplies the representative display name + macros (the
// current portion). Returns newest-eaten first, tie-broken by how often.
export async function computeFoodHistory({ days = 45 } = {}) {
  const daysData = await loadRecentDays(days);
  const byKey = new Map();
  for (const day of daysData) {
    for (const e of day.entries || []) {
      const key = normalizeName(e.name);
      if (!key) continue;
      let item = byKey.get(key);
      if (!item) {
        item = {
          key,
          name: e.name,
          macros: { p: e.macros.p, c: e.macros.c, f: e.macros.f, kcal: e.macros.kcal },
          source: e.source || null,
          count: 0,
          lastDate: day.date,
          firstDate: day.date,
          kcals: [], // every logged portion's kcal — so a saved recipe can confess when portions disagreed
        };
        byKey.set(key, item);
      }
      item.count += 1;
      item.kcals.push(Number(e.macros?.kcal) || 0);
      if (day.date < item.firstDate) item.firstDate = day.date;
      // the macros a save would carry are the LATEST logged portion's, not the first seen
      if (day.date >= item.lastDate) { item.lastDate = day.date; item.macros = { p: e.macros.p, c: e.macros.c, f: e.macros.f, kcal: e.macros.kcal }; }
    }
  }
  return [...byKey.values()].sort((a, b) => (
    a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : b.count - a.count
  ));
}

// Items eaten often enough recently to be worth saving as a recipe. excludeKeys
// (normalized) drops things already in the recipe bank or already proposed.
export async function recurringFoods({ days = 21, minCount = 3, excludeKeys = new Set() } = {}) {
  const hist = await computeFoodHistory({ days });
  return hist.filter((i) => i.count >= minCount && !excludeKeys.has(i.key));
}

// PORTIONS THAT DISAGREED. When the same food's logged kcal spread by more
// than 30% (max vs min), a recipe saved from it should say so rather than
// present one number as the food's truth. Pure, exported for the test.
export const PORTION_VARIANCE = 0.3;
export function portionVariance(kcals) {
  const list = (kcals || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (list.length < 2) return { varied: false, min: null, max: null };
  const min = Math.min(...list), max = Math.max(...list);
  return { varied: (max - min) / max > PORTION_VARIANCE, min: Math.round(min), max: Math.round(max) };
}
