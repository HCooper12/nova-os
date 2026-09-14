import { useEffect, useRef } from 'react';
import { micStarted, micStopped } from './audioSession.js';

// "HEY NOVA" — the wake word. A headless listener that runs wherever he is
// in Nova and starts the conversation when it hears its name, so talking
// needs no tap at all.
//
// Rules it lives by:
//  - OPT-IN, always. It holds the microphone open, and nothing in Nova turns
//    a microphone on by itself. The Settings toggle is the only way in.
//  - It NEVER runs at the same time as dictation or while Nova is speaking:
//    one recogniser owns the mic at a time, and a listener that hears Nova's
//    own voice would wake on its own replies.
//  - It restarts itself, because the browser ends a recognition session on
//    its own schedule (silence, tab focus, engine hiccup). A wake word that
//    stops listening after 60s is worse than none, since he'd never know.
//  - A refused microphone turns the whole thing OFF and says so — it does
//    not sit there pretending to listen.
const PHRASE = /\bhey,?\s*nova\b/i;
const RESTART_MS = 400;

export function WakeWord({ enabled, blocked, onWake, onError }) {
  const wakeRef = useRef(onWake);
  wakeRef.current = onWake;
  const errRef = useRef(onError);
  errRef.current = onError;
  // `blocked` changes constantly (speaking, listening, thinking); a ref keeps
  // the recogniser from being torn down and rebuilt on every one of them
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const recRef = useRef(null);
  const wantRef = useRef(false);

  useEffect(() => {
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!enabled || !SR) return undefined;
    wantRef.current = true;
    let restartT = 0;

    const start = () => {
      if (!wantRef.current || recRef.current || blockedRef.current) return;
      let rec;
      try { rec = new SR(); } catch { return; }
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-AU';
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!PHRASE.test(e.results[i][0].transcript || '')) continue;
          // hand the mic over cleanly — dictation opens on the same beat
          try { rec.stop(); } catch { /* already stopping */ }
          wakeRef.current?.();
          return;
        }
      };
      rec.onend = () => {
        micStopped();
        if (recRef.current === rec) recRef.current = null;
        clearTimeout(restartT);
        if (wantRef.current) restartT = setTimeout(start, RESTART_MS);
      };
      rec.onerror = (e) => {
        const kind = e?.error || 'failed';
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          wantRef.current = false; // permission refused — stop for real, and say so
          errRef.current?.(kind);
        }
      };
      try { micStarted(); rec.start(); recRef.current = rec; } catch { micStopped(); /* already running */ }
    };

    // THE RESUME PATH ONLY. Stopping is handled reactively, by the effect
    // below — see it for why. Coming back is not urgent in the same way:
    // nothing is competing for the microphone while this one is off, so a
    // beat of delay costs nothing and re-subscribing on every `blocked`
    // flicker would cost a teardown.
    const gate = setInterval(() => {
      if (!wantRef.current || blockedRef.current || recRef.current) return;
      start();
    }, 900);
    start();

    return () => {
      wantRef.current = false;
      clearInterval(gate);
      clearTimeout(restartT);
      if (recRef.current) { try { recRef.current.stop(); } catch { /* fine */ } recRef.current = null; }
    };
  }, [enabled]);

  // GETTING OUT OF THE WAY IS URGENT. The gate above used to do the stopping
  // too, which meant that when the Voice screen or the bottom bar opened
  // dictation, this recogniser kept running for up to 900ms — two
  // SpeechRecognition sessions fighting over one iPhone microphone. His 12
  // Sep report: "I was having bugs between the listening mode while on the
  // voice screen and the listening mode from the bar at the bottom … a few
  // times Nova began talking over me while it still said it was listening".
  // So the handover is now on the same beat as the flip: `blocked` going true
  // stops this recogniser immediately. `blockedRef` is assigned during render,
  // so it is already true by the time this runs and the restart in `onend`
  // will decline to reopen.
  useEffect(() => {
    if (!blocked || !recRef.current) return;
    try { recRef.current.stop(); } catch { /* already stopping */ }
  }, [blocked]);

  return null;
}
