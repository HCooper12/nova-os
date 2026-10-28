// WHICH QUESTIONS THE MODEL ON THIS MAC MAY ANSWER (29 Oct 2026).
//
// The morning of 29 Oct he asked Nova "barbell bench or machine chest press,
// which is better for chest growth, and why?". The 4B model on his Mac
// answered twice that his vault held no comparison and it could not answer,
// even after he told it to ask Coach and do the research. Claude's Nova
// would have asked Coach and the Researcher (CONSULT) and answered. The
// escalation built on 27 Oct only fired when the local turn FAILED; a turn
// that answered "I cannot answer" counted as an answer, and the local Coach
// bench had already shown the small model never hands up on its own (0 in
// 34 turns). So code decides, twice:
//   - before the turn (needsClaude): a question that needs knowledge,
//     judgement or another agent goes straight to Claude. The small model
//     keeps what it is good at: lookups in his own data, quick acts.
//   - after the turn (gaveUp): a local reply that says it cannot answer is
//     never spoken; the same job is handed to Claude.
// A false positive costs one Claude turn; a false negative costs him an
// answer. Both lists lean towards Claude on purpose.

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// a question the evidence, a coach or a judgement settles, not a lookup
const KNOWLEDGE = [
  [/\b(?:which|what)(?:'s| is| are| would be)? (?:the )?(?:better|best|most effective|more effective|optimal|ideal|right)\b/, 'a question the evidence settles'],
  [/\b(?:is|are|would|will) (?:it|that|this|they|a|an|the)\b.{0,40}\b(?:better|worse|more effective|worth it|worth doing|bad for|good for|safe|okay|ok)\b/, 'a question the evidence settles'],
  [/\bbetter (?:for|than)\b|\bworse than\b|\bmore effective\b|\bmost effective\b/, 'a question the evidence settles'],
  [/\b(?:versus|vs\.?|compared? (?:to|with)|comparison|difference between)\b/, 'a comparison'],
  [/\bdoes (?:it|that|this) (?:really |actually )?matter\b/, 'a question the evidence settles'],
  [/\b(?:should i|do i need to|is it worth)\b/, 'advice'],
  [/\bwhy (?:do|does|did|is|are|would|should|can't|cannot|won't)\b|^why\b|\band why\b/, 'a why question'],
  [/\bhow (?:do|does|should|can|would) (?:i|you|we|it|they|one|a|an|the)\b/, 'a how-to question'],
  [/\b(?:research|evidence|studies|study|science|scientific|literature|meta-analysis)\b/, 'a question for research'],
  [/\b(?:explain|teach me|what does .{1,40} mean|what is the point of)\b/, 'an explanation'],
];

// he names another agent, or tells Nova to go and find out
const AGENTS = /\b(?:ask (?:the )?(?:coach|researcher|leader|librarian)|coach (?:say|says|think|thinks)|the other agents|look (?:it|that) up|find out|figure (?:it|that) out)\b/;

// he is correcting the last answer: the small model already missed once
const CORRECTION = /\b(?:you(?:'re| are| seem to be)(?: getting)? confused|that's (?:not|wrong)|that is (?:not|wrong)|not what i (?:asked|meant|said)|you should (?:be|have)|you didn't (?:answer|listen)|answer the question|simple question)\b/;

/** Why a question should go straight to Claude, or null when the model on
 *  this Mac may take it. Pure: the words only. */
export function needsClaude(question) {
  const q = norm(question);
  if (!q) return null;
  if (CORRECTION.test(q)) return 'you corrected the last answer';
  if (AGENTS.test(q)) return 'it needs the other agents';
  for (const [re, why] of KNOWLEDGE) if (re.test(q)) return why;
  return null;
}

// a reply that says it has no answer, in the forms the small model writes
// (the two 29 Oct replies, and the prompt's own "I can't find that in your
// vault, sir.")
const GAVE_UP = [
  /\bi (?:can ?not|can't|could ?not|couldn't|am unable to|am not able to) (?:answer|find|tell|say|give|help|compare|determine|know)\b/,
  /\b(?:does ?not|doesn't|do ?not|don't) (?:contain|hold|have|include|list|show) (?:any )?(?:data|information|research|records?|notes?|anything|a comparison|that)\b/,
  /\bi (?:do ?not|don't) (?:have|know) (?:an |the |enough |that |any )?(?:answer|information|data|idea)?\b/,
  /\b(?:not|nothing) (?:in|on) (?:your|the) (?:vault|records|notes|pages)\b/,
  /\bmissing from your (?:records|vault|notes)\b/,
  /\bi have not (?:yet )?asked\b/,
  /\bno (?:data|information|record|research) (?:on|about|for|comparing)\b/,
];

/** Did a local reply give up instead of answering? Looks at the opening
 *  only: a full answer that mentions a gap further down is still an answer. */
export function gaveUp(reply) {
  const head = norm(reply).slice(0, 320);
  if (!head) return true;
  return GAVE_UP.some((re) => re.test(head));
}
