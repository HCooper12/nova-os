import { useLayoutEffect, useRef, useState } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { haptic } from './haptics.js';

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
//   <Button>        the committing action — one shape, one accent, everywhere
//   <Tag>           a non-tappable badge (a route, a muscle, a kind)
//   <Meta>          secondary information — a time, a source, a count
//   <ScreenHead>    the screen's identity row — numeral · rule · label in
//                   Command; the label alone, as an iOS group header, in Apple
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
  // READABLE-FAINT. `faint` used to be --nv-ink40 (alpha .38), which is
  // 3.16:1 on the cupertino pane — Meta renders at 12.5px/500, so it needed
  // 4.5:1 and was the quietest tier of text in the app across 256 call
  // sites. --nv-ink50 is the same tier drawn at the contrast floor (4.6-4.8:1
  // in every theme), so the three-step ladder survives: faint / quiet / ink.
  // --nv-ink40 stays for what it is actually safe for: hairlines and glyphs.
  faint: 'var(--nv-ink50)',
  ink: 'var(--nv-ink)',
};
const tone = (t) => TONES[t] || t || TONES.quiet;

// A section heading. iOS sets grouped-list headers in small caps too, so
// both styles agree on the case — only face, size and tracking differ.
export function Eyebrow({ children, tone: t = 'faint', style, as: Tag = 'div', ...rest }) {
  const apple = isAppleStyle();
  return (
    <Tag {...rest} style={{
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
export function TextAction({ children, onClick, tone: t = 'accent', disabled, compact, style, ariaLabel, title, haptic = 'tick' }) {
  const apple = isAppleStyle();
  const color = disabled ? 'var(--nv-ink40)' : tone(t);
  return (
    <Interactive as="span" onClick={disabled ? undefined : onClick} aria-label={ariaLabel} title={title}
      base={{
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // 44pt on the full mark (accessibility.md › Controls). `compact` stays
        // at 32 on purpose: it is a pair of marks inside a list row, it clears
        // the 28pt floor, and 44 there would squeeze the row's title again.
        minHeight: apple ? (compact ? '32px' : '44px') : (compact ? '26px' : '32px'),
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
     haptic={disabled ? undefined : haptic}>{children}</Interactive>
  );
}

// A tappable pill in a tint. No outline: the fill IS the shape, like an iOS
// filter chip. `active` deepens the tint.
export function Chip({ children, onClick, tone: t = 'accent', active, disabled, style, ariaLabel, title, haptic = 'tick' }) {
  const apple = isAppleStyle();
  const color = tone(t);
  return (
    <Interactive as="span" onClick={disabled ? undefined : onClick} aria-label={ariaLabel} title={title}
      haptic={disabled || !onClick ? undefined : haptic}
      base={{
        // no handler of its own means a parent Interactive owns the tap — so
        // the cursor is inherited rather than reset to an arrow over it
        cursor: disabled ? 'default' : (onClick ? 'pointer' : undefined),
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        // A LONG LABEL WRAPS INSTEAD OF LEAVING THE SCREEN. His Coach
        // suggestions run to a full sentence — "WHY IS ROPE OVERHEAD TRICEP
        // EXTENSION STALLED" — and a pill with nowhere to break ran off the
        // right edge of his phone, unreadable and untappable at the end.
        maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left',
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
        // `whiteSpace: 'nowrap'` used to sit here and silently overrode the
        // `normal` set above — a duplicate key, so the long-label wrap the
        // comment promises has never actually worked. It showed up on the
        // Library detail as "…missing from raw/" cut off mid-word at 375.
        minWidth: 0,
        overflowWrap: 'anywhere',
        ...(style || {}),
      }}
      hoverStyle={{ filter: 'brightness(1.12)' }}
    >{children}</Interactive>
  );
}

// THE COMMITTING ACTION. One shape, one accent, in every screen.
//
// The aesthetic review, 22 Sep 2026, found `btn(bg, ink, extra)` hand-rolled
// in FOURTEEN files and already diverged — Train's was 11px/20px at radius
// 12, Shopping's 10px/18px at radius 8 — so one Settings viewport showed
// three different button shapes. Worse, sixteen of those call sites filled
// themselves with `--nv-gold`, which §2b rule 8 reserves for "not yet
// decided": the colour that is supposed to mean "your call" was the default
// commit colour on nine screens at once, and so meant nothing.
//
// So: the fill is `tone`, and the default is the theme's own accent. Gold is
// reachable — `tone="undecided"` — but it has to be ASKED for, and it should
// only be asked for by a proposal genuinely waiting on him.
//
// `variant="quiet"` is the same shape drawn as an outline, for the secondary
// action standing beside a commit (Cancel, Test connection).
//
// The ink on a solid fill is `--nv-on-acc`, never a hardcoded hex: the tones
// are bright on the dark ground and dark under Daylight, and that token is
// what flips with them. Sixteen call sites had `#1a1322` baked in, which is
// black text on a dark-gold button in Daylight.
//
// 44pt tall under Apple — the target he reaches for one-handed, the same
// floor `Pill` already holds.
export function Button({ children, onClick, tone: t = 'accent', variant = 'solid',
  compact, disabled, style, ariaLabel, title, haptic: hapticWord = 'tick', as = 'span' }) {
  const apple = isAppleStyle();
  const color = tone(t === 'undecided' ? 'gold' : t);
  const solid = variant === 'solid';
  return (
    <Interactive as={as} onClick={disabled ? undefined : onClick} aria-label={ariaLabel} title={title}
      haptic={disabled || !onClick ? undefined : hapticWord}
      base={{
        cursor: disabled || !onClick ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        // a label that outgrows its row wraps rather than leaving the screen,
        // the lesson Chip already paid for
        maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center', minWidth: 0,
        minHeight: compact ? (apple ? '36px' : '28px') : (apple ? '44px' : '34px'),
        padding: compact ? (apple ? '9px 16px' : '7px 14px') : (apple ? '11px 20px' : '10px 18px'),
        borderRadius: apple ? '999px' : '12px',
        font: apple ? `600 ${compact ? '14' : '15'}px ${UI}` : `600 12px ${M}`,
        letterSpacing: apple ? '-.01em' : '.14em',
        textTransform: apple ? 'none' : 'uppercase',
        background: solid ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
        color: solid ? 'var(--nv-on-acc)' : color,
        border: solid ? '1px solid transparent' : `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
        opacity: disabled ? 0.55 : 1,
        ...(style || {}),
      }}
      hoverStyle={{ filter: 'brightness(1.1)' }}
    >{children}</Interactive>
  );
}

// A badge that is read, not tapped — a route, a kind, a muscle. Small caps in
// both styles; the Apple size is what iOS uses for a list badge.
export function Tag({ children, tone: t = 'faint', hue, dashed, style, title, ...rest }) {
  const apple = isAppleStyle();
  const color = hue ? `rgb(${hue})` : tone(t);
  const bg = hue ? `rgba(${hue},.10)` : `color-mix(in srgb, ${color} 10%, transparent)`;
  return (
    <span {...rest} title={title} style={{
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
export function Meta({ children, tone: t = 'quiet', style, as: TagName = 'span', ...rest }) {
  const apple = isAppleStyle();
  return (
    <TagName {...rest} style={{
      font: apple ? `500 12.5px ${UI}` : `500 9px ${M}`,
      letterSpacing: apple ? '0' : '.14em',
      textTransform: apple ? 'none' : 'uppercase',
      fontVariantNumeric: 'tabular-nums',
      color: tone(t),
      ...(style || {}),
    }}>{children}</TagName>
  );
}

// The identity row at the top of every classic screen. Command reads it as a
// console section (roman numeral, hairline, tracked caps); the Apple styles
// drop the numeral and the rule — a numbered section is the console's idiom,
// not iOS's — and keep the label as a grouped-list header. Children sit
// after the label (Voice puts its status badge there).
export function ScreenHead({ numeral, label, children, style }) {
  const apple = isAppleStyle();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: apple ? '10px' : '14px', flexWrap: 'wrap', ...(style || {}) }}>
      {!apple && <span style={{ font: `500 11px ${M}`, letterSpacing: '.14em', color: 'var(--nv-acc)' }}>{numeral}</span>}
      {!apple && <span style={{ width: '50px', height: '1px', background: 'linear-gradient(90deg,var(--nv-acc-border),transparent)' }} />}
      <Eyebrow as="span" tone="color-mix(in srgb, var(--nv-ink) 55%, transparent)" style={apple ? { fontSize: '12.5px' } : { letterSpacing: '.2em' }}>{label}</Eyebrow>
      {children}
    </div>
  );
}

// The segmented pair (DECK | LIST, and the Train tabs): one control, not two
// bordered words.
//
// THE ACTIVE STATE SLIDES (17 Sep 2026). It used to be a `background` on
// whichever item was selected, so changing tab was an instant swap — he
// filmed it: Today, Gym, Coach, three hard cuts, and called it "just pops up".
// This is the control he touches most, so it is the highest-leverage motion in
// the app.
//
// THE TECHNIQUE IS A CLIPPED DUPLICATE, not a sliding pill behind the text.
// The whole row is rendered twice: once inactive, once entirely in the active
// style, and the active copy is clipped to just the selected item. Moving the
// clip moves the highlight AND the text colour in perfect sync, because they
// are one element being revealed rather than two values being interpolated on
// separate timings — which, per the animate skill, "never quite lands".
//
// The clip is measured in pixels rather than computed as a percentage: items
// only share a width when `stretch` is set, and a percentage would drift on
// every content-sized row in the app.
function segItemStyle(apple, stretch, on) {
  return {
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: stretch ? 1 : 'none',
    // a full-width segmented control is 44pt on iOS; a content-sized one sits
    // in denser company and takes 34, still clear of the 28pt floor
    minHeight: apple ? (stretch ? '44px' : '34px') : '24px', padding: apple ? '4px 12px' : '3px 9px',
    borderRadius: apple ? '8px' : '6px',
    font: apple ? `600 13px ${UI}` : `600 8.5px ${M}`,
    letterSpacing: apple ? '0' : '.14em',
    textTransform: apple ? 'none' : 'uppercase',
    whiteSpace: 'nowrap',
    color: on ? 'var(--nv-ink)' : 'var(--nv-ink40)',
    background: on ? (apple ? 'color-mix(in srgb, var(--nv-ink) 14%, transparent)' : 'var(--nv-acc-bg)') : 'transparent',
    boxShadow: on && apple ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
  };
}

export function Segmented({ options, value, onChange, ariaLabel, stretch }) {
  const apple = isAppleStyle();
  const listRef = useRef(null);
  const [clip, setClip] = useState(null);
  // The first measurement must NOT animate, or the highlight slides in from
  // the left edge on every mount. It transitions only once it has a prior
  // position to travel from.
  const settled = useRef(false);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const active = el.querySelector('[data-seg-active="1"]');
    if (!active) { setClip(null); return; }
    const l = el.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (!l.width || !a.width) return;   // not laid out yet; a later pass gets it
    const radius = apple ? 8 : 6;
    setClip(`inset(0 ${Math.max(0, l.right - a.right)}px 0 ${Math.max(0, a.left - l.left)}px round ${radius}px)`);
    settled.current = true;
  }, [value, options, apple, stretch]);

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const railStyle = css(`position:relative;display:${stretch ? 'flex' : 'inline-flex'};gap:2px;padding:2px;border-radius:${apple ? '10px' : '8px'};background:color-mix(in srgb, var(--nv-ink) ${apple ? '9%' : '6%'}, transparent)`);

  return (
    <span ref={listRef} role="tablist" aria-label={ariaLabel} style={railStyle}>
      {options.map(([val, label]) => (
        <Interactive key={val} as="span" role="tab" aria-selected={val === value}
          data-seg-active={val === value ? '1' : '0'}
          onClick={() => { if (val !== value) haptic('tick'); onChange(val); }}
          base={segItemStyle(apple, stretch, false)}
          hoverStyle={{ color: 'var(--nv-ink)' }}
        >{label}</Interactive>
      ))}
      {/* The active copy. aria-hidden and inert to the pointer — the real tabs
          underneath keep every role, every label and every tap. */}
      {clip && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: '2px', left: '2px', right: '2px', bottom: '2px',
          display: 'flex', gap: '2px', pointerEvents: 'none',
          clipPath: clip, WebkitClipPath: clip,
          transition: reduced || !settled.current ? 'none' : 'clip-path 260ms var(--nv-ease), -webkit-clip-path 260ms var(--nv-ease)',
        }}>
          {options.map(([val, label]) => (
            <span key={val} style={segItemStyle(apple, stretch, true)}>{label}</span>
          ))}
        </span>
      )}
    </span>
  );
}

// PHOTOS AND VIDEOS WITH A QUESTION (his ask, 6 Sep 2026): a picker beside
// the composer, thumbnails of what will ride with the next question, and a
// way to drop one. The same list feeds Nova's composer and the Coach's.
export function AttachStrip({ attach, tone = 'cyan' }) {
  if (!attach) return null;
  const inputId = `nv-attach-${tone}`;
  return (
    <>
      <label htmlFor={inputId} title="Attach photos or a short video to your question"
        style={{ cursor: 'pointer', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: isAppleStyle() ? '40px' : '34px', height: isAppleStyle() ? '40px' : '34px', borderRadius: '999px', background: `color-mix(in srgb, var(--nv-${tone === 'gold' ? 'gold' : 'cy'}) 12%, transparent)`, color: `var(--nv-${tone === 'gold' ? 'gold' : 'cy'})`, opacity: attach.busy ? .6 : 1 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.5 12.6 21a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5"/></svg>
        <input id={inputId} type="file" accept="image/*,video/*" multiple onChange={(e) => { attach.pick(e.target.files); e.target.value = ''; }} disabled={attach.busy} style={{ display: 'none' }} />
      </label>
    </>
  );
}
export function AttachPending({ attach }) {
  if (!attach?.pending?.length) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
      {attach.pending.map((p, i) => (
        <span key={i} style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '10px', overflow: 'hidden', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title={p.name}>
          {p.thumb ? <img src={p.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Meta tone="faint">video</Meta>}
          <span onClick={p.remove} style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '6px', background: 'rgba(0,0,0,.65)', color: '#fff', font: '600 12px/18px var(--nv-font-ui)', textAlign: 'center', cursor: 'pointer' }}>×</span>
        </span>
      ))}
      <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>rides with your next question</Meta>
    </div>
  );
}
