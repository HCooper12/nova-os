import { useRef, useState } from 'react';
import { micStarted, micStopped } from './audioSession.js';
import { attachMicStream } from './audioLevel.js';

// The mic tap below is desktop-only on purpose: SpeechRecognition on iOS
// owns the microphone, and a parallel getUserMedia capture risks silently
// breaking dictation itself — the feature that must never regress. On iOS
// the core still swells for Nova's own voice (the TTS tap in App.speak).
const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

// Real dictation via the browser's speech engine (on-device / OS-provided).
// Feature-detected: mic buttons only render where it actually works. Shared
// by the Inbox capture composer (continuous — long dictation) and the Voice
// screen (one-shot: continuous false, so silence genuinely ends the take
// and onDone fires — iOS never ends a continuous session on pause).
// One place asks whether this browser can hear at all — the dictation hook,
// the wake word, and every button that should hide itself when it cannot.
export const speechRecognitionSupported = () => typeof window !== 'undefined'
  && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function useDictation(getBase, onText, onDone, { continuous = true, onError } = {}) {
  const recRef = useRef(null);
  const baseRef = useRef('');
  const [on, setOn] = useState(false);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const toggle = () => {
    if (on) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    baseRef.current = getBase();
    let finals = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += t;
        else interim += t;
      }
      const joined = (baseRef.current + ' ' + finals + interim).replace(/\s+/g, ' ').trim();
      onText(joined);
    };
    const meter = { stream: null, detach: null };
    const stopMeter = () => {
      try { meter.detach?.(); } catch { /* already gone */ }
      try { meter.stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
      meter.stream = null;
      meter.detach = null;
    };
    rec.onend = () => { stopMeter(); micStopped(); setOn(false); onDone?.(); };
    // a denied mic permission used to just silently flip the button off
    rec.onerror = (e) => { stopMeter(); micStopped(); setOn(false); onError?.(e?.error || 'dictation failed'); };
    recRef.current = rec;
    micStarted(); // the browser picks the recording session while he talks
    rec.start();
    setOn(true);
    // best-effort audio-level tap so the core visibly hears him while he
    // talks — any failure leaves dictation completely untouched
    if (!IOS && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (recRef.current !== rec) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        meter.stream = stream;
        meter.detach = attachMicStream(stream);
      }).catch(() => { /* no meter, no harm */ });
    }
  };
  return { supported: !!SR, on, toggle };
}
