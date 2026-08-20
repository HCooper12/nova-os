import { useEffect, useRef } from 'react';
import { audioLevel } from './audioLevel.js';

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
//
// BOTH engines are live-speech dynamic (his 20-Aug brief, second pass: the
// icon he already chose is the one that animates — not a different design):
// real audio amplitude accelerates the whole scene, flares the light, and
// surges the geometry; smoothed speaking/listening state tints the palette
// gold/violet so the mode reads at any size. Idle is untouched. The spiked
// 'reactor' engine remains selectable but is no longer wired anywhere.

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

function makeFilamentDraw(ctx, size, opts, getState) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const { bands, embers, wisps } = buildFilamentScene(opts, R);
  // Live-speech dynamics (his 20-Aug brief, second pass: innovate THIS icon,
  // not a different one). Three ingredients:
  //   clock — an integrated timebase that ACCELERATES with the real audio
  //           level, so the whole being visibly quickens with each syllable
  //           and never snaps when the speed changes;
  //   mixS/mixL — smoothed speaking/listening state, pulling the palette
  //           toward gold / violet so the state reads across a room;
  //   lvl — raw amplitude, flaring alpha, weight and the band radii.
  // Idle (all three at 0) is EXACTLY the core he already knows.
  let mixS = 0, mixL = 0, clock = 0, last = null, lvl = 0;
  const col = (f, a) => {
    let hue = 224 - f * 36;
    hue += (406 - hue) * mixS * 0.82; // → gold, travelling through violet/rose, never green
    hue += (272 - hue) * mixL * 0.82; // → violet
    const lit = Math.min(38 + (1 - f) * 44 + lvl * 12, 88);
    return `hsla(${hue % 360},${90 - f * 10}%,${lit}%,${a})`;
  };
  return function draw(t) {
    const st = getState ? getState() : {};
    lvl = audioLevel();
    const dt = last == null ? 0 : Math.min(t - last, 0.1);
    last = t;
    mixS += ((st.speaking ? 1 : 0) - mixS) * 0.07;
    mixL += ((st.listening ? 1 : 0) - mixL) * 0.07;
    clock += dt * (1 + lvl * 2.6 + (mixS + mixL) * 0.4);
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    for (const w of wisps) {
      const rot = clock * 0.03;
      const x1 = cx + Math.cos(w.a + rot) * R * w.f1;
      const y1 = cy + Math.sin(w.a + rot) * R * w.f1 * 0.94;
      const x2 = cx + Math.cos(w.b + rot) * R * w.f2;
      const y2 = cy + Math.sin(w.b + rot) * R * w.f2 * 0.94;
      let mx = (x1 + x2) / 2 + (y2 - y1) * w.bulge * 0.3;
      let my = (y1 + y2) / 2 - (x2 - x1) * w.bulge * 0.3;
      mx = mx * 0.62 + cx * 0.38;
      my = my * 0.62 + cy * 0.38;
      ctx.strokeStyle = col(0.5, w.al * (1 + lvl * 1.2));
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
    }
    for (const b of bands) {
      // the filament rings SURGE outward with the voice, each band on its
      // own phase so the whole body ripples rather than pumping as one
      const rad = R * b.f * (1 + lvl * 0.16 * Math.sin(clock * 3.1 + b.f * 9));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(b.tilt);
      ctx.scale(1, b.squash);
      const rot = clock * b.vel;
      for (const s of b.segs) {
        const fl = 0.55 + 0.45 * Math.sin(clock * s.fs + s.fl);
        ctx.strokeStyle = col(b.f, s.al * fl * (1 + lvl * 1.4));
        ctx.lineWidth = s.w * (1 + lvl * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, rad + s.jit, s.a0 + rot, s.a0 + rot + s.len);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const e of embers) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(clock * e.ts + e.tw));
      const x = cx + Math.cos(e.ang + clock * 0.05) * R * e.f;
      const y = cy + Math.sin(e.ang + clock * 0.05) * R * e.f * 0.94;
      ctx.fillStyle = col(e.f, e.al * tw * (1 + lvl * 1.4));
      ctx.beginPath();
      ctx.arc(x, y, e.sz * (1 + lvl * 1.1), 0, 6.29);
      ctx.fill();
    }
    // a state-tinted bloom around the heart — gold while Nova speaks, violet
    // while the mic is open — so the icon's mode is legible even at 44px
    const bloomA = (mixS + mixL) * (0.22 + lvl * 0.5);
    if (bloomA > 0.02) {
      const br = R * (0.34 + lvl * 0.30);
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, br);
      g2.addColorStop(0, col(0.1, Math.min(bloomA, 0.8)));
      g2.addColorStop(1, col(0.9, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, br, 0, 6.29);
      ctx.fill();
    }
    // the heart breathes on its own and SWELLS with real audio — Nova's own
    // voice while speaking, his while dictating (audioLevel is 0 otherwise,
    // so idle behavior is exactly what it always was)
    const pulse = 1 + 0.07 * Math.sin(t * 1.8) + lvl * 1.15; // his note: it must READ as alive while speaking
    drawHeart(ctx, cx, cy, t, R * opts.heart * pulse);
    ctx.globalCompositeOperation = 'source-over';
  };
}


/* ---------------------------- reactor engine ----------------------------
   His reference (Instagram, 20 Aug): a dense sphere of radial spikes off a
   hot core — it BRISTLES with the voice and shifts colour by state. The
   filament engine is beautiful but too even-tempered to read as "talking";
   this one is built to be watched while Nova speaks.

   Every spike is a 3-D unit vector on a Fibonacci sphere, projected flat.
   Length = base + audio amplitude (with per-spike phase so it shimmers
   rather than pumping as one block). Colour lerps idle-cyan → speaking-gold
   → listening-violet, so the state is readable across a room. Audio comes
   from the same analyser everything else uses, so silence looks like
   silence.                                                                */

const SPIKES = 620;
const PALETTE = {
  idle: [[0.35, 0.90, 1.0], [0.55, 0.78, 1.0]],      // cyan
  speaking: [[1.0, 0.78, 0.36], [1.0, 0.55, 0.30]],  // gold/amber — the reference's hot core
  listening: [[0.66, 0.55, 1.0], [0.85, 0.60, 1.0]], // violet
};
const lerp = (a, b, k) => a + (b - a) * k;

function makeReactorDraw(ctx, size, getState) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.30;
  // Fibonacci sphere — even coverage, no polar clumping
  const pts = Array.from({ length: SPIKES }, (_, i) => {
    const y = 1 - (i / (SPIKES - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    return { v: [Math.cos(th) * r, y, Math.sin(th) * r], ph: (i % 97) / 97 * 6.283, sp: 0.6 + (i % 13) / 13 };
  });
  let mix = [0, 0]; // smoothed [speaking, listening] so colour glides, never snaps

  return (t) => {
    const st = getState();
    const lvl = audioLevel();
    mix = [lerp(mix[0], st.speaking ? 1 : 0, 0.08), lerp(mix[1], st.listening ? 1 : 0, 0.08)];
    const [ca, cb] = (() => {
      const base = PALETTE.idle;
      const out = [[...base[0]], [...base[1]]];
      for (let k = 0; k < 2; k++) {
        for (let c = 0; c < 3; c++) {
          out[k][c] = lerp(out[k][c], PALETTE.speaking[k][c], mix[0]);
          out[k][c] = lerp(out[k][c], PALETTE.listening[k][c], mix[1]);
        }
      }
      return out;
    })();
    const rgb = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';

    const ry = t * 0.28, rx = Math.sin(t * 0.17) * 0.35;
    const cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rx), sinX = Math.sin(rx);
    // amplitude drives spike extension; a little always-on shimmer keeps it
    // alive between syllables without pretending there's sound
    const amp = lvl * 1.9;

    for (const p of pts) {
      const [x0, y0, z0] = p.v;
      const x1 = cosY * x0 + sinY * z0;
      const z1 = -sinY * x0 + cosY * z0;
      const y1 = cosX * y0 - sinX * z1;
      const z2 = sinX * y0 + cosX * z1;
      const depth = (z2 + 1) / 2;                    // 0 back → 1 front
      const shimmer = 0.5 + 0.5 * Math.sin(t * (1.6 * p.sp) + p.ph);
      const len = R * (0.14 + 0.10 * shimmer + amp * (0.30 + 0.35 * shimmer));
      const r0 = R * 0.62;
      const sx = cx + x1 * r0, sy = cy + y1 * r0;
      const ex = cx + x1 * (r0 + len), ey = cy + y1 * (r0 + len);
      const a = (0.10 + 0.55 * depth) * (0.55 + 0.45 * shimmer);
      ctx.strokeStyle = rgb(depth > 0.5 ? ca : cb, a);
      ctx.lineWidth = depth > 0.72 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // the hot heart — swells hard with the voice (this is the bit the eye reads)
    const hr = R * (0.42 + lvl * 0.5 + 0.03 * Math.sin(t * 2.2));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr);
    g.addColorStop(0, rgb([1, 1, 1], 0.95));
    g.addColorStop(0.35, rgb(ca, 0.75));
    g.addColorStop(1, rgb(cb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, hr, 0, 6.283);
    ctx.fill();

    // two orbital rings, tilted — the reference's containment field
    for (let i = 0; i < 2; i++) {
      const rr = R * (1.06 + i * 0.16);
      ctx.strokeStyle = rgb(cb, 0.10 + 0.18 * (1 - i * 0.5) + lvl * 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * (0.30 + 0.22 * i + 0.08 * Math.sin(t * 0.5 + i)), t * (0.12 + i * 0.07), 0, 6.283);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ---------------------------- hologram engine ---------------------------- */

const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
const CAM_D = 6; // camera distance in R units — mild perspective
const depthMult = (dp) => 0.3 + 0.7 * Math.pow(dp, 1.35); // fog: back dim, front bright

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

function makeHoloDraw(ctx, size, opts, getState) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const { rings, inner, arcs, embers, parts } = buildHoloScene(opts);

  // same live-speech dynamics as the filament engine (see that comment):
  // an audio-accelerated clock, smoothed gold/violet state mixes, amplitude
  // flares. Idle is exactly the hologram he already knows.
  let mixS = 0, mixL = 0, clock = 0, last = null, lvl = 0;
  const col = (dp, a) => {
    let hue = 222 - 28 * dp;
    hue += (406 - hue) * mixS * 0.82;
    hue += (272 - hue) * mixL * 0.82;
    const lit = Math.min(44 + 38 * dp + lvl * 10, 90);
    return `hsla(${hue % 360},${90 - 6 * dp}%,${lit}%,${a})`;
  };

  const seg = (p1, p2, alpha, w) => {
    const dp = (p1.dp + p2.dp) / 2;
    ctx.strokeStyle = col(dp, alpha * depthMult(dp) * (1 + lvl * 0.9));
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
    const st = getState ? getState() : {};
    lvl = audioLevel();
    const dt = last == null ? 0 : Math.min(t - last, 0.1);
    last = t;
    mixS += ((st.speaking ? 1 : 0) - mixS) * 0.07;
    mixL += ((st.listening ? 1 : 0) - mixL) * 0.07;
    clock += dt * (1 + lvl * 2.6 + (mixS + mixL) * 0.4);
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const axT = 0.5 + 0.22 * Math.sin(t * 0.09);
    const ayT = clock * opts.tumble; // slow assembly tumble — quickens with the voice
    const P = (fr, a, tx, ty) => {
      let p = [Math.cos(a) * fr, Math.sin(a) * fr, 0];
      p = rotX(p, tx); p = rotY(p, ty); p = rotX(p, axT); p = rotY(p, ayT);
      return project(p);
    };

    // graticule globe (spins about its own axis inside the tumbling assembly)
    const Rg = R * 0.42, gs = clock * 0.12;
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
    gh.addColorStop(0, col(0.5, 0.12 + lvl * 0.2));
    gh.addColorStop(0.6, col(0.5, 0.05 + lvl * 0.08));
    gh.addColorStop(1, 'rgba(20,60,140,0)');
    ctx.fillStyle = gh;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.56, 0, 6.29);
    ctx.fill();

    // ember cloud (each mote on its own slow orbit inside the body)
    for (const e of embers) {
      let p = rotY([e.p[0] * R, e.p[1] * R, e.p[2] * R], clock * e.sp * 4);
      p = rotX(p, axT); p = rotY(p, ayT);
      const q = project(p);
      const tw = 0.5 + 0.5 * Math.abs(Math.sin(clock * e.ts + e.tw));
      ctx.fillStyle = col(q.dp, e.al * tw * depthMult(q.dp) * (1 + lvl * 1.2));
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
      const tw = 0.55 + 0.45 * Math.sin(clock * pt.ts + pt.tw);
      ctx.fillStyle = col(q.dp, (pt.hot ? 0.95 : 0.5) * tw * depthMult(q.dp) * (1 + lvl * 0.9));
      ctx.beginPath();
      ctx.arc(q.x, q.y, (pt.hot ? 1.6 : 0.95) * q.s, 0, 6.29);
      ctx.fill();
    }

    // 3D filament arcs
    for (const a of arcs) {
      const fr = a.f * R, base = a.a0 + clock * a.drift;
      const fl = 0.55 + 0.45 * Math.sin(clock * a.fs + a.fl);
      let prev = null;
      for (let k = 0; k <= 9; k++) {
        const q = P(fr, base + a.len * k / 9, a.tx, a.ty);
        if (prev) seg(prev, q, a.al * fl * 0.85, a.w);
        prev = q;
      }
    }

    // gyro rings
    for (const g of rings) {
      const fr = g.f * R, off = g.spin * clock;
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
        const ah = g.cometPh + g.cometSp * clock;
        const K = 30;
        for (let k = 0; k < K; k++) {
          const a1 = ah - k * 0.05 * Math.sign(g.cometSp);
          const a2 = ah - (k + 1) * 0.05 * Math.sign(g.cometSp);
          const fade = Math.pow(1 - k / K, 1.6);
          seg(P(fr, a1, g.tx, g.ty), P(fr, a2, g.tx, g.ty), 0.85 * fade, 2.2 * fade + 0.5);
        }
        const h = P(fr, ah, g.tx, g.ty);
        ctx.fillStyle = col(h.dp, 0.95 * depthMult(h.dp));
        ctx.beginPath();
        ctx.arc(h.x, h.y, 2.4 * h.s, 0, 6.29);
        ctx.fill();
      }
    }

    // inner gyro reactor — fast precessing rings around the heart
    for (const n of inner) {
      const fr = n.f * R, off = n.spin * clock;
      const tx = n.tx + 0.6 * Math.sin(t * n.prec + n.ph), ty = n.ty + clock * 0.25;
      for (let k = 0; k < 48; k++) {
        const a1 = k / 48 * 6.2832 + off, a2 = (k + 1) / 48 * 6.2832 + off;
        seg(P(fr, a1, tx, ty), P(fr, a2, tx, ty), 0.62, 1.05);
      }
    }

    // billboard HUD rings — flat, tying the hologram to the interface plane
    for (let k = 0; k < 40; k++) {
      const a0 = k / 40 * 6.2832 + clock * 0.12, len = 6.2832 / 40 * 0.5;
      ctx.strokeStyle = 'rgba(89,230,255,.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.985, a0, a0 + len);
      ctx.stroke();
    }
    for (let k = 0; k < 64; k++) {
      const a0 = -clock * 0.08 + k / 64 * 6.2832, len = 6.2832 / 64 * 0.32;
      ctx.strokeStyle = 'rgba(143,123,255,.22)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.93, a0, a0 + len);
      ctx.stroke();
    }

    // breathing heart (shared identity across both engines) — swells with
    // real audio exactly like the filament heart
    const bloomA = (mixS + mixL) * (0.22 + lvl * 0.5);
    if (bloomA > 0.02) {
      const br = R * (0.30 + lvl * 0.26);
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, br);
      g2.addColorStop(0, col(0.9, Math.min(bloomA, 0.8)));
      g2.addColorStop(1, col(0.1, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, br, 0, 6.29);
      ctx.fill();
    }
    const pulse = 1 + 0.06 * Math.sin(t * 1.8) + lvl * 1.15; // ditto — the mini orb carries the same life
    drawHeart(ctx, cx, cy, t, R * 0.125 * pulse);
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ------------------------------- component ------------------------------- */

export function NovaCore({ size = 312, variant = 'full', engine = 'filament', style, speaking = false, listening = false }) {
  const ref = useRef(null);
  // live state read through a ref so the rAF loop sees changes WITHOUT the
  // canvas being torn down and rebuilt on every speech toggle
  const stateRef = useRef({ speaking, listening });
  stateRef.current = { speaking, listening };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const getState = () => stateRef.current;
    const draw = engine === 'reactor'
      ? makeReactorDraw(ctx, size, getState)
      : engine === 'hologram'
        ? makeHoloDraw(ctx, size, size < 260 ? HOLO_SMALL : HOLO_FULL, getState)
        : makeFilamentDraw(ctx, size, FILAMENT_PRESETS[variant] || FILAMENT_PRESETS.full, getState);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      draw(engine === 'hologram' ? 3.2 : 1.7); // reduced-motion: one still frame
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
