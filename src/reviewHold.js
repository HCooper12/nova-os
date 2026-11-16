import { useSyncExternalStore } from 'react';

// "KEPT" HOLDS THE CARD (mockup 116). Keep it on a new line records the Read
// grade and the server moves today's queue on at once; the card has to stay
// on that line, saying where it went, until he taps Next. App.answerReview
// holds a page only for the three recall grades (reviewJust), so the Read
// answer is held here, by the card, with the page's own fields as they were.
//
// It lives only for the day it was made and is dropped when Next is tapped,
// or when the answer was taken back (the page is unanswered again once the
// write has had its moment to land).

let held = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export const holdKept = (r, day) => { held = { id: r.id, r, day, at: Date.now() }; emit(); };
export const releaseKept = () => { if (held) { held = null; emit(); } };

// the held page, or null when it no longer stands (another day, or taken back)
export function validHold(h, live, today, now = Date.now()) {
  if (!h || h.day !== today) return null;
  if (live && live.id === h.id && live.state === 'card' && !live.answered && !live.result && now - h.at > 2500) return null;
  return h;
}
export const useKept = () => useSyncExternalStore(subscribe, () => held, () => null);
