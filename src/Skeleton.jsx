import { css } from './css.js';

// SKELETONS — content-shaped placeholders for the window between boot and
// the first sync landing. A "Loading…" line tells him nothing about what is
// coming; a shape that matches the real content reads as the screen already
// being there, which is most of why native apps feel instant even when they
// aren't.
//
// The honesty rule, non-negotiable: a skeleton means LOADING, never EMPTY.
// It renders only while a slice has genuinely never loaded (`slice == null`),
// never over real data, and never on the offline path — offline already has
// its own honest banner plus last-known values, and a shimmer there would
// promise data that isn't coming. Empty states keep their existing copy.
//
// Motion honours calm mode and reduced-motion through --nv-anim, the same
// variable every other animation in Nova reads.
const SHIMMER = 'linear-gradient(90deg, color-mix(in srgb, var(--nv-ink) 06%, transparent) 0%, color-mix(in srgb, var(--nv-ink) 12%, transparent) 50%, color-mix(in srgb, var(--nv-ink) 06%, transparent) 100%)';

// One shimmering block. `w`/`h` accept any CSS length.
export function SkeletonBar({ w = '100%', h = '13px', radius = '7px', style }) {
  return (
    <span style={{
      display: 'block', width: w, height: h, borderRadius: radius,
      background: SHIMMER, backgroundSize: '200% 100%',
      animation: 'skeletonSweep 1.5s ease-in-out infinite',
      animationPlayState: 'var(--nv-anim)',
      ...style,
    }} aria-hidden="true"></span>
  );
}

// A card-shaped block: title bar + a couple of content lines, in the same
// pane chrome the real cards use, so the swap doesn't shift layout.
export function SkeletonCard({ lines = 2, style }) {
  return (
    <div className="nv-pane" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '9px', ...style }}>
      <SkeletonBar w="42%" h="14px" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar key={i} w={i === lines - 1 ? '64%' : '88%'} h="11px" />
      ))}
    </div>
  );
}

// A vertical run of cards — the list shape (Inbox pending, Notes, Todos).
export function SkeletonList({ rows = 3, lines = 2 }) {
  return (
    <div style={css('display:flex;flex-direction:column;gap:10px')}>
      {Array.from({ length: rows }, (_, i) => <SkeletonCard key={i} lines={lines} />)}
    </div>
  );
}

// The grid shape (the recipe bank).
export function SkeletonGrid({ cells = 6 }) {
  return (
    <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px')}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="nv-pane" style={{ padding: 0, overflow: 'hidden' }}>
          <SkeletonBar w="100%" h="120px" radius="0" />
          <div style={css('padding:12px 14px;display:flex;flex-direction:column;gap:8px')}>
            <SkeletonBar w="70%" h="14px" />
            <SkeletonBar w="45%" h="11px" />
          </div>
        </div>
      ))}
    </div>
  );
}
