// THE DYNAMIC ISLAND — the pure half. His ask, 24 Sep 2026, from a reel of
// rit3zh/expo-dynamic-notifications: notifications that drop out of the
// island, swell into a card, and are thrown back up into it.
//
// That library is React Native (Skia + Reanimated + Gesture Handler), so it
// cannot be installed into a Vite PWA. What CAN be carried over is the thing
// that makes it look right — its geometry, its timeline and its springs — and
// those are ported here value for value, with the source constant named where
// it matters. Skia's goo (blur, then an alpha colour matrix that thresholds
// the blur back into a hard edge) is the same two operations as an SVG
// feGaussianBlur + feColorMatrix, which is how DynamicIsland.jsx draws it.
//
// Everything in this file is deterministic and DOM-free so node:test can hold
// it still (server/test/dynamicIsland.test.js).

// ── the library's constants (notification.consts.ts), kept verbatim ──────────
export const ISLAND_WIDTH = 126;
export const ISLAND_HEIGHT = 37.33;
export const ISLAND_TOP = 11;          // gap between the island and the inset line
export const ISLAND_MIN_TOP = 12;
export const CARD_MAX_WIDTH = 396;
export const CARD_MARGIN = 16;
export const CARD_GAP = 34;            // island → card, long enough for the neck to show
export const DROP_SIZE = 52;
export const NECK_WIDTH = 60;
export const EDGE_MARGIN = 10;
export const GOO_STRENGTH = 0.62;
export const GOO_BLUR_MIN = 5;
export const GOO_BLUR_MAX = 20;
export const GOO_GAIN = 22;
export const GOO_THRESHOLD = 0.43;
export const GOO_INSET_RATIO = 0.26;
export const DROP_GROW_SPAN = 0.7;
export const DROP_GROW_POWER = 1.25;
export const DROP_STRETCH = 0.38;
export const NECK_BREAK = 0.82;
export const NECK_RISE = 1.6;
export const NECK_FALL = 1.4;
export const CONTENT_MIN_SCALE = 0.88;
export const ENTER_EXPAND_DELAY = 340;
export const ENTER_REVEAL_DELAY = 560;
export const EXIT_COLLAPSE_DELAY = 100;
export const EXIT_DROP_DELAY = 280;
export const AUTO_DISMISS = 3600;      // the same 3.6s Nova's toast already used
export const SWIPE_DISTANCE = -18;     // px up that counts as a throw
export const SWIPE_VELOCITY = -0.42;   // px/ms (the library's -420 px/s)

// ── Nova's own additions ─────────────────────────────────────────────────────
// A card holds real sentences, not one ellipsised line, so its height is
// measured from the words and clamped. The corners stop being a full pill once
// it grows past two lines — a 120px-tall stadium reads as a lozenge.
export const CARD_MIN_HEIGHT = 64;
export const CARD_MAX_HEIGHT = 200;
export const CARD_MAX_RADIUS = 30;
// When something is waiting behind the current notification, the current one
// is cut short — but never before it has been readable.
export const QUEUE_MIN_SHOW = 1600;
export const QUEUE_MAX = 3;
// Below this, the drag is a tap with a tremor in it.
export const DRAG_SLOP = 6;
// A notch iPhone reports 44–50pt of top inset; every Dynamic Island iPhone so
// far reports 59 or more (14 Pro/15: 59, 16 Pro: 62). 54 sits in the gap.
export const ISLAND_INSET_MIN = 54;

// ── the springs (springs.ts). Reanimated's {duration, dampingRatio} ──────────
export const DROP_SPRING = { duration: 1150, dampingRatio: 0.82 };
export const EXPAND_SPRING = { duration: 1000, dampingRatio: 0.8 };
export const REVEAL_SPRING = { duration: 700, dampingRatio: 1 };
export const COLLAPSE_SPRING = { duration: 660, dampingRatio: 0.92, velocity: 2 };
export const RETURN_SPRING = { duration: 1150, dampingRatio: 0.9 };
export const FADE_SPRING = { duration: 360, dampingRatio: 1 };
export const DRAG_SPRING = { duration: 560, dampingRatio: 0.7 };
export const REDUCED_FADE = { duration: 240, dampingRatio: 1 };

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const mix = (p, from, to) => from + (to - from) * p;

export function easeOutPower(p, power) {
  const n = clamp(p, 0, 1);
  return 1 - Math.pow(1 - n, power);
}

// The neck: zero at both ends, one hump in between, normalised so the hump
// peaks at exactly 1. Rise > fall means it swells late and snaps early —
// which is what a drop tearing off a surface does.
export function neckProfile(p, rise, fall) {
  const t = clamp(p, 0, 1);
  if (t <= 0 || t >= 1) return 0;
  const peak = rise / (rise + fall);
  const norm = Math.pow(peak, rise) * Math.pow(1 - peak, fall);
  return (Math.pow(t, rise) * Math.pow(1 - t, fall)) / norm;
}

export const gooBlur = (strength = GOO_STRENGTH) => mix(clamp(strength, 0, 1), GOO_BLUR_MIN, GOO_BLUR_MAX);

// Skia's ColorMatrix and SVG's feColorMatrix share a row layout and both take
// the offset column in 0–1 units, so the library's matrix transfers as-is:
// alpha' = gain·alpha − gain·threshold, i.e. a hard edge where the blur
// crosses `threshold`.
export function gooMatrix(gain = GOO_GAIN, threshold = GOO_THRESHOLD) {
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, gain, -gain * threshold]
    .map((n) => +n.toFixed(4)).join(' ');
}

// Is there a Dynamic Island above this page? The web cannot ask the phone, so
// this is the one inference the hardware leaves open: an installed iOS app
// (only standalone draws under the status bar — a Safari or Chrome tab never
// reaches it), upright, with an island-sized top inset. Anything else gets the
// honest fallback: the drop comes out of the top edge and nothing pretends to
// be hardware.
export function detectIsland({ ios, standalone, insetTop, portrait }) {
  return !!(ios && standalone && portrait && insetTop >= ISLAND_INSET_MIN);
}

export function islandLayout({ width, insetTop = 0, island = false, cardHeight = CARD_MIN_HEIGHT }) {
  const pillW = ISLAND_WIDTH;
  const pillH = ISLAND_HEIGHT;
  // With an island, the library's own placement. Without one, a virtual pill
  // sits just above the top of the page so the drop drips from the edge.
  const pillTop = island
    ? Math.max(insetTop - pillH - ISLAND_TOP, ISLAND_MIN_TOP)
    : Math.min(insetTop, 0) - pillH - 4;
  const pillBottom = pillTop + pillH;
  const cardW = Math.min(width - CARD_MARGIN * 2, CARD_MAX_WIDTH);
  const cardH = clamp(Math.round(cardHeight), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
  const cardTop = island ? pillBottom + CARD_GAP : Math.max(insetTop, 0) + 14;
  return {
    width,
    island,
    centerX: width / 2,
    islandWidth: pillW,
    islandHeight: pillH,
    islandTop: pillTop,
    islandBottom: pillBottom,
    islandRadius: pillH / 2,
    cardWidth: cardW,
    cardHeight: cardH,
    cardRadius: Math.min(cardH / 2, CARD_MAX_RADIUS),
    cardTop,
    cardLeft: (width - cardW) / 2,
    cardCenterY: cardTop + cardH / 2,
    dropSize: DROP_SIZE,
    neckWidth: NECK_WIDTH,
    height: cardTop + cardH + 96,
  };
}

// buildNotificationGeometry, plus one thing the library leaves out: the drag.
// There the finger moved only the words and left the black shape behind; here
// the whole card follows the thumb, so throwing it up carries it back into the
// island and the goo joins them again on the way.
export function islandGeometry({ drop, expand, layout, dragY = 0 }) {
  const grow = easeOutPower(clamp(drop / DROP_GROW_SPAN, 0, 1), DROP_GROW_POWER);
  const neck = neckProfile(drop / NECK_BREAK, NECK_RISE, NECK_FALL);
  const stretch = 1 + DROP_STRETCH * neck;
  const droplet = layout.dropSize * grow;

  const width = Math.min(mix(expand, droplet / stretch, layout.cardWidth), layout.width - EDGE_MARGIN * 2);
  const height = mix(expand, droplet * stretch, layout.cardHeight);
  const radius = Math.min(mix(expand, droplet * 0.5, layout.cardRadius), Math.min(width, height) / 2);

  const originY = layout.islandBottom - layout.islandHeight * 0.34;
  const centerY = mix(drop, originY, layout.cardCenterY) + dragY;
  const neckWidth = Math.min(layout.neckWidth, width) * neck;
  const neckY = layout.islandBottom - layout.islandHeight * 0.5;

  return {
    x: layout.centerX - width / 2,
    y: centerY - height / 2,
    width: Math.max(width, 0),
    height: Math.max(height, 0),
    radius: Math.max(radius, 0),
    neckX: layout.centerX - neckWidth / 2,
    neckY,
    neckWidth,
    neckHeight: Math.max(centerY - neckY, 0),
    offsetY: centerY - layout.cardCenterY,
    widthRatio: layout.cardWidth > 0 ? width / layout.cardWidth : 0,
  };
}

// The words: invisible until the card has room for them, rising out of a
// blur and a slight shrink, with a touch of the card's own overshoot.
export function contentStyle(geometry, reveal) {
  const p = clamp(reveal, 0, 1);
  const overshoot = clamp(geometry.widthRatio - 1, 0, 0.2);
  return {
    opacity: p,
    scale: mix(p, CONTENT_MIN_SCALE, 1) + overshoot * p,
    blur: +(8 * (1 - p)).toFixed(2),
    y: geometry.offsetY,
  };
}

// iOS's own resistance past a boundary: the further down he pulls, the less
// the card follows. Down is not a dismissal, so it gives, then refuses.
export function rubberband(over, dimension = 120, c = 0.55) {
  const a = Math.abs(over);
  return Math.sign(over) * (a * dimension * c) / (dimension + c * a);
}

export function dragOffset(dy) {
  return dy < 0 ? dy : rubberband(dy);
}

// Release: thrown if it travelled far enough up OR was moving up fast enough.
// `vy` is px/ms, negative is up.
export function releaseDecision({ dy, vy }) {
  return (dy < SWIPE_DISTANCE || vy < SWIPE_VELOCITY) ? 'dismiss' : 'return';
}

// ── the spring ───────────────────────────────────────────────────────────────
// Reanimated's duration-based spring settles in about `duration`. A damped
// oscillator with ω = 8.4/duration(s) settles to within ~0.2% by then for every
// damping ratio used above, which is close enough that the library's
// choreography (its delays are tuned against these durations) lands the same.
// Integrated per frame, not solved in closed form, so it can be retargeted
// mid-flight with its velocity intact — the interruptibility the whole
// gesture depends on.
export function springParams({ duration, dampingRatio }) {
  const omega = 8.4 / (duration / 1000);
  return { k: omega * omega, c: 2 * dampingRatio * omega };
}

export function createSpring(value = 0) {
  return { value, velocity: 0, target: value, k: 0, c: 0, startAt: 0, active: false, onDone: null };
}

// Aim a spring. `delay` is ms from `now`; an explicit `velocity` (units/s)
// replaces the current one, otherwise the spring keeps whatever it had.
export function aim(spring, target, cfg, now, { delay = 0, velocity, onDone } = {}) {
  const { k, c } = springParams(cfg);
  spring.target = target;
  spring.k = k;
  spring.c = c;
  spring.startAt = now + delay;
  spring.active = true;
  spring.onDone = onDone || null;
  const v = velocity ?? cfg.velocity;
  if (v != null) spring.pendingVelocity = v;
  return spring;
}

export function jump(spring, value) {
  spring.value = value;
  spring.target = value;
  spring.velocity = 0;
  spring.active = false;
  spring.onDone = null;
  spring.pendingVelocity = undefined;
}

// Advance to `now`. Returns true while it still has somewhere to go.
export function stepSpring(spring, dtMs, now) {
  if (!spring.active) return false;
  if (now < spring.startAt) return true;
  if (spring.pendingVelocity != null) { spring.velocity = spring.pendingVelocity; spring.pendingVelocity = undefined; }
  // fixed 1ms substeps: stable at 60Hz and 120Hz alike, and cheap for three springs
  let left = Math.min(dtMs, 64);
  while (left > 0) {
    const h = Math.min(1, left) / 1000;
    const a = -spring.k * (spring.value - spring.target) - spring.c * spring.velocity;
    spring.velocity += a * h;
    spring.value += spring.velocity * h;
    left -= 1;
  }
  if (Math.abs(spring.value - spring.target) < 5e-4 && Math.abs(spring.velocity) < 5e-3) {
    spring.value = spring.target;
    spring.velocity = 0;
    spring.active = false;
    const done = spring.onDone;
    spring.onDone = null;
    done?.();
    return false;
  }
  return true;
}

// ── what a notification says about itself ────────────────────────────────────
// Colour means something (his standing rule, 22 Sep): green is done, red is a
// problem, gold is Nova noting something, cyan is Nova herself speaking. A
// toast arrives as a bare sentence from ~270 call sites, so its tone is read
// from how the sentence OPENS — narrowly, and falling back to plain 'info'
// rather than guessing. A wrong green would be a lie; a missing one is not.
const WARN = /^(could ?n[o’']t|can[’']?t|cannot|failed|error|offline|backend unreachable|dictation:|not saved|nothing (?:was )?saved)/i;
const DONE_LEAD = /^(saved|filed|logged|added|synced|stashed|renamed|removed|applied|updated|recovered|found your|outbox synced|workout saved)\b/i;

export function toneOf(text) {
  const t = String(text || '').trim();
  if (WARN.test(t) || /\bfailed\b/i.test(t)) return 'warn';
  if (/✓\s*$/.test(t) || DONE_LEAD.test(t)) return 'done';
  return 'info';
}

// The mark carries the ✓; the sentence does not need to say it twice.
export const displayText = (text) => String(text || '').replace(/\s*✓\s*$/, '').trim();

// Normalise whatever a caller hands `notify` into one shape.
export function normalizeNotice(n, seq = 0) {
  const o = typeof n === 'string' ? { title: n } : { ...(n || {}) };
  const tone = o.tone || toneOf(o.title);
  return {
    id: o.id || `n${seq}`,
    title: displayText(o.title),
    message: o.message ? String(o.message) : '',
    tone,
    duration: o.duration === undefined ? AUTO_DISMISS : o.duration,
    minShow: o.minShow ?? QUEUE_MIN_SHOW,
    onPress: o.onPress || null,
    action: o.action || null,
    serif: !!o.serif,
  };
}

// What to do with a new arrival, given what is showing and what is waiting.
//  - the same words again: restart the clock, do not replay the drop
//  - nothing showing: show it
//  - otherwise: queue it (oldest dropped past QUEUE_MAX) and cut the current
//    one short — no sooner than its minShow
export function arrival({ current, queue, next }) {
  if (current && current.title === next.title && current.message === next.message) {
    return { kind: 'refresh', queue };
  }
  if (!current) return { kind: 'show', queue };
  const q = [...queue.filter((x) => x.id !== next.id), next];
  while (q.length > QUEUE_MAX) q.shift();
  return { kind: 'queue', queue: q };
}

// How long the current notification has left, given when it became readable.
export function remainingLife({ notice, shownAt, now, queued }) {
  if (notice.duration === null && !queued) return null; // stays until thrown away
  const full = notice.duration === null ? Infinity : notice.duration;
  const life = queued ? Math.min(full, notice.minShow) : full;
  return Math.max(0, shownAt + life - now);
}
