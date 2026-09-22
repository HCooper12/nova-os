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
// current portion). Returns newest-eaten first.
//
// RECENCY IS A MOMENT, NOT A DAY (22 Sep 2026). This used to sort by date and
// tie-break by count, which meant every food logged today tied — and the
// tie-break then put the food he eats MOST first. His report: "have recently
// logged or added foods added to the top so I don't need to keep scrolling to
// search for something I just added". The thing he added a minute ago was
// losing to a breakfast he has had forty times.
//
// So each item carries the moment it was last logged. Entries are appended in
// order within a day and same-day ones carry a clock time, so the stamp is the
// date plus that time plus that position — the position both orders a day
// whose entries have no clock time (a retro log genuinely has none, and
// inventing one would be fiction) and breaks a tie inside the same minute.
// Count still breaks a true tie.
export async function computeFoodHistory({ days = 45 } = {}) {
  const daysData = await loadRecentDays(days);
  const byKey = new Map();
  for (const day of daysData) {
    const entries = day.entries || [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const key = normalizeName(e.name);
      if (!key) continue;
      // One comparable string, three parts, every part fixed-width so it
      // compares as a string: the date, the clock time when there is one, and
      // the row's position in the day. The position is what orders a day whose
      // entries have no clock time (a retro log — foodLog.js only stamps one
      // for today, deliberately), and what breaks a tie inside the same minute.
      const at = `${day.date} ${e.time || '00:00'} ${String(i).padStart(4, '0')}`;
      let item = byKey.get(key);
      if (!item) {
        item = {
          key,
          name: e.name,
          macros: { p: e.macros.p, c: e.macros.c, f: e.macros.f, kcal: e.macros.kcal },
          source: e.source || null,
          count: 0,
          lastDate: day.date,
          lastAt: '',
          firstDate: day.date,
          kcals: [], // every logged portion's kcal — so a saved recipe can confess when portions disagreed
        };
        byKey.set(key, item);
      }
      item.count += 1;
      item.kcals.push(Number(e.macros?.kcal) || 0);
      if (day.date < item.firstDate) item.firstDate = day.date;
      // the macros a save would carry are the LATEST logged portion's, not the first seen
      if (at >= item.lastAt) { item.lastDate = day.date; item.lastAt = at; item.macros = { p: e.macros.p, c: e.macros.c, f: e.macros.f, kcal: e.macros.kcal }; }
    }
  }
  return [...byKey.values()].sort((a, b) => (
    a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : b.count - a.count
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
