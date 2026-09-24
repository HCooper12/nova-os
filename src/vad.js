// ---------------------------------------------------------------------------
// IS HE TALKING? — the question the browser's speech engine used to answer.
//
// With Nova's own ears (src/recorder.js) there is no engine delivering words
// as he speaks, so nothing tells turnEnd.js that he is still going. This does,
// from loudness alone: a noise floor that follows the room, and speech when
// the level stands clear of it for two samples running (~200ms, so a cough or
// a door is not a sentence).
//
// Pure, sample in, state out. The sampling lives in the recorder.
//
// BLIND IS A STATE, NOT A GUESS. A real microphone is never perfectly silent;
// a level of exactly zero, sample after sample, means the audio graph is not
// running (iOS starts an AudioContext suspended outside a tap — conversation
// mode's auto-listen is exactly that case). A blind meter cannot say when he
// stopped, so the turn must not be ended by it: the caller switches to
// tap-to-send and keeps recording. His words are never judged by a deaf meter.
// ---------------------------------------------------------------------------

export const VAD = {
  minSpeech: 0.018,   // raw RMS a voice at arm's length clears comfortably
  ratio: 2.4,         // … and it must stand this far above the room
  margin: 0.006,
  confirm: 2,         // consecutive loud samples before it counts as speech
  blindAfter: 15,     // 1.5s of exact zero before the meter is declared blind (a stream can open on a few zero frames)
};

export function openVad() {
  return { floor: null, above: 0, samples: 0, zeros: 0, peak: 0, speaking: false, heardAny: false };
}

export function vadThreshold(floor) {
  return Math.max(VAD.minSpeech, (floor ?? 0) * VAD.ratio + VAD.margin);
}

// One level sample (RMS of a float time-domain frame, 0..1) → the next state.
export function vadStep(state, rms) {
  const r = Number.isFinite(rms) && rms > 0 ? rms : 0;
  const s = { ...state, samples: state.samples + 1, peak: Math.max(state.peak, r), zeros: r === 0 ? state.zeros + 1 : 0 };
  if (s.floor === null) s.floor = r;
  const loud = r > vadThreshold(s.floor);
  if (loud) {
    s.above = state.above + 1;
  } else {
    s.above = 0;
    // the floor follows the room while he is quiet: down quickly (a car
    // slowing), up slowly (so the tail of his own voice does not become "room")
    s.floor = r < s.floor ? s.floor * 0.6 + r * 0.4 : s.floor * 0.96 + r * 0.04;
  }
  s.speaking = s.above >= VAD.confirm;
  if (s.speaking) s.heardAny = true;
  return s;
}

// Blind: the graph has delivered nothing at all, for long enough to be sure.
export function vadBlind(state) {
  return state.peak === 0 && state.zeros >= VAD.blindAfter;
}

// RMS of a Float32 time-domain frame. Pure.
export function frameRms(frame) {
  if (!frame?.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}
