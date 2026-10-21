// WHEN THE DOORMAN SPEAKS (21 Oct 2026). His spoken log for 20 Oct holds
// fifteen greetings, at 02:05, 05:06, 08:18, 11:21, 14:22, 17:08, 20:07 and
// 23:05 among them: one every three hours round the clock, and pairs a few
// minutes apart (his Mac and his phone each keeping their own clock). The
// due check ran on every routine sync and measured three hours since the
// LAST GREETING, so a Mac left open on Nova said "Welcome back, sir. Seven
// drafts wait in your Inbox" to an empty room all night. Jarvis speaks first
// only about a change or a danger; a hello belongs to an arrival.
//
// Due now means: he is HERE (a touch, a key, the app opened on his phone in
// the last two minutes, on a visible page), and either it is his first
// arrival of the day, or he has just come back after three hours of no
// presence at all. Pure, so the rule can be tested without a clock.

export const RETURN_GAP_MS = 3 * 3600e3;
export const PRESENT_MS = 2 * 60e3;

/**
 * → 'new-day' | 'return' | null
 * `last`: this device's {date, at} of the last delivered greeting.
 * `presenceAt`: his newest presence on this device. `awayFrom`: the presence
 * before a gap of RETURN_GAP_MS or more, when this burst of presence ended one.
 */
export function greetDue({ now, today, last = {}, presenceAt = 0, awayFrom = 0, visible = true }) {
  if (!visible) return null;
  if (!presenceAt || now - presenceAt > PRESENT_MS) return null;
  if (last?.date !== today) return 'new-day';
  if (!awayFrom || now - awayFrom < RETURN_GAP_MS) return null;
  if (last?.at && now - last.at < RETURN_GAP_MS) return null;
  return 'return';
}

/**
 * The server's word, across his devices (server/lib/briefState.js): a new
 * day stands down when any device greeted or briefed today; a return stands
 * down when any device greeted in the last three hours.
 */
export function standsDown(gap, st, now) {
  if (!st) return false;
  if (gap === 'new-day') return st.greet?.date === st.today || !!st.briefedToday;
  const at = st.greet?.at ? Date.parse(st.greet.at) : NaN;
  return Number.isFinite(at) && now - at < RETURN_GAP_MS;
}

/**
 * A new presence: → { presenceAt, awayFrom }. A gap of three hours or more
 * since the previous presence opens a return (awayFrom = the old presence);
 * otherwise an open return is kept until it is greeted or lapses.
 */
export function notePresence({ now, prevAt = 0, awayFrom = 0 }) {
  if (prevAt && now - prevAt >= RETURN_GAP_MS) return { presenceAt: now, awayFrom: prevAt };
  return { presenceAt: now, awayFrom };
}
