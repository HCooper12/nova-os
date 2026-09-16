import { useEffect, useState } from 'react';
import { css } from './css.js';
import { Eyebrow } from './Controls.jsx';
import { CountUp } from './CountUp.jsx';
import { useExit } from './useExit.js';

// THE MOMENT HE BEAT HIS OWN NUMBER.
//
// It was a gold ◆ at 56px, pulsing on an infinite 1.4s loop, over the lift and
// a grey "(was 39.3)". His note: "the diamond feels very random and not as
// exciting as it could be."
//
// He is right twice. The diamond says nothing — it is a generic trophy glyph
// that would suit a coupon — and the infinite pulse is the thing Apple's
// *Principles of Great Design* calls out directly: delight is the result of
// getting everything else right, "not confetti tacked on top". A celebration
// that never stops moving is not celebrating, it is idling.
//
// WHAT THE MOMENT ACTUALLY IS. Not "a record happened" but "you went past
// where you have ever been". So the picture is the mark being passed: a ring
// fills, a tick sits on it where his old number stopped, and the arc keeps
// going beyond it. The figure counts up FROM the old value TO the new one, so
// the last thing his eye does is watch the number cross.
//
// THE RING IS NOT A CHART, and is careful not to look like one. The mark sits
// at a fixed fraction of the sweep and the arc always completes — because a
// proportional ring would be honest and useless here: 39.3 to 40.3 is 2.5%, a
// movement of four pixels nobody would see. The magnitude is carried by the
// numbers, which are exact. Nothing labels the ring as a proportion.
//
// Motion, by the rules in design/APPLE-AUDIT-2026-09.md: one pass, critically
// damped, no overshoot — a bounce belongs to a gesture that carried momentum,
// and nothing here was thrown. It arrives, it settles, it stops.
//
// AND THE THING THE FIRST VERSION GOT WRONG (17 Sep 2026). He asked: "I don't
// know what e1rm means for the personal record ring. Also why does it show
// 40.3kg when that's not the weight I used?"
//
// Both are the same fault. The biggest number on the card was a DERIVED
// ESTIMATE — Epley, `w * (1 + reps/30)`, so 29.5 kg x 11 becomes 40.3 — and
// its only label was "E1RM · KG" in 8.5px grey caps. A jargon acronym on the
// hero number, and the weight he actually lifted nowhere on the card. The
// server had been sending `weight` and `reps` on every e1rm record the whole
// time; the card simply never read them.
//
// The record genuinely IS on the estimate — that is what lets a set of 11
// be compared with a set of 5 — so the ring still shows it. But the estimate
// now says what it is in words, the real set is on the card in a size that
// reads before it, and a plain sentence explains where the number came from.
// A `weight` record needs none of that and gets none of it: the explanation
// appears only where something actually needs explaining.

const R = 38;                       // SVG units, viewBox 0 0 100 100
const CIRC = 2 * Math.PI * R;
const SWEEP = 0.75;                 // 270deg — an OPEN gauge, with a visible start and end
const ARC = CIRC * SWEEP;
const START = 135;                  // degrees, SVG frame: bottom-left, so the gap sits at the foot
const MARK = 0.72;                  // where the old record sits along the sweep

// A point on the gauge at fraction `f` of the sweep, `rad` units from centre.
// SVG's y runs down, so this naturally advances clockwise.
function at(f, rad) {
  const t = ((START + f * SWEEP * 360) * Math.PI) / 180;
  return [50 + Math.cos(t) * rad, 50 + Math.sin(t) * rad];
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Gauge({ from, to, unit }) {
  const [run, setRun] = useState(reduced());
  useEffect(() => {
    if (reduced()) return;
    // two frames: the first paints the empty ring, the second starts the sweep.
    // one frame is not enough — the browser coalesces them and nothing animates.
    const a = requestAnimationFrame(() => { const b = requestAnimationFrame(() => setRun(true)); return b; });
    return () => cancelAnimationFrame(a);
  }, []);

  // the closed ring of the first cut could not show a mark being PASSED — it
  // completed, so there was no visible start, and the tick read as an artifact.
  // An open 270deg gauge has a beginning and an end, and the arc ending beyond
  // the tick is the whole picture.
  const [mx1, my1] = at(MARK, R - 6.5);
  const [mx2, my2] = at(MARK, R + 6.5);
  const [lx, ly] = at(MARK, R + 13);

  return (
    <div style={css('position:relative;width:158px;height:158px;margin:0 auto')}>
      <div aria-hidden="true" style={css('position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--nv-gold) 18%, transparent), transparent 66%);pointer-events:none')} />
      {/* the viewBox is padded, not 0 0 100 100: the old-value label sits outside
            the ring and was being clipped by the edge at the 2 o'clock mark */}
        <svg viewBox="-9 -9 118 118" width="158" height="158" style={{ display: 'block' }} aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--nv-edge)" strokeWidth="5.5" strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC - ARC}`} transform={`rotate(${START} 50 50)`} />
        <circle cx="50" cy="50" r={R} fill="none"
          stroke="var(--nv-gold)" strokeWidth="5.5" strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC - ARC}`}
          strokeDashoffset={run ? 0 : ARC}
          transform={`rotate(${START} 50 50)`}
          style={{ transition: reduced() ? 'none' : 'stroke-dashoffset 1100ms cubic-bezier(.22,1,.36,1)' }} />
        {from != null && (
          <>
            {/* THE MARK HE PASSED, and what it was. Drawn over the arc. */}
            <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke="var(--nv-ink)" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fill="var(--nv-ink40)" style={{ font: '600 7px var(--nv-font-ui)' }}>{from}</text>
          </>
        )}
      </svg>
      <div style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px')}>
        <CountUp
          value={run ? to : (from ?? to)}
          duration={1100}
          format={(n) => (Math.round(n * 10) / 10).toFixed(1)}
          style={{ fontWeight: 700, fontSize: '34px', fontFamily: 'var(--nv-font-ui)', letterSpacing: 'var(--nv-display-track)', color: 'var(--nv-ink)', lineHeight: 1 }}
        />
        {/* NOT --nv-micro-s: that is 11px with tracking under the Apple styles,
            and "EST. 1-REP MAX" then overflows the ring and is cut by the arc.
            A label that has to fit inside a circle sizes to the circle. */}
        <span style={css('font-weight:600;font-size:9px;font-family:var(--nv-font-ui);letter-spacing:.02em;color:var(--nv-ink40);white-space:nowrap')}>{unit}</span>
      </div>
    </div>
  );
}

export function PersonalRecord({ records, onClose }) {
  const exit = useExit(onClose);
  const list = Array.isArray(records) ? records : [];
  const lead = list[0];

  // Escape closes it, like every other overlay in the app. ABOVE the early
  // return, not below it: a hook after a conditional return changes the hook
  // order between renders and React throws. Caught by lint, which is the only
  // gate that can see it — no test renders this.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') exit.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exit]);

  if (!lead) return null;

  const estimated = lead.kind !== 'weight';
  const unit = estimated ? 'EST. 1-REP MAX' : 'KG';
  const prev = Number.isFinite(Number(lead.previous)) ? Number(lead.previous) : null;
  const now = Number(lead.value);
  const delta = prev != null && Number.isFinite(now) ? Math.round((now - prev) * 10) / 10 : null;
  const deltaText = delta != null ? delta.toFixed(1) : null;   // 1 kg reads as a typo; 1.0 reads as measured

  return (
    <div role="dialog" aria-modal="true" aria-label="Personal record" onClick={exit.close} ref={exit.scrimRef}
      style={css('position:fixed;inset:0;z-index:125;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb, var(--nv-void) 74%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fadeIn var(--nv-dur-base) var(--nv-ease)')}>
      <div ref={exit.panelRef} onClick={(e) => e.stopPropagation()} className="nv-liquid nv-liquid-thick nv-materialize"
        style={css('width:min(340px,100%);padding:26px 22px 22px;text-align:center')}>

        <Gauge from={prev} to={Number.isFinite(now) ? now : null} unit={unit} />

        <Eyebrow tone="gold" style={{ marginTop: '16px', display: 'block' }}>Personal record</Eyebrow>

        <div style={css('margin-top:6px;font:700 20px var(--nv-font-ui);letter-spacing:var(--nv-display-track);color:var(--nv-ink)')}>
          {lead.name}
        </div>

        {/* WHAT HE ACTUALLY LIFTED, above the explanation and larger than it.
            For an estimated record this is the set the estimate came from; for
            a weight record it is the record itself. Either way it is the thing
            he remembers doing, so it reads before anything derived. */}
        {lead.weight != null && lead.reps != null && (
          <div style={css('margin-top:7px;font-weight:600;font-size:17px;font-family:var(--nv-font-ui);color:var(--nv-ink);font-variant-numeric:tabular-nums')}>
            {lead.weight} kg × {lead.reps}
          </div>
        )}

        {/* Where the ring's number came from, in a sentence. Only for an
            estimate — a weight record is its own number and explaining it
            would be noise. */}
        {estimated && (
          <div style={css('margin-top:6px;font:500 12.5px/1.45 var(--nv-font-ui);color:var(--nv-ink60)')}>
            The most you'd lift for a single rep, estimated from that set.
          </div>
        )}

        {/* The magnitude, because the ring deliberately does not carry it.
            "First on record" when there is nothing to have passed — an absent
            previous is said, never invented. */}
        <div style={css('margin-top:8px;font-weight:600;font-size:13.5px;font-family:var(--nv-font-ui);color:var(--nv-ink60);font-variant-numeric:tabular-nums')}>
          {prev != null
            ? <>past {prev}{delta > 0 ? <span style={css('color:var(--nv-gold)')}>{'  ·  +'}{deltaText} kg</span> : null}</>
            : 'first on record'}
        </div>

        {list.length > 1 && (
          <div style={css('margin-top:14px;padding-top:12px;border-top:1px solid var(--nv-edge);display:flex;flex-direction:column;gap:6px')}>
            {list.slice(1).map((p, i) => (
              <div key={i} style={css('display:flex;justify-content:space-between;gap:12px;font:500 13px var(--nv-font-ui);color:var(--nv-ink60)')}>
                <span style={css('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.name}</span>
                <span style={css('flex:none;color:var(--nv-ink);font-variant-numeric:tabular-nums')}>
                  {p.weight != null && p.reps != null ? `${p.weight} kg × ${p.reps}` : `${p.value} kg`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={css('margin-top:16px;font:500 12px var(--nv-font-ui);color:var(--nv-ink40)')}>Earned, sir.</div>
      </div>
    </div>
  );
}
