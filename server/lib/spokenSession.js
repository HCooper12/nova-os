import { randomUUID } from 'node:crypto';

// The spoken lane's conversation, kept alive between asks.
//
// THE PROBLEM (measured, 13 Aug 2026): `POST /api/ask/sync` — the Siri
// surface — minted a BRAND NEW conversation on every single ask. That is the
// most expensive possible choice, and it quietly cost all three of the
// slowest things in the request:
//   - the full context assembly (~2.5s measured): `buildAskContext` returns
//     '' immediately for a resumed session, so a reused one skips it entirely
//   - a cold `claude` CLI boot (~2.2s measured): the warm pool is keyed by
//     session id, so a freshly-minted id could never once hit it — the
//     accelerator that makes the Voice screen fast has never served Siri
//   - prompt-cache CREATION rather than a cache READ on ~18k tokens
// Live timings before this existed: 14.2s, 15.9s, 23.9s. The 14.2s one was
// "how many steps did I do yesterday?", whose answer was already sitting in
// the injected context — the model read nothing. Siri answers in ~1-2s, so
// Nova felt slow enough that reaching for it stopped being worth it, which
// defeats the point of having the surface at all.
//
// THE FIX: keep one conversation and resume it. Freshness is then something
// to be designed rather than hoped for, so three guards exist:
//   - a new calendar day always starts fresh, so "today" is never yesterday's
//   - the session ages out (MAX_AGE_MS), bounding how far the slower-moving
//     context (calendar brief, weekly debrief, money) can drift
//   - the turn cap stops one conversation growing until its own history is
//     the thing making it slow
// and on top of those, every resumed turn re-states the volatile numbers from
// local files (see `todayLocalContext`) — so steps and fuel are current on
// EVERY ask, not just the one that opened the session.
//
// Continuity never depends on this: it is a pure accelerator, exactly like
// the warm process pool it exists to make reachable. Drop the session for any
// reason and the next ask simply pays the old cost once.

const MAX_AGE_MS = 20 * 60_000;
// Long enough that a burst of questions (the case where speed matters most)
// all land on one warm process; short enough that no answer is built on a
// context picture more than 20 minutes old.
const MAX_TURNS = 12;
// A resumed turn re-sends the whole conversation to the model, so an
// unbounded session eventually becomes the slow thing itself.

let current = null; // { id, startedAt, turns, day }

export function localDay(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Returns { sessionId, resumed, turns, reason } — `reason` names why a fresh
// session was minted, so the receipt in the log explains a slow ask instead
// of leaving it mysterious.
export function takeSpokenSession({ now = Date.now(), day = localDay() } = {}) {
  if (current) {
    let reason = null;
    if (current.day !== day) reason = 'new-day';
    else if (now - current.startedAt >= MAX_AGE_MS) reason = 'aged-out';
    else if (current.turns >= MAX_TURNS) reason = 'turn-cap';
    if (!reason) {
      current.turns += 1;
      return { sessionId: current.id, resumed: true, turns: current.turns, reason: null };
    }
    current = { id: randomUUID(), startedAt: now, turns: 1, day };
    return { sessionId: current.id, resumed: false, turns: 1, reason };
  }
  current = { id: randomUUID(), startedAt: now, turns: 1, day };
  return { sessionId: current.id, resumed: false, turns: 1, reason: 'first-ask' };
}

// Called when a turn fails: the next ask must not try to --resume a
// conversation whose process died mid-answer or whose budget was spent.
export function dropSpokenSession() { current = null; }

export function _spokenSessionState() { return current ? { ...current } : null; }
