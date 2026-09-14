import { useEffect, useRef } from 'react';
import { micStarted, micStopped } from './audioSession.js';
import { bargeInDecision } from './bargeIn.js';

// "HEY NOVA" — the wake word. A headless listener that runs wherever he is
// in Nova and starts the conversation when it hears its name, so talking
// needs no tap at all.
//
// Rules it lives by:
//  - OPT-IN, always. It holds the microphone open, and nothing in Nova turns
//    a microphone on by itself. The Settings toggle is the only way in.
//  - It never runs at the same time as DICTATION: one recogniser owns the mic
//    at a time. It DOES run while Nova is speaking, which is what makes
//    interrupting possible — and is why everything it hears then has to be
//    checked against what Nova is saying (bargeIn.js). This comment used to
//    claim the opposite; the vals layer has been the truth since barge-in by
//    name was added, and this now says so.
//  - BARGE-IN (14 Sep 2026). His report, driving: "I had to keep trying to cut
//    it off so I could explain more." Saying the name already worked; now any
//    sentence Nova is demonstrably not saying cuts it off too, so talking over
//    Nova needs no phrase and no tap.
//  - It restarts itself, because the browser ends a recognition session on
//    its own schedule (silence, tab focus, engine hiccup). A wake word that
//    stops listening after 60s is worse than none, since he'd never know.
//  - A refused microphone turns the whole thing OFF and says so — it does
//    not sit there pretending to listen.
const PHRASE = /\bhey,?\s*nova\b/i;
const RESTART_MS = 400;

export function WakeWord({ enabled, blocked, onWake, onError, speaking, saying, bargeIn, onBargeIn }) {
  const wakeRef = useRef(onWake);
  wakeRef.current = onWake;
  // all of these change on every sentence; refs, so the recogniser is never
  // torn down and rebuilt mid-reply
  const bargeRef = useRef(onBargeIn);
  bargeRef.current = onBargeIn;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const sayingRef = useRef(saying);
  sayingRef.current = saying;
  const bargeOnRef = useRef(bargeIn);
  bargeOnRef.current = bargeIn;
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
          const heard = e.results[i][0].transcript || '';
          if (PHRASE.test(heard)) {
            // hand the mic over cleanly — dictation opens on the same beat
            try { rec.stop(); } catch { /* already stopping */ }
            wakeRef.current?.();
            return;
          }
          // Anything else only matters while Nova is talking: that is the one
          // moment the mic is open and he has no other way in. The filter is
          // biased toward "that was Nova" — see bargeIn.js.
          if (!bargeOnRef.current || !speakingRef.current) continue;
          const d = bargeInDecision(heard, sayingRef.current);
          if (!d.barge) continue;
          try { rec.stop(); } catch { /* already stopping */ }
          bargeRef.current?.(heard, d.why);
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
