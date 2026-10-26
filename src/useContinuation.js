// KEEP GOING (27 Oct 2026). His report: "There also doesn't seem to be a way
// for me to continue with my response." People do it all the time: the turn
// goes, then "...oh, and also". After a spoken send this keeps the mic open
// for the continuation window (src/turnSense.js isContinuation says how long);
// his voice in it, while Nova is silent, claims the turn, and the words that
// follow join the last turn instead of starting a new one (App
// claimContinuation / sendContinuation). Nothing said: the mic goes quietly,
// with no "heard nothing" and no receipt.
//
// Shared by both Voice surfaces (screens/Voice.jsx and screens/NovaThread.jsx)
// so the two idioms cannot drift.
import { useEffect, useRef, useState } from 'react';

export function useContinuation(v) {
  // null, 'open' (waiting for his voice) or 'claimed' (he spoke in it)
  const contRef = useRef(null);
  const dictRef = useRef(null);
  const [continuing, setContinuing] = useState(false);
  const setCont = (mode) => { contRef.current = mode; setContinuing(mode === 'open' || mode === 'claimed'); };

  // The turn ended with words `t`. Returns true when this handled it (a
  // continuation turn); false means the surface sends as it always did, and
  // then calls opened() so the window can open behind the send.
  const ended = (t) => {
    const mode = contRef.current;
    if (!mode) return false;
    setCont(null);
    if (mode === 'claimed' && v.sendContinuation?.(t)) { v.setOrbInputValue?.(''); return true; }
    v.releaseContinuation?.();
    // words with no claim (his voice came while Nova spoke): an ordinary turn
    if (t && mode !== 'claimed') return false;
    v.setOrbInputValue?.('');
    return true;
  };
  // The send has gone: open the window on the next tick, once the hook has
  // closed the turn that just ended.
  const opened = () => {
    setTimeout(() => {
      const d = dictRef.current;
      if (!d?.supported || d.on || d.hearing || !v.continueOpen?.()) return;
      setCont('open');
      d.toggle({ trigger: 'continue' });
    }, 30);
  };
  // his voice, from useDictation's onSound
  const sound = (at) => { if (contRef.current === 'open' && v.claimContinuation?.(at)) setCont('claimed'); };
  // Nova handed the turn back while the window was still open: the open mic
  // simply becomes his next turn. True when that happened.
  const handBack = () => {
    if (contRef.current !== 'open' || !dictRef.current?.on) return false;
    setCont(null);
    v.releaseContinuation?.();
    return true;
  };

  // the window closed with nothing said in it: the mic goes, quietly
  useEffect(() => {
    if (!continuing) return undefined;
    const id = setInterval(() => {
      if (contRef.current !== 'open') return;
      if (!dictRef.current?.on) { setCont(null); return; }
      if (v.continueClosed?.()) { setCont(null); v.releaseContinuation?.(); dictRef.current.abandon?.(); }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuing]);

  return { continuing, dictRef, ended, opened, sound, handBack };
}
