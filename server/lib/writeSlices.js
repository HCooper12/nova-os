// WHICH SLICES A WRITE ACTUALLY CHANGED.
//
// Every successful write broadcasts down the event stream, and the client's
// answer to a nudge used to be "re-fetch everything" — a full snapshot, ~30
// slices, for a single todo checkbox. Tapping through a workout fired one of
// those per set. This maps a write's path to the slices it can possibly have
// touched, so the client can pull three instead of thirty.
//
// THE SAFETY PROPERTY, and it is the whole design: an unknown path returns
// null, meaning "I don't know — sync everything", which is exactly today's
// behaviour. Under-tagging a path is the only way this can hurt: a slice that
// changed but wasn't named goes stale on screen with no error anywhere, and
// Nova would be quietly lying about the state of the vault. So:
//
//   - Only paths whose blast radius is UNDERSTOOD get tagged.
//   - Polymorphic write paths stay untagged on purpose. /intent routes one
//     input to any surface; an /inbox approval can mint a note, a todo, a
//     shopping item. Naming slices for those would be guessing.
//   - When in doubt, list MORE slices. An extra slice costs one cheap local
//     fetch inside the snapshot; a missing one costs the truth.
//
// The dependency lists below were read out of the libs, not assumed:
//   streaks    <- workoutSessions, healthData          (lib/streaks.js)
//   fuelCross  <- workoutSessions, foodLog, rotation, recipes, fitnessGoals
//                                                      (lib/fuelCross.js)

// Ordered: the first pattern that matches wins, so put the specific ones
// above the general ones.
export const WRITE_SLICE_MAP = [
  // — Fuel —
  // a logged meal moves today's totals, both rollups, and the training
  // cross-reference that reads foodLog directly
  { test: /^\/food-log(\/|$)/, slices: ['foodLog', 'nutritionMonth', 'nutritionWeek', 'fuelCross'] },
  // marking a rotation slot eaten (or overriding a variant) feeds fuelCross
  { test: /^\/rotation(\/|$)/, slices: ['rotation', 'fuelCross', 'nutritionWeek'] },
  // recipes reach further than they look: rotation renders them, fuelCross
  // reads them, editing one can queue an undo record on the inbox rails, and
  // "add ingredients" writes the shopping list
  { test: /^\/recipes(\/|$)/, slices: ['recipes', 'rotation', 'fuelCross', 'shoppingList', 'inbox'] },

  // — Train —
  // finishing a session rewrites the overview, the streak, and the fuel
  // cross-reference; routine/exercise edits move the library and the plan
  { test: /^\/workouts(\/|$)/, slices: ['workoutExercises', 'workoutRoutines', 'workoutGoals', 'trainOverview', 'fuelCross', 'streaks'] },
  { test: /^\/health-data(\/|$)/, slices: ['healthData', 'healthInsight', 'streaks'] },

  // — Capture —
  // a journal entry is a real vault note: it lands in the note list and the
  // graph as well as the journal feed
  { test: /^\/journal(\/|$)/, slices: ['journal', 'notes', 'graph'] },
  { test: /^\/notes(\/|$)/, slices: ['notes', 'graph', 'library'] },
  { test: /^\/stash(\/|$)/, slices: ['stash'] },
  { test: /^\/shopping-list(\/|$)/, slices: ['shoppingList'] },
  { test: /^\/todos(\/|$)/, slices: ['todos'] },

  // — Settings-ish, self-contained —
  { test: /^\/money(\/|$)/, slices: ['money'] },
  // macro targets live on the profile; rotation and fuelCross render against them
  { test: /^\/profile(\/|$)/, slices: ['profile', 'rotation', 'fuelCross'] },

  // DELIBERATELY ABSENT (these must fall through to a full sync):
  //   /intent   — the front door, routes to any surface
  //   /inbox    — approving a record can write a note, a todo, a list item…
  //   /ingest, /loops, /studio, /ops, /overnight, /claude-code — broad or
  //             cross-cutting effects that aren't worth pretending to know
];

// Several routes ALSO fire their own domain broadcast — broadcast('todos'),
// broadcast('health') — alongside the generic chokepoint one. Those arrive
// untagged, and since one untagged nudge correctly forces the client into a
// full sync, leaving them untagged would cancel out every tag we just added.
// (Measured in a browser: a todo write emitted a tagged 'write' AND an
// untagged 'todos', and the client full-synced.) Same rule as paths — a kind
// that isn't named here means "unknown", not "nothing".
export const KIND_SLICE_MAP = {
  todos: ['todos'],
  notes: ['notes', 'graph', 'library'],
  money: ['money'],
  calendar: ['calendar'],
  health: ['healthData', 'healthInsight', 'streaks'],
  // 'inbox'  — an approval can write a note, a todo, a list item: untagged
  // 'forge'  — broad, cross-cutting: untagged
  // 'write'  — the generic chokepoint kind; its tag comes from the path
};

// Slices a domain broadcast kind implies, or null for "unknown — resync all".
export function slicesForKind(kind) {
  const slices = KIND_SLICE_MAP[kind];
  return slices && slices.length ? slices : null;
}

// Returns the slice keys a write to `path` can have touched, or null for
// "unknown — resync everything". Never returns an empty array: an empty list
// would read as "nothing changed" and leave the screen silently stale.
export function slicesForPath(path) {
  if (typeof path !== 'string' || !path) return null;
  // ignore query strings and normalise a trailing slash away
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  for (const entry of WRITE_SLICE_MAP) {
    if (entry.test.test(clean)) return entry.slices.length ? entry.slices : null;
  }
  return null;
}
