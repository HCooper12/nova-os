import { Chip } from './Controls.jsx';

// THE ALERT CARD — the anatomy E.V. puts on Peter's phone (design/
// EVIE-STUDY.md §4D; server/lib/alerts.js writes every word of it).
//
//   CALENDAR ●                                  [ See today ]
//   Design review with Sam starts soon
//   in 8 minutes · from your calendar, 3:40 pm
//
// It is drawn INSIDE the island's own card (DynamicIsland.jsx), so it comes
// out of the island with the island's drop and goes back up into it: the
// entrance is the island expand, and nothing in here moves on its own except
// the one live mark on a tier-now alert (the island's own breathe, which
// already stands still under prefers-reduced-motion). It stays until he taps
// it or throws it back up: the after-state is held.
//
// The island is black in every theme, so the hue is lifted toward white the
// way the island lifts every page colour. Colour means something: each label
// wears the hue its domain already owns elsewhere in Nova, never a new one.
//   CALENDAR   --nv-nova      (glassMarks FINDERS.calendar)
//   HEALTH     --nv-cy        (valsMission: recovery = HRV, sleep, RHR)
//   RESEARCHER --nv-m-quads   (glassMarks FINDERS.researcher)
//   WORKOUT    --nv-m-chest   (the Coach's coral: training)
//   MONEY      --nv-vi        (the CFO, Money's Index tile)
//   SYSTEM     --nv-warn      (a fault)
//   PLAN, NOVA --nv-nova      (Nova's own)
const LABEL_HUE = {
  CALENDAR: '--nv-nova',
  HEALTH: '--nv-cy',
  RESEARCHER: '--nv-m-quads',
  WORKOUT: '--nv-m-chest',
  MONEY: '--nv-vi',
  SYSTEM: '--nv-warn',
  PLAN: '--nv-nova',
  NOVA: '--nv-nova',
};
const hueFor = (label) => `color-mix(in srgb, var(${LABEL_HUE[label] || '--nv-nova'}), #fff var(--nv-island-lift))`;

const ONE_LINE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
// one sentence, never cut: at 375 px with the action beside it a ≤90-char
// sentence can need a second line, and an ellipsis would hide the point
const TWO_LINES = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' };

export function AlertCard({ card, onAction }) {
  const hue = hueFor(card.label);
  const meta = [card.where, card.source].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: hue, font: '700 11px var(--nv-font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', lineHeight: 1.2 }}>
          <span>{card.label}</span>
          {card.tier === 'now' && (
            <span aria-hidden="true" className="nv-island-breathe" style={{ width: 6, height: 6, borderRadius: '50%', background: hue, boxShadow: `0 0 8px ${hue}` }} />
          )}
        </div>
        <div style={{ ...TWO_LINES, marginTop: 3, color: 'var(--nv-island-ink)', font: '600 15px/1.3 var(--nv-font-ui)', letterSpacing: '-.01em' }}>{card.what}</div>
        {meta && (
          <div style={{ ...TWO_LINES, marginTop: 2, color: 'color-mix(in srgb, var(--nv-island-ink) 62%, transparent)', font: '500 12.5px/1.3 var(--nv-font-ui)', fontVariantNumeric: 'tabular-nums' }}>{meta}</div>
        )}
      </div>
      {card.action?.label && (
        // data-island-action: the island's hand never treats this as a grip,
        // and the card's own tap (dismiss) does not fire under it
        <span data-island-action style={{ flex: 'none' }}>
          <Chip onClick={(e) => { e?.stopPropagation?.(); onAction?.(card.action); }}
            ariaLabel={card.action.label}
            style={{ color: hue, background: `color-mix(in srgb, ${hue} 16%, transparent)`, border: '1px solid transparent', font: '600 12.5px var(--nv-font-ui)', letterSpacing: 0, textTransform: 'none', minHeight: 32, padding: '6px 13px', whiteSpace: 'nowrap' }}>
            {card.action.label}
          </Chip>
        </span>
      )}
    </div>
  );
}
