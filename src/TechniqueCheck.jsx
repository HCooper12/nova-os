import { Interactive } from './Interactive.jsx';
import { TickButton } from './TickButton.jsx';
import { Eyebrow, Meta, TextAction } from './Controls.jsx';

const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

// DID IT LAND? — Wrap the day's question on a technique day. 25 Sep 2026,
// the half of the Hormozi reel's loop Nova was missing: pick it, do it,
// REPORT BACK. By then eleven techniques had been served and not one marked,
// so the question is asked where he already looks in the evening, and asked
// against the technique's own Tell — "landed" means the thing the catalogue
// said to watch for, not a vibe.
//
// A decision is a light tick or cross (§2b rule 8), not a form: "It landed"
// is the house tick (the pill becomes the answer and the tick draws itself,
// in green because landing is the good verdict), "Didn't land" is the quiet
// cross, and "Didn't try it" passes on the day. The line under it is room to
// say what happened; it rides the same write. One answer, changeable in
// place — Change reopens it and answering again corrects the tally.
//
// Both Home idioms render this from one view model (valsMission wrapCard).
export function TechniqueCheck({ q, divided = false, label = true }) {
  if (!q) return null;
  const edge = divided
    ? { marginTop: '14px', paddingTop: '14px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 8%, transparent)' }
    : {};

  if (q.answered) {
    const landed = q.result === 'landed';
    return (
      <div style={{ ...edge, display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, animation: 'popIn var(--nv-dur-base) var(--nv-ease) both' }}>
        <span aria-hidden="true" style={{
          flex: 'none', width: '28px', height: '28px', marginTop: '1px', borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: landed ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 8%, transparent)',
          color: landed ? 'var(--nv-on-acc)' : 'var(--nv-ink60)', font: `600 13px ${UI}`,
        }}>
          {landed
            ? <svg width="15" height="15" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : '✕'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `400 16px/1.35 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>
            {landed ? 'It landed' : 'It didn’t land'}
            <span style={{ color: 'var(--nv-ink60)' }}> · {q.name}</span>
          </div>
          {q.note && <div style={{ marginTop: '4px', font: `italic 400 14px/1.45 ${S}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>“{q.note}”</div>}
          <Meta tone="faint" as="div" style={{ marginTop: '6px' }}>Logged to your Repertoire</Meta>
        </div>
        <TextAction tone="faint" compact onClick={q.change}>Change</TextAction>
      </div>
    );
  }

  const busy = q.tick !== 'idle';
  return (
    <div style={{ ...edge, minWidth: 0 }}>
      {label && <Eyebrow as="div" tone="var(--nv-mg)">Today’s technique</Eyebrow>}
      <div style={{ marginTop: label ? '6px' : 0, font: `400 18px/1.3 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>
        Did <em style={{ color: 'var(--nv-mg)' }}>{q.name}</em> land?
      </div>
      {q.tell && (
        <div style={{ marginTop: '5px', font: `450 12.5px/1.5 ${UI}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>
          <span style={{ font: `600 12.5px ${UI}`, color: 'var(--nv-ink)' }}>The tell. </span>{q.tell}
        </div>
      )}
      {/* 16px, or iOS zooms the page when he taps in */}
      <input value={q.draft} onChange={q.setDraft} placeholder="What happened? (optional)" aria-label="What happened"
        disabled={busy}
        style={{
          marginTop: '11px', width: '100%', boxSizing: 'border-box', minWidth: 0,
          background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
          borderRadius: '11px', padding: '10px 12px', font: `450 16px ${UI}`, color: 'var(--nv-ink)', outline: 'none',
        }} />
      <div style={{ marginTop: '11px', display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
        <TickButton state={q.tick} onClick={q.landed} label="It landed" ariaLabel={`It landed: ${q.name}`} />
        {/* the other answers step back while the tick is being made */}
        <span style={{ display: 'contents' }}>
          <Interactive as="button" type="button" onClick={busy ? undefined : q.missed} haptic={busy ? undefined : 'tick'}
            aria-label={`It didn’t land: ${q.name}`}
            base={{
              display: 'inline-flex', alignItems: 'center', gap: '7px', minHeight: '44px', padding: '0 18px', borderRadius: '999px',
              border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)',
              color: 'var(--nv-ink)', font: `600 15px ${UI}`, cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.35 : 1, transition: 'opacity var(--nv-dur-fast) var(--nv-ease)',
            }}
            activeStyle={busy ? undefined : { transform: 'scale(.96)' }}>
            <span aria-hidden="true" style={{ color: 'var(--nv-ink60)' }}>✕</span>Didn’t land
          </Interactive>
          {!busy && <TextAction tone="faint" onClick={q.notTried}>Didn’t try it</TextAction>}
        </span>
      </div>
    </div>
  );
}
