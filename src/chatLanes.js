// Which lanes the CONVERSATION is allowed to dispatch on its own.
//
// His ask: paste a link into the Nova chat with an instruction and have it
// happen, instead of hunting for the right button. His decision, 4 Sep: the
// chat stays a conversation and the routing is invisible until it matters —
// so a lane here does not stop to ask permission, it announces what it did
// and leaves an undo.
//
// The exclusions are the load-bearing part, and each has a reason:
//
//   ask, coach   — conversation. Answering is what the chat is FOR; routing a
//                  question into a job would be the regression.
//   play         — changes screens for something that is not work.
//   (code moved to the job lanes on 5 Sep when the palette was folded in —
//   see CHAT_NAVIGATING_LANES.)
//   capture      — its rule fires on a bare leading "add", and "add some
//                  context on why that happened" is a question, not a
//                  shopping item. Too eager to run without asking.
//
// Separate from App.jsx so the rule can be tested without a browser, and so
// the planner in the next phase reads the same list rather than a copy.
export const CHAT_JOB_LANES = ['watch', 'weave', 'study', 'repertoire', 'research', 'browse', 'book', 'code'];

// Phase 4, 5 Sep: with the palette folded into the chat, the chat inherits the
// palette's one screen-changing dispatch — a build request opens the Code
// screen and starts the session there, because the diff is the first thing
// he wants to see. Announced like every other lane, so it is never a surprise.
export const CHAT_NAVIGATING_LANES = ['code'];

// Lanes that are deliberately NOT dispatched from the chat. Kept explicit
// rather than implied by absence: a lane added to the router later shows up
// in neither list, and this is where someone will look to find out why.
export const CHAT_CONVERSATION_LANES = ['ask', 'coach', 'leader'];
export const CHAT_DEFERRED_LANES = ['play', 'capture'];

export function chatStartsAJob(lane) {
  return CHAT_JOB_LANES.includes(lane);
}

// ---------------------------------------------------------------------------
// IS THIS ONE JOB, OR SEVERAL?
// ---------------------------------------------------------------------------
//
// His example — "watch and analyse this, as well as compare it against other
// empirical research" — is three agents and a synthesis. The single-lane
// router calls it 'watch' and discards the rest of the sentence, because the
// first matching rule wins.
//
// Deterministic, and deliberately RELUCTANT. A plan costs several dollars and
// waits for his approval, so a false positive turns a quick question into a
// form to fill in. A false negative just does what Nova did yesterday. The
// asymmetry says: only call it a plan when the request names work from two
// genuinely different families.
const FAMILIES = {
  watch: /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)|\b(watch|video|transcript|episode|podcast)\b/i,
  research: /\b(research|evidence|empirical|literature|sources?|studies|stud(y|ies)|science|scientific|fact.?check|verify|peer.?reviewed)\b/i,
  compare: /\b(compare|contrast|cross.?reference|against|versus|\bvs\b|corroborate|hold up|overstat)/i,
  shelf: /\b(my (notes|shelf|vault|library|research)|what I (have|know|already))\b/i,
};

export function familiesIn(text) {
  const t = String(text || '');
  return Object.keys(FAMILIES).filter((k) => FAMILIES[k].test(t));
}

// WHEN A REQUEST IS SEVERAL JOBS, NOT ONE.
//
// The old rule asked one question: do the words name two of four keyword
// families, and is one of them watch/research/shelf? That reaches a plan for
// "watch this and check it against my notes" and misses almost everything else
// he might delegate. His own example, 16 Sep — the Claude advertisement: build
// a site from that mockup, then pull my Instagram analytics, read the comments,
// write me a strategy report, and tidy the desktop. Not one of those four
// families appears in it. The single-lane router would take the first thing it
// recognised and silently drop the rest of the sentence.
//
// SHAPE is the better signal, because a delegation looks like one: several
// things to PRODUCE, usually strung together with "then". And reaching the
// planner wrongly is cheap — a plan is proposed and waits for his yes, and the
// planner's own `cannot` names the parts no agent can do. "I can do these two,
// not that one" is a far better answer than quietly doing one of five.
//
// A question stays a question, however long: "what did I train yesterday and
// how many steps did I do" is one ask with two clauses, not a delegation —
// unless he strings jobs together, in which case "can you build X then write Y"
// is a request wearing a question mark.
const DO_VERB = /\b(build|make|create|design|write|draft|compose|research|watch|analyse|analyze|compare|summarise|summarize|plan|organise|organize|tidy|sort|find|pull|gather|collect|review|audit|update|export)\b/gi;
const SEQUENCER = /\b(?:then|after that|afterwards|and also|next,|finally|once (?:that|you|it)|when you'?re done)\b/i;
const QUESTION_OPENER = /^(?:what|how|when|why|who|where|which|is|are|was|were|do|did|does|can|could|should|would|will|am)\b/i;

export function planWorthy(text) {
  const t = String(text || '').trim();
  if (t.length < 25) return false; // too short to be a compound brief

  // the original route, unchanged: two families and one of them real work
  const fams = familiesIn(t);
  if (fams.length >= 2 && fams.some((f) => f === 'watch' || f === 'research' || f === 'shelf')) return true;

  const sequenced = SEQUENCER.test(t);
  if (QUESTION_OPENER.test(t) && !sequenced) return false;
  // DISTINCT verbs: "research this and research that" is one job asked twice
  const verbs = new Set((t.match(DO_VERB) || []).map((v) => v.toLowerCase()));
  if (verbs.size < 2) return false;
  // two things joined by "then" is a plan; three things is a plan however he
  // joined them
  return sequenced || verbs.size >= 3;
}
