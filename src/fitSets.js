// A SESSION SHOWS THE SETS THE PROGRAM PRESCRIBES (16 Oct 2026, his pick). The
// prefill used to copy however many sets he logged last time, so a lift cut
// short once (one set of lateral raises on 13 Oct) opened as one set under a
// card that said 5 × 12–15. Now the count is the prescription's; the numbers
// still come from last time: set i gets last time's set i, and sets past what
// he logged repeat his final one. Longer last time than prescribed, the extras
// are not carried. `base` is null/empty when there is no history (the caller
// builds the blank default).
export function fitSets(base, count) {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  if (!Array.isArray(base) || !base.length) return null;
  return Array.from({ length: n }, (_, i) => ({ ...base[Math.min(i, base.length - 1)] }));
}

// ------------------------------------------------------------ drop sets --
// A DROP-SET STRUCTURE (16 Oct 2026, his ask for the lateral raise: "make it
// a drop set so I can continue developing the weight, then drop as sets
// increase"). A routine entry may say `dropSets: n`: its LAST n sets are drop
// sets (the weight comes down, no rest between), and the sets before them are
// the top sets the lift progresses on. targetSets still counts them all, so
// 5 sets with 4 drops is one top set and four drops.
export const DROP_FACTOR = 0.8;
// the load of the next drop: 20 % lighter, to the nearest half kilo, never 0
export const dropWeight = (w) => (Number(w) > 0 ? Math.max(0.5, Math.round(Number(w) * DROP_FACTOR * 2) / 2) : 0);
// the stored count, or 0: a whole number from 1 up to one less than the sets
// (a lift needs at least one top set to drop from)
export function cleanDropSets(drops, targetSets) {
  const d = Math.floor(Number(drops));
  const n = Math.floor(Number(targetSets));
  return Number.isFinite(d) && Number.isFinite(n) && d >= 1 && d <= n - 1 ? d : 0;
}
// how many of the sets are top sets: what progression reads
export const topSetCount = (entry) => Math.max(1, (Number(entry?.targetSets) || 0) - cleanDropSets(entry?.dropSets, entry?.targetSets));

// The sets of a session lift with its drops marked. `keepRecorded` is how many
// leading sets carry weights he really logged last time (their drops are
// kept); drops past that step down from the set above. A bodyweight lift has
// no load to step, so only the type changes.
export function applyDrops(sets, dropSets, { keepRecorded = 0 } = {}) {
  const n = sets.length;
  const d = cleanDropSets(dropSets, n);
  if (!d) return sets;
  const out = [];
  sets.forEach((s, i) => {
    if (i < n - d) { out.push(s); return; }
    // a weight he really logged is kept only if it IS lower than the set above
    // (last time's straight sets at one load are not drops); else step down
    // from the set above AS IT NOW STANDS, so the drops chain
    const above = out[i - 1].weight;
    const weight = i < keepRecorded && s.weight < above ? s.weight : dropWeight(above) || s.weight;
    out.push({ ...s, weight, setType: 'drop' });
  });
  return out;
}
