// THE PLAYS (mockup 97 round 2, and his 11 Oct call: "every visible agent
// is continuously alive"). Key tracks an agent acts out at his slab, the
// personality that picks among them, and the chooser that keeps it varied.
// Pure: no three, no DOM, no clock but the one handed in.
//
// A key: [t s, x (slab widths from the slab's centre, + is his home side),
// y (slab heights up), behind 0/1, yaw, roll, squash]. Every track starts and
// ends at HOME, so one can follow another with no jump.

export const HOME_X = 0.36;
const H0 = [0, HOME_X, 0, 0, 0.3, 0, 1];

export const PLAYS = {
  hop: [H0, [0.12, 0.36, 0, 0, 0.3, 0, 0.84], [0.38, 0.36, 0.26, 0, 0.3, 0, 1.05], [0.62, 0.36, 0, 0, 0.3, 0, 0.82], [0.74, 0.36, 0, 0, 0.3, 0, 1], [1, 0.36, 0.34, 0, 0.3, 0, 1.06], [1.26, 0.36, 0, 0, 0.3, 0, 0.8], [1.45, 0.36, 0, 0, 0.3, 0, 1]],
  peek: [H0, [0.9, 0.75, 0, 0, 1.2, 0, 1], [0.95, 0.75, 0, 1, -1.2, 0, 1], [2.4, -0.3, 0, 1, -1.2, 0, 1], [2.9, -0.52, 0, 1, 0.2, 0.35, 1], [4, -0.52, 0, 1, 0.5, 0.35, 1], [4.5, -0.3, 0, 1, 1.2, 0, 1], [5.6, 0.75, 0, 1, 1.2, 0, 1], [5.65, 0.75, 0, 0, -1.2, 0, 1], [6.3, 0.36, 0, 0, 0.3, 0, 1]],
  round: [H0, [1.4, -0.75, 0, 0, -1.2, 0, 1], [1.45, -0.75, 0, 1, 1.2, 0, 1], [3.2, 0.75, 0, 1, 1.2, 0, 1], [3.25, 0.75, 0, 0, -1.2, 0, 1], [3.8, 0.36, 0, 0, 0.3, 0, 1]],
  lean: [H0, [0.6, 0.62, 0, 0, 1.0, 0, 1], [1, 0.62, 0, 0, 0.5, 0.2, 1], [3.2, 0.62, 0, 0, 0.5, 0.2, 1], [3.6, 0.62, 0, 0, 0.4, 0, 1], [4.2, 0.36, 0, 0, 0.3, 0, 1]],
  perch: [H0, [0.25, 0.36, 0, 0, 0.3, 0, 0.8], [0.7, 0.12, 1.08, 0, 0, 0, 1.05], [0.85, 0.1, 1, 0, 0, 0, 0.86], [3.2, 0.1, 1, 0, 0, 0, 0.86], [3.6, 0.1, 1, 0, 0.6, 0, 0.86], [4.2, 0.1, 1, 0, -0.5, 0, 0.86], [4.6, 0.1, 1, 0, 0, 0, 0.86], [5, 0.36, 0.15, 0, 0.3, 0, 1], [5.25, 0.36, 0, 0, 0.3, 0, 0.82], [5.45, 0.36, 0, 0, 0.3, 0, 1]],
  over: [H0, [0.8, 0.75, 0, 0, 1.2, 0, 1], [0.85, 0.75, 0, 1, -1.2, 0, 1], [1.8, 0, 0, 1, 0, 0, 1], [2.6, 0, 0.68, 1, 0, 0, 1], [3.2, 0, 0.68, 1, -0.7, 0, 1], [4, 0, 0.68, 1, 0.7, 0, 1], [4.4, 0, 0.68, 1, 0, 0, 1], [5, 0, 0, 1, 0, 0, 1], [6, 0.75, 0, 1, 1.2, 0, 1], [6.05, 0.75, 0, 0, -1.2, 0, 1], [6.6, 0.36, 0, 0, 0.3, 0, 1]],
  // small ones, so a pause between big plays is never dead air
  look: [H0, [0.5, 0.36, 0, 0, 0.9, 0, 1], [1.5, 0.36, 0, 0, 0.9, 0, 1], [2.1, 0.36, 0, 0, -0.4, 0, 1], [3.1, 0.36, 0, 0, -0.4, 0, 1], [3.6, 0.36, 0, 0, 0.3, 0, 1]],
  stroll: [H0, [1.1, 0.62, 0, 0, 1.3, 0, 1], [1.5, 0.62, 0, 0, -1.3, 0, 1], [2.9, 0.12, 0, 0, -1.3, 0, 1], [3.3, 0.12, 0, 0, 1.3, 0, 1], [4.2, 0.36, 0, 0, 0.3, 0, 1]],
  // reactions to a tap
  boing: [H0, [0.1, 0.36, 0, 0, 0.3, 0, 0.8], [0.34, 0.36, 0.2, 0, 0.3, 0, 1.06], [0.58, 0.36, 0, 0, 0.3, 0, 0.84], [0.72, 0.36, 0, 0, 0.3, 0, 1]],
  duck: [H0, [0.15, 0.36, 0, 0, -0.6, 0, 0.7], [0.9, 0.36, 0, 0, -0.6, 0, 0.7], [1.2, 0.36, 0, 0, 0.3, 0, 1]],
  nod: [H0, [0.15, 0.36, 0, 0, 0.3, 0, 0.94], [0.3, 0.36, 0, 0, 0.3, 0, 1], [0.45, 0.36, 0, 0, 0.3, 0, 0.94], [0.6, 0.36, 0, 0, 0.3, 0, 1]],
};

export const playLength = (name) => { const t = PLAYS[name]; return t ? t[t.length - 1][0] : 0; };

// Plays that pass him behind the glass or carry him far off his spot. Only
// the centre slab has the frost to hide him, and only it has room to roam.
export const CENTRE_ONLY = new Set(['peek', 'round', 'over', 'stroll', 'perch']);

// Personality decides the mix and the tempo (mockup 97's table). `plays` is
// weighted by repetition; `small` fills the pauses.
export const STYLE = {
  commander: { plays: ['perch', 'lean', 'look', 'stroll'], small: ['look', 'nod'], tempo: 1, react: 'boing', rest: [1.6, 3.2] },
  coach: { plays: ['hop', 'perch', 'hop', 'stroll', 'round'], small: ['hop', 'look'], tempo: 1.3, react: 'boing', rest: [0.9, 2.2] },
  cfo: { plays: ['lean', 'round', 'look'], small: ['nod', 'look'], tempo: 0.9, react: 'nod', rest: [2, 3.6] },
  guardian: { plays: ['round', 'lean', 'stroll', 'look'], small: ['look'], tempo: 0.8, react: 'nod', rest: [2.2, 4] },
  researcher: { plays: ['peek', 'over', 'look', 'lean'], small: ['look', 'nod'], tempo: 1, react: 'boing', rest: [1.4, 3] },
  watcher: { plays: ['perch', 'over', 'look'], small: ['look'], tempo: 0.9, react: 'nod', rest: [2, 3.6] },
  librarian: { plays: ['peek', 'over', 'look', 'lean'], small: ['look', 'duck'], tempo: 0.7, react: 'duck', rest: [2.4, 4.2] },
  mealprep: { plays: ['round', 'hop', 'stroll', 'lean'], small: ['hop', 'look'], tempo: 1, react: 'boing', rest: [1.2, 2.8] },
  leader: { plays: ['lean', 'peek', 'look', 'stroll'], small: ['nod', 'look'], tempo: 0.8, react: 'nod', rest: [2, 3.8] },
  practice: { plays: ['over', 'peek', 'hop', 'round'], small: ['look', 'hop'], tempo: 1.1, react: 'boing', rest: [1.2, 2.6] },
};
const DEFAULT_STYLE = STYLE.commander;
export const styleOf = (id) => STYLE[id] || DEFAULT_STYLE;

// The next play: from his repertoire, never the same twice running, a small
// one after a big one about half the time, and only what his slab allows.
export function nextPlay(id, { centre = true, last = null, rnd = Math.random } = {}) {
  const st = styleOf(id);
  const ok = (n) => n !== last && (centre || !CENTRE_ONLY.has(n));
  const big = st.plays.filter(ok);
  const small = st.small.filter(ok);
  const lastWasBig = last && st.plays.includes(last) && !st.small.includes(last);
  const pool = (lastWasBig && small.length && rnd() < 0.5) || !big.length ? (small.length ? small : ['look']) : big;
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// The pause after a play, in seconds: his own range, never the same twice.
export function restAfter(id, rnd = Math.random) {
  const [a, b] = styleOf(id).rest;
  return a + rnd() * (b - a);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// The pose at time t on a track.
export function samplePlay(track, t) {
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1][0]) i++;
  const a = track[i], b = track[Math.min(i + 1, track.length - 1)];
  const u = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 1;
  const yu = b[2] > a[2] ? 1 - (1 - u) * (1 - u) : u * u, e = smooth(u);
  return {
    x: a[1] + (b[1] - a[1]) * e, y: a[2] + (b[2] - a[2]) * yu, behind: a[3],
    yaw: a[4] + (b[4] - a[4]) * e, roll: a[5] + (b[5] - a[5]) * e, sq: a[6] + (b[6] - a[6]) * e,
    moving: Math.abs(b[1] - a[1]) > 0.01 && u < 1,
  };
}
export const HOME_POSE = samplePlay(PLAYS.hop, 0);
