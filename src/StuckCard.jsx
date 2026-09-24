import { css } from './css.js';
import { Pill } from './AppleLayout.jsx';
import { TextAction } from './Controls.jsx';

// STUCK — what the day plan keeps listing and nothing closes, on Home.
//
// Measured before it was drawn (25 Sep): 63 of 78 plan priorities never got a
// word, most of what the vault can check was in fact done, and what stayed
// open was the work nobody can observe. The podcast write-up sat on the plan
// four days running; two to-dos had been open a month. A reminder had already
// failed four times, so this card offers the three answers that are left:
//
//   START IT WITH ME — Nova takes the first two minutes with him, by voice
//   NOT NOW          — off Home and out of the plan for three days
//   LET IT GO        — out of the plan for good (an answer, not a failure)
//
// A NUMBER GETS A FORM: the days stuck fill a ring across the plan's week, in
// the house ring's stroke (RingTile) and its tones: gold while it is days,
// warn once it is a week or more. That is the only colour on the card, so the
// colour says exactly one thing: how long.
//
// ONE component, both Home idioms from one view model (vals: stuckCard).

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';
const TONE = { behind: 'var(--nv-gold)', missed: 'var(--nv-warn)' };

function DaysRing({ days, pct, tone, size = 46 }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const stroke = TONE[tone] || TONE.behind;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} aria-label={`${days} days`}>
      <svg viewBox="0 0 46 46" width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="23" cy="23" r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="4" />
        <circle cx="23" cy="23" r={r} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      {/* "33d", not "33 / DAYS": a unit small enough to fit under the number
          would sit below the iOS 11pt floor Home is held to (contrast.test.js) */}
      <div style={css('position:absolute;inset:0;display:flex;align-items:baseline;justify-content:center;padding-top:15px;line-height:1')}>
        <b style={{ font: `600 14px ${M}`, color: 'var(--nv-ink)' }}>{days}</b>
        <span style={{ font: `500 11px ${M}`, color: stroke }}>d</span>
      </div>
    </div>
  );
}

function Item({ it, i, variant }) {
  const apple = variant === 'apple';
  return (
    <div style={{
      padding: apple ? '14px 16px' : '14px 0',
      borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)',
      // no stagger delay and no `both` fill: Home re-renders every second, and
      // AppleLayout.jsx records how a delayed filled entrance left rows
      // invisible there. The running-plan card's plain entrance is the safe one.
      animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)',
    }}>
      <div style={{ display: 'flex', gap: '13px', alignItems: 'flex-start' }}>
        <DaysRing days={it.days} pct={it.pct} tone={it.tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `italic 400 ${apple ? '17px' : '18px'}/1.3 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.text}</div>
          <div style={{ marginTop: '4px', font: `450 12.5px ${UI}`, color: 'var(--nv-ink60)' }}>{it.meta}</div>
        </div>
      </div>
      {/* the answers span the card: at 375px, sharing the text column
          pushed "Let it go" onto a line of its own */}
      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' }}>
        <Pill label="Start it with me" onClick={it.start} accent="--nv-cy" />
        <TextAction compact tone="quiet" onClick={it.later}>Not now</TextAction>
        <TextAction compact tone="quiet" onClick={it.drop}>Let it go</TextAction>
      </div>
    </div>
  );
}

export function StuckCard({ card, variant = 'apple' }) {
  if (!card) return null;
  const apple = variant === 'apple';
  const body = (
    <>
      {card.items.map((it, i) => <Item key={it.key} it={it} i={i} variant={variant} />)}
      {card.receipt && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: apple ? '12px 16px' : '12px 0',
          borderTop: card.items.length ? '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' : 'none',
          animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}>
          <span style={{ flex: 1, minWidth: 0, font: `450 12.5px/1.45 ${UI}`, color: 'var(--nv-ink60)' }}>{card.receipt.said}</span>
          <TextAction compact onClick={card.receipt.undo}>Undo</TextAction>
        </div>
      )}
    </>
  );
  if (apple) {
    return (
      <section style={{ marginTop: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', margin: '0 6px 7px' }}>
          <span style={{ font: `600 12px ${UI}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nv-ink40)' }}>Stuck</span>
          <span style={{ font: `500 12.5px ${UI}`, color: 'var(--nv-ink40)' }}>the plan keeps listing these</span>
        </div>
        <div className="nv-pane" style={{ padding: '4px 0', overflow: 'hidden' }}>
          {body}
        </div>
      </section>
    );
  }
  return (
    <div className="nv-pane" style={{ padding: '18px 24px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track-wide)', color: 'var(--nv-ink60)' }}>STUCK</span>
        <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-ink40)' }}>THE PLAN KEEPS LISTING THESE</span>
      </div>
      {body}
    </div>
  );
}
