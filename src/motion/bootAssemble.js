// PARTICLE ASSEMBLE (the motion set, mockup #s9, approved 15 Oct 2026; the
// keynote-motion recipe §16). On a cold open, while Nova is genuinely still
// loading, points drift in from the edges of the screen, swirl once, settle
// into the rings the boot core wears (the cyan ring, the gold dashed ring,
// the core's own bands, the heart), a single glint crosses them, and the
// real core takes over (src/Boot.jsx crossfades to it).
//
// ONE canvas, under 120 points, DPR capped at 2, and drawn only by the one
// rAF loop Boot runs, which stops the moment it hands over. Points of one
// colour are drawn together (four fillStyle changes a frame, not ninety);
// nothing is read from layout inside a frame. The 4 Oct lag was a core
// making ~4,500 canvas calls a frame; this makes ~300.
//
// Pure apart from the canvas it is handed, so the timeline and the point
// count are tested (server/test/bootAssemble.test.js).

export const ASSEMBLE_MS = 1100; // drift in, swirl once, settle
export const GLINT_MS = 380;     // one specular sweep across the settled rings
export const HANDOVER_MS = 260;  // canvas out, the real core in
export const LEAVE_MS = 220;     // the whole boot fades once the app is ready
export const MAX_POINTS = 120;

// the boot core's layout (Boot.jsx: a 150 px box, a cyan ring at its edge, a
// gold dashed ring 14 px in, the 112 px core inside), as radii from its centre
export const RINGS = [
  { n: 44, r: 75, tone: 'cy', s: 1.7 },
  { n: 30, r: 61, tone: 'gold', s: 1.6 },
  { n: 16, r: 38, tone: 'vi', s: 1.9 },
  { n: 7, r: 18, tone: 'ink', s: 2.1 },
];

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// the house spring (a little bounce, settling fast), as a function of seconds
function spring(bounce, dur) {
  const w = (2 * Math.PI) / dur;
  const z = 1 - bounce;
  const r = Math.sqrt(1 - z * z);
  const wd = w * r;
  return (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / r) * Math.sin(wd * t));
}
const settle = spring(0.12, 0.7);

// Every point: where it starts (just outside an edge of the screen), where it
// lands (a ring position), its tone, and when it sets off (the farthest first,
// so they arrive together, staggered by distance).
export function bootPoints(w, h, cx, cy) {
  const pts = [];
  for (const ring of RINGS) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 - Math.PI / 2;
      pts.push({ tx: cx + Math.cos(a) * ring.r, ty: cy + Math.sin(a) * ring.r, tone: ring.tone, s: ring.s });
    }
  }
  pts.push({ tx: cx, ty: cy, tone: 'ink', s: 2.8 });
  const rnd = seeded(7);
  const per = 2 * (w + h);
  for (const p of pts) {
    // a point along the screen's perimeter, 12 px outside it
    let d = rnd() * per;
    if (d < w) { p.sx = d; p.sy = -12; } else if ((d -= w) < h) { p.sx = w + 12; p.sy = d; } else if ((d -= h) < w) { p.sx = w - d; p.sy = h + 12; } else { d -= w; p.sx = -12; p.sy = h - d; }
    p.d = Math.hypot(p.sx - p.tx, p.sy - p.ty);
  }
  const maxD = Math.max(...pts.map((p) => p.d));
  for (const p of pts) p.delay = (1 - p.d / maxD) * 0.3;
  return pts;
}

// Where the timeline stands at `t` ms: assembly progress, the swirl left, the
// glint's place (null when none), and whether it is time to hand over.
export function phaseAt(t) {
  if (t < ASSEMBLE_MS) { const k = Math.max(0, t / ASSEMBLE_MS); return { k, swirl: 1 - k, glint: null, handover: false }; }
  if (t < ASSEMBLE_MS + GLINT_MS) return { k: 1, swirl: 0, glint: (t - ASSEMBLE_MS) / GLINT_MS, handover: false };
  return { k: 1, swirl: 0, glint: null, handover: true };
}

const TONES = ['cy', 'gold', 'vi', 'ink'];

// One frame. `colors` maps a tone to a resolved colour (read once, from the
// --nv-* tokens). `k` 0..1, `swirl` 0..1 (one turn's worth left), `glint`
// 0..1 or null.
export function drawBoot(ctx, pts, { w, h, cx, cy, dpr, colors, k, swirl, glint }) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rot = swirl * 1.4;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (const tone of TONES) {
    ctx.fillStyle = colors[tone];
    for (const p of pts) {
      if (p.tone !== tone) continue;
      const local = Math.max(0, Math.min(1, (k - p.delay) / (1 - p.delay)));
      const e = local >= 1 ? 1 : settle(local * 0.7 * 1.8);
      const x0 = p.sx + (p.tx - p.sx) * e - cx;
      const y0 = p.sy + (p.ty - p.sy) * e - cy;
      ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, local * 1.4);
      ctx.beginPath();
      ctx.arc(cx + x0 * cos - y0 * sin, cy + x0 * sin + y0 * cos, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (glint != null && glint < 1) {
    const gx = cx - 96 + glint * 192;
    const g = ctx.createLinearGradient(gx - 28, 0, gx + 28, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(cx - 90, cy - 90, 180, 180);
    ctx.globalCompositeOperation = 'source-over';
  }
}
