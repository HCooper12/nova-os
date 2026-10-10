// THE DAILY REVIEW's "which card is on screen" rule — one small pure
// function so App.jsx and valsNotes.js (and its tests) share it instead of
// each holding their own copy. His tap (reviewOpenId) wins while it is
// still in today's queue; a drawn-early extra stands in front of that;
// otherwise the first not-yet-answered item, else simply the first — never
// undefined while items exist.
export function pickReviewItem({ items, drawnExtra, openId }) {
  if (drawnExtra) return drawnExtra;
  const list = items || [];
  if (!list.length) return null;
  const picked = openId && list.find((i) => i.id === openId);
  return picked || list.find((i) => !i.answered) || list[0];
}
