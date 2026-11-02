import { Eyebrow } from './Controls.jsx';

// Banner blindness (mockup 102): the offline and slow-sync truth used to be a
// small pill above the tab bar, where the eye skips chrome and the sentence
// got cut off. On Home it is the first card in the feed, in the feed's own
// type, and says what still works. Shared by all three Home layouts.
export function OfflineCard({ c }) {
  if (!c) return null;
  const hue = c.tone === 'warn' ? 'var(--nv-warn)' : 'var(--nv-cy)';
  return (
    <section role="status" className="nv-deck-rise" style={{
      margin: '12px 0', padding: '14px 16px', borderRadius: 'var(--nv-radius)',
      border: `1px solid color-mix(in srgb, ${hue} 34%, transparent)`,
      background: `color-mix(in srgb, ${hue} 8%, var(--nv-glass))`,
    }}>
      <Eyebrow style={{ color: hue }}>{c.eyebrow}</Eyebrow>
      <div style={{ margin: '4px 0 2px', font: '600 17px var(--nv-font-ui)', color: 'var(--nv-ink)' }}>{c.title}</div>
      <div style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--nv-ink60)' }}>{c.body}</div>
      {c.works && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {c.works.map((w) => <span key={w} style={{ fontSize: '12px', padding: '4px 9px', borderRadius: '999px', background: 'color-mix(in srgb, var(--nv-ink) 6%, transparent)', color: 'var(--nv-ink80, var(--nv-ink))' }}>{w}</span>)}
        </div>
      )}
      {c.bar && (
        <div style={{ height: '6px', borderRadius: '3px', marginTop: '10px', overflow: 'hidden', background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' }}>
          <i style={{ display: 'block', height: '100%', width: `${Math.round((c.bar.ok / Math.max(1, c.bar.total)) * 100)}%`, background: hue, borderRadius: '3px', transition: 'width .5s var(--nv-ease)' }} />
        </div>
      )}
    </section>
  );
}

// THE QUIET OFFLINE MARK (offline mode, 2 Nov 2026): one line at the top of
// any screen that does not already say it in its own words. The dot is the
// warn hue because it means one thing only, "your Mac is out of reach"; the
// words say how old the page is. With writes waiting it is a button that
// opens the Outbox. Never a floating pill (banner blindness, his six laws).
export function OfflineMark({ m }) {
  if (!m) return null;
  const Tag = m.open ? 'button' : 'div';
  // The page moves down by the mark's own height (26px) and the mark sits
  // in the band just under the top bar, where every screen keeps its own
  // clearance (measured by scripts/offline-walk.mjs: the first line of each
  // screen starts at or below the mark's foot). It scrolls away with the
  // page, the way a note's date line does in Notes.
  return (
    <div style={{ position: 'relative', height: '26px', zIndex: 2 }}>
      <Tag type={m.open ? 'button' : undefined} role="status" onClick={m.open || undefined} className="nv-deck-rise nv-offline-mark"
        aria-label={m.waiting ? `${m.text}, ${m.waiting}. Open the Outbox` : m.text}
        style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 46px)', left: '18px', right: '18px',
          display: 'flex', alignItems: 'center', gap: '8px', height: '26px', padding: 0, margin: 0,
          background: 'none', border: 0, font: '500 12.5px var(--nv-font-ui)', color: 'var(--nv-ink60)',
          cursor: m.open ? 'pointer' : 'default', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
        <i aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--nv-warn)', flex: 'none' }} />
        <span>{m.text}</span>
        {m.waiting && <span style={{ color: 'var(--nv-gold)' }}>· {m.waiting} ›</span>}
      </Tag>
    </div>
  );
}
