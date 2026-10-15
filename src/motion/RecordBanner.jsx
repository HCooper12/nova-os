import { useEffect, useState } from 'react';
import { MaskedType } from './MaskedType.jsx';

// THE RECORD BANNER, ONE COMPONENT FOR BOTH LIVE SESSIONS (15 Oct 2026).
// It lived inside src/screens/SessionSummary.jsx; his phone runs cupertino,
// whose live session is the classic SessionView (src/screens/Workouts.jsx),
// and he asked for the same moment there. Both screens import it from here,
// and both hand it the banner from the one decider,
// sessionSummaryFacts.liveRecord. It never decides anything itself.
// Styles: the .nv-ss-rec rules in src/index.css, the masked-type sequence
// in ./maskedType.css, the classic card's placement in ./recordBanner.css.

// THE SET THAT WOULD BE A RECORD (mockup 101, 13 Oct 2026; his words: "Love
// the record banner and its colours, design etc"). It opens inside the set
// card, in the lift's muscle colour; the estimate rolls up from his old best
// like an odometer (keynote-motion §1), "+N" springs in after, and the new
// point draws onto his line for this lift. Provisional on purpose: the
// plates moment at Save (RecordMoment) is still where it becomes a record.
// a record already shown never replays when the screen opens again
const SHOWN = new Set();
function Odometer({ from, to, fresh, delay = 0 }) {
  const target = String(to);
  const start = String(from).padStart(target.length, ' ');
  const [go, setGo] = useState(!fresh);
  useEffect(() => { if (!fresh) return undefined; const t = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); return () => cancelAnimationFrame(t); }, [fresh]);
  return (
    <span className="nv-ss-odo" aria-hidden="true">
      {target.split('').map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} className="sep">{ch}</span>;
        const a = /\d/.test(start[i]) ? Number(start[i]) : 0;
        const b = Number(ch);
        return <span key={i} className="col"><span style={{ transform: `translateY(${-(go ? b : a)}em)`, transitionDelay: `${delay + (target.length - i) * 40}ms` }}>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n}>{n}</span>)}</span></span>;
      })}
    </span>
  );
}
// MASKED TYPE (15 Oct 2026, the approved motion set, scene 4): the lift's
// name heads the banner, outlined, and fills with the muscle's hue rising
// from below; then the line with the new figure rises and the +gain pops.
// It plays with `fresh`, so once per record (SHOWN), only where the code
// caller has already decided the set beat his best. src/motion/MaskedType.jsx;
// the banner's own entrance waits behind the fill (maskedType.css).
const MASK_HOLD_MS = 1300;
export function RecordBanner({ r }) {
  const [fresh] = useState(() => !SHOWN.has(r.key));
  const mask = !!r.name;
  useEffect(() => { SHOWN.add(r.key); }, [r.key]);
  const h = r.history;
  const lo = Math.min(...h) - 1; const hi = Math.max(...h) + 1;
  const x = (i) => 4 + (i * 292) / Math.max(1, h.length - 1);
  const y = (val) => 36 - ((val - lo) / Math.max(0.1, hi - lo)) * 30;
  const pts = h.map((val, i) => `${x(i)} ${y(val)}`);
  return (
    <div key={r.key} className={`nv-ss-rec${fresh ? ' fresh' : ''}${mask ? ' mt' : ''}`} style={{ '--h': r.hue }} role="status" aria-label={`${r.name ? `${r.name}: ` : ''}on pace for a new best: ${r.set} kilograms, estimated one-rep max ${r.value}, ${r.delta} over your best. It counts once you save.`}>
      {mask && <MaskedType name={r.name} play={fresh} />}
      <div className="nv-ss-recrow">
        <span className="nv-ss-rectile" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></svg></span>
        <span className="nv-ss-rect"><b>New best pace</b><small>{r.set} kg · counts once you save</small></span>
        <span className="nv-ss-recv"><Odometer from={r.previous} to={r.value} fresh={fresh} delay={mask && fresh ? MASK_HOLD_MS : 0} /><small>kg</small><em>+{r.delta}</em></span>
      </div>
      {h.length > 1 && (
        <svg className="nv-ss-spark" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
          <path className="ln" d={`M${pts.slice(0, -1).join(' L')}`} />
          <path className="nw" d={`M${pts[pts.length - 2]} L${pts[pts.length - 1]}`} />
          <circle className="np" cx={x(h.length - 1)} cy={y(h[h.length - 1])} r="4" />
        </svg>
      )}
      {h.length > 1 && (
        <p className="nv-ss-recn">Estimated one-rep max, your last {h.length - 1 === 1 ? 'session' : `${h.length - 1} sessions`} and today. The plates moment still plays at Save.</p>
      )}
    </div>
  );
}
