import { useEffect, useRef } from 'react';
import { audioLevel, graphRunning } from '../audioLevel.js';
import { reducedMotion } from './springs.js';

// HIS VOICE, AS THE MICROPHONE HEARS IT (15 Oct 2026, mockup #s11). Each bar
// is the shared meter's REAL level a moment ago (audioLevel.js), newest on
// the right, read from a frame loop through refs so it costs no render.
// Never faked: the caller mounts it only where a meter exists, and while the
// audio graph is asleep (it reads zero) the bars hide rather than lie flat.
const BARS = 28;
const STEP_MS = 50;

export function MicLevel() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const bars = [...root.children];
    const hist = new Array(BARS).fill(0);
    let raf = 0;
    let last = 0;
    const still = reducedMotion();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < STEP_MS) return;
      last = now;
      const deaf = !graphRunning();
      root.dataset.deaf = deaf ? 'true' : 'false';
      if (deaf) return;
      hist.shift();
      hist.push(Math.min(1, audioLevel()));
      // reduced motion: one steady level, all bars together, no travelling wave
      for (let i = 0; i < BARS; i++) {
        const lvl = still ? hist[BARS - 1] : hist[i];
        bars[i].style.transform = `scaleY(${(1 + lvl * 6).toFixed(2)})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={ref} className="nv-hold-lv" data-deaf="true" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => <u key={i} />)}
    </div>
  );
}
