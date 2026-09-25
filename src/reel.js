// THE REEL'S CLOCK — 25 Sep 2026, from the Hormozi reel he sent: a card that
// cycles through a set of tactics, slows, and lands on the day's one.
//
// One pure function decides where the strip is at every moment, when each row
// boundary crosses the band (a tick), and when the detent catches (the
// landing). The picture (WAAPI keyframes in SpinReveal.jsx) and the sound
// (audio-clock times in sfx.js) are both read off it, so they cannot drift
// apart — Apple's harmony rule: the visual and the sound on the same frame.
//
// THE MOTION: friction, then a detent. The strip leaves at full speed the
// moment he taps (the first tick is within a frame or two of his finger), then
// decays exponentially — ticks spread out the way a real drum's do — carries a
// hair past the target, and the detent pulls it back. That last beat is the
// "catch", and it is where the chime and the light land.
//
// Units: positions are in ROWS (0 = the start row in the band, `steps` = the
// target in the band); times are in milliseconds from the start of the spin.

export const REEL = {
  k: 2.9,            // friction: higher spends more of the spin slowing down
  overshoot: 0.08,   // rows past the target before the detent pulls it back
  settleMs: 190,     // the pull back
  frames: 80,        // keyframes WAAPI interpolates between (linearly)
};

// Longer reels run a little longer, inside the delight budget: this happens
// once a day on a new technique, and the duration IS the anticipation. He can
// tap to fast-forward (SpinReveal's hurry) whenever he likes.
export function reelDuration(steps) {
  return Math.round(Math.min(2900, Math.max(1900, 1650 + 60 * steps)));
}

export function reelTimeline(steps, opts = {}) {
  const n = Math.max(1, Math.floor(steps));
  const { k, overshoot, settleMs, frames } = { ...REEL, ...opts };
  const duration = opts.duration || reelDuration(n);
  const spinMs = duration - settleMs;
  const far = n + overshoot;
  const norm = 1 - Math.exp(-k);

  const posAt = (ms) => {
    if (ms <= 0) return 0;
    if (ms < spinMs) return (far * (1 - Math.exp((-k * ms) / spinMs))) / norm;
    const s = Math.min(1, (ms - spinMs) / settleMs);
    return n + overshoot * (1 - s) ** 3;
  };
  // a tick when each row boundary crosses the band's centre line: the moment
  // the next row is more in than out. Solved from the friction curve exactly,
  // not sampled, so a tick can never fall between two keyframes' guesses.
  const ticks = [];
  for (let i = 1; i <= n; i++) {
    const x = i - 0.5;
    ticks.push(Math.round(((-Math.log(1 - (x * norm) / far)) / k) * spinMs));
  }

  const out = [];
  for (let f = 0; f <= frames; f++) {
    const ms = (duration * f) / frames;
    out.push({ offset: f / frames, pos: f === frames ? n : posAt(ms) });
  }
  return { steps: n, duration, spinMs, landAt: spinMs, ticks, frames: out, posAt };
}

// THE ROWS ON THE DRUM, top to bottom:
//   [above, start, …passes, target, below]
// `above` peeks over the start row while it waits; `start` is what sits in
// the band before the spin (the reveal's call to action, or the concept on
// the card now); `passes` go by; `target` is where it lands; `below` peeks
// under it once it has. The drum shows three rows, so both peeks are needed
// or the window has a hole at rest or at landing.
//
// `others` are passed in order, cycling, until the reel has between
// minSteps and maxSteps rows to travel. The target is never among the
// passes — landing on something it already went past would read as a fudge.
export function buildReelRows({ start, others = [], target, minSteps = 10, maxSteps = 16 }) {
  const pool = others.filter((o) => o && o.key !== target?.key && o.key !== start?.key);
  const passes = [];
  if (pool.length) {
    const want = Math.min(maxSteps, Math.max(minSteps, pool.length)) - 1;
    for (let i = 0; i < want; i++) passes.push(pool[i % pool.length]);
  }
  const above = pool.length ? pool[pool.length - 1] : null;
  const below = pool.length ? pool[passes.length % pool.length] : null;
  const blank = (key) => ({ key, text: '' });
  return [
    { ...(above || blank('above')), role: 'above' },
    { ...start, role: 'start' },
    ...passes.map((p) => ({ ...p, role: 'pass' })),
    { ...target, role: 'target' },
    { ...(below || blank('below')), role: 'below' },
  ];
}
