// SEARCH → RESULTS (15 Oct 2026, the motion set's scene 10, his approval).
// As he types, the rows that match stack in from just above, one after
// another; the rows that stop matching step out; the ones that stay close
// the gap. Clearing the field puts the list back at rest with no flourish.
//
// The choreography itself runs inside useFlipList (one FLIP in the app,
// never two). This file holds the numbers the mockup set and the small pure
// pieces, so a test can pin them without a DOM.

export const SEARCH = {
  stagger: 45,   // ms between rows stacking in
  cap: 12,       // rows past the twelfth on screen simply appear
  exitMs: 180,   // a row that stops matching steps out in this long
  rise: 8,       // px a row drops through as it arrives
};

// a matching row arrives: down from just above, faded up (bouncy spring)
export const SEARCH_IN = [{ opacity: 0, transform: `translateY(-${SEARCH.rise}px)` }, { opacity: 1, transform: 'none' }];
// a row that stops matching steps out: fades and shrinks a touch (ease-in)
export const SEARCH_OUT = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }];

// the query as the motion sees it: whitespace alone is no search
export const searchKey = (q) => String(q ?? '').trim();

// when the i-th arriving row starts: after the exits (wait), 45 ms apart.
// Only the first `cap` arrivals ever get here; the clamp is a guard.
export const enterDelay = (i, wait = 0) => Math.max(0, wait) + Math.min(Math.max(0, i), SEARCH.cap - 1) * SEARCH.stagger;

// does the row at this on-screen slot animate at all?
export const animates = (slot) => slot >= 0 && slot < SEARCH.cap;

// the count line under the field: "3 recipes", "1 recipe", "0 exercises"
export function countLabel(n, one, many) {
  const k = Math.max(0, Math.round(Number(n) || 0));
  return `${k} ${k === 1 ? one : (many || `${one}s`)}`;
}
