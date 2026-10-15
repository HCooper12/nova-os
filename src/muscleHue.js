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
// The groups are the library's own (src/muscleTaxonomy.js MUSCLE_GROUPS),
// pinned by server/test/muscleHue.test.js so a group added there cannot
// arrive colourless.
//
// THE SPLIT GROUPS (15 Oct 2026) keep their family's hue and lean away from
// it: the front delts wear the old Shoulders amber, the side and rear heads
// lean toward coral and lilac; the lats wear the old Back teal, the upper
// back, traps and lower back lean toward blue, sage and grey. Their tokens
// are colour-mixes of the existing --nv-m-* tokens (src/muscleTaxonomy.css),
// so every theme's adjustment reaches them with no new theme block.

import { LEGACY_GROUPS } from './muscleTaxonomy.js';

export const MUSCLE_TOKEN = {
  Chest: '--nv-m-chest',
  'Front Delts': '--nv-m-shoulders',
  'Side Delts': '--nv-m-side-delts',
  'Rear Delts': '--nv-m-rear-delts',
  Lats: '--nv-m-back',
  'Upper Back': '--nv-m-upper-back',
  Traps: '--nv-m-traps',
  'Lower Back': '--nv-m-lower-back',
  Biceps: '--nv-m-biceps',
  Triceps: '--nv-m-triceps',
  Forearms: '--nv-m-forearms',
  Quads: '--nv-m-quads',
  Hamstrings: '--nv-m-hamstrings',
  Glutes: '--nv-m-glutes',
  Adductors: '--nv-m-adductors',
  Abductors: '--nv-m-abductors',
  Calves: '--nv-m-calves',
  Abs: '--nv-m-abs',
  'Full Body': '--nv-m-full',
  Grip: '--nv-m-grip',
  Mobility: '--nv-m-mobility',
};

// The tokens that are a mix of two existing ones, as src/muscleTaxonomy.css
// declares them: [first token, its share, second token]. Pinned by the test.
export const MIXED_TOKEN = {
  '--nv-m-side-delts': ['--nv-m-shoulders', 50, '--nv-m-chest'],
  '--nv-m-rear-delts': ['--nv-m-shoulders', 55, '--nv-m-triceps'],
  '--nv-m-upper-back': ['--nv-m-back', 55, '--nv-m-quads'],
  '--nv-m-traps': ['--nv-m-back', 50, '--nv-m-abs'],
  '--nv-m-lower-back': ['--nv-m-back', 60, '--nv-m-chest'],
  '--nv-m-adductors': ['--nv-m-quads', 55, '--nv-m-glutes'],
  '--nv-m-abductors': ['--nv-m-glutes', 55, '--nv-m-chest'],
  '--nv-m-grip': ['--nv-m-forearms', 55, '--nv-m-mobility'],
};

// The hex each token resolves to on the dark ground — the source of truth for
// index.css, and what canvas/WebGL callers use when they cannot read CSS.
// A mixed token's hex is its srgb mix of the two dark-ground hexes.
export const MUSCLE_HEX = {
  Chest: '#ff8a7a',
  'Front Delts': '#ffc46b',
  'Side Delts': '#ffa772',
  'Rear Delts': '#ddabae',
  Lats: '#4fd1c5',
  'Upper Back': '#62c6df',
  Traps: '#a7d498',
  'Lower Back': '#95b5a7',
  Biceps: '#5fe8a8',
  Triceps: '#b48cff',
  Forearms: '#e0b26a',
  Quads: '#7ab8ff',
  Hamstrings: '#5aa0ff',
  Glutes: '#c98bff',
  Adductors: '#9ea4ff',
  Abductors: '#e18bc3',
  Calves: '#8fd3ff',
  Abs: '#ffd66b',
  'Full Body': '#59e6ff',
  Grip: '#c0c294',
  Mobility: '#9ad5c8',
};

// The anatomy the body draws (server/lib/muscles.js MUSCLES — eighteen
// regions) filed under the group whose hue it wears. Since the split, each
// region is its own group's: rhomboids are the upper back, the erectors the
// lower back, the adductors their own group.
export const ANATOMY_GROUP = {
  chest: 'Chest',
  'front-delts': 'Front Delts', 'side-delts': 'Side Delts', 'rear-delts': 'Rear Delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs', obliques: 'Abs',
  lats: 'Lats', rhomboids: 'Upper Back', traps: 'Traps', 'lower-back': 'Lower Back',
  glutes: 'Glutes',
  quads: 'Quads', adductors: 'Adductors',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

// Two groups own no region of their own on the figure: glute medius
// (Abductors) sits on the glutes, grip in the forearms. They light those.
const SHARED_REGIONS = { Abductors: ['glutes'], Grip: ['forearms'] };

// Callers arrive with 'Chest', 'chest' and 'CHEST' (the volume bars lower-case
// their labels); the map answers all of them.
// An old name ('Shoulders', 'Back', in his goal text or an old card) wears
// the hue of the head that kept the family's colour.
const BY_KEY = Object.fromEntries(Object.keys(MUSCLE_TOKEN).map((k) => [k.toLowerCase(), k]));
const LEGACY_KEY = Object.fromEntries(Object.entries(LEGACY_GROUPS).map(([k, fam]) => [k.toLowerCase(), fam[0]]));
function groupOf(name) {
  if (!name) return null;
  const s = String(name).trim().toLowerCase();
  return BY_KEY[s] || LEGACY_KEY[s] || (ANATOMY_GROUP[s] ?? null);
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
      // a mixed token reads back as its color-mix() source, which a canvas
      // cannot always paint: only a resolved colour is returned as live
      if (v && /^(#|rgb)/i.test(v)) return v;
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
  // his own words may use an old name ("shoulders", "back"); the chip shows
  // the word he used. Longest names first, so "lower back" is one group, not
  // "lower back" and "back".
  const names = [...Object.keys(MUSCLE_TOKEN), ...Object.keys(LEGACY_GROUPS)].sort((a, b) => b.length - a.length);
  const taken = [];
  const found = [];
  for (const group of names) {
    const re = new RegExp(`\\b${group.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    let m;
    while ((m = re.exec(s))) {
      const from = m.index;
      const to = from + m[0].length;
      if (taken.some(([a, b]) => from < b && to > a)) continue;
      taken.push([from, to]);
      if (!found.some((f) => f.group === group)) found.push({ group, at: from });
      break;
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.group);
}

// THE INVERSE — a group's regions, for lighting a whole group at once. The
// spoken report says "chest" or "triceps" (the library's filing), and the
// figure lights anatomy ids; this is the join. Order is the ANATOMY_GROUP
// order, which puts the largest region first.
export function anatomyOf(group) {
  const key = String(group || '').trim().toLowerCase();
  const legacy = Object.keys(LEGACY_GROUPS).find((k) => k.toLowerCase() === key);
  if (legacy) return LEGACY_GROUPS[legacy].flatMap((g) => anatomyOf(g));
  const g = groupOf(group);
  if (!g) return [];
  if (SHARED_REGIONS[g]) return [...SHARED_REGIONS[g]];
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
