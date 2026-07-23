import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// Grouped-layout primitives for the "Apple layout" (cupertino) style —
// iOS-style section groups and separated rows, drawn entirely through the
// token system so every theme's palette carries across. These are layout
// bones only: screens pass their existing view-model content through them,
// which is what guarantees nothing is lost between styles.

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';

// Section heading + inset card. label/trailing render OUTSIDE the card like
// iOS grouped-table headers; pass label={null} for a bare card.
export function Group({ label, trailing, children, style }) {
  return (
    <section style={{ marginTop: '18px', ...style }}>
      {(label || trailing) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', margin: '0 6px 7px' }}>
          {label ? <span style={{ font: `600 12px ${UI}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nv-ink40)' }}>{label}</span> : <span />}
          {trailing || null}
        </div>
      )}
      <div className="nv-pane" style={{ padding: '4px 0', overflow: 'hidden' }}>{children}</div>
    </section>
  );
}

// One grouped row: optional leading node, title/sub, optional trailing node.
// Rows separate with a hairline inset like iOS lists; tappable when onClick.
export function GRow({ leading, title, sub, trailing, onClick, first, children }) {
  return (
    <Interactive
      onClick={onClick}
      base={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', cursor: onClick ? 'pointer' : 'default',
        borderTop: first ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}
      hoverStyle={onClick ? { background: 'rgba(255,255,255,.04)' } : {}}
    >
      {leading != null && <span style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>{leading}</span>}
      {(title != null || sub != null) && (
        <span style={{ minWidth: 0, flex: 1 }}>
          {title != null && <span style={{ display: 'block', font: `550 15px ${UI}`, letterSpacing: '-.01em', color: 'var(--nv-ink)' }}>{title}</span>}
          {sub != null && <span style={{ display: 'block', marginTop: '1px', font: `400 12.5px ${UI}`, color: 'var(--nv-ink60)' }}>{sub}</span>}
        </span>
      )}
      {children}
      {trailing != null && <span style={{ flex: 'none', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>{trailing}</span>}
    </Interactive>
  );
}

// Small metric tile used inside a Group grid (BODY / vitals).
export function MetricTile({ m }) {
  return (
    <Interactive key={m.key} onClick={m.onOpen} base={{ cursor: m.onOpen ? 'pointer' : 'default', borderRadius: '12px', padding: '10px 12px' }} hoverStyle={m.onOpen ? { background: 'rgba(255,255,255,.04)' } : {}}>
      <div style={{ font: `600 10.5px ${UI}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{m.label}</div>
      <div style={{ font: `700 23px ${UI}`, letterSpacing: '-.02em', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: `var(${m.color})` }}>
        {m.value}{m.small ? <small style={{ fontSize: '12px', fontWeight: 600, color: 'var(--nv-ink40)', marginLeft: '2px' }}>{m.small}</small> : null}
      </div>
      <div style={{ font: `400 10px ${M}`, marginTop: '1px', letterSpacing: '.02em', color: 'var(--nv-ink40)' }}>{m.hint}</div>
    </Interactive>
  );
}

// Solid accent pill button (the Apple CTA look, in the theme's accent).
export function Pill({ label, onClick, tone = 'accent' }) {
  const solid = tone === 'accent';
  return (
    <Interactive as="span" onClick={onClick}
      base={{ cursor: 'pointer', display: 'inline-block', font: `600 13px ${UI}`, letterSpacing: '.01em', padding: '9px 18px', borderRadius: '999px',
        background: solid ? 'var(--nv-acc)' : 'rgba(255,255,255,.07)',
        color: solid ? '#0b1016' : 'var(--nv-ink)',
        border: solid ? '1px solid transparent' : '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)' }}
      hoverStyle={{ filter: 'brightness(1.1)' }}
    >{label}</Interactive>
  );
}
