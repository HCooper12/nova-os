// The two decisions Mission Control now makes for him — WHICH thing is the
// one thing, and WHETHER this morning earns a record moment — as pure
// functions, because both are the kind of small rule that is easy to get
// subtly wrong and impossible to notice from a screenshot.
//
// From the 4 Sep audit, his picks on 5 Sep: C2 (one thing, then the rest) and
// C3 (the record moment, shown once). Both replace visual weight that used to
// be spent uniformly — seven cards with the same border, fill and radius, so
// hierarchy came from reading order alone.

// C2. The one thing is the first priority he has not yet settled. A DONE or
// SKIPPED row has had its moment; the next open one is what the day is about.
// Returns { index, priority } or null when every row is settled (or there is
// no plan yet) — in which case the card steps aside rather than promoting a
// finished item to look like an unfinished one.
export function pickOneThing(priorities = []) {
  const list = Array.isArray(priorities) ? priorities : [];
  const index = list.findIndex((p) => p && !p.outcome);
  if (index === -1) return null;
  return { index, priority: list[index] };
}

// C3. A record moment is earned by a PR from the PREVIOUS day — the morning
// after, not the moment it happens (the cockpit celebrates that live). Shown
// once: the date of the PRs shown is remembered, and the same date never
// shows again. Deliberately quiet about anything older than yesterday — a
// week-old PR is history, not a moment.
//
// `prs` come from the train overview's momentum (name, kind, value, previous,
// date). `seenDate` is what localStorage remembers. `today` is a YYYY-MM-DD
// local date, injected so the rule is testable at any hour.
export function prMomentFor(prs = [], seenDate = null, today) {
  const list = (Array.isArray(prs) ? prs : []).filter((p) => p && p.date);
  if (!list.length || !today) return null;
  const yesterday = shiftISO(today, -1);
  const fresh = list.filter((p) => p.date === yesterday || p.date === today);
  if (!fresh.length) return null;
  const date = fresh.some((p) => p.date === today) ? today : yesterday;
  if (seenDate === date) return null; // already had its morning
  return { date, prs: fresh.filter((p) => p.date === date) };
}

function shiftISO(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12); // noon: immune to DST edges
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// B1. Colour is the verdict, and a missing value is a HOLE, not a zero. Maps a
// satellite ({ value, pct }) to the ring's state so every ring on the cluster
// speaks the same language: good (on track), behind, missed, or absent.
export function ringState(sat, { goodFrom = 90, behindFrom = 50 } = {}) {
  if (!sat || sat.value === '—' || sat.value == null) return 'absent';
  const pct = Number(sat.pct);
  if (!Number.isFinite(pct)) return 'absent';
  if (pct >= goodFrom) return 'good';
  if (pct >= behindFrom) return 'behind';
  return 'missed';
}
