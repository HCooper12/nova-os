// WHICH DAY A FUEL WRITE LANDS ON, AND WHAT THE RECEIPT SAYS (3 Oct 2026).
//
// His report: he went back to yesterday to log the lasagne he ate then,
// ticked it from the rotation, and it went onto today. Every food-log add
// already carried the viewed day; the rotation tick did not, and nothing
// made the receipt say where an entry landed. These are the pure halves of
// the one helper App routes every Fuel write through (App.logDate /
// App.loggedReceipt / App.tickRotation), pinned by
// server/test/fuelLogDay.test.js.

// A local calendar day, YYYY-MM-DD, the same arithmetic the server's
// resolveLogDate uses (local, never UTC: he is AEST).
export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The day a write targets: the day the log is showing, or undefined for
// today (the server reads a missing date as today). `foodLogDate` is null
// while today is in view, so a write can never wander onto a past day by
// accident.
export function logDate(st) {
  const d = st?.foodLogDate;
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

const DAY_MS = 86_400_000;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The day in words, as a receipt says it: null for today (a receipt for
// today names no day), "yesterday", a weekday inside the week, and a date
// beyond it.
export function dayWord(iso, todayIso = localIso()) {
  if (!iso || iso === todayIso) return null;
  const at = (s) => new Date(`${s}T12:00:00`);
  const back = Math.round((at(todayIso) - at(iso)) / DAY_MS);
  const d = at(iso);
  if (back === 1) return 'yesterday';
  if (back > 1 && back < 7) return WEEKDAY[d.getDay()];
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

// "Logged Lasagne to yesterday" / "Logged Lasagne". The day is said every
// time it is not today, so an entry that landed somewhere he did not mean
// is caught on the spot rather than found later.
export function loggedLine(name, iso, todayIso = localIso()) {
  const word = dayWord(iso, todayIso);
  const what = name ? `Logged ${name}` : 'Logged';
  return word ? `${what} to ${word}` : what;
}

// HOW A LOG ROW COMES OFF. A meal ticked from the rotation is the rotation's
// tick, so deleting its row UN-TICKS that slot for that day (the plate and
// the rotation then agree, and a counted dish gets its portion back); every
// other row is the plain delete with its 30-second Undo. A legacy rotation
// row with no recipe id cannot name what to un-tick, so it is deleted plainly.
export function removalFor(entry) {
  if (entry?.source === 'rotation' && entry.slot && entry.recipeId) {
    return { kind: 'untick', slot: entry.slot, recipeId: entry.recipeId };
  }
  return { kind: 'delete', id: entry?.id };
}

// Was this rotation dish eaten on the day these entries belong to? For a
// past day the rotation's own "eaten" only remembers today, so the day's
// log is the truth.
export function rotationTickedIn(entries, slot, recipeId) {
  return (entries || []).some((e) => e?.source === 'rotation' && e.slot === slot && e.recipeId === recipeId);
}
