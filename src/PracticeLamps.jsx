import { useEffect, useRef, useState } from 'react';

// THE LAMP — Practice's one object (design/PRACTICE-PLAN.md). One small
// stage light per move: dim until he lands it, lit in --nv-or once he has.
// The look lives in index.css (.nv-lamp); this component only owns the
// moment of landing — when a lamp goes from dim to lit while he is looking
// at it, it swells once (data-bloom) as the light comes up, so the change is
// acted out rather than simply true on the next paint. A lamp that arrives
// already lit does not swell: it was not landed just now.

export function Lamp({ lit, missed, size = 30, title, delay = 0, arrive = true }) {
  const was = useRef(lit);
  const [bloom, setBloom] = useState(false);
  useEffect(() => {
    if (lit && !was.current) {
      setBloom(true);
      const t = setTimeout(() => setBloom(false), 600);
      was.current = lit;
      return () => clearTimeout(t);
    }
    was.current = lit;
    return undefined;
  }, [lit]);
  // the entrance rides a wrapper: an inline `animation` on the lamp itself
  // would outrank the stylesheet and silence the swell
  return (
    <span style={{ display: 'inline-flex', flex: 'none', ...(arrive ? { animation: `popIn var(--nv-dur-base) var(--nv-ease) ${delay}ms both` } : {}) }}>
      <span className="nv-lamp" data-lit={lit ? 'true' : 'false'} data-missed={missed ? 'true' : undefined}
        data-bloom={bloom ? 'true' : undefined} title={title}
        aria-label={title ? `${title}${lit ? ', landed' : missed ? ', missed' : ', not landed yet'}` : undefined}
        role={title ? 'img' : undefined}
        style={{ '--lamp': `${size}px` }} />
    </span>
  );
}

// A row of lamps: the skill's progress in one glance. Arrives in a 40ms
// cascade (the house stagger); the tooltip names each move.
export function LampRow({ lamps, size = 16, gap = 8, style }) {
  if (!lamps?.length) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: `${gap}px`, minWidth: 0, ...(style || {}) }}>
      {lamps.map((l, i) => (
        <Lamp key={`${l.name}-${i}`} lit={l.lit} missed={l.missed} size={size} title={l.name} delay={i * 40} />
      ))}
    </span>
  );
}
