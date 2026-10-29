// ONE NOVA, ONE CANVAS, THE PURE FACTS (29 Oct 2026, design/mockups/
// 106-one-nova.html option A). The page is src/NovaStage.jsx inside
// src/screens/NovaThread.jsx; these are the rules it stands on, as plain
// functions (server/test/novaStage.test.js).

// How far up he scrolls before the core has fully travelled from the stage
// to the presenter's spot (the mockup's 260 px).
export const TRAVEL_PX = 260;
// The presenter's core: 0.3 of the stage's 300 px, 90 px across. Between the
// mockup's 60 (a header over history) and the full screen's 120 (his turn),
// because one spot now serves both.
export const PRESENTER_SCALE = 0.3;

// 0 at the foot of the scroll (the stage), 1 once he is TRAVEL_PX or more up
// into the history. No scroll room at all is the stage.
export function canvasProgress(scrollTop, scrollMax, travel = TRAVEL_PX) {
  const max = Number(scrollMax) || 0;
  if (max <= 0) return 0;
  const p = (max - (Number(scrollTop) || 0)) / (travel || TRAVEL_PX);
  return Math.max(0, Math.min(1, p));
}

// THE LAST EXCHANGE, two quiet lines on the stage: his newest words and
// Nova's answer after them (none yet if he has not been answered: an older
// answer is never shown as this one's). Text only, whitespace folded; the index lets a tap find
// the line in the history. A line still arriving is not shown half-said.
export function lastExchange(lines) {
  const list = lines || [];
  const text = (m) => String(m?.text || '').replace(/\s+/g, ' ').trim();
  let you = null;
  let nova = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || !text(m)) continue;
    if (m.who === 'nova' && !nova && !m.streaming && !you) nova = { i, who: m.agent || 'Nova', text: text(m) };
    else if (m.who === 'you' && !you) { you = { i, text: text(m) }; break; }
  }
  return { you, nova };
}
