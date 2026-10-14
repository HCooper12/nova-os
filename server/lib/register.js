// THE REGISTER BY PLACE (design/EVIE-STUDY.md §4E, his yes 15 Oct 2026).
//
// Where he is (src/where.js) switches two things and nothing else: the lines
// appended to the spoken register, and the interruptions allowed
// (lib/alerts.js allowedTiers). The lens (lib/lens.js) stays first and
// untouched; no new prompt is written for a place. Every word below is
// code-written and fixed.
//
//   gym      one sentence, numbers first, no lists, no questions unless it
//            is safety, never narrate the screen he can see
//   driving  two sentences, nothing visual (the running glass, CARD and SHOW
//            are left out of the prompt and stripped by code), one question
//            at most, and every act confirmed aloud before it runs
//            (ctx.forceConfirm in lib/verbs.js runVerb)
//   desk     the normal register; the Mac hand is already allowed (fromMac)
//   phone, unknown   the normal register

import { PLACES, WHY_MAX } from '../../src/where.js';

export { PLACES };

// Said only where a yes can follow: the hands-free one-shot (Siri, the
// Action Button) has no next turn to hear it in, so there the act runs as
// it always has and this line is left out rather than made untrue.
const CONFIRM_LINE = 'Anything you do for him is confirmed aloud before it runs: say what will happen and that a yes does it.';

const LINES = {
  gym: [
    'HE IS AT THE GYM, BETWEEN SETS. ONE SENTENCE per turn. The number first, then the few words it needs; no lists, no questions unless it is about his safety. Never narrate what he can already see on the screen in front of him.',
  ],
  driving: [
    'HE IS DRIVING. TWO SENTENCES at most, and nothing visual: no VIS, CARD or SHOW lines, nothing that needs looking at. One question at most.',
    CONFIRM_LINE,
  ],
  desk: [],
  phone: [],
  unknown: [],
};

/** The bounded where from a request body: place from the closed set, why ≤ 60 chars. */
export function normWhere(w) {
  const place = PLACES.includes(w?.place) ? w.place : 'unknown';
  const why = typeof w?.why === 'string' ? w.why.replace(/\s+/g, ' ').trim().slice(0, WHY_MAX) : '';
  return { place, why };
}

/**
 * The extra spoken-register lines for a place ([] = the normal register).
 * `oneShot`: the hands-free lane, where no yes can follow, so the confirm
 * line is dropped (and lib/verbs.js forceConfirm is not applied there).
 */
export function registerFor(place, { oneShot = false } = {}) {
  return (LINES[place] || []).filter((l) => !(oneShot && l === CONFIRM_LINE));
}

/** The lines as prompt bullets, appended to the spoken register; '' when normal. */
export function registerBlock(place, opts) {
  return registerFor(place, opts).map((l) => `- ${l}`).join('\n');
}

/** The one-line reminder a resumed turn (or the Coach / Leader) carries; '' when normal. */
export function whereLine(place, opts) {
  const lines = registerFor(place, opts);
  return lines.length ? `[Where he is now — this turn's register: ${lines.join(' ')}]` : '';
}

/** Driving takes the glass away: nothing to look at. */
export function suppressGlass(place) {
  return place === 'driving';
}

/** Driving confirms every act aloud before it runs (never on the one-shot lane). */
export function forceConfirmFor(place, { oneShot = false } = {}) {
  return place === 'driving' && !oneShot;
}

/**
 * The hands-free lane's where (/api/ask/sync): the body's own, if a Shortcut
 * sends one; otherwise driving-grade, because the native shell exposes no
 * audio route or motion and a hands-free turn is the nearest real signal.
 */
export function handsFreeWhere(w) {
  if (w && typeof w === 'object' && PLACES.includes(w.place)) return normWhere(w);
  return { place: 'driving', why: 'hands-free lane, no route signal' };
}
