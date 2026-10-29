// Persisted order + on/off for the summary Home's Pinned cards — the same
// idea as src/tabOrder.js for the tab bar, and the same reason: reconciled
// against the full card set so a card added in a later build still shows up,
// and one he turns off stays off, without losing his order either way.
// HOME-REDESIGN-PLAN.md §3 (Pinned order) and §1.5 (the Edit sheet).
// 'highlight' is the one-sentence card that changes with the hour (Steps in
// the evening, protein at noon). It sat above Pinned, fixed, until his ask on
// 14 Oct 2026: every card movable, so the step rings can lead the page. Only
// the moments (a record, a review due, a capture that landed) still stack
// above everything, because they are news.
export const PINNED_CARDS = [
  ['highlight', 'Right now'], ['body', 'Body'], ['today', 'Today'], ['plan', 'The plan'], ['waiting', 'Waiting'],
  ['training', 'Training'], ['practice', 'Practice'], ['trends', 'Trends'], ['day', 'Your day'],
  // Projects phase 1 (29 Oct 2026): shown only when a project waits on him
  ['projects', 'Projects'],
];
// Cards that arrive OFF: "Your day, drawn" is a morning card by default
// (mockup 86) and stays all day only when he pins it here.
export const PINNED_DEFAULT_OFF = ['day'];
export const PINNED_KEY = 'novaos.pinned';
// a card added since he last saved normally joins at the END; these join at
// the TOP instead, so 'Right now' stays where it always was until he moves it
export const PINNED_LEAD = ['highlight'];

// Pure: `stored` is whatever localStorage handed back (or garbage, or
// nothing) → the list the Edit sheet and the card grid both read. Unknown
// keys drop out (a card retired since he last saved), missing ones are
// appended in the house default order (a card added since), and `on` is the
// absence from `off` — so a freshly-appended card is on by default, unless
// it is one of `defaultOff` (then it arrives off until he turns it on).
export function reconcilePinned(stored, meta = PINNED_CARDS, defaultOff = PINNED_DEFAULT_OFF, lead = meta === PINNED_CARDS ? PINNED_LEAD : []) {
  const metaKeys = meta.map(([k]) => k);
  const labelFor = Object.fromEntries(meta);
  const s = stored && typeof stored === 'object' ? stored : {};
  const off = Array.isArray(s.off) ? s.off : [];
  const order = (Array.isArray(s.order) ? s.order : []).filter((k) => metaKeys.includes(k));
  const appended = new Set();
  const fresh = metaKeys.filter((k) => !order.includes(k));
  for (const k of fresh.filter((x) => !lead.includes(x))) { order.push(k); appended.add(k); }
  order.unshift(...fresh.filter((x) => lead.includes(x)));
  // his chosen size, when he has resized it (otherwise the card's own default)
  const size = s.size && typeof s.size === 'object' ? s.size : {};
  return order.map((key) => ({
    key, label: labelFor[key], on: !off.includes(key) && !(appended.has(key) && defaultOff.includes(key)),
    ...(SIZES.includes(size[key]) ? { size: size[key] } : {}),
  }));
}

// RESIZING, the iPhone way (his ask, 15 Oct 2026: hold a tile, then "resize
// the tiles or move them around fluidly"): a card is a whole row ('wide') or
// half of one ('half'). Pure: hands back a new list.
export const SIZES = ['wide', 'half'];
export function resizePinned(list, key, isWide) {
  return (Array.isArray(list) ? list : []).map((x) => (x.key === key ? { ...x, size: isWide ? 'half' : 'wide' } : x));
}
export function removePinned(list, key) {
  return (Array.isArray(list) ? list : []).map((x) => (x.key === key ? { ...x, on: false } : x));
}

export function getPinned() {
  let stored = null;
  try {
    if (typeof localStorage !== 'undefined') stored = JSON.parse(localStorage.getItem(PINNED_KEY) || 'null');
  } catch { stored = null; }
  return reconcilePinned(stored);
}

export function savePinned(list) {
  const arr = Array.isArray(list) ? list : [];
  const order = arr.map((x) => x.key);
  const off = arr.filter((x) => !x.on).map((x) => x.key);
  const size = Object.fromEntries(arr.filter((x) => SIZES.includes(x.size)).map((x) => [x.key, x.size]));
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PINNED_KEY, JSON.stringify({ order, off, size }));
  } catch { /* storage full/blocked — the order just won't persist */ }
}

// Reorder is a straight splice-out/splice-in; out of range is a no-op that
// hands back the SAME array rather than a defensive copy, so a caller can
// tell nothing moved.
export function movePinned(list, from, to) {
  const arr = Array.isArray(list) ? list : [];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// A drag on Home moves only the cards he can SEE; the switched-off and the
// empty ones keep their places in the saved list. `visible` is the new order
// of the shown keys; they refill the slots the shown cards held, in order.
export function applyVisibleOrder(list, visible) {
  const arr = Array.isArray(list) ? list : [];
  const shown = new Set(visible);
  const queue = visible.map((k) => arr.find((x) => x.key === k)).filter(Boolean);
  if (queue.length !== visible.length) return arr;
  return arr.map((x) => (shown.has(x.key) ? queue.shift() : x));
}
