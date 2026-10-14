// WHICH HOME MOMENTS LEAD, AND WHEN (his call, 15 Oct 2026). Seeing the
// Daily review and Today's technique hold the top of Home at 7am in the
// middle of a workout, he asked for priority tiles to lead only while they
// matter in his day, then drop below with the other tiles:
//   - the Daily review leads in the morning until 9 and again 19:00 to 21:00
//     (and never once the day's reviews are done: nothing left to act on)
//   - today's technique never leads: "an extra thing for me to look at if
//     I get time or feel like it" (his words, same day); it lives below
// A moment not named here keeps leading whenever it exists: those already
// appear only while something needs him (a hand up on the Mac, money, a
// record just set, a running plan, the evening wrap).

export const REVIEW_WINDOWS = [[5, 9], [19, 21]];

const within = (hour, windows) => windows.some(([from, to]) => hour >= from && hour < to);

// true when moment `key` belongs at the top at this hour; `ctx` carries the
// few facts a rule needs (the review's state)
export function momentLeads(key, hour, ctx = {}) {
  switch (key) {
    case 'review':
      return ctx.reviewState !== 'all-done' && within(hour, REVIEW_WINDOWS);
    case 'technique':
      return false;
    default:
      return true;
  }
}

// keeps the order it was given; splits it into what leads and what waits below
export function splitMoments(keys, hour, ctx) {
  const top = [];
  const later = [];
  for (const k of keys) (momentLeads(k, hour, ctx) ? top : later).push(k);
  return { top, later };
}
