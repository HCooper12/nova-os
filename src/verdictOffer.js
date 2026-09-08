// WHICH EVIDENCE CARD, IF ANY, A REPLY IS ALLOWED TO OFFER.
//
// His report, 9 Sep, with a screenshot: after a conversation with the Leader
// about handling a negative older colleague, the blue EVIDENCE button under
// the reply opened "WHY IS MY CABLE OVERHEAD TRICEP EXTENSION STALLED?".
//
// Two faults, and the second is the one that matters.
//
// 1. The patterns were broken. `/\bstall|plateau|flat|not progress/` reads as
//    `(\bstall)|(plateau)|(flat)|(not progress)` — alternation binds looser
//    than the anchor, so only the FIRST branch ever had a word boundary.
//    "flatten the hierarchy" matched `stalled`; "give them the floor" matched
//    `protein`; "put it in the schedule" matched `peak`; "an exhaustive
//    review" matched `tired`. All four are ordinary leadership English.
//
// 2. A word is not a subject. Every card here is a reading of HIS BODY —
//    lifts, sleep, macros. A reply earns one only if it is actually about
//    that, so a trigger now has to land next to his training vocabulary, and
//    an agent that has no business with his body cannot offer one at all.
//    This is the same lesson as the gym-metaphors-in-leadership correction:
//    a keyword filter is not a domain classifier, and code that guesses the
//    subject from one word will keep guessing wrong.
//
// Pure and separately testable for the reason chatLanes.js is: the failure is
// silent — a wrong card is only ever found by tapping it.

// He is talking about his body: lifts, the session, sleep, food.
const BODY = /\b(?:workouts?|training|train|sessions?|sets?|reps?|kgs?|lbs?|lift|lifts|lifted|lifting|trained|gym|bench|press|squats?|deadlifts?|curls?|rows?|extensions?|raises?|e1rm|rpe|hypertrophy|muscles?|programme|program|push day|pull day|leg day|sleep|slept|sleeping|asleep|hrv|resting heart rate|steps|calories|kcal|macros?|protein|grams?|bodyweight|body weight)\b/;

// Time-of-day energy, the subject the peak card actually reads.
const WHEN = /\b(?:focus|deep work|energy|alert|alertness|concentration|morning|afternoon|evening|today|window)\b/;

// Each card states what makes it relevant, not merely what mentions it.
export const VERDICT_OFFERS = [
  {
    kind: 'tired',
    label: 'Why am I tired? — the evidence',
    trigger: /\b(?:tired|fatigue|fatigued|exhausted|worn out|run down|drained|recovery)\b/,
    anchor: BODY,
  },
  {
    kind: 'stalled',
    label: 'The stall, with its numbers',
    trigger: /\b(?:stall|stalls|stalled|stalling|plateau|plateaued|not progressing|no progress|gone flat|flat for)\b/,
    anchor: BODY,
  },
  {
    kind: 'protein',
    label: 'Protein this week — the maths',
    // "protein" IS the subject; the bare `floor\b` it replaces is what turned
    // "give them the floor" into a nutrition card.
    trigger: /\bprotein\b/,
    anchor: /\b(?:floor|target|intake|short|hit|grams?|macros?|g\b)\b/,
  },
  {
    kind: 'peak',
    label: 'Your peak window today',
    // `schedule` and a bare `focus block` are gone: both are work words.
    trigger: /\b(?:peak window|peak hours?|sharpest|best time to)\b/,
    anchor: WHEN,
  },
];

// Agents with no standing to read his body. The Leader talks about work; a
// training verdict under a leadership answer is a category error before it is
// a relevance one.
const NOT_HIS_BODY = new Set(['leader', 'system', 'you', 'claude', 'breaker']);

export function offerVerdictFor(text, { agent } = {}) {
  if (agent && NOT_HIS_BODY.has(agent)) return null;
  const t = `${text ?? ''}`.toLowerCase();
  if (!t) return null;
  for (const v of VERDICT_OFFERS) {
    if (v.trigger.test(t) && v.anchor.test(t)) return { kind: v.kind, label: v.label };
  }
  return null;
}
