// WHAT OPENED THE MIC, AND HOW THE LAST TURN ENDED: the two facts the turn
// receipt and conversation mode need, passed between App.jsx and the
// dictation hook without threading new props through every view model.
//
// App marks a cause the moment it decides to hand him the turn (conversation
// mode starting, "Hey Nova", a barge-in); the hook takes the mark when the
// mic opens, if it is fresh. The hook notes how each turn ended; App reads
// that when an empty turn arrives, so a turn he ended himself never counts
// toward pausing the conversation (src/listenRules.js countsAsEmpty).

const FRESH_MS = 3000;
let mark = null;
let lastEnd = null;
let speaking = 0;

export function markListen(trigger) {
  mark = { trigger, at: Date.now() };
}

// The mark, if one was made in the last few seconds; else the caller's own.
export function takeListen(fallback = 'tap', now = Date.now()) {
  const m = mark;
  mark = null;
  return m && now - m.at < FRESH_MS ? m.trigger : fallback;
}

export function noteListenEnd(info) {
  lastEnd = { ...info, at: Date.now() };
}

// How the turn that just ended ended, or null when it is not the turn the
// caller is asking about (too old to be).
export function lastListenEnd(now = Date.now()) {
  return lastEnd && now - lastEnd.at < FRESH_MS ? lastEnd : null;
}

// Is Nova's voice playing (App.beginSpeech / endSpeech keep the count)?
export function noteNovaSpeaking(count) {
  speaking = Math.max(0, Number(count) || 0);
}
export function novaSpeakingNow() {
  return speaking > 0;
}
