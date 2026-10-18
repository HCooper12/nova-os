// THE TARGET A DAY WAS SET AGAINST (18 Oct 2026, his rule): "Any new goal
// changes should always be from that point forward and never retroactively
// impacted." A target change applies from the day he makes it onward. A past
// day keeps the calorie and protein target it had, so a new goal never turns
// an old day into "over" or "under" after the fact.
//
// The history lives on his goals page (Wiki/Health/Fitness Goals.md,
// frontmatter `targetHistory`), one entry per change:
//   { from: 'YYYY-MM-DD', kcal: 2153, protein: 166 }
// `from` is the first local day the entry governs. The first entry's `from`
// may be EARLIEST, meaning "since before the record began".
// Shared by the server (which writes it) and the client (which reads days).

export const EARLIEST = '1970-01-01';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

export function cleanTargetHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map();
  for (const e of raw) {
    const from = e && typeof e.from === 'string' && ISO.test(e.from) ? e.from : null;
    if (!from) continue;
    const kcal = num(e.kcal);
    const protein = num(e.protein);
    if (kcal == null && protein == null) continue;
    byDay.set(from, { from, kcal, protein });
  }
  return [...byDay.values()].sort((a, b) => a.from.localeCompare(b.from));
}

// The target in force on `date`. A day before the first entry gets the first
// entry (the earliest known target). No history at all → `fallback` (today's
// numbers), which is what every reader did before the history existed.
// Each number resolves on its own, so an entry that set only kcal still
// inherits protein from the entry before it.
export function targetsOn(history, date, fallback = {}) {
  const h = cleanTargetHistory(history);
  const out = { kcal: num(fallback.kcal), protein: num(fallback.protein) };
  if (!h.length || !ISO.test(String(date || ''))) return out;
  const upto = h.filter((e) => e.from <= date);
  const chain = upto.length ? upto : [h[0]];
  for (const key of ['kcal', 'protein']) {
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i][key] != null) { out[key] = chain[i][key]; break; }
    }
  }
  return out;
}

// The history after a save on `date` that sets { kcal, protein }. Unchanged
// numbers add nothing. A second change on the same day replaces that day's
// entry (the day is governed by where he left it). With no history yet, the
// numbers in force before the change (`prior`) are recorded as EARLIEST, so
// every earlier day keeps them.
export function withTargetChange(history, date, next, prior = {}) {
  let h = cleanTargetHistory(history);
  const want = { kcal: num(next.kcal), protein: num(next.protein) };
  if (!h.length) {
    const p = { kcal: num(prior.kcal), protein: num(prior.protein) };
    if (p.kcal == null && p.protein == null) {
      return want.kcal == null && want.protein == null ? [] : [{ from: EARLIEST, ...want }];
    }
    h = [{ from: EARLIEST, ...p }];
  }
  const now = targetsOn(h, date);
  const merged = { kcal: want.kcal ?? now.kcal, protein: want.protein ?? now.protein };
  if (merged.kcal === now.kcal && merged.protein === now.protein) return h;
  const rest = h.filter((e) => e.from !== date);
  // put back the same day to what it was: the day's entry simply goes
  const before = targetsOn(rest, date);
  if (rest.length && merged.kcal === before.kcal && merged.protein === before.protein) return rest;
  return cleanTargetHistory([...rest, { from: date, ...merged }]);
}
