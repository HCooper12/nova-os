// Parses a literal CSS declaration string ("display:flex;gap:14px") into a
// React style object. Lets us reuse the original design's inline style
// strings verbatim instead of hand-converting hundreds of them to camelCase
// object literals.
export function css(str) {
  const out = {};
  if (!str) return out;
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = val;
  }
  return out;
}

// ---------------------------------------------------------------- motion
//
// THE STAGGER, for lists React mounts all at once (11 Sep 2026).
//
// `.nv-stagger` in index.css handles the ordinary case with nth-child and no
// JS. A conversation log is the case it cannot handle: navigating to Voice
// mounts every row at once and wants them to CASCADE (measured before this:
// 29 rows, `fadeUp .4s`, delay 0 — the whole log appeared as one slab), but a
// single new message arriving later must appear at once, not wait out a
// delay it only has because it happens to be last.
//
// So the beat counts backwards from the end — the newest row lands last, the
// older ones are already in place — and the caller passes `staggered: false`
// once the screen has painted, which is the only thing that distinguishes
// "the log just mounted" from "one message arrived".
//
// Returns a full `animation` shorthand with the delay INSIDE it. That is not
// stylistic: React errors when a shorthand and one of its longhands share an
// inline style object, the same trap as `animation` + `animationPlayState`.
export const STAGGER_BEATS = 7;

export function riseIn(index, total, staggered = true, dur = 'var(--nv-dur-base)') {
  if (!staggered) return `nvRise ${dur} var(--nv-ease) both`;
  const fromEnd = Math.max(0, (total - 1) - index);
  const beat = Math.max(0, STAGGER_BEATS - fromEnd);
  if (beat === 0) return `nvRise ${dur} var(--nv-ease) both`;
  return `nvRise ${dur} var(--nv-ease) calc(var(--nv-stagger) * ${beat}) both`;
}
