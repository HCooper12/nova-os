// CONCENTRIC CORNERS, for the places that compute a radius in JS.
//
// Apple's ConcentricRectangle rule (iOS 26 HIG): a shape nested inside a
// rounded shape takes `outer − gap`, so the two corners share a centre point.
// index.css has the CSS form (`.nv-inner`) and the note on why the arithmetic
// cannot be hoisted into a single :root custom property; this is the same
// rule for code that is already building a style object.
//
// The clamp matters: a child inset further than the parent's radius is past
// the end of the corner arc, where the parent's curve has already finished.
// Its own corner is then visually independent — squaring it off is what the
// geometry says, and `concentricApplies` is how a caller asks whether the
// rule is even relevant before obeying it.
export function concentric(outerRadius, gap) {
  const o = Number(outerRadius) || 0;
  const g = Number(gap) || 0;
  return Math.max(0, o - g);
}

// True while the child still sits inside the parent's corner arc. Outside it,
// matching radii is not a rule, and forcing one is how a deliberate pill
// inside a card gets flattened for no reason.
export function concentricApplies(outerRadius, gap) {
  const o = Number(outerRadius) || 0;
  const g = Number(gap) || 0;
  return g >= 0 && g < o;
}

export function concentricPx(outerRadius, gap) {
  return `${concentric(outerRadius, gap)}px`;
}
