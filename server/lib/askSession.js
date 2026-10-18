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

import { sessionOwner } from './agentSessions.js';

const sessions = new Map(); // id → { startedAt, day, turns }

// THE LANE GUARD (18 Oct 2026). After an iOS reclaim the phone re-attached a
// Coach answer without its agent, stored the Coach's session id as Nova's,
// and three of Nova's turns resumed the Coach's session (15 and 17 Oct):
// Sonnet messages inside the Coach's journal, and cold writes of 184,576 and
// 238,694 tokens ($3.30, $7.63). The client fault is fixed where it lives;
// this is the server's half, so no client fault can do it again. A session id
// that agent-sessions.json records for ANOTHER lane is refused, and the turn
// starts fresh. Lanes are the recorded kinds: 'voice' (Nova), 'coach',
// 'leader'.
const LANE_NAME = { voice: 'nova', coach: 'coach', leader: 'leader' };
export function sessionOwnerGuard(sessionId, lane, { owner = sessionOwner } = {}) {
  if (!sessionId) return { sessionId: null, reason: null };
  const kind = owner(sessionId);
  if (kind && kind !== lane && LANE_NAME[kind]) {
    return { sessionId: null, reason: `id belongs to ${LANE_NAME[kind]}` };
  }
  return { sessionId, reason: null };
}
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// Returns { sessionId, reason }: the id to resume, or null (with the reason)
// to start fresh. Pure over its own map; `now` is injectable for the test.
export function guardAskSession(sessionId, now = Date.now(), { owner } = {}) {
  if (!sessionId) return { sessionId: null, reason: null };
  // another lane's conversation is never Nova's to resume
  const lane = sessionOwnerGuard(sessionId, 'voice', owner ? { owner } : {});
  if (lane.reason) { sessions.delete(sessionId); return lane; }
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
