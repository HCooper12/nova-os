import { useEffect, useRef } from 'react';
import { audioLevel } from './audioLevel.js';

// The waveform under the reactor — a scrolling ring buffer of REAL audio
// levels (Nova speaking through the TTS tap; him dictating, on desktop).
// Silence draws a flat baseline: the bar never invents motion, so when it
// moves, sound is genuinely happening. Canvas rAF only — no React state.
export function VoiceWaveform({ width = 220, height = 26 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const mid = height / 2;
    const N = 64;
    const buf = new Float32Array(N);
    let idx = 0;
    let raf = 0;

    const baseline = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(107,229,245,.22)';
      ctx.fillRect(0, mid - 0.5, width, 1);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      baseline();
      return undefined;
    }

    const bw = width / N;
    const draw = () => {
      idx = (idx + 1) % N;
      buf[idx] = audioLevel();
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < N; i++) {
        const v = buf[(idx + 1 + i) % N];
        const h = Math.max(1, v * (height - 4));
        ctx.fillStyle = `rgba(107,229,245,${0.22 + v * 0.6})`;
        ctx.fillRect(i * bw + 0.5, mid - h / 2, Math.max(1, bw - 1.5), h);
      }
      raf = requestAnimationFrame(draw);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [width, height]);
  return <canvas ref={ref} style={{ width, height, display: 'block' }} aria-hidden="true" />;
}
