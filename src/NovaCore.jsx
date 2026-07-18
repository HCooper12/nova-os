import { useEffect, useRef } from 'react';

// The Nova Core — the being at the center of Mission Control and the tiny
// sibling in the sidebar. Grown generatively from a fixed seed (the same
// being on every load): concentric broken circuit-arcs, filament wisps and
// ember particles orbiting a breathing heart. Deliberately blue in every
// theme — the intelligence keeps its own color.
//
// Rendering notes: bands reach in to 0.10R with an inner-brightness boost,
// embers bias toward the heart and wisps are pulled through the middle so
// the core reads as a dense volume, not a hollow ring (the "black donut"
// bug from the first integration). The rAF loop pauses when the tab is
// hidden and never runs under prefers-reduced-motion (one still frame).

const PRESETS = {
  full: { seed: 7, bands: 32, segs: 36, arc: 1.15, weight: 1, chaos: 1, speed: 0.16, embers: 540, wisps: 84, heart: 0.12 },
  mini: { seed: 7, bands: 6, segs: 10, arc: 1.2, weight: 1.2, chaos: 0.8, speed: 0.12, embers: 30, wisps: 0, heart: 0.22 },
};

function seededRng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function buildScene(opts, R) {
  const r = seededRng(opts.seed);
  const bands = [];
  for (let b = 0; b < opts.bands; b++) {
    const f = 0.10 + 0.90 * (b / (opts.bands - 1));
    const segs = [];
    const n = Math.round(opts.segs * (0.5 + r()));
    for (let i = 0; i < n; i++) {
      segs.push({
        a0: r() * 6.283,
        len: 0.02 + r() * r() * opts.arc,
        w: 0.5 + r() * 1.6 * opts.weight,
        jit: (r() - 0.5) * R * 0.05 * opts.chaos,
        al: (0.16 + r() * 0.5) * (1.35 - 0.55 * f),
        fl: r() * 6.28,
        fs: 0.5 + r() * 2,
      });
    }
    bands.push({ f, segs, vel: (r() - 0.5) * opts.speed, squash: 1 - r() * 0.14 * opts.chaos, tilt: (r() - 0.5) * 0.5 * opts.chaos });
  }
  const embers = [];
  for (let i = 0; i < opts.embers; i++) {
    embers.push({ f: Math.pow(r(), 1.25), ang: r() * 6.283, sz: 0.35 + r() * 1.3, al: 0.15 + r() * 0.55, tw: r() * 6.28, ts: 0.6 + r() * 2.4 });
  }
  const wisps = [];
  for (let i = 0; i < opts.wisps; i++) {
    const a = r() * 6.283;
    wisps.push({ a, b: a + (r() - 0.5) * 2.4, f1: 0.25 + r() * 0.7, f2: 0.25 + r() * 0.7, bulge: (r() - 0.5) * 1.6, al: 0.05 + r() * 0.12 });
  }
  return { bands, embers, wisps };
}

function col(f, a) {
  const hue = 224 - f * 36;
  const sat = 90 - f * 10;
  const lit = 38 + (1 - f) * 44;
  return `hsla(${hue},${sat}%,${lit}%,${a})`;
}

export function NovaCore({ size = 312, variant = 'full', style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const opts = PRESETS[variant] || PRESETS.full;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.46;
    const { bands, embers, wisps } = buildScene(opts, R);

    function draw(t) {
      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'lighter';
      for (const w of wisps) {
        const rot = t * 0.03;
        const x1 = cx + Math.cos(w.a + rot) * R * w.f1;
        const y1 = cy + Math.sin(w.a + rot) * R * w.f1 * 0.94;
        const x2 = cx + Math.cos(w.b + rot) * R * w.f2;
        const y2 = cy + Math.sin(w.b + rot) * R * w.f2 * 0.94;
        let mx = (x1 + x2) / 2 + (y2 - y1) * w.bulge * 0.3;
        let my = (y1 + y2) / 2 - (x2 - x1) * w.bulge * 0.3;
        mx = mx * 0.62 + cx * 0.38;
        my = my * 0.62 + cy * 0.38;
        ctx.strokeStyle = col(0.5, w.al);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
      }
      for (const b of bands) {
        const rad = R * b.f;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(b.tilt);
        ctx.scale(1, b.squash);
        const rot = t * b.vel;
        for (const s of b.segs) {
          const fl = 0.55 + 0.45 * Math.sin(t * s.fs + s.fl);
          ctx.strokeStyle = col(b.f, s.al * fl);
          ctx.lineWidth = s.w;
          ctx.beginPath();
          ctx.arc(0, 0, rad + s.jit, s.a0 + rot, s.a0 + rot + s.len);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const e of embers) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * e.ts + e.tw));
        const x = cx + Math.cos(e.ang + t * 0.05) * R * e.f;
        const y = cy + Math.sin(e.ang + t * 0.05) * R * e.f * 0.94;
        ctx.fillStyle = col(e.f, e.al * tw);
        ctx.beginPath();
        ctx.arc(x, y, e.sz, 0, 6.29);
        ctx.fill();
      }
      const pulse = 1 + 0.07 * Math.sin(t * 1.8);
      const hr = R * opts.heart * pulse;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr * 3.2);
      g.addColorStop(0, 'rgba(240,252,255,.95)');
      g.addColorStop(0.18, 'rgba(158,240,255,.8)');
      g.addColorStop(0.45, 'rgba(64,170,238,.35)');
      g.addColorStop(1, 'rgba(20,60,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, hr * 3.2, 0, 6.29);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      draw(1.7);
      return undefined;
    }
    let raf = 0;
    const loop = () => {
      draw(performance.now() / 1000);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size, variant]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', ...style }} />;
}
