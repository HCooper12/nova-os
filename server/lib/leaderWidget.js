import { readLeaderState, situationOf } from './leader.js';
import { laneEnabled } from './modelPrefs.js';
import { localDateISO } from './localDate.js';

// THE LEADER WIDGETS (his ask, 17 Nov 2026; mockup 123 round two, APPROVED:
// design/mockups/123-the-leader-widget.html). Two home-screen widgets he
// stacks: "Lead", the day's general idea (gold), and "Your situation", the
// thread at work the Leader is following (violet, hidden while locked).
//
// One payload feeds both, read-only, and no model runs on this path: it reads
// the receipts the daily lane already wrote to leader.json.
//
// THE TWO CHANNELS NEVER MIX. `lead` carries only the general idea's own
// fields; the situation read that lives on the same daily entry is never
// copied into it. `situation` is its own object, and its two numbers (how
// long since he last told Nova anything, how many things are open) are
// counted here by code from the record, never taken from the model's copy.

const clean = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

// The first sentence, as the mockup cuts it: up to the first . ! or ? that
// ends a word (a closing quote may follow it).
export function firstSentence(text) {
  const s = clean(text);
  if (!s) return null;
  const m = s.match(/^.*?[.!?]['"”’]?(?=\s|$)/s);
  return (m ? m[0] : s).trim();
}

const KINDS = ['action', 'idea', 'reminder'];

// The idea, and nothing else. Whitelisted field by field ON PURPOSE: a spread
// of the daily entry would carry its `situation` onto the general widget.
export function leadOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const title = clean(entry.title);
  const line = clean(entry.line);
  if (!title || !line || typeof entry.date !== 'string') return null;
  const src = Array.isArray(entry.refs) ? entry.refs.map(clean).find(Boolean) || null : null;
  return {
    date: entry.date,
    kind: KINDS.includes(entry.kind) ? entry.kind : 'idea',
    title,
    line,
    why: clean(entry.why),
    src,
  };
}

// The situation: the newest daily read that has one, with the counts redone
// live. Null when nothing is open on the record, whatever an old read says.
export function situationFor(state, now = new Date()) {
  const facts = situationOf(state, now);
  if (!facts) return null;
  const read = [...(state.daily || [])]
    .filter((d) => d && typeof d.date === 'string' && d.situation && typeof d.situation === 'object'
      && (clean(d.situation.headline) || clean(d.situation.question)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop()?.situation || null;
  return {
    headline: clean(read?.headline),
    question: clean(read?.question),
    stands: firstSentence(read?.stands),
    days: Number.isFinite(facts.daysSinceUpdate) ? facts.daysSinceUpdate : null,
    openCount: facts.openCount,
  };
}

const offOf = (lane) => {
  try { return !laneEnabled(lane); } catch { return false; }
};

export function composeLeaderWidget(state, now = new Date(), off = {}) {
  const date = localDateISO(now);
  const daily = (Array.isArray(state?.daily) ? state.daily : [])
    .filter((d) => d && typeof d.date === 'string' && d.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = daily.find((d) => d.date === date) || null;
  const earlier = daily.filter((d) => d.date < date).reverse().map(leadOf).find(Boolean) || null;
  return {
    at: now.toISOString(),
    date,
    lead: leadOf(today),
    previous: earlier,
    situation: situationFor(state || {}, now),
    off: { lead: !!off.lead, situation: !!off.situation },
  };
}

export async function buildLeaderWidget({ now = new Date() } = {}) {
  const state = await readLeaderState();
  // The situation is read by the same daily lane, so one switch covers both.
  const dailyOff = offOf('leader-daily');
  return composeLeaderWidget(state, now, { lead: dailyOff, situation: dailyOff });
}
