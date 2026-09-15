// THE LIT PANEL — one treatment, many accents.
//
// His ask, 15 Sep: he liked the way the technique card sits on Home and wants
// that treatment on the other sections too — "but obviously keep the colour the
// same, so the daily review would have purple". So the look is a FUNCTION of the
// accent rather than five hand-tuned copies: a tinted hairline, a gradient that
// fades the accent into the pane's own glass, and a soft bloom behind it in the
// same colour.
//
// It takes a TOKEN NAME, never a literal. Every theme (command, observatory,
// ember, daylight) then recolours all five panels for free, and the rule that
// styles never touch the palette keeps holding.
//
// The bloom is a CSS class, not an inline shadow, for one reason: Calm has to be
// able to switch it off. `.nv-glow` reads --nv-glow-tint, which this sets, and
// the calm block zeroes the shadow — as a zero-size shadow rather than `none`,
// the house rule, since a `none` inside a comma-separated list would invalidate
// the whole declaration if one is ever added here.
//
// Motion comes from the tokens (--nv-dur-base / --nv-ease) per the motion
// contract; the delay, if a caller ever wants one, belongs INSIDE the shorthand.

const tint = (accent, pct) => `color-mix(in srgb, var(${accent}) ${pct}%, transparent)`;

/**
 * @param accent a --nv-* token NAME, e.g. '--nv-mg'
 * @param edge   hairline strength. The default suits a "moment" card that is
 *               meant to announce itself; `soft` suits a standing container
 *               (an AppleLayout Group) which should be lit, not outlined.
 */
export function glowPanel(accent, { radius = 'var(--nv-radius)', edge = 30, bloom = 55, animate = true } = {}) {
  return {
    className: 'nv-glow',
    style: {
      borderRadius: radius,
      border: `1px solid ${tint(accent, edge)}`,
      background: `linear-gradient(160deg, ${tint(accent, 7)}, var(--nv-glass2))`,
      '--nv-glow-tint': tint(accent, bloom),
      ...(animate ? { animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' } : {}),
    },
  };
}

// A standing container rather than a moment: lit and tinted, barely outlined.
export const glowSoft = (accent) => glowPanel(accent, { edge: 16, bloom: 42, animate: false });
