// THE MUSCLE GROUPS (15 Oct 2026). One list, shared by the server and the
// client, because every per-muscle count, colour, split rule and picker reads
// it and two copies of a list are two lists.
//
// His approval, 15 Oct: Shoulders became the three delt heads and Back became
// Lats, Upper Back (mid traps and rhomboids), Traps (upper) and Lower Back
// (erectors); Adductors and Abductors joined (a hip abduction is glute
// medius, not the glute max a hip thrust is measured against). Abs keeps the
// obliques.
//
// Three filings are NOT muscles and never take hypertrophy volume: Mobility
// (adherence work), Full Body (conditioning, Olympic lifts, carries: no one
// muscle owns it) and Grip (a dead hang trains holding on, not a muscle's
// growth). Their sets are still logged and shown; they just never count.

export const MUSCLE_GROUPS = [
  'Chest',
  'Front Delts', 'Side Delts', 'Rear Delts',
  'Lats', 'Upper Back', 'Traps', 'Lower Back',
  'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Abductors', 'Calves',
  'Abs',
  'Full Body', 'Grip', 'Mobility',
];

export const NON_VOLUME = new Set(['Mobility', 'Full Body', 'Grip']);
export const VOLUME_GROUPS = MUSCLE_GROUPS.filter((g) => !NON_VOLUME.has(g));

// THE OLD NAMES, READ AS ALIASES. His vault still says "Shoulders" and "Back"
// in places (the library's own filing, his goal text, a card raised before
// the split), and nothing there is rewritten: each old name reads as the
// family it became.
export const LEGACY_GROUPS = {
  Shoulders: ['Front Delts', 'Side Delts', 'Rear Delts'],
  Back: ['Lats', 'Upper Back', 'Traps', 'Lower Back'],
};

const BY_LOWER = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.toLowerCase(), g]));
const LEGACY_LOWER = Object.fromEntries(Object.keys(LEGACY_GROUPS).map((g) => [g.toLowerCase(), g]));

/** The current group a name means, any casing; null for an old or unknown name. */
export function canonicalGroup(name) {
  return BY_LOWER[String(name || '').trim().toLowerCase()] || null;
}

/** The old name ('Shoulders', 'Back') a string is, any casing; else null. */
export function legacyGroup(name) {
  return LEGACY_LOWER[String(name || '').trim().toLowerCase()] || null;
}

/** Every current group a name stands for: itself, an old name's family, or []. */
export function expandGroup(name) {
  const g = canonicalGroup(name);
  if (g) return [g];
  const old = legacyGroup(name);
  return old ? [...LEGACY_GROUPS[old]] : [];
}

// THE GROWTH RANGE (16 Oct 2026, his decision): 10 to 20 working sets per
// muscle per week, counted the house way (1 per focus set, ½ per accessory
// set). Below 10 a muscle is short; above 20 more sets stop buying growth.
// Every surface that judges a week's volume reads THIS pair: the weekly
// sets sheet, the Train bars, Coach's under- and junk-volume checks and the
// Coach context. A muscle can carry its own range for a goal (his fitness
// goals' `volumeRanges`, set by Coach on his yes); rangeFor reads it.
export const VOLUME_RANGE = Object.freeze([10, 20]);

/** One muscle's [low, high]: his goal's override for it, else VOLUME_RANGE. */
export function rangeFor(muscle, overrides = null) {
  const r = overrides && Object.hasOwn(overrides, muscle) ? overrides[muscle] : null;
  return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : [...VOLUME_RANGE];
}

export const isMuscleGroup = (name) => MUSCLE_GROUPS.includes(name);
export const countsAsVolume = (group) => isMuscleGroup(group) && !NON_VOLUME.has(group);
