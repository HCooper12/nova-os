import { composeDispatch } from './dispatch.js';
import { profileContext } from './profile.js';
import { preferencesContext } from './learning.js';
import { standingContext } from './standing.js';
import { gatherContext } from './contextSections.js';

// The shared first-turn context for every conversational surface (Voice
// screen, Siri sync ask, Telegram bridge). One builder so the surfaces can
// never drift apart — resumed sessions already carry it and pass ''.
//
// Assembled CONCURRENTLY and on a deadline. Sequentially this took ~20s of
// a ~26s spoken answer, and iOS Shortcuts drops a request that slow ("the
// network connection was lost"). The sections are independent reads, so
// running them together costs nothing in freshness and bounds the wait at
// the slowest one — while a per-section timeout stops a stalled CalDAV or
// vault read from holding the whole conversation hostage. A section that
// times out or throws is NAMED to the model (lib/contextSections.js) — it
// used to be simply absent, and the front door answered "nothing" from a
// ledger it had not actually read.
const SECTION_TIMEOUT_MS = 25_000;
// A SPOKEN ask (Siri, Telegram) is a conversation, not a report: it must
// come back in seconds. The only slow section is the brief, because it
// reaches iCloud over CalDAV; in fast mode it gets a short leash, so a warm
// calendar cache is included and a cold one is simply skipped rather than
// making him stand there. The cheap today-block below always goes, so a
// fast answer still knows his real numbers.
const FAST_DISPATCH_TIMEOUT_MS = 6500;

// Today from local files only — no network, always instant. This is what
// keeps a fast spoken answer honest about steps, fuel and what's waiting.
//
// Exported because the spoken lane reuses ONE conversation across asks (see
// lib/spokenSession.js): the full context is injected on turn 1 only, so
// every RESUMED turn re-states just this block. It is the volatile part —
// steps and fuel move between one question and the next — and it costs
// nothing to recompute because it never leaves the local disk.
export async function todayLocalContext() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const bits = [];
  try {
    const { loadRecentDays } = await import('./healthData.js');
    const days = await loadRecentDays(3);
    const t = days.find((x) => x.date === today);
    const latest = [...days].reverse().find((x) => x.steps != null);
    if (t?.steps != null) bits.push(`steps today ${t.steps}`);
    else if (latest) bits.push(`no steps recorded yet today (latest is ${latest.steps} on ${latest.date} — say the date, never call it today's)`);
    const withHrv = [...days].reverse().find((x) => x.hrv != null);
    if (withHrv) bits.push(`HRV ${Math.round(withHrv.hrv)}ms (${withHrv.date})`);
    // Weight rides this block too: it is already in the days just loaded, and
    // on a RESUMED spoken turn this line is the only context the model gets.
    // Without it, "what's my weight?" hedged ("I'd need you to check the
    // actual number") while the figure sat one field away — observed live.
    const withWeight = [...days].reverse().find((x) => x.weightKg != null);
    if (withWeight) bits.push(`weight ${withWeight.weightKg}kg (${withWeight.date})`);
  } catch { /* optional */ }
  try {
    const { getToday } = await import('./foodLog.js');
    const log = await getToday();
    const p = Math.round((log.entries || []).reduce((s, e) => s + (e.macros?.p || 0), 0));
    const kcal = Math.round((log.entries || []).reduce((s, e) => s + (e.macros?.kcal || 0), 0));
    bits.push(`logged today ${p}g protein, ${kcal} kcal across ${(log.entries || []).length} entries`);
  } catch { /* optional */ }
  try {
    const { listRecords } = await import('./inboxStore.js');
    const pending = (await listRecords()).filter((r) => r.status === 'pending').length;
    bits.push(`${pending} draft${pending === 1 ? '' : 's'} waiting in his Inbox`);
  } catch { /* optional */ }
  const live = bits.length ? `TODAY, FROM THE LIVE RECORD (${today}): ${bits.join('; ')}.` : null;
  // What code said with Nova's voice (briefs, reflex answers) — on BOTH
  // lanes, so the model never denies its own spoken lines. See spokenLog.js
  // for the failure that mandated this.
  try {
    const { recentSpokenBlock } = await import('./spokenLog.js');
    const spoken = await recentSpokenBlock();
    if (spoken) return live ? `${live}\n\n${spoken}` : spoken;
  } catch { /* optional */ }
  return live;
}

// The volatile refresh for a RESUMED turn. His Voice conversation persists
// for days (voiceSessionId lives in localStorage), so turn-1 context goes
// stale: a video handed to the Watcher on Tuesday is invisible to a session
// started Monday. The spoken lane already re-states the volatile block each
// turn; this is the same idea for the PWA ask — today's live numbers plus
// the platform ledger, both local-disk instant.
export async function resumedRefreshContext() {
  // together, on a short leash — and a section that fails is NAMED, not
  // dropped: a resumed turn answering "nothing" from an unread ledger is the
  // exact confident wrongness this refresh exists to prevent
  const { text } = await gatherContext([
    { label: 'today (local)', load: todayLocalContext },
    { label: 'the platform ledger (what he gave Nova)', load: async () => (await import('./platformActivity.js')).platformActivityContext() },
    { label: 'the inbox digest', load: async () => (await import('./platformActivity.js')).inboxDigestContext() },
  ], { parallel: true, ms: 3000 });
  return text;
}

// Turn-1 context costs ~2.4s to assemble (measured), almost all of it the
// calendar dispatch reaching iCloud — and it is awaited BEFORE the model
// sees the question, so he hears it as dead air. The mic-open prewarm now
// builds it while he is still speaking and parks it here; the ask that
// follows finds it ready. Short TTL because this block is a snapshot of
// "conversation start", and a stale one would be a lie about today.
const CONTEXT_TTL_MS = 90_000;
let contextCache = null; // { at, text }

export async function buildAskContext(vaultPath, sessionId, { fast = false } = {}) {
  if (sessionId) return '';
  if (contextCache && Date.now() - contextCache.at < CONTEXT_TTL_MS) return contextCache.text;

  // Order here is the order in the prompt — who he is, what he's said, what
  // today looks like, then the reflective surfaces.
  const sections = [
    { label: 'profile', load: () => profileContext(vaultPath) },
    { label: 'learned preferences', load: () => preferencesContext(vaultPath) },
    { label: 'standing rules', load: () => standingContext(vaultPath) },
    { label: 'skills', load: async () => (await import('./skills.js')).skillsContext(vaultPath) },
    { label: 'today (local)', load: todayLocalContext },
    {
      label: 'the brief',
      ms: fast ? FAST_DISPATCH_TIMEOUT_MS : SECTION_TIMEOUT_MS,
      load: async () => {
        const [morning, evening] = await Promise.all([
          composeDispatch(vaultPath, 'morning'),
          composeDispatch(vaultPath, 'evening'),
        ]);
        return `${morning.text}\n\n${evening.text}`;
      },
    },
    { label: 'open loops', load: async () => (await import('./openLoops.js')).openLoopsContext(vaultPath) },
    // the shared brain: what the rest of the fleet did lately, off the rails
    { label: 'fleet activity', load: async () => (await import('./fleetContext.js')).fleetContext() },
    // the front door's ledger: what HE gave the platform (videos, studies,
    // research) — "what was the last video I gave you?" answers from here
    { label: 'the platform ledger (what he gave Nova)', load: async () => (await import('./platformActivity.js')).platformActivityContext() },
    // the drafts themselves — so "open that Fuel draft and read it" works
    { label: 'the inbox digest', load: async () => (await import('./platformActivity.js')).inboxDigestContext() },
    // self-knowledge: "how do you work?" gets the real architecture
    { label: 'the fleet roster', load: async () => (await import('./ops.js')).fleetRosterContext() },
    { label: 'reminders', load: async () => (await import('./reminders.js')).remindersContext() },
    // the reflective surfaces are for DISCUSSING out loud, not just reading —
    // hand the latest ones to the conversation so "let's talk about the
    // debrief" needs no re-summarising
    { label: 'the weekly debrief', load: async () => (await import('./weeklyDebrief.js')).latestDebriefContext() },
    { label: 'the daily review', load: async () => {
      const { getDailyReviewStatus } = await import('./dailyReview.js');
      const review = await getDailyReviewStatus();
      return review?.today?.text ? `TODAY'S DAILY REVIEW (engage with its specifics if he brings it up):\n${review.today.text}` : null;
    } },
    { label: 'money this month', load: async () => {
      const { getMonthSummary } = await import('./money.js');
      const m = await getMonthSummary();
      if (!m?.count) return null;
      const top = (m.byCategory || []).sort((a, b) => b.spent - a.spent).slice(0, 3).map((c) => `${c.category} $${Math.round(c.spent)}`);
      return `Money this month: ${Math.round(m.spent)} spent (last month ${Math.round(m.prevSpent)}); top: ${top.join(', ')}.`;
    } },
    { label: "the Leader's idea of the day", load: async () => {
      // the Leader's idea of the day — Nova mentions it in the morning brief
      // conversation and can discuss it; the deeper sit-down lives in the
      // Leader's own chat, and Nova should point there for real depth
      const { readLeaderState, todayLead } = await import('./leader.js');
      const t = todayLead(await readLeaderState());
      return t ? `TODAY'S LEADERSHIP IDEA (from the Leader agent — mention it in a morning brief, engage if he raises it, and point him at the Leader chat for the deeper conversation): "${t.title}" — ${t.line}${t.why ? ` (${t.why})` : ''}` : null;
    } },
    // THE CEO READS THE ROOM. Coach and the Leader are Nova's own agents,
    // and he expects talking to Nova to BE talking to the whole org — "what
    // did Coach say", "pass this to the Leader". Their real recent
    // exchanges (read from the CLI's own transcripts, never a second store)
    // land here so Nova answers from what was actually said.
    { label: "Coach's recent conversation", load: async () => (await import('./agentSessions.js')).agentConversationContext('coach', 'Coach') },
    { label: "the Leader's recent conversation", load: async () => (await import('./agentSessions.js')).agentConversationContext('leader', 'the Leader') },
  ];

  // together, on a deadline; a section that throws or times out is NAMED in
  // the NOTE rather than dropped as if it were empty
  const { text, failed } = await gatherContext(sections, { parallel: true, ms: SECTION_TIMEOUT_MS });
  // never cache a failed assembly — an empty block would be served as though
  // it were his context for the next 90 seconds, and a transient timeout
  // would stay named for that long instead of being retried
  if (text && !failed.length) contextCache = { at: Date.now(), text };
  return text;
}
