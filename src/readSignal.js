// WAS IT READ? (second-brain audit #4, 7 Nov 2026.) Dispatch, Daily Review and
// Plan Today deliver themselves, and nothing recorded whether he ever saw one:
// 0 of 184 auto-delivered records carried a read signal. This decides, from what
// is on screen, which of them he has in front of him. It draws nothing. The
// measure is "the screen it lands on was open for three seconds", which is
// weaker than reading it, and is named by `via` so nobody claims more.
import { AUTO_SEEN_MS } from './inboxSummaryFacts.js';

export const READ_MS = AUTO_SEEN_MS;

const unread = (r) => r?.status === 'filed' && r.auto === true && !r.seenAt;
const sameDay = (iso, now) => new Date(iso).toDateString() === new Date(now).toDateString();

// the brief and the reflections are filed to the Journal; the plan's three sit on Home
const ON_JOURNAL = new Set(['dispatch', 'review', 'weekly-debrief']);

/** The auto-delivered records today that this screen is showing. Pure. */
export function unreadOnScreen(screen, items = [], { now = Date.now() } = {}) {
  const today = (items || []).filter((r) => unread(r) && sameDay(r.createdAt, now));
  if (screen === 'mission') return today.filter((r) => r.kind === 'plan-today').map((r) => ({ id: r.id, via: 'home' }));
  if (screen === 'journal') return today.filter((r) => ON_JOURNAL.has(r.kind)).map((r) => ({ id: r.id, via: 'journal' }));
  return [];
}

/** The auto-delivered records he has just expanded in the Inbox. Pure. */
export function openedNow(expanded = {}, was = {}, items = []) {
  const justOpened = Object.keys(expanded || {}).filter((id) => expanded[id] && !(was || {})[id]);
  return (items || []).filter((r) => justOpened.includes(r.id) && unread(r)).map((r) => ({ id: r.id, via: 'opened' }));
}
