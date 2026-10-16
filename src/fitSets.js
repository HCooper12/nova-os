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
