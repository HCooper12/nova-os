// THE LEAD, BEFORE WORK — the Telegram half of his 18 Sep instruction.
//
// "A reminder summary of the leader focus for today would also be good via
// telegram."
//
// IT FIRES ON THE SAME EDGE THE HOME PANEL RISES ON, not at a clock time. He
// gave the reason himself — the hour before a work block "is when that will be
// most relevant especially" — so a fixed 9am send would land while the lead is
// still hours from being usable, and on a day he starts at 22:00 it would be
// stale by the time he could act. src/workBlock.js owns the definition and
// both readers import it, so the message and the panel can never disagree
// about the same moment.
//
// IT SAYS NOTHING RATHER THAN SOMETHING EMPTY. No lead for today, no work
// block, no Telegram configured — no message. Nova produced ~154 records in a
// month and he filed 9; a daily ping that sometimes carries nothing is exactly
// how the next one stops being read.

import { readLeaderState, todayLead, situationOf } from './leader.js';
import { sendTelegramText, telegramConfigured } from './telegram.js';
import { nextWorkBlock, LEAD_WINDOW_MIN, untilWords } from '../../src/workBlock.js';

// Once per day, and not again if he reloads, redeploys or the server restarts.
// Keyed by the LOCAL date, because "today's lead" is a local-day idea even
// though every stamp Nova writes is UTC.
let lastSentDay = null;

export function _resetLeaderReminder() { lastSentDay = null; }

export function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The message. Kept to what he can act on in the hour before he starts: the
// lead itself, the one line that says what to do, and the situation question
// when there is one still unanswered — that last is the thing the Home card
// has been asking for and not getting.
export function buildReminder(lead, work, situation) {
  if (!lead?.title) return null;
  const lines = [];
  lines.push(`🧭 *Before work* — ${work?.label || 'Work'} ${untilWords(work?.startsIn)}`);
  lines.push('');
  lines.push(`*${lead.title}*`);
  if (lead.line) lines.push(lead.line);
  if (lead.why) lines.push(`_${lead.why}_`);
  if (situation?.question) {
    lines.push('');
    lines.push(`Still open: ${situation.question}`);
  }
  return lines.join('\n');
}

// Should it go out right now? Pure, so the window logic is testable without a
// clock, a calendar server or a Telegram token.
export function dueNow(events, now, { sentDay = lastSentDay } = {}) {
  const day = localDayKey(now);
  if (sentDay === day) return null;                 // already sent today
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const work = nextWorkBlock(events, nowMin);
  if (!work || work.startsIn > LEAD_WINDOW_MIN) return null;
  return work;
}

// THE SAME TWO FACTS THE HOME CARD SHOWS, derived the same way. readLeaderState
// returns the raw store — `today` and `situation` are COMPUTED by todayLead()
// and situationOf(), which is what GET /api/leader does. Reading the store
// directly (as the first cut of this file did) finds no lead on any day and
// the reminder silently never sends: the exact failure mode that kept haptics
// broken for a year, caught here by running it against his real state.
async function leaderFacts() {
  const state = await readLeaderState();
  return { today: todayLead(state), situation: situationOf(state) };
}

export async function runLeaderReminder(now = new Date(), deps = {}) {
  const {
    loadEvents = defaultLoadEvents,
    state = leaderFacts,
    send = sendTelegramText,
    configured = telegramConfigured,
  } = deps;
  if (!configured()) return { sent: false, why: 'telegram not configured' };

  const events = await loadEvents(now);
  const work = dueNow(events, now);
  if (!work) return { sent: false, why: 'not in the window, or already sent today' };

  const L = await state();
  const text = buildReminder(L?.today, work, L?.situation);
  // A window with nothing in it is not a message. Marked as sent anyway, so a
  // leadless day does not retry every minute for the whole hour.
  lastSentDay = localDayKey(now);
  if (!text) return { sent: false, why: 'no lead for today' };

  await send(text);
  return { sent: true, work, text };
}

// Today's events, from exactly what /api/calendar/today serves — same source,
// same hidden-calendar filtering, so the reminder cannot see a different day
// from the one on his Home screen. Imported lazily so this module is testable
// without the CalDAV stack behind it.
async function defaultLoadEvents(now) {
  const { fetchEventsForDay } = await import('./calendar.js');
  return fetchEventsForDay(now);
}

export function startLeaderReminderScheduler() {
  const tick = async () => {
    try {
      const { beat } = await import('./heartbeat.js');
      beat('leader-reminder');
    } catch { /* heartbeat is a receipt, never a gate */ }
    try {
      await runLeaderReminder();
    } catch (e) {
      console.error('leader reminder failed:', e.message);
    }
  };
  tick();
  // A minute, because the window opens on a minute boundary and a coarser tick
  // could miss a short gap between one block ending and work starting.
  setInterval(tick, 60 * 1000);
}
