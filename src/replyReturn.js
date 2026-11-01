// AN ANSWER THAT LANDED WHILE HE WAS AWAY (1 Nov 2026). His report: he asks,
// leaves the app, comes back, and the reply is not in the chat; it shows much
// later or never. iOS freezes a backgrounded page's timers and its audio, and
// on the spoken path a reply's words were put on screen only as their audio
// played, so a reply found finished on his return waited behind speech that
// never started. The rule now: a reply found finished is SHOWN at once; it is
// SPOKEN only when the app is in front of him and the reply landed within the
// last minute. Otherwise one tap plays it (the "Tap to hear" strip).
//
// When did it land? Code knows only the last time a poll saw the job still
// running. The reply landed after that, so if that look was within the
// window, the reply is fresh; a frozen poll (he was away) makes it stale.
// Pure: App.jsx (attachAskPoll and the boot re-attach) reads these.

export const REPLY_FRESH_MS = 60_000;

// 'speak' | 'show'
export function replyOnReturn({ now, lastRunningAt, visible, freshMs = REPLY_FRESH_MS }) {
  if (!visible) return 'show';
  const seen = Number(lastRunningAt);
  if (!Number.isFinite(seen) || seen <= 0) return 'show';
  return now - seen <= freshMs ? 'speak' : 'show';
}

// A job id kept on the phone across a relaunch is picked up again while the
// Mac can still hand it over: settled answers are written to disk there
// (server/lib/claudeCode.js), so a day is safe. Older, or unreadable: dropped.
export const PENDING_KEEP_MS = 24 * 3600_000;
export function pendingWorthResuming(pending, now, keepMs = PENDING_KEEP_MS) {
  if (!pending || typeof pending.jobId !== 'string' || !pending.jobId) return false;
  const at = Number(pending.askedAt ?? pending.startedAt);
  return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < keepMs;
}

// What one tap should play of a stale reply: what the voice had not reached.
export function unheardRest(text, spokenUpTo = 0) {
  const t = String(text || '');
  const n = Math.max(0, Math.min(t.length, Number(spokenUpTo) || 0));
  return t.slice(n).trim();
}
