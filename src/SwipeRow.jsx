import { css } from './css.js';
import { useSwipeAction } from './swipeAction.js';

// A row you can swipe. The underlay sits behind and is revealed as the row
// slides; the row itself is the only thing that moves (transform-only, so
// the drag never triggers layout). Buttons inside keep working — the swipe
// only claims the gesture once horizontal intent is locked (see
// swipeAction.js), and a tap never reaches that state.
//
// `right`/`left`: { label, icon, tone, run }. Omit one and that direction is
// inert — the row simply won't move that way, rather than moving and doing
// nothing when released.
export function SwipeRow({ right, left, children, style }) {
  const swipe = useSwipeAction({ onRight: right?.run, onLeft: left?.run });

  if (!swipe.enabled) return <div style={style}>{children}</div>;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', ...style }}>
      {/* the action revealed underneath — its side follows the drag */}
      <div ref={swipe.underlayRef} aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 18px', borderRadius: '12px',
          background: `linear-gradient(90deg, color-mix(in srgb, ${right?.tone || 'var(--nv-good)'} 26%, transparent), transparent 42%, transparent 58%, color-mix(in srgb, ${left?.tone || 'var(--nv-warn)'} 26%, transparent))`,
        }}>
        <span style={css(`font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:${right?.tone || 'var(--nv-good)'}`)}>{right ? `${right.icon || '✓'} ${right.label}` : ''}</span>
        <span style={css(`font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:${left?.tone || 'var(--nv-warn)'}`)}>{left ? `${left.label} ${left.icon || '✕'}` : ''}</span>
      </div>
      <div ref={swipe.ref} {...swipe.handlers} style={{ position: 'relative', willChange: 'transform', touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  );
}
