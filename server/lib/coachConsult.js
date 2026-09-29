// CONSULT — the Coach asks the other agents before it answers.
//
// His ask, 25 Sep 2026: "coach should be able to reach out to other agents for
// support if it needs it", and "I don't care if it takes longer or costs more
// per question (remember no caps on the work)."
//
// Since 29 Sep this is the shared rail every agent uses (lib/consult.js: his
// "nothing should be walled off"). This file stays so the Coach's importers
// and tests keep working: the registry, the parse, the parallel run, the
// progress bubble and the hand-back are all the rail's, re-exported here.

export {
  AGENTS as CONSULT_AGENTS,
  MAX_CONSULT_ROUNDS,
  consultCapability,
  parseConsult,
  consultProgress,
  consultReplyText,
  runConsults,
  formatFortnight,
} from './consult.js';
