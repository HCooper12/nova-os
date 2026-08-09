import { composeDispatch } from './dispatch.js';
import { profileContext } from './profile.js';
import { preferencesContext } from './learning.js';
import { standingContext } from './standing.js';

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
// times out is simply absent, which the prompts already handle honestly.
const SECTION_TIMEOUT_MS = 25_000;
// A SPOKEN ask (Siri, Telegram) is a conversation, not a report: it must
// come back in seconds. The only slow section is the brief, because it
// reaches iCloud over CalDAV; in fast mode it gets a short leash, so a warm
// calendar cache is included and a cold one is simply skipped rather than
// making him stand there. The cheap today-block below always goes, so a
// fast answer still knows his real numbers.
const FAST_DISPATCH_TIMEOUT_MS = 6500;

function withDeadline(promise, ms = SECTION_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}

// Today from local files only — no network, always instant. This is what
// keeps a fast spoken answer honest about steps, fuel and what's waiting.
async function todayLocalContext() {
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
  return bits.length ? `TODAY, FROM THE LIVE RECORD (${today}): ${bits.join('; ')}.` : null;
}

export async function buildAskContext(vaultPath, sessionId, { fast = false } = {}) {
  if (sessionId) return '';

  // Order here is the order in the prompt — who he is, what he's said, what
  // today looks like, then the reflective surfaces.
  const sections = [
    () => profileContext(vaultPath),
    () => preferencesContext(vaultPath),
    () => standingContext(vaultPath),
    async () => (await import('./skills.js')).skillsContext(vaultPath),
    todayLocalContext,
    {
      ms: fast ? FAST_DISPATCH_TIMEOUT_MS : SECTION_TIMEOUT_MS,
      run: async () => {
        const [morning, evening] = await Promise.all([
          composeDispatch(vaultPath, 'morning'),
          composeDispatch(vaultPath, 'evening'),
        ]);
        return `${morning.text}\n\n${evening.text}`;
      },
    },
    async () => (await import('./openLoops.js')).openLoopsContext(vaultPath),
    // the shared brain: what the rest of the fleet did lately, off the rails
    async () => (await import('./fleetContext.js')).fleetContext(),
    async () => (await import('./reminders.js')).remindersContext(),
    // the reflective surfaces are for DISCUSSING out loud, not just reading —
    // hand the latest ones to the conversation so "let's talk about the
    // debrief" needs no re-summarising
    async () => (await import('./weeklyDebrief.js')).latestDebriefContext(),
    async () => {
      const { getDailyReviewStatus } = await import('./dailyReview.js');
      const review = await getDailyReviewStatus();
      return review?.today?.text ? `TODAY'S DAILY REVIEW (engage with its specifics if he brings it up):\n${review.today.text}` : null;
    },
    async () => {
      const { getMonthSummary } = await import('./money.js');
      const m = await getMonthSummary();
      if (!m?.count) return null;
      const top = (m.byCategory || []).sort((a, b) => b.spent - a.spent).slice(0, 3).map((c) => `${c.category} $${Math.round(c.spent)}`);
      return `Money this month: $${Math.round(m.spent)} spent (last month $${Math.round(m.prevSpent)}); top: ${top.join(', ')}.`;
    },
  ];

  const results = await Promise.all(sections.map((section) => {
    const run = typeof section === 'function' ? section : section.run;
    const ms = typeof section === 'function' ? SECTION_TIMEOUT_MS : section.ms;
    let started;
    try { started = run(); } catch { return null; } // a synchronous throw is just an absent section
    return withDeadline(Promise.resolve(started), ms);
  }));

  return results.filter((s) => typeof s === 'string' && s.trim()).join('\n\n');
}
