// THE GALAXY'S LAYOUT — a seeded force simulation run ONCE at build time.
//
// The server serves an Obsidian-grade graph (real pages, real wikilinks); the
// client used to draw it as random stars on a ring, so a hub looked like an
// orphan and a cluster like noise. A few hundred ticks of attract / repel /
// centre here — O(n²) once, trivial for 400 nodes — and clusters, hubs and
// fringe orphans emerge with zero per-frame cost; the render keeps its wobble
// on top of the frozen positions. Pure and deterministic (seeded), so it is
// tested from node like any other piece of arithmetic.

// mulberry32 — small, deterministic, good enough for jitter
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// link count per node — stars are sized by this, so a hub reads as a hub
export function degrees(count, links) {
  const deg = new Array(count).fill(0);
  for (const [a, b] of links) {
    if (a < count) deg[a]++;
    if (b < count) deg[b]++;
  }
  return deg;
}

export function forceLayout(count, links, { width, height, ticks = 220, seed = 7, padding = 28 } = {}) {
  const rand = rng(seed);
  const cx = width / 2;
  const cy = height / 2;
  const n = count;
  if (!n) return [];
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  // start on a jittered ring, as the old layout did — then let the graph pull it into shape
  const ring = 0.36 * Math.min(width, height);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.8;
    const rad = ring * (0.55 + rand() * 0.9);
    xs[i] = cx + Math.cos(ang) * rad;
    ys[i] = cy + Math.sin(ang) * rad;
  }
  // the natural link length scales with how much room each star has
  const area = (width - 2 * padding) * (height - 2 * padding);
  const L = Math.max(24, Math.sqrt(area / Math.max(n, 1)) * 1.1);
  const REPEL = L * L * 0.9;
  const deg = degrees(n, links);
  for (let tick = 0; tick < ticks; tick++) {
    const alpha = 1 - tick / ticks; // cooling
    // repulsion, every pair (with a floor so overlapping stars still separate)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[j] - xs[i];
        let dy = ys[j] - ys[i];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (rand() - 0.5); dy = (rand() - 0.5); d2 = dx * dx + dy * dy + 0.01; }
        const f = Math.min(REPEL / d2, L * 2) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        vx[i] -= fx * 0.5; vy[i] -= fy * 0.5;
        vx[j] += fx * 0.5; vy[j] += fy * 0.5;
      }
    }
    // springs along the links — a hub with many links is heavier and moves less
    for (const [a, b] of links) {
      if (a >= n || b >= n) continue;
      const dx = xs[b] - xs[a];
      const dy = ys[b] - ys[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const pull = (d - L) * 0.06 * alpha;
      const fx = (dx / d) * pull;
      const fy = (dy / d) * pull;
      const wa = 1 / (1 + deg[a] * 0.15);
      const wb = 1 / (1 + deg[b] * 0.15);
      vx[a] += fx * wa; vy[a] += fy * wa;
      vx[b] -= fx * wb; vy[b] -= fy * wb;
    }
    // gentle gravity to the centre keeps orphans in frame; damping settles it
    for (let i = 0; i < n; i++) {
      vx[i] += (cx - xs[i]) * 0.004 * alpha;
      vy[i] += (cy - ys[i]) * 0.004 * alpha;
      vx[i] *= 0.82; vy[i] *= 0.82;
      xs[i] += vx[i]; ys[i] += vy[i];
      // soft bounds every tick, hard at the end
      xs[i] = Math.min(width - padding, Math.max(padding, xs[i]));
      ys[i] = Math.min(height - padding, Math.max(padding, ys[i]));
    }
  }
  return Array.from({ length: n }, (_, i) => ({ x: xs[i], y: ys[i] }));
}

// the render cap — one source for the builder and the stats label, so the
// label can say "400 OF 523 STARS" instead of silently drawing a subset
export const GALAXY_MAX_NODES = 400;
