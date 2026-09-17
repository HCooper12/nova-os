// THE MIC CHECK — because "it says listening and nothing happens" is not a
// diagnosis, and four days of it is not a bug report either.
//
// 17 Sep 2026, his report: Nova says it is listening, takes no input, then
// pauses the conversation "because it thinks I am not speaking at all."
// server/data/voice/turns.json answered the first half outright:
//
//     iPhone turns: 10 — heard on 0
//     Mac turns:     6 — heard on 6
//
// Every turn that ever heard him was a MAC — Claude's own verification runs.
// Every turn from his phone, across four days and both surfaces, recorded
// `heard: false`: rec.onresult never fired once. Dictation has never worked
// on the only device Nova is for, and nothing in the app could tell the
// difference between that and a man sitting in silence.
//
// This is the same shape as the haptics fault: a feature verified on a Mac
// that could not work on his phone. The instrument comes first, because the
// remaining question — WHY iOS returns no transcript — cannot be answered
// from this machine, and every answer from here would be a guess.
//
// THE DECISIVE EXPERIMENT is stages 4 and 5. src/turnEnd.js runs the engine
// with `continuous: true` so that Nova, not the browser, ends his turn, and
// the memory that records that decision flags it in plain terms: "That
// `continuous: true` behaves on iOS as it does on the desktop is reasoned
// from WakeWord.jsx — not observed." Running both modes back to back on his
// actual phone settles it in fifteen seconds.
//
// ORDERING MATTERS AND IS NOT NEGOTIABLE. The level meter holds a
// getUserMedia stream, and on iOS a parallel capture is exactly what can
// starve SpeechRecognition (see the IOS guard in useDictation.js). So the
// stream is released and its context closed BEFORE a recogniser is opened,
// and the two recognisers never overlap either.

import { speechRecognitionSupported } from './useDictation.js';

// Long enough to speak a short sentence into, short enough that the whole
// check is under half a minute of his time.
export const LEVEL_MS = 4000;
export const LISTEN_MS = 6000;

// Above this RMS peak the microphone is provably delivering audio. Speech at
// arm's length sits well above it; a muted or hijacked input sits at zero.
// Deliberately low — the question is "any signal at all", not "loud enough".
export const LEVEL_FLOOR = 0.02;

const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the verdict
//
// Pure, and tested, because this is the sentence he will act on. It says what
// was observed and what to do about it, and where the evidence does not reach
// a cause it SAYS so rather than picking the likeliest story.

export function micVerdict(r) {
  const has = (v) => v !== null && v !== undefined;

  if (!r.srSupported) {
    return {
      cause: 'This browser has no speech recognition at all.',
      fix: 'Open Nova in Safari on iOS, or Chrome on the Mac. Nothing in Nova can work around a missing engine.',
      settled: true,
    };
  }
  if (r.permission === 'denied') {
    return {
      cause: 'The microphone is blocked for this site.',
      fix: IOS
        ? 'iPhone: tap “aA” in Safari’s address bar → Website Settings → Microphone → Allow. If Nova is on your Home Screen, delete and re-add it after allowing.'
        : 'Allow the microphone for this site in your browser’s address-bar permissions, then run this again.',
      settled: true,
    };
  }
  if (r.permission && r.permission !== 'granted') {
    return {
      cause: `The microphone could not be opened (${r.permission}).`,
      fix: 'Close anything else using the mic — a call, a recording app, another Nova tab — and run this again.',
      settled: false,
    };
  }
  if (has(r.peakLevel) && r.peakLevel < LEVEL_FLOOR) {
    return {
      cause: 'The microphone is allowed, but it delivered silence — no sound reached the page at all.',
      fix: 'Something else owns the microphone, or the input is routed somewhere you are not speaking into. End any call, disconnect AirPods or a headset, and run this again.',
      settled: true,
    };
  }

  const cont = r.continuousResults;
  const single = r.singleResults;
  if (!has(cont) || !has(single)) {
    return {
      cause: 'The check did not finish, so there is nothing to conclude.',
      fix: 'Run it again and speak through all three prompts.',
      settled: false,
    };
  }

  // THE ONE THIS EXISTS FOR. Continuous is what every conversational surface
  // runs on; if only single-shot returns words, the fault is a single flag.
  if (cont === 0 && single > 0) {
    return {
      cause: 'Continuous recognition returns nothing on this device. Single-shot recognition works.',
      fix: 'This is a fault in Nova, and now a known one: the conversational surfaces run the engine continuously so Nova can own the end of your turn. Send me this result and I will run those surfaces on repeated single-shot takes instead.',
      settled: true,
    };
  }
  if (cont === 0 && single === 0) {
    return {
      cause: 'The microphone hears you, but the system returned no transcription in either mode.',
      fix: IOS
        ? 'iOS speech recognition runs on Dictation. Check iPhone Settings → General → Keyboard → Enable Dictation is ON, and Settings → Siri & Search is not fully disabled. Turn Dictation off and on again if it is already on, then run this check again.'
        : 'The speech engine accepted audio and returned nothing. Check your OS dictation/speech settings, then run this again.',
      settled: true,
    };
  }
  if (cont > 0 && single === 0) {
    return {
      cause: 'Continuous recognition works here; single-shot returned nothing.',
      fix: 'Unusual, and the opposite of the suspected fault. Send me this result — Nova already uses continuous on the conversational surfaces, so voice should work; the fault is elsewhere.',
      settled: false,
    };
  }
  return {
    cause: 'Speech recognition works on this device, in both modes.',
    fix: 'The microphone and the engine are fine, so a failing conversation is Nova’s turn handling, not your phone. Send me this result and the next few turn receipts.',
    settled: false,
  };
}

// ---------------------------------------------------------------- the runner

// Peak RMS over a window, on a context of its OWN. The app's shared graph in
// audioLevel.js is suspended by iOS the moment recognition takes the audio
// session, and borrowing it here would both mislead this check and leave the
// core's meter holding a stream it did not open.
async function measureLevel(stream, ms) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    await ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);            // never to destination — that is feedback
    const data = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
      peak = Math.max(peak, Math.sqrt(sum / data.length));
      await wait(50);
    }
    try { src.disconnect(); } catch { /* already gone */ }
    return peak;
  } finally {
    try { await ctx.close(); } catch { /* already gone */ }
  }
}

// One recogniser, one mode, one window. Counts RESULT EVENTS rather than
// words: an interim with no text still proves the engine is receiving audio,
// which is the whole question.
function listenOnce(continuous, ms) {
  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { resolve({ results: 0, text: '', error: 'unsupported' }); return; }
    let rec;
    try { rec = new SR(); } catch { resolve({ results: 0, text: '', error: 'construct-failed' }); return; }
    let results = 0;
    let text = '';
    let error = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rec.abort?.(); } catch { /* already gone */ }
      resolve({ results, text: text.trim(), error });
    };
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    rec.onresult = (e) => {
      results += 1;
      let all = '';
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
      if (all.trim()) text = all;
    };
    // `no-speech` is a real answer here, not noise: it means the engine ran
    // and heard nothing, which is exactly the fault being chased.
    rec.onerror = (e) => { error = e?.error || 'error'; };
    rec.onend = () => { if (!continuous) finish(); };
    const timer = setTimeout(finish, ms);
    try { rec.start(); } catch (e) { error = 'start-threw'; finish(); }
  });
}

// `onStage(stage, ok, detail)` mirrors runVoiceTest's shape so Settings can
// render both with one component. `onSay(prompt)` is what he should be doing
// right now — the check is worthless if he is silent through it.
export async function runMicCheck({ onStage, onSay } = {}) {
  const stage = (s, ok, detail) => { try { onStage?.(s, ok, detail); } catch { /* never stop the check */ } };
  const say = (p) => { try { onSay?.(p); } catch { /* ditto */ } };
  const r = {
    srSupported: speechRecognitionSupported(),
    permission: null, peakLevel: null,
    continuousResults: null, continuousText: '', continuousError: '',
    singleResults: null, singleText: '', singleError: '',
    audioSession: null,
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  };

  stage('Speech recognition', r.srSupported, r.srSupported ? 'available in this browser' : 'not available at all');

  // What the page has told iOS about the audio session. 'auto' is what
  // useDictation asks for while the mic is open; anything else here while a
  // turn is live would be a real finding.
  try {
    const s = navigator.audioSession;
    r.audioSession = s ? s.type : 'unsupported';
  } catch { r.audioSession = 'unsupported'; }
  stage('Audio session', r.audioSession !== 'unsupported', r.audioSession === 'unsupported'
    ? 'this browser has no audioSession API — normal outside Safari'
    : `type is “${r.audioSession}”`);

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    r.permission = 'granted';
  } catch (e) {
    r.permission = e?.name === 'NotAllowedError' ? 'denied' : (e?.name || 'failed');
  }
  stage('Microphone permission', r.permission === 'granted',
    r.permission === 'granted' ? 'granted' : `not granted — ${r.permission}`);

  if (stream) {
    say('Say something now — anything, for four seconds.');
    r.peakLevel = await measureLevel(stream, LEVEL_MS);
    const heard = has(r.peakLevel) && r.peakLevel >= LEVEL_FLOOR;
    stage('Microphone is delivering sound', heard, has(r.peakLevel)
      ? `peak level ${(r.peakLevel * 100).toFixed(1)}%${heard ? '' : ' — silence'}`
      : 'could not measure (no audio context)');
    // RELEASED BEFORE ANY RECOGNISER OPENS. A parallel capture is the thing
    // most likely to starve SpeechRecognition on iOS; leaving it running
    // would make the next two stages untrustworthy.
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* already gone */ }
    await wait(300);
  }

  if (r.srSupported) {
    say('Keep talking — testing continuous mode for six seconds.');
    const cont = await listenOnce(true, LISTEN_MS);
    r.continuousResults = cont.results; r.continuousText = cont.text; r.continuousError = cont.error;
    stage('Continuous recognition', cont.results > 0,
      cont.results > 0 ? `${cont.results} result events — “${cont.text.slice(0, 60)}”`
        : `no results${cont.error ? ` (${cont.error})` : ''}`);

    await wait(500);   // let the engine let go before the next one opens
    say('Once more — testing single-shot mode.');
    const one = await listenOnce(false, LISTEN_MS);
    r.singleResults = one.results; r.singleText = one.text; r.singleError = one.error;
    stage('Single-shot recognition', one.results > 0,
      one.results > 0 ? `${one.results} result events — “${one.text.slice(0, 60)}”`
        : `no results${one.error ? ` (${one.error})` : ''}`);
  }

  say('');
  return { ...r, verdict: micVerdict(r) };
}

function has(v) { return v !== null && v !== undefined; }
