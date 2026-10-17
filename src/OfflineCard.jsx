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
