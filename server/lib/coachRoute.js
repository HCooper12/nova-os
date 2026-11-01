// WHICH COACH QUESTIONS THE MODEL ON THIS MAC MAY ANSWER (1 Nov 2026).
//
// The local Coach (lib/localCoach.js) was benched on 27 Oct on 17 of his real
// Coach questions (design/audits/2026-10-27-local-coach-bench.md). It was fast
// (9.1 s median) and confidently wrong exactly where a wrong answer costs him:
// it inverted the overhead-extension cue (#6), invented "18 sessions in four
// weeks" (#9), put his own Coaching Principles in Huberman's mouth (#16),
// broke off mid-answer with "Wait, that's not right" (#5), and told him it
// "cannot access your personal training data" on a plan report (#17). And it
// handed up 0 times in 34 turns: the prompt's ESCALATE rule alone does not
// work on the 4B. His decision that day: hand-up rules IN CODE, then the same
// 17 questions again.
//
// So code decides twice, the shape lib/askRoute.js gave Ask Nova on 29 Oct:
//   - before the turn (coachNeedsClaude): a question of a kind the 4B gets
//     wrong with confidence goes to Claude's Coach and the model on this Mac
//     is never asked. Each rule carries a reason he can read ("form cues go to
//     Claude"), shown as "asked Claude · why".
//   - after the turn (coachGaveUp): a local reply that gives up, claims an
//     action, contradicts itself or breaks off is never shown; the same job is
//     handed to Claude (lib/askDispatch.js holdForEscalation).
// What stays on this Mac: a lookup of his own numbers ("what did I bench last
// session", "how much protein today"), a definition, a scheduling fact, an
// exercise suggestion, "how should I add volume". The bench showed those were
// answered from the right tool, in his numbers, in under 10 s.
//
// A false positive costs one Claude turn; a false negative costs him a wrong
// answer about his body. The lists lean towards Claude, but each one is
// narrow enough that a plain lookup never trips it (server/test/coachRoute.test.js
// holds both lists, from his own words).

import { needsClaude, gaveUp, subject, COMPARISON_RE, BETTER_THAN_RE, WHY_RE } from './askRoute.js';

// his corrections and "did that change land?" (askRoute's own rules), then
// the Coach's. Order matters only for which reason he reads.
const RULES = [
  // A REVIEW, REPORT OR ANALYSIS. Bench #17: a plan report got an invented
  // plan in one run and "I cannot access your personal training data" in the
  // other; #14 ("give me a detailed report") called his four core days a
  // five-day plan. A whole-program read is Claude's assembly, not a 4B's.
  [/\b(?:review|report|analy[sz]e|analysis|audit|(?:re-? ?)?evaluat(?:e|ion)|assess(?:ment)?|conduct (?:some )?research|deep dive|what the plan found|break ?down (?:of )?(?:my|the|this) (?:program(?:me)?|plan|week|split|training|routine|block)|overview of my (?:program(?:me)?|training|week))\b/,
    'a review of your program goes to Claude'],
  // A NAMED EXPERT OR SOURCE. Bench #16 credited his own page to Huberman.
  // Who said what is a fact the 4B does not hold and cannot look up.
  [/\b(?:huberman|mentzer|nippard|schoenfeld|israetel|galpin|attia|helms|renaissance periodi[sz]ation|stronger by science|according to|experts?|the evidence|evidence (?:says|shows|suggests)|evidence-based|stud(?:y|ies) (?:show|shows|say|says|suggest|suggests|found)|research (?:says|shows|suggests|found)|the (?:research|science|literature)|science says|meta-?analys[ie]s|is it true|a myth|what (?:does|do|did) (?!my\b|your\b|it\b|that\b|this\b|the (?:log|program|plan|data|app|card|panel)\b)[a-z][a-z'.-]*(?: [a-z][a-z'.-]*)? (?:say|recommend|think|suggest))\b/,
    'what an expert or the research says goes to Claude'],
  // PAIN, INJURY, A NIGGLE, A JOINT. His injury log is live; a wrong answer
  // here costs more than a Claude call. Plain "sore" is left alone (soreness
  // after a session is a lookup-and-reassure, not an injury).
  [/\b(?:pain|painful|hurts?|hurting|injur(?:y|ies|ed|ing)|niggle[sd]?|niggly|tweak(?:ed|ing)|strain(?:ed)?|sprain(?:ed)?|ach(?:e|es|ing|y)|twinge[sd]?|impinge(?:ment|d)?|tendon(?:s|itis)?|tendin(?:itis|opathy|osis)|joints?|numb(?:ness)?|tingl(?:e|es|ing)|swollen|swelling|rotator cuff|bursitis|physio|sore (?:shoulder|knee|elbow|wrist|hip|neck|lower back)|(?:shoulder|knee|elbow|wrist|hip|neck|back) (?:is|feels|has been|was) (?:sore|tight|stiff))\b/,
    'anything about pain or an injury goes to Claude'],
  // FORM, TECHNIQUE, CUES, MISTAKES. Bench #6: the 4B told him to keep his
  // elbows low on an overhead extension, the opposite of the cue that makes
  // the exercise work. A wrong cue can hurt him.
  [/\b(?:form|technique|cues?|cueing|common mistakes?|mistakes? (?:i|people) make|am i (?:doing|performing) (?:[\w'-]+ ){0,4}(?:right|correctly|properly|wrong)|(?:doing|performing) (?:it|this|that) (?:right|correctly|properly|wrong)|(?:talk|walk) me through (?!what\b|my (?:program|plan|week|split)\b|the plan\b)|how (?:do|should) i (?:perform|execute|brace|grip|set up for)|range of motion)\b/,
    'form cues go to Claude'],
  // COUNTING ACROSS TIME. Bench #9 invented "18 sessions in four weeks". Only
  // the clear across-time phrasings: "how many" or "how often" with a span of
  // weeks or months. "How many sets today" stays a lookup.
  [/\bhow (?:many|often)\b.*\b(?:(?:last|past|previous|over the (?:last|past)) (?:\d+|few|couple(?: of)?|two|three|four|five|six|eight|several) (?:weeks|months|sessions|workouts|days)|(?:last|past|this) (?:month|year|block|cycle|mesocycle)|since (?:i (?:started|began)|the start)|on average|per (?:week|month) on average|across (?:the|my|all) (?:weeks|months|block|program))\b/,
    'a count across weeks goes to Claude'],
];

// a choice between options he is weighing, or an open "what should I do?"
// about a problem: a judgement the 4B made with confidence and got wrong
// (bench #5, #9). A plain "should I replace X?" or "how should I add volume?"
// stays here: the bench answered those from his program.
const CHOICE = /\bor should i\b|\bwhich (?:one |exercise |of (?:them|these|those) )?(?:should i|is (?:better|best)|would be (?:better|best)|'s (?:better|best))\b|\bshould i\b.{0,80}\b(?:instead of|rather than)\b/;
// ("what should I do today?" is his schedule, a lookup, and stays here)
const OPEN_ADVICE = /\bwhat (?:should|do|would you have) i do\b(?! (?:today|tonight|tomorrow|next|first|now|on (?:mon|tues|wednes|thurs|fri|satur|sun)day|this (?:morning|afternoon|evening|week)|for (?:my |the )?(?:warm-?up|cardio|session|workout)))/;
// causality beyond askRoute's WHY_RE ("why has my bench stalled", "what's the fix")
const CAUSE = /\bwhy (?:has|have|am|was|were|isn't|aren't|hasn't|haven't|won't|can't|doesn't|don't)\b|\bwhat(?:'s| is) (?:the fix|causing|behind)\b|\bwhat caused\b|\bhow (?:do|can) i fix\b/;

// mid-session words that mean pain only while he is training: "felt a pinch",
// "it clicked", "something popped" (outside a session, "pinch grip" is a lift)
const LIVE_PAIN = /\b(?:pinch(?:ed|ing)?|click(?:ed|ing|s)?|popp?(?:ed|ing)|felt (?:something|a|it)|doesn't feel right|feels? off|weird feeling)\b/;

/** Should this Coach question go straight to Claude's Coach? Pure.
 *  `liveSession`: a session in progress (any truthy value) widens the pain
 *  words to the ones that only mean pain mid-set.
 *  Returns { claude, why }: why is '' when the model on this Mac may answer. */
export function coachNeedsClaude(question, { liveSession = null } = {}) {
  const raw = String(question || '');
  // askRoute's own: his correction of the last answer, whether a change
  // landed, "ask Claude"
  const asked = needsClaude(raw);
  if (asked) return { claude: true, why: asked };
  // his own past ("better than last week") is a lookup, not a comparison
  const q = subject(raw);
  if (!q) return { claude: false, why: '' };
  for (const [re, why] of RULES) if (re.test(q)) return { claude: true, why };
  if (liveSession && LIVE_PAIN.test(q)) return { claude: true, why: 'anything about pain or an injury goes to Claude' };
  if (COMPARISON_RE.test(q) || BETTER_THAN_RE.test(q) || CHOICE.test(q)) return { claude: true, why: 'a comparison or a choice goes to Claude' };
  if (WHY_RE.test(q) || CAUSE.test(q)) return { claude: true, why: 'a why question goes to Claude' };
  if (OPEN_ADVICE.test(q)) return { claude: true, why: 'an open "what should I do" goes to Claude' };
  return { claude: false, why: '' };
}

/* ------------------------------ after the turn ----------------------------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// what askRoute.gaveUp misses in the Coach's replies: bench #17's "I cannot
// access your personal training data ... which is not your data"
const COACH_GAVE_UP = [
  /\bi (?:can ?not|can't|could ?not|couldn't|am unable to|do ?not|don't) (?:access|see|read|view|have access to) (?:your|any|the)\b/,
  /\bnot your data\b/,
  /\bi need you to tell me\b/,
];
// the model arguing with itself in the open (bench #5: "Wait, that's not
// right. Let me re-read your question.")
const CONTRADICTS = [
  /\b(?:wait|hold on|hmm|oops)[,.!]* (?:that'?s|that is|this is|i'?m|i am|i was) (?:not right|wrong|incorrect|mistaken)\b/,
  /\blet me re-? ?(?:read|check|think|look|consider|calculate)\b/,
  /\bscratch that\b/,
  /\bi (?:made a mistake|was wrong|misread|misspoke)\b/,
  /\bactually,? (?:no|wait)\b/,
  /(?:^|[.!?] )correction:/,
];
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;
const DANGLING = /\b(?:and|or|but|the|a|an|to|of|with|for|your|my|then|so|because|is|are|which|that|from|on|in|at)$/;

/** Did a local Coach reply give up, claim an action, contradict itself or
 *  break off? Pure. Returns the reason he reads, or null for an answer. */
export function coachGaveUp(reply) {
  const text = String(reply || '').trim();
  if (!text) return 'the model on this Mac gave no answer';
  // askRoute.gaveUp: "I cannot answer", a claimed action, waiting for approval
  if (gaveUp(text)) return 'the model on this Mac could not answer it';
  const n = norm(text);
  if (COACH_GAVE_UP.some((re) => re.test(n.slice(0, 400)))) return 'the model on this Mac could not answer it';
  if (CONTRADICTS.some((re) => re.test(n))) return 'the answer on this Mac contradicted itself';
  // broke off: the last line ends mid-sentence. A list item may end on a
  // word ("- Hack squat 3 x 10"); prose may not, and neither may end on a
  // colon, a comma or a word that needs another after it.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = (lines[lines.length - 1] || '').replace(/[*_`)\]"'”’]+$/, '').trim();
  if (/[:,;\-–—]$/.test(last)) return 'the answer on this Mac broke off';
  if (DANGLING.test(last.toLowerCase())) return 'the answer on this Mac broke off';
  if (!LIST_ITEM.test(lines[lines.length - 1] || '') && /[\p{L}\p{N}]$/u.test(last)) return 'the answer on this Mac broke off';
  return null;
}
