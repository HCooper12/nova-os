// EACH MUSCLE OWNS ITS HUE — one map, read everywhere a muscle is coloured.
//
// His instruction, 22 Sep 2026: "a bit more varied colour, but with a purpose
// to denote different things such as different muscle focus", and "apply the
// muscle palette across the platform so it's always in sync and consistent."
// So the figure's lit muscle, the volume bars, a report's session rail and a
// panel's chip all take their colour from the same token. The tokens live in
// src/index.css (`--nv-m-*`) so the four themes can adjust lightness without
// any caller knowing; this file only names them.
//
// The groups are the exercise library's own (server/lib/exercises.js
// MUSCLE_GROUPS) — pinned by server/test/muscleHue.test.js so a group added
// there cannot arrive colourless.

export const MUSCLE_TOKEN = {
  Chest: '--nv-m-chest',
  Back: '--nv-m-back',
  Shoulders: '--nv-m-shoulders',
  Biceps: '--nv-m-biceps',
  Triceps: '--nv-m-triceps',
  Quads: '--nv-m-quads',
  Hamstrings: '--nv-m-hamstrings',
  Glutes: '--nv-m-glutes',
  Calves: '--nv-m-calves',
  Abs: '--nv-m-abs',
  Forearms: '--nv-m-forearms',
  'Full Body': '--nv-m-full',
  Mobility: '--nv-m-mobility',
};

// The hex each token resolves to on the dark ground — the source of truth for
// index.css, and what canvas/WebGL callers use when they cannot read CSS.
export const MUSCLE_HEX = {
  Chest: '#ff8a7a',
  Back: '#4fd1c5',
  Shoulders: '#ffc46b',
  Biceps: '#5fe8a8',
  Triceps: '#b48cff',
  Quads: '#7ab8ff',
  Hamstrings: '#5aa0ff',
  Glutes: '#c98bff',
  Calves: '#8fd3ff',
  Abs: '#ffd66b',
  Forearms: '#e0b26a',
  'Full Body': '#59e6ff',
  Mobility: '#9ad5c8',
};

// The anatomy the body draws (server/lib/muscles.js MUSCLES — eighteen
// regions) filed under the group whose hue it wears. "Back" is a filing
// drawer; lats, traps, rhomboids and the lower back all sit in it, so all
// four light teal. The one judgement call: adductors ride with the quads —
// same hue family, same side of the leg.
export const ANATOMY_GROUP = {
  chest: 'Chest',
  'front-delts': 'Shoulders', 'side-delts': 'Shoulders', 'rear-delts': 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs', obliques: 'Abs',
  lats: 'Back', traps: 'Back', rhomboids: 'Back', 'lower-back': 'Back',
  glutes: 'Glutes',
  quads: 'Quads', adductors: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

// Callers arrive with 'Chest', 'chest' and 'CHEST' (the volume bars lower-case
// their labels); the map answers all of them.
const BY_KEY = Object.fromEntries(Object.keys(MUSCLE_TOKEN).map((k) => [k.toLowerCase(), k]));
function groupOf(name) {
  if (!name) return null;
  const s = String(name).trim().toLowerCase();
  return BY_KEY[s] || (ANATOMY_GROUP[s] ?? null);
}

/** `var(--nv-m-…)` for a group or an anatomy id, with a neutral fallback. */
export function muscleVar(group) {
  const t = MUSCLE_TOKEN[groupOf(group)];
  return t ? `var(${t})` : 'var(--nv-ink40)';
}

/** The resolved colour as hex — reads the live token when a document exists
 *  (so a theme's adjustment wins), else the dark-ground value. */
export function muscleHex(name) {
  const group = groupOf(name);
  const t = MUSCLE_TOKEN[group];
  if (!t) return null;
  try {
    if (typeof document !== 'undefined') {
      const v = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
      if (v) return v;
    }
  } catch { /* no DOM — fall through */ }
  return MUSCLE_HEX[group] || null;
}

/** The dark-ground hex for an anatomy id or group, never the live token —
 *  for WebGL, where a theme's lightness tweak would fight the lighting. */
export function muscleHexStatic(name) {
  return MUSCLE_HEX[groupOf(name)] || null;
}

/** A Body3D palette for an exercise of this group: the lit muscle in its own
 *  hue, the secondary a step cooler. Null when the group is unknown, so the
 *  figure keeps its default. */
export function musclePalette(group) {
  const primary = muscleHex(group);
  if (!primary) return null;
  return { primary, secondary: '#59e6ff' };
}

/** The muscle groups a piece of his own prose names, in the order it names
 *  them — "triceps, biceps and shoulders" → ['Triceps','Biceps','Shoulders'].
 *  Whole words, case-insensitive, each group once; nothing is inferred (no
 *  "arms" → biceps), because a chip in a muscle's hue is a claim the text
 *  must actually make. */
export function musclesNamed(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return [];
  const found = [];
  for (const group of Object.keys(MUSCLE_TOKEN)) {
    const re = new RegExp(`\\b${group.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(s);
    if (m) found.push({ group, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.group);
}

// THE INVERSE — a group's regions, for lighting a whole group at once. The
// spoken report says "chest" or "triceps" (the library's filing), and the
// figure lights anatomy ids; this is the join. Order is the ANATOMY_GROUP
// order, which puts the largest region first.
export function anatomyOf(group) {
  const g = groupOf(group);
  if (!g) return [];
  return Object.entries(ANATOMY_GROUP).filter(([, gg]) => gg === g).map(([id]) => id);
}

// WHICH SIDE THE CAMERA SHOULD STAND ON to see a region — a copy of the
// `views` in server/lib/muscles.js, pinned to it by the test, because the
// figure on the glass has to choose its angle before any server answers.
export const MUSCLE_SIDE = {
  chest: 'front', 'front-delts': 'front', biceps: 'front', abs: 'front', obliques: 'front',
  quads: 'front', adductors: 'front',
  'side-delts': 'front', forearms: 'front',           // visible from both; front reads better
  'rear-delts': 'back', triceps: 'back', lats: 'back', traps: 'back', rhomboids: 'back',
  'lower-back': 'back', glutes: 'back', hamstrings: 'back', calves: 'back',
};

/** The camera side for a set of regions — back only when every one of them
 *  is a back-only region, so a mixed group (shoulders) is seen from the front. */
export function sideFor(ids) {
  const list = (ids || []).filter((id) => MUSCLE_SIDE[id]);
  if (!list.length) return 'three-quarter';
  return list.every((id) => MUSCLE_SIDE[id] === 'back') ? 'back' : 'front';
}
