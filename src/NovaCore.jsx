import { useEffect, useRef } from 'react';
import { audioLevel } from './audioLevel.js';
import { makeGrains, turnOf, REST, LISTEN, THINK, SPEAK } from './coreGrains.js';

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
// The rAF loop pauses when the tab is hidden or the canvas is off screen,
// and never runs under prefers-reduced-motion (one still frame at a
// flattering angle). How the engines draw cheaply: see "the batcher".
//
// BOTH engines are live-speech dynamic (his 20-Aug brief, second pass: the
// icon he already chose is the one that animates — not a different design):
// real audio amplitude accelerates the whole scene, flares the light, and
// surges the geometry; smoothed turn state tints the palette (see below) so
// the mode reads at any size. Idle is untouched. The spiked
// 'reactor' engine remains selectable but is no longer wired anywhere.
//
// A TURN IS A BODY OF GRAINS (5 Oct 2026, mockup 69, his pick "B, the heart
// stays"): while Nova listens, thinks or speaks, the engine's rings fade out
// and the grain body in coreGrains.js takes their place, the heart drawn on
// top in the state's colour. The rings' own tint, seen only as a turn starts
// and ends, follows the same palette: violet listening, cyan thinking, jade
// speaking, red pushing back (it was gold, then coral, while speaking).
// At rest none of it runs, and the core is exactly the one he chose.

const FILAMENT_PRESETS = {
  full: { seed: 7, bands: 32, segs: 36, arc: 1.15, weight: 1, chaos: 1, speed: 0.16, embers: 540, wisps: 84, heart: 0.12 },
  mini: { seed: 7, bands: 6, segs: 10, arc: 1.2, weight: 1.2, chaos: 0.8, speed: 0.12, embers: 30, wisps: 0, heart: 0.22 },
};

// hologram detail scales with canvas size (phones get the lighter build)
const HOLO_FULL = { seed: 7, rings: 9, arcs: 220, parts: 420, embers: 260, tumble: 0.06 };
const HOLO_SMALL = { seed: 7, rings: 7, arcs: 150, parts: 300, embers: 200, tumble: 0.06 };
const FIL_STEPS = 8; // the filament's colour steps, outer band to inner (see the batcher)

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

// The rings' pull toward the turn's colour: jade while speaking, red while
// pushing back, cyan thinking, violet listening. Each stops at 82%, so depth
// still shades the hue, and each target sits where 82% of the way lands on
// the state's own hue (jade 156, red 356, cyan 189) for the middle depth.
// With every mix at 0 (rest) the hue is exactly what it always was.
function tintHue(hue, mS, mL, mT, mC) {
  hue += (145 - hue) * mS * 0.82;
  hue += (185 - hue) * mT * 0.82;
  hue += (389 - hue) * mC * 0.82;
  hue += (272 - hue) * mL * 0.82;
  return hue;
}

// the heart: during a turn its inner light leans `k` of the way toward
// `tint` (the state's glow); with no tint it is the heart it always was
function drawHeart(ctx, cx, cy, t, hr, tint = null, k = 0) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr * 3.2);
  g.addColorStop(0, 'rgba(240,252,255,.95)');
  if (tint && k > 0) {
    const m = (v, c) => Math.round(v + (tint[c] - v) * k);
    g.addColorStop(0.18, `rgba(${m(158, 0)},${m(240, 1)},${m(255, 2)},.8)`);
    g.addColorStop(0.45, `rgba(${m(64, 0)},${m(170, 1)},${m(238, 2)},.35)`);
  } else {
    g.addColorStop(0.18, 'rgba(158,240,255,.8)');
    g.addColorStop(0.45, 'rgba(64,170,238,.35)');
  }
  g.addColorStop(1, 'rgba(20,60,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, hr * 3.2, 0, 6.29);
  ctx.fill();
}

// THE HEART LEANS TOWARD HIS FINGER (3 Oct 2026, the full-screen Nova's
// field): attention without a face. `leanRef.current` is the offset the
// heart wants, in canvas px, or null; the heart eases toward it and home
// again. No caller but the full screen passes one, so every other core
// draws exactly as before.
function leanToward(lean, ref) {
  const want = ref && ref.current;
  const tx = want ? want[0] : 0;
  const ty = want ? want[1] : 0;
  lean[0] += (tx - lean[0]) * 0.12;
  lean[1] += (ty - lean[1]) * 0.12;
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
  //   mixS/mixL/mixT/mixC — smoothed speaking/listening/thinking/pushing-
  //           back state, pulling the palette toward the turn's colour (see
  //           tintHue) as the rings fade out and back in;
  //   lvl — raw amplitude, flaring alpha, weight and the band radii.
  // Idle (all of them at 0) is EXACTLY the core he already knows.
  let mixS = 0, mixL = 0, mixT = 0, mixC = 0, clock = 0, last = null, lvl = 0;
  const lean = [0, 0]; // the heart's lean toward his finger, smoothed (see leanRef)
  const col = (f, a) => {
    const hue = tintHue(224 - f * 36, mixS, mixL, mixT, mixC);
    const lit = Math.min(38 + (1 - f) * 44 + lvl * 12, 88);
    return `hsla(${hue % 360},${90 - f * 10}%,${lit}%,${a})`;
  };
  // the same colour as cached shades (see the batcher): the band's depth
  // `f` in FIL_STEPS steps, by alpha. The arcs are filled as the annular
  // elliptic sectors their scaled, butt-capped strokes always covered, so
  // no band needs a save/translate/rotate/scale/restore of its own
  const pal = makePalette(FIL_STEPS, (f, o) => {
    o[0] = tintHue(224 - f * 36, mixS, mixL, mixT, mixC) % 360;
    o[1] = 90 - f * 10;
    o[2] = Math.min(38 + (1 - f) * 44 + lvl * 12, 88);
  });
  const dev = ctx.getTransform().a || 1;
  let nSegs = 0;
  for (const b of bands) {
    nSegs += b.segs.length;
    b.ct = Math.cos(b.tilt);
    b.stt = Math.sin(b.tilt);
  }
  const batch = makeBatch(FIL_STEPS * A_LEVELS, nSegs + embers.length + 16, dev);
  // the shade for colour `f` and an old alpha `a` (times `boost`, the thin
  // stroke's extra light) into sh[0], and into sh[1] the factor its width or
  // area must carry; false when it adds nothing
  const sh = [0, 1];
  const shade = (f, a, boost) => {
    const fi = f <= 0 ? 0 : f >= 1 ? FIL_STEPS - 1 : (f * FIL_STEPS) | 0;
    const e = (a > 1 ? 1 : a) * pal.lum(f) / pal.lumQ[fi] * boost;
    if (e < E_DROP) return false;
    const ai = aLevel(e);
    sh[0] = fi * A_LEVELS + ai;
    sh[1] = e / A_VAL[ai];
    return true;
  };
  // the grain body's seat on the bands: each band an ellipse turned by its
  // tilt, flat (the filament has no depth)
  const ringTab = new Float64Array(bands.length * 8);
  const grains = makeGrains(ctx, size, {
    n: bands.length,
    tab: ringTab,
    cam: 0,
    R,
    fill() {
      for (let j = 0; j < bands.length; j++) {
        const b = bands[j];
        const rad = R * b.f * (1 + lvl * 0.16 * Math.sin(clock * 3.1 + b.f * 9));
        const rot = clock * b.vel, o = j * 8;
        ringTab[o] = rad * b.ct; ringTab[o + 1] = rad * b.stt; ringTab[o + 2] = 0;
        ringTab[o + 3] = -rad * b.squash * b.stt; ringTab[o + 4] = rad * b.squash * b.ct; ringTab[o + 5] = 0;
        ringTab[o + 6] = Math.cos(rot); ringTab[o + 7] = Math.sin(rot);
      }
    },
  });
  // `still`: the one frame a still or reduced-motion core draws (no flight)
  return function draw(t, snap = false, still = false) {
    const st = getState ? getState() : {};
    lvl = audioLevel();
    const dt = last == null ? 0 : Math.min(t - last, 0.1);
    last = t;
    // `snap`: a still frame (reduced motion) that should show the state's
    // colour at once, since no later frame will glide it there
    const k = snap ? 1 : 0.07;
    const turn = st.formOnly ? REST : turnOf(st);
    const pushing = turn === SPEAK && !!st.contest;
    mixS += ((turn === SPEAK && !pushing ? 1 : 0) - mixS) * k;
    mixL += ((turn === LISTEN ? 1 : 0) - mixL) * k;
    mixT += ((turn === THINK ? 1 : 0) - mixT) * k;
    mixC += ((pushing ? 1 : 0) - mixC) * k;
    clock += dt * (1 + lvl * 2.6 + (mixS + mixL + mixT + mixC) * 0.4) * (st.pace || 1);
    grains.update(t, st, lvl, still);
    // the rings (everything but the heart) fade while a turn runs; at rest
    // ringsA is exactly 1 and this frame is the one it always was
    const ringsA = grains.ringsA;
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    if (ringsA > 0.003) {
      if (ringsA < 1) ctx.globalAlpha = ringsA;
      pal.sync();
      batch.clear();
      // wisps stay strokes (a quadratic curve has no cheap outline), each in
      // a cached shade with its width carrying the light the shade rounds off
      for (const w of wisps) {
        if (!shade(0.5, w.al * (1 + lvl * 1.2), 1)) continue;
        const rot = clock * 0.03;
        const x1 = cx + Math.cos(w.a + rot) * R * w.f1;
        const y1 = cy + Math.sin(w.a + rot) * R * w.f1 * 0.94;
        const x2 = cx + Math.cos(w.b + rot) * R * w.f2;
        const y2 = cy + Math.sin(w.b + rot) * R * w.f2 * 0.94;
        let mx = (x1 + x2) / 2 + (y2 - y1) * w.bulge * 0.3;
        let my = (y1 + y2) / 2 - (x2 - x1) * w.bulge * 0.3;
        mx = mx * 0.62 + cx * 0.38;
        my = my * 0.62 + cy * 0.38;
        ctx.strokeStyle = pal.style(sh[0]);
        ctx.lineWidth = 0.7 * sh[1];
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
      }
      const segW = 1 + lvl * 0.5;
      const segA = 1 + lvl * 1.4;
      for (const b of bands) {
        // the filament rings SURGE outward with the voice, each band on its
        // own phase so the whole body ripples rather than pumping as one
        const rad = R * b.f * (1 + lvl * 0.16 * Math.sin(clock * 3.1 + b.f * 9));
        const rot = clock * b.vel;
        for (const s of b.segs) {
          const fl = 0.55 + 0.45 * Math.sin(clock * s.fs + s.fl);
          const w = s.w * segW;
          if (!shade(b.f, s.al * fl * segA, thinLight(w * dev))) continue;
          const hw = w / 2 * sh[1];
          const r0 = rad + s.jit;
          const ro = r0 + hw, ri = r0 > hw ? r0 - hw : 0;
          const a0 = s.a0 + rot;
          const ex = ro * Math.cos(a0), ey = ro * b.squash * Math.sin(a0);
          batch.sector(sh[0], ro, ri, b.squash, b.tilt, a0, a0 + s.len, cx + b.ct * ex - b.stt * ey, cy + b.stt * ex + b.ct * ey);
        }
      }
      const eA = 1 + lvl * 1.4;
      const eR = 1 + lvl * 1.1;
      for (const e of embers) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(clock * e.ts + e.tw));
        if (!shade(e.f, e.al * tw * eA, 1)) continue;
        const x = cx + Math.cos(e.ang + clock * 0.05) * R * e.f;
        const y = cy + Math.sin(e.ang + clock * 0.05) * R * e.f * 0.94;
        batch.dot(sh[0], x, y, e.sz * eR * Math.sqrt(sh[1]));
      }
      batch.fill(ctx, pal.style, cx, cy);
      // a state-tinted bloom around the heart, so the icon's mode reads even
      // at 44px; it fades with the rings, the grains carry the colour after
      const bloomA = (mixS + mixL + mixT + mixC) * (0.22 + lvl * 0.5);
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
      if (ringsA < 1) ctx.globalAlpha = 1;
    }
    grains.draw(cx, cy);
    // the heart breathes on its own and SWELLS with real audio — Nova's own
    // voice while speaking, his while dictating (audioLevel is 0 otherwise,
    // so idle behavior is exactly what it always was); in a turn it stays,
    // on top of the grains, lit toward the state's colour
    const pulse = 1 + 0.07 * Math.sin(t * 1.8) + lvl * 1.15; // his note: it must READ as alive while speaking
    leanToward(lean, st.lean);
    drawHeart(ctx, cx + lean[0], cy + lean[1], t, R * opts.heart * pulse * grains.heartScale, grains.tint, grains.tintK);
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

/* ------------------------------ the batcher ------------------------------

   THE CORE WAS THE LAG (4 Oct 2026). A screen recording of the full-screen
   Nova at rest on his phone ran at 40 fps with frames up to 117 ms. The
   hologram issued about 4,400 separate strokes and fills a frame, each with
   a freshly built colour string and fresh arrays for every point, and the
   58 px tab-bar orb on every page drew about 3,400 of its own: some 12 ms of
   main-thread work a frame for a typical screen, before CoreGraphics had
   rasterised a single line.

   Three things make it cheap without changing the picture:

   1. Colour snaps to a small grid of cached shades (depth or band, by
      alpha), so no frame builds a colour string. What the snap would lose,
      the geometry gives back: each line's width, or each dot's area, is
      scaled by the ratio between the light it should add and the light its
      shade adds, so every primitive adds the same light it always did.
   2. Lines are filled as the quads their butt-capped strokes always were
      (CoreGraphics fills a quad faster than it strokes a segment, and to
      the third decimal they carry the same light), and consecutive
      segments of one line in one shade share a single small path: a "run".
   3. Runs stay SMALL and separate. Measured in WebKit (his phone's engine)
      on 4 Oct: CoreGraphics charges a fill for every scanline its path
      spans and every edge active on them, so gathering a whole shade's
      geometry into one canvas-wide path costs MORE raster than the 4,400
      strokes did (16 ms against 13 at 300 px). Small adjacent runs cost
      less than either, and since each run is its own fill, light still
      adds wherever two runs overlap, exactly as the separate strokes did
      (the comet on its ring, the double ring seen edge-on, the inner rings
      knotted round the heart).

   Every engine here paints with 'lighter', so draw order never mattered and
   the runs can be issued grouped by shade (one fillStyle per shade).      */

const A_LEVELS = 12; // alpha shades, geometric from A_MIN to 1 (~1.5x apart)
const A_MIN = 0.012;
const A_STEP = Math.log(1 / A_MIN) / (A_LEVELS - 1);
const A_VAL = Array.from({ length: A_LEVELS }, (_, i) => (i === A_LEVELS - 1 ? 1 : A_MIN * Math.exp(A_STEP * i)));
const A_TXT = A_VAL.map((a) => String(+a.toFixed(4)));
// below this a primitive adds under half a level of 8-bit light: the canvas
// rounded it away before, so skipping it changes nothing
const E_DROP = 0.0015;
const aLevel = (e) => {
  const i = Math.round(Math.log(e / A_MIN) / A_STEP);
  return i < 0 ? 0 : i >= A_LEVELS ? A_LEVELS - 1 : i;
};
const TAU = 6.2832; // the engines' own 2π (kept so every angle lands where it did)
// A run is at most this many segments: short enough that an edge-on ring's
// two folded halves never share one (they must add, not union), and that
// CoreGraphics never sees a long path
const RUN_CAP = 8;
// A stroke under one device pixel wide puts out more light than its
// geometry (WebKit, measured 4 Oct 2026: 1.4x at 0.2 px, 1.18x at 0.6 px,
// exactly 1x from 1 px up). The quads stand in for strokes, so a thin one
// carries that extra light too. `dw` is the line's width in device pixels.
const thinLight = (dw) => (dw >= 1 ? 1 : 1 / (0.71 + 0.3625 * ((dw > 0.2 ? dw : 0.2) - 0.2)));
// A dot up to 3 device px in radius is filled as an octagon of the same
// area: CoreGraphics fills it 27% faster than an arc, and its edge strays
// from the circle by at most a quarter of a device pixel (larger dots, the
// comet heads among them, stay true circles)
const OCT_MAX = 3;
const OCT_R = Math.sqrt(Math.PI / (2 * Math.SQRT2)); // equal-area radius
const OCT_C = Array.from({ length: 8 }, (_, k) => Math.cos(k / 8 * Math.PI * 2) * OCT_R);
const OCT_S = Array.from({ length: 8 }, (_, k) => Math.sin(k / 8 * Math.PI * 2) * OCT_R);

// Rec. 709 luma of an hsl colour (h in degrees, s and l in 0..1), on the
// encoded values the canvas actually adds
function hslLuma(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  return 0.2126 * (r + m) + 0.7152 * (g + m) + 0.0722 * (b + m);
}

// The shades for one engine: `levels` steps of its colour axis (depth for
// the hologram, band for the filament) times the alpha shades; a shade's
// index is step * A_LEVELS + alpha. `hsl(x, o)` writes hue (deg, 0..360),
// saturation and lightness (%) for x in 0..1 and reads the engine's live
// mixes. sync() runs once a frame and rebuilds strings only when the colour
// actually moved (never, at rest).
function makePalette(levels, hsl) {
  const o = [0, 0, 0];
  const prev = new Float64Array(levels * 3).fill(NaN);
  const head = new Array(levels).fill('');
  const styles = new Array(levels * A_LEVELS).fill(null);
  const lut = new Float64Array(34); // luma along the axis, for the light ratio
  const lumQ = new Float64Array(levels); // luma of each step's own shade
  const luma = (x) => { hsl(x, o); return hslLuma(o[0], o[1] / 100, o[2] / 100); };
  return {
    lumQ,
    lum(x) {
      const f = (x <= 0 ? 0 : x >= 1 ? 1 : x) * 32;
      const i = f | 0;
      return lut[i] + (lut[i + 1] - lut[i]) * (f - i);
    },
    sync() {
      let moved = false;
      for (let d = 0; d < levels; d++) {
        hsl((d + 0.5) / levels, o);
        for (let c = 0; c < 3; c++) {
          const v = Math.round(o[c] * 100) / 100;
          if (v !== prev[d * 3 + c]) { prev[d * 3 + c] = v; moved = true; }
        }
      }
      if (!moved) return;
      for (let d = 0; d < levels; d++) head[d] = `hsla(${prev[d * 3]},${prev[d * 3 + 1]}%,${prev[d * 3 + 2]}%,`;
      styles.fill(null);
      for (let i = 0; i <= 32; i++) lut[i] = luma(i / 32);
      lut[33] = lut[32];
      for (let d = 0; d < levels; d++) lumQ[d] = luma((d + 0.5) / levels);
    },
    style(b) {
      return styles[b] || (styles[b] = head[(b / A_LEVELS) | 0] + A_TXT[b % A_LEVELS] + ')');
    },
  };
}

// One frame's primitives in preallocated typed arrays, listed per shade
// (a linked list threaded through `next`). Kinds: 0 a quad (four corners),
// 1 a dot (x, y, r), 2 an annular elliptic sector around the centre (the
// filament's stroked arcs). A quad added with the same run key and shade
// as the quad added just before it joins that quad's run (`cont`).
function makeBatch(buckets, estimate, dev = 1) {
  const octMax = OCT_MAX / dev; // the octagon limit, in canvas units
  let cap = Math.max(64, estimate | 0);
  let data = new Float64Array(cap * 8);
  let kind = new Uint8Array(cap);
  let next = new Int32Array(cap);
  let cont = new Uint8Array(cap); // 1: shares a path with the next one listed
  const head = new Int32Array(buckets).fill(-1);
  let n = 0, lastB = -1, lastKey = -1, runLen = 0;
  const take = (b, k, key) => {
    if (n === cap) { // only when the estimate ran short: grow once and keep it
      cap *= 2;
      const d2 = new Float64Array(cap * 8); d2.set(data); data = d2;
      const k2 = new Uint8Array(cap); k2.set(kind); kind = k2;
      const n2 = new Int32Array(cap); n2.set(next); next = n2;
      const c2 = new Uint8Array(cap); c2.set(cont); cont = c2;
    }
    const joins = key >= 0 && b === lastB && key === lastKey && runLen < RUN_CAP;
    runLen = joins ? runLen + 1 : 1;
    next[n] = head[b];
    head[b] = n;
    kind[n] = k;
    cont[n] = joins ? 1 : 0;
    lastB = b;
    lastKey = key;
    return (n++) * 8;
  };
  return {
    clear() { head.fill(-1); n = 0; lastB = -1; lastKey = -1; runLen = 0; },
    quad(b, key, x1, y1, x2, y2, x3, y3, x4, y4) {
      const o = take(b, 0, key);
      data[o] = x1; data[o + 1] = y1; data[o + 2] = x2; data[o + 3] = y2;
      data[o + 4] = x3; data[o + 5] = y3; data[o + 6] = x4; data[o + 7] = y4;
    },
    dot(b, x, y, r) {
      const o = take(b, 1, -1);
      data[o] = x; data[o + 1] = y; data[o + 2] = r;
    },
    sector(b, ro, ri, sq, rot, a0, a1, mx, my) {
      const o = take(b, 2, -1);
      data[o] = ro; data[o + 1] = ri; data[o + 2] = sq; data[o + 3] = rot;
      data[o + 4] = a0; data[o + 5] = a1; data[o + 6] = mx; data[o + 7] = my;
    },
    // shade by shade, one fill per run (a lone dot or sector is a run of
    // one); returns how many fills it issued
    fill(ctx, style, cx, cy) {
      let calls = 0;
      for (let b = 0; b < buckets; b++) {
        let i = head[b];
        if (i < 0) continue;
        ctx.fillStyle = style(b);
        let open = false;
        for (; i >= 0; i = next[i]) {
          if (!open) { ctx.beginPath(); open = true; }
          const o = i * 8;
          const k = kind[i];
          if (k === 0) {
            ctx.moveTo(data[o], data[o + 1]);
            ctx.lineTo(data[o + 2], data[o + 3]);
            ctx.lineTo(data[o + 4], data[o + 5]);
            ctx.lineTo(data[o + 6], data[o + 7]);
          } else if (k === 1) {
            const x = data[o], y = data[o + 1], r = data[o + 2];
            if (r <= octMax) {
              ctx.moveTo(x + r * OCT_C[0], y);
              for (let q = 1; q < 8; q++) ctx.lineTo(x + r * OCT_C[q], y + r * OCT_S[q]);
            } else {
              ctx.moveTo(x + r, y);
              ctx.arc(x, y, r, 0, 6.29);
            }
          } else {
            const ro = data[o], ri = data[o + 1], sq = data[o + 2], rot = data[o + 3];
            ctx.moveTo(data[o + 6], data[o + 7]);
            ctx.ellipse(cx, cy, ro, ro * sq, rot, data[o + 4], data[o + 5]);
            ctx.ellipse(cx, cy, ri, ri * sq, rot, data[o + 5], data[o + 4], true);
          }
          if (!cont[i]) { ctx.fill(); calls++; open = false; }
        }
      }
      return calls;
    },
  };
}

/* ---------------------------- hologram engine ---------------------------- */

const CAM_D = 6; // camera distance in R units — mild perspective
const depthMult = (dp) => 0.3 + 0.7 * Math.pow(dp, 1.35); // fog: back dim, front bright
const HOLO_DEPTHS = 5; // colour steps front to back (hue 222 → 194, lightness 44 → 82%)

// The orbs (≤72 px: the tab bar, the hero, the Index, the Inbox, the
// floating core) draw the SMALL scene with coarser circles: rings of 48
// steps instead of 96, globe and inner rings of 24 instead of 48, arcs of 5
// steps instead of 9, a dash as one chord instead of three. At radius ≤33 px
// a chord strays under a tenth of a pixel from a ring and under a quarter
// from the longest arc. Every arc, ember and particle
// stays: thinning the dots (fewer, brighter) read as visibly grainier at
// 58 px on a 2x screen, so the bench of 4 Oct 2026 ruled it out.
const HOLO_MINI = { ...HOLO_SMALL, ringStep: 2, gratSeg: 24, arcSeg: 5, innerSeg: 24, dashSub: 1 };
const holoPreset = (size) => (size <= 72 ? HOLO_MINI : size < 260 ? HOLO_SMALL : HOLO_FULL);

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

// fixed trig for a circle of n steps (index n closes it)
function circleTable(n) {
  const c = new Float64Array(n + 1), s = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) { c[k] = Math.cos(k / n * TAU); s[k] = Math.sin(k / n * TAU); }
  return [c, s];
}
// the two in-plane axes of a ring tilted by rotX(tx) then rotY(ty)
const planeAxes = (tx, ty, out = new Float64Array(6)) => {
  const ctX = Math.cos(tx), stx = Math.sin(tx), cty = Math.cos(ty), sty = Math.sin(ty);
  out[0] = cty; out[1] = 0; out[2] = -sty;
  out[3] = sty * stx; out[4] = ctX; out[5] = cty * stx;
  return out;
};
const GLOBE_LATS = [-1.05, -0.55, 0, 0.55, 1.05];
const COMET_K = 30;
const COMET_FADE = Array.from({ length: COMET_K }, (_, k) => Math.pow(1 - k / COMET_K, 1.6));

function makeHoloDraw(ctx, size, opts, getState) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const CR = CAM_D * R;
  const { rings, inner, arcs, embers, parts } = buildHoloScene(opts);
  const ringStep = opts.ringStep || 1;
  const gratSeg = opts.gratSeg || 48;
  const arcSeg = opts.arcSeg || 9;
  const innerSeg = opts.innerSeg || 48;
  const dashSub = opts.dashSub || 3;

  // same live-speech dynamics as the filament engine (see that comment):
  // an audio-accelerated clock, smoothed state mixes toward the turn's
  // colour, amplitude flares. Idle is exactly the hologram he already knows.
  let mixS = 0, mixL = 0, mixT = 0, mixC = 0, clock = 0, last = null, lvl = 0;
  const lean = [0, 0];
  const col = (dp, a) => {
    const hue = tintHue(222 - 28 * dp, mixS, mixL, mixT, mixC);
    const lit = Math.min(44 + 38 * dp + lvl * 10, 90);
    return `hsla(${hue % 360},${90 - 6 * dp}%,${lit}%,${a})`;
  };
  // the same colour, as the batched shades see it
  const pal = makePalette(HOLO_DEPTHS, (dp, o) => {
    o[0] = tintHue(222 - 28 * dp, mixS, mixL, mixT, mixC) % 360;
    o[1] = 90 - 6 * dp;
    o[2] = Math.min(44 + 38 * dp + lvl * 10, 90);
  });

  // everything that does not move is worked out once
  const [C96, S96] = circleTable(96);
  const [CG, SG] = circleTable(gratSeg);
  const [CI, SI] = circleTable(innerSeg);
  for (const g of rings) g.ax = planeAxes(g.tx, g.ty);
  for (const a of arcs) {
    a.ax = planeAxes(a.tx, a.ty);
    a.cd = Math.cos(a.len / arcSeg);
    a.sd = Math.sin(a.len / arcSeg);
  }
  const lats = GLOBE_LATS.map((lat) => [R * 0.42 * Math.cos(lat), R * 0.42 * Math.sin(lat)]);
  const EP = new Float64Array(embers.length * 3);
  embers.forEach((e, i) => { EP[i * 3] = e.p[0] * R; EP[i * 3 + 1] = e.p[1] * R; EP[i * 3 + 2] = e.p[2] * R; });
  const Rp = R * 0.46;
  const PP = new Float64Array(parts.length * 3);
  parts.forEach((pt, i) => { PP[i * 3] = pt.p[0] * Rp; PP[i * 3 + 1] = pt.p[1] * Rp; PP[i * 3 + 2] = pt.p[2] * Rp; });
  const innerAx = new Float64Array(6);
  const cStep = Math.cos(0.05), sStep = Math.sin(0.05);

  // scratch: one strip of projected points (x, y, depth 0..1, perspective)
  const NP = Math.max(97, gratSeg + 1, innerSeg + 1, arcSeg + 1, COMET_K + 1);
  const PX = new Float64Array(NP), PY = new Float64Array(NP), PD = new Float64Array(NP), PS = new Float64Array(NP);
  // this frame's assembly rotation (rotX by axT, then rotY by ayT)
  let g00 = 1, g01 = 0, g02 = 0, g11 = 1, g12 = 0, g20 = 0, g21 = 0, g22 = 1;
  // the current ring's plane, in world space
  let ux = 0, uy = 0, uz = 0, vx = 0, vy = 0, vz = 0;
  const plane = (ax) => {
    ux = g00 * ax[0] + g01 * ax[1] + g02 * ax[2]; uy = g11 * ax[1] + g12 * ax[2]; uz = g20 * ax[0] + g21 * ax[1] + g22 * ax[2];
    vx = g00 * ax[3] + g01 * ax[4] + g02 * ax[5]; vy = g11 * ax[4] + g12 * ax[5]; vz = g20 * ax[3] + g21 * ax[4] + g22 * ax[5];
  };
  const put = (i, X, Y, Z) => {
    const s = CR / (CR - Z);
    PX[i] = cx + X * s; PY[i] = cy + Y * s; PD[i] = (Z / R + 1) / 2; PS[i] = s;
  };
  const putG = (i, x, y, z) => put(i, g00 * x + g01 * y + g02 * z, g11 * y + g12 * z, g20 * x + g21 * y + g22 * z);
  const onPlane = (i, r, c, s) => put(i, r * (c * ux + s * vx), r * (c * uy + s * vy), r * (c * uz + s * vz));

  const dev = ctx.getTransform().a || 1; // device pixels per canvas unit
  const batch = makeBatch(HOLO_DEPTHS * A_LEVELS, 11 * gratSeg + arcs.length * arcSeg + rings.length * 340 + 3 * innerSeg + embers.length + parts.length + 64, dev);
  let flare = 1; // 1 + lvl * 0.9, the old seg()'s flare
  let lineKey = 0, key = -1; // consecutive segments of one line share a key (a run, see the batcher)
  // a line between two projected points: the old seg(), as a filled quad
  const seg = (i, j, alpha, w) => {
    const dp = (PD[i] + PD[j]) / 2;
    let a = alpha * depthMult(dp) * flare;
    if (a > 1) a = 1; // the canvas clamps an alpha over 1; so did the old one
    const di = dp <= 0 ? 0 : dp >= 1 ? HOLO_DEPTHS - 1 : (dp * HOLO_DEPTHS) | 0;
    const wl = w * (PS[i] + PS[j]) / 2; // the old stroke's width
    const e = a * pal.lum(dp) / pal.lumQ[di] * thinLight(wl * dev);
    if (e < E_DROP) return;
    const ai = aLevel(e);
    const hw = wl / 2 * (e / A_VAL[ai]);
    const x1 = PX[i], y1 = PY[i], x2 = PX[j], y2 = PY[j];
    const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    const nx = -dy * hw / len, ny = dx * hw / len;
    batch.quad(di * A_LEVELS + ai, key, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);
  };
  // a line through the scratch points 0..n
  const strip = (n, alpha, w) => { key = ++lineKey; for (let j = 0; j < n; j++) seg(j, j + 1, alpha, w); key = -1; };
  // a dot at a projected point; `alpha` is the old fill's whole alpha
  const dot = (i, alpha, r) => {
    const dp = PD[i];
    const di = dp <= 0 ? 0 : dp >= 1 ? HOLO_DEPTHS - 1 : (dp * HOLO_DEPTHS) | 0;
    const e = (alpha > 1 ? 1 : alpha) * pal.lum(dp) / pal.lumQ[di];
    if (e < E_DROP) return;
    const ai = aLevel(e);
    batch.dot(di * A_LEVELS + ai, PX[i], PY[i], r * PS[i] * Math.sqrt(e / A_VAL[ai]));
  };
  let halo = null, hS = 0, hL = 0, hT = 0, hC = 0, hV = 0;

  // the grain body's seat on the rings: each ring's in-plane axes in world
  // space (this frame's tumble applied) and its spin, for the grains that
  // leave from it and return to it
  const ringTab = new Float64Array(rings.length * 8);
  const grains = makeGrains(ctx, size, {
    n: rings.length,
    tab: ringTab,
    cam: CR,
    R,
    fill() {
      for (let j = 0; j < rings.length; j++) {
        const g = rings[j];
        plane(g.ax);
        const fr = g.f * R, off = g.spin * clock, o = j * 8;
        ringTab[o] = fr * ux; ringTab[o + 1] = fr * uy; ringTab[o + 2] = fr * uz;
        ringTab[o + 3] = fr * vx; ringTab[o + 4] = fr * vy; ringTab[o + 5] = fr * vz;
        ringTab[o + 6] = Math.cos(off); ringTab[o + 7] = Math.sin(off);
      }
    },
  });

  // `still`: the one frame a still or reduced-motion core draws (no flight)
  return function draw(t, snap = false, still = false) {
    const st = getState ? getState() : {};
    lvl = audioLevel();
    const dt = last == null ? 0 : Math.min(t - last, 0.1);
    last = t;
    // `snap`: a still frame (reduced motion) that should show the state's
    // colour at once, since no later frame will glide it there
    const k = snap ? 1 : 0.07;
    const turn = st.formOnly ? REST : turnOf(st);
    const pushing = turn === SPEAK && !!st.contest;
    mixS += ((turn === SPEAK && !pushing ? 1 : 0) - mixS) * k;
    mixL += ((turn === LISTEN ? 1 : 0) - mixL) * k;
    mixT += ((turn === THINK ? 1 : 0) - mixT) * k;
    mixC += ((pushing ? 1 : 0) - mixC) * k;
    clock += dt * (1 + lvl * 2.6 + (mixS + mixL + mixT + mixC) * 0.4) * (st.pace || 1);
    grains.update(t, st, lvl, still);
    // the rings (everything but the heart) fade while a turn runs; at rest
    // ringsA is exactly 1 and this frame is the one it always was
    const ringsA = grains.ringsA;
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const axT = 0.5 + 0.22 * Math.sin(t * 0.09);
    const ayT = clock * opts.tumble; // slow assembly tumble — quickens with the voice
    {
      const ca = Math.cos(axT), sa = Math.sin(axT), cb = Math.cos(ayT), sb = Math.sin(ayT);
      g00 = cb; g01 = sb * sa; g02 = sb * ca;
      g11 = ca; g12 = -sa;
      g20 = -sb; g21 = cb * sa; g22 = cb * ca;
    }
    if (ringsA > 0.003) {
      if (ringsA < 1) ctx.globalAlpha = ringsA;
      pal.sync();
      flare = 1 + lvl * 0.9;
      batch.clear();

      // graticule globe (spins about its own axis inside the tumbling assembly)
      const Rg = R * 0.42, gs = clock * 0.12;
      const cgs = Math.cos(gs), sgs = Math.sin(gs);
      for (const [rc, z0] of lats) {
        for (let k = 0; k <= gratSeg; k++) {
          const c = CG[k] * cgs - SG[k] * sgs, s = SG[k] * cgs + CG[k] * sgs;
          putG(k, rc * c, z0, rc * s);
        }
        strip(gratSeg, 0.17, 0.55);
      }
      for (let l = 0; l < 6; l++) {
        const ph = l * Math.PI / 6 + gs;
        const cph = Math.cos(ph), sph = Math.sin(ph);
        for (let k = 0; k <= gratSeg; k++) putG(k, Rg * SG[k] * cph, Rg * CG[k], Rg * SG[k] * sph);
        strip(gratSeg, 0.12, 0.55);
      }

      // volumetric halo — faint gas glow filling the sphere (one gradient,
      // rebuilt only when the colour moves)
      if (!halo || hS !== mixS || hL !== mixL || hT !== mixT || hC !== mixC || hV !== lvl) {
        hS = mixS; hL = mixL; hT = mixT; hC = mixC; hV = lvl;
        halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.56);
        halo.addColorStop(0, col(0.5, 0.12 + lvl * 0.2));
        halo.addColorStop(0.6, col(0.5, 0.05 + lvl * 0.08));
        halo.addColorStop(1, 'rgba(20,60,140,0)');
      }
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.56, 0, 6.29);
      ctx.fill();

      // ember cloud (each mote on its own slow orbit inside the body)
      const eFlare = 1 + lvl * 1.2;
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        const ang = clock * e.sp * 4, c = Math.cos(ang), s = Math.sin(ang);
        const x = EP[i * 3], y = EP[i * 3 + 1], z = EP[i * 3 + 2];
        putG(0, c * x + s * z, y, -s * x + c * z);
        const tw = 0.5 + 0.5 * Math.abs(Math.sin(clock * e.ts + e.tw));
        dot(0, e.al * tw * depthMult(PD[0]) * eFlare, e.sz);
      }

      // particle shell (the globe's spin folded into this frame's rotation)
      {
        const c = cgs, s = sgs;
        const m00 = g00 * c - g02 * s, m01 = g01, m02 = g00 * s + g02 * c;
        const m10 = -g12 * s, m11 = g11, m12 = g12 * c;
        const m20 = g20 * c - g22 * s, m21 = g21, m22 = g20 * s + g22 * c;
        for (let i = 0; i < parts.length; i++) {
          const pt = parts[i];
          const x = PP[i * 3], y = PP[i * 3 + 1], z = PP[i * 3 + 2];
          put(0, m00 * x + m01 * y + m02 * z, m10 * x + m11 * y + m12 * z, m20 * x + m21 * y + m22 * z);
          const tw = 0.55 + 0.45 * Math.sin(clock * pt.ts + pt.tw);
          dot(0, (pt.hot ? 0.95 : 0.5) * tw * depthMult(PD[0]) * flare, pt.hot ? 1.6 : 0.95);
        }
      }

      // 3D filament arcs
      for (const a of arcs) {
        plane(a.ax);
        const fr = a.f * R, base = a.a0 + clock * a.drift;
        const fl = 0.55 + 0.45 * Math.sin(clock * a.fs + a.fl);
        let c = Math.cos(base), s = Math.sin(base);
        for (let k = 0; k <= arcSeg; k++) {
          onPlane(k, fr, c, s);
          const c2 = c * a.cd - s * a.sd;
          s = s * a.cd + c * a.sd;
          c = c2;
        }
        strip(arcSeg, a.al * fl * 0.85, a.w);
      }

      // gyro rings
      for (const g of rings) {
        plane(g.ax);
        const fr = g.f * R, off = g.spin * clock;
        const co = Math.cos(off), so = Math.sin(off);
        if (g.style === 'solid' || g.style === 'tick' || g.style === 'double') {
          const alp = g.style === 'tick' ? g.al * 0.55 : g.al;
          const two = g.style === 'double';
          for (let pass = 0; pass < (two ? 2 : 1); pass++) {
            const rr = two ? fr + (pass ? 1 : -1) * R * 0.012 : fr;
            let n = 0;
            for (let k = 0; k <= 96; k += ringStep) onPlane(n++, rr, C96[k] * co - S96[k] * so, S96[k] * co + C96[k] * so);
            strip(n - 1, two ? alp * 0.7 : alp, two ? g.w * 0.8 : g.w);
          }
        }
        if (g.style === 'dash') {
          for (let k = 0; k < 96; k += 6) {
            let n = 0;
            for (let j = 0; j <= 3; j += 3 / dashSub) {
              const m = k + j;
              onPlane(n++, fr, C96[m] * co - S96[m] * so, S96[m] * co + C96[m] * so);
            }
            strip(n - 1, g.al * 1.15, g.w * 1.25);
          }
        }
        if (g.style === 'tick') {
          const n = Math.round(96 / g.tickEvery) * g.tickEvery;
          for (let k = 0; k < n; k += g.tickEvery) {
            const c = C96[k] * co - S96[k] * so, s = S96[k] * co + C96[k] * so;
            const long = (k / g.tickEvery) % 4 === 0;
            const tl = R * (long ? 0.034 : 0.018);
            onPlane(0, fr - tl, c, s);
            onPlane(1, fr + tl, c, s);
            seg(0, 1, g.al * (long ? 1.3 : 0.9), g.w * (long ? 1.1 : 0.8));
          }
        }
        if (g.comet) {
          const ah = g.cometPh + g.cometSp * clock;
          const sd = -Math.sign(g.cometSp) * sStep;
          let c = Math.cos(ah), s = Math.sin(ah);
          for (let k = 0; k <= COMET_K; k++) {
            onPlane(k, fr, c, s);
            const c2 = c * cStep - s * sd;
            s = s * cStep + c * sd;
            c = c2;
          }
          key = ++lineKey;
          for (let k = 0; k < COMET_K; k++) seg(k, k + 1, 0.85 * COMET_FADE[k], 2.2 * COMET_FADE[k] + 0.5);
          key = -1;
          dot(0, 0.95 * depthMult(PD[0]), 2.4); // the head never flared
        }
      }

      // inner gyro reactor — fast precessing rings around the heart
      for (const n of inner) {
        const fr = n.f * R, off = n.spin * clock;
        planeAxes(n.tx + 0.6 * Math.sin(t * n.prec + n.ph), n.ty + clock * 0.25, innerAx);
        plane(innerAx);
        const co = Math.cos(off), so = Math.sin(off);
        for (let k = 0; k <= innerSeg; k++) onPlane(k, fr, CI[k] * co - SI[k] * so, SI[k] * co + CI[k] * so);
        strip(innerSeg, 0.62, 1.05);
      }

      batch.fill(ctx, pal.style, cx, cy);

      // billboard HUD rings — flat, tying the hologram to the interface plane
      // (each dash its own small stroke: CoreGraphics rasterises those faster
      // than one path round the whole ring)
      {
        const r1 = R * 0.985, l1 = TAU / 40 * 0.5;
        ctx.strokeStyle = 'rgba(89,230,255,.4)';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 40; k++) {
          const a0 = k / 40 * TAU + clock * 0.12;
          ctx.beginPath();
          ctx.arc(cx, cy, r1, a0, a0 + l1);
          ctx.stroke();
        }
        const r2 = R * 0.93, l2 = TAU / 64 * 0.32;
        ctx.strokeStyle = 'rgba(143,123,255,.22)';
        ctx.lineWidth = 0.9;
        for (let k = 0; k < 64; k++) {
          const a0 = -clock * 0.08 + k / 64 * TAU;
          ctx.beginPath();
          ctx.arc(cx, cy, r2, a0, a0 + l2);
          ctx.stroke();
        }
      }

      // the state-tinted bloom round the heart fades with the rings; the
      // grains carry the colour after
      const bloomA = (mixS + mixL + mixT + mixC) * (0.22 + lvl * 0.5);
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
      if (ringsA < 1) ctx.globalAlpha = 1;
    }
    grains.draw(cx, cy);
    // breathing heart (shared identity across both engines) — swells with
    // real audio exactly like the filament heart; in a turn it stays, on top
    // of the grains, lit toward the state's colour
    const pulse = 1 + 0.06 * Math.sin(t * 1.8) + lvl * 1.15; // ditto — the mini orb carries the same life
    leanToward(lean, st.lean);
    drawHeart(ctx, cx + lean[0], cy + lean[1], t, R * 0.125 * pulse * grains.heartScale, grains.tint, grains.tintK);
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ------------------------------- component ------------------------------- */

// FORM, NOT HUE (29 Sep 2026, the Nova thread, mockup 63 D): three optional
// props for a surface that says the state by shape and motion alone, because
// on that page gold means "waiting on your call" and nothing else.
//   formOnly — the palette never leaves Nova's blue (no jade, no violet);
//   pace     — the clock's rate (thinking runs the rings three times faster);
//   still    — one frame and no loop, the way reduced motion draws it (offline).
// And two for the full-screen Nova (3 Oct 2026):
//   leanRef   — a ref holding the offset the heart leans toward (his finger);
//   tintStill — under reduced motion, the still frame wears the state colour.
// And two for the grain body (5 Oct 2026, coreGrains.js):
//   thinking — the thinking form (cyan strata, then the turning knot);
//   contest  — while speaking, a sentence that pushes back (the shell in red).
// And one for the wall (9 Oct 2026, mockup 86):
//   fps      — a cap on the frame rate; a core that runs for hours on a
//              wall needs 30, not the display's 60 or 120. Absent, uncapped.
// When more than one turn is set, listening wins, then speaking, then
// thinking. `formOnly` keeps the forms and Nova's blue. A still core (`still`
// or reduced motion) draws the turn's final form as one frame in its colour,
// and once more when the turn changes; at rest, the frame it always drew.
// Left at their defaults every existing caller draws exactly what it did.
export function NovaCore({ size = 312, variant = 'full', engine = 'filament', style, speaking = false, listening = false, thinking = false, contest = false, leanRef = null, tintStill = false, formOnly = false, pace = 1, still = false, fps = 0 }) {
  const ref = useRef(null);
  const stillDraw = useRef(null);
  // live state read through a ref so the rAF loop sees changes WITHOUT the
  // canvas being torn down and rebuilt on every speech toggle
  const stateRef = useRef({ speaking, listening, thinking, contest, formOnly, pace, lean: leanRef });
  stateRef.current = { speaking, listening, thinking, contest, formOnly, pace, lean: leanRef };

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
        ? makeHoloDraw(ctx, size, holoPreset(size), getState)
        : makeFilamentDraw(ctx, size, FILAMENT_PRESETS[variant] || FILAMENT_PRESETS.full, getState);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || still) {
      draw(engine === 'hologram' ? 3.2 : 1.7, tintStill, true); // reduced-motion: one still frame
      stillDraw.current = draw;
      return () => { stillDraw.current = null; };
    }
    // the loop runs only while the core can be seen: the tab visible AND the
    // canvas on screen. A core scrolled away, in a closed (unrendered) sheet
    // or off the page stops drawing and picks up again on re-entry; the
    // clock's dt clamp means it resumes without a jump.
    let raf = 0;
    let shown = document.visibilityState === 'visible';
    let onScreen = true;
    // on screen but covered (`visibility: hidden` under the full-screen Nova,
    // or faded to nothing): looked up every 30 frames, and the frame skipped
    let frames = 0;
    let covered = false;
    // the cap: a frame is drawn only once its slot has come round (a 1 ms
    // slack so a 60 Hz display lands every second frame, not every third)
    const minGap = fps > 0 ? 1000 / fps - 1 : 0;
    let lastDraw = -Infinity;
    const loop = (ts = performance.now()) => {
      raf = requestAnimationFrame(loop);
      if (minGap && ts - lastDraw < minGap) return;
      lastDraw = ts;
      if (frames++ % 30 === 0 && canvas.checkVisibility) covered = !canvas.checkVisibility({ visibilityProperty: true, opacityProperty: true });
      if (!covered) draw(performance.now() / 1000);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = shown && onScreen ? requestAnimationFrame(loop) : 0;
    };
    const onVis = () => {
      shown = document.visibilityState === 'visible';
      run();
    };
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        run();
      }, { rootMargin: '48px' })
      : null;
    io?.observe(canvas);
    run();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size, variant, engine, still, tintStill, fps]);
  // a still core draws its one frame again when the turn changes: the
  // turn's form in its colour (and, on the full screen, the rings' tint);
  // back at rest, the very frame it drew before
  useEffect(() => {
    stillDraw.current?.(engine === 'hologram' ? 3.2 : 1.7, true, true);
  }, [speaking, listening, thinking, contest, formOnly, engine]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', ...style }} />;
}
