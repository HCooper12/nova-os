import { useRef, useState } from 'react';

// Real dictation via the browser's speech engine (on-device / OS-provided).
// Feature-detected: mic buttons only render where it actually works. Shared
// by the Inbox capture composer (continuous — long dictation) and the Voice
// screen (one-shot: continuous false, so silence genuinely ends the take
// and onDone fires — iOS never ends a continuous session on pause).
export function useDictation(getBase, onText, onDone, { continuous = true } = {}) {
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
    rec.onend = () => { setOn(false); onDone?.(); };
    rec.onerror = () => setOn(false);
    recRef.current = rec;
    rec.start();
    setOn(true);
  };
  return { supported: !!SR, on, toggle };
}
