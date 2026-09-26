// THE START GUARD — a start button must never write over logged work.
//
// 26 Sep 2026: after a reload his workout came back from the server ("nothing
// was lost"), he landed on Train, the make-up day card offered Begin, and
// Begin built a FRESH make-up session over the recovered one. Ten minutes of
// ticked sets went, and the server copy went with them fifteen seconds later.
// Every start path asks this first. Pure, so it is tested without a browser.

export function tickedSets(session) {
  return (session?.exercises || []).reduce((n, e) => n + (e.sets || []).filter((s) => s.done).length, 0);
}

// What a start button should do given what is already open:
//   'start'  — nothing in progress, or an untouched session: begin fresh
//   'resume' — the session he is asking for IS the one in progress
//   'keep'   — a different session holds logged sets: open that one instead
//              and say so; he finishes or discards it on purpose, never by
//              tapping Begin on another card
export function startDecision(current, want) {
  if (!current) return 'start';
  const same = want.carryoverId
    ? current.routineId === 'carryover' && current.carryoverId === want.carryoverId
    : current.routineId === want.routineId;
  if (same) return 'resume';
  return tickedSets(current) > 0 ? 'keep' : 'start';
}
