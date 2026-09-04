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
