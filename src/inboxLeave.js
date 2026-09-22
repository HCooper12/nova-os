// A DECISION IS ACTED OUT, NOT STATED (finding 13, 22 Sep review; §2b r7).
// The card used to vanish on approve. Now it leaves in its verdict's colour
// over one beat, the next card rises (deckRise), and the count ticks. This is
// the one number: how long the record stays on screen, already decided,
// before the optimistic status swap removes it from the pending list. Zero
// under reduced motion — the fall is a cross-fade there and needs no beat.
export const LEAVE_MS = 420;

export function leaveMs(reducedMotion) {
  return reducedMotion ? 0 : LEAVE_MS;
}

export function prefersReducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
}
