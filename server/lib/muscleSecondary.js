// The secondary-muscle table, server side. The rules themselves live in
// src/muscleCredit.js so the client and server count with ONE table (shared
// formats are contracts); this is the name the server imports them by.
//
// secondaryFor(exercise) → the muscles an exercise also trains, never its
// primary: the library's own `secondary: [...]` when set, else the first
// matching name rule. creditsFor(exercise) → [{ muscle, credit }], primary 1,
// each secondary ½ (Pelland et al. 2024's fractional count).
export {
  secondaryFor, tableSecondary, creditsFor, creditsById, emptyTally, addSets, formatSets, INDIRECT_CREDIT,
} from '../../src/muscleCredit.js';
