import { css } from './css.js';

// THE RING, EVERYWHERE — B1 from the 4 Sep audit, his pick on 5 Sep.
//
// The readiness ring on Train was the single best object in the product: one
// number, one arc, a word, readable in the half-second between pocket and gym
// door. It appeared on one of sixteen screens. This is the same shape, small
// enough to sit four abreast, for protein, steps, sleep and readiness on the
// Home screen.
//
// COLOUR IS THE VERDICT, not decoration. The old Vitals grid painted protein
// violet and steps magenta because those were their accent colours — which
// told him nothing. Here green means on track, gold behind, red missed. And a
// missing value is a HOLE: a dashed ring and a dash, never a zero that looks
// like a bad day. See missionFocus.ringState for the thresholds.

const M = 'var(--nv-font-mono)';
const TONE = {
  good: 'var(--nv-good)',
  behind: 'var(--nv-gold)',
  missed: 'var(--nv-warn)',
  absent: 'color-mix(in srgb, var(--nv-ink) 28%, transparent)',
};

export function RingTile({ label, value, small, pct, state = 'absent', hint, onOpen, size = 58 }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const shown = state === 'absent' ? 0 : Math.max(0, Math.min(100, Number(pct) || 0));
  const off = c * (1 - shown / 100);
  const tone = TONE[state] || TONE.absent;
  return (
    <div onClick={onOpen} role={onOpen ? 'button' : undefined}
      style={css(`display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;cursor:${onOpen ? 'pointer' : 'default'}`)}
      title={hint || ''}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg viewBox="0 0 58 58" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}
          aria-label={`${label}: ${state === 'absent' ? 'not reported' : `${value}${small || ''}, ${shown}%`}`}>
          <circle cx="29" cy="29" r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="5" />
          {state === 'absent' ? (
            // a dashed ring is the house style for "this is a gap, not a zero"
            <circle cx="29" cy="29" r={r} fill="none" stroke={tone} strokeWidth="3" strokeDasharray="3 5" />
          ) : (
            <circle cx="29" cy="29" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off}
              style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
          )}
        </svg>
        <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          <b style={css(`font:600 ${String(value).length > 4 ? '11px' : '13px'} ${M};color:${state === 'absent' ? TONE.absent : 'var(--nv-ink)'};font-variant-numeric:tabular-nums`)}>
            {state === 'absent' ? '—' : value}
          </b>
        </div>
      </div>
      <span style={css(`font:600 8px ${M};letter-spacing:.14em;color:${state === 'absent' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)'};text-align:center;white-space:nowrap`)}>
        {label}{state !== 'absent' && shown ? ` · ${shown}%` : ''}
      </span>
    </div>
  );
}
