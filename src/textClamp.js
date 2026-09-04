// Clamping text without cutting a word in half.
//
// His report, 4 Sep: an inbox title read "…something new or actionable s ▸".
// The cause was a bare `slice(0, 60)` — a character count applied to prose,
// which lands wherever it lands and leaves a stray letter behind. It also
// left no ellipsis, so there was nothing to say the text had been cut; the
// row simply looked corrupt.
//
// Pure and separately tested because the failure is cosmetic and therefore
// easy to reintroduce: nothing breaks, it just looks broken.

// Trim to at most `max` characters, ending on a word boundary, with a real
// ellipsis when anything was dropped. A single word longer than the budget is
// cut at the budget — better a hard cut than an empty title.
export function clampWords(text, max = 60) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour the word boundary if it leaves a sensible amount of text —
  // otherwise a long first word would collapse the title to almost nothing.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:.\-–—]+$/, '')}…`;
}
