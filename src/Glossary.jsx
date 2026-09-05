// The glossary system — the spec's jargon rule made a component: any term of
// art renders dotted-underlined; a tap opens a plain-English explainer. If a
// term can't earn one plain sentence here, it doesn't ship in the UI.
import { useState, useEffect, useRef } from 'react';
import { css } from './css.js';

export const GLOSSARY = {
  'e1RM': 'Estimated one-rep max — the heaviest single lift your recent sets predict you could do. A way to track strength without ever testing a true max.',
  'SET TYPE': 'WK = working set (counts fully in volume and progression). WU = warm-up (excluded from the maths — it prepares, it doesn\u2019t count). BO = back-off (lighter set after your top work). Tap the chip on a set to cycle it.',
  'RIR': 'Reps In Reserve — how many more reps you could have done. "2 RIR" means you stopped two short of failure. Lower RIR = closer to your limit.',
  'RPE': 'Rate of Perceived Exertion, 1–10. RPE 8 means the set felt like 2 reps were left; RPE 10 is nothing left. It’s how effort gets logged.',
  'deload': 'A planned easy week — lighter loads, sets stopped well short of failure — so accumulated fatigue clears and progress resumes. Backing off on purpose.',
  'accumulation': 'The building phase of a training block: volume climbs week to week while effort stays controlled. It ends in a deload.',
  'intensification': 'The phase after building: less total volume, heavier loads, effort closer to the limit.',
  'stalled': 'No strength gain on this lift across the whole window (its e1RM is flat). A stalled lift needs a changed stimulus — technique, volume, or variation — not just more effort.',
  'plateau': 'Same as stalled: the lift’s strength estimate hasn’t moved in weeks despite training it. The signal to change something, not push harder.',
  'hard sets': 'Working sets taken near failure (warm-ups don’t count). Weekly hard sets per muscle is the simplest lever for growth.',
  'progression': 'The earned next step on a lift — more weight or reps — unlocked by your own logged performance, never by the calendar.',
};

// <Term k="RIR">2 RIR</Term> — children default to the key itself.
export function Term({ k, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const def = GLOSSARY[k];
  if (!def) return <span>{children || k}</span>; // unknown term: render plain, never a dead underline
  return (
    <span ref={ref} style={css('position:relative;display:inline-block')}>
      <span
        role="button" tabIndex={0} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpen(!open); }}
        style={css('border-bottom:1px dotted color-mix(in srgb, var(--nv-cy) 55%, transparent);cursor:help')}
      >{children || k}</span>
      {open && (
        <span style={css('position:absolute;left:0;bottom:calc(100% + 8px);z-index:60;width:min(240px,72vw);background:var(--nv-bg2, #111a32);border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);border-radius:12px;padding:10px 12px;font:400 12px var(--nv-font-ui);color:var(--nv-ink);letter-spacing:0;text-transform:none;line-height:1.5;box-shadow:0 18px 50px -12px rgba(0,0,0,.9)')}>
          <b style={css('display:block;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-cy);margin-bottom:4px;text-transform:uppercase')}>{k}</b>
          {def}
        </span>
      )}
    </span>
  );
}
