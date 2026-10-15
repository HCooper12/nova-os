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

export const isMuscleGroup = (name) => MUSCLE_GROUPS.includes(name);
export const countsAsVolume = (group) => isMuscleGroup(group) && !NON_VOLUME.has(group);
