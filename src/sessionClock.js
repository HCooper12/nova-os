// THE SESSION CLOCK, PAUSABLE (his ask, 14 Oct 2026: "allow me to pause
// workouts within the app"). Pure. A session carries `pausedAt` (epoch ms
// while paused, else absent) and `pausedMs` (time already spent paused);
// every reader of "how long has he been training" goes through elapsed(), so
// a paused minute never counts on the header, the island, or the lock screen.

export function isPaused(ws) {
  return Number.isFinite(ws?.pausedAt);
}

// training time so far, in ms; null for a session with no start
export function sessionElapsedMs(ws, now) {
  if (!ws || !Number.isFinite(ws.startedAt)) return null;
  const banked = Number.isFinite(ws.pausedMs) ? ws.pausedMs : 0;
  const open = isPaused(ws) ? Math.max(0, now - ws.pausedAt) : 0;
  return Math.max(0, now - ws.startedAt - banked - open);
}

// whole minutes, for the header and the island's line
export function sessionMinutes(ws, now) {
  const ms = sessionElapsedMs(ws, now);
  return ms == null ? null : Math.floor(ms / 60000);
}

// where a running clock would have started had he never paused: what iOS's
// own timer counts from on the lock screen
export function effectiveStart(ws) {
  if (!ws || !Number.isFinite(ws.startedAt)) return null;
  return ws.startedAt + (Number.isFinite(ws.pausedMs) ? ws.pausedMs : 0);
}

export function pauseSession(ws, now) {
  if (!ws || isPaused(ws)) return ws;
  return { ...ws, pausedAt: now };
}

export function resumeSession(ws, now) {
  if (!ws || !isPaused(ws)) return ws;
  const { pausedAt, ...rest } = ws;
  return { ...rest, pausedMs: (Number.isFinite(ws.pausedMs) ? ws.pausedMs : 0) + Math.max(0, now - pausedAt) };
}

// HE SETS THE CLOCK (4 Nov 2026). His phone died mid make-up and the clock
// kept counting the time it was off: 70 min on a 20 min session. Setting the
// minutes banks the difference as paused time, so every reader (header,
// island, lock screen) agrees, and a paused clock stays paused. Never more
// than the time since the start, never below zero.
export function setSessionMinutes(ws, now, minutes) {
  if (!ws || !Number.isFinite(ws.startedAt) || !Number.isFinite(minutes) || minutes < 0) return ws;
  const sinceStart = Math.max(0, (isPaused(ws) ? ws.pausedAt : now) - ws.startedAt);
  const target = Math.min(Math.round(minutes) * 60000, sinceStart);
  return { ...ws, pausedMs: sinceStart - target };
}
