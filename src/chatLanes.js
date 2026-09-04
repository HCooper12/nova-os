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
//   code, play   — both change screens. Yanking him out of a chat he is in
//                  the middle of is a worse failure than not routing at all.
//   capture      — its rule fires on a bare leading "add", and "add some
//                  context on why that happened" is a question, not a
//                  shopping item. Too eager to run without asking.
//
// Separate from App.jsx so the rule can be tested without a browser, and so
// the planner in the next phase reads the same list rather than a copy.
export const CHAT_JOB_LANES = ['watch', 'study', 'research', 'book'];

// Lanes that are deliberately NOT dispatched from the chat. Kept explicit
// rather than implied by absence: a lane added to the router later shows up
// in neither list, and this is where someone will look to find out why.
export const CHAT_CONVERSATION_LANES = ['ask', 'coach'];
export const CHAT_DEFERRED_LANES = ['code', 'play', 'capture'];

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

// A request earns a plan when it names at least two families AND at least one
// of them is real work rather than only a comparison word — "compare my bench
// to last month" is a question about his own data, not a delegation.
export function planWorthy(text) {
  const t = String(text || '').trim();
  if (t.length < 25) return false; // too short to be a compound brief
  const fams = familiesIn(t);
  if (fams.length < 2) return false;
  return fams.some((f) => f === 'watch' || f === 'research' || f === 'shelf');
}
