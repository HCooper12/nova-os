import { useOptionPager } from './swipeAction.js';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { glowPanel } from './glowPanel.js';

// THE LEADER BOX — one slot, two faces, his swipe.
//
// His instruction, 15 Sep: the Leader had drifted from general leadership
// advice into one running situation, and "I like both ideas so turn that box on
// home into a swipe capable box I can smoothly swipe between to change the view
// of what's being displayed (so leader is capable of both)."
//
// So neither face wins the slot:
//   LEAD      — the day's leadership idea, back to being about the craft.
//   SITUATION — the live thread, how long since he last said anything about it,
//               and the one question Nova needs answered to be current.
//
// The gesture is `useOptionPager`, the same primitive the rotation strip uses,
// for the reason written up in swipeAction.js: direction is locked ONCE on the
// first real movement, and a vertical verdict is final. That is what stops a
// swipe hijacking the page scroll on a card sitting in the middle of Home.
//
// ONE component, both idioms. The screens differ in their furniture (the Apple
// twin's grouped card, Command's bracketed frame), so `variant` swaps the
// chrome — but the gesture, the faces and the dots live here once.

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

// The situation face earns a colour of its own: it is not the day's idea, and
// a stale one is a question outstanding rather than a warning.
const ACCENT = { lead: '--nv-gold', situation: '--nv-vi' };

function Dots({ box }) {
  if (box.count < 2) return null;
  return (
    <div style={css('display:flex;gap:6px;align-items:center')}>
      {box.faces.map((f, i) => (
        <Interactive
          key={f.key}
          as="span"
          onClick={() => box.select(i)}
          aria-label={`Show ${f.label}`}
          base={{
            cursor: 'pointer', width: i === box.index ? '18px' : '6px', height: '6px', borderRadius: '999px',
            background: i === box.index ? `var(${ACCENT[box.face.key] || '--nv-cy'})` : 'color-mix(in srgb, var(--nv-ink) 22%, transparent)',
            transition: 'width var(--nv-dur-fast) var(--nv-ease), background var(--nv-dur-fast) var(--nv-ease)',
          }}
          hoverStyle={{ background: 'var(--nv-ink60)' }}
        />
      ))}
    </div>
  );
}

export function LeaderBox({ box, variant = 'apple', mob = false }) {
  // Hooks run unconditionally — useOptionPager itself returns an inert shape
  // when there is nothing to page between.
  const pager = useOptionPager({ onNext: box?.next || undefined, onPrev: box?.prev || undefined, enabled: !!(box && box.count > 1) });
  if (!box) return null;

  const face = box.face;
  const accent = ACCENT[face.key] || '--nv-cy';
  const apple = variant === 'apple';

  const head = (
    <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
      <span style={apple
        ? { font: `600 10.5px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: `var(${accent})` }
        : { font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', color: `var(${accent})`, textTransform: 'uppercase' }}
      >{face.label}</span>
      <div style={css('display:flex;align-items:center;gap:10px')}>
        <span style={{ font: apple ? `600 10px ${M}` : 'var(--nv-micro-s)', letterSpacing: '.1em', color: 'var(--nv-ink60)', textTransform: 'uppercase' }}>{face.chip}</span>
        <Dots box={box} />
      </div>
    </div>
  );

  // `touchAction: pan-y` is the other half of the direction lock: the browser
  // keeps vertical scrolling for itself, so a swipe can never fight the page.
  const body = (
    <div ref={pager.ref} {...pager.handlers} style={{ touchAction: 'pan-y', marginTop: '9px', willChange: 'transform' }}>
      <div key={face.key} style={{ animation: 'fadeUp var(--nv-dur-fast) var(--nv-ease)' }}>
        <div style={{ font: apple ? `600 17px ${UI}` : `500 19px ${S}`, lineHeight: 1.25, color: 'var(--nv-ink)' }}>{face.title}</div>
        <p style={{ margin: '8px 0 0', font: `450 13.5px/1.55 ${UI}`, color: 'var(--nv-ink)' }}>{face.line}</p>
        {face.foot && <p style={{ margin: '7px 0 0', font: `450 12px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{face.foot}</p>}
        {face.question && (
          <div style={{ marginTop: '10px', padding: '11px 13px', borderRadius: apple ? '11px' : '9px', background: `color-mix(in srgb, var(${accent}) 09%, transparent)`, border: `1px solid color-mix(in srgb, var(${accent}) 22%, transparent)` }}>
            <div style={{ font: apple ? `600 10px ${M}` : 'var(--nv-micro-m)', letterSpacing: '.1em', color: `var(${accent})` }}>NOVA NEEDS TO KNOW</div>
            <div style={{ marginTop: '5px', font: `500 13.5px/1.5 ${UI}`, color: 'var(--nv-ink)' }}>{face.question}</div>
          </div>
        )}
      </div>
    </div>
  );

  const actions = (
    <div style={css('margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap')}>
      {face.question && (
        <Interactive as="span" onClick={box.answer}
          base={{ cursor: 'pointer', font: apple ? `600 13px ${UI}` : 'var(--nv-micro-m)', letterSpacing: apple ? '.01em' : 'var(--nv-micro-track)', padding: apple ? '9px 18px' : '8px 13px', borderRadius: apple ? '999px' : '7px', background: apple ? `var(${accent})` : 'transparent', color: apple ? 'var(--nv-on-acc)' : `var(${accent})`, border: apple ? '1px solid transparent' : `1px solid color-mix(in srgb, var(${accent}) 45%, transparent)` }}
          hoverStyle={apple ? { filter: 'brightness(1.08)' } : { background: `color-mix(in srgb, var(${accent}) 12%, transparent)` }}
        >{apple ? 'Tell Nova' : 'TELL NOVA'}</Interactive>
      )}
      <Interactive as="span" onClick={box.openLeader}
        base={{ cursor: 'pointer', font: apple ? `600 13px ${UI}` : 'var(--nv-micro-m)', letterSpacing: apple ? '.01em' : 'var(--nv-micro-track)', padding: apple ? '9px 18px' : '8px 13px', borderRadius: apple ? '999px' : '7px', background: apple ? 'rgba(255,255,255,.07)' : 'transparent', color: 'var(--nv-ink60)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)' }}
        hoverStyle={{ color: 'var(--nv-ink)' }}
      >{apple ? 'Open the Leader' : 'OPEN THE LEADER'}</Interactive>
    </div>
  );

  return (
    <section
      className="nv-glow"
      style={{
        marginTop: '18px',
        padding: mob ? '15px 16px 13px' : '18px 20px 16px',
        ...glowPanel(accent, { radius: apple ? '16px' : 'var(--nv-radius)' }).style,
      }}
    >
      {head}
      {body}
      {actions}
    </section>
  );
}
