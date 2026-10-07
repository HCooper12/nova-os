import { haptic } from './haptics.js';
import { notify } from './island.js';

// What Settings says back (direction A, 7 Oct 2026): a toast from the island,
// with Undo where a change can be undone; and "no" said with the hand (a
// short shake, the warn haptic, and the reason in words) for a control that
// cannot change right now.

export function say(message, undo) {
  notify(undo ? { message, actions: [{ label: 'Undo', run: undo }] } : message);
}

export function refuse(el, why) {
  if (el) { el.classList.remove('nv-set-nudge'); void el.offsetWidth; el.classList.add('nv-set-nudge'); }
  haptic('warn');
  if (why) say(why);
}

// a row lights when the thing that unlocked it turns on, or a search lands on it
export function lightRow(key, scope = document) {
  const el = scope?.querySelector?.(`[data-set-key="${key}"]`);
  if (!el) return null;
  const row = el.classList.contains('nv-set-row') ? el : el.querySelector('.nv-set-row') || el;
  row.classList.remove('lit');
  void row.offsetWidth;
  row.classList.add('lit');
  return el;
}
