import { css } from './css.js';

// GLASS, THE MATERIAL — the web answer to iOS 26's UIGlassEffect. The optics
// and every guard live in index.css under "LIQUID GLASS"; read that comment
// before changing a number here, and never put a url() inside a
// backdrop-filter (the reason is written there, and a test enforces it).
//
// This wrapper exists for the two things a class alone cannot carry: the
// accent a tinted surface bleeds (--nv-liquid-hue) and a one-off radius. Most
// call sites want neither and should just add className="nv-liquid".
const VARIANT = { regular: '', clear: 'nv-liquid-clear' };

export function liquidClass({ variant = 'regular', hue, flush } = {}) {
  return ['nv-liquid', VARIANT[variant] || '', hue ? 'nv-liquid-tinted' : '', flush ? 'nv-liquid-flush' : '']
    .filter(Boolean).join(' ');
}

export function LiquidGlass({ as: Tag = 'div', variant = 'regular', hue, flush, radius, className, style, children, ...rest }) {
  const vars = {};
  if (hue) vars['--nv-liquid-hue'] = hue;
  if (radius != null) vars['--nv-liquid-radius'] = typeof radius === 'number' ? `${radius}px` : radius;
  const merged = typeof style === 'string' ? css(style) : (style || {});
  return (
    <Tag className={[liquidClass({ variant, hue, flush }), className].filter(Boolean).join(' ')}
      style={{ ...vars, ...merged }} {...rest}>{children}</Tag>
  );
}
