// THE ACTS (AGENT-WORLD-PLAN §9d): what each act the life engine names looks
// like on a rig from beings.js. life.js decides WHICH act (as data: a name,
// a duration, the handles it moves); this file says HOW it moves them.
//
// Every entry is `(rig, t01, ctx) => void`, called once a frame with the
// act's progress 0..1. 'work' calls the rig's working tell and nothing else;
// every other act calls the tell with working = false first (so the being
// keeps its own resting pose) and then asks for its gesture through `ctx`:
//   ctx.head(yaw, pitch, roll)            additive head turn
//   ctx.body({ pitch, roll, yaw, x, y, sit, gait })   the whole rig
//   ctx.arm('L'|'R', H, pole, palm, w)    a hand to H (rig-local), weight w
//   ctx.prop(name, value)                 a prop handle (see applyOverlay)
//   ctx.face({ lid, dim })                sleep only
//   ctx.fx(name, v)                       a small effect (the chalk puff)
// A frame writes TARGETS only and never touches the rig itself; the scene
// then calls applyOverlay, which eases every handle through the rig's own
// pose store, so an act that is interrupted eases out instead of cutting.
// server/test/agentWorldActs.test.js holds each frame to the handles its
// ACTS entry lists, and holds the working tells out of this table.
//
// Pure: no imports, no network, no model, no clock but what ctx hands in.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// in, hold, out: 0 at both ends, 1 between a and b
const env = (t, a = 0.2, b = 0.8) => Math.min(ease(t / a), ease((1 - t) / (1 - b)));
// a single soft bump centred on c, half-width w
const bump = (t, c, w) => { const d = Math.abs(t - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI); };
const S = (rig, side) => (rig.arms ? rig.arms[side === 'L' ? 'SL' : 'SR'] : { x: 0, y: 0.47, z: 0 });

// the working tell, and the resting pose every other act layers on
const tell = (rig, ctx, working) => { if (rig.tell) rig.tell(ctx.now, !!working, ctx.rm); };
const still = (rig, t, ctx) => { tell(rig, ctx, false); };

// two nods (or one), as a head pitch
const nods = (t, n) => Math.max(0, Math.sin(t * Math.PI * 2 * n)) * env(t, 0.1, 0.9);

// the beings that hold their own thing out in front with both hands (the
// book, the pot, the orb): a stretch lifts only the right arm
const ONE_HAND = new Set(['researcher', 'mealprep', 'leader']);

export const ACT_FRAMES = {
  // ---- universal ------------------------------------------------------
  rest: still,
  // waiting on him: facing the camera (the scene), weight shifting a hair
  wait: (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ roll: 0.02 * Math.sin(ctx.now * 0.9) }); },
  'glance-marker': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0.08, -0.34 * env(t, 0.3, 0.7), 0); },
  sigh: (rig, t, ctx) => { still(rig, t, ctx); const k = bump(t, 0.5, 0.5); ctx.body({ y: -0.03 * k, pitch: 0.07 * k }); },
  // asleep on its rest spot: the eyes down to a third, the lids half shut
  sleep: (rig, t, ctx) => { still(rig, t, ctx); ctx.face({ lid: 0.55, dim: 0.7 }); },
  // arms out wide and up (the helmet is taller than an arm is long, so
  // "overhead" is out past the ears, not over the crown)
  stretch: (rig, t, ctx) => {
    still(rig, t, ctx);
    const k = env(t, 0.3, 0.7);
    ['L', 'R'].forEach((side) => {
      if (side === 'L' && ONE_HAND.has(ctx.id)) return;
      const s = side === 'L' ? -1 : 1, sh = S(rig, side);
      ctx.arm(side, [s * (Math.abs(sh.x) + 0.25), sh.y + 0.27, 0.02], [s, -0.4, -0.5], [0, 1, 0.2], k);
    });
  },
  work: (rig, t, ctx) => { tell(rig, ctx, true); },
  // the delivery: the walks are the scene's; at the post, a bow as it sets
  // the thing down (the plaza pulses as it lands)
  deliver: (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.place === 'plaza') ctx.body({ pitch: 0.3 * env(t, 0.25, 0.6) });
  },
  patrol: still,
  // his answer: turned to the camera (the scene), one nod
  thanks: (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, 0.24 * nods(t, 1), 0); },
  'visit-walk': still,
  'visit-face': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, -0.04, 0.1 * env(t)); },
  'visit-nod': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, 0.2 * nods(t, 2), 0); },

  // ---- Commander ------------------------------------------------------
  'scan-horizon': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0.7 * Math.sin(t * Math.PI * 2) * env(t, 0.1, 0.9), -0.08 * env(t), 0); },
  // the crest swings once, damped, and settles on nothing in particular
  'check-compass': (rig, t, ctx) => { still(rig, t, ctx); ctx.prop('rose', 0.7 * Math.sin(t * Math.PI * 3) * (1 - t)); },
  // two steps along the tile front and back
  pace: (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ x: 0.16 * Math.sin(t * Math.PI * 2), gait: env(t, 0.1, 0.9) }); },
  // the free hand to the small of the back
  'at-ease': (rig, t, ctx) => { still(rig, t, ctx); ctx.arm('R', [0.12, 0.3, -0.22], [0.7, 0, -0.6], [0, 0, -1], env(t)); },
  // host: a salute to the visitor's face
  'gag:commander': (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.role === 'host') ctx.arm('R', [0.17, 0.96, 0.3], [1, -0.2, 0.1], [-0.4, -0.3, -1], env(t, 0.2, 0.75));
  },

  // ---- Coach --------------------------------------------------------------
  // two claps in front of the chest, and a puff of chalk off the second
  'chalk-hands': (rig, t, ctx) => {
    still(rig, t, ctx);
    const k = env(t, 0.2, 0.85), clap = Math.max(bump(t, 0.42, 0.12), bump(t, 0.64, 0.12));
    const g = 0.03 + 0.09 * (1 - clap);
    ctx.arm('L', [-g, 0.42, 0.32], [-1, -0.3, -0.4], [1, 0, 0], k);
    ctx.arm('R', [g, 0.42, 0.32], [1, -0.3, -0.4], [-1, 0, 0], k);
    ctx.fx('puff', ease((t - 0.62) / 0.1) * (1 - ease((t - 0.7) / 0.3)));
  },
  // sat on its bench, leaning back a little (the seat is the scene's)
  'sit-bench': (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ pitch: -0.06 * env(t) }); },
  // turned to the rack: a tap on the racked bar, twice. Never lifts it.
  'tap-racked-bar': (rig, t, ctx) => {
    still(rig, t, ctx);
    const d = ctx.dock || [0.04, 0.57, 0.34], tap = 0.03 * (bump(t, 0.5, 0.1) + bump(t, 0.68, 0.1));
    ctx.arm('R', [d[0] + 0.05, d[1] + 0.05 - tap, d[2] - 0.04], [1, -0.4, -0.6], [0, -1, 0], env(t, 0.3, 0.85));
  },
  // host: a double-biceps at the visitor; the visitor answers, smaller
  'gag:coach': (rig, t, ctx) => {
    still(rig, t, ctx);
    const host = ctx.role === 'host', k = host ? env(t, 0.15, 0.6) : env((t - 0.35) / 0.65, 0.3, 0.75) * 0.7;
    ['L', 'R'].forEach((side) => {
      if (!host && ONE_HAND.has(ctx.id) && side === 'L') return;
      const s = side === 'L' ? -1 : 1;
      ctx.arm(side, [s * (host ? 0.44 : 0.4), host ? 0.7 : 0.62, 0.08], [s, -0.9, 0.1], [-s, 0, 0.3], k);
    });
  },

  // ---- CFO ------------------------------------------------------------------
  // one chip onto the pile: the hand goes to the stack with it, and back
  'stack-chip': (rig, t, ctx) => {
    still(rig, t, ctx);
    const go = ease(t / 0.45), down = bump(t, 0.55, 0.12);
    ctx.arm('R', [0.3 + 0.1 * go, 0.3 - 0.05 * go - 0.03 * down, 0.1 + 0.06 * go], [0.4, -0.2, -1], [0, -1, 0], env(t, 0.3, 0.8));
    ctx.prop('chip', { k: t > 0.1 && t < 0.9 ? 1 : 0, at: t < 0.55 ? 'handR' : [0.42, 0.2, 0.16] });
  },
  'fix-bowtie': (rig, t, ctx) => { still(rig, t, ctx); ctx.arm('R', [0.04 + 0.015 * Math.sin(t * Math.PI * 6), 0.5, 0.27], [1, -0.5, -0.5], [-0.3, 0, -1], env(t, 0.3, 0.75)); },
  // two pats on the ledger's cover
  'close-ledger': (rig, t, ctx) => {
    still(rig, t, ctx);
    const pat = 0.025 * (bump(t, 0.45, 0.1) + bump(t, 0.65, 0.1));
    ctx.arm('R', [-0.04, 0.37, 0.32 + pat], [1, -0.5, -0.6], [-0.6, 0, -1], env(t, 0.3, 0.85));
  },
  'look-at-safe': (rig, t, ctx) => { still(rig, t, ctx); const a = ctx.aim('safe'); ctx.head(a.yaw * env(t), a.pitch * env(t), 0); },
  // host: counts the visitor's chips: a point, then a shrug
  'gag:cfo': (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.role !== 'host') return;
    if (t < 0.5) ctx.arm('R', [0.16, 0.46, 0.44], [1, -0.3, -0.5], [-1, 0, 0], env(t / 0.5, 0.3, 0.8));
    else ctx.arm('R', [0.36, 0.34, 0.14], [1, -0.6, 0], [0, 1, 0], env((t - 0.5) / 0.5, 0.3, 0.7));
  },

  // ---- Guardian ---------------------------------------------------------
  // still, the lantern low and steady: nothing moves
  'stand-watch': still,
  // turned slowly toward one neighbouring district, and back
  'turn-to-district': (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ yaw: 0.75 * env(t, 0.35, 0.65) }); },
  // small circles over the shield
  'polish-shield': (rig, t, ctx) => {
    still(rig, t, ctx);
    const a = t * Math.PI * 6;
    ctx.arm('R', [0.03 + 0.04 * Math.cos(a), 0.37 + 0.04 * Math.sin(a), 0.31], [1, -0.4, -0.5], [-0.3, 0, -1], env(t, 0.25, 0.8));
  },
  // host: the lantern raised to light the visitor's face
  'gag:guardian': (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.role === 'host') ctx.arm('L', [-0.1, 0.62, 0.38], [-1, -0.5, -0.3], [1, 0, 0], env(t, 0.25, 0.7));
  },

  // ---- Researcher -------------------------------------------------------
  'close-book': (rig, t, ctx) => { still(rig, t, ctx); ctx.prop('book', { close: env(t, 0.3, 0.7) }); },
  'look-up': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0.1 * env(t), -0.5 * env(t, 0.3, 0.7), 0); },
  // a note into the satchel at the left hip, the book held in the left
  scribble: (rig, t, ctx) => {
    still(rig, t, ctx);
    const w = 0.02 * Math.sin(t * Math.PI * 10) * env(t, 0.35, 0.7);
    ctx.arm('R', [-0.24 + w, 0.28, 0.24], [1, -0.4, -0.3], [-0.5, 0, -1], env(t, 0.3, 0.8));
  },
  // the focus ring turned a little each way, the head tilted to it
  'adjust-lens': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, 0, 0.09 * env(t)); ctx.prop('lens', 0.5 * Math.sin(t * Math.PI * 2) * env(t, 0.1, 0.9)); },
  // host: the book shown to the visitor, and a line tapped
  'gag:researcher': (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.role !== 'host') return;
    ctx.prop('book', { lift: 0.08 * env(t, 0.2, 0.8), tilt: 0.55 * env(t, 0.2, 0.8), tap: bump(t, 0.5, 0.12) + bump(t, 0.66, 0.12) });
  },

  // ---- Watcher --------------------------------------------------------------
  // one kernel out of the bucket, up, and eaten
  'toss-popcorn': (rig, t, ctx) => {
    still(rig, t, ctx);
    const k = env(t, 0.2, 0.85);
    const up = ease((t - 0.3) / 0.2);
    ctx.arm('R', [0.12 - 0.02 * up, 0.3 + 0.2 * up, 0.3], [1, -0.5, -0.4], [0, 1, 0], k);
    const fly = clamp01((t - 0.52) / 0.3);
    const at = t < 0.52 ? 'handR' : [0.1 - 0.1 * fly, 0.52 + 0.3 * Math.sin(fly * Math.PI) + 0.12 * fly, 0.3 - 0.02 * fly];
    ctx.prop('popcorn', { k: t > 0.25 && t < 0.82 ? 1 : 0, at });
  },
  'lean-back': (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ pitch: -0.17 * env(t, 0.3, 0.7) }); },
  // the headphones lifted off the crown, and set back
  'headphones-off-on': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, 0, -0.08 * env(t)); ctx.prop('headphones', env(t, 0.3, 0.7)); },
  // tapping along: a small bob in time
  'tap-foot': (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ y: 0.014 * Math.abs(Math.sin(t * Math.PI * 4)) * env(t, 0.1, 0.9) }); },
  // host: one kernel held out; the visitor takes it (and carries it home)
  'gag:watcher': (rig, t, ctx) => offer(rig, t, ctx, 'popcorn'),

  // ---- Librarian ------------------------------------------------------------
  // the open drawer pushed shut, and let open again
  'shut-drawer': (rig, t, ctx) => {
    still(rig, t, ctx);
    const k = env(t, 0.35, 0.75);
    ctx.arm('R', [0.08, 0.3, 0.3 - 0.07 * k], [1, -0.4, -0.5], [0, 0, -1], env(t, 0.25, 0.85));
    ctx.prop('drawer', k);
  },
  'align-books': (rig, t, ctx) => {
    still(rig, t, ctx);
    const tap = 0.025 * (bump(t, 0.45, 0.1) + bump(t, 0.65, 0.1));
    ctx.arm('R', [-0.26, 0.37 - tap, 0.07], [1, -0.2, -0.6], [0, -1, 0], env(t, 0.3, 0.85));
  },
  'dust-shelf': (rig, t, ctx) => {
    still(rig, t, ctx);
    ctx.arm('R', [0.1 + 0.12 * Math.sin(t * Math.PI * 4), 0.58, 0.3], [1, -0.4, -0.4], [0, 0, 1], env(t, 0.2, 0.85));
  },
  // a peer over the spectacles: the head dips and comes back
  'adjust-spectacles': (rig, t, ctx) => { still(rig, t, ctx); ctx.head(0, 0.14 * bump(t, 0.5, 0.35), 0.05 * env(t)); },
  // host: an index card held out; the visitor takes it and holds it up to read
  'gag:librarian': (rig, t, ctx) => {
    if (ctx.role === 'host') { offer(rig, t, ctx, 'card'); return; }
    still(rig, t, ctx);
    const reach = env(t / 0.55, 0.4, 0.9), read = env((t - 0.55) / 0.45, 0.25, 0.8);
    if (t < 0.55) ctx.arm('R', [0.1, 0.44, 0.42], [1, -0.4, -0.5], [0, 0, 1], reach);
    else ctx.arm('R', [0.07, 0.64, 0.36], [1, -0.6, -0.4], [0, 0, -1], read);
    ctx.prop('card', { k: t >= 0.5 && t < 0.97 ? 1 : 0, at: 'handR' });
  },

  // ---- Meal Prep ------------------------------------------------------------
  // the ladle lifted out of the pot to taste; no stirring
  'taste-ladle': (rig, t, ctx) => {
    still(rig, t, ctx);
    const k = env(t, 0.3, 0.75);
    ctx.arm('R', [0.1, 0.62, 0.32], [1, -0.6, -0.4], [-0.5, 0, -1], k);
    ctx.prop('ladle', k);
  },
  'wipe-counter': (rig, t, ctx) => {
    still(rig, t, ctx);
    const a = t * Math.PI * 6;
    ctx.arm('R', [0.16 + 0.07 * Math.cos(a), 0.3, 0.36 + 0.04 * Math.sin(a)], [1, -0.4, -0.4], [0, -1, 0], env(t, 0.25, 0.85));
  },
  // turned to the produce crate, leaning over it
  'check-crate': (rig, t, ctx) => { still(rig, t, ctx); const a = ctx.aim('crate'); ctx.body({ yaw: a.yaw * env(t, 0.3, 0.8), pitch: 0.2 * env(t, 0.4, 0.7) }); },
  // humming: a slow sway
  sway: (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ roll: 0.06 * Math.sin(t * Math.PI * 3) * env(t, 0.15, 0.85) }); },
  // host: a small bowl held out; the visitor takes it (and carries it home)
  'gag:mealprep': (rig, t, ctx) => offer(rig, t, ctx, 'bowl'),

  // ---- Leader -------------------------------------------------------------
  'look-at-water': (rig, t, ctx) => { still(rig, t, ctx); const a = ctx.aim('pool'); ctx.head(a.yaw * env(t), 0.3 * env(t, 0.3, 0.7), 0); },
  'walk-to-lantern': still,
  'stand-still': still,
  // host: sits a moment with the visitor at the water's edge, no nodding
  // (the bench is across the tile, further than a 4 s beat can walk)
  'gag:leader': (rig, t, ctx) => { still(rig, t, ctx); ctx.body({ sit: env(t, 0.2, 0.85) }); },

  // ---- Practice -------------------------------------------------------------
  // host: a curtain-call bow, one hand across the belly and the other out to
  // the side; the visitor applauds (a being holding its thing in both hands
  // keeps holding it). Nothing here touches a mask or the card.
  'gag:practice': (rig, t, ctx) => {
    still(rig, t, ctx);
    if (ctx.role === 'host') {
      const k = env(t, 0.2, 0.6);
      ctx.body({ pitch: 0.34 * k });
      ctx.arm('R', [-0.03, 0.31, 0.3], [1, -0.5, -0.5], [0, 0, -1], k);
      ctx.arm('L', [-0.44, 0.4, 0.08], [-1, -0.6, -0.3], [0, -0.3, 1], k);
      return;
    }
    if (ONE_HAND.has(ctx.id)) return;
    const k = env((t - 0.4) / 0.6, 0.2, 0.8);
    const clap = Math.max(bump(t, 0.58, 0.08), bump(t, 0.72, 0.08), bump(t, 0.86, 0.08));
    const g = 0.03 + 0.08 * (1 - clap);
    ctx.arm('L', [-g, 0.46, 0.32], [-1, -0.3, -0.4], [1, 0, 0], k);
    ctx.arm('R', [g, 0.46, 0.32], [1, -0.3, -0.4], [-1, 0, 0], k);
  },
};

// a gag where the host holds something out and the visitor takes it: the
// host's hand goes out with it, the visitor's reaches, and at the half the
// thing is in the visitor's hand (the scene carries it home from there)
function offer(rig, t, ctx, kind) {
  still(rig, t, ctx);
  if (ctx.role === 'host') {
    ctx.arm('R', [0.1, 0.42, 0.46], [1, -0.4, -0.5], [0, 1, 0.2], env(t / 0.6, 0.35, 0.8));
    ctx.prop(kind, { k: t > 0.12 && t < 0.52 ? 1 : 0, at: 'handR' });
  } else {
    ctx.arm('R', [0.1, 0.44, 0.42], [1, -0.4, -0.5], [0, 1, 0.2], env((t - 0.25) / 0.6, 0.35, 0.8));
    ctx.prop('carry', t >= 0.52 ? 1 : 0);
  }
}

// Acts that, once their pose has settled, give the frame loop no reason to
// run (the blink timer and the act's own end wake it). Everything else keeps
// drawing until its act ends.
export const STILL_ACTS = new Set(['rest', 'sleep', 'stand-still', 'stand-watch', 'wait', 'visit-walk', 'patrol', 'walk-to-lantern']);
export function actMoves(name, st) {
  if (name === 'deliver') return !!st && st.place === 'plaza';
  return !STILL_ACTS.has(name);
}

// Acts that happen somewhere else on the tile: the being walks there, does
// it (for PERFORM_S, timed from its arrival), and walks back when the engine
// sends it to rest. { anchor, yaw } names a district anchor and the way to
// face there; { near, off } is a spot `off` in front of an anchor, facing it.
export const ACT_SPOTS = {
  'tap-racked-bar': { coach: { anchor: 'work', yaw: Math.PI } },
  'sit-bench': { leader: { anchor: 'work' } },
  'walk-to-lantern': { leader: { near: 'lantern', off: [0.06, 0.32] } },
  'wipe-counter': { mealprep: { anchor: 'work', yaw: Math.PI } },
};
export const PERFORM_S = { 'tap-racked-bar': 2.6, 'sit-bench': 7, 'walk-to-lantern': 3.5, 'wipe-counter': 3 };

// What a being sets down somewhere on the map (its own thing, parked):
// the Coach's bar in the rack's cups whenever it is not working (it is only
// ever lifted to work), the Guardian's lantern hung in the tower while it
// sleeps. `lift` raises the thing's origin above the anchor.
export const DOCKS = {
  coach: { prop: 'bar', anchor: 'barDock', when: (act) => act !== 'work', lift: 0 },
  // (the ring is the lantern's origin: lifted so its glass sits in the housing)
  guardian: { prop: 'lantern', anchor: 'lanternDock', when: (act) => act === 'sleep', lift: 0.17 },
};

// ---------------------------------------------------------------------------
// THE OVERLAY. A being's `ov` holds the targets its act wrote this frame and
// the handles' last values; applyOverlay eases every handle toward its
// target through the rig's own pose store (`rig.pose`, already framed this
// frame by the tell), applies the arms, props and face to the rig, and
// leaves the head and body values in ov.v for the scene to compose with the
// walk and the camera.
export function newOverlay() {
  return { t: null, v: { hy: 0, hp: 0, hr: 0, bp: 0, br: 0, byaw: 0, bx: 0, by: 0, sit: 0, gait: 0, puff: 0 }, last: {}, held: {} };
}
export function resetOverlay(ov) {
  ov.t = { hy: 0, hp: 0, hr: 0, bp: 0, br: 0, byaw: 0, bx: 0, by: 0, sit: 0, gait: 0, puff: 0, lid: 0, dim: 0, arms: {}, props: {} };
  return ov;
}
// the ctx helpers a frame writes through (the scene adds now, rm, id,
// role, place, dock and aim)
export function overlayWriters(ov) {
  return {
    head(yaw, pitch, roll) { ov.t.hy += yaw || 0; ov.t.hp += pitch || 0; ov.t.hr += roll || 0; },
    body(o) {
      if (o.pitch) ov.t.bp += o.pitch; if (o.roll) ov.t.br += o.roll; if (o.yaw) ov.t.byaw += o.yaw;
      if (o.x) ov.t.bx += o.x; if (o.y) ov.t.by += o.y; if (o.sit) ov.t.sit = Math.max(ov.t.sit, o.sit); if (o.gait) ov.t.gait = Math.max(ov.t.gait, o.gait);
    },
    arm(side, H, pole, palm, w) { ov.t.arms[side] = { H, pole, palm, w: w == null ? 1 : w }; },
    prop(name, value) { ov.t.props[name] = value; },
    face(o) { ov.t.lid = Math.max(ov.t.lid, o.lid || 0); ov.t.dim = Math.max(ov.t.dim, o.dim || 0); },
    fx(name, v) { if (name === 'puff') ov.t.puff = Math.max(ov.t.puff, v || 0); },
  };
}

export function applyOverlay(rig, ov, ctx) {
  const P = rig.pose, t = ov.t, v = ov.v;
  const V3 = rig.group.position.constructor;
  ['hy', 'hp', 'hr', 'bp', 'br', 'byaw', 'bx', 'by', 'sit', 'gait', 'puff'].forEach((k) => { v[k] = P.s('ov:' + k, t[k]); });

  // PROPS that move before the hands take hold of them
  const pr = rig.props || {};
  const num = (name, key) => { const x = t.props[name]; return typeof x === 'number' ? x : x && typeof x === 'object' && key ? (x[key] || 0) : 0; };
  if (pr.rose) pr.rose.rotation.z += P.s('ov:p:rose', num('rose'));
  const bookClose = pr.book ? P.s('ov:p:bookClose', num('book', 'close')) : 0;
  if (pr.book) {
    const close = bookClose, lift = P.s('ov:p:bookLift', num('book', 'lift'));
    const tilt = P.s('ov:p:bookTilt', num('book', 'tilt'));
    const a = pr.open + (Math.PI / 2 - 0.05 - pr.open) * close;
    pr.halves[0].rotation.y = a; pr.halves[1].rotation.y = -a;
    if (lift > 1e-4 || tilt > 1e-4 || close > 1e-4) { pr.book.position.y += lift; pr.book.position.z += lift * 0.5; pr.book.rotation.x += tilt; pr.hold(); }
  }
  if (pr.lens) pr.lens.rotation.z = P.s('ov:p:lens', num('lens'));
  if (pr.headphones) {
    const hb = pr.headphones;
    if (hb.userData.baseY == null) hb.userData.baseY = hb.position.y;
    hb.position.y = hb.userData.baseY + 0.075 * P.s('ov:p:headphones', num('headphones'));
  }
  if (pr.drawer) pr.drawer.position.z *= 1 - P.s('ov:p:drawer', num('drawer'));

  // THE ARMS: blended from the tell's own pose to the act's, by an eased weight
  ['L', 'R'].forEach((side) => {
    const arm = rig.arms && rig.arms[side];
    if (!arm) return;
    const a = t.arms[side];
    if (a) ov.last[side] = a;
    const w = P.s('ov:w' + side, a ? a.w : 0);
    const L = ov.last[side];
    if (w < 1e-3 || !L) return;
    const H = P.v('ov:H' + side, L.H[0], L.H[1], L.H[2]), pole = P.v('ov:pole' + side, L.pole[0], L.pole[1], L.pole[2]);
    const palm = P.v('ov:palm' + side, L.palm[0], L.palm[1], L.palm[2]);
    const h = (ov['_h' + side] || (ov['_h' + side] = new V3())).copy(arm.last.H).lerp(H, w);
    const p = (ov['_p' + side] || (ov['_p' + side] = new V3())).copy(arm.last.pole).lerp(pole, w);
    const q = (ov['_q' + side] || (ov['_q' + side] = new V3())).copy(arm.last.palm).lerp(palm, w);
    arm.set(side === 'L' ? rig.arms.SL : rig.arms.SR, h, p, q);
  });
  if (pr.book && rig.arms) {
    pr.book.updateMatrix();
    // a closed book is held by its two edges, which now stand side by side
    const close = bookClose;
    if (close > 1e-3) {
      [['L', -1], ['R', 1]].forEach(([side, s]) => {
        const arm = rig.arms[side];
        const g = (ov['_g' + side] || (ov['_g' + side] = new V3())).set(s * 0.035, -0.03, 0.09).applyMatrix4(pr.book.matrix);
        arm.set(side === 'L' ? rig.arms.SL : rig.arms.SR, g.lerp(arm.last.H, 1 - close), arm.last.pole, arm.last.palm);
      });
    }
    // and taps a line on the page it is showing
    const tap = P.s('ov:p:bookTap', num('book', 'tap'));
    if (tap > 1e-3) {
      const pc = (ov._pc || (ov._pc = new V3())).set(0.05, 0.01, 0.03).applyMatrix4(pr.book.matrix);
      const arm = rig.arms.R;
      arm.set(rig.arms.SR, (ov._th || (ov._th = new V3())).copy(arm.last.H).lerp(pc, Math.min(1, tap)), arm.last.pole, arm.last.palm);
    }
  }
  // the Guardian's lantern hangs from its left hand wherever the hand went
  if (pr.lantern && rig.arms) {
    const hl = rig.arms.L.last.H;
    pr.lantern.position.set(hl.x, hl.y + (pr.hangY || 0.02), hl.z);
  }

  // THE DOCK: the thing parked where it belongs, eased there and back
  const dock = DOCKS[ctx.id];
  if (dock && pr[dock.prop]) {
    const w = P.s('ov:dock', ctx.docked ? 1 : 0);
    const o = pr[dock.prop];
    if (w > 1e-3 && ctx.dockLocal) {
      o.position.lerp((ov._dv || (ov._dv = new V3())).set(ctx.dockLocal[0], ctx.dockLocal[1] + dock.lift, ctx.dockLocal[2]), w);
      o.rotation.y = (ctx.dockYaw || 0) * w;
    } else o.rotation.y = 0;
  }
  // the Meal Prep's ladle follows its right hand up to taste
  if (pr.ladle && pr.pot && rig.arms) {
    const k = P.s('ov:p:ladle', num('ladle'));
    if (k > 1e-3) {
      const hr = rig.arms.R.last.H;
      pr.ladle.position.lerp((ov._lp || (ov._lp = new V3())).set(hr.x - pr.pot.position.x, hr.y - pr.pot.position.y - 0.09, hr.z - pr.pot.position.z), k);
      pr.ladle.rotation.z *= 1 - k;
    }
  }

  // THINGS IN THE HAND OR IN THE AIR: a chip, a kernel, a card, a bowl
  ['chip', 'popcorn', 'card', 'bowl'].forEach((kind) => {
    const want = t.props[kind];
    const obj = kind === 'chip' ? pr.chip : ctx.held && ctx.held(kind, !!(want && want.k));
    if (!obj) return;
    if (!want || !want.k) { if (kind !== 'chip') obj.visible = false; return; }
    obj.visible = true; obj.scale.setScalar(1);
    const at = want.at || 'handR';
    if (at === 'handR' && rig.arms) {
      const hd = rig.arms.R.hand;
      obj.position.copy(hd.position).add((ov._up || (ov._up = new V3())).set(0, 0.07, 0).applyQuaternion(hd.quaternion));
      obj.quaternion.copy(hd.quaternion);
      if (kind === 'chip') obj.rotation.x = 0.9;
    } else if (Array.isArray(at)) {
      obj.position.set(at[0], at[1], at[2]);
      obj.rotation.set(0, 0, 0);
    }
  });

  // THE FACE, asleep: lids half down, the eyes to a third
  const face = rig.face;
  if (face) {
    const lid = P.s('ov:lid', t.lid), dim = P.s('ov:dim', t.dim);
    // written while it matters and once more as it lets go, so a tell that
    // never touches the lids does not keep a sleeper's
    if (lid > 1e-3 || ov.lidOn) { face.add.lid = lid > 1e-3 ? lid : 0; ov.lidOn = lid > 1e-3; }
    if (dim > 1e-3 || ov.dimOn) {
      const mats = [face.mat].concat((face.eyes || []).map((e) => e.inner && e.inner.material)).filter((m, i, a) => m && a.indexOf(m) === i);
      mats.forEach((m) => {
        const o = m.userData.orgBase, base = (o && o.op != null ? o.op : (m.userData.baseOp != null ? m.userData.baseOp : 1)) * (1 - (ctx.beingDim || 0) * 0.5);
        m.opacity = base * (1 - dim);
      });
      ov.dimOn = dim > 1e-3;
    }
  }
  return v;
}

// ---------------------------------------------------------------------------
// THE SMALL PROPS a gag hands over and a visitor carries home: a kernel of
// popcorn, a small bowl, an index card. Built once (geometry and material
// shared), a mesh per hand that needs one. Token colours only. THREE and the
// kit are handed in, as habitat.js takes them.
export function buildProps(T, TK, kit) {
  const mat = (col, o) => new T.MeshPhysicalMaterial(Object.assign({ color: col, roughness: 0.55, clearcoat: 0.4, sheen: 0.5, sheenColor: kit.lighter(col, 0.4) }, o || {}));
  // a kernel: a lumpy little puff
  const kernelG = new T.SphereGeometry(0.03, 12, 9);
  const kp = kernelG.attributes.position;
  for (let i = 0; i < kp.count; i++) { const x = kp.getX(i), y = kp.getY(i), z = kp.getZ(i), k = 1 + 0.22 * Math.sin(x * 140) * Math.cos(z * 120) + 0.12 * Math.sin(y * 170); kp.setXYZ(i, x * k, y * k * 0.85, z * k); }
  kernelG.computeVertexNormals();
  const kernelM = mat(TK.ink.clone().lerp(TK.gold, 0.25), { roughness: 0.75 });
  // a bowl: a turned cup with a food dome in the Fuel hue
  const bowlG = new T.LatheGeometry([[0.0004, 0], [0.03, 0], [0.05, 0.012], [0.058, 0.034], [0.054, 0.036], [0.044, 0.016], [0.0004, 0.014]].map((p) => new T.Vector2(p[0], p[1])), 24);
  const bowlM = mat(TK.ink.clone().lerp(TK.shell, 0.4), { roughness: 0.3, clearcoat: 0.8 });
  const foodG = new T.SphereGeometry(0.045, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  foodG.scale(1, 0.45, 1); foodG.translate(0, 0.02, 0);
  const foodM = mat(kit.darker(TK.hue.shoulders, 0.85).lerp(TK.gold, 0.2), { roughness: 0.45 });
  // a card: a thin paper slip with a lit edge in the Librarian's teal
  const cardG = new T.BoxGeometry(0.08, 0.055, 0.004);
  const cardM = mat(TK.ink.clone().lerp(TK.shell, 0.25), { roughness: 0.85, clearcoat: 0.05 });
  const shared = [kernelG, kernelM, bowlG, bowlM, foodG, foodM, cardG, cardM];
  function make(kind) {
    const g = new T.Group();
    if (kind === 'popcorn') g.add(new T.Mesh(kernelG, kernelM));
    else if (kind === 'bowl') { g.add(new T.Mesh(bowlG, bowlM)); g.add(new T.Mesh(foodG, foodM)); }
    else if (kind === 'card') g.add(new T.Mesh(cardG, cardM));
    else return null;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false; g.name = 'prop:' + kind;
    return g;
  }
  return { make, dispose() { shared.forEach((x) => x.dispose()); } };
}
