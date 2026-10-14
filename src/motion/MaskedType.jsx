import './maskedType.css';

// MASKED TYPE (15 Oct 2026, his approved motion set, scene 4 of
// nova-motion-set.html). The lift's name, set large and outlined, fills with
// its muscle's hue rising from below, like the weight going up, with a thin
// rule of the hue riding the edge of the fill. It plays once, when `play` is
// true; otherwise (and under reduced motion) it is simply the filled name.
//
// It never decides anything: the caller shows it only where its own code has
// already decided a set beat his best (the live session's record banner,
// src/screens/SessionSummary.jsx), and the hue is the caller's `--h`.
//
// Background-position, transform and opacity only. The fill and the rule run
// on the same spring for the same time, so the rule stays on the fill's edge:
// the gradient's edge moves through the word's full height as the background
// slides, and the rule's box is the word's own height, translated by -100%.
// The name's size follows its length (--n) and the width it has (cqw), so a
// long name wraps rather than overflowing at 375px.

export function MaskedType({ name, play = false }) {
  const text = String(name || '').trim();
  if (!text) return null;
  return (
    <div className={`nv-mt${play ? ' play' : ''}`} style={{ '--n': Math.max(5, text.length) }} aria-hidden="true">
      <span className="nv-mt-word">
        <span className="nv-mt-o">{text}</span>
        <span className="nv-mt-f">{text}</span>
        <span className="nv-mt-rule" />
      </span>
    </div>
  );
}
