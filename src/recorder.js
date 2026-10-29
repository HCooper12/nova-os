// ---------------------------------------------------------------------------
// NOVA'S OWN EARS, THE BROWSER HALF. Records him with the plain microphone
// API and hands the bytes to the Mac, which returns the words
// (server/lib/hearing.js, POST /api/voice/transcribe).
//
// Why it exists: on his iPhone the browser's speech engine has heard him on
// 1 turn in 21 (server/data/voice/turns.json by device). A recording depends
// on none of that machinery: getUserMedia + MediaRecorder, the same path any
// web voice-memo app uses.
//
// This module owns the microphone for one turn and nothing else. Deciding
// when the turn ends is turnEnd.js's job, fed by vad.js's "is he talking";
// what to do with the words is the surface's job, through useDictation.
// ---------------------------------------------------------------------------

import { openVad, vadStep, vadBlind } from './vad.js';
import { attachMicStream, openMicLevel, openOwnMeter, sharedGraphState } from './audioLevel.js';
import { getConnection } from './api.js';

const SAMPLE_MS = 100;

export const recorderSupported = () => typeof window !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder === 'function';

// The container the browser records best: Opus in WebM on Chrome/Firefox,
// AAC in MP4 on Safari. Both are formats Whisper reads.
export function pickRecordingType(isSupported) {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    try { if (isSupported(t)) return t; } catch { /* keep looking */ }
  }
  return '';
}

// Open the mic and start recording. Resolves to a live handle, or rejects with
// the browser's own error (NotAllowedError when he said no).
//   onLevel(vadState) — every 100ms, what the meter thinks
export async function openRecording({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const type = pickRecordingType((t) => window.MediaRecorder.isTypeSupported?.(t));
  let rec;
  try {
    rec = type ? new window.MediaRecorder(stream, { mimeType: type }) : new window.MediaRecorder(stream);
  } catch (e) {
    stream.getTracks().forEach((tr) => tr.stop());
    throw e;
  }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  rec.start(1000);   // a slice a second: a crash mid-turn loses a second, not the turn

  // THE METER, sampled on a timer (not rAF, which stops when the screen
  // does) so ending his turn never depends on the core being painted. It
  // reads the app's shared audio graph (audioLevel.openMicLevel says why).
  let vad = openVad();
  const level = openMicLevel(stream);
  let blindMs = 0;   // how long the meter read blind this turn, for the receipt
  // the receipt's diagnosis of a deaf turn (29 Oct 2026): which meter heard
  // him, what the shared graph was doing when it went blind, and whether the
  // phone handed over a muted microphone (another app or a call holding it)
  let own = null;
  let ownTried = false;
  let meter = 'none';
  let graphAtBlind = '';
  const track = stream.getAudioTracks?.()[0] || null;
  let muted = !!track?.muted;
  try { track?.addEventListener?.('mute', () => { muted = true; }); } catch { /* old engine */ }
  const timer = setInterval(() => {
    // a sleeping graph is asked to wake on every sample, not once at open
    if (level && !level.running()) { try { level.resume(); } catch { /* refused */ } }
    let r = level ? level.rms() : 0;
    if (r > 0 && meter === 'none') meter = 'shared';
    // DEAF FOR 1.5 S: one try at a meter of its own (audioLevel.openOwnMeter)
    if (r === 0 && !ownTried && vadBlind(vad)) {
      ownTried = true;
      graphAtBlind = sharedGraphState();
      own = openOwnMeter(stream);
    }
    if (own && r === 0) {
      const o = own.rms();
      if (o > 0) { r = o; meter = 'own'; }
    }
    vad = vadStep(vad, r);   // no meter reads zero → blind → the words decide (useDictation)
    if (vadBlind(vad)) blindMs += SAMPLE_MS;
    onLevel?.(vad);
  }, SAMPLE_MS);
  // the core swells while he talks — best effort, the shared meter's business
  const detachMeter = attachMicStream(stream);

  let stopped = null;
  const release = () => {
    clearInterval(timer);
    try { detachMeter(); } catch { /* gone */ }
    try { level?.detach(); } catch { /* gone */ }
    try { own?.close(); } catch { /* gone */ }
    own = null;
    stream.getTracks().forEach((tr) => tr.stop());
  };

  return {
    type: rec.mimeType || type || 'audio/mp4',
    vad: () => vad,
    blind: () => vadBlind(vad),
    blindMs: () => blindMs,
    // for the receipt: 'shared' | 'own' | 'none', the graph's state when the
    // shared meter went blind, and whether the track ever arrived muted
    diagnosis: () => ({ meter, ...(graphAtBlind ? { graphAtBlind } : {}), ...(muted ? { muted: true } : {}) }),
    // Stop and hand back the whole recording. Idempotent.
    stop() {
      if (stopped) return stopped;
      stopped = new Promise((resolve) => {
        const finish = () => { release(); resolve(new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' })); };
        if (rec.state === 'inactive') { finish(); return; }
        rec.onstop = finish;
        try { rec.stop(); } catch { finish(); }
      });
      return stopped;
    },
    // THE CLIP SO FAR, WITHOUT STOPPING (27 Oct 2026, "still talking?").
    // requestData() flushes what the encoder holds, and every slice from the
    // first one, joined, is a playable file in both containers this records:
    // WebM/Opus (the header rides the first slice, clusters follow) and the
    // fragmented MP4 Safari and WKWebView write when given a timeslice (the
    // first slice carries ftyp+moov, later ones moof+mdat). Measured on the
    // Mac 26 Oct: a WebM cut mid-cluster and an MP4 cut mid-fragment both
    // transcribed (groq, ~200-300 ms). Resolves null when there is nothing
    // to read, so the caller falls back to judging on silence alone.
    peek() {
      if (stopped || rec.state !== 'recording') return Promise.resolve(null);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          rec.removeEventListener?.('dataavailable', onData);
          resolve(chunks.length ? new Blob(chunks.slice(), { type: rec.mimeType || type || 'audio/mp4' }) : null);
        };
        // the property handler above pushes the slice first; read after it
        const onData = () => setTimeout(finish, 0);
        rec.addEventListener?.('dataavailable', onData);
        try { rec.requestData(); } catch { finish(); }
        setTimeout(finish, 400);   // an encoder that never answers: what we have
      });
    },
    // Abandon: the mic is released and nothing is kept.
    cancel() {
      if (stopped) return;
      stopped = Promise.resolve(null);
      try { rec.onstop = null; rec.stop(); } catch { /* already stopped */ }
      release();
    },
  };
}

// The recording → his words, via the Mac. Throws in words on failure.
//   vad — what the level meter made of it ('heard'|'silent'|'blind'): when it
//         heard speech the Mac keeps a bare "Thank you." as his words
export async function transcribeRecording(blob, { timeoutMs = 30_000, vad = '' } = {}) {
  const conn = getConnection();
  if (!conn) throw new Error('Nova is not connected to the Mac, so it cannot hear you');
  const started = Date.now();
  const r = await fetch(`${conn.baseUrl.replace(/\/$/, '')}/api/voice/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/octet-stream', 'X-Audio-Type': blob.type || 'audio/mp4', ...(vad ? { 'X-Vad': vad } : {}) },
    body: blob,
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `the Mac could not hear that (${r.status})`);
  // `dropped`: the filler line the Mac took off a silent clip ("Thank you."),
  // for the turn receipt; `empty`: the Mac skipped a capture with nothing in it
  return { text: String(j.text || ''), backend: j.backend || '', ms: Date.now() - started, dropped: typeof j.dropped === 'string' ? j.dropped : '', empty: !!j.empty };
}
