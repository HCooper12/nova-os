// THE PWA CONVERSATION'S FRESHNESS GUARD — the spoken lane's triple
// (lib/spokenSession.js: new-day / age / turn-cap), generalised to the /ask
// lane whose session id lives in the phone's localStorage for days. A
// resumed session reasons from turn-1 context under a prompt that says to
// trust it; past these bounds that context is a snapshot of another day, so
// the turn starts a fresh session instead (the CLI mints the id; the client
// persists whatever comes back). State is in memory: a restart simply
// starts fresh once, which is today's cost anyway.
const MAX_AGE_MS = 24 * 60 * 60_000;
export const ASK_MAX_TURNS = 40;

const sessions = new Map(); // id → { startedAt, day, turns }
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// Returns { sessionId, reason }: the id to resume, or null (with the reason)
// to start fresh. Pure over its own map; `now` is injectable for the test.
export function guardAskSession(sessionId, now = Date.now()) {
  if (!sessionId) return { sessionId: null, reason: null };
  const s = sessions.get(sessionId);
  if (!s) {
    // first sight of this id since the server started — adopt it
    sessions.set(sessionId, { startedAt: now, day: dayOf(now), turns: 1 });
    return { sessionId, reason: null };
  }
  let reason = null;
  if (s.day !== dayOf(now)) reason = 'new day';
  else if (now - s.startedAt > MAX_AGE_MS) reason = 'older than a day';
  else if (s.turns >= ASK_MAX_TURNS) reason = `${ASK_MAX_TURNS} turns deep`;
  if (reason) {
    sessions.delete(sessionId);
    return { sessionId: null, reason };
  }
  s.turns += 1;
  return { sessionId, reason: null };
}

export const _reset = () => sessions.clear();
