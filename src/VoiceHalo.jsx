import { useEffect, useRef } from 'react';
import { audioLevel } from './audioLevel.js';

// The voice halo — his ask: the icon must feel alive while Nova talks,
// "dynamic and changing/pulsating like in the reference". Driven by the
// REAL audio analyser at 60fps through a ref (never React state, or every
// frame would re-render the app). Nova's voice swells it; his own voice
// does too while dictating. Silent = invisible, so it never fakes life.
export function VoiceHalo({ speaking, listening, inset = '-7px' }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let quiet = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const lvl = audioLevel();
        if (lvl > 0.01) quiet = 0; else quiet++;
        const live = speaking || listening;
        // a floor of presence between syllables, fading out once genuinely silent
        const amp = live ? Math.max(lvl, quiet < 12 ? 0.14 : 0.05) : lvl;
        el.style.transform = `scale(${(1 + amp * 0.6).toFixed(3)})`;
        el.style.opacity = String(Math.min(0.95, amp * 1.6));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, listening]);

  return (
    <span ref={ref} aria-hidden="true" style={{
      position: 'absolute', inset, borderRadius: '50%', pointerEvents: 'none', opacity: 0,
      border: '2px solid var(--nv-cy)',
      boxShadow: '0 0 24px -2px var(--nv-cy), inset 0 0 16px -5px var(--nv-cy)',
      willChange: 'transform, opacity',
    }}></span>
  );
}
