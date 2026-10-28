// WHICH QUESTIONS NEED MORE THAN THE MODEL ON THIS MAC KNOWS (29 Oct 2026).
//
// The morning of 29 Oct he asked Nova "barbell bench or machine chest press,
// which is better for chest growth, and why?". The 4B model on his Mac
// answered twice that his vault held no comparison and it could not answer,
// even after he told it to ask Coach and do the research. The escalation
// built on 27 Oct only fired when the local turn FAILED; a turn that answered
// "I cannot answer" counted as an answer, and the local Coach bench had
// already shown the small model never reaches out on its own (0 hand-ups in
// 34 turns). So code decides, three times:
//   - before the turn (agentsFor): a question the evidence, a judgement or
//     another agent settles is put to the agents it needs (the Coach, the
//     Researcher, the Leader, the Librarian, the CFO, the Stash) through the
//     shared consult rail, and the model on this Mac answers from what they
//     said. His rule, 29 Oct: Nova talks with every agent and uses his whole
//     vault without needing Claude to help it, no exceptions.
//   - before the turn (needsClaude): only his correction of the last answer
//     goes straight to Claude; the small model already missed once.
//   - after the turn (gaveUp): a local reply that says it cannot answer is
//     never spoken; the same job is handed to Claude, with what the agents
//     already said.
// A false positive costs one consult or one Claude turn; a false negative
// costs him an answer. Every list leans towards asking.

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// a comparison with his own past ("compared to last week", "better than
// yesterday") is a lookup in his log, not a question for the evidence
const OWN_PAST = /\b(?:compared?|comparison|better|worse|more|less|up|down|vs\.?|versus)\s+(?:than\s+|to\s+|with\s+|on\s+)?(?:the\s+|my\s+)?(?:last|yesterday|before|previous|prior|earlier)\b(?:\s+(?:week|month|time|session|year|one|workout))?/g;
const subject = (s) => norm(s).replace(OWN_PAST, ' ');

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
  [/\b(?:explain|teach me|what does .{1,40} (?:mean|say)|what is the point of)\b/, 'an explanation'],
];

// he names another agent, or tells Nova to go and find out
const AGENTS = /\b(?:ask (?:the )?(?:coach|researcher|leader|librarian)|coach (?:say|says|think|thinks)|the other agents|look (?:it|that) up|find out|figure (?:it|that) out)\b/;

// he is correcting the last answer: the small model already missed once
const CORRECTION = /\b(?:you(?:'re| are| seem to be)(?: getting)? confused|that's (?:not|wrong)|that is (?:not|wrong)|not what i (?:asked|meant|said)|you should (?:be|have)|you didn't (?:answer|listen)|answer the question|simple question)\b/;

/** Why a question should go straight to Claude, or null when the model on
 *  this Mac may take it (with the agents agentsFor names). Pure. */
export function needsClaude(question) {
  const q = norm(question);
  if (!q) return null;
  if (CORRECTION.test(q)) return 'you corrected the last answer';
  if (/\b(?:ask|use|get) claude\b/.test(q)) return 'you asked for Claude';
  return null;
}

/** What kind of question this is when the evidence, a judgement or another
 *  agent settles it, or null for a lookup or a quick act. Pure. */
export function knowledgeKind(question) {
  const q = subject(question);
  if (!q) return null;
  if (AGENTS.test(q)) return 'it needs the other agents';
  for (const [re, why] of KNOWLEDGE) if (re.test(q)) return why;
  return null;
}

// each agent's ground, in his words. A named agent is always asked.
const DOMAINS = {
  coach: /\b(?:train(?:ing)?|workout|session|lift(?:s|ing)?|exercise|press|bench|squat|deadlift|row|curl|pull-?ups?|chin-?ups?|dips?|raise|fly|flye|extension|sets?|reps?|failure|deload|program(?:me)?|routine|split|muscle|chest|back (?:day|work|muscles?|width|thickness)|(?:upper|lower|wider|bigger|thicker|stronger|my|a) back|lats|shoulders?|delts?|biceps|triceps|legs?|quads?|hamstrings?|glutes?|calves|forearms?|grip|abs|core|hypertrophy|growth|strength|stronger|bulk(?:ing)?|cutting|lean bulk|body ?fat|weight|cardio|walk(?:ing)?|run(?:ning)?|steps|recovery|recover|sleep|hrv|sore(?:ness)?|injur(?:y|ed)|pain|mobility|stretch(?:ing)?|protein|calories|macros|carbs|diet|eat(?:ing)?|food|meal|nutrition|supplements?|creatine|coach)\b/,
  leader: /\b(?:(?:at|my|from|after|before) work|job|team|staff|store|shift|manager|managing|manage|lead(?:er|ing|ership)?|boss|colleague|employee|customer|retail|meeting|feedback|delegat\w*|conflict|career|promotion|leader)\b/,
  librarian: /\b(?:book|books|podcast|episode|article|my library|librarian|highlights?|chapter|author|what does .{1,40} say)\b/,
  cfo: /\b(?:money|spend(?:ing)?|spent|budget|bills?|savings?|save money|afford|cost|price|expenses?|income|pay|cfo)\b/,
  stash: /\b(?:skincare|restock|running low|gift|wishlist|stash|bought|buy|product)\b/,
};
// the outside evidence decides it: the Researcher (it takes a few minutes)
const EVIDENCE = /\b(?:better|best|worse|more effective|most effective|optimal|versus|vs\.?|compared?|comparison|difference between|does (?:it|that|this) (?:really |actually )?matter|research|evidence|studies|study|science|scientific|literature|meta-analysis|proven|is it (?:true|a myth)|myth|researcher)\b/;
const NAMED = { coach: /\bcoach\b/, researcher: /\bresearch(?:er)?\b/, leader: /\bleader\b/, librarian: /\blibrar(?:y|ian)\b/, cfo: /\bcfo\b/ };

/** The agents a question should be put to before the model on this Mac
 *  answers: [] for a lookup or a quick act. Each ask carries his own words;
 *  the shared rail tells the agent who is asking and why. Pure. */
export function agentsFor(question, { handsFree = false } = {}) {
  const q = subject(question);
  if (!q || !knowledgeKind(q)) return [];
  const ids = new Set();
  for (const [id, re] of Object.entries(NAMED)) if (re.test(q)) ids.add(id);
  for (const [id, re] of Object.entries(DOMAINS)) if (re.test(q)) ids.add(id);
  // the outside evidence decides it: the Researcher too. A question outside
  // every domain asks no one: the model on this Mac tries, and a give-up
  // goes to Claude (gaveUp)
  if (EVIDENCE.test(q)) ids.add('researcher');
  // a hands-free line (Siri) cannot hold for a few minutes of research
  if (handsFree && ids.size > 1) ids.delete('researcher');
  const asked = String(question).trim();
  return [...ids].map((agent) => ({ agent, question: asked }));
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
