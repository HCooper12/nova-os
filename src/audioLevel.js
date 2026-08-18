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
let held = false; // are WE claiming the audio session right now?
export function resumeAudioGraph() {
  if (!ctx) return;
  held = true;
  ctx.resume().catch(() => {});
  if (!ctx.onstatechange) {
    ctx.onstatechange = () => {
      // fight the OS for the session ONLY while we're actually speaking —
      // an unconditional re-resume kept his AirPods pinned to Nova and
      // Music couldn't reclaim them after the conversation ended
      if (held && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume().catch(() => {});
    };
  }
}

// Done talking and listening: let the audio session go so Music/podcasts
// can take the AirPods back. Suspend is instantly reversible — the next
// resumeAudioGraph() (every gesture, every chunk) re-claims in ~ms.
export function releaseAudioGraph() {
  if (!ctx) return;
  if (active > 0) return; // a mic tap or a playing source still needs it
  held = false;
  ctx.suspend().catch(() => {});
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

// Nova's sentence chunks, the crisp path: decode the whole chunk up front,
// then play it as a raw buffer on the audio THREAD. An <audio> element
// decodes as it plays and stutters when the main thread is busy (a VM, a
// typing animation, the core's canvas) — "jitters during sentences", his
// words. A decoded AudioBufferSource cannot: the samples already exist.
export function decodeSpeech(arrayBuffer) {
  if (!ensureCtx()) return Promise.reject(new Error('no audio context'));
  return ctx.decodeAudioData(arrayBuffer);
}

export function playSpeechBuffer(buffer, onEnded) {
  if (!ensureCtx()) { onEnded?.(); return null; }
  ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(analyser);      // the core hears it
  src.connect(ctx.destination); // and so does he
  active++;
  start();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    active = Math.max(0, active - 1);
    try { src.disconnect(); } catch { /* already gone */ }
    onEnded?.();
  };
  src.onended = finish;
  // A suspended context (fresh document, no gesture yet) starts the source
  // but never advances time — onended never fires and the sentence FIFO
  // stalls forever, holding the reply's commit hostage. The watchdog frees
  // it: duration + grace, then move on (the text was already revealed).
  const watchdog = setTimeout(finish, buffer.duration * 1000 + 3000);
  src.start();
  return src; // caller may .stop() to interrupt
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
