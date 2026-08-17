// One audio-level meter for the whole app, read IMPERATIVELY via
// audioLevel() from canvas rAF loops — never through React state, so a
// speaking or listening Nova costs zero re-renders. Sources attach only
// when real audio exists (the TTS element while Nova speaks, the mic while
// dictating); the level decays to zero when they stop. No source, no
// signal — the core never pretends to hear something.

let ctx = null;
let analyser = null;
let data = null;
let raf = 0;
let active = 0;
let level = 0;
const wiredElements = new WeakSet(); // createMediaElementSource is once-per-element, ever

function ensureCtx() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    data = new Uint8Array(analyser.fftSize);
    return true;
  } catch {
    return false;
  }
}

function tick() {
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const d = (data[i] - 128) / 128;
    sum += d * d;
  }
  const rms = Math.min(1, Math.sqrt(sum / data.length) * 3);
  // fast attack, slow release — reads as speech cadence, not flicker
  level = Math.max(rms, level * 0.92);
  if (level < 0.01 && active === 0) { level = 0; raf = 0; return; }
  raf = requestAnimationFrame(tick);
}

function start() {
  if (!raf && analyser) raf = requestAnimationFrame(tick);
}

export function audioLevel() {
  return level;
}

// A wired element plays THROUGH this context — if the context is suspended
// (iOS suspends it whenever speech recognition takes the audio session, and
// resume() only succeeds near a user gesture), playback runs silently while
// every callback fires as if all were well. Call this at every gesture AND
// right before playback; re-resume automatically if the OS suspends us.
export function resumeAudioGraph() {
  if (!ctx) return;
  ctx.resume().catch(() => {});
  if (!ctx.onstatechange) {
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    };
  }
}

// Nova's own voice: the gesture-unlocked <audio> the ElevenLabs replies
// play through. The element ALSO routes straight to the speakers — the
// analyser is a tap, never in the audible path.
export function attachSpeechElement(el) {
  if (!el || !ensureCtx()) return () => {};
  ctx.resume().catch(() => {});
  if (!wiredElements.has(el)) {
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(analyser);
      src.connect(ctx.destination);
      wiredElements.add(el);
    } catch {
      return () => {};
    }
  }
  active++;
  start();
  return () => { active = Math.max(0, active - 1); };
}

// His voice: a mic tap while dictation runs. Mic audio connects to the
// analyser ONLY — never to the speakers (feedback). The caller owns the
// stream's lifetime and stops its tracks when dictation ends.
export function attachMicStream(stream) {
  if (!stream || !ensureCtx()) return () => {};
  ctx.resume().catch(() => {});
  try {
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    active++;
    start();
    return () => {
      try { src.disconnect(); } catch { /* already gone */ }
      active = Math.max(0, active - 1);
    };
  } catch {
    return () => {};
  }
}
