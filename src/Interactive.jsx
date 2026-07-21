import { useState } from 'react';
import { css } from './css.js';

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
const DEFAULT_FOCUS = { outline: '2px solid var(--nv-acc-border)', outlineOffset: '2px' };

export function Interactive({ as: Tag = 'div', base, hoverStyle, activeStyle, focusStyle, onPointerDown, onPointerUp, onPointerCancel, onPointerEnter, onPointerLeave, onFocus, onBlur, onClick, onKeyDown, ...rest }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const [focus, setFocus] = useState(false);
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
  const style = { ...b, ...(hover ? hs : {}), ...(active ? as_ : {}), ...(focus ? fs : {}) };
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
  return (
    <Tag
      style={style}
      onClick={onClick}
      onPointerDown={(e) => { setActive(true); onPointerDown?.(e); }}
      onPointerUp={(e) => { setActive(false); onPointerUp?.(e); }}
      onPointerCancel={(e) => { setActive(false); onPointerCancel?.(e); }}
      // hover is a mouse-only affordance — never let touch set it (that's what stuck)
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); onPointerEnter?.(e); }}
      onPointerLeave={(e) => { setHover(false); setActive(false); onPointerLeave?.(e); }}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      {...a11y}
      {...rest}
    />
  );
}
