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

/**
 * Before the mic opens: keep waiting, or give up on it. `stalledMs` is time
 * the turn clock itself was frozen (THE CLOCK THAT STOPPED, 29 Oct 2026): on
 * his phone a 5 s timeout fired at 8.6 s and at 44 s, and a mic opened at
 * 8.7 s, so the page's own timers were not running while getUserMedia set
 * the audio session up. A frozen page is not a mic that refused; only the
 * time the clock actually ran counts against it.
 */
export function micWait({ startedAt, now, opened = false, timeoutMs = MIC_OPEN_TIMEOUT_MS, stalledMs = 0 } = {}) {
  if (opened) return 'open';
  const stall = Number.isFinite(stalledMs) && stalledMs > 0 ? stalledMs : 0;
  return now - startedAt - stall >= timeoutMs ? 'timeout' : 'wait';
}

// A tick that arrives this late means the page was frozen, not idle: the turn
// clock runs every 200 ms (useDictation TICK_MS).
export const CLOCK_STALL_MS = 600;
/** How much of the gap since the last tick was the page frozen. Pure. */
export function stallOf({ lastTickAt = null, now, tickMs = 200 } = {}) {
  if (!Number.isFinite(lastTickAt) || !Number.isFinite(now)) return 0;
  const gap = now - lastTickAt;
  return gap > CLOCK_STALL_MS ? gap - tickMs : 0;
}

// A DEAF METER CAN STILL BE ASKED WHAT HE SAID (29 Oct 2026). On his iPhone
// 7 of 28 turns on 26-28 Oct ran with a blind meter (the shared audio graph
// delivered nothing while the recorder captured fine). A blind turn could only
// end by his tap or a 20 s cap: he waited 20 s, or was cut off at 20 s mid-
// sentence (01:30 and 01:31 on 26 Oct, 249 and 264 characters, the rest
// arriving as a second turn). So while the meter is blind the clip so far is
// read (recorder.peek → the Mac) every 2.5 s, and the words decide:
//   words that stopped growing for his hold → 'hold' (the turn is over)
//   no words by the end of his lead        → 'lead' (he has not started)
//   reads that keep failing                → the old 20 s backstop
//   words still growing                    → keep listening (no cap on him)
export const BLIND_READ_EVERY_MS = 2500;
export const BLIND_CAP_MS = 20_000;
export const BLIND_READ_CAP_MS = 300_000;   // the absolute ceiling, as tap-to-end surfaces have
/** Is a read of the clip so far due? One at a time. Pure. */
export function blindReadDue({ openAt, now, lastReadAt = null, pending = false } = {}) {
  if (pending) return false;
  return now - (Number.isFinite(lastReadAt) ? lastReadAt : openAt) >= BLIND_READ_EVERY_MS;
}
/**
 * The verdict on a blind turn from its reads. `reads`: oldest first,
 * { at (when the clip was cut), ok, text }. Returns 'wait', 'hold', 'lead'
 * or 'cap-idle'; with 'hold', `text` is the words the turn ended on. Pure.
 */
export function blindVerdict({ reads = [], openAt, now, holdMs = 2000, leadMs = 7000, capMs = BLIND_CAP_MS, maxMs = BLIND_READ_CAP_MS } = {}) {
  const ok = (reads || []).filter((r) => r && r.ok && Number.isFinite(r.at));
  if (!ok.length) return { verdict: now - openAt >= capMs ? 'cap-idle' : 'wait' };
  if (now - openAt >= maxMs) return { verdict: 'cap-idle' };
  // a read that came back empty after words is Whisper's variance, not him
  // taking his words back: only reads with words say how far he has got
  const said = ok.filter((r) => wordCount(r.text) > 0);
  if (!said.length) {
    const last = ok[ok.length - 1];
    return { verdict: last.at - openAt >= leadMs ? 'lead' : 'wait' };
  }
  const latest = said[said.length - 1];
  // the newest read at least a hold before the latest one: no more words
  // since then means he has been quiet for his whole hold
  const earlier = [...said].reverse().find((r) => r.at <= latest.at - holdMs);
  if (earlier && wordCount(latest.text) <= wordCount(earlier.text)) return { verdict: 'hold', text: latest.text };
  return { verdict: 'wait' };
}

export const wordCount = (s) => String(s || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/**
 * A blind-cap transcript too short to be a question: held as a draft. The
 * same for a blind turn the reads ended (`byReads`): room noise read as
 * "All right." must not reach Nova as a question, so a short one waits for
 * his send, and four words or more go on their own.
 */
export function holdAsDraft({ blind = false, endedBy = '', text = '', byReads = false } = {}) {
  return !!blind && (endedBy === 'cap' || !!byReads) && !!String(text).trim() && wordCount(text) < BLIND_DRAFT_WORDS;
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
