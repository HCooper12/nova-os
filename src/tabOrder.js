// Persisted custom order for the mobile bottom tab bar. Stored as an array of
// screen keys; reconciled against the full set so a new screen (added in a later
// build) still shows up, and a removed one drops out, without losing the order.
const KEY = 'novaos.tabOrder';

export const TAB_META = [
  ['mission', 'Home'], ['voice', 'Voice'], ['galaxy', 'Galaxy'], ['code', 'Code'],
  ['inbox', 'Inbox'], ['recipes', 'Fuel'], ['shopping', 'Shop'], ['todos', 'To-Do'],
  ['workouts', 'Train'], ['notes', 'Notes'], ['journal', 'Journal'], ['money', 'Money'], ['stash', 'Stash'],
  ['ops', 'Ops'], ['settings', 'Settings'],
  // appended (not inserted) so the canonical numerals of existing tabs never move
  ['library', 'Library'],
];
const ALL_KEYS = TAB_META.map((t) => t[0]);
// TAB_META fixes the canonical NUMBERING (Train is always IX). This is the
// default ORDER, which is a different question: what belongs in the four
// one-tap dock slots before he has customised anything. Train and Recipes are
// the daily surfaces; Galaxy and Code are occasional, so they move back.
const DEFAULT_ORDER = ['mission', 'voice', 'workouts', 'recipes', 'inbox', 'todos',
  'shopping', 'notes', 'library', 'journal', 'money', 'stash', 'galaxy', 'code', 'ops', 'settings'];
const LABELS = Object.fromEntries(TAB_META);
const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.', 'IX.', 'X.', 'XI.', 'XII.', 'XIII.', 'XIV.', 'XV.', 'XVI.'];

export function getTabOrder() {
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { stored = []; }
  const order = (Array.isArray(stored) ? stored : []).filter((k) => ALL_KEYS.includes(k));
  const fill = DEFAULT_ORDER.filter((k) => ALL_KEYS.includes(k));
  for (const k of fill) if (!order.includes(k)) order.push(k);
  for (const k of ALL_KEYS) if (!order.includes(k)) order.push(k); // any screen missing from both lists
  return order;
}

export function saveTabOrder(order) {
  try { localStorage.setItem(KEY, JSON.stringify((order || []).filter((k) => ALL_KEYS.includes(k)))); } catch { /* storage full/blocked — order just won't persist */ }
}

export function tabLabel(key) { return LABELS[key] || key; }
export function romanFor(i) { return ROMAN[i] || `${i + 1}.`; }
