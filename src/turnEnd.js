// WHEN A SPOKEN TURN IS OVER — and why the browser must not be the one to say.
//
// His report: "sometimes when speaking with Nova my speech is cut off and I
// feel like I am rushing to keep speaking before it thinks I have stopped
// talking."
//
// The cause was structural, not a tuning miss. The conversational surfaces
// opened dictation with `continuous: false`, which hands the end of his turn
// to the browser's own endpointer, and then SENT on that same instant. So a
// mid-sentence breath — the pause anyone takes while assembling a thought —
// ended the take and fired the question. There is no knob for this in the
// Web Speech API: no threshold, no grace, nothing to lengthen. The only way
// to stop being cut off is to stop letting the engine decide.
//
// So the engine is told to run CONTINUOUSLY and never end the turn, and the
// decision moves here. This module is the whole decision, kept pure and away
// from the DOM for the reason speechResume.js is: the failure it prevents is
// silent and lives on a device, so it has to be pinned by a test that runs on
// every `npm test` rather than by a phone check someone remembers to redo.
//
// Two different silences, because they mean different things:
//   LEAD — he has not started yet. The mic reopened after Nova spoke and he
//          is still thinking. Being generous here costs nothing; being mean
//          sends an empty take and makes Nova say it heard nothing.
//   HOLD — he has been talking and stopped. This is the one he feels. It has
//          to outlast a breath and an "um" without outlasting a finished
//          sentence.

// What he can choose, in Settings. `holdMs` is the pause that ends the turn,
// `leadMs` the wait for him to begin.
//
// The default was 2.6s for one morning. He tried it: "the delay after I
// finish speaking before it processes... is a little bit too long of a
// pause." So the middle setting is 2.0s — still comfortably past the
// browser's own ~1–1.5s endpointer, which is the thing that was cutting him
// off, but 0.6s less dead air on every single turn. The two either side of
// it are unchanged, so both directions are one tap away.
export const HOLD_PRESETS = [
  { value: 'quick',   label: 'Quick',   holdMs: 1600, leadMs: 5000, hint: 'Sends soon after you stop. Closest to how it was.' },
  { value: 'natural', label: 'Natural', holdMs: 2000, leadMs: 7000, hint: 'Room for a breath mid-sentence.' },
  { value: 'patient', label: 'Patient', holdMs: 4200, leadMs: 10000, hint: 'For thinking out loud. Tap the core to send early.' },
];

export const DEFAULT_HOLD = 'natural';

// A stored value → the timings. Anything unrecognised falls to the default
// rather than to zero: a corrupt localStorage entry must not silently
// restore the very behaviour this exists to end.
export function holdTiming(value) {
  return HOLD_PRESETS.find((p) => p.value === value) || HOLD_PRESETS.find((p) => p.value === DEFAULT_HOLD);
}


// ---- the turn ----

// After a restart, the hold may not fire until the replacement engine has
// had this long to warm up. See sawRestart for why it is a floor and not a
// reset, and why it is small.
export const RESTART_GRACE_MS = 600;

export function openTurn(now) {
  return { startedAt: now, lastHeardAt: null, engineIdle: false, restarts: 0, restartsTotal: 0, restartedAt: null };
}

// The engine delivered words — final or interim, both count as "he is still
// there". Restarts reset too: the budget below guards a FAILING engine, not
// a long answer, and a turn that is producing speech is not failing.
export function sawSpeech(turn, now) {
  return { ...turn, lastHeardAt: now, engineIdle: false, restarts: 0, restartedAt: null };
}

// The engine ended its own session. Not the same as the turn ending.
export function sawEngineEnd(turn) {
  return { ...turn, engineIdle: true };
}

// Another engine is being opened inside the same turn.
//
// THE HOLD CLOCK ACROSS THE SEAM. `lastHeardAt` is deliberately NOT moved:
// the hold measures silence from his last word, and a restart does not make
// him say anything. That is right for almost every restart, because the hold
// still has most of its length left when one happens mid-sentence.
//
// The one gap it cannot see is the replacement engine's warm-up. If the old
// one dies a few hundred milliseconds before the hold is up, the new one is
// still deaf when the turn is judged over — silence nothing was listening
// through, scored against him.
//
// The obvious fix — reset `lastHeardAt` on every restart — is worse than the
// bug. The COMMONEST restart is the engine giving up precisely BECAUSE he
// stopped talking (iOS fires `no-speech` about 1.5s in), and resetting there
// adds a whole extra hold of dead air to the end of nearly every turn. That
// is the complaint that took the default hold from 2.6s to 2.0s; it must not
// come back through the side door.
//
// So the gap gets a FLOOR, not a reset: after a restart the hold cannot fire
// for RESTART_GRACE_MS. That can delay a send by at most 600ms, and only when
// the engine happened to die inside the last 600ms of his hold.
export function sawRestart(turn, now = null) {
  return {
    ...turn,
    engineIdle: false,
    restarts: turn.restarts + 1,
    restartsTotal: (turn.restartsTotal || 0) + 1,   // never reset — the receipt wants the whole turn
    restartedAt: now,
  };
}

// WHY a turn is ending, or null while it is still his. This is the whole
// decision; nextAction below is a view of it.
//
//   'lead'         — he never started. The mic reopened and he said nothing.
//   'hold'         — he was talking and stopped for the pause HE chose.
//   'cap-idle'     — a turn already past maxTurnMs that has gone quiet.
//   'cap-absolute' — the runaway ceiling. A microphone nobody closed.
//   'restart-limit'— the engine is failing, not listening.
//   'engine'       — not held at all, or the caller stopped it (never
//                    returned from here; it is what the hook reports).
//
// THE CAP THAT USED TO CUT HIM OFF. This began as a flat `now - startedAt >=
// 120000 → end`, checked before anything else, with the comment "a room with
// a television in it can keep an engine talking indefinitely". It did stop
// that. It also ended HIS turn, mid-word, with no pause at all, the moment he
// explained something in the car for two minutes — 12 Sep, driving: "it
// somehow thought that I was finished talking even though I did not pause
// while speaking". A wall clock cannot tell a television from a man with
// something to say; SILENCE can, and silence is what the hold already
// measures. So the two-minute mark is now a ceiling for a turn that has gone
// QUIET, and the runaway case falls to maxSpeakingMs — fifteen minutes, long
// past any sentence, short of holding the mic all afternoon.
//
// Honest note: gated on silence, every turn 'cap-idle' catches would also be
// caught by 'hold' on the same tick. It is kept as its own reason so the
// receipt can say the turn was already past two minutes when it ended, and
// so the ceiling stays a named thing rather than a deleted one.
export function endReason(turn, now, { holdMs = 2600, leadMs = 7000, maxTurnMs = 120000, maxRestarts = 40, maxSpeakingMs = 900000 } = {}) {
  if (!turn) return 'engine';
  const age = now - turn.startedAt;
  const since = now - (turn.lastHeardAt ?? turn.startedAt);
  const spoke = turn.lastHeardAt !== null;
  // 1. Never hold the microphone open forever — whatever is making the noise.
  if (age >= maxSpeakingMs) return 'cap-absolute';
  // 2. Past the old cap AND quiet: the turn is over on both counts.
  if (age >= maxTurnMs && since >= holdMs) return 'cap-idle';
  // 3. The silence that actually ends a turn — once the engine now running
  //    has had a moment to hear him.
  if (since >= (spoke ? holdMs : leadMs)) {
    if (spoke && turn.restartedAt !== null && now - turn.restartedAt < RESTART_GRACE_MS) return null;
    return spoke ? 'hold' : 'lead';
  }
  // 4. An engine that ends over and over without ever hearing anything is
  //    broken, and a restart loop would hold the mic and burn the battery.
  if (turn.engineIdle && turn.restarts >= maxRestarts) return 'restart-limit';
  return null;
}

// The whole decision. 'wait' — keep listening. 'restart' — the engine quit
// but he has not; open another one and keep his words. 'end' — his turn is
// genuinely over, send it.
export function nextAction(turn, now, opts = {}) {
  if (endReason(turn, now, opts)) return 'end';
  // it quit early and he is mid-thought — that is the bug this fixes
  return turn.engineIdle ? 'restart' : 'wait';
}
