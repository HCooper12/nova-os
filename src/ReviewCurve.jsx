import { CountUp } from './CountUp.jsx';
import { Meta } from './Controls.jsx';

// "N of M done" — the count rises (CountUp.jsx) rather than silently
// swapping digits, same as every other figure on this Home. Shared by all
// three idioms.
export function ReviewPips({ pips, tone = 'faint' }) {
  if (!pips) return null;
  return <Meta tone={tone}><CountUp value={pips.done} fromZero /> of {pips.total} done</Meta>;
}

// THE FORGETTING CURVE, DRAWN (mockup 96): his real answers as dots on
// their dates, a line drawn to the seven gaps — no percentage, just the
// shape of it. Shared by all three idioms so the drawing is one thing, not
// three. Transform/opacity only; the newest dot pops in once on arrival
// (an answer acted out landing here), and CSS never replays that for a
// dot that was already on screen — only a freshly mounted node animates.
export function ReviewCurve({ curve, hue, width = 220, height = 34 }) {
  const totalGapDays = curve.gaps.reduce((a, b) => a + b, 0);
  let x = 0;
  const pts = curve.gaps.map((g) => { x += g; return (x / totalGapDays) * width; });
  const path = `M0 ${height} ` + pts.map((px, i) => `L${px} ${height - (height * (i + 1)) / curve.gaps.length}`).join(' ');
  const n = curve.answers.length;
  return (
    <svg width="100%" height={height + 6} viewBox={`0 0 ${width} ${height + 6}`} style={{ display: 'block', marginTop: '10px' }} aria-hidden="true">
      <path d={path} fill="none" stroke={`color-mix(in srgb, ${hue} 45%, transparent)`} strokeWidth="1.5" />
      {curve.answers.map((a, i) => {
        const cx = Math.min(width, (i / Math.max(1, n - 1 || 1)) * width);
        const tone = a.grade === 'forgot' ? 'var(--nv-warn)' : a.grade === 'fuzzy' ? 'var(--nv-gold)' : 'var(--nv-good)';
        const newest = i === n - 1;
        return (
          <circle key={`${a.date}-${a.grade}`} cx={cx} cy={height - 4} r="3" fill={tone}
            style={newest ? { transformOrigin: `${cx}px ${height - 4}px`, animation: 'popIn 260ms var(--nv-ease) backwards' } : undefined} />
        );
      })}
    </svg>
  );
}
