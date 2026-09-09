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

export function openTurn(now) {
  return { startedAt: now, lastHeardAt: null, engineIdle: false, restarts: 0 };
}

// The engine delivered words — final or interim, both count as "he is still
// there". Restarts reset too: the budget below guards a FAILING engine, not
// a long answer, and a turn that is producing speech is not failing.
export function sawSpeech(turn, now) {
  return { ...turn, lastHeardAt: now, engineIdle: false, restarts: 0 };
}

// The engine ended its own session. Not the same as the turn ending.
export function sawEngineEnd(turn) {
  return { ...turn, engineIdle: true };
}

export function sawRestart(turn) {
  return { ...turn, engineIdle: false, restarts: turn.restarts + 1 };
}

// The whole decision. 'wait' — keep listening. 'restart' — the engine quit
// but he has not; open another one and keep his words. 'end' — his turn is
// genuinely over, send it.
//
// Order matters, and it is riskiest-first: the two caps that stop a runaway
// microphone are checked before anything that could ask for another restart.
export function nextAction(turn, now, { holdMs = 2600, leadMs = 7000, maxTurnMs = 120000, maxRestarts = 40 } = {}) {
  if (!turn) return 'end';
  // 1. Never hold the microphone open forever. A room with a television in
  //    it can keep an engine talking indefinitely.
  if (now - turn.startedAt >= maxTurnMs) return 'end';
  // 2. The silence that actually ends a turn.
  const since = now - (turn.lastHeardAt ?? turn.startedAt);
  if (since >= (turn.lastHeardAt === null ? leadMs : holdMs)) return 'end';
  // 3. An engine that ends over and over without ever hearing anything is
  //    broken, and a restart loop would hold the mic and burn the battery.
  if (turn.engineIdle && turn.restarts >= maxRestarts) return 'end';
  // 4. It quit early and he is mid-thought — that is the bug this fixes.
  if (turn.engineIdle) return 'restart';
  return 'wait';
}
