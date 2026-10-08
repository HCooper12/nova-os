// Persisted order + on/off for the summary Home's Pinned cards — the same
// idea as src/tabOrder.js for the tab bar, and the same reason: reconciled
// against the full card set so a card added in a later build still shows up,
// and one he turns off stays off, without losing his order either way.
// HOME-REDESIGN-PLAN.md §3 (Pinned order) and §1.5 (the Edit sheet).
export const PINNED_CARDS = [
  ['body', 'Body'], ['today', 'Today'], ['plan', 'The plan'], ['waiting', 'Waiting'],
  ['training', 'Training'], ['practice', 'Practice'], ['trends', 'Trends'], ['day', 'Your day'],
];
// Cards that arrive OFF: "Your day, drawn" is a morning card by default
// (mockup 86) and stays all day only when he pins it here.
export const PINNED_DEFAULT_OFF = ['day'];
export const PINNED_KEY = 'novaos.pinned';

// Pure: `stored` is whatever localStorage handed back (or garbage, or
// nothing) → the list the Edit sheet and the card grid both read. Unknown
// keys drop out (a card retired since he last saved), missing ones are
// appended in the house default order (a card added since), and `on` is the
// absence from `off` — so a freshly-appended card is on by default, unless
// it is one of `defaultOff` (then it arrives off until he turns it on).
export function reconcilePinned(stored, meta = PINNED_CARDS, defaultOff = PINNED_DEFAULT_OFF) {
  const metaKeys = meta.map(([k]) => k);
  const labelFor = Object.fromEntries(meta);
  const s = stored && typeof stored === 'object' ? stored : {};
  const off = Array.isArray(s.off) ? s.off : [];
  const order = (Array.isArray(s.order) ? s.order : []).filter((k) => metaKeys.includes(k));
  const appended = new Set();
  for (const k of metaKeys) if (!order.includes(k)) { order.push(k); appended.add(k); }
  return order.map((key) => ({ key, label: labelFor[key], on: !off.includes(key) && !(appended.has(key) && defaultOff.includes(key)) }));
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
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PINNED_KEY, JSON.stringify({ order, off }));
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
