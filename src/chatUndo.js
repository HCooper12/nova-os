// UNDOING "NEW CHAT".
//
// 9 Sep 2026, his words: "I think I accidentally just started a new chat and
// cleared the comms log. How can I undo this? This seems too easy of a
// feature to accidentally click."
//
// He was right twice. It was one unguarded tap in the corner, and it ended a
// conversation that deliberately CONTINUES ACROSS DAYS — the label says so.
// Nothing else in Nova that changes something works that way: everything
// writeable is undoable. This is that rail for the transcript.
//
// Nothing was actually lost that time — the conversation itself lives in the
// Claude CLI session on his Mac, and it was recovered from there. But needing
// me to go and dig it out is not an undo.
//
// Two rules, both here so they can be tested without a browser:
//   - the stash survives a reload, because he may not notice until later
//   - and it expires, because restoring a conversation from three weeks ago
//     over the one he is having now would be its own kind of loss

export const UNDO_KEY = 'novaos.voiceChatUndo';
export const UNDO_TTL_MS = 24 * 60 * 60 * 1000;   // a day: long enough to notice
const MAX_TURNS = 200;                            // the tail is what he wants back

export function stashOf(chat, sessionId, now = Date.now()) {
  const turns = Array.isArray(chat) ? chat : [];
  if (!turns.length) return null;                 // clearing nothing is not an event
  return { chat: turns.slice(-MAX_TURNS), sessionId: sessionId || null, at: now, turns: turns.length };
}

export function usableUndo(stash, now = Date.now()) {
  if (!stash || !Array.isArray(stash.chat) || !stash.chat.length) return null;
  if (!Number.isFinite(stash.at) || now - stash.at > UNDO_TTL_MS) return null;
  return stash;
}

// What the button says. Naming the size of it is the point: "Undo · 63 turns"
// tells him what he gets back, where a bare "Undo" tells him nothing.
export function undoLabel(stash) {
  const n = stash?.turns || stash?.chat?.length || 0;
  return n ? `Undo · ${n} turn${n === 1 ? '' : 's'}` : 'Undo';
}
