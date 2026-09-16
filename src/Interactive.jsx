import { useRef, useState } from 'react';
import { css } from './css.js';
import { useLongPress } from './longPress.js';
import { haptic as fireHaptic, needsSwitchHaptic, switchHapticRef, SWITCH_HAPTIC_STYLE } from './haptics.js';

// The original design used `style-hover` / `style-focus` attributes (a Design
// Canvas-only feature) to patch inline styles on :hover/:focus. This is the
// real-DOM equivalent: track hover/focus in state and merge the delta style in.
//
// Accessibility: a clickable div/span is invisible to keyboards and screen
// readers, and this component wraps nearly every clickable in the app — so
// when onClick is present on a non-native-interactive tag it also gets
// role="button", a tab stop, Enter/Space activation, and a visible focus
// outline (unless the caller supplies its own focusStyle).
const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'label']);
// A VOID ELEMENT CANNOT TAKE CHILDREN. React throws outright — "input is a void
// element tag and must neither have children" — and with no root error boundary
// that unmounts the whole tree into a black screen. `Interactive as="input"` is
// used all through Fuel, Settings and Ops, so the haptic overlay added on
// 15 Sep black-screened every one of those screens the moment it shipped.
// Nothing in lint, build or 1615 tests could see it: it is a runtime throw on a
// screen none of them render.
// `textarea` is not void, but React refuses it children whenever `value` or
// `defaultValue` is set ("do not pass children") — and in React its content is
// always the value, never children. So it belongs in the same list: these tags
// get no children POSITION at all, not an empty one.
const NO_CHILDREN_TAGS = new Set([
  'input', 'img', 'br', 'hr', 'area', 'base', 'col', 'embed', 'link', 'meta', 'param', 'source', 'track', 'wbr',
  'textarea',
]);
const DEFAULT_FOCUS = { outline: '2px solid var(--nv-acc-border)', outlineOffset: '2px' };

// `haptic` is OPT-IN, one of the five words in haptics.js. Given one, this
// element answers the hand two ways at once:
//   - native shell / Android → the word is fired as a pattern, as before;
//   - iOS web → a TRANSPARENT system switch is laid over the element so his
//     own finger lands on it. That is the only path iOS still allows (26.5
//     closed the programmatic one), and it is why he has never felt anything:
//     Nova had no iOS path at all.
// Opt-in rather than automatic because the overlay needs the element to be a
// positioned ancestor, and quietly making ~300 wrappers into stacking contexts
// is not a change to make blind.
// A SCROLL MUST NOT BE A TAP (16 Sep 2026, reported mid-gym-session).
//
// The iOS haptic path lays a transparent NATIVE <input type="checkbox"> over
// the whole control, because a real form control is the only thing iOS 26.5
// will still fire the Taptic Engine for. That works — and a native form
// control does not honour the same scroll-versus-tap disambiguation a div
// does. Dragging a finger up the Train screen from a set row activated the
// checkbox at touch-end, and the click bubbles by design, so the set ticked.
// Focusing it also makes iOS scroll it into view, which is the "page jumping"
// half of the same report.
//
// So the overlay is armed on pointerdown and DISARMED the moment the finger
// travels past the slop radius: past that point the gesture is a scroll, and a
// scroll must reach the scroller untouched. Re-armed on the next press.
const SWITCH_SLOP_PX = 10;

export function Interactive({ as: Tag = 'div', base, hoverStyle, activeStyle, focusStyle, style: styleProp, onPointerDown, onPointerUp, onPointerCancel, onPointerEnter, onPointerLeave, onFocus, onBlur, onClick, onKeyDown, onLongPress, haptic: hapticWord, children, ...rest }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const [focus, setFocus] = useState(false);
  const pressAt = useRef(null);
  // spec #13: hold (or right-click) any Interactive for its secondary
  // actions — the hook composes with the pressed-state handlers below
  const lp = useLongPress(onLongPress);
  const b = typeof base === 'string' ? css(base) : base || {};
  const hs = hoverStyle ? (typeof hoverStyle === 'string' ? css(hoverStyle) : hoverStyle) : {};
  // A tap should show feedback the instant the finger lands. WebKit only
  // synthesizes mouseenter *after* touchend, so the old hover-only model gave
  // no press-down feedback and left hover stuck on the last-tapped element.
  // Pressed state is driven by pointerdown (fires immediately, unifies
  // mouse+touch) and defaults to the hover look so every button that had a
  // hover style now also has an instant pressed state.
  const as_ = activeStyle ? (typeof activeStyle === 'string' ? css(activeStyle) : activeStyle) : hs;
  const actsAsButton = !!onClick && !NATIVE_INTERACTIVE.has(Tag);
  const fs = focusStyle ? (typeof focusStyle === 'string' ? css(focusStyle) : focusStyle) : (actsAsButton ? DEFAULT_FOCUS : {});
  // an explicit style prop wins last — it carries one-off per-element needs
  // (a view-transition-name, say) that the base/hover cascade can't express
  // Press physics. Every clickable dips very slightly under the finger and
  // springs back — the difference between a page and a surface. Deliberately
  // subtle (2%) and skipped where the caller supplies its own activeStyle or
  // already animates transform, so nothing fights.
  const pressable = actsAsButton || !!onClick;
  const springs = pressable && !activeStyle;
  const motion = springs
    ? { transform: active ? 'scale(.978)' : 'scale(1)', transition: 'transform .16s cubic-bezier(.32,.72,0,1)' }
    : {};
  // the overlay is absolutely positioned, so the element has to be its
  // containing block — applied ONLY when a haptic word was asked for
  const voidTag = NO_CHILDREN_TAGS.has(Tag);
  const wantsSwitch = !voidTag && !!hapticWord && !!onClick && needsSwitchHaptic();
  const posFix = wantsSwitch ? { position: 'relative' } : {};
  const style = { ...b, ...posFix, ...motion, ...(hover ? hs : {}), ...(active ? as_ : {}), ...(focus ? fs : {}), ...(lp.style || {}), ...(styleProp || {}) };
  const a11y = actsAsButton
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
          onKeyDown?.(e);
        },
      }
    : { onKeyDown };
  // the overlay for THIS element — a per-element lookup, because the ref the
  // input carries is module-level and holds whichever mounted last
  const switchIn = (el) => (wantsSwitch && el ? el.querySelector('input[data-nv-haptic]') : null);
  const armSwitch = (el, on) => {
    const sw = switchIn(el);
    if (!sw) return;
    sw.disabled = !on;
    sw.style.pointerEvents = on ? '' : 'none';
  };
  const common = {
    style,
    onClick: onClick ? (e) => { if (hapticWord) fireHaptic(hapticWord); onClick(e); } : undefined,
    onClickCapture: lp.onClickCapture,
    onContextMenu: lp.onContextMenu,
    onPointerDown: (e) => {
      setActive(true);
      pressAt.current = { x: e.clientX, y: e.clientY };
      armSwitch(e.currentTarget, true);
      lp.onPointerDown?.(e); onPointerDown?.(e);
    },
    onPointerMove: (e) => {
      const p = pressAt.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SWITCH_SLOP_PX) {
        // this is a scroll now, not a press — get the form control out of the way
        armSwitch(e.currentTarget, false);
        pressAt.current = null;
      }
      lp.onPointerMove?.(e);
    },
    onPointerUp: (e) => { setActive(false); pressAt.current = null; lp.onPointerUp?.(e); onPointerUp?.(e); },
    onPointerCancel: (e) => { setActive(false); pressAt.current = null; armSwitch(e.currentTarget, false); lp.onPointerCancel?.(e); onPointerCancel?.(e); },
    // hover is a mouse-only affordance — never let touch set it (that's what stuck)
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') setHover(true); onPointerEnter?.(e); },
    onPointerLeave: (e) => { setHover(false); setActive(false); lp.onPointerLeave?.(e); onPointerLeave?.(e); },
    onFocus: (e) => { setFocus(true); onFocus?.(e); },
    onBlur: (e) => { setFocus(false); onBlur?.(e); },
    ...a11y,
    ...rest,
  };
  // A void tag is rendered WITHOUT a children position — not with an empty one.
  // `<Tag>{a}{b}</Tag>` hands React an array even when both are undefined, and
  // that is what throws.
  if (voidTag) return <Tag {...common} />;
  return (
    <Tag {...common}>
      {children}
      {wantsSwitch && (
        <input
          type="checkbox"
          data-nv-haptic=""
          ref={switchHapticRef}
          aria-hidden="true"
          tabIndex={-1}
          style={SWITCH_HAPTIC_STYLE}
          // NO stopPropagation and NO preventDefault. The tap has to land on
          // this control for iOS to fire the Taptic Engine, and it has to keep
          // bubbling for the element's own onClick to run — swallow it and
          // every button wearing one of these goes dead.
          onChange={() => {}}
        />
      )}
    </Tag>
  );
}
