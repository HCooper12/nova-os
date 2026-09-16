// WHERE A THROWN SHEET IS GOING — the decision logic as pure functions, no
// DOM and no React, for the same reason swipeCore.js is (its comment explains
// the pattern): the property that matters is testable deterministically here
// and only by hand in a browser anywhere else.
//
// Written 16 Sep 2026 after an audit against Apple's own *Designing Fluid
// Interfaces* found that Nova's sheets HAD a velocity rule and had never once
// run it: `useSheetDrag.end()` set `drag.current = null` before calling
// `settle()`, and `settle` read `drag.current.v`. The flick branch was
// therefore always false. Every sheet in the app — the exercise card, the
// portion sheet, the expanded glass panel — could only be dismissed by
// dragging slowly past its full threshold. A flick, which is how iOS sheets
// are actually dismissed, sprang back.
//
// Two rules from that talk replace the boolean it was reaching for.

// 1. MOMENTUM PROJECTION. Do not decide from the release POSITION; decide from
//    where the gesture was going. This is Apple's own projection function from
//    the sample code — exponential decay, not the textbook v^2/2a.
export const DECELERATION = 0.998;

// `v` is px per MILLISECOND (what a pointermove delta divided by dt gives you);
// Apple's constant is written for px/s, hence the 1000s cancelling.
export function project(v, decelerationRate = DECELERATION) {
  if (!Number.isFinite(v)) return 0;
  return v * decelerationRate / (1 - decelerationRate);
}

// 2. DECIDE REVERSE VS COMMIT ON THE VELOCITY'S SIGN, NOT ON POSITION. A sheet
//    dragged well past the threshold and then flicked back UP is being
//    rescued, and must return — the old rule dismissed it, because it only
//    ever looked at how far down the finger had ended up.
export function settleDecision({ dy, v = 0, threshold = 110 }) {
  const projected = dy + project(v);
  return projected > threshold ? 'dismiss' : 'return';
}

// 3. VELOCITY HANDOFF. The animation has to leave at the speed the finger
//    arrived at, or there is a visible seam between dragging and animating.
//    A CSS transition cannot take an initial velocity, but its DURATION can be
//    derived from one: time = distance / speed. Clamped, because a near-zero
//    flick would otherwise ask for a transition measured in seconds.
export const MIN_MS = 130;
export const MAX_MS = 420;

export function throwDuration(distance, v) {
  const speed = Math.abs(v);
  if (!Number.isFinite(speed) || speed < 0.01) return MAX_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.abs(distance) / speed));
}

// 4. VELOCITY FROM A SHORT HISTORY, NOT THE LAST TWO POINTS. A single sample
//    is noisy in exactly the wrong place: a finger that decelerates in the
//    last frame of a fast flick reports ~0 and the throw is lost.
export const SAMPLE_MS = 80;

// Samples are `{ t, v }` — a TIME and a VALUE on whatever axis the caller is
// tracking. Deliberately not `y`: swipe rows feed it x, and a field named for
// one axis is a lie the moment a second caller arrives.
export function velocityFrom(samples, now = samples.length ? samples[samples.length - 1].t : 0) {
  const recent = samples.filter((s) => now - s.t <= SAMPLE_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (last.v - first.v) / dt;
}

// 5. RUBBER-BANDING. Progressive resistance, not a linear 0.55 multiplier and
//    not a hard stop — the further past the bound, the less the sheet follows,
//    which is what tells a thumb there is nothing more here.
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (dimension <= 0) return overshoot;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
