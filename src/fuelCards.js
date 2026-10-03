import { reconcilePinned, movePinned } from './pinned.js';

// THE BOTTOM OF FUEL, IN HIS ORDER (3 Oct 2026, his words: "allow me to edit
// the bottom section of fuel like I can for the home screen"). The cards
// below the composer, each one switchable and draggable in the same
// Health-style sheet Home's Pinned uses (src/PinnedEditSheet.jsx), and kept
// the same way: order plus the ones he turned off, reconciled against the
// full set so a card added in a later build still appears and one he hid
// stays hidden without losing his order. The plate and the composer are
// not here: they are the page.
export const FUEL_CARDS = [
  ['log', "Today's log"],
  ['rotation', 'The rotation'],
  ['history', 'Everything you’ve logged'],
  ['recipes', 'Recipes'],
  ['pick', 'Pick it up'],
];
export const FUEL_CARDS_KEY = 'novaos.fuelCards';

export function reconcileFuelCards(stored) {
  return reconcilePinned(stored, FUEL_CARDS);
}

export function getFuelCards() {
  let stored = null;
  try {
    if (typeof localStorage !== 'undefined') stored = JSON.parse(localStorage.getItem(FUEL_CARDS_KEY) || 'null');
  } catch { stored = null; }
  return reconcileFuelCards(stored);
}

export function saveFuelCards(list) {
  const arr = Array.isArray(list) ? list : [];
  const order = arr.map((x) => x.key);
  const off = arr.filter((x) => !x.on).map((x) => x.key);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(FUEL_CARDS_KEY, JSON.stringify({ order, off }));
  } catch { /* storage blocked: the order holds for this session only */ }
}

export const moveFuelCard = movePinned;

// What the page draws, in order: the cards that are on, with the two doors
// (Recipes, Pick it up) that sit next to each other sharing one grouped
// card, the way they always have. A door on its own is its own card.
// `present` says which cards have something to draw right now.
export function fuelCardRuns(list, present = {}) {
  const runs = [];
  for (const c of list || []) {
    if (!c.on || present[c.key] === false) continue;
    const door = c.key === 'recipes' || c.key === 'pick';
    const last = runs[runs.length - 1];
    if (door && last?.kind === 'doors') last.keys.push(c.key);
    else runs.push(door ? { kind: 'doors', keys: [c.key] } : { kind: 'card', key: c.key });
  }
  return runs;
}
