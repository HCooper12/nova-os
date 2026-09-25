// THE PHONE'S AUDIO SESSION — claimed only when Nova has something to say.
//
// 2 Sep 2026: iOS pauses whatever is playing (Music, a podcast) the moment a
// page claims the audio session — an AudioContext.resume(), a play() on any
// element, an empty speechSynthesis utterance. Nova did all three on EVERY tap
// ("any first tap unlocks the voice"), so tapping the Train screen at the gym
// silenced his music. The fix asked iOS for a MIXING type ('transient') and
// stopped priming the audio path on a generic tap.
//
// 18 Sep 2026, his report: "I can only hear nova if my phone isn't on silent
// (volume being up doesn't work) or if I have my earphones in."
//
// THAT IS THE MIXING TYPE, WORKING AS SPECIFIED. On iOS the mixable
// categories are the ambient family, and the ambient family is exactly what
// the hardware ring/silent switch silences — the volume buttons cannot
// override it, which is why turning it up did nothing. Only the 'playback'
// category plays through the switch, and 'playback' does not mix: the W3C
// Audio Session spec says such audio "should not mix with other playback
// audio. (Maybe) they should pause all other audio indefinitely."
//
// SO THE TWO THINGS HE WANTS CANNOT BOTH BE HAD through this API. There is no
// playback-and-mix type; native iOS has .playback with .mixWithOthers, and
// navigator.audioSession exposes no options. It is a real fork, so it is HIS
// fork, with a default rather than a silent choice made for him:
//
//   SPEAK  ('playback')  — audible with the phone on silent. Other audio is
//                          paused, and iOS may not resume it. THE DEFAULT,
//                          because an assistant he cannot hear is broken and
//                          a paused podcast is an inconvenience.
//   DUCK   ('transient') — his music dips for Nova's sentence and comes back,
//                          and the ring switch silences Nova completely.
//                          What shipped on 2 Sep, now a choice.
//
// Note the asymmetry he already observed: with earphones in, DUCK is audible.
// Route detection would let Nova pick per-route — but nothing in the web
// platform reports the current output route, so Nova would be guessing, and
// this file does not guess.
//
// While the microphone is in use (dictation, the wake word) the type is left
// to the browser ('auto' → play-and-record), so a caller marks the mic held
// and the chosen type is restored when it lets go.

export const SPEAK = 'playback';
export const DUCK = 'transient';
const KEY = 'novaos.audioDucks';

let micHolds = 0;
// Read once, at module load, so the very first prime uses his choice rather
// than a default that a later Settings read would correct a beat too late.
let preferred = readPreference() ? DUCK : SPEAK;

function readPreference() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

// Does he want his other audio ducked instead of paused? False (SPEAK) is the
// default: see above.
export function ducksOtherAudio() {
  return preferred === DUCK;
}

function apply(type) {
  try {
    const s = navigator.audioSession;
    if (s && s.type !== type) s.type = type;
    // the mode, readable on the root element — verifiable from Safari's
    // inspector on the phone, and the marker verify:shipped checks for
    document.documentElement.dataset.novaAudio = s ? type : 'unsupported';
  } catch { /* the API exists on few browsers; absent is fine */ }
}

// Settings. Applied immediately when the mic is not holding the session, so
// the next thing Nova says obeys the switch he just flipped — a preference
// that waits for a reload is a preference he will conclude does not work.
export function setDuckingPreference(duck) {
  preferred = duck ? DUCK : SPEAK;
  try { localStorage.setItem(KEY, duck ? '1' : '0'); } catch { /* private mode */ }
  if (micHolds === 0) apply(preferred);
}

// Before Nova plays anything. Named for what it does now — it claims the
// session for speech — rather than for one of the two ways it can claim it.
export function claimForSpeech() {
  if (micHolds === 0) apply(preferred);
}

// SOUND EFFECTS (25 Sep 2026: the reveal's ticks and chime) are neither of
// the two speech choices above. They are UI sounds, and iOS has a category
// made for exactly those: 'ambient' plays ALONGSIDE his music — never pausing
// it, never ducking it — and the ring switch silences it, like the iPhone's
// own keyboard clicks. 'playback' would stop his podcast for a tick;
// 'transient' would dip it. Nothing is restored afterwards on purpose: the
// next time Nova speaks, claimForSpeech() puts his chosen type back, and
// apply() only writes when the type actually differs.
export const EFFECTS = 'ambient';

// Returns false when the microphone holds the session (dictation, the wake
// word) — an effect is never worth disturbing a recording, so the caller
// stays silent rather than fight for it.
export function claimForEffects() {
  if (micHolds > 0) return false;
  apply(EFFECTS);
  return true;
}

// Around microphone use: let the browser pick the recording session.
export function micStarted() {
  micHolds++;
  apply('auto');
}
export function micStopped() {
  micHolds = Math.max(0, micHolds - 1);
  if (micHolds === 0) apply(preferred);
}

// test hook — module state outlives a test file otherwise
export function _resetAudioSession() {
  micHolds = 0;
  preferred = readPreference() ? DUCK : SPEAK;
}
