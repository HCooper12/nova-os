import { useEffect, useRef } from 'react';

// The Nova Core — the being at the center of Mission Control, the Voice
// reactor, and the tiny sibling in the sidebar. Two engines share the seed
// and the breathing heart, and the user picks between them in Settings:
//
//   filament — the original: concentric broken circuit-arcs, wisps and
//              embers around the heart. Flat, dense, nebular.
//   hologram — true-3D gyroscope: tilted rings (solid/dash/tick/double)
//              with comet trackers, a graticule globe carrying a fibonacci
//              particle shell, great-circle filament arcs, an inner ember
//              cloud so the body is a volume (never a hollow shell), and
//              depth fog + perspective so front reads bright, back dim.
//
// Deliberately blue in every theme — the intelligence keeps its own color.
// The rAF loop pauses when the tab is hidden and never runs under
// prefers-reduced-motion (one still frame at a flattering angle).

const FILAMENT_PRESETS = {
  full: { seed: 7, bands: 32, segs: 36, arc: 1.15, weight: 1, chaos: 1, speed: 0.16, embers: 540, wisps: 84, heart: 0.12 },
  mini: { seed: 7, bands: 6, segs: 10, arc: 1.2, weight: 1.2, chaos: 0.8, speed: 0.12, embers: 30, wisps: 0, heart: 0.22 },
};

// hologram detail scales with canvas size (phones get the lighter build)
const HOLO_FULL = { seed: 7, rings: 9, arcs: 220, parts: 420, embers: 260, tumble: 0.06 };
const HOLO_SMALL = { seed: 7, rings: 7, arcs: 150, parts: 300, embers: 200, tumble: 0.06 };

function seededRng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ---------------------------- filament engine ---------------------------- */

function buildFilamentScene(opts, R) {
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

function filCol(f, a) {
  const hue = 224 - f * 36;
  const sat = 90 - f * 10;
  const lit = 38 + (1 - f) * 44;
  return `hsla(${hue},${sat}%,${lit}%,${a})`;
}

function drawHeart(ctx, cx, cy, t, hr) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr * 3.2);
  g.addColorStop(0, 'rgba(240,252,255,.95)');
  g.addColorStop(0.18, 'rgba(158,240,255,.8)');
  g.addColorStop(0.45, 'rgba(64,170,238,.35)');
  g.addColorStop(1, 'rgba(20,60,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, hr * 3.2, 0, 6.29);
  ctx.fill();
}

function makeFilamentDraw(ctx, size, opts) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const { bands, embers, wisps } = buildFilamentScene(opts, R);
  return function draw(t) {
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
      ctx.strokeStyle = filCol(0.5, w.al);
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
        ctx.strokeStyle = filCol(b.f, s.al * fl);
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
      ctx.fillStyle = filCol(e.f, e.al * tw);
      ctx.beginPath();
      ctx.arc(x, y, e.sz, 0, 6.29);
      ctx.fill();
    }
    const pulse = 1 + 0.07 * Math.sin(t * 1.8);
    drawHeart(ctx, cx, cy, t, R * opts.heart * pulse);
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ---------------------------- hologram engine ---------------------------- */

const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
const CAM_D = 6; // camera distance in R units — mild perspective
const depthMult = (dp) => 0.3 + 0.7 * Math.pow(dp, 1.35); // fog: back dim, front bright
const holoCol = (dp, a) => `hsla(${222 - 28 * dp},${90 - 6 * dp}%,${44 + 38 * dp}%,${a})`;

function buildHoloScene(opts) {
  const r = seededRng(opts.seed);
  const RSTYLES = ['tick', 'dash', 'solid', 'double', 'dash', 'tick'];
  const rings = [];
  for (let i = 0; i < opts.rings; i++) {
    rings.push({
      f: 0.55 + 0.35 * (i / Math.max(1, opts.rings - 1)) + (r() - 0.5) * 0.05,
      tx: (r() - 0.5) * 2.6, ty: r() * 6.28,
      w: 0.7 + r() * 0.8, al: 0.45 + r() * 0.3,
      spin: (r() < 0.5 ? -1 : 1) * (0.10 + r() * 0.28),
      style: RSTYLES[i % RSTYLES.length],
      tickEvery: 6 + Math.floor(r() * 6),
      comet: i % 3 === 1,
      cometSp: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5),
      cometPh: r() * 6.28,
    });
  }
  const inner = [];
  for (let i = 0; i < 3; i++) {
    inner.push({ f: 0.13 + i * 0.045, tx: (r() - 0.5) * 3, ty: r() * 6.28, spin: (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.8), prec: 0.3 + r() * 0.4, ph: r() * 6.28 });
  }
  const arcs = [];
  for (let i = 0; i < opts.arcs; i++) {
    arcs.push({
      f: 0.48 + r() * 0.44, tx: (r() - 0.5) * 3.1, ty: r() * 6.28,
      a0: r() * 6.28, len: 0.15 + r() * r() * 1.1, drift: (r() - 0.5) * 0.35,
      al: 0.16 + r() * 0.3, w: 0.5 + r() * 0.9, fl: r() * 6.28, fs: 0.5 + r() * 1.8,
    });
  }
  // inner ember cloud — a dense 3D swarm so the being has a body, not a
  // hollow shell (the filament lesson, lifted into the volume)
  const embers = [];
  for (let i = 0; i < opts.embers; i++) {
    const u = r() * 6.2832, v = Math.acos(2 * r() - 1);
    const rad = 0.06 + 0.34 * Math.pow(r(), 1.4);
    embers.push({
      p: [Math.sin(v) * Math.cos(u) * rad, Math.cos(v) * rad, Math.sin(v) * Math.sin(u) * rad],
      sp: (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.22),
      sz: 0.5 + r() * 1.1, al: 0.22 + r() * 0.4, tw: r() * 6.28, ts: 0.6 + r() * 2.4,
    });
  }
  // fibonacci particle shell riding the graticule globe
  const parts = [];
  for (let i = 0; i < opts.parts; i++) {
    const y = 1 - 2 * (i + 0.5) / opts.parts, rad = Math.sqrt(1 - y * y), ph = i * 2.399963;
    parts.push({ p: [rad * Math.cos(ph), y, rad * Math.sin(ph)], hot: i % 9 === 0, tw: r() * 6.28, ts: 0.6 + r() * 2.2 });
  }
  return { rings, inner, arcs, embers, parts };
}

function makeHoloDraw(ctx, size, opts) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const { rings, inner, arcs, embers, parts } = buildHoloScene(opts);

  const seg = (p1, p2, alpha, w) => {
    const dp = (p1.dp + p2.dp) / 2;
    ctx.strokeStyle = holoCol(dp, alpha * depthMult(dp));
    ctx.lineWidth = w * (p1.s + p2.s) / 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };
  const project = (p) => {
    const s = (CAM_D * R) / (CAM_D * R - p[2]);
    return { x: cx + p[0] * s, y: cy + p[1] * s, dp: (p[2] / R + 1) / 2, s };
  };

  return function draw(t) {
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const axT = 0.5 + 0.22 * Math.sin(t * 0.09);
    const ayT = t * opts.tumble; // slow assembly tumble
    const P = (fr, a, tx, ty) => {
      let p = [Math.cos(a) * fr, Math.sin(a) * fr, 0];
      p = rotX(p, tx); p = rotY(p, ty); p = rotX(p, axT); p = rotY(p, ayT);
      return project(p);
    };

    // graticule globe (spins about its own axis inside the tumbling assembly)
    const Rg = R * 0.42, gs = t * 0.12;
    for (const lat of [-1.05, -0.55, 0, 0.55, 1.05]) {
      const rc = Rg * Math.cos(lat), z0 = Rg * Math.sin(lat);
      let prev = null;
      for (let k = 0; k <= 48; k++) {
        const a = k / 48 * 6.2832;
        let p = [rc * Math.cos(a + gs), z0, rc * Math.sin(a + gs)];
        p = rotX(p, axT); p = rotY(p, ayT);
        const q = project(p);
        if (prev) seg(prev, q, 0.17, 0.55);
        prev = q;
      }
    }
    for (let l = 0; l < 6; l++) {
      const ph = l * Math.PI / 6 + gs;
      let prev = null;
      for (let k = 0; k <= 48; k++) {
        const a = k / 48 * 6.2832;
        let p = [Rg * Math.sin(a) * Math.cos(ph), Rg * Math.cos(a), Rg * Math.sin(a) * Math.sin(ph)];
        p = rotX(p, axT); p = rotY(p, ayT);
        const q = project(p);
        if (prev) seg(prev, q, 0.12, 0.55);
        prev = q;
      }
    }

    // volumetric halo — faint gas glow filling the sphere
    const gh = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.56);
    gh.addColorStop(0, 'rgba(64,170,238,.12)');
    gh.addColorStop(0.6, 'rgba(64,170,238,.05)');
    gh.addColorStop(1, 'rgba(20,60,140,0)');
    ctx.fillStyle = gh;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.56, 0, 6.29);
    ctx.fill();

    // ember cloud (each mote on its own slow orbit inside the body)
    for (const e of embers) {
      let p = rotY([e.p[0] * R, e.p[1] * R, e.p[2] * R], t * e.sp * 4);
      p = rotX(p, axT); p = rotY(p, ayT);
      const q = project(p);
      const tw = 0.5 + 0.5 * Math.abs(Math.sin(t * e.ts + e.tw));
      ctx.fillStyle = holoCol(q.dp, e.al * tw * depthMult(q.dp));
      ctx.beginPath();
      ctx.arc(q.x, q.y, e.sz * q.s, 0, 6.29);
      ctx.fill();
    }

    // particle shell
    const Rp = R * 0.46;
    for (const pt of parts) {
      let p = rotY([pt.p[0] * Rp, pt.p[1] * Rp, pt.p[2] * Rp], gs);
      p = rotX(p, axT); p = rotY(p, ayT);
      const q = project(p);
      const tw = 0.55 + 0.45 * Math.sin(t * pt.ts + pt.tw);
      ctx.fillStyle = holoCol(q.dp, (pt.hot ? 0.95 : 0.5) * tw * depthMult(q.dp));
      ctx.beginPath();
      ctx.arc(q.x, q.y, (pt.hot ? 1.6 : 0.95) * q.s, 0, 6.29);
      ctx.fill();
    }

    // 3D filament arcs
    for (const a of arcs) {
      const fr = a.f * R, base = a.a0 + t * a.drift;
      const fl = 0.55 + 0.45 * Math.sin(t * a.fs + a.fl);
      let prev = null;
      for (let k = 0; k <= 9; k++) {
        const q = P(fr, base + a.len * k / 9, a.tx, a.ty);
        if (prev) seg(prev, q, a.al * fl * 0.85, a.w);
        prev = q;
      }
    }

    // gyro rings
    for (const g of rings) {
      const fr = g.f * R, off = g.spin * t;
      if (g.style === 'solid' || g.style === 'tick' || g.style === 'double') {
        const alp = g.style === 'tick' ? g.al * 0.55 : g.al;
        for (let k = 0; k < 96; k++) {
          const a1 = k / 96 * 6.2832 + off, a2 = (k + 1) / 96 * 6.2832 + off;
          if (g.style === 'double') {
            seg(P(fr - R * 0.012, a1, g.tx, g.ty), P(fr - R * 0.012, a2, g.tx, g.ty), alp * 0.7, g.w * 0.8);
            seg(P(fr + R * 0.012, a1, g.tx, g.ty), P(fr + R * 0.012, a2, g.tx, g.ty), alp * 0.7, g.w * 0.8);
          } else {
            seg(P(fr, a1, g.tx, g.ty), P(fr, a2, g.tx, g.ty), alp, g.w);
          }
        }
      }
      if (g.style === 'dash') {
        for (let k = 0; k < 96; k++) {
          if (k % 6 >= 3) continue;
          const a1 = k / 96 * 6.2832 + off, a2 = (k + 1) / 96 * 6.2832 + off;
          seg(P(fr, a1, g.tx, g.ty), P(fr, a2, g.tx, g.ty), g.al * 1.15, g.w * 1.25);
        }
      }
      if (g.style === 'tick') {
        const n = Math.round(96 / g.tickEvery) * g.tickEvery;
        for (let k = 0; k < n; k += g.tickEvery) {
          const a = k / 96 * 6.2832 + off;
          const long = (k / g.tickEvery) % 4 === 0;
          const tl = R * (long ? 0.034 : 0.018);
          seg(P(fr - tl, a, g.tx, g.ty), P(fr + tl, a, g.tx, g.ty), g.al * (long ? 1.3 : 0.9), g.w * (long ? 1.1 : 0.8));
        }
      }
      if (g.comet) {
        const ah = g.cometPh + g.cometSp * t;
        const K = 30;
        for (let k = 0; k < K; k++) {
          const a1 = ah - k * 0.05 * Math.sign(g.cometSp);
          const a2 = ah - (k + 1) * 0.05 * Math.sign(g.cometSp);
          const fade = Math.pow(1 - k / K, 1.6);
          seg(P(fr, a1, g.tx, g.ty), P(fr, a2, g.tx, g.ty), 0.85 * fade, 2.2 * fade + 0.5);
        }
        const h = P(fr, ah, g.tx, g.ty);
        ctx.fillStyle = holoCol(h.dp, 0.95 * depthMult(h.dp));
        ctx.beginPath();
        ctx.arc(h.x, h.y, 2.4 * h.s, 0, 6.29);
        ctx.fill();
      }
    }

    // inner gyro reactor — fast precessing rings around the heart
    for (const n of inner) {
      const fr = n.f * R, off = n.spin * t;
      const tx = n.tx + 0.6 * Math.sin(t * n.prec + n.ph), ty = n.ty + t * 0.25;
      for (let k = 0; k < 48; k++) {
        const a1 = k / 48 * 6.2832 + off, a2 = (k + 1) / 48 * 6.2832 + off;
        seg(P(fr, a1, tx, ty), P(fr, a2, tx, ty), 0.62, 1.05);
      }
    }

    // billboard HUD rings — flat, tying the hologram to the interface plane
    for (let k = 0; k < 40; k++) {
      const a0 = k / 40 * 6.2832 + t * 0.12, len = 6.2832 / 40 * 0.5;
      ctx.strokeStyle = 'rgba(89,230,255,.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.985, a0, a0 + len);
      ctx.stroke();
    }
    for (let k = 0; k < 64; k++) {
      const a0 = -t * 0.08 + k / 64 * 6.2832, len = 6.2832 / 64 * 0.32;
      ctx.strokeStyle = 'rgba(143,123,255,.22)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.93, a0, a0 + len);
      ctx.stroke();
    }

    // breathing heart (shared identity across both engines)
    const pulse = 1 + 0.06 * Math.sin(t * 1.8);
    drawHeart(ctx, cx, cy, t, R * 0.125 * pulse);
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ------------------------------- component ------------------------------- */

export function NovaCore({ size = 312, variant = 'full', engine = 'filament', style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const draw = engine === 'hologram'
      ? makeHoloDraw(ctx, size, size < 260 ? HOLO_SMALL : HOLO_FULL)
      : makeFilamentDraw(ctx, size, FILAMENT_PRESETS[variant] || FILAMENT_PRESETS.full);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      draw(engine === 'hologram' ? 3.2 : 1.7);
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
  }, [size, variant, engine]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', ...style }} />;
}
