// THE ROLE ACTIONS (his 11 Oct note: "they should also perform actions
// relating to their role like coach lifting the barbell, doing pushups").
//
// Same shape as src/agentWorld/acts.js: `(rig, t01, ctx) => void`, writing
// TARGETS through ctx (head, body, arm, prop) and never the rig itself;
// acts.js's applyOverlay eases every handle through the rig's own pose
// store, so an action that is cut short eases out. A few of the Org map's
// own acts are reused as they are (stack-chip, close-ledger, chalk-hands...).
//
// Two handles are this view's own, applied by stageCore after the overlay:
//   ctx.prop('bar', w)        the Coach's bar rides between his hands
//   ctx.prop('tool', {kind, k, at}) a small hand prop (magnifier, clipboard,
//                             open book, knife) in a hand, faded in by k
// Rig-local units: the being stands about 1.1 tall, shoulders near y 0.49
// at x ±0.23, and +z faces the viewer.
import { ACT_FRAMES } from '../agentWorld/acts.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const env = (t, a = 0.15, b = 0.85) => Math.min(ease(t / a), ease((1 - t) / (1 - b)));
const bump = (t, c, w) => { const d = Math.abs(t - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI); };
// a value along keyed segments: [[t, v], ...], smoothstepped between keys
const keys = (t, ks) => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) { const u = ease((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])); return ks[i - 1][1] + (ks[i][1] - ks[i - 1][1]) * u; }
  }
  return ks[ks.length - 1][1];
};

// ---- the Coach --------------------------------------------------------------
// a clean and press: bend and grip the bar where it lies, pull it to the
// shoulders, press it up in front of the face, and lower it back down. The
// bar's path is VERTICAL and a hand in front of him (his 11 Oct note: it
// went through his body): the hands are written in the hinged body's frame,
// with the hinge undone, so the bend never swings the bar into his chest.
// The bar itself rides the hand bones (./propRig.js, mode `hands`).
function cleanPress(rig, t, ctx) {
  const Y = keys(t, [[0, 0.1], [0.1, 0.1], [0.3, 0.44], [0.42, 0.44], [0.55, 0.72], [0.68, 0.72], [0.8, 0.44], [0.88, 0.44], [1, 0.1]]);
  const Z = 0.42;
  const grip = env(t, 0.08, 0.92);
  // the hinge: down to the bar, up with it, a dip before the press
  const bend = keys(t, [[0, 0], [0.1, 0.42], [0.22, 0.15], [0.3, 0], [0.44, 0], [0.48, 0.05], [0.55, -0.03], [0.68, -0.03], [0.8, 0], [0.9, 0.42], [1, 0]]);
  const drop = keys(t, [[0, 0], [0.1, -0.08], [0.3, 0], [0.44, 0], [0.48, -0.04], [0.55, 0], [0.88, 0], [0.92, -0.07], [1, 0]]);
  ctx.body({ pitch: bend, y: drop });
  const c = Math.cos(bend), sn = Math.sin(bend), yw = Y - drop;
  const yl = yw * c + Z * sn, zl = -yw * sn + Z * c;
  const over = Y > 0.6 ? 1 : 0;
  ctx.arm('L', [-0.2, yl, zl], over ? [-1, 0.2, -0.3] : [-0.25, -0.5, -1], [0, 1, 0.3], grip);
  ctx.arm('R', [0.2, yl, zl], over ? [1, 0.2, -0.3] : [0.25, -0.5, -1], [0, 1, 0.3], grip);
  // the face strains under it and grins at the lockout
  ctx.head(0, keys(t, [[0, 0.2], [0.14, 0.25], [0.3, 0], [0.55, -0.12], [0.68, -0.12], [0.8, 0], [1, 0.1]]) * env(t, 0.1, 0.9), 0);
  ctx.face({ smile: bump(t, 0.62, 0.1) });
}
// push-ups, side on, a step away from the bar: down into a plank, three
// reps, and back up (the track walks him there and back)
function pushups(rig, t, ctx) {
  const k = env(t, 0.16, 0.74);
  const rep = Math.max(0, Math.sin(clamp01((t - 0.18) / 0.52) * Math.PI * 3));
  const th = (1.3 + 0.14 * rep) * k;
  ctx.body({ pitch: th });
  const s = Math.sin(th), c = Math.cos(th);
  ['L', 'R'].forEach((side) => {
    const sx = side === 'L' ? -1 : 1;
    // a hand on the floor under each shoulder (the floor seen from the tilted body)
    const zf = 0.49 * s + 0.04;
    ctx.arm(side, [sx * 0.26, zf * s, zf * c], [sx, 0, -0.6], [0, -1, 0.2], k);
  });
  ctx.head(0, -0.25 * k, 0);
}
// back squats: the bar comes up off the floor, over his head onto his
// shoulders (the hands follow it there, ./propRig.js), three reps, and
// back down to the floor
function squats(rig, t, ctx) {
  const k = env(t, 0.22, 0.78);
  const rep = Math.max(0, Math.sin(clamp01((t - 0.24) / 0.52) * Math.PI * 3));
  ctx.body({ y: -0.12 * rep * k, pitch: 0.22 * rep * k });
  ctx.head(0, -0.08 * rep * k, 0);
  ctx.face({ smile: 0.3 * bump(t, 0.5, 0.3) });
}
// barbell lunges round the slab: the bar on his back (worn), each step a
// lunge (the drop is the gait's, stageCore); a grin when he is home
function lungeRound(rig, t, ctx) {
  ctx.head(0, -0.06 * env(t, 0.15, 0.85), 0);
  ctx.face({ smile: bump(t, 0.9, 0.06) * 0.6 });
}
// dragging the bar round by one end: leaning into it, and three stalls
// where he heaves at it, face screwed up
const DRAG_STALLS = [[1.6, 2.3], [4.4, 5.2], [7.4, 7.9]].map(([a, b]) => [a / 9.4, b / 9.4]);
function dragRound(rig, t, ctx) {
  const k = env(t, 0.06, 0.92);
  let heave = 0;
  for (const [a, b] of DRAG_STALLS) heave = Math.max(heave, bump(t, (a + b) / 2, (b - a) / 2 + 0.02));
  const tug = Math.sin(t * 9.4 * 9) * 0.5 + 0.5;
  ctx.body({ pitch: (0.16 + 0.2 * heave * tug) * k, roll: -0.04 * heave * k });
  ctx.head(0.15 * heave * Math.sin(t * 40) * k, -0.1 * k, 0);
  ctx.face({ lid: 0.3 * heave * k, smile: 0 });
  // the free hand flails a little with each heave
  ctx.arm('L', [-0.3, 0.42 + 0.08 * heave * tug, 0.1], [-1, -0.2, -0.4], [1, 0, 0.2], heave * k);
}

// ---- the Librarian ---------------------------------------------------------
// an open book held up to read, a page turned at the half
function readBook(rig, t, ctx) {
  const k = env(t, 0.15, 0.85), turn = bump(t, 0.55, 0.1);
  ctx.arm('L', [-0.1, 0.44, 0.3], [-1, -0.5, -0.4], [0.3, 0.3, 1], k);
  ctx.arm('R', [0.1 - turn * 0.12, 0.44 + turn * 0.05, 0.3 + turn * 0.04], [1, -0.5, -0.4], [-0.3, 0.3, 1], k);
  ctx.prop('tool', { kind: 'book', k, at: 'both' });
  ctx.head(0.05 * Math.sin(t * Math.PI * 6) * k, 0.3 * k, 0);
}
// a book taken from the drawer side and reached up onto a high shelf
function shelve(rig, t, ctx) {
  const k = env(t, 0.12, 0.88);
  const up = keys(t, [[0, 0], [0.3, 0], [0.5, 1], [0.66, 1], [0.8, 0]]);
  ctx.arm('R', [0.26 + 0.05 * up, 0.3 + 0.62 * up, 0.18 + 0.05 * up], [1, -0.3, -0.5], [0, 0.3, 1], k);
  ctx.prop('tool', { kind: 'book', k: t < 0.66 ? k : 0, at: 'R' });
  ctx.body({ roll: -0.08 * up * k, y: 0.02 * up });
  ctx.head(0.25 * up * k, -0.35 * up * k, 0);
}

// ---- the CFO -----------------------------------------------------------------
// counting coins from hand to hand, a nod with each
function countCoins(rig, t, ctx) {
  const k = env(t, 0.12, 0.88);
  const ph = (t * 5) % 1, hop = Math.sin(ph * Math.PI);
  ctx.arm('R', [0.22 - 0.16 * ph, 0.36 + 0.12 * hop, 0.34], [1, -0.5, -0.4], [-0.6, 0.6, 0], k);
  const at = [0.22 - 0.24 * ph, 0.44 + 0.2 * hop, 0.36];
  ctx.prop('chip', { k: t > 0.12 && t < 0.88 ? 1 : 0, at });
  ctx.head(-0.1 * k, (0.18 + 0.06 * hop) * k, 0);
}

// ---- the Researcher ---------------------------------------------------------
// the magnifier up to the eye, swept slowly along the page of the air
function magnify(rig, t, ctx) {
  const k = env(t, 0.15, 0.85), sw = Math.sin(t * Math.PI * 3);
  ctx.arm('R', [0.14 + 0.08 * sw, 0.66 + 0.04 * Math.cos(t * Math.PI * 3), 0.38], [1, -0.6, -0.3], [0, 0, 1], k);
  ctx.prop('tool', { kind: 'magnifier', k, at: 'R' });
  ctx.head(0.25 * sw * k, -0.05 * k, 0);
}
// bent over the floor with the magnifier, following a trail
function magnifyLow(rig, t, ctx) {
  const k = env(t, 0.2, 0.85), sw = Math.sin(t * Math.PI * 2);
  ctx.body({ pitch: 0.35 * k, x: 0.04 * sw * k });
  ctx.arm('R', [0.18 + 0.1 * sw, 0.22, 0.42], [1, -0.4, -0.5], [0, -1, 0.2], k);
  ctx.prop('tool', { kind: 'magnifier', k, at: 'R' });
  ctx.head(0.2 * sw * k, 0.3 * k, 0);
}

// ---- the Guardian -------------------------------------------------------------
// standing watch: the lantern raised to see by, the head turning slowly
function watchPost(rig, t, ctx) {
  const k = env(t, 0.15, 0.85);
  ctx.arm('L', [-0.18, 0.78, 0.3], [-1, -0.5, -0.3], [1, 0, 0], k);
  ctx.head(0.6 * Math.sin(t * Math.PI * 2) * k, -0.06 * k, 0);
  ctx.body({ pitch: -0.04 * k });
}
// patrolling (the walk is the track's): the lantern carried out in front
function patrolLamp(rig, t, ctx) {
  const k = env(t, 0.1, 0.9);
  ctx.arm('L', [-0.2, 0.45, 0.36], [-1, -0.5, -0.3], [1, 0, 0], k);
  ctx.head(0.3 * Math.sin(t * Math.PI * 4) * k, 0, 0);
}

// ---- the Commander ------------------------------------------------------------
// directing: the arm out and pointing, swept from one quarter to another
function direct(rig, t, ctx) {
  const k = env(t, 0.15, 0.85), a = keys(t, [[0, -0.2], [0.35, -0.2], [0.5, 0.9], [0.8, 0.9], [1, 0.4]]);
  ctx.arm('R', [0.2 + 0.25 * Math.cos(a), 0.72 + 0.04 * Math.sin(t * 20) * bump(t, 0.6, 0.15), 0.25 + 0.25 * Math.sin(a)], [1, -0.4, -0.3], [-0.2, -0.3, -1], k);
  ctx.body({ roll: 0.04 * k });
  ctx.head(0.35 * Math.cos(a) * k, -0.08 * k, 0);
}
// a clipboard in the left hand, the right ticking it off
function clipboard(rig, t, ctx) {
  const k = env(t, 0.15, 0.85), tick = bump((t * 4) % 1, 0.5, 0.25);
  ctx.arm('L', [-0.06, 0.42, 0.32], [-1, -0.5, -0.4], [0.2, 0.3, 1], k);
  ctx.arm('R', [0.06 + 0.03 * tick, 0.46 - 0.02 * tick + 0.04 * ((t * 4) % 1), 0.36], [1, -0.5, -0.4], [-0.3, 0, -1], k);
  ctx.prop('tool', { kind: 'clipboard', k, at: 'L' });
  ctx.head(-0.05 * k, 0.3 * k, 0);
}

// ---- Meal Prep -----------------------------------------------------------------
// stirring the pot: the ladle in the hand, round and round
function stir(rig, t, ctx) {
  const k = env(t, 0.15, 0.85), a = t * Math.PI * 8;
  const pot = rig.props && rig.props.pot ? rig.props.pot.position : { x: 0, y: 0.3, z: 0.3 };
  ctx.arm('R', [pot.x + 0.04 * Math.cos(a), pot.y + 0.26, pot.z + 0.04 * Math.sin(a)], [1, -0.5, -0.3], [-0.5, 0, 0.5], k);
  ctx.prop('ladle', k);
  ctx.body({ roll: 0.03 * Math.sin(a) * k });
  ctx.head(0, 0.25 * k, 0.05 * Math.sin(a * 0.5) * k);
}
// chopping: the knife hand up and down, quick
function chop(rig, t, ctx) {
  const k = env(t, 0.12, 0.88), c = Math.abs(Math.sin(t * Math.PI * 10));
  ctx.arm('R', [0.24, 0.3 + 0.1 * c, 0.34], [1, -0.4, -0.5], [-1, 0, 0], k);
  ctx.arm('L', [0.02, 0.26, 0.36], [-1, -0.4, -0.5], [0, -1, 0], k * 0.8);
  ctx.prop('tool', { kind: 'knife', k, at: 'R' });
  ctx.head(0.15 * k, 0.32 * k, 0);
}

// ---- the Leader ----------------------------------------------------------------
// presenting: the free hand opens out to an imagined room, palm up, twice
function present(rig, t, ctx) {
  const k = env(t, 0.12, 0.88), g = keys(t, [[0, 0], [0.25, 1], [0.45, 0.4], [0.65, 1], [0.85, 0.3], [1, 0]]);
  ctx.arm('R', [0.22 + 0.2 * g, 0.42 + 0.14 * g, 0.24 + 0.08 * g], [1, -0.6, -0.2], [-0.3, 1, 0.3], k);
  ctx.body({ roll: 0.05 * g * k, yaw: 0.15 * g * k });
  ctx.head(0.2 * g * k, -0.04 * k, 0);
}

// ---- the Watcher ---------------------------------------------------------------
// a hand at the brow, scanning far off
function browScan(rig, t, ctx) {
  const k = env(t, 0.15, 0.85);
  ctx.arm('R', [0.12, 0.98, 0.26], [1, -0.2, -0.3], [0, -1, 0.2], k);
  ctx.head(0.55 * Math.sin(t * Math.PI * 2) * k, -0.12 * k, 0);
}

// ---- Practice -----------------------------------------------------------------
// rehearsing a line: both hands talking, a nod on each beat, the grin
function rehearse(rig, t, ctx) {
  const k = env(t, 0.1, 0.9), a = t * Math.PI * 7;
  ctx.arm('R', [0.24 + 0.06 * Math.sin(a), 0.48 + 0.06 * Math.abs(Math.cos(a)), 0.3], [1, -0.6, -0.3], [-0.3, 1, 0.4], k);
  ctx.arm('L', [-0.24 + 0.05 * Math.sin(a + 1.4), 0.44 + 0.05 * Math.abs(Math.cos(a + 1.4)), 0.3], [-1, -0.6, -0.3], [0.3, 1, 0.4], k * 0.9);
  ctx.head(0.15 * Math.sin(a * 0.5) * k, 0.1 * Math.max(0, Math.sin(a)) * k, 0.06 * Math.sin(a * 0.3) * k);
  ctx.face({ smile: 0.5 * k });
}
function bow(rig, t, ctx) { ACT_FRAMES['gag:practice'](rig, t, { ...ctx, role: 'host' }); }

// ---- each one's own way round (the tracks are ./plays.js's) --------------
// the Librarian notices the book is gone, and bends to pick it up
function dropBook(rig, t, ctx) {
  const look = bump(t, 0.43, 0.06), pick = keys(t, [[0.68, 0], [0.72, 1], [0.82, 1], [0.86, 0]]);
  ctx.head(-0.5 * look, 0.25 * look + 0.35 * pick, 0);
  ctx.body({ pitch: 0.42 * pick, y: -0.05 * pick });
  if (pick > 0.01) ctx.arm('R', [0.1, 0.12, 0.32], [1, -0.3, -0.5], [0, -1, 0.2], pick);
  ctx.face({ lid: 0.2 * look });
}
// the CFO's audit: a coin tossed hand to hand as he walks (it jingles), and
// a tick on the ledger at each corner
const AUDIT_STOPS = [[1.05, 1.6], [4.35, 4.9]].map(([a, b]) => [a / 5.9, b / 5.9]);
function audit(rig, t, ctx) {
  let tick = 0;
  for (const [a, b] of AUDIT_STOPS) tick = Math.max(tick, keys(t, [[a, 0], [a + 0.02, 1], [b - 0.02, 1], [b, 0]]));
  ctx.prop('jingle', env(t, 0.05, 0.95) * (1 - tick));
  if (tick > 0.01) {
    const tap = Math.abs(Math.sin(t * 5.9 * 14));
    ctx.arm('R', [-0.04, 0.38 + 0.04 * tap, 0.3], [1, -0.5, -0.4], [-0.3, 0, -1], tick);
    ctx.head(-0.1 * tick, 0.3 * tick, 0);
  }
}
// the Guardian's sentry round: the lantern carried low, raised at each corner
const SENTRY_STOPS = [[1.6, 2.8], [5.3, 6.5]].map(([a, b]) => [a / 8.1, b / 8.1]);
function sentry(rig, t, ctx) {
  const k = env(t, 0.04, 0.96);
  let up = 0;
  for (const [a, b] of SENTRY_STOPS) up = Math.max(up, keys(t, [[a, 0], [a + 0.03, 1], [b - 0.03, 1], [b, 0]]));
  ctx.arm('L', [-0.2, 0.44 + 0.36 * up, 0.34 - 0.04 * up], [-1, -0.5, -0.3], [1, 0, 0], k);
  ctx.head(0.55 * Math.sin(t * Math.PI * 6) * up, -0.08 * up, 0);
}
// the Leader's stride: a word to the room at the edge
function stride(rig, t, ctx) {
  const k = keys(t, [[0.29, 0], [0.33, 1], [0.6, 1], [0.66, 0]]);
  if (k > 0.01) present(rig, clamp01((t - 0.29) / 0.37), ctx);
}

export const ROLE_FRAMES = {
  'clean-press': cleanPress, pushups, squats, 'chalk-hands': ACT_FRAMES['chalk-hands'],
  'read-book': readBook, shelve, 'dust-shelf': ACT_FRAMES['dust-shelf'],
  'count-coins': countCoins, 'stack-chip': ACT_FRAMES['stack-chip'], 'close-ledger': ACT_FRAMES['close-ledger'],
  magnify, 'magnify-low': magnifyLow, scribble: ACT_FRAMES.scribble,
  'watch-post': watchPost, 'patrol-lamp': patrolLamp, 'polish-shield': ACT_FRAMES['polish-shield'],
  direct, clipboard, 'scan-horizon': ACT_FRAMES['scan-horizon'],
  stir, chop, 'taste-ladle': ACT_FRAMES['taste-ladle'],
  present,
  'brow-scan': browScan, 'toss-popcorn': ACT_FRAMES['toss-popcorn'],
  rehearse, bow,
  'lunge-round': lungeRound, 'drag-round': dragRound, 'drop-book': dropBook, audit, sentry, stride,
};

// Who does what lives in ./plays.js (ROLE), beside the tracks.

// The walk: arms swing opposite the feet while he covers ground, so a run
// is a run and never a slide. Written only for an arm the action left free.
export function walkArms(rig, ctx, phase, gait, freeL, freeR) {
  if (gait < 0.02 || !rig.arms) return;
  [['L', -1, freeL], ['R', 1, freeR]].forEach(([side, s, free]) => {
    if (!free) return;
    const sh = rig.arms[side === 'L' ? 'SL' : 'SR'];
    const sw = Math.sin(phase + (s > 0 ? Math.PI : 0));
    ctx.arm(side, [s * (Math.abs(sh.x) + 0.07), sh.y - 0.24 + 0.05 * Math.abs(sw), 0.2 * sw], [s, -0.2, -1], [-s, 0, 0.2], gait * 0.9);
  });
}
