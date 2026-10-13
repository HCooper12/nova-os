// THE ROUTINE SYMBOLS (13 Oct 2026, mockup 101; his words: "Simplify them
// such as a muscular arm, leg, upper body etc. consider how emojis are
// designed"). Chunky filled shapes, read white on a gradient tile, with dark
// definition lines for depth the way an emoji is shaded. One per kind of
// session; src/trainSummaryFacts.js routineGlyph picks which.
const D = { fill: 'none', stroke: '#0b1430', strokeOpacity: 0.3, strokeWidth: 1.2, strokeLinecap: 'round' };
const G = {
  arm: (
    <>
      <g stroke="currentColor" strokeLinecap="round" fill="none"><path d="M4 18.8L14.6 16.6" strokeWidth="6.4" /><path d="M15.7 16.4L16.7 6.6" strokeWidth="5.2" /></g>
      <circle cx="9.8" cy="12.9" r="4.9" fill="currentColor" /><circle cx="17" cy="5" r="3.3" fill="currentColor" />
      <path {...D} d="M14.1 11.9c.6 1.6.3 3.2-.9 4.5M7.2 10.6c1.3-.7 2.8-.8 4.2-.3M15.4 3.6c.9-.5 2.1-.5 3 0" />
    </>
  ),
  leg: (
    <>
      <g stroke="currentColor" strokeLinecap="round" fill="none"><path d="M10.2 3L11.8 11.2" strokeWidth="7" /><path d="M11.8 11.6L10.8 19.2" strokeWidth="5.2" /><path d="M11.4 20.2L18.4 20.6" strokeWidth="3.6" /></g>
      <circle cx="9.9" cy="14.6" r="2.7" fill="currentColor" />
      <path {...D} d="M8.4 5.2c.6 1.9.6 3.8 0 5.6M12.4 13c-.9.2-1.9.1-2.7-.3M8.9 17.3c.5.6 1.2 1 1.9 1.1" />
    </>
  ),
  chest: (
    <>
      <path fill="currentColor" d="M2.8 7.2C4.6 5 7 3.8 9.6 3.6c.6 1 1.4 1.5 2.4 1.5s1.8-.5 2.4-1.5c2.6.2 5 1.4 6.8 3.6l-1.2 6.7c-.4 2.4-1.7 4.6-3.6 6.1l-.6.5c-.8.6-1.8 1-2.8 1h-2c-1 0-2-.4-2.8-1l-.6-.5c-1.9-1.5-3.2-3.7-3.6-6.1z" />
      <path {...D} d="M12 6.6v14M5.6 8.6c2-1 4.3-1.2 6.4-.4M18.4 8.6c-2-1-4.3-1.2-6.4-.4M6.3 12.2c1.8 1 3.8 1.1 5.7.3M17.7 12.2c-1.8 1-3.8 1.1-5.7.3M9.8 15.4h4.4M10 18h4" />
    </>
  ),
  back: (
    <>
      <path fill="currentColor" d="M2.5 6.6C4.6 4.6 7.1 3.6 9.6 3.4c.6.9 1.4 1.3 2.4 1.3s1.8-.4 2.4-1.3c2.5.2 5 1.2 7.1 3.2-.4 3.2-1.9 6-4.2 8.1l-.8 4.8c-.2 1.2-1.2 2-2.4 2H9.9c-1.2 0-2.2-.8-2.4-2l-.8-4.8C4.4 12.6 2.9 9.8 2.5 6.6z" />
      <path {...D} d="M12 6v14M7.4 8.2c.6 2.6 1.7 4.6 3.6 6.4M16.6 8.2c-.6 2.6-1.7 4.6-3.6 6.4M5.6 7.2c1.3-.6 2.6-.8 3.9-.6M18.4 7.2c-1.3-.6-2.6-.8-3.9-.6" />
    </>
  ),
  upper: (
    <>
      <circle cx="12" cy="4.2" r="2.6" fill="currentColor" />
      <path fill="currentColor" d="M5.6 8.6c1.8-1.2 4-1.8 6.4-1.8s4.6.6 6.4 1.8c1.5 1 2.3 2.7 2.1 4.5l-.5 4.6c-.1.9-.9 1.6-1.8 1.6-.9 0-1.7-.7-1.8-1.6l-.3-3-.6 6.5c-.1.9-.9 1.6-1.8 1.6h-3.4c-.9 0-1.7-.7-1.8-1.6l-.6-6.5-.3 3c-.1.9-.9 1.6-1.8 1.6-.9 0-1.7-.7-1.8-1.6l-.5-4.6c-.2-1.8.6-3.5 2.1-4.5z" />
      <path {...D} d="M12 9.6v5.2M8.4 10.2c1.2.9 2.4 1.2 3.6 1.1M15.6 10.2c-1.2.9-2.4 1.2-3.6 1.1M7 10.4l.4 3.4M17 10.4l-.4 3.4" />
    </>
  ),
};

export function BodyGlyph({ g }) {
  return <svg className="nv-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{G[g] || G.upper}</svg>;
}

// a gradient tile wearing a glyph, in the routine's own muscle hues
export function GlyphTile({ g, a, b, size }) {
  return (
    <span className={`nv-tile${size ? ` ${size}` : ''}`} style={{ '--a': a, ...(b ? { '--b': b } : null) }} aria-hidden="true">
      <BodyGlyph g={g} />
    </span>
  );
}
