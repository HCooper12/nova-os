// What each lift trains, server side. The rules live in src/muscleCredit.js
// (with the audited table in src/muscleAudit.js and the groups in
// src/muscleTaxonomy.js) so the client and server count with ONE rule
// (shared formats are contracts); this is the name the server imports them by.
//
// resolveMuscles(exercise) → its audited primary + secondaries, his own
// approved mapping first; creditsFor(exercise) → [{ muscle, credit }],
// primary 1, each secondary ½ (Pelland et al. 2024), and nothing for an
// unaudited lift or a non-volume filing.
export {
  resolveMuscles, secondaryFor, creditsFor, creditsById, emptyTally, addSets, formatSets, INDIRECT_CREDIT,
  NO_SECONDARY, isUnaudited, uncountedLine, auditedRow, suggestMapping, suggestPrimary, nearestAudited, PRIMARY_RULES,
  alsoWorksLine,
} from '../../src/muscleCredit.js';
export { AUDITED, AUDIT_PATTERNS, IN_PROGRAM_AT_AUDIT } from '../../src/muscleAudit.js';
export { MUSCLE_GROUPS, NON_VOLUME, VOLUME_GROUPS, LEGACY_GROUPS, canonicalGroup, legacyGroup, expandGroup } from '../../src/muscleTaxonomy.js';
