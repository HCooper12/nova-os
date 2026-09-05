import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// THE CONTROL VOCABULARY — five small words the daily screens are set in.
//
// His report, 5 Sep 2026: "Nova still feels stiff to use." Measured: five of
// every six type declarations in the app were the tracked, uppercase, 8–10px
// monospace micro-label — and those labels doubled as the tap targets. That
// is the visual language of an instrument panel: something you operate, not
// something you talk to. It was also mine; I had been adding more of it all
// day.
//
// These primitives make the label a MATERIAL decision, the way fonts and
// radius already are (see the design-style blocks in index.css). Under the
// Apple styles the same words are set in the UI face, sentence case, at a
// size a thumb can hit; under Command they keep the console idiom. Screens
// write the label ONCE, in sentence case, and the style decides how it looks
// — so the console never comes back by accident, and Command is not broken
// by the fix.
//
//   <Eyebrow>       a section heading — small caps in both styles (iOS does this)
//   <TextAction>    a tappable word or phrase — text-only, 44pt hit area
//   <Chip>          a tappable pill in a tint — chips wrap, so they stay short
//   <Tag>           a non-tappable badge (a route, a muscle, a kind)
//   <Meta>          secondary information — a time, a source, a count
//
// Numbers and receipts stay monospace everywhere: tabular digits are what
// the mono face is FOR.

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';

// The style is stamped on <html> before first paint (theme.js). Read live so
// a style change in Settings — which re-renders the whole app — restyles
// every control in the same pass. No React state: this never changes without
// a re-render of its own.
export function isAppleStyle() {
  if (typeof document === 'undefined') return false;
  const s = document.documentElement.getAttribute('data-nv-style');
  return s === 'apple' || s === 'cupertino';
}

const TONES = {
  accent: 'var(--nv-acc)',
  gold: 'var(--nv-gold)',
  cyan: 'var(--nv-cy)',
  warn: 'var(--nv-warn)',
  good: 'var(--nv-good)',
  violet: 'var(--nv-vi)',
  quiet: 'var(--nv-ink60)',
  faint: 'var(--nv-ink40)',
  ink: 'var(--nv-ink)',
};
const tone = (t) => TONES[t] || t || TONES.quiet;

// A section heading. iOS sets grouped-list headers in small caps too, so
// both styles agree on the case — only face, size and tracking differ.
export function Eyebrow({ children, tone: t = 'faint', style, as: Tag = 'div' }) {
  const apple = isAppleStyle();
  return (
    <Tag style={{
      font: apple ? `600 12px ${UI}` : `500 9.5px ${M}`,
      letterSpacing: apple ? '.05em' : '.22em',
      textTransform: 'uppercase',
      color: tone(t),
      ...(style || {}),
    }}>{children}</Tag>
  );
}

// A tappable word or phrase. Written in sentence case; Command uppercases it.
// The hit area is 40px tall regardless of how short the word is — the words
// used to BE the target, at 8.5px.
// `compact` is for a pair of marks INSIDE a list row (Done · Skip), where the
// full 15px/40px control squeezed the row's title into a narrow column.
export function TextAction({ children, onClick, tone: t = 'accent', disabled, compact, style, ariaLabel, title }) {
  const apple = isAppleStyle();
  const color = disabled ? 'var(--nv-ink40)' : tone(t);
  return (
    <Interactive as="span" onClick={disabled ? undefined : onClick} aria-label={ariaLabel} title={title}
      base={{
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minHeight: apple ? (compact ? '32px' : '40px') : (compact ? '26px' : '32px'),
        padding: apple ? (compact ? '5px 8px' : '8px 12px') : (compact ? '3px 7px' : '6px 10px'),
        margin: apple && !compact ? '-4px -4px' : 0,
        borderRadius: '10px',
        font: apple ? `600 ${compact ? '13px' : '15px'} ${UI}` : `600 ${compact ? '9px' : '9.5px'} ${M}`,
        letterSpacing: apple ? '-.01em' : '.14em',
        textTransform: apple ? 'none' : 'uppercase',
        color,
        border: apple ? '1px solid transparent' : `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        ...(style || {}),
      }}
      hoverStyle={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >{children}</Interactive>
  );
}

// A tappable pill in a tint. No outline: the fill IS the shape, like an iOS
// filter chip. `active` deepens the tint.
export function Chip({ children, onClick, tone: t = 'accent', active, disabled, style, ariaLabel, title }) {
  const apple = isAppleStyle();
  const color = tone(t);
  return (
    <Interactive as="span" onClick={disabled ? undefined : onClick} aria-label={ariaLabel} title={title}
      base={{
        cursor: disabled || !onClick ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        minHeight: apple ? '34px' : '26px',
        padding: apple ? '6px 13px' : '4px 9px',
        borderRadius: '999px',
        font: apple ? `600 13.5px ${UI}` : `600 8.5px ${M}`,
        letterSpacing: apple ? '0' : '.14em',
        textTransform: apple ? 'none' : 'uppercase',
        color: active ? (apple ? '#0b1016' : color) : color,
        background: active
          ? (apple ? color : `color-mix(in srgb, ${color} 22%, transparent)`)
          : `color-mix(in srgb, ${color} ${apple ? '14%' : '8%'}, transparent)`,
        border: apple ? '1px solid transparent' : `1px solid color-mix(in srgb, ${color} ${active ? '70%' : '35%'}, transparent)`,
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        ...(style || {}),
      }}
      hoverStyle={{ filter: 'brightness(1.12)' }}
    >{children}</Interactive>
  );
}

// A badge that is read, not tapped — a route, a kind, a muscle. Small caps in
// both styles; the Apple size is what iOS uses for a list badge.
export function Tag({ children, tone: t = 'faint', hue, dashed, style, title }) {
  const apple = isAppleStyle();
  const color = hue ? `rgb(${hue})` : tone(t);
  const bg = hue ? `rgba(${hue},.10)` : `color-mix(in srgb, ${color} 10%, transparent)`;
  return (
    <span title={title} style={{
      display: 'inline-block',
      font: apple ? `600 11px ${UI}` : `600 8.5px ${M}`,
      letterSpacing: apple ? '.04em' : '.14em',
      textTransform: 'uppercase',
      padding: apple ? '3px 8px' : '2px 7px',
      borderRadius: apple ? '6px' : '5px',
      color,
      background: bg,
      border: apple ? '1px solid transparent' : `1px ${dashed ? 'dashed' : 'solid'} color-mix(in srgb, ${color} 35%, transparent)`,
      whiteSpace: 'nowrap',
      ...(style || {}),
    }}>{children}</span>
  );
}

// Secondary information: a time, a source, a count of what is left. Sentence
// case under Apple; digits tabular in both.
export function Meta({ children, tone: t = 'quiet', style, as: TagName = 'span' }) {
  const apple = isAppleStyle();
  return (
    <TagName style={{
      font: apple ? `500 12.5px ${UI}` : `500 9px ${M}`,
      letterSpacing: apple ? '0' : '.14em',
      textTransform: apple ? 'none' : 'uppercase',
      fontVariantNumeric: 'tabular-nums',
      color: tone(t),
      ...(style || {}),
    }}>{children}</TagName>
  );
}

// The segmented pair (DECK | LIST, and the Train tabs): one control, not two
// bordered words.
export function Segmented({ options, value, onChange, ariaLabel, stretch }) {
  const apple = isAppleStyle();
  return (
    <span role="tablist" aria-label={ariaLabel} style={css(`display:${stretch ? 'flex' : 'inline-flex'};gap:2px;padding:2px;border-radius:${apple ? '10px' : '8px'};background:color-mix(in srgb, var(--nv-ink) ${apple ? '9%' : '6%'}, transparent)`)}>
      {options.map(([val, label]) => {
        const on = val === value;
        return (
          <Interactive key={val} as="span" role="tab" aria-selected={on} onClick={() => onChange(val)}
            base={{
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: stretch ? 1 : 'none',
              minHeight: apple ? (stretch ? '36px' : '30px') : '24px', padding: apple ? '4px 12px' : '3px 9px',
              borderRadius: apple ? '8px' : '6px',
              font: apple ? `600 13px ${UI}` : `600 8.5px ${M}`,
              letterSpacing: apple ? '0' : '.14em',
              textTransform: apple ? 'none' : 'uppercase',
              color: on ? 'var(--nv-ink)' : 'var(--nv-ink40)',
              background: on ? (apple ? 'color-mix(in srgb, var(--nv-ink) 14%, transparent)' : 'var(--nv-acc-bg)') : 'transparent',
              boxShadow: on && apple ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
            }}
            hoverStyle={{ color: 'var(--nv-ink)' }}
          >{label}</Interactive>
        );
      })}
    </span>
  );
}
