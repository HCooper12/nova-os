// The anatomy vocabulary — the contract between the exercise atlas, the
// exercise panel and the body map the client draws.
//
// His ask, from a Lyfta screen recording: an exercise should show WHICH
// MUSCLES IT TRAINS on a body diagram, not just the coarse group it is filed
// under. The library's twelve `muscleGroup` values are a filing system ("Back"
// covers lats, traps, rhomboids and erectors); this is the anatomy.
//
// Deliberately a CLOSED list. A muscle name that is not in here is rejected
// rather than passed through — an atlas entry naming "posterior chain" would
// otherwise light nothing on the diagram and no one would find out, which is
// the silent-failure shape this codebase keeps paying for.
//
// `views` says which side of the body the region is drawn on, so the client
// knows whether to render one diagram or two, and never draws an empty one.
export const MUSCLES = {
  chest: { label: 'Chest', views: ['front'] },
  'front-delts': { label: 'Front delts', views: ['front'] },
  'side-delts': { label: 'Side delts', views: ['front', 'back'] },
  'rear-delts': { label: 'Rear delts', views: ['back'] },
  biceps: { label: 'Biceps', views: ['front'] },
  triceps: { label: 'Triceps', views: ['back'] },
  forearms: { label: 'Forearms', views: ['front', 'back'] },
  abs: { label: 'Abs', views: ['front'] },
  obliques: { label: 'Obliques', views: ['front'] },
  lats: { label: 'Lats', views: ['back'] },
  traps: { label: 'Traps', views: ['back'] },
  rhomboids: { label: 'Rhomboids', views: ['back'] },
  'lower-back': { label: 'Lower back', views: ['back'] },
  glutes: { label: 'Glutes', views: ['back'] },
  quads: { label: 'Quads', views: ['front'] },
  hamstrings: { label: 'Hamstrings', views: ['back'] },
  calves: { label: 'Calves', views: ['back'] },
  adductors: { label: 'Adductors', views: ['front'] },
};

export const MUSCLE_IDS = Object.keys(MUSCLES);

// Equipment vocabulary — mirrors what he actually has (written into his
// Fitness Goals on 4 Sep) plus bodyweight and the two odds and ends.
export const EQUIPMENT = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'EZ-bar', 'Kettlebell',
  'Bodyweight', 'Band', 'Plate', 'Other',
];

export function isMuscle(id) { return Object.hasOwn(MUSCLES, String(id)); }
export function muscleLabel(id) { return MUSCLES[id]?.label || null; }

// Which body views a set of muscles needs. Returns them in drawing order so
// the front diagram is always first, and an empty array when nothing maps —
// the caller then shows no diagram rather than a blank silhouette.
export function viewsFor(muscleIds = []) {
  const want = new Set();
  for (const id of muscleIds) for (const v of MUSCLES[id]?.views || []) want.add(v);
  return ['front', 'back'].filter((v) => want.has(v));
}

// The panel's shape for one exercise's anatomy: ids kept for the diagram,
// labels for the text. Unknown ids are dropped here rather than rendered —
// but `dropped` is returned so a caller (and the test suite) can SEE that a
// name failed to map instead of it vanishing quietly.
export function resolveMuscles(primary = [], secondary = []) {
  const clean = (list) => {
    const kept = [];
    const dropped = [];
    for (const id of list || []) (isMuscle(id) ? kept : dropped).push(id);
    return { kept, dropped };
  };
  const p = clean(primary);
  const s = clean(secondary);
  // a muscle named as both is primary — saying "primary AND secondary" on a
  // diagram means colouring one region two ways
  const secondaryOnly = s.kept.filter((id) => !p.kept.includes(id));
  return {
    primary: p.kept,
    secondary: secondaryOnly,
    primaryLabels: p.kept.map(muscleLabel),
    secondaryLabels: secondaryOnly.map(muscleLabel),
    views: viewsFor([...p.kept, ...secondaryOnly]),
    dropped: [...p.dropped, ...s.dropped],
  };
}
