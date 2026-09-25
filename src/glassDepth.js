// THE RAIL HAS DEPTH (25 Sep 2026). A spent panel is one step further back
// for every step down the rail: smaller, dimmer, and it settles into that
// depth from the front when it arrives (nvGlassRecede, index.css). Plain
// scale and opacity, no perspective: a 3D transform inside a scrolling row
// fights the scroll on iOS, and at 375px the eye reads scale as distance.
// `column` is the desktop history stack, which recedes the same way but
// keeps its full width.
export function railDepth(i, axis = 'row') {
  const step = Math.min(i, 4);
  return {
    flex: '0 0 auto',
    ...(axis === 'row' ? { width: '146px' } : {}),
    opacity: Math.max(0.36, 0.92 - step * 0.14),
    transform: `scale(${(1 - step * 0.045).toFixed(3)}) translateY(${step * 2}px)`,
    transformOrigin: '50% 100%',
    animation: 'nvGlassRecede var(--nv-dur-slow) var(--nv-ease) both',
  };
}
