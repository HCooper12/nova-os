// THE PHONE'S AUDIO SESSION — claimed only when Nova has something to say.
//
// iOS pauses whatever is playing (Music, a podcast) the moment a page claims
// the audio session: an AudioContext.resume(), a play() on any element, an
// empty speechSynthesis utterance. Nova did all three on EVERY tap ("any first
// tap unlocks the voice"), so tapping the Train screen at the gym silenced his
// music. Two fixes ride here:
//
//   1. Ask iOS for a MIXING session type. Safari 17+ exposes
//      navigator.audioSession.type; 'transient' means short-lived audio that
//      mixes with other apps and ducks them while it plays — the music dips
//      for Nova's sentence and comes back, instead of stopping. Browsers
//      without the API get the old behaviour; nothing breaks.
//   2. While the microphone is in use (dictation, the wake word) the type must
//      be left to the browser ('auto' → play-and-record), so a caller marks
//      the mic held and the mixing type is restored when it lets go.
//
// The other half of the fix is in App.jsx: a generic tap no longer primes
// the audio path at all — only a gesture that leads to speech does.

const MIX = 'transient';
let micHolds = 0;

function apply(type) {
  try {
    const s = navigator.audioSession;
    if (s && s.type !== type) s.type = type;
  } catch { /* the API exists on few browsers; absent is fine */ }
}

// Before Nova plays anything: mix, don't interrupt (unless the mic is open).
export function preferMixing() {
  if (micHolds === 0) apply(MIX);
}

// Around microphone use: let the browser pick the recording session.
export function micStarted() {
  micHolds++;
  apply('auto');
}
export function micStopped() {
  micHolds = Math.max(0, micHolds - 1);
  if (micHolds === 0) apply(MIX);
}
