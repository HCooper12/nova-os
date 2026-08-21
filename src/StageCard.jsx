import { css } from './css.js';

const M = 'var(--nv-font-mono)';

// THE GLASS — his 21-Aug reference: "let me put it on the glass." Whatever
// Nova is saying right now has its figure on screen beside it, and the card
// CHANGES as the narration moves to the next line. Nothing is tapped.
//
// Three shapes, built by server/lib/spokenCards.js from real numbers: one
// big metric, a small bar chart, or a short list. A card can never say
// something the voice didn't — it is the same computed figure, drawn.
const TONE = { cy: 'var(--nv-cy)', gold: 'var(--nv-gold)', warn: 'var(--nv-warn)', good: 'var(--nv-good)', vi: 'var(--nv-vi)' };
const toneOf = (t) => TONE[t] || TONE.cy;

export function StageCard({ card, size = 'full' }) {
  if (!card) return null;
  const mini = size === 'mini';
  const accent = toneOf(card.tone);
  const pad = mini ? '10px 12px' : '18px 20px 16px';

  return (
    <div style={{
      position: 'relative', width: '100%', borderRadius: mini ? '10px' : '14px', padding: pad,
      border: `1px solid color-mix(in srgb, ${accent} ${mini ? 26 : 45}%, transparent)`,
      background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 07%, transparent), color-mix(in srgb, var(--nv-void) 92%, black))`,
      boxShadow: mini ? 'none' : `0 0 30px -8px color-mix(in srgb, ${accent} 55%, transparent), 0 20px 50px -24px rgba(0,0,0,.85)`,
      animation: mini ? 'none' : 'popIn .34s cubic-bezier(.2,.9,.25,1)',
    }}>
      <div style={{ font: `600 ${mini ? 7.5 : 8.5}px ${M}`, letterSpacing: '.2em', color: `color-mix(in srgb, ${accent} 85%, transparent)` }}>{card.label}</div>

      {card.kind === 'metric' && (
        <div style={css(`text-align:center;padding:${mini ? '6px 0 2px' : '14px 0 6px'}`)}>
          <b style={{ font: `600 ${mini ? 22 : 54}px/1 var(--nv-font-ui)`, color: accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
            {card.value}{card.unit && <span style={{ fontSize: '.42em', marginLeft: '2px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{card.unit}</span>}
          </b>
          {card.caption && <div style={{ marginTop: mini ? '2px' : '7px', font: `500 ${mini ? 7 : 8.5}px ${M}`, letterSpacing: '.22em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{card.caption}</div>}
        </div>
      )}

      {card.kind === 'bars' && (
        <div style={css(`display:flex;align-items:flex-end;gap:${mini ? 4 : 9}px;height:${mini ? 44 : 104}px;margin-top:${mini ? 8 : 16}px`)}>
          {card.bars.map((b, i) => (
            <div key={i} style={css('flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:5px')}>
              <div style={{ height: `${b.pct}%`, borderRadius: '3px 3px 0 0', background: `linear-gradient(180deg, ${toneOf(b.tone) || accent}, color-mix(in srgb, ${toneOf(b.tone) || accent} 35%, transparent))` }}></div>
              {!mini && <span style={{ font: `500 7.5px ${M}`, letterSpacing: '.06em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>}
            </div>
          ))}
        </div>
      )}

      {card.kind === 'list' && (
        <div style={css(`margin-top:${mini ? 7 : 13}px;display:flex;flex-direction:column;gap:${mini ? 5 : 9}px`)}>
          {(mini ? card.items.slice(0, 3) : card.items).map((it, i) => (
            <div key={i} style={css('display:flex;align-items:baseline;gap:9px')}>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', flex: 'none', background: toneOf(it.tone) || accent, transform: 'translateY(-2px)' }}></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: mini ? '10.5px' : '13px', color: 'color-mix(in srgb, var(--nv-ink) 92%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
              {it.note && <span style={{ flex: 'none', font: `500 ${mini ? 7 : 8.5}px ${M}`, letterSpacing: '.1em', color: 'color-mix(in srgb, var(--nv-ink) 42%, transparent)' }}>{it.note.toUpperCase()}</span>}
            </div>
          ))}
        </div>
      )}

      {card.foot && !mini && (
        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)', font: `400 9.5px ${M}`, letterSpacing: '.06em', color: 'color-mix(in srgb, var(--nv-ink) 38%, transparent)' }}>{card.foot}</div>
      )}
    </div>
  );
}
