import { useEffect, useRef, useState } from 'react';
import { micStarted, micStopped } from './audioSession.js';
import { attachMicStream } from './audioLevel.js';
import { openTurn, sawSpeech, sawEngineEnd, sawRestart, nextAction, endReason } from './turnEnd.js';
import { getConnection } from './api.js';

// The mic tap below is desktop-only on purpose: SpeechRecognition on iOS
// owns the microphone, and a parallel getUserMedia capture risks silently
// breaking dictation itself — the feature that must never regress. On iOS
// the core still swells for Nova's own voice (the TTS tap in App.speak).
const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

// How often the turn clock asks whether he has finished. Fine enough that
// the send never feels late, coarse enough to cost nothing.
const TICK_MS = 200;

// The engine giving up is not a fault. Under a hold these arrive constantly
// — every pause longer than the browser's own patience — and surfacing them
// would put an error banner under a turn that is going perfectly well.
const SOFT_ERRORS = new Set(['no-speech', 'aborted']);

// How long to wait before trying a thrown restart once more. Long enough for
// the dying engine to have let go of the microphone, short enough that he
// does not hear a hole in the middle of his own sentence.
const RESTART_RETRY_MS = 300;

// WHY THE TURN ENDED, WRITTEN DOWN. Fire-and-forget, awaited by nobody: the
// next time he says "it cut me off" the answer is a line in
// server/data/voice/turns.json instead of a guess. It is a receipt, not
// analytics — nothing reads it but him and whoever is debugging with him.
// A failed POST is a missing line and nothing else; it must never cost him
// the send that is happening on the same beat.
export function reportTurnEnd(surface, preset, info) {
  try {
    const conn = getConnection();
    if (!conn) return;
    fetch(`${conn.baseUrl.replace(/\/$/, '')}/api/voice/turn`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...info, surface, preset, ua: typeof navigator === 'undefined' ? '' : navigator.userAgent }),
      keepalive: true,   // the screen may be closing on the same gesture
    }).catch(() => { /* a receipt is never worth an error in his face */ });
  } catch { /* no connection, no receipt */ }
}

// Real dictation via the browser's speech engine (on-device / OS-provided).
// Feature-detected: mic buttons only render where it actually works.
//
// TWO WAYS THE TURN CAN END.
//   Engine-owned (holdMs 0) — the browser decides. `continuous: false` means
//     it ends the take at the first pause it notices; `continuous: true`
//     means it runs until stopped. This is what the writing surfaces want:
//     the Inbox composer and the recipe describer end when he taps.
//   App-owned (holdMs > 0) — the engine is told to run continuously and is
//     never allowed to end his turn. turnEnd.js decides, on a pause length
//     HE chose. If the engine quits early anyway (iOS does, on its own
//     schedule), another one is opened on the spot and his words carry over,
//     so a sentence spoken across the seam arrives whole.
// The second exists because of his report: dictation cut him off mid-thought
// and sent, and there is no threshold in the Web Speech API to lengthen.
//
// One place asks whether this browser can hear at all — the dictation hook,
// the wake word, and every button that should hide itself when it cannot.
export const speechRecognitionSupported = () => typeof window !== 'undefined'
  && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function useDictation(getBase, onText, onDone, { continuous = true, holdMs = 0, leadMs = 0, onError, onTurnEnd } = {}) {
  const recRef = useRef(null);
  const baseRef = useRef('');
  const saidRef = useRef('');      // words from earlier engines in THIS turn
  const finalsRef = useRef('');    // finalised by the engine now running
  const interimRef = useRef('');   // its unfinalised tail
  const turnRef = useRef(null);
  const wantRef = useRef(false);   // he still has the floor
  const liveRef = useRef(false);   // a turn is open — makes closing idempotent
  const clockRef = useRef(0);
  const retryRef = useRef(0);      // a pending second go at a thrown restart
  const reasonRef = useRef('engine'); // why this turn is ending, for the receipt
  const meterRef = useRef({ stream: null, detach: null });
  const [on, setOn] = useState(false);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const held = holdMs > 0;

  const stopMeter = () => {
    try { meterRef.current.detach?.(); } catch { /* already gone */ }
    try { meterRef.current.stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
    meterRef.current = { stream: null, detach: null };
  };

  const emit = () => {
    const tail = finalsRef.current + interimRef.current;
    onText([baseRef.current, saidRef.current, tail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
  };

  // The dying engine's words belong to the turn, not to the engine.
  const carryOver = () => {
    const tail = (finalsRef.current + interimRef.current).trim();
    if (tail) saidRef.current = `${saidRef.current} ${tail}`.replace(/\s+/g, ' ').trim();
    finalsRef.current = '';
    interimRef.current = '';
  };

  // Idempotent on purpose: error and end both arrive for the same failure,
  // and micStopped() decrements a counter that must stay balanced.
  const closeOut = (fireDone = true) => {
    if (!liveRef.current) return;
    liveRef.current = false;
    wantRef.current = false;
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = 0; }
    const turn = turnRef.current;
    turnRef.current = null;
    recRef.current = null;
    stopMeter();
    micStopped();
    setOn(false);
    // The receipt goes out BEFORE the send, because the send is what he
    // remembers and the receipt is what explains it. Wrapped: a listener
    // that throws must not swallow onDone and lose his words.
    if (held && fireDone) {
      try {
        onTurnEnd?.({
          reason: reasonRef.current,
          ms: turn ? Date.now() - turn.startedAt : 0,
          restarts: turn?.restartsTotal || 0,
          heard: !!turn && turn.lastHeardAt !== null,
        });
      } catch { /* never at the cost of the turn */ }
    }
    if (fireDone) onDone?.();
  };

  const restart = () => {
    carryOver();
    turnRef.current = sawRestart(turnRef.current, Date.now());
    recRef.current = null;
    spin(true);
  };

  // `isRestart` matters at the very bottom: a first start that throws is a
  // microphone he never got, and a restart that throws is a sentence in
  // progress. They cannot be handled the same way.
  function spin(isRestart = false, attempt = 0) {
    let rec;
    try { rec = new SR(); } catch { closeOut(); return; }
    rec.continuous = held ? true : continuous;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    finalsRef.current = '';
    interimRef.current = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalsRef.current += t;
        else interim += t;
      }
      interimRef.current = interim;
      if (turnRef.current) turnRef.current = sawSpeech(turnRef.current, Date.now());
      emit();
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;               // already superseded
      if (!held || !wantRef.current) { closeOut(); return; }
      turnRef.current = sawEngineEnd(turnRef.current);
      const now = Date.now();
      if (nextAction(turnRef.current, now, { holdMs, leadMs }) !== 'restart') {
        reasonRef.current = endReason(turnRef.current, now, { holdMs, leadMs }) || 'engine';
        closeOut();
        return;
      }
      restart();
    };
    // a denied mic permission used to just silently flip the button off
    rec.onerror = (e) => {
      const kind = e?.error || 'dictation failed';
      if (held && wantRef.current && SOFT_ERRORS.has(kind)) return;   // onend restarts
      onError?.(kind);
      closeOut();
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // A RESTART THAT THROWS USED TO SUBMIT HIS RAMBLE. iOS ends a
      // recognition session on its own every ~60s, and on a network hiccup —
      // on cellular, in the car, constantly. The replacement is built inside
      // that same `onend`, and `start()` can throw because the dying engine
      // has not let go of the microphone yet. This line used to collapse
      // straight to closeOut(), which fires onDone, which SENDS the
      // half-finished thought as though he had stopped talking — his 12 Sep
      // report, "I had to keep trying to cut it off so I could explain more".
      // So a restart gets one more go 300ms later, and only then admits the
      // engine is gone — by name, in the receipt, instead of as a mystery.
      recRef.current = null;                            // a stray onend must not be believed
      if (!isRestart || attempt > 0) { reasonRef.current = 'engine'; closeOut(); return; }
      retryRef.current = setTimeout(() => {
        retryRef.current = 0;
        if (!liveRef.current || !wantRef.current) return;   // he left, or closeOut already ran
        spin(true, attempt + 1);
      }, RESTART_RETRY_MS);
    }
  }

  // His turn is over when turnEnd.js says so — never when the engine says so.
  const tick = () => {
    if (!liveRef.current || !wantRef.current || !turnRef.current) return;
    const now = Date.now();
    const act = nextAction(turnRef.current, now, { holdMs, leadMs });
    if (act === 'wait') return;
    if (act === 'restart') { restart(); return; }
    reasonRef.current = endReason(turnRef.current, now, { holdMs, leadMs }) || 'engine';
    wantRef.current = false;               // stop() lands in onend, which closes
    const rec = recRef.current;
    if (!rec) { closeOut(); return; }
    try { rec.stop(); } catch { closeOut(); }
  };

  const startTurn = () => {
    baseRef.current = getBase();
    saidRef.current = '';
    finalsRef.current = '';
    interimRef.current = '';
    turnRef.current = openTurn(Date.now());
    reasonRef.current = 'engine';          // until the clock or the engine says otherwise
    liveRef.current = true;
    wantRef.current = true;
    micStarted();  // the browser picks the recording session while he talks
    setOn(true);
    if (held) clockRef.current = setInterval(tick, TICK_MS);
    spin();
    // best-effort audio-level tap so the core visibly hears him while he
    // talks — any failure leaves dictation completely untouched
    if (!IOS && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (!liveRef.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        meterRef.current = { stream, detach: attachMicStream(stream) };
      }).catch(() => { /* no meter, no harm */ });
    }
  };

  const toggle = () => {
    if (on) {
      wantRef.current = false;             // a deliberate stop never restarts
      const rec = recRef.current;
      if (!rec) { closeOut(); return; }
      try { rec.stop(); } catch { closeOut(); }
      return;
    }
    if (SR) startTurn();
  };

  // Leaving the screen mid-turn used to leave the recogniser running; with a
  // clock behind it that would also leave an interval ticking forever.
  useEffect(() => () => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = 0; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = 0; }
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* already gone */ }
    recRef.current = null;
    if (liveRef.current) { liveRef.current = false; stopMeter(); micStopped(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { supported: !!SR, on, toggle };
}
