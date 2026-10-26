// WHEN NOVA'S EARS SHOULD KEEP LISTENING, AND WHAT A CAPTURE IS WORTH.
//
// The 18 Oct 2026 audit (48 iPhone turns on Nova's own ears, 11-18 Oct AEST):
// only 8 of his ~22 spoken questions arrived by voice. No words were lost in
// transcription. They were lost before it:
//   - a tap on a mic that had heard nothing ended the turn and sent silence
//     (8 turns; 7 of them followed by him typing the question instead);
//   - the 7 s lead started before the microphone had opened, so a slow
//     getUserMedia spent his whole lead (zero-byte and near-empty clips);
//   - near-empty clips (5 B, 1,016 B over 4.4 s) went to Groq, which answers
//     a 5-byte file with a 400 that Nova reported as a 502.
// Each rule here is pure, so the decision is pinned by `npm test` and not by
// a phone check someone has to remember (server/test/listenRules.test.js).

// A second tap this soon after a kept one ends the turn: his way out.
export const TAP_CONFIRM_MS = 2000;
// getUserMedia that has not answered by now is not going to; say so.
export const MIC_OPEN_TIMEOUT_MS = 5000;
// Real silence encodes at ~1.8-2.5 KB/s and speech at 10-25 KB/s. A clip
// under 1.5 KB, or under 0.5 KB per second, recorded a muted track or nothing.
export const EMPTY_CAPTURE_BYTES = 1536;
export const EMPTY_CAPTURE_BYTES_PER_S = 512;
// A transcript from a meter that heard nothing for the whole blind cap, with
// fewer words than this, is held in the composer, never sent ("All right. .
// Okay." reached the Coach as a question on 17 Oct).
export const BLIND_DRAFT_WORDS = 4;

// What opened the microphone. 'tap' is his finger; 'auto' is conversation
// mode handing the turn back after Nova spoke; 'reply-window' the one-shot
// mic after Nova spoke with conversation mode off; 'conv-start' the tap that
// turned conversation mode on; 'wake' "Hey Nova"; 'barge' talking over Nova.
// 'continue' (27 Oct 2026): the mic left open after a send, for "...oh, and
// also" (src/turnSense.js isContinuation).
export const TRIGGERS = ['tap', 'auto', 'reply-window', 'conv-start', 'wake', 'barge', 'continue'];
// What closed it: his tap, the turn clock (lead or hold), a cap, the screen
// going away (lock, app switch), the mic never opening, or the engine itself.
export const ENDED_BY = ['tap', 'clock', 'cap', 'hidden', 'mic', 'engine'];

/**
 * A tap while the mic is open. 'keep' means the turn stays open (a haptic and
 * "Listening, go ahead"); 'end' means the tap ends it as it always did.
 * Kept only on a held (conversational) turn whose meter is not blind and that
 * has heard nothing yet, and not when the last kept tap was under 2 s ago.
 */
export function tapOnOpenMic({ held = true, blind = false, heard = false, now = 0, lastTapAt = null } = {}) {
  if (!held) return 'end';      // a writing surface ends on a tap, by design
  if (heard) return 'end';      // he spoke: the tap is "send now"
  if (blind) return 'end';      // a deaf meter cannot end his turn; the tap does
  if (lastTapAt !== null && now - lastTapAt < TAP_CONFIRM_MS) return 'end';
  return 'keep';
}

/** A capture that recorded nothing worth sending to the transcriber. */
export function isEmptyCapture({ bytes = 0, ms = null } = {}) {
  const b = Number.isFinite(bytes) ? bytes : 0;
  if (b < EMPTY_CAPTURE_BYTES) return true;
  if (Number.isFinite(ms) && ms >= 1000 && (b * 1000) / ms < EMPTY_CAPTURE_BYTES_PER_S) return true;
  return false;
}

/**
 * The turn clock restarted at the moment the recorder opened. The lead (the
 * wait for him to begin) measures from here, never from the tap: before the
 * mic is open nothing can hear him. A seeded turn (words already in hand)
 * keeps its hold, measured from no earlier than the open.
 */
export function openedTurn(turn, openAt) {
  if (!turn) return turn;
  return {
    ...turn,
    startedAt: openAt,
    lastHeardAt: turn.lastHeardAt === null ? null : Math.max(turn.lastHeardAt, openAt),
  };
}

/** Before the mic opens: keep waiting, or give up on it. */
export function micWait({ startedAt, now, opened = false, timeoutMs = MIC_OPEN_TIMEOUT_MS } = {}) {
  if (opened) return 'open';
  return now - startedAt >= timeoutMs ? 'timeout' : 'wait';
}

export const wordCount = (s) => String(s || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/** A blind-cap transcript too short to be a question: held as a draft. */
export function holdAsDraft({ blind = false, endedBy = '', text = '' } = {}) {
  return !!blind && endedBy === 'cap' && !!String(text).trim() && wordCount(text) < BLIND_DRAFT_WORDS;
}

/** How a turn ended, from its reason and whether he tapped. */
export function endedByFor(reason, { tapped = false } = {}) {
  if (tapped || reason === 'tap') return 'tap';
  if (reason === 'hold' || reason === 'lead') return 'clock';
  if (reason === 'cap-idle' || reason === 'cap-absolute' || reason === 'restart-limit') return 'cap';
  if (reason === 'hidden') return 'hidden';
  if (reason === 'mic-timeout') return 'mic';
  return 'engine';
}

/**
 * Does an empty turn count toward pausing conversation mode? A turn he ended
 * with his own tap, one cut short by the screen going away, and one whose mic
 * never opened say nothing about whether he wants to keep talking.
 */
export function countsAsEmpty({ endedBy = '', reason = '' } = {}) {
  if (endedBy === 'tap' || endedBy === 'hidden' || endedBy === 'mic') return false;
  if (reason === 'hidden' || reason === 'mic-timeout' || reason === 'tap') return false;
  return true;
}

/**
 * After an empty turn that counts: 'reopen' the mic, 'pause' conversation
 * mode, or 'rest' (do neither). A mic Nova opened by itself that heard
 * nothing is not opened a second time: the 19 benign double-opens in the
 * audit were exactly that pair. Conversation mode's reopen ('auto') pauses;
 * the one-shot reply window ('reply-window', conversation mode off) simply
 * closes, since pausing would also shut the next reply window. A turn he
 * started gets the old allowance of two.
 */
export function afterEmpty({ trigger = 'tap', empties = 0 } = {}) {
  if (trigger === 'reply-window') return 'rest';
  if (trigger === 'auto') return 'pause';
  return empties >= 2 ? 'pause' : 'reopen';
}
