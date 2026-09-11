import { lazy, Suspense } from 'react';
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

// 'shot' (7 Sep 2026): a window Nova's browser hand has open, put on the
// glass as it happens — the Iron Man grammar for "open the Diary of a CEO
// channel": the page appears while Nova is on it, and slides into the rail
// when the next one lands. `src` is a blob URL served from Nova's own origin.
//
// 9 Sep 2026 — THE GLASS GREW. His report after a Leader conversation he
// could not keep up with by ear: "it would've been good if it would just
// present brief pop-ups to help explain things it was referring to", with
// three Iron Man 2 clips as the reference. So a spoken reply now raises a
// panel per movement (src/visualBeats.js names them, the server fetches
// them), and three more shapes exist to carry that:
//   key   — the phrase itself, when there is nothing to fetch. The default,
//           and the reason a panel can ALWAYS be up in context.
//   steps — a list that BUILDS as he is read it, his most specific request.
//   media — a podcast or talk, with the exact timecode when one can be
//           proven. Never an estimate: see server/lib/visualMoment.js.
const DRAWABLE = new Set(['metric', 'bars', 'list', 'shot', 'key', 'steps', 'media', 'image', 'instrument']);

// THE INSTRUMENTS, ON THE GLASS. The morning show already speaks each of
// these lines; the instrument is the picture that belongs to the sentence —
// a heart while it talks about his nervous system, the week while it talks
// about steps. Lazy, because two of them pull three.js and the brief must
// not pay for that before it starts speaking.
const Instruments = lazy(() => import('./Instruments.jsx'));

function InstrumentCard({ card }) {
  const Comp = {
    vitals: 'Vitals', day: 'Day', week: 'Week', body: 'BodyInstrument', fuel: 'Fuel',
  }[card.instrument];
  if (!Comp || !card.data) return null;
  return (
    <Suspense fallback={null}>
      <Instruments render={Comp} d={card.data} />
    </Suspense>
  );
}

export function StageCard({ card, size = 'full' }) {
  if (!card) return null;
  // an instrument draws itself, frame and all
  if (card.kind === 'instrument') return <InstrumentCard card={card} />;
  // An unrecognised kind used to render the glass with a label and NOTHING
  // inside — a lit, empty box that reads as the app having broken. If we
  // cannot draw the shape, we draw nothing at all: honest silence beats a
  // frame around a void. (A genuinely empty list is already impossible —
  // listCard returns null rather than an empty card.)
  if (!DRAWABLE.has(card.kind)) return null;
  if (card.kind === 'list' && !(card.items || []).length) return null;
  if (card.kind === 'shot' && !card.src) return null;
  if (card.kind === 'bars' && !(card.bars || []).length) return null;
  if (card.kind === 'steps' && !(card.items || []).length) return null;
  if (card.kind === 'key' && !card.caption) return null;
  // media and image are drawn WITHOUT their picture on purpose — the frame is
  // the promise that lands in context, the picture is what fills it.
  const mini = size === 'mini';
  const accent = toneOf(card.tone);
  const pad = mini ? '10px 12px' : '18px 20px 16px';

  return (
    <div style={{
      position: 'relative', width: '100%', borderRadius: mini ? '10px' : '14px', padding: pad,
      border: `1px solid color-mix(in srgb, ${accent} ${mini ? 26 : 45}%, transparent)`,
      background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 07%, transparent), color-mix(in srgb, var(--nv-void) 92%, black))`,
      boxShadow: mini ? 'none' : `0 0 30px -8px color-mix(in srgb, ${accent} 55%, transparent), 0 20px 50px -24px rgba(0,0,0,.85)`,
      animation: mini ? 'none' : 'popIn var(--nv-dur-base) var(--nv-ease)',
    }}>
      {card.label ? (
        <div style={{ font: `600 ${mini ? 7.5 : 8.5}px ${M}`, letterSpacing: '.2em', color: `color-mix(in srgb, ${accent} 85%, transparent)` }}>{card.label}</div>
      ) : null}

      {card.kind === 'shot' && (
        <div style={{ marginTop: mini ? '6px' : '10px', borderRadius: mini ? '6px' : '10px', overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)', background: 'black' }}>
          <img src={card.src} alt={card.caption || 'the browser window'} style={{ display: 'block', width: '100%', maxHeight: mini ? '84px' : '52vh', objectFit: 'cover', objectPosition: 'top' }} />
        </div>
      )}
      {card.kind === 'shot' && card.url && card.onOpen && !mini && (
        <button type="button" onClick={() => card.onOpen(card.url)}
          style={{ marginTop: '10px', font: `600 9px ${M}`, letterSpacing: '.18em', color: accent, background: 'transparent', border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`, borderRadius: '999px', padding: '6px 12px', cursor: 'pointer' }}>
          OPEN IT FOR REAL →
        </button>
      )}
      {card.kind === 'shot' && card.caption && (
        <div style={{ marginTop: mini ? '5px' : '10px', font: `${mini ? 400 : 500} ${mini ? 10.5 : 13}px/1.45 var(--nv-font-ui)`, color: 'color-mix(in srgb, var(--nv-ink) 84%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: mini ? 'nowrap' : 'normal' }}>{card.caption}</div>
      )}

      {/* still fetching: the frame is up in context and says so, and the
          picture fills into it. Nothing waits off-screen for a sentence that
          has already gone past. */}
      {card.pending && (
        <div style={{ marginTop: mini ? '6px' : '10px', height: mini ? '3px' : '4px', borderRadius: '2px', overflow: 'hidden', background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
          <div style={{ width: '38%', height: '100%', borderRadius: '2px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, animation: 'glassScan 1.15s ease-in-out infinite' }}></div>
        </div>
      )}

      {card.kind === 'key' && card.caption && (
        <div style={{ marginTop: mini ? '5px' : '11px', font: `500 ${mini ? 11 : 17}px/1.4 var(--nv-font-ui)`, color: 'color-mix(in srgb, var(--nv-ink) 94%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: mini ? 'nowrap' : 'normal', display: mini ? 'block' : '-webkit-box', WebkitLineClamp: mini ? undefined : 3, WebkitBoxOrient: 'vertical' }}>{card.caption}</div>
      )}

      {card.kind === 'image' && card.src && (
        <div style={{ marginTop: mini ? '6px' : '10px', borderRadius: mini ? '6px' : '10px', overflow: 'hidden', border: `1px solid color-mix(in srgb, ${accent} 18%, transparent)`, background: 'black' }}>
          <img src={card.src} alt={card.caption || card.label} style={{ display: 'block', width: '100%', maxHeight: mini ? '84px' : '38vh', objectFit: 'cover' }} />
        </div>
      )}
      {card.kind === 'image' && card.src && card.caption && !mini && (
        <div style={{ marginTop: '9px', font: `500 13px/1.45 var(--nv-font-ui)`, color: 'color-mix(in srgb, var(--nv-ink) 84%, transparent)' }}>{card.caption}</div>
      )}
      {card.kind === 'image' && card.credit && !mini && (
        <div style={{ marginTop: '6px', font: `500 7.5px ${M}`, letterSpacing: '.18em', color: 'color-mix(in srgb, var(--nv-ink) 34%, transparent)' }}>{String(card.credit).toUpperCase()}</div>
      )}

      {/* A THING HE COULD GO AND HEAR. The timecode is the point of it — but
          only ever a real one, so the chip is simply absent when neither his
          vault nor the captions can prove the moment. */}
      {card.kind === 'media' && (
        <div style={{ marginTop: mini ? '6px' : '10px', display: 'flex', gap: mini ? '8px' : '12px', alignItems: 'flex-start' }}>
          {card.src && (
            <div style={{ flex: 'none', width: mini ? '52px' : '132px', borderRadius: mini ? '5px' : '8px', overflow: 'hidden', border: `1px solid color-mix(in srgb, ${accent} 20%, transparent)`, background: 'black' }}>
              <img src={card.src} alt={card.title || card.label} style={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `500 ${mini ? 10.5 : 14}px/1.35 var(--nv-font-ui)`, color: 'color-mix(in srgb, var(--nv-ink) 94%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: mini ? 'nowrap' : 'normal' }}>{card.title || card.caption}</div>
            {!mini && card.channel && (
              <div style={{ marginTop: '4px', font: `500 8px ${M}`, letterSpacing: '.18em', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{String(card.channel).toUpperCase()}</div>
            )}
            {card.stamp && (
              <a href={card.watchUrl} target="_blank" rel="noreferrer"
                style={{ marginTop: mini ? '4px' : '9px', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', font: `600 ${mini ? 8 : 9.5}px ${M}`, letterSpacing: '.16em', color: accent, border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`, borderRadius: '999px', padding: mini ? '3px 7px' : '5px 11px' }}>
                ▶ {card.stamp}
              </a>
            )}
            {!mini && !card.stamp && !card.pending && (
              <div style={{ marginTop: '9px', font: `500 8px ${M}`, letterSpacing: '.16em', color: 'color-mix(in srgb, var(--nv-ink) 34%, transparent)' }}>MOMENT NOT MARKED</div>
            )}
            {!mini && card.stamp && card.stampSource === 'vault' && (
              <div style={{ marginTop: '6px', font: `500 7.5px ${M}`, letterSpacing: '.16em', color: 'color-mix(in srgb, var(--nv-ink) 34%, transparent)' }}>FROM YOUR NOTE</div>
            )}
          </div>
        </div>
      )}

      {/* IT BUILDS. His words: number one alone while it is read to him, then
          one and two together when Nova reaches two. */}
      {card.kind === 'steps' && (
        <div style={css(`margin-top:${mini ? 7 : 14}px;display:flex;flex-direction:column;gap:${mini ? 6 : 11}px`)}>
          {(card.items || []).slice(0, Math.max(1, card.revealed ?? (card.items || []).length)).map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: mini ? '7px' : '11px', animation: 'glassStep var(--nv-dur-base) var(--nv-ease)' }}>
              <span style={{ flex: 'none', font: `600 ${mini ? 8 : 10}px ${M}`, letterSpacing: '.1em', color: accent, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1, minWidth: 0, font: `500 ${mini ? 10.5 : 14}px/1.4 var(--nv-font-ui)`, color: 'color-mix(in srgb, var(--nv-ink) 92%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: mini ? 'nowrap' : 'normal' }}>{it.name}</span>
            </div>
          ))}
        </div>
      )}

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
          {(card.bars || []).map((b, i) => (
            <div key={i} style={css('flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:5px')}>
              <div style={{ height: `${b.pct}%`, borderRadius: '3px 3px 0 0', background: `linear-gradient(180deg, ${toneOf(b.tone) || accent}, color-mix(in srgb, ${toneOf(b.tone) || accent} 35%, transparent))` }}></div>
              {!mini && <span style={{ font: `500 7.5px ${M}`, letterSpacing: '.06em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>}
            </div>
          ))}
        </div>
      )}

      {card.kind === 'list' && (
        <div style={css(`margin-top:${mini ? 7 : 13}px;display:flex;flex-direction:column;gap:${mini ? 5 : 9}px`)}>
          {(mini ? (card.items || []).slice(0, 3) : (card.items || [])).map((it, i) => (
            <div key={i} style={css('display:flex;align-items:baseline;gap:9px')}>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', flex: 'none', background: toneOf(it.tone) || accent, transform: 'translateY(-2px)' }}></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: mini ? '10.5px' : '13px', color: 'color-mix(in srgb, var(--nv-ink) 92%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
              {it.note && <span style={{ flex: 'none', font: `500 ${mini ? 7 : 8.5}px ${M}`, letterSpacing: '.1em', color: 'color-mix(in srgb, var(--nv-ink) 42%, transparent)' }}>{it.note.toUpperCase()}</span>}
            </div>
          ))}
        </div>
      )}

      {card.foot && !mini && (
        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', color: 'color-mix(in srgb, var(--nv-ink) 38%, transparent)' }}>{card.foot}</div>
      )}
    </div>
  );
}
