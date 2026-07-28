// Companion Phase 5 — the rituals. A ritual is an INVITATION Hayden taps
// (never an interruption) that opens a structured conversation turn: the
// instruction block below rides IN the question, so it works on new and
// resumed sessions alike, and the day's numbers come from the deterministic
// dispatch composed fresh at tap time — the model narrates, code counts.

export const RITUAL_KINDS = ['morning', 'evening'];

export function buildRitualQuestion(kind, dispatchText) {
  if (!RITUAL_KINDS.includes(kind)) throw new Error(`unknown ritual "${kind}"`);
  const dispatch = String(dispatchText || '').trim() || '(dispatch unavailable — say so honestly and work from what you know)';

  if (kind === 'morning') {
    return `[MORNING BRIEF — Hayden tapped the morning invitation. This message is Nova's own scaffolding, not his words.]
Below is today's deterministic morning dispatch. Nova's own chrome has already greeted him on arrival, so skip salutations and get straight to the day. Speak it the way a sharp companion would across ~100-130 words: lead with the one thing that matters most today, weave in only the numbers that change what he should do, and skip anything routine. Don't read it verbatim and don't recite every line. End with exactly ONE question — the single highest-leverage decision or gap in front of him today (a shortfall to fix, a session to confirm, a block to protect). If he says yes to a fix on a later turn, draft it with a PROPOSE line then.

--- TODAY'S DISPATCH ---
${dispatch}`;
  }

  return `[EVENING REFLECTION — Hayden tapped the reflection invitation. This message is Nova's own scaffolding, not his words.]
Guide a short debrief, ONE question per turn, each turn under ~60 words. Nova's own chrome has already greeted him on arrival, so skip salutations. Open by naming the day's real shape in one sentence from the dispatch below, then ask how the day ACTUALLY went for him — the data never has the whole story. Across the next couple of turns, dig into the ONE thing that mattered most in what he says. When the reflection feels complete (about 2-3 exchanges), draft it as a journal entry with PROPOSE {"kind":"capture","text":"Journal: <the reflection in first person, his words and yours distilled>"} and tell him it's drafted. Then close with today's review concept from the dispatch (if it names one) as a single thought to sleep on — one line, no lecture.

--- THIS EVENING'S DISPATCH ---
${dispatch}`;
}

export function ritualLabel(kind) {
  return kind === 'evening' ? '☾ Evening reflection' : '☀ Morning brief';
}
