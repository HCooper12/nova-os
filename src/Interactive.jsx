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
const DEFAULT_FOCUS = { outline: '2px solid rgba(107,229,245,.65)', outlineOffset: '2px' };

export function Interactive({ as: Tag = 'div', base, hoverStyle, focusStyle, onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, onKeyDown, ...rest }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const b = typeof base === 'string' ? css(base) : base || {};
  const hs = hoverStyle ? (typeof hoverStyle === 'string' ? css(hoverStyle) : hoverStyle) : {};
  const actsAsButton = !!onClick && !NATIVE_INTERACTIVE.has(Tag);
  const fs = focusStyle ? (typeof focusStyle === 'string' ? css(focusStyle) : focusStyle) : (actsAsButton ? DEFAULT_FOCUS : {});
  const style = { ...b, ...(hover ? hs : {}), ...(focus ? fs : {}) };
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
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      {...a11y}
      {...rest}
    />
  );
}
