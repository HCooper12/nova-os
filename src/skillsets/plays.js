// THE PLAYS (mockup 97 round 2; his 11 Oct calls: "every visible agent is
// continuously alive", and "they should all do these different actions
// playfully but at different times and patterns").
//
// Pure: no three, no DOM, no clock but the one handed in.
//
// A track is a list of keys: [t s, dx, dy, behind 0/1, yaw, roll, squash,
// wave 0/1]. dx is in slab widths and dy in slab heights, both measured from
// the agent's HOME in his lane, so every track starts and ends at home and
// one play can follow another with no jump.
//
// Two lanes, so no two agents ever share a patch of screen:
//   - the CENTRE agent's home is the floor just under his slab (never on the
//     skill text). His plays use the slab's whole frame: round the back, over
//     the top, out from either edge, on top.
//   - a NEIGHBOUR sits on the top of his own slab at the corner that shows,
//     and plays in place there: small moves only, so he never wanders into
//     the centre agent's lane.

// the centre lane, in slab units from the slab's bottom centre
export const CENTRE_HOME = { x: 0, y: -0.33 };
const HY = CENTRE_HOME.y;
// feet on the slab's top edge, measured from the centre home
const TOP = 1 - HY;
// just outside a side edge (half a slab plus about half his body)
const OUT = 0.64;
// behind the slab, his feet are a little up its face (read as depth)
const BACK = 0.08 - HY;
// feet height behind the slab that puts his eyes just over the top edge
const OVER = 0.82 - HY;

const F = 0.3, R = 1.25, L = -1.25; // facing: the viewer, right, left

const k = (t, x, y, behind = 0, yaw = F, roll = 0, sq = 1, wave = 0) => [t, x, y, behind, yaw, roll, sq, wave];
const H = (t, sq = 1) => k(t, 0, 0, 0, F, 0, sq);

// a role action done where he stands, turned to the side it reads best from
const stay = (len, yaw = F) => [H(0), k(0.3, 0, 0, 0, yaw), k(len - 0.3, 0, 0, 0, yaw), H(len)];
function roleTracks() {
  return {
    'clean-press': stay(4.4, 0.15), pushups: stay(4.6, R), squats: stay(3.6, 0.2), 'chalk-hands': stay(2.2),
    'read-book': stay(4.6, 0.1), shelve: stay(3.4, 0.5), 'dust-shelf': stay(2.6),
    'count-coins': stay(4.2, 0.1), 'stack-chip': stay(2.4), 'close-ledger': stay(2.2),
    magnify: stay(4.2, 0.2), 'magnify-low': stay(4.2, 0.6), scribble: stay(2.6),
    'watch-post': stay(4.6, 0.1), 'polish-shield': stay(2.8),
    // the patrol is a walk: along the floor to each edge and back
    'patrol-lamp': [H(0), k(0.3, 0, 0, 0, R), k(1.7, 0.42, 0, 0, R), k(2.1, 0.42, 0, 0, L), k(4.4, -0.42, 0, 0, L), k(4.8, -0.42, 0, 0, R), k(6.0, 0, 0, 0, R), H(6.2)],
    direct: stay(3.4, 0.2), clipboard: stay(4.2, 0.1), 'scan-horizon': stay(3.4),
    stir: stay(4.4, 0.1), chop: stay(3.2, 0.25), 'taste-ladle': stay(2.6),
    present: stay(3.8, -0.1), 'brow-scan': stay(4.2), 'toss-popcorn': stay(2.4),
    rehearse: stay(4.2), bow: stay(2.4),
  };
}

export const PLAYS = {
  // ---- the centre's big plays: the whole slab is his ----
  // run round the back of the slab and out the other side
  round: [H(0), k(0.15, 0, 0, 0, R, 0, 0.9), k(0.75, OUT, 0.02, 0, R), k(0.85, OUT, BACK, 1, L), k(2.05, -OUT, BACK, 1, L), k(2.15, -OUT, 0.02, 0, R), k(2.8, 0, 0, 0, R), H(2.95)],
  // zoomies along the front floor, a skip at each turn
  zoom: [H(0), k(0.12, 0, 0, 0, L, 0, 0.88), k(0.55, -0.48, 0, 0, L), k(0.66, -0.48, 0.08, 0, R, 0, 1.05), k(0.78, -0.48, 0, 0, R, 0, 0.9), k(1.5, 0.48, 0, 0, R), k(1.61, 0.48, 0.08, 0, L, 0, 1.05), k(1.73, 0.48, 0, 0, L, 0, 0.9), k(2.2, 0, 0, 0, L), H(2.35)],
  // round the right edge, behind, up, and peek over the top edge
  over: [H(0), k(0.6, OUT, 0.02, 0, R), k(0.7, OUT, BACK, 1, L), k(1.4, 0.12, BACK, 1, L), k(1.75, 0.12, OVER, 1, 0, 0, 1.04), k(1.9, 0.12, OVER, 1, 0, 0, 1), k(2.6, 0.12, OVER, 1, -0.8), k(3.4, 0.12, OVER, 1, 0.8), k(3.9, 0.12, OVER, 1, 0), k(4.15, 0.12, OVER - 0.06, 1, 0, 0, 0.92), k(4.4, 0.12, BACK, 1, R), k(5.0, OUT, BACK, 1, R), k(5.1, OUT, 0.02, 0, L), k(5.7, 0, 0, 0, L), H(5.85)],
  // round the left edge, hide behind, peek out from the side, twice
  hide: [H(0), k(0.6, -OUT, 0.02, 0, L), k(0.7, -OUT, BACK, 1, R), k(1.1, -0.36, BACK + 0.04, 1, R), k(1.6, -0.36, BACK + 0.04, 1, 0.2), k(1.9, -0.52, BACK + 0.04, 1, -0.5, 0.38), k(2.9, -0.52, BACK + 0.04, 1, -0.3, 0.38), k(3.15, -0.34, BACK + 0.04, 1, 0.2), k(3.9, -0.34, BACK + 0.04, 1, 0.2), k(4.15, -0.52, BACK + 0.04, 1, -0.5, 0.38, 1, 1), k(5.1, -0.52, BACK + 0.04, 1, -0.4, 0.38, 1, 1), k(5.4, -0.52, BACK, 1, L), k(5.6, -OUT, BACK, 1, L), k(5.7, -OUT, 0.02, 0, R), k(6.3, 0, 0, 0, R), H(6.45)],
  // out past the right edge, three jumps there, each higher (never up in
  // front of the slab, where his head would cross the skill text)
  jump: [H(0), k(0.6, OUT + 0.02, 0.02, 0, R), k(0.75, OUT + 0.02, 0.02, 0, F, 0, 0.82), k(1.0, OUT + 0.02, 0.08, 0, F, 0, 1.08), k(1.22, OUT + 0.02, 0.02, 0, F, 0, 0.84), k(1.52, OUT + 0.02, 0.12, 0, F, 0, 1.1), k(1.78, OUT + 0.02, 0.02, 0, F, 0, 0.82), k(2.12, OUT + 0.02, 0.16, 0, 0, 0, 1.12), k(2.44, OUT + 0.02, 0.02, 0, F, 0, 0.78), k(2.6, OUT + 0.02, 0.02, 0, L), k(3.2, 0, 0, 0, L), H(3.35)],
  // up onto the top of the slab, sit, swing, wave, and down again. He
  // climbs from BEHIND (the slab hides him until he clears its top edge),
  // so he never crosses the skill text on the way up or down.
  perch: [H(0), k(0.6, OUT, 0.02, 0, R), k(0.7, OUT, BACK, 1, L), k(1.2, 0.1, BACK, 1, L), k(1.3, 0.1, BACK, 1, 0, 0, 0.82), k(1.75, 0.1, TOP + 0.02, 1, 0, 0, 1.06), k(1.85, 0.1, TOP, 0, 0, 0, 0.84), k(3.1, 0.1, TOP, 0, 0.6, 0, 0.84), k(3.8, 0.1, TOP, 0, -0.5, 0, 0.84), k(4.2, 0.1, TOP, 0, 0, 0, 0.84, 1), k(5.3, 0.1, TOP, 0, 0, 0, 0.84, 1), k(5.6, 0.1, TOP, 0, 0, 0, 0.84), k(5.7, 0.1, TOP, 1, R, 0, 0.9), k(6.1, 0.1, BACK, 1, R, 0, 1.04), k(6.2, 0.1, BACK, 1, R, 0, 0.86), k(6.7, OUT, BACK, 1, R), k(6.8, OUT, 0.02, 0, L), k(7.4, 0, 0, 0, L), H(7.55)],
  // stroll to the right edge and lean on it
  lean: [H(0), k(0.7, OUT - 0.04, 0.03, 0, R), k(1.0, OUT - 0.04, 0.03, 0, 0.6, 0.22), k(2.8, OUT - 0.04, 0.03, 0, 0.5, 0.22), k(3.3, OUT - 0.04, 0.03, 0, -0.2, 0.22), k(3.9, OUT - 0.04, 0.03, 0, 0.5, 0.22), k(4.2, OUT - 0.04, 0.03, 0, L), k(4.9, 0, 0, 0, L), H(5.05)],
  // the left edge's lean, for the shy ones who like that side
  leanL: [H(0), k(0.7, -OUT + 0.04, 0.03, 0, L), k(1.0, -OUT + 0.04, 0.03, 0, -0.1, -0.22), k(3.2, -OUT + 0.04, 0.03, 0, 0.2, -0.22), k(3.5, -OUT + 0.04, 0.03, 0, R), k(4.2, 0, 0, 0, R), H(4.35)],
  // a lap round the slab, twice, at a sprint (the Coach)
  sprint: [H(0), k(0.1, 0, 0, 0, R, 0, 0.88), k(0.5, OUT, 0.02, 0, R), k(0.56, OUT, BACK, 1, L), k(1.3, -OUT, BACK, 1, L), k(1.36, -OUT, 0.02, 0, R), k(2.1, OUT, 0.02, 0, R), k(2.16, OUT, BACK, 1, L), k(2.9, -OUT, BACK, 1, L), k(2.96, -OUT, 0.02, 0, R), k(3.4, 0, 0, 0, R), H(3.55)],
  // a full spin in the air (Practice)
  spin: [H(0), H(0.15, 0.8), k(0.55, 0, 0.06, 0, F + Math.PI, 0, 1.1), k(0.95, 0, 0, 0, F + 2 * Math.PI, 0, 0.84), k(1.15, 0, 0, 0, F + 2 * Math.PI)],

  // ---- the small ones: in place, so they fit either lane ----
  wave: [H(0), k(0.3, 0, 0, 0, 0.05), k(0.4, 0, 0, 0, 0.05, 0, 1, 1), k(2.1, 0, 0, 0, 0.05, 0, 1, 1), k(2.3, 0, 0, 0, 0.05), H(2.6)],
  look: [H(0), k(0.5, 0, 0, 0, 0.95), k(1.4, 0, 0, 0, 0.95), k(1.9, 0, 0, 0, -0.45), k(2.8, 0, 0, 0, -0.45), H(3.3)],
  hop: [H(0), H(0.12, 0.84), k(0.36, 0, 0.04, 0, F, 0, 1.05), H(0.58, 0.84), k(0.82, 0, 0.05, 0, F, 0, 1.06), H(1.06, 0.82), H(1.25)],
  nod: [H(0), H(0.15, 0.94), H(0.3), H(0.45, 0.94), H(0.6)],
  duck: [H(0), k(0.18, 0, 0, 0, -0.6, 0, 0.72), k(1.0, 0, 0, 0, -0.6, 0, 0.72), H(1.3)],
  squat: [H(0), H(0.3, 0.78), H(0.6), H(0.9, 0.78), H(1.2), H(1.5, 0.78), H(1.8)],
  sway: [H(0), k(0.5, 0, 0, 0, 0.2, 0.12), k(1.2, 0, 0, 0, 0.4, -0.12), k(1.9, 0, 0, 0, 0.2, 0.12), H(2.4)],
  shuffle: [H(0), k(0.4, -0.06, 0, 0, L), k(0.55, -0.06, 0, 0, F), k(1.4, -0.06, 0, 0, 0.6), k(1.8, 0, 0, 0, R), H(1.95)],
  // ---- the role actions (./roleActs.js moves the limbs; these place him) ----
  ...roleTracks(),
  // reactions to a tap
  boing: [H(0), H(0.1, 0.8), k(0.34, 0, 0.05, 0, F, 0, 1.06), H(0.58, 0.84), H(0.72)],
};

// each agent's role actions (the same lists as ./roleActs.js ROLE_OF)
export const ROLE = {
  coach: ['clean-press', 'pushups', 'squats', 'clean-press', 'chalk-hands'],
  librarian: ['read-book', 'shelve', 'dust-shelf', 'read-book'],
  cfo: ['count-coins', 'stack-chip', 'close-ledger', 'count-coins'],
  researcher: ['magnify', 'magnify-low', 'scribble', 'magnify'],
  guardian: ['watch-post', 'patrol-lamp', 'polish-shield', 'patrol-lamp'],
  commander: ['direct', 'clipboard', 'scan-horizon', 'direct'],
  mealprep: ['stir', 'chop', 'taste-ladle', 'chop'],
  leader: ['present', 'present'],
  watcher: ['brow-scan', 'toss-popcorn', 'brow-scan'],
  practice: ['rehearse', 'bow', 'rehearse'],
};
export const ROLE_PLAYS = new Set(Object.values(ROLE).flat());
// role actions that travel (never on a neighbour's slab top)
export const ROLE_MOVES = new Set(['patrol-lamp']);

export const playLength = (name) => { const t = PLAYS[name]; return t ? t[t.length - 1][0] : 0; };

// the plays that leave his spot: the centre's own
export const BIG = new Set(['round', 'zoom', 'over', 'hide', 'jump', 'perch', 'lean', 'leanL', 'sprint', 'spin']);
// what a neighbour on his slab's top may do: in place, never into the centre lane
export const PERCHED = new Set(['wave', 'look', 'hop', 'nod', 'duck', 'squat', 'sway', 'shuffle', 'spin']);

// Personality: the mix (weighted by repetition), the tempo, the pauses.
export const STYLE = {
  commander: { big: ['perch', 'lean', 'round', 'over', 'jump'], small: ['wave', 'look', 'nod'], tempo: 1, rest: [1.2, 2.8], react: 'boing' },
  coach: { big: ['sprint', 'jump', 'zoom', 'round', 'perch', 'sprint'], small: ['squat', 'hop', 'wave'], tempo: 1.3, rest: [0.6, 1.8], react: 'boing' },
  cfo: { big: ['lean', 'round', 'over', 'perch'], small: ['nod', 'look', 'sway'], tempo: 0.9, rest: [1.6, 3.2], react: 'nod' },
  guardian: { big: ['round', 'lean', 'over', 'zoom'], small: ['look', 'shuffle'], tempo: 0.85, rest: [1.8, 3.4], react: 'nod' },
  researcher: { big: ['over', 'hide', 'lean', 'round', 'perch'], small: ['look', 'nod', 'shuffle'], tempo: 1, rest: [1, 2.6], react: 'boing' },
  watcher: { big: ['perch', 'over', 'hide', 'round'], small: ['look', 'sway'], tempo: 0.9, rest: [1.4, 3], react: 'nod' },
  librarian: { big: ['hide', 'over', 'leanL', 'hide', 'perch'], small: ['duck', 'look', 'shuffle'], tempo: 0.75, rest: [1.8, 3.6], react: 'duck' },
  mealprep: { big: ['zoom', 'round', 'jump', 'lean', 'perch'], small: ['hop', 'wave', 'sway'], tempo: 1.05, rest: [1, 2.4], react: 'boing' },
  leader: { big: ['lean', 'over', 'round', 'perch'], small: ['nod', 'wave', 'look'], tempo: 0.85, rest: [1.6, 3.2], react: 'nod' },
  practice: { big: ['spin', 'over', 'hide', 'jump', 'zoom'], small: ['wave', 'hop', 'spin'], tempo: 1.1, rest: [0.9, 2.2], react: 'boing' },
};
const DEFAULT_STYLE = STYLE.commander;
export const styleOf = (id) => STYLE[id] || DEFAULT_STYLE;

// A seeded generator per agent, so each keeps his own rhythm and no two run
// in step (the seed mixes the agent's name with a per-session salt).
export function seededRng(id, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The next play: from his repertoire, never the same twice running; at the
// centre a big one most of the time, a small one between; perched, small
// ones only.
export function nextPlay(id, { centre = true, last = null, rnd = Math.random } = {}) {
  const st = styleOf(id);
  const ok = (n) => n !== last && (centre || PERCHED.has(n) || (ROLE_PLAYS.has(n) && !ROLE_MOVES.has(n)));
  const role = (ROLE[id] || []).filter(ok);
  // his work, in character, about half the time: the role actions
  if (role.length && rnd() < 0.5) return role[Math.floor(rnd() * role.length) % role.length];
  const big = centre ? st.big.filter(ok) : [];
  const small = st.small.filter(ok).concat(centre ? [] : ['look', 'wave', 'sway'].filter((n) => ok(n) && !st.small.includes(n)));
  const lastWasBig = last && BIG.has(last);
  const pool = !big.length || (lastWasBig && rnd() < 0.45) || rnd() < 0.18 ? (small.length ? small : ['look']) : big;
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// The pause after a play, in seconds: his own range, and a tempo that drifts
// a little play to play, so even two of the same personality never align.
export function restAfter(id, rnd = Math.random) {
  const [a, b] = styleOf(id).rest;
  return a + rnd() * (b - a);
}
export function tempoFor(id, rnd = Math.random) {
  return styleOf(id).tempo * (0.88 + rnd() * 0.24);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// The pose at time t on a track (offsets from home).
export function samplePlay(track, t) {
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1][0]) i++;
  const a = track[i], b = track[Math.min(i + 1, track.length - 1)];
  const u = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 1;
  // rising eases out, falling eases in: a jump reads as a jump
  const yu = b[2] > a[2] ? 1 - (1 - u) * (1 - u) : u * u, e = smooth(u);
  const dx = b[1] - a[1];
  return {
    x: a[1] + dx * e, y: a[2] + (b[2] - a[2]) * yu, behind: u < 1 ? a[3] : b[3],
    yaw: a[4] + (b[4] - a[4]) * e, roll: a[5] + (b[5] - a[5]) * e, sq: a[6] + (b[6] - a[6]) * e,
    wave: a[7] && b[7] ? 1 : a[7] || b[7] ? (a[7] ? 1 - e : e) : 0,
    // running when he covers ground fast; a stroll otherwise
    moving: Math.abs(dx) > 0.01 && u < 1, speed: b[0] > a[0] ? Math.abs(dx) / (b[0] - a[0]) : 0,
  };
}
export const HOME_POSE = samplePlay(PLAYS.nod, 0);

// The frame each slab's canvas covers, in CSS px, from the slab's size: wide
// enough for his runs out past either edge, tall enough to sit on top and to
// stand on the floor under it. AX/AY is the slab's bottom centre in it.
export function frameGeo(SW, SH, CH) {
  const above = Math.round(CH * 1.35), below = Math.round(CH * 1.4);
  const TW = Math.round(SW * 1.8), TH = above + SH + below;
  return { SW, SH, CH, TW, TH, AX: TW / 2, AY: above + SH, above, side: (TW - SW) / 2, PIN_AY: Math.round(TH * 0.6) };
}

