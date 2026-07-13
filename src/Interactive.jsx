import { useState } from 'react';
import { css } from './css.js';

// The original design used `style-hover` / `style-focus` attributes (a Design
// Canvas-only feature) to patch inline styles on :hover/:focus. This is the
// real-DOM equivalent: track hover/focus in state and merge the delta style in.
export function Interactive({ as: Tag = 'div', base, hoverStyle, focusStyle, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const b = typeof base === 'string' ? css(base) : base || {};
  const hs = hoverStyle ? (typeof hoverStyle === 'string' ? css(hoverStyle) : hoverStyle) : {};
  const fs = focusStyle ? (typeof focusStyle === 'string' ? css(focusStyle) : focusStyle) : {};
  const style = { ...b, ...(hover ? hs : {}), ...(focus ? fs : {}) };
  return (
    <Tag
      style={style}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      {...rest}
    />
  );
}
